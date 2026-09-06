import numpy as np

from autoeq_solver_lab.deliverable_oracle import (
    DeliverableOracleConfig,
    build_deliverable_frontier,
)
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


def problem() -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="deliverable-problem",
        inputSha256="1" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0, 2000.0),
        desiredDb=(0.0, 1.0, 0.0),
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


class FakeCanonicalEvaluator:
    def __init__(self):
        self.calls = []

    def evaluate(self, problem, candidates):
        del problem
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        metric = CanonicalMetricSet(0.2, 0.3, {})
        return tuple(SolverLabEvaluation(
            protocolVersion=1,
            candidateId=candidate.candidateId,
            valid=True,
            rejectionReason=None,
            continuous=metric,
            deliverable=metric,
            deliverableFilters=candidate.filters,
            cancellationTotalScore=0.0,
        ) for candidate in candidates)


def test_deliverable_oracle_retains_plain_quantization_in_canonical_archive():
    lab_problem = problem()
    continuous_seed = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="continuous-seed",
        algorithmId="continuous",
        seed=11,
        filters=(LabFilter("seed-filter", True, "PK", 1000.24, 1.24, 1.236),),
    )
    evaluator = FakeCanonicalEvaluator()

    frontier = build_deliverable_frontier(
        lab_problem,
        (continuous_seed,),
        DeliverableOracleConfig(seed=41, generations=1, evaluation_budget=20),
        evaluator,
    )

    assert any(
        len(candidate.filters) == 1 and
        candidate.filters[0].frequencyHz == 1000 and
        candidate.filters[0].gainDb == 1.2 and
        candidate.filters[0].q == 1.24
        for candidate in frontier
    )
    assert evaluator.calls
