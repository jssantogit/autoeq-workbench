"""Selective, research-only Oracle Diagnosis v2 orchestration."""

import argparse
import json
import math
import platform
import shutil
import subprocess
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal

from .canonical import CanonicalEvaluator
from .diagnostics import (
    DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION,
    DIAGNOSTIC_FRONTIER_CRITERION_VERSION,
    DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE,
    DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
    DiagnosticObjective,
    classify_causal_mechanisms,
    classify_practical_convergence,
    compare_frontier_snapshots,
    diagnostic_objective_callable,
    infer_layout_from_filters,
    reference_candidates_from_artifact,
    summarize_optimizer_family_agreement,
)
from .io import (
    load_control_candidates,
    parse_candidate,
    parse_evaluation,
    parse_filter,
    read_problems,
    serialize_candidate,
    serialize_evaluation,
)
from .objectives import ContinuousVectorLayout, enumerate_oracle_layouts
from .optimizers.base import ContinuousOptimizer
from .optimizers.cma_es import CmaEsOptimizer
from .optimizers.differential_evolution import DifferentialEvolutionOptimizer
from .optimizers.powell import PowellOptimizer
from .pareto import dominates, nondominated, normalized_regret
from .types import (
    ObjectivePoint,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)

ORACLE_DIAGNOSIS_REPORT = "OracleDiagnosisReportV1"
ORACLE_DIAGNOSIS_CONFIG_VERSION = "oracle-diagnosis-v2-selective-v1"
LOCAL_OBJECTIVE_WEIGHTS: tuple[tuple[float, float], ...] = (
    (0.75, 0.25),
    (0.50, 0.50),
    (0.25, 0.75),
)

DIAGNOSIS_CASE_IDS: tuple[str, ...] = (
    "synthetic-narrow-peak",
    "titan-to-storm",
    "titan-to-u12t",
    "titan-to-trio",
)
STAGE_PROVENANCE: dict[str, dict[str, str]] = {
    "screen": {
        "runId": "34110098435",
        "artifactId": "10014165079",
        "aggregateArtifactName": "autoeq-oracle-34110098435-adversarial-max10-aggregate",
    },
    "confirm": {
        "runId": "34110901484",
        "artifactId": "10014731506",
        "aggregateArtifactName": "autoeq-oracle-34110901484-adversarial-max10-aggregate",
    },
    "deep": {
        "runId": "34112286380",
        "artifactId": "10016580986",
        "aggregateArtifactName": "autoeq-oracle-34112286380-adversarial-max10-aggregate",
    },
}
HISTORICAL_SOURCE_PROVENANCE: dict[str, dict[str, str]] = {
    "coherent": {
        "provenance": "reference:coherent-warm-start",
        "sourceSha": "d49fd8c7f23ab9f8e5cf076a91d1baa4e3d6c694",
        "sourceRunId": "33987922969",
        "sourceArtifactId": "9975764396",
    },
    "general": {
        "provenance": "reference:general-warm-start",
        "sourceSha": "d659e1d69f06686bbbedf4ab1bf2530002a93273",
        "sourceRunId": "33987602951",
        "sourceArtifactId": "9975672557",
    },
    "v1": {
        "provenance": "reference:standard-v1",
        "sourceSha": "ab82b9e2c58d4095419dcb9226aea3f1d4cef3c8",
        "sourceRunId": "33960904540",
        "sourceArtifactId": "9967947984",
    },
}


@dataclass(frozen=True)
class OracleDiagnosisConfig:
    repository_sha: str
    frozen_control_sha: str
    local_seeds: tuple[int, ...] = (11, 29, 47, 83)
    alternative_seeds: tuple[int, ...] = (11, 29)
    confirmation_seeds: tuple[int, ...] = (11, 29, 47, 83)
    local_evaluation_budget: int = 300
    alternative_evaluation_budget: int = 240
    confirmation_evaluation_budget: int = 500
    capacity_caps: tuple[int, ...] = (10, 20, 40)
    objective_spec_version: str = "diagnostic-objectives-v1"

    def __post_init__(self) -> None:
        _non_empty_string(self.repository_sha, "diagnosis repository SHA")
        _non_empty_string(self.frozen_control_sha, "diagnosis frozen control SHA")
        for label, seeds in (
            ("local", self.local_seeds),
            ("alternative", self.alternative_seeds),
            ("confirmation", self.confirmation_seeds),
        ):
            if not seeds or any(isinstance(seed, bool) or not isinstance(seed, int) for seed in seeds):
                raise ValueError(f"{label} diagnosis seeds must be integers")
            if len(set(seeds)) != len(seeds):
                raise ValueError(f"{label} diagnosis seeds must be unique")
        for label, budget in (
            ("local", self.local_evaluation_budget),
            ("alternative", self.alternative_evaluation_budget),
            ("confirmation", self.confirmation_evaluation_budget),
        ):
            if isinstance(budget, bool) or not isinstance(budget, int) or budget <= 0:
                raise ValueError(f"{label} diagnosis budget must be positive")
        if tuple(sorted(self.capacity_caps)) != (10, 20, 40):
            raise ValueError("capacity diagnosis caps must be exactly 10, 20, and 40")


def _serialized_candidate(candidate: SolverLabCandidate) -> dict[str, Any]:
    return json.loads(serialize_candidate(candidate))


def _serialized_evaluation(evaluation: SolverLabEvaluation) -> dict[str, Any]:
    return json.loads(serialize_evaluation(evaluation))


def _non_empty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _frontier_from_artifact(
    artifact: Mapping[str, Any],
    *,
    case_id: str,
    metric: Literal["continuous", "deliverable"],
    frontier_type: str = "maxFilters",
    max_filters: int = 10,
) -> tuple[dict[str, Any], ...]:
    raw_frontiers = artifact.get("frontiers")
    if not isinstance(raw_frontiers, Sequence) or isinstance(raw_frontiers, (str, bytes)):
        raise ValueError("oracle artifact frontiers are required")
    matching = [
        frontier for frontier in raw_frontiers
        if isinstance(frontier, Mapping) and
        frontier.get("problemId") == case_id and
        frontier.get("frontierType") == frontier_type and
        frontier.get("maxFilters") == max_filters
    ]
    if len(matching) != 1:
        raise ValueError(f"oracle artifact must contain one {frontier_type} frontier for {case_id}")
    raw_points = matching[0].get("points")
    if not isinstance(raw_points, Sequence) or isinstance(raw_points, (str, bytes)):
        raise ValueError("oracle frontier points are required")
    records: list[dict[str, Any]] = []
    for index, raw_point in enumerate(raw_points):
        if not isinstance(raw_point, Mapping):
            raise ValueError(f"oracle frontier point {index} must be an object")
        candidate_raw = raw_point.get("candidate")
        evaluation_raw = raw_point.get("evaluation")
        if not isinstance(candidate_raw, Mapping) or not isinstance(evaluation_raw, Mapping):
            raise ValueError("oracle frontier point must contain candidate and evaluation")
        candidate = parse_candidate(candidate_raw)
        evaluation = parse_evaluation(evaluation_raw)
        if candidate.problemId != case_id or evaluation.candidateId != candidate.candidateId or not evaluation.valid:
            raise ValueError("oracle frontier point candidate/evaluation does not match case")
        metrics = evaluation.continuous if metric == "continuous" else evaluation.deliverable
        if metrics is None:
            raise ValueError("oracle frontier point is missing requested metrics")
        actual_filter_count = len(candidate.filters)
        actual_delivered_filter_count = len(evaluation.deliverableFilters)
        if raw_point.get("actualFilterCount") != actual_filter_count:
            raise ValueError("oracle frontier actualFilterCount does not match candidate")
        if raw_point.get("actualDeliveredFilterCount") != actual_delivered_filter_count:
            raise ValueError("oracle frontier actualDeliveredFilterCount does not match evaluation")
        records.append({
            "candidateId": candidate.candidateId,
            "algorithmId": candidate.algorithmId,
            "seed": candidate.seed,
            "rmseDb": metrics.rmseDb,
            "maxAbsDb": metrics.maxAbsDb,
            "actualFilterCount": actual_filter_count,
            "actualDeliveredFilterCount": actual_delivered_filter_count,
            "candidate": _serialized_candidate(candidate),
            "evaluation": _serialized_evaluation(evaluation),
        })
    return tuple(records)


def load_existing_stage_frontier_points(
    artifacts: Mapping[str, Mapping[str, Any]],
    *,
    case_id: str,
    metric: Literal["continuous", "deliverable"] = "continuous",
    max_filters: int = 10,
) -> dict[str, tuple[dict[str, Any], ...]]:
    required = ("screen", "confirm", "deep")
    if any(stage not in artifacts for stage in required):
        raise ValueError("existing stage artifacts require screen, confirm, and deep")
    return {
        stage: _frontier_from_artifact(
            artifacts[stage], case_id=case_id, metric=metric, max_filters=max_filters
        )
        for stage in required
    }


def _historical_rows(value: Any) -> tuple[Mapping[str, Any], ...]:
    raw_rows = (
        value.get("results", value.get("rows"))
        if isinstance(value, Mapping)
        else value
    )
    if not isinstance(raw_rows, Sequence) or isinstance(raw_rows, (str, bytes)):
        raise ValueError("historical result artifact must contain an array of rows")
    rows: list[Mapping[str, Any]] = []
    for index, row in enumerate(raw_rows):
        if not isinstance(row, Mapping):
            raise ValueError(f"historical result row {index} must be an object")
        rows.append(row)
    return tuple(rows)


def _selection_matches(row: Mapping[str, Any], selection: Mapping[str, Any]) -> bool:
    return all(row.get(key) == value for key, value in selection.items())


def historical_reference_artifact_from_results(
    results: Any,
    *,
    provenance: str,
    source_sha: str,
    source_run_id: str,
    source_artifact_id: str,
    selections: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    provenance = _non_empty_string(provenance, "historical provenance")
    source_sha = _non_empty_string(source_sha, "historical source SHA")
    source_run_id = _non_empty_string(source_run_id, "historical source run ID")
    source_artifact_id = _non_empty_string(source_artifact_id, "historical source artifact ID")
    rows = _historical_rows(results)
    points: list[dict[str, Any]] = []
    for case_id in sorted(selections):
        selection = selections[case_id]
        if not isinstance(selection, Mapping):
            raise ValueError(f"historical selection for {case_id} must be an object")
        matching_rows = [row for row in rows if row.get("caseId") == case_id and _selection_matches(row, selection)]
        if not matching_rows:
            continue
        row = min(
            matching_rows,
            key=lambda candidate: (
                int(candidate.get("repeatIndex", 0)),
                int(candidate.get("budgetSeconds", 0)),
                bool(candidate.get("geometryWarmStart", False)),
            ),
        )
        raw_filters = row.get("filters")
        if not isinstance(raw_filters, Sequence) or isinstance(raw_filters, (str, bytes)) or not raw_filters:
            continue
        # Validate the complete vector before carrying it into the reference representation.
        filters = [
            {
                "id": parsed.id,
                "enabled": parsed.enabled,
                "type": parsed.type,
                "frequencyHz": parsed.frequencyHz,
                "gainDb": parsed.gainDb,
                "q": parsed.q,
            }
            for index, raw_filter in enumerate(raw_filters)
            for parsed in (parse_filter(raw_filter, f"historical.{case_id}.filters[{index}]"),)
        ]
        point: dict[str, Any] = {
            "problemId": case_id,
            "provenance": provenance,
            "sourceId": f"{source_run_id}:{source_artifact_id}:{case_id}",
            "sourceSha": source_sha,
            "sourceRunId": source_run_id,
            "sourceArtifactId": source_artifact_id,
            "filters": filters,
        }
        if isinstance(row.get("inputSha256"), str):
            point["inputSha256"] = row["inputSha256"]
        if isinstance(row.get("maxFilters"), int) and not isinstance(row.get("maxFilters"), bool):
            point["maxFilters"] = row["maxFilters"]
        points.append(point)
    return {
        "version": 1,
        "oracle": "reference-seeds",
        "sourceAlgorithm": provenance,
        "repositorySha": source_sha,
        "sourceRunId": source_run_id,
        "sourceArtifactId": source_artifact_id,
        "points": points,
    }


def recover_historical_reference(
    problem: SolverLabProblem,
    artifact: Mapping[str, Any],
    *,
    expected_source_sha: str,
    expected_run_id: str,
    expected_artifact_id: str,
) -> dict[str, Any]:
    candidates = reference_candidates_from_artifact(
        problem,
        artifact,
        expected_repository_sha=expected_source_sha,
        expected_run_id=expected_run_id,
        expected_artifact_id=expected_artifact_id,
    )
    provenance = _non_empty_string(artifact.get("sourceAlgorithm"), "reference sourceAlgorithm")
    if not candidates:
        return {
            "status": "unavailable",
            "reason": "exact-filter-vector-not-recoverable",
            "provenance": provenance,
            "sourceRunId": expected_run_id,
            "sourceArtifactId": expected_artifact_id,
            "sourceSha": expected_source_sha,
        }
    if len(candidates) != 1:
        raise ValueError(f"reference artifact must contain exactly one candidate for {problem.problemId}")
    return {
        "status": "recovered",
        "provenance": provenance,
        "sourceRunId": expected_run_id,
        "sourceArtifactId": expected_artifact_id,
        "sourceSha": expected_source_sha,
        "candidate": candidates[0],
    }


def canonically_evaluate_reference(
    reference: Mapping[str, Any],
    problem: SolverLabProblem,
    canonical_evaluator: CanonicalEvaluator,
) -> dict[str, Any]:
    if reference.get("status") != "recovered":
        return dict(reference)
    candidate = reference.get("candidate")
    if not isinstance(candidate, SolverLabCandidate):
        raise ValueError("recovered reference must contain a SolverLabCandidate")
    evaluations = canonical_evaluator.evaluate(problem, (candidate,))
    if len(evaluations) != 1 or evaluations[0].candidateId != candidate.candidateId:
        raise ValueError("canonical reference evaluation did not return the candidate")
    return {**reference, "evaluation": evaluations[0]}


def _default_optimizer_factory(algorithm_id: str, run_index: int) -> ContinuousOptimizer:
    if algorithm_id == "differential-evolution":
        return DifferentialEvolutionOptimizer(run_index)
    if algorithm_id == "cma-es":
        return CmaEsOptimizer(run_index)
    if algorithm_id == "powell":
        return PowellOptimizer(run_index)
    raise ValueError(f"unknown diagnosis optimizer {algorithm_id}")


def _metric_point(
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
    *,
    deliverable: bool = True,
) -> ObjectivePoint | None:
    metrics = evaluation.deliverable if deliverable else evaluation.continuous
    if not evaluation.valid or metrics is None:
        return None
    return ObjectivePoint(
        candidate_id=candidate.candidateId,
        rmse_db=metrics.rmseDb,
        max_abs_db=metrics.maxAbsDb,
        filter_count=len(evaluation.deliverableFilters) if deliverable else len(candidate.filters),
    )


def _objective_specs_for_evaluation(
    evaluation: SolverLabEvaluation,
    weights: Sequence[tuple[float, float]] = LOCAL_OBJECTIVE_WEIGHTS,
) -> tuple[DiagnosticObjective, ...]:
    if not evaluation.valid or evaluation.continuous is None:
        raise ValueError("diagnostic objectives require a valid control evaluation")
    rmse_scale = max(evaluation.continuous.rmseDb, 1e-9)
    max_abs_scale = max(evaluation.continuous.maxAbsDb, 1e-9)
    return tuple(
        DiagnosticObjective(
            kind="weighted-sum",
            rmse_weight=rmse_weight,
            max_abs_weight=max_abs_weight,
            rmse_scale=rmse_scale,
            max_abs_scale=max_abs_scale,
        )
        for rmse_weight, max_abs_weight in weights
    )


def _objective_record(spec: DiagnosticObjective) -> dict[str, Any]:
    return {
        "kind": spec.kind,
        "rmseWeight": spec.rmse_weight,
        "maxAbsWeight": spec.max_abs_weight,
        "rmseScale": spec.rmse_scale,
        "maxAbsScale": spec.max_abs_scale,
        "epsilon": spec.epsilon,
        "penalty": spec.penalty,
    }


def _candidate_record(
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
    *,
    metadata: Mapping[str, Any],
) -> dict[str, Any]:
    point = _metric_point(candidate, evaluation)
    return {
        **dict(metadata),
        "candidate": json.loads(serialize_candidate(candidate)),
        "evaluation": json.loads(serialize_evaluation(evaluation)),
        "actualFilterCount": len(candidate.filters),
        "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
        "dominatesControl": False if point is None else bool(metadata.get("controlPoint") is not None and dominates(point, metadata["controlPoint"])),
    }


def _normalized_gain(control: ObjectivePoint, candidate: ObjectivePoint) -> float:
    return max(
        0.0,
        (control.rmse_db - candidate.rmse_db) / max(abs(control.rmse_db), 1e-12),
        (control.max_abs_db - candidate.max_abs_db) / max(abs(control.max_abs_db), 1e-12),
    )


def run_control_seeded_refinement(
    problem: SolverLabProblem,
    control_candidate: SolverLabCandidate,
    canonical_evaluator: CanonicalEvaluator,
    *,
    seeds: Sequence[int] = (11, 29, 47, 83),
    evaluation_budget: int = 300,
    objective_weights: Sequence[tuple[float, float]] = LOCAL_OBJECTIVE_WEIGHTS,
    optimizer_factory: Callable[[str, int], ContinuousOptimizer] | None = None,
) -> dict[str, Any]:
    if not seeds or any(isinstance(seed, bool) or not isinstance(seed, int) for seed in seeds):
        raise ValueError("control refinement requires integer seeds")
    if isinstance(evaluation_budget, bool) or not isinstance(evaluation_budget, int) or evaluation_budget <= 0:
        raise ValueError("control refinement budget must be positive")
    if control_candidate.problemId != problem.problemId or control_candidate.inputSha256 != problem.inputSha256:
        raise ValueError("control candidate does not belong to problem")
    layout = infer_layout_from_filters(control_candidate.filters)
    control_evaluations = canonical_evaluator.evaluate(problem, (control_candidate,))
    if len(control_evaluations) != 1:
        raise ValueError("canonical control evaluation did not return one result")
    control_evaluation = control_evaluations[0]
    control_point = _metric_point(control_candidate, control_evaluation)
    if control_point is None:
        raise ValueError("canonical control evaluation is invalid")
    specs = _objective_specs_for_evaluation(control_evaluation, objective_weights)
    factory = optimizer_factory or _default_optimizer_factory
    candidates: list[tuple[SolverLabCandidate, dict[str, Any]]] = []
    run_index = 0
    for spec_index, spec in enumerate(specs):
        objective = diagnostic_objective_callable(problem, layout, spec)
        polish = factory("powell", run_index)
        run_index += 1
        polished = polish.optimize(
            problem,
            layout,
            0,
            (spec.rmse_weight, spec.max_abs_weight),
            evaluation_budget,
            initial_candidate=control_candidate,
            objective=objective,
        )
        candidates.append((polished, {
            "method": "powell",
            "seed": None,
            "provenance": "diagnosis:control-seeded-local-refinement",
            "objectiveIndex": spec_index,
            "objective": _objective_record(spec),
            "sourceControlCandidateId": control_candidate.candidateId,
            "topology": {
                "filterCount": layout.filter_count,
                "filterTypes": list(layout.filter_types),
            },
            "evaluationCount": int(getattr(polish, "last_evaluation_count", evaluation_budget)),
        }))
        for seed in seeds:
            optimizer = factory("cma-es", run_index)
            run_index += 1
            candidate = optimizer.optimize(
                problem,
                layout,
                seed,
                (spec.rmse_weight, spec.max_abs_weight),
                evaluation_budget,
                initial_candidate=control_candidate,
                objective=objective,
            )
            candidates.append((candidate, {
                "method": "cma-es",
                "seed": seed,
                "provenance": "diagnosis:control-seeded-local-refinement",
                "objectiveIndex": spec_index,
                "objective": _objective_record(spec),
                "sourceControlCandidateId": control_candidate.candidateId,
                "topology": {
                    "filterCount": layout.filter_count,
                    "filterTypes": list(layout.filter_types),
                },
                "evaluationCount": int(getattr(optimizer, "last_evaluation_count", evaluation_budget)),
            }))
    evaluations = canonical_evaluator.evaluate(problem, tuple(candidate for candidate, _ in candidates))
    evaluation_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    records: list[dict[str, Any]] = []
    points: list[ObjectivePoint] = [control_point]
    control_record = {
        "candidate": json.loads(serialize_candidate(control_candidate)),
        "evaluation": json.loads(serialize_evaluation(control_evaluation)),
        "source": "frozen-standard-v2-control",
        "actualFilterCount": len(control_candidate.filters),
        "actualDeliveredFilterCount": len(control_evaluation.deliverableFilters),
    }
    for candidate, metadata in candidates:
        evaluation = evaluation_by_id[candidate.candidateId]
        point = _metric_point(candidate, evaluation)
        if point is None:
            continue
        record = _candidate_record(candidate, evaluation, metadata={
            **metadata,
            "controlPoint": control_point,
        })
        record.pop("controlPoint", None)
        record["dominatesControl"] = dominates(point, control_point)
        record["controlDominates"] = dominates(control_point, point)
        record["normalizedRegretVsControl"] = normalized_regret(point, (control_point,))
        record["normalizedGainVsControl"] = _normalized_gain(control_point, point)
        records.append(record)
        points.append(point)
    frontier_points = nondominated(points)
    frontier_ids = {point.candidate_id for point in frontier_points}
    material = any(
        record["candidate"]["candidateId"] in frontier_ids and record["dominatesControl"] and
        record["normalizedRegretVsControl"] > DIAGNOSTIC_FRONTIER_MATERIAL_REGRET
        for record in records
    )
    return {
        "sourceControlCandidateId": control_candidate.candidateId,
        "topology": {
            "filterCount": layout.filter_count,
            "filterTypes": list(layout.filter_types),
        },
        "seeds": list(seeds),
        "evaluationBudget": evaluation_budget,
        "objectiveSpecs": [_objective_record(spec) for spec in specs],
        "control": control_record,
        "records": records,
        "frontierPointIds": [point.candidate_id for point in frontier_points],
        "material": material,
        "materialityThreshold": DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
        "materialityThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
    }


def _objective_point_record(value: Mapping[str, Any]) -> ObjectivePoint:
    candidate_id = value.get("candidateId")
    rmse = value.get("rmseDb")
    max_abs = value.get("maxAbsDb")
    filter_count = value.get("actualDeliveredFilterCount", value.get("filterCount", 0))
    if (
        not isinstance(candidate_id, str) or not candidate_id or
        isinstance(rmse, bool) or not isinstance(rmse, (int, float)) or not math.isfinite(float(rmse)) or
        isinstance(max_abs, bool) or not isinstance(max_abs, (int, float)) or not math.isfinite(float(max_abs)) or
        isinstance(filter_count, bool) or not isinstance(filter_count, int) or filter_count < 0
    ):
        raise ValueError("frontier point record is incomplete")
    return ObjectivePoint(candidate_id, float(rmse), float(max_abs), filter_count)


def compare_existing_stage_frontiers(
    stages: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    control: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    required = ("screen", "confirm", "deep")
    if any(stage not in stages for stage in required):
        raise ValueError("stage frontier comparison requires screen, confirm, and deep")
    stage_points = {
        stage: tuple(_objective_point_record(point) for point in stages[stage])
        for stage in required
    }
    control_point = None if control is None else _objective_point_record(control)
    screen_to_confirm = compare_frontier_snapshots(
        stage_points["screen"], stage_points["confirm"], control=control_point
    )
    confirm_to_deep = compare_frontier_snapshots(
        stage_points["confirm"], stage_points["deep"], control=control_point
    )
    return {
        "screenToConfirm": screen_to_confirm,
        "confirmToDeep": confirm_to_deep,
        "practicalConvergence": classify_practical_convergence(confirm_to_deep),
        "optimizerFamilyAgreement": {
            stage: summarize_optimizer_family_agreement([
                {
                    "algorithmId": point.get("algorithmId"),
                    "metrics": {
                        "rmseDb": point.get("rmseDb"),
                        "maxAbsDb": point.get("maxAbsDb"),
                    },
                }
                for point in stages[stage]
            ])
            for stage in required
        },
    }


def build_alternative_objectives(
    *,
    rmse_scale: float,
    max_abs_scale: float,
) -> list[dict[str, Any]]:
    if (
        not math.isfinite(rmse_scale) or rmse_scale <= 0 or
        not math.isfinite(max_abs_scale) or max_abs_scale <= 0
    ):
        raise ValueError("alternative objective scales must be finite and positive")
    return [
        {
            "kind": "tchebycheff",
            "rmseWeight": rmse_weight,
            "maxAbsWeight": max_abs_weight,
            "rmseScale": rmse_scale,
            "maxAbsScale": max_abs_scale,
            "epsilon": None,
            "penalty": 100.0,
        }
        for rmse_weight, max_abs_weight in ((0.75, 0.25), (0.50, 0.50), (0.25, 0.75))
    ] + [
        {
            "kind": "epsilon-maxabs",
            "rmseWeight": 1.0,
            "maxAbsWeight": 0.0,
            "rmseScale": rmse_scale,
            "maxAbsScale": max_abs_scale,
            "epsilon": 1.0,
            "penalty": 100.0,
        },
        {
            "kind": "epsilon-rmse",
            "rmseWeight": 0.0,
            "maxAbsWeight": 1.0,
            "rmseScale": rmse_scale,
            "maxAbsScale": max_abs_scale,
            "epsilon": 1.0,
            "penalty": 100.0,
        },
    ]


def _objective_from_record(record: Mapping[str, Any]) -> DiagnosticObjective:
    return DiagnosticObjective(
        kind=record["kind"],
        rmse_weight=float(record["rmseWeight"]),
        max_abs_weight=float(record["maxAbsWeight"]),
        rmse_scale=float(record["rmseScale"]),
        max_abs_scale=float(record["maxAbsScale"]),
        epsilon=None if record.get("epsilon") is None else float(record["epsilon"]),
        penalty=float(record.get("penalty", 100.0)),
    )


def frontier_extension_evidence(
    previous: Sequence[Mapping[str, Any]],
    current: Sequence[Mapping[str, Any]],
    *,
    metric: Literal["continuous", "deliverable"] = "continuous",
) -> dict[str, Any]:
    previous_points = tuple(
        _objective_point_record(_direct_record_from_point(point, metric=metric))
        for point in previous
    )
    current_points = tuple(
        _objective_point_record(_direct_record_from_point(point, metric=metric))
        for point in current
    )
    comparison = compare_frontier_snapshots(previous_points, current_points)
    return {
        **comparison,
        "material": bool(
            comparison["newNondominatedPointIds"] and
            comparison["currentToPreviousNormalizedRegret"] > DIAGNOSTIC_FRONTIER_MATERIAL_REGRET
        ),
    }


def _official_record(
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
    *,
    metadata: Mapping[str, Any],
    control_point: ObjectivePoint | None = None,
    metric: Literal["continuous", "deliverable"] = "deliverable",
) -> dict[str, Any]:
    point = _metric_point(candidate, evaluation, deliverable=metric == "deliverable")
    record: dict[str, Any] = {
        **dict(metadata),
        "candidate": _serialized_candidate(candidate),
        "evaluation": _serialized_evaluation(evaluation),
        "actualFilterCount": len(candidate.filters),
        "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
    }
    if point is not None and control_point is not None:
        record.update({
            "dominatesControl": dominates(point, control_point),
            "controlDominates": dominates(control_point, point),
            "normalizedRegretVsControl": normalized_regret(point, (control_point,)),
            "normalizedGainVsControl": _normalized_gain(control_point, point),
        })
    return record


def _record_point(record: Mapping[str, Any], metric: Literal["continuous", "deliverable"]) -> ObjectivePoint:
    evaluation = record.get("evaluation")
    candidate = record.get("candidate")
    if not isinstance(evaluation, Mapping) or not isinstance(candidate, Mapping):
        raise ValueError("diagnosis record must contain candidate and evaluation")
    parsed_evaluation = parse_evaluation(evaluation)
    parsed_candidate = parse_candidate(candidate)
    point = _metric_point(parsed_candidate, parsed_evaluation, deliverable=metric == "deliverable")
    if point is None:
        raise ValueError("diagnosis record does not contain valid requested metrics")
    return point


def _frontier_records(
    records: Sequence[Mapping[str, Any]],
    *,
    metric: Literal["continuous", "deliverable"],
) -> tuple[dict[str, Any], ...]:
    by_id = {
        str(record["candidate"]["candidateId"]): record
        for record in records
        if isinstance(record.get("candidate"), Mapping)
    }
    points = tuple(_record_point(record, metric) for record in records)
    selected = nondominated(points)
    return tuple(dict(by_id[point.candidate_id]) for point in selected)


def _run_global_objectives(
    problem: SolverLabProblem,
    layouts: Sequence[ContinuousVectorLayout],
    objective_records: Sequence[Mapping[str, Any]],
    seeds: Sequence[int],
    evaluation_budget: int,
    *,
    optimizer_factory: Callable[[str, int], ContinuousOptimizer],
    run_index: int,
    initialization: str,
) -> tuple[list[tuple[SolverLabCandidate, dict[str, Any]]], int]:
    generated: list[tuple[SolverLabCandidate, dict[str, Any]]] = []
    for layout in layouts:
        for objective_index, objective_record in enumerate(objective_records):
            spec = _objective_from_record(objective_record)
            objective = diagnostic_objective_callable(problem, layout, spec)
            for seed in seeds:
                for algorithm_id in ("differential-evolution", "cma-es"):
                    optimizer = optimizer_factory(algorithm_id, run_index)
                    run_index += 1
                    candidate = optimizer.optimize(
                        problem,
                        layout,
                        seed,
                        (1.0, 0.0),
                        evaluation_budget,
                        objective=objective,
                    )
                    generated.append((candidate, {
                        "method": algorithm_id,
                        "seed": seed,
                        "provenance": "diagnosis:alternative-objective",
                        "objectiveIndex": objective_index,
                        "objective": dict(objective_record),
                        "objectiveFamily": (
                            "tchebycheff" if objective_record["kind"] == "tchebycheff" else "epsilon"
                        ),
                        "topology": {
                            "filterCount": layout.filter_count,
                            "filterTypes": list(layout.filter_types),
                        },
                        "evaluationBudget": evaluation_budget,
                        "evaluationCount": int(getattr(optimizer, "last_evaluation_count", evaluation_budget)),
                        "initialization": initialization,
                    }))
    return generated, run_index


def run_alternative_objective_search(
    problem: SolverLabProblem,
    control_candidate: SolverLabCandidate,
    deep_frontier: Sequence[Mapping[str, Any]],
    canonical_evaluator: CanonicalEvaluator,
    *,
    seeds: Sequence[int] = (11, 29),
    evaluation_budget: int = 240,
    confirmation_seeds: Sequence[int] = (11, 29, 47, 83),
    confirmation_evaluation_budget: int = 500,
    optimizer_factory: Callable[[str, int], ContinuousOptimizer] | None = None,
) -> dict[str, Any]:
    if problem.bounds["maxFilters"] < 10:
        raise ValueError("alternative objective diagnosis requires maxFilters >= 10")
    if not seeds or not confirmation_seeds:
        raise ValueError("alternative objective diagnosis requires seeds")
    factory = optimizer_factory or _default_optimizer_factory
    control_evaluation = canonical_evaluator.evaluate(problem, (control_candidate,))[0]
    if not control_evaluation.valid or control_evaluation.continuous is None:
        raise ValueError("alternative objective diagnosis requires a valid control")
    objective_records = build_alternative_objectives(
        rmse_scale=max(control_evaluation.continuous.rmseDb, 1e-9),
        max_abs_scale=max(control_evaluation.continuous.maxAbsDb, 1e-9),
    )
    layouts = enumerate_oracle_layouts(10)
    generated, run_index = _run_global_objectives(
        problem,
        layouts,
        objective_records,
        seeds,
        evaluation_budget,
        optimizer_factory=factory,
        run_index=0,
        initialization="midpoint",
    )
    global_evaluations = canonical_evaluator.evaluate(
        problem, tuple(candidate for candidate, _ in generated)
    )
    global_by_id = {evaluation.candidateId: evaluation for evaluation in global_evaluations}
    global_records = [
        _official_record(candidate, global_by_id[candidate.candidateId], metadata=metadata)
        for candidate, metadata in generated
        if global_by_id[candidate.candidateId].valid
    ]
    global_points = tuple(_record_point(record, "continuous") for record in global_records)
    shortlist_points = nondominated(global_points)
    shortlist_ids = {point.candidate_id for point in shortlist_points}
    for point in global_points:
        if (
            point.candidate_id not in shortlist_ids and
            normalized_regret(point, shortlist_points) <= DIAGNOSTIC_FRONTIER_MATERIAL_REGRET
        ):
            shortlist_ids.add(point.candidate_id)
    metadata_by_id = {
        candidate.candidateId: metadata for candidate, metadata in generated
    }
    candidate_by_id = {
        candidate.candidateId: candidate for candidate, _ in generated
    }
    polished: list[tuple[SolverLabCandidate, dict[str, Any]]] = []
    for candidate_id in sorted(shortlist_ids):
        candidate = candidate_by_id[candidate_id]
        metadata = metadata_by_id[candidate_id]
        spec = _objective_from_record(metadata["objective"])
        layout = ContinuousVectorLayout(
            metadata["topology"]["filterCount"],
            tuple(metadata["topology"]["filterTypes"]),
        )
        optimizer = factory("powell", run_index)
        run_index += 1
        polished_candidate = optimizer.optimize(
            problem,
            layout,
            int(metadata["seed"]),
            (1.0, 0.0),
            evaluation_budget,
            initial_candidate=candidate,
            objective=diagnostic_objective_callable(problem, layout, spec),
        )
        polished.append((polished_candidate, {
            "method": "powell",
            "seed": metadata["seed"],
            "provenance": "diagnosis:alternative-objective",
            "objectiveIndex": metadata["objectiveIndex"],
            "objective": dict(metadata["objective"]),
            "objectiveFamily": metadata["objectiveFamily"],
            "topology": dict(metadata["topology"]),
            "evaluationBudget": evaluation_budget,
            "evaluationCount": int(getattr(optimizer, "last_evaluation_count", evaluation_budget)),
            "initialization": "canonical-pareto-shortlist",
            "parentCandidateId": candidate_id,
        }))
    polished_evaluations = canonical_evaluator.evaluate(
        problem, tuple(candidate for candidate, _ in polished)
    ) if polished else ()
    polished_by_id = {evaluation.candidateId: evaluation for evaluation in polished_evaluations}
    polished_records = [
        _official_record(candidate, polished_by_id[candidate.candidateId], metadata=metadata)
        for candidate, metadata in polished
        if polished_by_id[candidate.candidateId].valid
    ]
    records = [*global_records, *polished_records]
    final_frontier = _frontier_records(records, metric="continuous")
    deep_records = tuple(deep_frontier)
    family_results: dict[str, dict[str, Any]] = {}
    for family in ("tchebycheff", "epsilon"):
        family_records = tuple(record for record in records if record.get("objectiveFamily") == family)
        family_frontier = _frontier_records(family_records, metric="continuous") if family_records else ()
        extension = frontier_extension_evidence(deep_records, family_frontier) if family_frontier else {
            "material": False,
            "reason": "no-valid-alternative-points",
        }
        family_results[family] = {
            "frontier": list(family_frontier),
            "screeningExtension": extension,
            "extension": extension,
        }
    confirmation: dict[str, Any] = {}
    for family, result in family_results.items():
        if result["extension"].get("material") is not True:
            continue
        selected_records = [record for record in objective_records if (
            (family == "tchebycheff" and record["kind"] == "tchebycheff") or
            (family == "epsilon" and record["kind"].startswith("epsilon-"))
        )]
        confirmed, run_index = _run_global_objectives(
            problem,
            layouts,
            selected_records,
            confirmation_seeds,
            confirmation_evaluation_budget,
            optimizer_factory=factory,
            run_index=run_index,
            initialization="targeted-confirmation",
        )
        confirmed_evaluations = canonical_evaluator.evaluate(
            problem, tuple(candidate for candidate, _ in confirmed)
        )
        confirmed_by_id = {evaluation.candidateId: evaluation for evaluation in confirmed_evaluations}
        confirmed_records = [
            _official_record(candidate, confirmed_by_id[candidate.candidateId], metadata=metadata)
            for candidate, metadata in confirmed
            if confirmed_by_id[candidate.candidateId].valid
        ]
        confirmed_frontier = _frontier_records(confirmed_records, metric="continuous")
        confirmation[family] = {
            "records": confirmed_records,
            "frontier": list(confirmed_frontier),
            "extension": frontier_extension_evidence(deep_records, confirmed_frontier),
            "seeds": list(confirmation_seeds),
            "evaluationBudget": confirmation_evaluation_budget,
        }
        result["confirmedExtension"] = confirmation[family]["extension"]
        result["extension"] = confirmation[family]["extension"]
    return {
        "maxFilters": 10,
        "topologies": [
            {"filterCount": layout.filter_count, "filterTypes": list(layout.filter_types)}
            for layout in layouts
        ],
        "seeds": list(seeds),
        "evaluationBudget": evaluation_budget,
        "objectiveSpecs": objective_records,
        "records": records,
        "frontier": list(final_frontier),
        "familyResults": family_results,
        "targetedConfirmation": confirmation,
        "material": any(result["extension"].get("material") is True for result in family_results.values()),
    }


def run_capacity_diagnosis(
    problem: SolverLabProblem,
    control_artifacts: Mapping[int, Mapping[str, Any]],
    canonical_evaluator: CanonicalEvaluator,
    *,
    caps: Sequence[int] = (10, 20, 40),
    seeds: Sequence[int] = (11, 29, 47, 83),
    evaluation_budget: int = 300,
    optimizer_factory: Callable[[str, int], ContinuousOptimizer] | None = None,
) -> dict[str, Any]:
    if tuple(sorted(caps)) != (10, 20, 40):
        raise ValueError("capacity diagnosis caps must be exactly 10, 20, and 40")
    factory = optimizer_factory or _default_optimizer_factory
    cap_results: dict[str, Any] = {}
    frontier_summaries: dict[int, list[dict[str, Any]]] = {}
    run_index = 0
    for cap in sorted(caps):
        artifact = control_artifacts.get(cap)
        if artifact is None:
            raise ValueError(f"capacity control artifact for cap {cap} is required")
        search_problem = replace(problem, bounds={**problem.bounds, "maxFilters": cap})
        controls = load_control_candidates(artifact, search_problem, cap)
        if len(controls) != 1:
            raise ValueError(f"capacity control artifact for cap {cap} must contain one case")
        control = controls[0]
        control_evaluations = canonical_evaluator.evaluate(search_problem, (control,))
        if len(control_evaluations) != 1:
            raise ValueError("capacity control evaluation did not return one result")
        control_evaluation = control_evaluations[0]
        control_point = _metric_point(control, control_evaluation)
        if control_point is None:
            raise ValueError(f"capacity control for cap {cap} is invalid")
        records: list[dict[str, Any]] = [{
            "cap": cap,
            "method": "standard-v2-control",
            "seed": None,
            "provenance": f"diagnosis:capacity-product-result:cap-{cap}",
            "initialization": "product-result",
            "candidate": _serialized_candidate(control),
            "evaluation": _serialized_evaluation(control_evaluation),
            "actualFilterCount": len(control.filters),
            "actualDeliveredFilterCount": len(control_evaluation.deliverableFilters),
            "sourceControlCandidateId": control.candidateId,
            "sourceControl": {
                "repositorySha": artifact.get("repositorySha"),
                "algorithmVersion": artifact.get("algorithmVersion"),
                "maxFilters": artifact.get("maxFilters"),
                "budgetSeconds": artifact.get("budgetSeconds"),
            },
        }]
        if control.filters:
            layout = infer_layout_from_filters(control.filters)
            spec = DiagnosticObjective(
                kind="weighted-sum",
                rmse_weight=0.5,
                max_abs_weight=0.5,
                rmse_scale=max(control_evaluation.continuous.rmseDb, 1e-9) if control_evaluation.continuous else 1.0,
                max_abs_scale=max(control_evaluation.continuous.maxAbsDb, 1e-9) if control_evaluation.continuous else 1.0,
            )
            objective = diagnostic_objective_callable(search_problem, layout, spec)
            candidates: list[tuple[SolverLabCandidate, dict[str, Any]]] = []
            polish = factory("powell", run_index)
            run_index += 1
            polished = polish.optimize(
                search_problem,
                layout,
                0,
                (0.5, 0.5),
                evaluation_budget,
                initial_candidate=control,
                objective=objective,
            )
            candidates.append((polished, {
                "cap": cap,
                "method": "powell",
                "seed": None,
                "provenance": "diagnosis:capacity-local-refinement",
                "initialization": "product-result",
                "sourceControlCandidateId": control.candidateId,
                "objective": _objective_record(spec),
                "topology": {"filterCount": layout.filter_count, "filterTypes": list(layout.filter_types)},
                "evaluationBudget": evaluation_budget,
                "evaluationCount": int(getattr(polish, "last_evaluation_count", evaluation_budget)),
            }))
            for seed in seeds:
                optimizer = factory("cma-es", run_index)
                run_index += 1
                candidate = optimizer.optimize(
                    search_problem,
                    layout,
                    seed,
                    (0.5, 0.5),
                    evaluation_budget,
                    initial_candidate=control,
                    objective=objective,
                )
                candidates.append((candidate, {
                    "cap": cap,
                    "method": "cma-es",
                    "seed": seed,
                    "provenance": "diagnosis:capacity-local-refinement",
                    "initialization": "product-result",
                    "sourceControlCandidateId": control.candidateId,
                    "objective": _objective_record(spec),
                    "topology": {"filterCount": layout.filter_count, "filterTypes": list(layout.filter_types)},
                    "evaluationBudget": evaluation_budget,
                    "evaluationCount": int(getattr(optimizer, "last_evaluation_count", evaluation_budget)),
                }))
            evaluations = canonical_evaluator.evaluate(
                search_problem, tuple(candidate for candidate, _ in candidates)
            )
            evaluations_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
            for candidate, metadata in candidates:
                evaluation = evaluations_by_id[candidate.candidateId]
                if evaluation.valid:
                    records.append(_official_record(
                        candidate,
                        evaluation,
                        metadata=metadata,
                        control_point=control_point,
                    ))
        frontier = _frontier_records(records, metric="deliverable")
        direct_frontier = [
            {
                "candidateId": record["candidate"]["candidateId"],
                "algorithmId": record["candidate"]["algorithmId"],
                "rmseDb": record["evaluation"]["deliverable"]["rmseDb"],
                "maxAbsDb": record["evaluation"]["deliverable"]["maxAbsDb"],
                "actualFilterCount": record["actualFilterCount"],
                "actualDeliveredFilterCount": record["actualDeliveredFilterCount"],
            }
            for record in frontier
        ]
        frontier_summaries[cap] = direct_frontier
        cap_results[str(cap)] = {
            "cap": cap,
            "control": records[0],
            "records": records,
            "frontier": list(frontier),
            "actualFilterCounts": sorted({record["actualFilterCount"] for record in records}),
        }
    summary = summarize_capacity_frontiers(frontier_summaries)
    comparisons = {
        "10To20": compare_frontier_snapshots(
            tuple(_objective_point_record(point) for point in frontier_summaries[10]),
            tuple(_objective_point_record(point) for point in frontier_summaries[20]),
        ),
        "20To40": compare_frontier_snapshots(
            tuple(_objective_point_record(point) for point in frontier_summaries[20]),
            tuple(_objective_point_record(point) for point in frontier_summaries[40]),
        ),
    }
    summary["frontierCriterionVersion"] = DIAGNOSTIC_FRONTIER_CRITERION_VERSION
    summary["normalizedFrontierGainByTransition"] = {
        "10To20": comparisons["10To20"]["currentToPreviousNormalizedRegret"],
        "20To40": comparisons["20To40"]["currentToPreviousNormalizedRegret"],
    }
    summary["material"] = bool(
        summary["material"] or any(comparison["materialChange"] for comparison in comparisons.values())
    )
    return {
        "caps": sorted(caps),
        "seeds": list(seeds),
        "evaluationBudget": evaluation_budget,
        "results": cap_results,
        "frontierSummaries": frontier_summaries,
        "comparisons": comparisons,
        "summary": summary,
        "material": summary["material"],
    }


def run_known_good_recovery(
    problem: SolverLabProblem,
    control_candidate: SolverLabCandidate,
    deep_frontier: Sequence[Mapping[str, Any]],
    canonical_evaluator: CanonicalEvaluator,
    historical_artifacts: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    control_evaluation = canonical_evaluator.evaluate(problem, (control_candidate,))[0]
    control_point = _metric_point(control_candidate, control_evaluation)
    if control_point is None:
        raise ValueError("known-good recovery requires a valid control")
    references: list[dict[str, Any]] = []
    for artifact in historical_artifacts:
        recovery = recover_historical_reference(
            problem,
            artifact["artifact"],
            expected_source_sha=str(artifact["sourceSha"]),
            expected_run_id=str(artifact["sourceRunId"]),
            expected_artifact_id=str(artifact["sourceArtifactId"]),
        )
        recovery = canonically_evaluate_reference(recovery, problem, canonical_evaluator)
        if recovery.get("status") != "recovered":
            references.append(recovery)
            continue
        candidate = recovery["candidate"]
        evaluation = recovery["evaluation"]
        point = _metric_point(candidate, evaluation)
        if point is None:
            raise ValueError("canonical reference evaluation is invalid")
        direct = {
            "candidateId": candidate.candidateId,
            "algorithmId": candidate.algorithmId,
            "seed": candidate.seed,
            "rmseDb": point.rmse_db,
            "maxAbsDb": point.max_abs_db,
            "actualFilterCount": len(candidate.filters),
            "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
        }
        extension = frontier_extension_evidence(deep_frontier, [direct], metric="deliverable")
        unseeded_failed_to_rediscover = bool(extension.get("newNondominatedPointIds"))
        record = {
            **recovery,
            "candidate": _serialized_candidate(candidate),
            "evaluation": _serialized_evaluation(evaluation),
            "actualFilterCount": len(candidate.filters),
            "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
            "dominatesControl": dominates(point, control_point),
            "controlDominates": dominates(control_point, point),
            "normalizedRegretVsControl": normalized_regret(point, (control_point,)),
            "normalizedGainVsControl": _normalized_gain(control_point, point),
            "frontierExtension": extension,
            "unseededFailedToRediscover": unseeded_failed_to_rediscover,
            "material": bool(
                unseeded_failed_to_rediscover and (
                    (
                        dominates(point, control_point) and
                        _normalized_gain(control_point, point) > DIAGNOSTIC_FRONTIER_MATERIAL_REGRET
                    ) or extension.get("material") is True
                )
            ),
        }
        references.append(record)
    material = any(reference.get("material") is True for reference in references)
    return {
        "references": references,
        "available": any(reference.get("status") == "recovered" for reference in references),
        "material": material,
        "materialityThreshold": DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
        "materialityThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
    }


def _direct_record_from_official(
    record: Mapping[str, Any],
    *,
    metric: Literal["continuous", "deliverable"],
) -> dict[str, Any]:
    point = _record_point(record, metric)
    candidate = record.get("candidate")
    evaluation = record.get("evaluation")
    if not isinstance(candidate, Mapping) or not isinstance(evaluation, Mapping):
        raise ValueError("diagnosis record must contain candidate and evaluation")
    direct: dict[str, Any] = {
        "candidateId": point.candidate_id,
        "algorithmId": candidate["algorithmId"],
        "seed": candidate.get("seed"),
        "rmseDb": point.rmse_db,
        "maxAbsDb": point.max_abs_db,
        "actualFilterCount": record.get("actualFilterCount", len(candidate["filters"])),
        "actualDeliveredFilterCount": record.get(
            "actualDeliveredFilterCount", len(evaluation.get("deliverable", {}).get("filters", ()))
        ),
    }
    for key in (
        "method",
        "objectiveIndex",
        "objective",
        "objectiveFamily",
        "topology",
        "evaluationBudget",
        "evaluationCount",
        "initialization",
        "sourceControlCandidateId",
        "sourceControl",
        "parentCandidateId",
        "provenance",
        "source",
        "cap",
    ):
        if key in record:
            direct[key] = record[key]
    return direct


def _direct_record_from_point(
    point: Mapping[str, Any],
    *,
    metric: Literal["continuous", "deliverable"],
) -> dict[str, Any]:
    if isinstance(point.get("candidate"), Mapping) and isinstance(point.get("evaluation"), Mapping):
        return _direct_record_from_official(point, metric=metric)
    objective_point = _objective_point_record(point)
    return {
        "candidateId": objective_point.candidate_id,
        "algorithmId": point.get("algorithmId"),
        "seed": point.get("seed"),
        "rmseDb": objective_point.rmse_db,
        "maxAbsDb": objective_point.max_abs_db,
        "actualFilterCount": point.get("actualFilterCount", objective_point.filter_count),
        "actualDeliveredFilterCount": point.get(
            "actualDeliveredFilterCount", objective_point.filter_count
        ),
        **{
            key: point[key]
            for key in (
                "provenance",
                "source",
                "method",
                "objectiveFamily",
                "cap",
            )
            if key in point
        },
    }


def _best_known_frontier(
    groups: Sequence[Sequence[Mapping[str, Any]]],
    *,
    metric: Literal["continuous", "deliverable"],
) -> list[dict[str, Any]]:
    direct_by_id: dict[str, dict[str, Any]] = {}
    for group in groups:
        for value in group:
            direct = _direct_record_from_point(value, metric=metric)
            direct_by_id[str(direct["candidateId"])] = direct
    points = tuple(_objective_point_record(value) for value in direct_by_id.values())
    frontier_ids = {point.candidate_id for point in nondominated(points)}
    return [
        direct_by_id[candidate_id]
        for candidate_id in sorted(frontier_ids)
    ]


def _control_report_record(
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
    *,
    artifact: Mapping[str, Any],
) -> dict[str, Any]:
    point = _metric_point(candidate, evaluation)
    continuous_point = _metric_point(candidate, evaluation, deliverable=False)
    if point is None or continuous_point is None:
        raise ValueError("diagnosis control must have valid continuous and deliverable metrics")
    return {
        "candidate": _serialized_candidate(candidate),
        "evaluation": _serialized_evaluation(evaluation),
        "source": "frozen-standard-v2-control",
        "provenance": "reference:frozen-standard-v2-control",
        "repositorySha": artifact.get("repositorySha"),
        "algorithmVersion": artifact.get("algorithmVersion"),
        "budgetSeconds": artifact.get("budgetSeconds"),
        "maxFilters": artifact.get("maxFilters"),
        "actualFilterCount": len(candidate.filters),
        "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
        "continuous": {
            "rmseDb": continuous_point.rmse_db,
            "maxAbsDb": continuous_point.max_abs_db,
        },
        "deliverable": {
            "rmseDb": point.rmse_db,
            "maxAbsDb": point.max_abs_db,
        },
    }


def _historical_provenance_record(artifact: Mapping[str, Any]) -> dict[str, Any]:
    source_artifact = artifact.get("artifact")
    source = source_artifact if isinstance(source_artifact, Mapping) else {}
    return {
        "provenance": artifact.get("provenance", source.get("sourceAlgorithm")),
        "sourceSha": artifact.get("sourceSha", source.get("repositorySha")),
        "sourceRunId": artifact.get("sourceRunId", source.get("sourceRunId")),
        "sourceArtifactId": artifact.get("sourceArtifactId", source.get("sourceArtifactId")),
    }


def _next_research_action(labels: Sequence[str]) -> str:
    if "discovery-seeding-gap" in labels:
        return "prioritize proposal/seeding/structure discovery in Family Screening"
    if "local-search-gap" in labels:
        return "prioritize stronger resumable local refinement"
    if "objective-scalarization-gap" in labels:
        return "change Pareto exploration strategy before brute force"
    if "capacity-gap" in labels:
        return "investigate filter representation/capacity tradeoffs"
    return "stop spending compute on these mechanisms"


def run_oracle_diagnosis_case(
    problem: SolverLabProblem,
    control_artifact: Mapping[str, Any],
    stage_artifacts: Mapping[str, Mapping[str, Any]],
    historical_artifacts: Sequence[Mapping[str, Any]],
    canonical_evaluator: CanonicalEvaluator,
    *,
    config: OracleDiagnosisConfig,
    capacity_control_artifacts: Mapping[int, Mapping[str, Any]] | None = None,
    stage_sources: Mapping[str, Mapping[str, Any]] | None = None,
    existing_calibration: Mapping[str, Any] | None = None,
    runtime: Mapping[str, Any] | None = None,
    optimizer_factory: Callable[[str, int], ContinuousOptimizer] | None = None,
) -> dict[str, Any]:
    if control_artifact.get("algorithmVersion") != config.frozen_control_sha:
        raise ValueError("frozen control algorithm SHA does not match control artifact")
    control_candidates = load_control_candidates(control_artifact, problem, 10)
    if len(control_candidates) != 1:
        raise ValueError("diagnosis requires exactly one frozen control candidate per case")
    control_candidate = control_candidates[0]
    control_evaluation = canonical_evaluator.evaluate(problem, (control_candidate,))[0]
    control_point_continuous = _metric_point(control_candidate, control_evaluation, deliverable=False)
    control_point_deliverable = _metric_point(control_candidate, control_evaluation)
    if control_point_continuous is None or control_point_deliverable is None:
        raise ValueError("diagnosis control evaluation is invalid")

    stage_continuous = load_existing_stage_frontier_points(
        stage_artifacts, case_id=problem.problemId, metric="continuous"
    )
    stage_deliverable = load_existing_stage_frontier_points(
        stage_artifacts, case_id=problem.problemId, metric="deliverable"
    )
    known_stage_provenance = stage_sources or STAGE_PROVENANCE
    for stage in ("screen", "confirm", "deep"):
        source = dict(known_stage_provenance.get(stage, {}))
        stage_continuous[stage] = tuple({
            **point,
            "provenance": f"reference:oracle-{stage}-aggregate",
            "source": source,
        } for point in stage_continuous[stage])
        stage_deliverable[stage] = tuple({
            **point,
            "provenance": f"reference:oracle-{stage}-aggregate",
            "source": source,
        } for point in stage_deliverable[stage])
    control_continuous_record = {
        "candidateId": control_point_continuous.candidate_id,
        "algorithmId": control_candidate.algorithmId,
        "rmseDb": control_point_continuous.rmse_db,
        "maxAbsDb": control_point_continuous.max_abs_db,
        "actualFilterCount": len(control_candidate.filters),
        "actualDeliveredFilterCount": len(control_evaluation.deliverableFilters),
    }
    control_deliverable_record = {
        **control_continuous_record,
        "rmseDb": control_point_deliverable.rmse_db,
        "maxAbsDb": control_point_deliverable.max_abs_db,
    }
    movement_continuous = compare_existing_stage_frontiers(
        stage_continuous, control=control_continuous_record
    )
    movement_deliverable = compare_existing_stage_frontiers(
        stage_deliverable, control=control_deliverable_record
    )
    movement = {
        "criterionVersion": movement_continuous["screenToConfirm"]["criterionVersion"],
        "continuous": movement_continuous,
        "deliverable": movement_deliverable,
        "practicalConvergence": movement_continuous["practicalConvergence"],
    }

    deep_continuous = stage_continuous["deep"]
    deep_deliverable = stage_deliverable["deep"]
    local_refinement = run_control_seeded_refinement(
        problem,
        control_candidate,
        canonical_evaluator,
        seeds=config.local_seeds,
        evaluation_budget=config.local_evaluation_budget,
        optimizer_factory=optimizer_factory,
    )
    known_good = run_known_good_recovery(
        problem,
        control_candidate,
        deep_deliverable,
        canonical_evaluator,
        historical_artifacts,
    )
    alternative = run_alternative_objective_search(
        problem,
        control_candidate,
        deep_continuous,
        canonical_evaluator,
        seeds=config.alternative_seeds,
        evaluation_budget=config.alternative_evaluation_budget,
        confirmation_seeds=config.confirmation_seeds,
        confirmation_evaluation_budget=config.confirmation_evaluation_budget,
        optimizer_factory=optimizer_factory,
    )
    if capacity_control_artifacts is None:
        capacity: dict[str, Any] = {
            "available": False,
            "material": False,
            "reason": "not-applicable-for-this-case",
        }
    else:
        for cap, cap_artifact in capacity_control_artifacts.items():
            if cap_artifact.get("algorithmVersion") != config.frozen_control_sha:
                raise ValueError("capacity control algorithm SHA does not match frozen control SHA")
            if cap in (20, 40) and cap_artifact.get("repositorySha") != config.repository_sha:
                raise ValueError("capacity control repository SHA does not match diagnosis SHA")
        capacity = run_capacity_diagnosis(
            problem,
            capacity_control_artifacts,
            canonical_evaluator,
            caps=config.capacity_caps,
            seeds=config.local_seeds,
            evaluation_budget=config.local_evaluation_budget,
            optimizer_factory=optimizer_factory,
        )
        capacity["available"] = True

    local_gain = max(
        (float(record.get("normalizedGainVsControl", 0.0)) for record in local_refinement["records"]),
        default=0.0,
    )
    recovered_references = [
        record for record in known_good["references"]
        if record.get("status") == "recovered"
    ]
    known_gain = max(
        (float(record.get("normalizedGainVsControl", 0.0)) for record in recovered_references),
        default=0.0,
    )
    alternative_evidence = {
        "available": True,
        "material": bool(alternative["material"]),
        "tchebycheffMaterial": alternative["familyResults"]["tchebycheff"]["extension"].get("material", False),
        "epsilonMaterial": alternative["familyResults"]["epsilon"]["extension"].get("material", False),
        "tchebycheffExtension": alternative["familyResults"]["tchebycheff"]["extension"],
        "epsilonExtension": alternative["familyResults"]["epsilon"]["extension"],
        "materialityThreshold": DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
        "targetedConfirmationFamilies": sorted(alternative["targetedConfirmation"]),
    }
    evidence = {
        "local-search-gap": {
            "available": True,
            "material": bool(local_refinement["material"]),
            "maxNormalizedGainVsControl": local_gain,
            "materialityThreshold": local_refinement["materialityThreshold"],
        },
        "discovery-seeding-gap": {
            "available": bool(recovered_references),
            "material": bool(known_good["material"]),
            "maxNormalizedGainVsControl": known_gain,
            "materialityThreshold": known_good["materialityThreshold"],
            "recoveredReferenceCount": len(recovered_references),
            "unavailableReferenceCount": len(known_good["references"]) - len(recovered_references),
            "unseededFailedToRediscover": [
                reference.get("provenance")
                for reference in known_good["references"]
                if reference.get("unseededFailedToRediscover") is True
            ],
        },
        "objective-scalarization-gap": alternative_evidence,
        "capacity-gap": {
            "available": capacity.get("available", False),
            "material": bool(capacity.get("material", False)),
            "comparisons": capacity.get("comparisons", {}),
            "summary": capacity.get("summary"),
            "materialityThreshold": DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION,
        },
    }
    classification = classify_causal_mechanisms(
        local_search=evidence["local-search-gap"],
        discovery_seeding=evidence["discovery-seeding-gap"],
        objective_scalarization=evidence["objective-scalarization-gap"],
        capacity=evidence["capacity-gap"] if capacity.get("available") else None,
    )

    alternative_records = list(alternative["records"])
    if alternative["targetedConfirmation"]:
        for confirmation in alternative["targetedConfirmation"].values():
            alternative_records.extend(confirmation["records"])
    local_records = list(local_refinement["records"])
    known_records = [
        reference for reference in known_good["references"]
        if reference.get("status") == "recovered"
    ]
    capacity_records = []
    if capacity.get("available"):
        capacity_records = capacity["results"]["10"]["records"]
    updated_continuous = _best_known_frontier(
        [
            deep_continuous,
            local_records,
            known_records,
            alternative_records,
            capacity_records,
        ],
        metric="continuous",
    )
    updated_deliverable = _best_known_frontier(
        [
            deep_deliverable,
            local_records,
            known_records,
            alternative_records,
            capacity_records,
        ],
        metric="deliverable",
    )
    existing_status = (
        existing_calibration.get("status")
        if isinstance(existing_calibration, Mapping)
        else "insufficient"
    )
    if existing_status not in {"insufficient", "valid", "frozen"}:
        existing_status = "insufficient"
    return {
        "version": 1,
        "report": ORACLE_DIAGNOSIS_REPORT,
        "repositorySha": config.repository_sha,
        "frozenControlSha": config.frozen_control_sha,
        "caseId": problem.problemId,
        "provenance": {
            "controlArtifact": {
                "repositorySha": control_artifact.get("repositorySha"),
                "algorithmVersion": control_artifact.get("algorithmVersion"),
                "maxFilters": control_artifact.get("maxFilters"),
                "budgetSeconds": control_artifact.get("budgetSeconds"),
            },
                "stageArtifacts": dict(stage_sources or STAGE_PROVENANCE),
                "historicalArtifacts": [
                    _historical_provenance_record(artifact)
                    for artifact in historical_artifacts
                ],
            "canonicalEvaluator": {
                "command": list(getattr(canonical_evaluator, "command", ())),
                "version": "solver-lab-canonical-protocol-v1",
            },
        },
        "diagnosisConfig": {
            "version": ORACLE_DIAGNOSIS_CONFIG_VERSION,
            "localSeeds": list(config.local_seeds),
            "alternativeSeeds": list(config.alternative_seeds),
            "confirmationSeeds": list(config.confirmation_seeds),
            "localEvaluationBudget": config.local_evaluation_budget,
            "alternativeEvaluationBudget": config.alternative_evaluation_budget,
            "confirmationEvaluationBudget": config.confirmation_evaluation_budget,
            "capacityCaps": list(config.capacity_caps),
            "objectiveSpecVersion": config.objective_spec_version,
            "frontierCriterionVersion": movement["criterionVersion"],
            "materialRegretThreshold": DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
            "materialRegretThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
            "pointMatchTolerance": DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE,
            "pointMatchToleranceSource": "calibration.FAMILY_MATCH_TOLERANCE",
            "capacityMaterialGainThreshold": DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION,
            "capacityMaterialGainThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
        },
        "runtime": None if runtime is None else dict(runtime),
        "control": _control_report_record(control_candidate, control_evaluation, artifact=control_artifact),
        "existingDeepFrontier": {
            "continuous": list(deep_continuous),
            "deliverable": list(deep_deliverable),
        },
        "marginalFrontierMovement": movement,
        "localRefinement": local_refinement,
        "knownGoodRecovery": known_good,
        "alternativeObjectives": alternative,
        "capacity": capacity,
        "classification": {
            **classification,
            "nextResearchAction": _next_research_action(classification["labels"]),
        },
        "evidence": evidence,
        "updatedBestKnownFrontier": {
            "continuous": updated_continuous,
            "deliverable": updated_deliverable,
            "extendsExistingDeep": {
                "continuous": frontier_extension_evidence(deep_continuous, updated_continuous),
                "deliverable": frontier_extension_evidence(
                    deep_deliverable, updated_deliverable, metric="deliverable"
                ),
            },
        },
            "calibration": {
                "calibrationFrozen": False,
                "status": existing_status,
                "existingStatus": existing_status,
            "statusChanged": False,
            "bestKnownFrontierReevaluated": True,
            "reason": "diagnosis does not alter existing strict calibration gate",
        },
        "holdoutOpened": False,
        "productionBehaviorChanged": False,
    }


def summarize_capacity_frontiers(
    frontiers: Mapping[int, Sequence[Mapping[str, Any]]],
) -> dict[str, Any]:
    if not frontiers:
        raise ValueError("capacity diagnosis requires at least one frontier")
    qualities: dict[int, float] = {}
    for cap, points in frontiers.items():
        if isinstance(cap, bool) or not isinstance(cap, int) or cap <= 0:
            raise ValueError("capacity frontier caps must be positive integers")
        values: list[float] = []
        for point in points:
            if not isinstance(point, Mapping):
                raise ValueError("capacity frontier point must be an object")
            rmse = point.get("rmseDb")
            max_abs = point.get("maxAbsDb")
            if (
                isinstance(rmse, bool) or not isinstance(rmse, (int, float)) or not math.isfinite(float(rmse)) or
                isinstance(max_abs, bool) or not isinstance(max_abs, (int, float)) or not math.isfinite(float(max_abs))
            ):
                raise ValueError("capacity frontier metrics must be finite numbers")
            values.append(math.hypot(float(rmse), float(max_abs)))
        if values:
            qualities[cap] = min(values)
    if not qualities:
        raise ValueError("capacity diagnosis has no valid frontier points")

    def gain(left_cap: int, right_cap: int) -> float | None:
        left = qualities.get(left_cap)
        right = qualities.get(right_cap)
        if left is None or right is None or left <= 0:
            return None
        return (left - right) / left

    cap10_to_20 = gain(10, 20)
    cap20_to_40 = gain(20, 40)
    gains = [value for value in (cap10_to_20, cap20_to_40) if value is not None]
    return {
        "bestCap": min(qualities, key=lambda cap: (qualities[cap], cap)),
        "bestQuality": min(qualities.values()),
        "qualityByCap": {str(cap): qualities[cap] for cap in sorted(qualities)},
        "cap10To20GainFraction": cap10_to_20,
        "cap20To40GainFraction": cap20_to_40,
        "material": any(value > DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION for value in gains),
        "materialGainThreshold": DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION,
        "materialGainThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
    }


def aggregate_oracle_diagnosis_reports(
    reports: Sequence[Mapping[str, Any]],
    *,
    expected_case_ids: Sequence[str],
    repository_sha: str,
    frozen_control_sha: str,
    runtime: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    expected = tuple(sorted(expected_case_ids))
    if not expected or len(set(expected)) != len(expected):
        raise ValueError("expected diagnosis case IDs must be non-empty and unique")
    repository_sha = _non_empty_string(repository_sha, "diagnosis repository SHA")
    frozen_control_sha = _non_empty_string(frozen_control_sha, "diagnosis frozen control SHA")
    by_case: dict[str, Mapping[str, Any]] = {}
    for report in reports:
        if not isinstance(report, Mapping) or report.get("report") != ORACLE_DIAGNOSIS_REPORT or report.get("version") != 1:
            raise ValueError("diagnosis case report identity is invalid")
        case_id = _non_empty_string(report.get("caseId"), "diagnosis caseId")
        if case_id not in expected:
            raise ValueError(f"unexpected diagnosis case {case_id}")
        if case_id in by_case:
            raise ValueError(f"duplicate diagnosis case {case_id}")
        if report.get("repositorySha") != repository_sha:
            raise ValueError(f"diagnosis case {case_id} repository SHA mismatch")
        if report.get("frozenControlSha") != frozen_control_sha:
            raise ValueError(f"diagnosis case {case_id} frozen control SHA mismatch")
        by_case[case_id] = report
    missing = sorted(set(expected) - set(by_case))
    if missing:
        raise ValueError(f"missing diagnosis cases: {', '.join(missing)}")
    configs = [report.get("diagnosisConfig") for report in by_case.values()]
    diagnosis_config = None
    if all(isinstance(config, Mapping) for config in configs):
        serialized_configs = {json.dumps(config, sort_keys=True) for config in configs}
        if len(serialized_configs) != 1:
            raise ValueError("diagnosis case configuration mismatch")
        diagnosis_config = dict(configs[0])
    stage_artifacts: dict[str, Mapping[str, Any]] = {}
    historical_artifacts: dict[tuple[Any, ...], Mapping[str, Any]] = {}
    for report in by_case.values():
        provenance = report.get("provenance")
        if not isinstance(provenance, Mapping):
            continue
        stage_values = provenance.get("stageArtifacts")
        if isinstance(stage_values, Mapping):
            for stage, value in stage_values.items():
                if isinstance(value, Mapping):
                    stage_artifacts[str(stage)] = dict(value)
        historical_values = provenance.get("historicalArtifacts")
        if isinstance(historical_values, Sequence) and not isinstance(historical_values, (str, bytes)):
            for value in historical_values:
                if not isinstance(value, Mapping):
                    continue
                key = tuple(value.get(name) for name in ("provenance", "sourceSha", "sourceRunId", "sourceArtifactId"))
                historical_artifacts[key] = dict(value)
    return {
        "version": 1,
        "report": ORACLE_DIAGNOSIS_REPORT,
        "repositorySha": repository_sha,
        "frozenControlSha": frozen_control_sha,
        "caseIds": list(expected),
        "cases": [by_case[case_id] for case_id in expected],
        "provenance": {
            "stageArtifacts": {
                stage: stage_artifacts[stage]
                for stage in sorted(stage_artifacts)
            },
            "historicalArtifacts": [
                historical_artifacts[key]
                for key in sorted(historical_artifacts, key=repr)
            ],
        },
        "diagnosisConfig": diagnosis_config,
        "runtime": None if runtime is None else dict(runtime),
        "calibration": {
            "calibrationFrozen": False,
            "status": "insufficient",
            "rule": "OracleCalibrationManifestV1-existing-strict-rule",
        },
        "holdoutOpened": False,
        "productionBehaviorChanged": False,
    }


def write_json(path: str | Path, value: Any) -> None:
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _read_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _single_problem(path: str | Path, case_id: str) -> SolverLabProblem:
    problems = tuple(problem for problem in read_problems(path) if problem.problemId == case_id)
    if len(problems) != 1:
        raise ValueError(f"problem artifact must contain exactly one problem for {case_id}")
    return problems[0]


def _historical_metadata(path: str | None, source: Mapping[str, str]) -> dict[str, Any] | None:
    if path is None:
        return None
    metadata = _read_json(path)
    if not isinstance(metadata, Mapping):
        raise ValueError("historical metadata must be an object")
    if metadata.get("sha") != source["sourceSha"] or str(metadata.get("runId")) != source["sourceRunId"]:
        raise ValueError(f"historical metadata mismatch for {source['provenance']}")
    if "artifactId" in metadata and str(metadata["artifactId"]) != source["sourceArtifactId"]:
        raise ValueError(f"historical metadata artifact mismatch for {source['provenance']}")
    return dict(metadata)


def _historical_source(
    path: str,
    metadata_path: str | None,
    source_key: str,
    case_id: str,
) -> dict[str, Any]:
    source = HISTORICAL_SOURCE_PROVENANCE[source_key]
    metadata = _historical_metadata(metadata_path, source)
    selections = {
        case_id: {} if source_key == "v1" else {"budgetSeconds": 30, "geometryWarmStart": True}
    }
    artifact = historical_reference_artifact_from_results(
        _read_json(path),
        provenance=source["provenance"],
        source_sha=source["sourceSha"],
        source_run_id=source["sourceRunId"],
        source_artifact_id=source["sourceArtifactId"],
        selections=selections,
    )
    result: dict[str, Any] = {
        "artifact": artifact,
        "provenance": source["provenance"],
        "sourceSha": source["sourceSha"],
        "sourceRunId": source["sourceRunId"],
        "sourceArtifactId": source["sourceArtifactId"],
    }
    if metadata is not None:
        result["metadata"] = metadata
    return result


def _runtime_provenance() -> dict[str, str | None]:
    node_version: str | None = None
    node_path = shutil.which("node")
    if node_path is not None:
        completed = subprocess.run(
            [node_path, "--version"],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0:
            node_version = completed.stdout.strip()
    return {
        "pythonVersion": platform.python_version(),
        "nodeVersion": node_version,
        "platform": platform.platform(),
    }


def _run_case_command(args: argparse.Namespace) -> None:
    problem = _single_problem(args.problems, args.case_id)
    control_artifact = _read_json(args.control)
    stage_artifacts = {
        stage: _read_json(path)
        for stage, path in {
            "screen": args.screen,
            "confirm": args.confirm,
            "deep": args.deep,
        }.items()
    }
    historical_artifacts = [
        _historical_source(args.historical_coherent, args.historical_coherent_metadata, "coherent", args.case_id),
        _historical_source(args.historical_general, args.historical_general_metadata, "general", args.case_id),
        _historical_source(args.historical_v1, args.historical_v1_metadata, "v1", args.case_id),
    ]
    capacity_control_artifacts = None
    if (args.capacity_control_20 is None) != (args.capacity_control_40 is None):
        raise ValueError("capacity control artifacts for caps 20 and 40 must be supplied together")
    if args.capacity_control_20 is not None and args.capacity_control_40 is not None:
        capacity_control_artifacts = {
            10: control_artifact,
            20: _read_json(args.capacity_control_20),
            40: _read_json(args.capacity_control_40),
        }
    existing_calibration = None if args.existing_calibration is None else _read_json(args.existing_calibration)
    config = OracleDiagnosisConfig(
        repository_sha=args.repository_sha,
        frozen_control_sha=args.frozen_control_sha,
    )
    report = run_oracle_diagnosis_case(
        problem,
        control_artifact,
        stage_artifacts,
        historical_artifacts,
        CanonicalEvaluator(args.canonical_command),
        config=config,
        capacity_control_artifacts=capacity_control_artifacts,
        stage_sources=STAGE_PROVENANCE,
        existing_calibration=existing_calibration,
        runtime=_runtime_provenance(),
    )
    write_json(args.out, report)


def _run_aggregate_command(args: argparse.Namespace) -> None:
    reports = [_read_json(path) for path in args.reports]
    report = aggregate_oracle_diagnosis_reports(
        reports,
        expected_case_ids=args.expected_case_ids,
        repository_sha=args.repository_sha,
        frozen_control_sha=args.frozen_control_sha,
        runtime=_runtime_provenance(),
    )
    write_json(args.out, report)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the selective, research-only AutoEQ Oracle Diagnosis v2")
    subparsers = parser.add_subparsers(dest="command", required=True)

    case_parser = subparsers.add_parser("case")
    case_parser.add_argument("--problems", required=True)
    case_parser.add_argument("--case-id", choices=DIAGNOSIS_CASE_IDS, required=True)
    case_parser.add_argument("--control", required=True)
    case_parser.add_argument("--screen", required=True)
    case_parser.add_argument("--confirm", required=True)
    case_parser.add_argument("--deep", required=True)
    case_parser.add_argument("--historical-coherent", required=True)
    case_parser.add_argument("--historical-general", required=True)
    case_parser.add_argument("--historical-v1", required=True)
    case_parser.add_argument("--historical-coherent-metadata")
    case_parser.add_argument("--historical-general-metadata")
    case_parser.add_argument("--historical-v1-metadata")
    case_parser.add_argument("--capacity-control-20")
    case_parser.add_argument("--capacity-control-40")
    case_parser.add_argument("--existing-calibration")
    case_parser.add_argument("--repository-sha", required=True)
    case_parser.add_argument("--frozen-control-sha", required=True)
    case_parser.add_argument(
        "--canonical-command",
        default="pnpm --filter @autoeq-workbench/core research:lab --",
    )
    case_parser.add_argument("--out", required=True)
    case_parser.set_defaults(handler=_run_case_command)

    aggregate_parser = subparsers.add_parser("aggregate")
    aggregate_parser.add_argument("--reports", nargs="+", required=True)
    aggregate_parser.add_argument("--expected-case-ids", nargs="+", choices=DIAGNOSIS_CASE_IDS, required=True)
    aggregate_parser.add_argument("--repository-sha", required=True)
    aggregate_parser.add_argument("--frozen-control-sha", required=True)
    aggregate_parser.add_argument("--out", required=True)
    aggregate_parser.set_defaults(handler=_run_aggregate_command)

    args = parser.parse_args(argv)
    args.handler(args)


if __name__ == "__main__":
    main()
