import numpy as np

from autoeq_solver_lab.diagnosis import (
    alternative_de_search,
    select_deliverable_frontier,
)
from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.objectives import enumerate_oracle_layouts
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


def one_peak_problem() -> SolverLabProblem:
    frequencies = np.asarray([100.0, 250.0, 500.0, 750.0, 1000.0, 1500.0, 2000.0, 4000.0])
    target_filter = LabFilter("target", True, "PK", 1000.0, 6.0, 2.0)
    desired = cascade_response_db(frequencies, 48000.0, (target_filter,))
    return SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-diagnosis-search",
        inputSha256="e" * 64,
        sampleRateHz=48000,
        frequenciesHz=tuple(frequencies.tolist()),
        desiredDb=tuple(desired.tolist()),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": 1,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def candidate(problem: SolverLabProblem, candidate_id: str) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=candidate_id,
        algorithmId="test",
        seed=None,
        filters=(LabFilter(candidate_id, True, "PK", 1000.0, 1.0, 1.0),),
    )


def evaluation(candidate_id: str, rmse: float, max_abs: float) -> SolverLabEvaluation:
    metrics = CanonicalMetricSet(rmse, max_abs, {})
    return SolverLabEvaluation(
        protocolVersion=1,
        candidateId=candidate_id,
        valid=True,
        rejectionReason=None,
        continuous=metrics,
        deliverable=metrics,
        deliverableFilters=(LabFilter(candidate_id, True, "PK", 1000.0, 1.0, 1.0),),
        cancellationTotalScore=0.0,
    )


def test_deliverable_frontier_keeps_tradeoffs_and_removes_dominated_points():
    problem = one_peak_problem()
    candidates = (
        candidate(problem, "balanced"),
        candidate(problem, "low-rmse"),
        candidate(problem, "dominated"),
    )
    evaluations = (
        evaluation("balanced", 0.8, 2.0),
        evaluation("low-rmse", 0.6, 3.0),
        evaluation("dominated", 0.9, 3.2),
    )

    frontier = select_deliverable_frontier(candidates, evaluations)

    assert tuple(item.candidateId for item in frontier) == ("balanced", "low-rmse")


def test_alternative_de_search_is_seeded_deterministic_and_labels_objective_family():
    problem = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]

    first = alternative_de_search(
        problem,
        layout,
        seed=29,
        evaluation_budget=40,
        objective_family="tchebycheff",
        objective_parameter=(0.5, 0.5),
        run_index=3,
    )
    second = alternative_de_search(
        problem,
        layout,
        seed=29,
        evaluation_budget=40,
        objective_family="tchebycheff",
        objective_parameter=(0.5, 0.5),
        run_index=3,
    )

    assert first == second
    assert first.algorithmId == "diagnosis-de-tchebycheff"
    assert first.candidateId.startswith("diagnosis-de-tchebycheff:synthetic-diagnosis-search:29:1:3")
    assert len(first.filters) == 1
