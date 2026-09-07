from dataclasses import replace

import numpy as np
import pytest

from autoeq_solver_lab.continuous_oracle import (
    OracleRunConfig,
    build_continuous_cap_frontier,
    build_continuous_frontier,
    validate_exact_filter_counts,
)
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


def multi_filter_candidate(
    problem: SolverLabProblem,
    candidate_id: str,
    algorithm_id: str,
    count: int,
) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=candidate_id,
        algorithmId=algorithm_id,
        seed=11,
        filters=tuple(
            LabFilter(
                f"{candidate_id}-filter-{index}",
                True,
                "PK",
                100.0 + index * 100.0,
                1.0,
                1.0,
            )
            for index in range(count)
        ),
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
    assert len(evaluator.calls) == 2
    assert len(evaluator.calls[0]) == 2
    assert len(evaluator.calls[1]) == 1


class DominanceOptimizer(StubOptimizer):
    def __init__(self, algorithm_id: str, run_index: int, counters: dict[str, int]):
        super().__init__(algorithm_id, run_index)
        self.counters = counters

    def optimize(self, problem, layout, seed, objective_weights, evaluation_budget, initial_candidate=None):
        del layout, seed, objective_weights, evaluation_budget
        self.counters[self.algorithm_id] = self.counters.get(self.algorithm_id, 0) + 1
        if self.algorithm_id == "differential-evolution":
            return replace(fake_candidate(problem, self.algorithm_id, 100.0), candidateId="de-dominant")
        if self.algorithm_id == "cma-es":
            return replace(fake_candidate(problem, self.algorithm_id, 200.0), candidateId="cma-dominated")
        assert initial_candidate is not None
        return replace(
            initial_candidate,
            algorithmId="powell",
            candidateId=f"powell:{self.run_index}",
            filters=(LabFilter("powell-filter", True, "PK", 300.0, 1.0, 1.0),),
        )


class DominanceEvaluator(FakeCanonicalEvaluator):
    def evaluate(self, problem, candidates):
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        values = {
            "de-dominant": (0.1, 0.2),
            "cma-dominated": (0.2, 0.3),
        }
        results = []
        for candidate in candidates:
            rmse, max_abs = values.get(candidate.candidateId, (0.08, 0.25))
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


def test_continuous_oracle_powell_polishes_only_canonical_shortlist():
    counters: dict[str, int] = {}
    evaluator = DominanceEvaluator()
    frontier = build_continuous_frontier(
        problem(),
        OracleRunConfig(
            seeds=(11,),
            filter_counts=(1,),
            objective_weights=((1.0, 0.0),),
            evaluation_budget_per_run=10,
            polish_strategy="shortlist",
        ),
        evaluator,
        optimizer_factory=lambda algorithm_id, run_index: DominanceOptimizer(
            algorithm_id, run_index, counters
        ),
    )

    assert counters == {
        "differential-evolution": 3,
        "cma-es": 3,
        "powell": 1,
    }
    assert evaluator.calls[0] == ("de-dominant", "cma-dominated")
    assert evaluator.calls[1] == ("powell:6",)
    assert all(candidate.candidateId != "cma-dominated" for candidate in frontier)


class CapEvaluator:
    def __init__(self, values):
        self.values = values
        self.calls = []

    def evaluate(self, problem, candidates):
        del problem
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        return tuple(
            SolverLabEvaluation(
                protocolVersion=1,
                candidateId=candidate.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=CanonicalMetricSet(*self.values[candidate.candidateId], {}),
                deliverable=CanonicalMetricSet(*self.values[candidate.candidateId], {}),
                deliverableFilters=candidate.filters,
                cancellationTotalScore=0.0,
            )
            for candidate in candidates
        )


def test_continuous_cap_frontier_aggregates_exact_n_fronts_and_control():
    base_problem = problem()
    lab_problem = replace(base_problem, bounds={**base_problem.bounds, "maxFilters": 2})
    one_filter = multi_filter_candidate(lab_problem, "exact-1", "differential-evolution", 1)
    two_filters = multi_filter_candidate(lab_problem, "exact-2", "cma-es", 2)
    control = multi_filter_candidate(lab_problem, "control", "standard-v2-control", 1)
    evaluator = CapEvaluator({
        "exact-1": (0.4, 0.8),
        "exact-2": (0.2, 0.8),
        "control": (0.3, 0.7),
    })

    frontier = build_continuous_cap_frontier(
        lab_problem,
        ((one_filter,), (two_filters,)),
        2,
        evaluator,
        known_candidates=(control,),
    )

    assert {candidate.candidateId for candidate in frontier} == {"exact-2", "control"}
    assert all(len(candidate.filters) <= 2 for candidate in frontier)
    assert len(evaluator.calls) == 1
    assert set(evaluator.calls[0]) == {"exact-2", "control"}


def test_official_cap_requires_every_diagnostic_exact_n_front():
    assert validate_exact_filter_counts((1, 2, 3), 3) == (1, 2, 3)
    with pytest.raises(ValueError, match="exact filter counts"):
        validate_exact_filter_counts((1, 3), 3)
