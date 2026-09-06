from dataclasses import replace

import numpy as np

from autoeq_solver_lab.continuous_oracle import OracleRunConfig, build_continuous_frontier
from autoeq_solver_lab.objectives import ContinuousVectorLayout
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
        problemId="continuous-problem",
        inputSha256="e" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0),
        desiredDb=(0.0, 0.0),
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


def fake_candidate(problem: SolverLabProblem, algorithm_id: str, frequency: float) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=f"{algorithm_id}:candidate",
        algorithmId=algorithm_id,
        seed=11,
        filters=(LabFilter(f"{algorithm_id}-filter", True, "PK", frequency, 1.0, 1.0),),
    )


class StubOptimizer:
    def __init__(self, algorithm_id: str, run_index: int):
        self.algorithm_id = algorithm_id
        self.run_index = run_index

    def optimize(self, problem, layout, seed, objective_weights, evaluation_budget, initial_candidate=None):
        del layout, seed, objective_weights, evaluation_budget
        if self.algorithm_id == "differential-evolution":
            return fake_candidate(problem, self.algorithm_id, 100.0)
        if self.algorithm_id == "cma-es":
            return fake_candidate(problem, self.algorithm_id, 200.0)
        assert initial_candidate is not None
        return replace(
            initial_candidate,
            algorithmId=self.algorithm_id,
            candidateId=f"powell:{self.run_index}",
            filters=(LabFilter("powell-filter", True, "PK", 300.0, 1.0, 1.0),),
        )


class FakeCanonicalEvaluator:
    def __init__(self):
        self.calls = []

    def evaluate(self, problem, candidates):
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        values = {
            "differential-evolution": (0.1, 0.3),
            "cma-es": (0.2, 0.2),
            "powell": (0.3, 0.4),
        }
        results = []
        for candidate in candidates:
            rmse, max_abs = values[candidate.algorithmId]
            metric = CanonicalMetricSet(rmse, max_abs, {})
            results.append(SolverLabEvaluation(
                protocolVersion=1,
                candidateId=candidate.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=metric,
                deliverable=metric,
                deliverableFilters=candidate.filters,
                cancellationTotalScore=0.0,
            ))
        return tuple(results)


def test_continuous_frontier_keeps_only_canonically_validated_nondominated_points():
    evaluator = FakeCanonicalEvaluator()
    frontier = build_continuous_frontier(
        problem(),
        OracleRunConfig(
            seeds=(11,),
            filter_counts=(1,),
            objective_weights=((1.0, 0.0),),
            evaluation_budget_per_run=10,
        ),
        evaluator,
        optimizer_factory=lambda algorithm_id, run_index: StubOptimizer(algorithm_id, run_index),
    )

    assert {candidate.algorithmId for candidate in frontier} == {
        "differential-evolution", "cma-es"
    }
    assert len(evaluator.calls) == 1
    assert len(evaluator.calls[0]) == 3
