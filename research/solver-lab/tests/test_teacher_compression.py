from dataclasses import replace
import math

import numpy as np
import pytest

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.metrics import error_metrics
from autoeq_solver_lab.quantization import quantize_filters
from autoeq_solver_lab.solvers.matching_pursuit import (
    DictionaryConfig,
    MatchingPursuitConfig,
)
from autoeq_solver_lab.teacher_compression import (
    TeacherCompressionConfig,
    TeacherCompressionSolver,
    choose_original_target_student,
    extract_teacher_regions,
    select_eligible_teachers,
    validate_teacher_candidate,
)
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    ObjectivePoint,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)
from autoeq_solver_lab.reference_snapshot import (
    OracleReferenceSnapshotV1,
    ReferenceCandidateV1,
    ReferenceCellV1,
)


def make_problem(max_filters: int = 40) -> SolverLabProblem:
    frequencies = np.geomspace(20, 20_000, 96)
    return SolverLabProblem(
        protocolVersion=1,
        problemId="teacher-case",
        inputSha256="a" * 64,
        sampleRateHz=48_000,
        frequenciesHz=tuple(float(value) for value in frequencies),
        desiredDb=tuple(float(value) for value in np.zeros(frequencies.size)),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20_000.0,
            "minGainDb": -12.0,
            "maxGainDb": 12.0,
            "minPkQ": 0.5,
            "maxPkQ": 4.0,
            "shelfQ": 0.7,
            "maxFilters": max_filters,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def filters(count: int, gain: float = 1.0) -> tuple[LabFilter, ...]:
    return tuple(
        LabFilter(f"teacher-{index}", True, "PK", 100 + index * 100, gain, 1.0)
        for index in range(count)
    )


def candidate(problem: SolverLabProblem, candidate_id: str, values: tuple[LabFilter, ...]) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=candidate_id,
        algorithmId="teacher",
        seed=11,
        filters=values,
    )


def evaluation(candidate_id: str, values: tuple[LabFilter, ...], rmse: float = 0.2) -> SolverLabEvaluation:
    metric = CanonicalMetricSet(rmse, rmse, {})
    return SolverLabEvaluation(
        protocolVersion=1,
        candidateId=candidate_id,
        valid=True,
        rejectionReason=None,
        continuous=metric,
        deliverable=metric,
        deliverableFilters=values,
        cancellationTotalScore=0.0,
    )


def snapshot(problem: SolverLabProblem, high_id: str, low_id: str) -> OracleReferenceSnapshotV1:
    high_filters = filters(11)
    low_filters = filters(2)
    high_reference = ReferenceCandidateV1(
        candidate_id=high_id,
        problem_id=problem.problemId,
        input_sha256=problem.inputSha256,
        max_filters=20,
        actual_delivered_filter_count=len(high_filters),
        filters=high_filters,
        canonical_rmse_db=0.2,
        canonical_max_abs_db=0.2,
        algorithm_id="teacher",
        seed=11,
        provenance="synthetic",
    )
    low_reference = ReferenceCandidateV1(
        candidate_id=low_id,
        problem_id=problem.problemId,
        input_sha256=problem.inputSha256,
        max_filters=10,
        actual_delivered_filter_count=len(low_filters),
        filters=low_filters,
        canonical_rmse_db=0.5,
        canonical_max_abs_db=0.5,
        algorithm_id="standard-v2-control",
        seed=None,
        provenance="synthetic",
    )
    return OracleReferenceSnapshotV1(
        version=1,
        created_from_repository_sha="b" * 40,
        corpus_version="synthetic",
        canonical_evaluator_version="synthetic",
        cells=(
            ReferenceCellV1(
                problem_id=problem.problemId,
                input_sha256=problem.inputSha256,
                max_filters=20,
                reference_state="stable-under-current-search",
                control_candidate_id=high_id,
                candidates=(high_reference,),
                deliverable_frontier_candidate_ids=(high_id,),
                continuous_diagnostic_frontier=(),
            ),
            ReferenceCellV1(
                problem_id=problem.problemId,
                input_sha256=problem.inputSha256,
                max_filters=10,
                reference_state="stable-under-current-search",
                control_candidate_id=low_id,
                candidates=(low_reference,),
                deliverable_frontier_candidate_ids=(low_id,),
                continuous_diagnostic_frontier=(),
            ),
        ),
        content_sha256="c" * 64,
    )


class SyntheticCanonicalEvaluator:
    def evaluate(self, active_problem, candidates):
        frequencies = np.asarray(active_problem.frequenciesHz, dtype=np.float64)
        desired = np.asarray(active_problem.desiredDb, dtype=np.float64)
        results = []
        for item in candidates:
            delivered = quantize_filters(item.filters, {
                **active_problem.bounds,
                "minQ": active_problem.bounds["minPkQ"],
                "maxQ": active_problem.bounds["maxPkQ"],
            })
            actual = cascade_response_db(frequencies, active_problem.sampleRateHz, delivered)
            rmse, max_abs = error_metrics(desired, actual)
            metric = CanonicalMetricSet(rmse, max_abs, {})
            results.append(SolverLabEvaluation(
                protocolVersion=1,
                candidateId=item.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=metric,
                deliverable=metric,
                deliverableFilters=delivered,
                cancellationTotalScore=0.0,
            ))
        return tuple(results)


def test_teacher_eligibility_requires_high_cap_delivered_frontier_identity():
    active_problem = make_problem()
    high = candidate(active_problem, "teacher-20", filters(11))
    high_eval = evaluation(high.candidateId, high.filters)
    active_snapshot = snapshot(active_problem, high.candidateId, "max10")

    selected = select_eligible_teachers(
        active_problem,
        active_snapshot,
        (high,),
        (high_eval,),
    )

    assert len(selected) == 1
    assert selected[0].max_filters == 20
    assert selected[0].candidate.filters == high_eval.deliverableFilters

    with pytest.raises(ValueError, match="continuous"):
        validate_teacher_candidate(
            active_problem,
            active_snapshot,
            high,
            replace(high_eval, deliverable=None),
        )

    with pytest.raises(ValueError, match="Max10"):
        validate_teacher_candidate(
            active_problem,
            active_snapshot,
            candidate(active_problem, "max10", filters(2)),
            evaluation("max10", filters(2)),
        )

    with pytest.raises(ValueError, match="problem"):
        validate_teacher_candidate(
            active_problem,
            active_snapshot,
            replace(high, problemId="other"),
            high_eval,
        )


def test_teacher_eligibility_uses_matching_high_cap_cell_when_id_is_reused():
    active_problem = make_problem()
    high = candidate(active_problem, "teacher-reused", filters(11))
    high_eval = evaluation(high.candidateId, high.filters)
    base_snapshot = snapshot(active_problem, high.candidateId, high.candidateId)
    higher_reference = replace(
        base_snapshot.cells[0].candidates[0],
        max_filters=40,
        actual_delivered_filter_count=12,
        filters=filters(12),
    )
    higher_cell = replace(
        base_snapshot.cells[0],
        max_filters=40,
        candidates=(higher_reference,),
        deliverable_frontier_candidate_ids=(high.candidateId,),
    )
    active_snapshot = replace(
        base_snapshot,
        cells=(base_snapshot.cells[0], higher_cell, base_snapshot.cells[1]),
    )

    eligible = validate_teacher_candidate(active_problem, active_snapshot, high, high_eval)

    assert eligible.max_filters == 20
    assert eligible.reference_candidate.actual_delivered_filter_count == 11


def test_teacher_regions_include_filters_and_uncovered_residual_extrema():
    active_problem = make_problem()
    teacher_filters = (
        LabFilter("low", True, "PK", 500, 4.0, 1.0),
    )
    desired = np.asarray(active_problem.desiredDb)
    regions = extract_teacher_regions(active_problem, teacher_filters, desired)

    assert regions[0].frequency_hz == 500
    assert regions[0].gain_sign == 1
    assert regions[0].type == "PK"
    assert all(region.frequency_hz > 0 for region in regions)


def test_compression_evaluates_student_against_original_target_and_respects_cap():
    active_problem = make_problem()
    teacher = candidate(active_problem, "teacher-20", filters(11))
    teacher_eval = evaluation(teacher.candidateId, teacher.filters)
    active_snapshot = snapshot(active_problem, teacher.candidateId, "max10")
    eligible = validate_teacher_candidate(active_problem, active_snapshot, teacher, teacher_eval)
    config = TeacherCompressionConfig(
        max_student_filters=2,
        matching_pursuit_config=MatchingPursuitConfig(
            dictionary=DictionaryConfig(pk_q_values=(0.5, 1.0, 2.0), include_shelves=False),
            max_filters=2,
            checkpoint_every_evaluations=1,
            nonlinear_polish_evaluations=0,
        ),
        nonlinear_polish_evaluations=0,
        structural_rounds=0,
    )

    result = TeacherCompressionSolver(config).compress(
        active_problem,
        eligible,
        reference_frontier=(),
        reference_snapshot_sha256="d" * 64,
        canonical_evaluator=SyntheticCanonicalEvaluator(),
    )

    assert result.teacher_candidate_id == teacher.candidateId
    assert result.teacher_max_filters == 20
    assert result.teacher_actual_delivered_filter_count == 11
    assert len(result.student.filters) <= 2
    assert result.student_evaluation.deliverable is not None
    assert result.operations == ()


def test_original_target_metrics_beat_teacher_imitation_as_selection_authority():
    active_problem = make_problem()
    student_a = candidate(active_problem, "student-a", filters(1))
    student_b = candidate(active_problem, "student-b", filters(1, -1.0))
    evaluations = (
        evaluation(student_a.candidateId, student_a.filters, rmse=0.8),
        evaluation(student_b.candidateId, student_b.filters, rmse=0.4),
    )

    selected = choose_original_target_student((student_a, student_b), evaluations)

    assert selected.candidateId == student_b.candidateId
