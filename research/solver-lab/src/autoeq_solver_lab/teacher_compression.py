"""Research-only compression of delivered high-cap teachers into Max10."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
import math

import numpy as np

from .canonical import CanonicalEvaluator
from .dsp import cascade_response_db
from .objectives import ContinuousVectorLayout
from .pareto import dominates, nondominated
from .quantization import quantize_filters
from .reference_regret import directed_reference_regret
from .reference_snapshot import OracleReferenceSnapshotV1, ReferenceCandidateV1, ReferenceCellV1
from .selector import SelectorPoint, select_reference_point
from .structural import generate_structural_mutations
from .types import (
    FilterType,
    LabFilter,
    ObjectivePoint,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)
from .solvers.matching_pursuit import (
    DictionaryConfig,
    MatchingPursuitConfig,
    MatchingPursuitSolver,
)


@dataclass(frozen=True)
class EligibleTeacher:
    candidate: SolverLabCandidate
    evaluation: SolverLabEvaluation
    max_filters: int
    reference_candidate: ReferenceCandidateV1


@dataclass(frozen=True)
class TeacherRegion:
    type: FilterType
    frequency_hz: float
    q: float
    gain_sign: int
    score: float
    source_id: str


@dataclass(frozen=True)
class TeacherCompressionConfig:
    max_student_filters: int
    matching_pursuit_config: MatchingPursuitConfig
    nonlinear_polish_evaluations: int
    structural_rounds: int

    def __post_init__(self) -> None:
        if isinstance(self.max_student_filters, bool) or not isinstance(self.max_student_filters, int):
            raise ValueError("max_student_filters must be an integer")
        if self.max_student_filters <= 0 or self.max_student_filters > 10:
            raise ValueError("max_student_filters must be between 1 and 10")
        if (
            isinstance(self.nonlinear_polish_evaluations, bool) or
            not isinstance(self.nonlinear_polish_evaluations, int) or
            self.nonlinear_polish_evaluations < 0
        ):
            raise ValueError("nonlinear_polish_evaluations must be non-negative")
        if (
            isinstance(self.structural_rounds, bool) or
            not isinstance(self.structural_rounds, int) or
            self.structural_rounds < 0
        ):
            raise ValueError("structural_rounds must be non-negative")
        if self.matching_pursuit_config.max_filters > self.max_student_filters:
            raise ValueError("matching pursuit max_filters exceeds max_student_filters")


@dataclass(frozen=True)
class CompressionResult:
    teacher_candidate_id: str
    teacher_max_filters: int
    teacher_actual_delivered_filter_count: int
    teacher_rmse_db: float
    teacher_max_abs_db: float
    student: SolverLabCandidate
    student_evaluation: SolverLabEvaluation
    max10_reference_regret: float
    reference_improved: bool
    operations: tuple[str, ...]


def _snapshot_cells(
    snapshot: OracleReferenceSnapshotV1,
    problem: SolverLabProblem,
) -> tuple[ReferenceCellV1, ...]:
    return tuple(
        cell for cell in snapshot.cells
        if cell.problem_id == problem.problemId and cell.input_sha256 == problem.inputSha256
    )


def validate_teacher_candidate(
    problem: SolverLabProblem,
    snapshot: OracleReferenceSnapshotV1,
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
) -> EligibleTeacher:
    if candidate.problemId != problem.problemId:
        raise ValueError("teacher candidate problemId does not match problem")
    if candidate.inputSha256 != problem.inputSha256:
        raise ValueError("teacher candidate inputSha256 does not match problem")
    if evaluation.candidateId != candidate.candidateId:
        raise ValueError("teacher evaluation candidateId does not match candidate")
    if not evaluation.valid or evaluation.deliverable is None:
        raise ValueError("teacher candidate must have canonical delivered metrics; continuous-only candidates are ineligible")
    cells = _snapshot_cells(snapshot, problem)
    max10_membership = any(
        candidate.candidateId in cell.deliverable_frontier_candidate_ids
        for cell in cells if cell.max_filters == 10
    )
    high_cells = [
        cell for cell in cells
        if cell.max_filters in (20, 40) and
        candidate.candidateId in cell.deliverable_frontier_candidate_ids
    ]
    if max10_membership and high_cells:
        max10_references = [
            (cell, next(
                (reference for reference in cell.candidates if reference.candidate_id == candidate.candidateId),
                None,
            ))
            for cell in cells if cell.max_filters == 10
        ]
        delivered_count = len(evaluation.deliverableFilters)
        is_max10_evaluation = any(
            reference is not None and
            reference.actual_delivered_filter_count == delivered_count and
            math.isclose(evaluation.deliverable.rmseDb, reference.canonical_rmse_db, rel_tol=0.0, abs_tol=1e-12) and
            math.isclose(evaluation.deliverable.maxAbsDb, reference.canonical_max_abs_db, rel_tol=0.0, abs_tol=1e-12)
            for _, reference in max10_references
        )
        if is_max10_evaluation:
            raise ValueError("Max10 candidates cannot be passed as high-cap teachers")
    if not high_cells:
        if max10_membership:
            raise ValueError("Max10 candidates cannot be passed as high-cap teachers")
        raise ValueError("teacher candidate is not in the delivered Max20/Max40 reference frontier")
    references_by_cell = [
        (cell, next(
            (reference for reference in cell.candidates if reference.candidate_id == candidate.candidateId),
            None,
        ))
        for cell in high_cells
    ]
    references_by_cell = [
        (cell, reference)
        for cell, reference in references_by_cell
        if reference is not None
    ]
    if not references_by_cell:
        raise ValueError("teacher candidate is absent from the reference cell")
    delivered_count = len(evaluation.deliverableFilters)
    count_matches = [
        (cell, reference)
        for cell, reference in references_by_cell
        if reference.actual_delivered_filter_count == delivered_count
    ]
    metric_matches = [
        (cell, reference)
        for cell, reference in count_matches
        if evaluation.deliverable is not None and
        math.isclose(evaluation.deliverable.rmseDb, reference.canonical_rmse_db, rel_tol=0.0, abs_tol=1e-12) and
        math.isclose(evaluation.deliverable.maxAbsDb, reference.canonical_max_abs_db, rel_tol=0.0, abs_tol=1e-12)
    ]
    matching = metric_matches or count_matches
    if not matching:
        if any(delivered_count > cell.max_filters for cell, _ in references_by_cell):
            raise ValueError("teacher delivered filter count exceeds the reference cell cap")
        raise ValueError("teacher delivered filter count does not match snapshot")
    cell, reference = max(matching, key=lambda item: item[0].max_filters)
    if delivered_count > cell.max_filters:
        raise ValueError("teacher delivered filter count exceeds the reference cell cap")
    normalized_candidate = replace(candidate, filters=tuple(evaluation.deliverableFilters))
    return EligibleTeacher(
        candidate=normalized_candidate,
        evaluation=evaluation,
        max_filters=cell.max_filters,
        reference_candidate=reference,
    )


def select_eligible_teachers(
    problem: SolverLabProblem,
    snapshot: OracleReferenceSnapshotV1,
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
) -> tuple[EligibleTeacher, ...]:
    evaluations_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    selected: list[EligibleTeacher] = []
    for candidate in candidates:
        evaluation = evaluations_by_id.get(candidate.candidateId)
        if evaluation is None:
            continue
        try:
            selected.append(validate_teacher_candidate(problem, snapshot, candidate, evaluation))
        except ValueError:
            continue
    return tuple(sorted(selected, key=lambda teacher: (teacher.max_filters, teacher.candidate.candidateId)))


def _residual_extrema(
    residual: np.ndarray,
    frequencies: np.ndarray,
) -> tuple[tuple[float, float], ...]:
    extrema: list[tuple[float, float]] = []
    for index, value in enumerate(residual):
        if (
            (index == 0 or abs(value) >= abs(residual[index - 1])) and
            (index == residual.size - 1 or abs(value) >= abs(residual[index + 1]))
        ):
            extrema.append((float(frequencies[index]), float(value)))
    return tuple(sorted(extrema, key=lambda item: (-abs(item[1]), item[0])))


def extract_teacher_regions(
    problem: SolverLabProblem,
    teacher_filters: Sequence[LabFilter],
    desired_db: Sequence[float],
) -> tuple[TeacherRegion, ...]:
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(desired_db, dtype=np.float64)
    if desired.ndim != 1 or desired.size != frequencies.size or not np.all(np.isfinite(desired)):
        raise ValueError("teacher region desired_db must match problem frequencies")
    regions: list[TeacherRegion] = []
    for filter_ in teacher_filters:
        if not filter_.enabled:
            continue
        regions.append(TeacherRegion(
            type=filter_.type,
            frequency_hz=filter_.frequencyHz,
            q=filter_.q,
            gain_sign=1 if filter_.gainDb > 0 else -1 if filter_.gainDb < 0 else 0,
            score=abs(filter_.gainDb),
            source_id=filter_.id,
        ))
    teacher_response = cascade_response_db(frequencies, problem.sampleRateHz, teacher_filters)
    residual = desired - teacher_response
    teacher_frequencies = tuple(region.frequency_hz for region in regions)
    q = math.sqrt(float(problem.bounds["minPkQ"]) * float(problem.bounds["maxPkQ"]))
    for frequency, residual_value in _residual_extrema(residual, frequencies):
        if any(abs(math.log2(frequency / existing)) <= 1 / 24 for existing in teacher_frequencies):
            continue
        regions.append(TeacherRegion(
            type="PK",
            frequency_hz=frequency,
            q=q,
            gain_sign=1 if residual_value > 0 else -1 if residual_value < 0 else 0,
            score=abs(residual_value),
            source_id=f"residual-{frequency:.12g}",
        ))
    return tuple(sorted(
        regions,
        key=lambda region: (-region.score, region.frequency_hz, region.source_id),
    ))


def choose_original_target_student(
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
) -> SolverLabCandidate:
    evaluations_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    points: list[SelectorPoint] = []
    by_id: dict[str, SolverLabCandidate] = {}
    for candidate in candidates:
        evaluation = evaluations_by_id.get(candidate.candidateId)
        if evaluation is None or not evaluation.valid or evaluation.deliverable is None:
            continue
        points.append(SelectorPoint(
            candidate_id=candidate.candidateId,
            rmse_db=evaluation.deliverable.rmseDb,
            max_abs_db=evaluation.deliverable.maxAbsDb,
            filter_count=len(evaluation.deliverableFilters),
        ))
        by_id[candidate.candidateId] = candidate
    if not points:
        raise ValueError("student selection requires at least one delivered evaluation")
    return by_id[select_reference_point(tuple(points)).candidate_id]


def _quantization_bounds(problem: SolverLabProblem) -> dict[str, float | int]:
    return {
        "minFrequencyHz": problem.bounds["minFrequencyHz"],
        "maxFrequencyHz": problem.bounds["maxFrequencyHz"],
        "minGainDb": problem.bounds["minGainDb"],
        "maxGainDb": problem.bounds["maxGainDb"],
        "minQ": problem.bounds["minPkQ"],
        "maxQ": problem.bounds["maxPkQ"],
        "shelfQ": problem.bounds["shelfQ"],
    }


def _evaluate(
    evaluator: CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
) -> SolverLabEvaluation:
    evaluations = evaluator.evaluate(problem, (candidate,)) if hasattr(evaluator, "evaluate") else evaluator(problem, (candidate,))
    if len(evaluations) != 1 or evaluations[0].candidateId != candidate.candidateId:
        raise ValueError("canonical evaluator returned an unexpected candidate")
    evaluation = evaluations[0]
    if not evaluation.valid or evaluation.deliverable is None:
        raise ValueError("canonical evaluator rejected compression candidate")
    return evaluation


def _point(candidate: SolverLabCandidate, evaluation: SolverLabEvaluation) -> ObjectivePoint:
    if evaluation.deliverable is None:
        raise ValueError("objective point requires delivered evaluation")
    return ObjectivePoint(
        candidate_id=candidate.candidateId,
        rmse_db=evaluation.deliverable.rmseDb,
        max_abs_db=evaluation.deliverable.maxAbsDb,
        filter_count=len(evaluation.deliverableFilters),
    )


def _should_admit(
    candidate: SolverLabCandidate,
    evaluation: SolverLabEvaluation,
    current: SolverLabCandidate,
    current_evaluation: SolverLabEvaluation,
) -> bool:
    candidate_point = _point(candidate, evaluation)
    current_point = _point(current, current_evaluation)
    if dominates(candidate_point, current_point):
        return True
    if dominates(current_point, candidate_point):
        return False
    selected = select_reference_point((
        SelectorPoint(candidate.candidateId, candidate_point.rmse_db, candidate_point.max_abs_db, candidate_point.filter_count),
        SelectorPoint(current.candidateId, current_point.rmse_db, current_point.max_abs_db, current_point.filter_count),
    ))
    return selected.candidate_id == candidate.candidateId


def _polish_candidate(
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
    evaluation_budget: int,
) -> SolverLabCandidate:
    if evaluation_budget <= 0 or not candidate.filters:
        return candidate
    from .optimizers.powell import PowellOptimizer

    type_order = {"LS": 0, "PK": 1, "HS": 2}
    ordered = tuple(sorted(candidate.filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz, filter_.id)))
    layout = ContinuousVectorLayout(len(ordered), tuple(filter_.type for filter_ in ordered))
    initial = replace(candidate, filters=ordered)
    polished = PowellOptimizer(0).optimize(
        problem,
        layout,
        candidate.seed if candidate.seed is not None else 0,
        (0.5, 0.5),
        evaluation_budget,
        initial_candidate=initial,
    )
    return replace(candidate, filters=polished.filters)


class TeacherCompressionSolver:
    algorithm_id = "teacher-compression-v1"

    def __init__(self, config: TeacherCompressionConfig) -> None:
        self.config = config

    def compress(
        self,
        problem: SolverLabProblem,
        teacher: EligibleTeacher,
        reference_frontier: Sequence[ObjectivePoint],
        reference_snapshot_sha256: str,
        canonical_evaluator: CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
    ) -> CompressionResult:
        if self.config.max_student_filters > problem.bounds["maxFilters"]:
            raise ValueError("max_student_filters exceeds problem maxFilters")
        regions = extract_teacher_regions(problem, teacher.candidate.filters, problem.desiredDb)
        preferred_frequencies = tuple(region.frequency_hz for region in regions)
        matching_config = self.config.matching_pursuit_config
        solver = MatchingPursuitSolver(matching_config, preferred_frequencies=preferred_frequencies)
        seed = teacher.candidate.seed if teacher.candidate.seed is not None else 0
        run_result = solver.run(
            problem,
            seed,
            max(1, matching_config.max_filters),
            reference_frontier,
            reference_snapshot_sha256,
            canonical_evaluator,
        )
        candidate_by_id = {candidate.candidateId: candidate for candidate in solver.last_candidate_sequence}
        if not run_result.trajectory:
            raise ValueError("matching pursuit returned an empty trajectory")
        current = candidate_by_id[run_result.trajectory[-1].candidate_id]
        current_evaluation = _evaluate(canonical_evaluator, problem, current)
        operations: list[str] = []
        quantization_bounds = _quantization_bounds(problem)
        frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
        desired = np.asarray(problem.desiredDb, dtype=np.float64)
        rng = np.random.default_rng(seed)

        for round_index in range(self.config.structural_rounds):
            actual = cascade_response_db(frequencies, problem.sampleRateHz, current.filters)
            residual = desired - actual
            proposals = generate_structural_mutations(
                problem,
                current.filters,
                residual,
                frequencies,
                rng,
            )
            ordered_proposals = sorted(
                proposals,
                key=lambda proposal: (
                    proposal.mutation.value,
                    tuple((filter_.type, filter_.frequencyHz, filter_.gainDb, filter_.q, filter_.id) for filter_ in proposal.filters),
                ),
            )
            proposal_candidates: list[SolverLabCandidate] = []
            for proposal_index, proposal in enumerate(ordered_proposals):
                if len(proposal.filters) > self.config.max_student_filters:
                    continue
                proposal_candidates.append(SolverLabCandidate(
                    protocolVersion=1,
                    problemId=problem.problemId,
                    inputSha256=problem.inputSha256,
                    candidateId=f"{self.algorithm_id}:{teacher.candidate.candidateId}:round-{round_index}:{proposal_index}",
                    algorithmId=self.algorithm_id,
                    seed=seed,
                    filters=quantize_filters(proposal.filters, quantization_bounds),
                ))
            if not proposal_candidates:
                continue
            candidate_proposals = [
                proposal
                for proposal in ordered_proposals
                if len(proposal.filters) <= self.config.max_student_filters
            ]
            proposal_evaluations = tuple(
                _evaluate(canonical_evaluator, problem, candidate)
                for candidate in proposal_candidates
            )
            best_index: int | None = None
            for index, evaluation in enumerate(proposal_evaluations):
                if _should_admit(proposal_candidates[index], evaluation, current, current_evaluation):
                    if best_index is None or _should_admit(
                        proposal_candidates[index],
                        evaluation,
                        proposal_candidates[best_index],
                        proposal_evaluations[best_index],
                    ):
                        best_index = index
            if best_index is not None:
                current = proposal_candidates[best_index]
                current_evaluation = proposal_evaluations[best_index]
                operations.append(candidate_proposals[best_index].mutation.value)

        if self.config.nonlinear_polish_evaluations > 0:
            polished = _polish_candidate(
                problem,
                current,
                self.config.nonlinear_polish_evaluations,
            )
            polished = replace(
                polished,
                candidateId=f"{self.algorithm_id}:{teacher.candidate.candidateId}:polish",
                algorithmId=self.algorithm_id,
                filters=quantize_filters(polished.filters, quantization_bounds),
            )
            polished_evaluation = _evaluate(canonical_evaluator, problem, polished)
            if _should_admit(polished, polished_evaluation, current, current_evaluation):
                current = polished
                current_evaluation = polished_evaluation
                operations.append("nonlinear-polish")

        regret_result = (
            directed_reference_regret(_point(current, current_evaluation), reference_frontier)
            if reference_frontier
            else None
        )
        return CompressionResult(
            teacher_candidate_id=teacher.candidate.candidateId,
            teacher_max_filters=teacher.max_filters,
            teacher_actual_delivered_filter_count=len(teacher.evaluation.deliverableFilters),
            teacher_rmse_db=teacher.evaluation.deliverable.rmseDb if teacher.evaluation.deliverable is not None else float("inf"),
            teacher_max_abs_db=teacher.evaluation.deliverable.maxAbsDb if teacher.evaluation.deliverable is not None else float("inf"),
            student=current,
            student_evaluation=current_evaluation,
            max10_reference_regret=regret_result.regret if regret_result is not None else 0.0,
            reference_improved=regret_result.reference_improved if regret_result is not None else False,
            operations=tuple(operations),
        )


__all__ = [
    "CompressionResult",
    "DictionaryConfig",
    "EligibleTeacher",
    "MatchingPursuitConfig",
    "TeacherCompressionConfig",
    "TeacherCompressionSolver",
    "TeacherRegion",
    "choose_original_target_student",
    "extract_teacher_regions",
    "select_eligible_teachers",
    "validate_teacher_candidate",
]
