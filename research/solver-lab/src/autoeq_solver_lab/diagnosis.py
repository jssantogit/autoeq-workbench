from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

import numpy as np
from scipy.optimize import differential_evolution

from .dsp import cascade_response_db
from .io import parse_filter
from .metrics import error_metrics
from .objectives import (
    ContinuousVectorLayout,
    candidate_from_vector,
    decode_vector,
)
from .optimizers.base import EvaluationBudgetExhausted, ObjectiveTracker, midpoint_vector
from .types import SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


_TYPE_ORDER = {"LS": 0, "PK": 1, "HS": 2}
_DEFAULT_SCALES = (0.25, 0.75)


def layout_for_candidate(candidate: SolverLabCandidate) -> ContinuousVectorLayout:
    ordered = sorted(
        candidate.filters,
        key=lambda filter_: (_TYPE_ORDER[filter_.type], filter_.frequencyHz),
    )
    return ContinuousVectorLayout(
        filter_count=len(ordered),
        filter_types=tuple(filter_.type for filter_ in ordered),
    )


def _finite_number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _positive_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _optional_metric_for_sort(value: object, label: str) -> float:
    return float("inf") if value is None else _finite_number(value, label)


def load_warm_start_candidates(
    artifact: object,
    problems: Sequence[SolverLabProblem],
    *,
    budget_seconds: int,
    max_filters: int,
    source_label: str,
) -> tuple[SolverLabCandidate, ...]:
    if not isinstance(artifact, Sequence) or isinstance(artifact, (str, bytes)):
        raise ValueError("warm-start artifact must be an array")
    _positive_int(budget_seconds, "budget_seconds")
    _positive_int(max_filters, "max_filters")
    if not source_label:
        raise ValueError("source_label must be non-empty")

    problem_by_id = {problem.problemId: problem for problem in problems}
    selected_by_problem: dict[str, tuple[tuple[float, float, int], SolverLabCandidate]] = {}
    for index, raw_row in enumerate(artifact):
        if not isinstance(raw_row, Mapping):
            raise ValueError(f"warm-start row {index} must be an object")
        if raw_row.get("geometryWarmStart") is not True:
            continue
        if raw_row.get("budgetSeconds") != budget_seconds or raw_row.get("maxFilters") != max_filters:
            continue
        case_id = raw_row.get("caseId")
        if not isinstance(case_id, str) or case_id not in problem_by_id:
            continue
        problem = problem_by_id[case_id]
        filters_value = raw_row.get("filters")
        if not isinstance(filters_value, Sequence) or isinstance(filters_value, (str, bytes)):
            raise ValueError(f"warm-start row {index} filters must be an array")
        filters = tuple(
            parse_filter(value, f"warm-start row {index} filters[{filter_index}]")
            for filter_index, value in enumerate(filters_value)
        )
        if len(filters) > max_filters:
            raise ValueError("warm-start candidate exceeds max_filters")
        final = raw_row.get("final")
        if not isinstance(final, Mapping):
            raise ValueError(f"warm-start row {index} final must be an object")
        delivered_count = final.get("deliveredFilterCount")
        if delivered_count != len(filters):
            raise ValueError("warm-start deliveredFilterCount does not match filters")

        candidate = SolverLabCandidate(
            protocolVersion=1,
            problemId=problem.problemId,
            inputSha256=problem.inputSha256,
            candidateId=(
                f"known-good-warm-start:{source_label}:{problem.problemId}:{budget_seconds}"
            ),
            algorithmId="known-good-warm-start",
            seed=None,
            filters=filters,
        )
        rmse = _optional_metric_for_sort(final.get("rmseDb"), "warm-start final.rmseDb")
        max_abs = _optional_metric_for_sort(final.get("maxAbsDb"), "warm-start final.maxAbsDb")
        repeat_index = raw_row.get("repeatIndex", 0)
        if isinstance(repeat_index, bool) or not isinstance(repeat_index, int):
            raise ValueError("warm-start repeatIndex must be an integer")
        key = (rmse, max_abs, repeat_index)
        existing = selected_by_problem.get(problem.problemId)
        if existing is None or key < existing[0]:
            selected_by_problem[problem.problemId] = (key, candidate)

    return tuple(
        selected_by_problem[problem.problemId][1]
        for problem in problems
        if problem.problemId in selected_by_problem
    )


def load_v1_reference_metrics(artifact: object) -> dict[str, dict[str, float | int]]:
    if not isinstance(artifact, Mapping) or artifact.get("schemaVersion") != 1:
        raise ValueError("v1 reference artifact must have schemaVersion 1")
    rows = artifact.get("rows")
    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)):
        raise ValueError("v1 reference rows must be an array")
    result: dict[str, dict[str, float | int]] = {}
    for index, raw_row in enumerate(rows):
        if not isinstance(raw_row, Mapping):
            raise ValueError(f"v1 reference row {index} must be an object")
        case_id = raw_row.get("caseId")
        if not isinstance(case_id, str) or not case_id:
            raise ValueError(f"v1 reference row {index} caseId must be non-empty")
        metrics = raw_row.get("metrics")
        if not isinstance(metrics, Mapping):
            raise ValueError(f"v1 reference row {index} metrics must be an object")
        filter_count = _positive_int(raw_row.get("filterCount"), f"v1 reference row {index} filterCount")
        result[case_id] = {
            "rmseDb": _finite_number(metrics.get("rmseDb"), f"v1 reference row {index} rmseDb"),
            "maxAbsDb": _finite_number(metrics.get("maxAbsDb"), f"v1 reference row {index} maxAbsDb"),
            "filterCount": filter_count,
        }
    return result


def _normalized_components(
    rmse_db: float,
    max_abs_db: float,
    scales: tuple[float, float],
) -> tuple[float, float]:
    rmse = _finite_number(rmse_db, "rmse_db")
    max_abs = _finite_number(max_abs_db, "max_abs_db")
    rmse_scale = _finite_number(scales[0], "rmse_scale")
    max_abs_scale = _finite_number(scales[1], "max_abs_scale")
    if rmse_scale <= 0 or max_abs_scale <= 0:
        raise ValueError("objective scales must be positive")
    return rmse / rmse_scale, max_abs / max_abs_scale


def augmented_tchebycheff_score(
    rmse_db: float,
    max_abs_db: float,
    weights: tuple[float, float],
    *,
    scales: tuple[float, float] = _DEFAULT_SCALES,
    rho: float = 0.05,
) -> float:
    if len(weights) != 2:
        raise ValueError("weights must contain RMSE and maxAbs weights")
    rmse_weight = _finite_number(weights[0], "rmse_weight")
    max_abs_weight = _finite_number(weights[1], "max_abs_weight")
    if rmse_weight <= 0 or max_abs_weight <= 0:
        raise ValueError("Tchebycheff weights must be positive")
    rho_value = _finite_number(rho, "rho")
    if rho_value < 0:
        raise ValueError("rho must be non-negative")
    rmse_norm, max_abs_norm = _normalized_components(rmse_db, max_abs_db, scales)
    weighted_rmse = rmse_weight * rmse_norm
    weighted_max_abs = max_abs_weight * max_abs_norm
    return max(weighted_rmse, weighted_max_abs) + rho_value * (
        weighted_rmse + weighted_max_abs
    )


def epsilon_constraint_score(
    rmse_db: float,
    max_abs_db: float,
    *,
    epsilon_max_abs_db: float,
    scales: tuple[float, float] = _DEFAULT_SCALES,
    penalty: float = 100.0,
) -> float:
    rmse_norm, _ = _normalized_components(rmse_db, max_abs_db, scales)
    epsilon = _finite_number(epsilon_max_abs_db, "epsilon_max_abs_db")
    if epsilon < 0:
        raise ValueError("epsilon_max_abs_db must be non-negative")
    penalty_value = _finite_number(penalty, "penalty")
    if penalty_value <= 0:
        raise ValueError("penalty must be positive")
    violation = max(0.0, max_abs_db - epsilon) / scales[1]
    return rmse_norm + penalty_value * violation * violation


def _deliverable_dominates(
    first: SolverLabEvaluation,
    second: SolverLabEvaluation,
    eps: float = 1e-12,
) -> bool:
    if first.deliverable is None or second.deliverable is None:
        return False
    first_rmse = first.deliverable.rmseDb
    first_max = first.deliverable.maxAbsDb
    second_rmse = second.deliverable.rmseDb
    second_max = second.deliverable.maxAbsDb
    no_worse = first_rmse <= second_rmse + eps and first_max <= second_max + eps
    strict = first_rmse < second_rmse - eps or first_max < second_max - eps
    return no_worse and strict


def select_deliverable_frontier(
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
) -> tuple[SolverLabCandidate, ...]:
    evaluation_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    eligible: list[tuple[SolverLabCandidate, SolverLabEvaluation]] = []
    for candidate in candidates:
        evaluation = evaluation_by_id.get(candidate.candidateId)
        if (
            evaluation is None or
            not evaluation.valid or
            evaluation.deliverable is None or
            not math.isfinite(evaluation.deliverable.rmseDb) or
            not math.isfinite(evaluation.deliverable.maxAbsDb)
        ):
            continue
        eligible.append((candidate, evaluation))
    return tuple(
        candidate
        for candidate, evaluation in eligible
        if not any(
            other_candidate.candidateId != candidate.candidateId and
            _deliverable_dominates(other_evaluation, evaluation)
            for other_candidate, other_evaluation in eligible
        )
    )


def alternative_de_search(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    *,
    seed: int,
    evaluation_budget: int,
    objective_family: str,
    objective_parameter: tuple[float, float] | float,
    run_index: int = 0,
) -> SolverLabCandidate:
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise ValueError("seed must be an integer")
    _positive_int(evaluation_budget, "evaluation_budget")
    if layout.filter_count > problem.bounds["maxFilters"]:
        raise ValueError("layout exceeds problem maxFilters")
    if objective_family == "tchebycheff":
        if not isinstance(objective_parameter, tuple) or len(objective_parameter) != 2:
            raise ValueError("tchebycheff objective requires two weights")
        weights = (
            _finite_number(objective_parameter[0], "tchebycheff rmse weight"),
            _finite_number(objective_parameter[1], "tchebycheff maxAbs weight"),
        )
        if weights[0] <= 0 or weights[1] <= 0:
            raise ValueError("tchebycheff weights must be positive")

        def score(rmse: float, max_abs: float) -> float:
            return augmented_tchebycheff_score(rmse, max_abs, weights)

    elif objective_family == "epsilon":
        epsilon = _finite_number(objective_parameter, "epsilon objective parameter")
        if epsilon < 0:
            raise ValueError("epsilon objective parameter must be non-negative")

        def score(rmse: float, max_abs: float) -> float:
            return epsilon_constraint_score(rmse, max_abs, epsilon_max_abs_db=epsilon)

    else:
        raise ValueError("objective_family must be tchebycheff or epsilon")

    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(problem.desiredDb, dtype=np.float64)

    def objective(vector: np.ndarray) -> float:
        filters = decode_vector(problem, layout, np.asarray(vector, dtype=np.float64))
        actual = cascade_response_db(frequencies, problem.sampleRateHz, filters)
        rmse, max_abs = error_metrics(desired, actual)
        return score(rmse, max_abs)

    tracker = ObjectiveTracker(objective, evaluation_budget)
    dimension = layout.filter_count * 3
    population_size = max(1, min(8, evaluation_budget // max(1, dimension)))
    max_iterations = max(1, evaluation_budget // (population_size * dimension) + 1)
    try:
        differential_evolution(
            tracker.evaluate,
            [(0.0, 1.0)] * dimension,
            seed=seed,
            workers=1,
            updating="immediate",
            polish=False,
            popsize=population_size,
            maxiter=max_iterations,
            tol=0.0,
            atol=0.0,
        )
    except EvaluationBudgetExhausted:
        pass
    vector = tracker.best_vector if tracker.best_vector is not None else midpoint_vector(layout)
    return candidate_from_vector(
        problem,
        layout,
        vector,
        f"diagnosis-de-{objective_family}",
        seed,
        run_index,
    )
