from dataclasses import replace

import numpy as np

from autoeq_solver_lab.solvers.structural_beam import (
    BeamState,
    StructuralBeamConfig,
    StructuralBeamSeed,
    StructuralBeamSolver,
    STRUCTURAL_BEAM_VARIANTS,
    order_structural_proposals,
    retain_pareto_beam,
)
from autoeq_solver_lab.structural import StructuralMutation, StructuralProposal
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


def problem() -> SolverLabProblem:
    frequencies = np.geomspace(20, 20_000, 48)
    return SolverLabProblem(
        protocolVersion=1,
        problemId="beam-case",
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
            "maxFilters": 10,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def candidate(candidate_id: str, problem_value: SolverLabProblem) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem_value.problemId,
        inputSha256=problem_value.inputSha256,
        candidateId=candidate_id,
        algorithmId="beam",
        seed=11,
        filters=(),
    )


def state(candidate_id: str, rmse: float, max_abs: float, problem_value: SolverLabProblem) -> BeamState:
    item = candidate(candidate_id, problem_value)
    metric = CanonicalMetricSet(rmse, max_abs, {})
    return BeamState(
        candidate=item,
        evaluation=SolverLabEvaluation(
            protocolVersion=1,
            candidateId=candidate_id,
            valid=True,
            rejectionReason=None,
            continuous=metric,
            deliverable=metric,
            deliverableFilters=(),
            cancellationTotalScore=0.0,
        ),
        origin="fresh",
    )


def test_pareto_retention_precedes_selector_trimming():
    active_problem = problem()
    states = (
        state("rmse", 0.2, 1.0, active_problem),
        state("max-abs", 1.0, 0.2, active_problem),
        state("dominated", 1.0, 1.0, active_problem),
    )

    retained = retain_pareto_beam(states, beam_width=4)

    assert [item.candidate.candidateId for item in retained] == ["rmse", "max-abs"]


def test_structural_proposals_are_sorted_by_mutation_and_canonical_filters():
    active_problem = problem()
    seed_filter = LabFilter("seed", True, "PK", 1_000, 1.0, 1.0)
    proposals = order_structural_proposals((
        StructuralProposal(StructuralMutation.REMOVE, ()),
        StructuralProposal(StructuralMutation.ADD_PK, (seed_filter,)),
    ))

    assert [proposal.mutation.value for proposal in proposals] == sorted(
        proposal.mutation.value for proposal in proposals
    )
    assert proposals == order_structural_proposals(proposals)


def test_seed_origins_survive_beam_admission():
    active_problem = problem()
    seed_filter = LabFilter("seed", True, "PK", 1_000, 1.0, 1.0)
    seeds = (
        StructuralBeamSeed("mp", "matching-pursuit", (seed_filter,)),
        StructuralBeamSeed("teacher", "teacher-compression", (seed_filter,)),
    )
    solver = StructuralBeamSolver(STRUCTURAL_BEAM_VARIANTS["beam-4"])

    result = solver.run(
        active_problem,
        seed=11,
        evaluation_budget=4,
        reference_frontier=(),
        reference_snapshot_sha256="b" * 64,
        canonical_evaluator=lambda _problem, candidates: tuple(
            SolverLabEvaluation(
                protocolVersion=1,
                candidateId=item.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=CanonicalMetricSet(0.1, 0.1, {}),
                deliverable=CanonicalMetricSet(0.1, 0.1, {}),
                deliverableFilters=item.filters,
                cancellationTotalScore=0.0,
            )
            for item in candidates
        ),
        seeds=seeds,
    )

    assert {item.origin for item in result.states} >= {
        "zero",
        "matching-pursuit",
        "teacher-compression",
    }
