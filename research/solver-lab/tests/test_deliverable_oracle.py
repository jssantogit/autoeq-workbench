from dataclasses import replace
import pytest

from autoeq_solver_lab.deliverable_oracle import (
    DeliverableOracleConfig,
    build_deliverable_frontier,
)
from autoeq_solver_lab.pareto import normalized_regret
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    ObjectivePoint,
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
    second_seed = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="continuous-seed-2",
        algorithmId="continuous",
        seed=29,
        filters=(LabFilter("seed-filter-2", True, "PK", 1500.24, 1.24, 1.236),),
    )
    evaluator = FakeCanonicalEvaluator()

    frontier = build_deliverable_frontier(
        lab_problem,
        (continuous_seed, second_seed),
        DeliverableOracleConfig(seed=41, generations=1, evaluation_budget=20, max_parents=2),
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
    assert all(len(call) == len(set(call)) for call in evaluator.calls)
    assert any(candidate.algorithmId == "continuous" for candidate in frontier)


def control_candidate(lab_problem: SolverLabProblem, candidate_id: str = "control") -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId=candidate_id,
        algorithmId="standard-v2-control",
        seed=None,
        filters=(LabFilter("control-filter", True, "PK", 1000.0, 1.0, 1.0),),
    )


class MappingEvaluator:
    def __init__(self, metrics):
        self.metrics = metrics
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
                continuous=CanonicalMetricSet(*self.metrics.get(candidate.algorithmId, (0.9, 0.9)), {}),
                deliverable=CanonicalMetricSet(*self.metrics.get(candidate.algorithmId, (0.9, 0.9)), {}),
                deliverableFilters=candidate.filters,
                cancellationTotalScore=0.0,
            )
            for candidate in candidates
        )


def test_best_known_deliverable_frontier_keeps_control_when_oracle_candidates_are_weaker():
    lab_problem = problem()
    control = control_candidate(lab_problem)
    weak = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="weak-seed",
        algorithmId="continuous-to-quantized",
        seed=11,
        filters=(LabFilter("weak-filter", True, "PK", 1200.0, 1.0, 1.0),),
    )

    frontier = build_deliverable_frontier(
        lab_problem,
        (weak,),
        DeliverableOracleConfig(seed=41, generations=0, evaluation_budget=20),
        MappingEvaluator({"standard-v2-control": (0.1, 0.2), "continuous-to-quantized": (0.4, 0.8)}),
        known_deliverable_candidates=(control,),
    )

    assert [candidate.algorithmId for candidate in frontier] == ["standard-v2-control"]


def test_best_known_deliverable_frontier_drops_control_when_oracle_candidate_dominates():
    lab_problem = problem()
    control = control_candidate(lab_problem)
    stronger = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="strong-seed",
        algorithmId="continuous-to-quantized",
        seed=11,
        filters=(LabFilter("strong-filter", True, "PK", 1200.0, 1.0, 1.0),),
    )
    evaluator = MappingEvaluator({"standard-v2-control": (0.4, 0.8), "continuous-to-quantized": (0.1, 0.2)})

    frontier = build_deliverable_frontier(
        lab_problem,
        (stronger,),
        DeliverableOracleConfig(seed=41, generations=0, evaluation_budget=20),
        evaluator,
        known_deliverable_candidates=(control,),
    )

    assert [candidate.algorithmId for candidate in frontier] == ["continuous-to-quantized"]
    regret = normalized_regret(
        ObjectivePoint("control", 0.4, 0.8, 1),
        (ObjectivePoint("strong", 0.1, 0.2, 1),),
    )
    assert regret > 0


def test_deliverable_oracle_rejects_seed_over_cap_before_canonical_evaluation():
    lab_problem = problem()
    lab_problem = replace(lab_problem, bounds={**lab_problem.bounds, "maxFilters": 2})
    over_cap = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="over-cap",
        algorithmId="continuous-to-quantized",
        seed=11,
        filters=(
            LabFilter("filter-a", True, "PK", 1000.0, 1.0, 1.0),
            LabFilter("filter-b", True, "PK", 1500.0, 1.0, 1.0),
        ),
    )

    with pytest.raises(ValueError, match="maxFilters"):
        build_deliverable_frontier(
            lab_problem,
            (over_cap,),
            DeliverableOracleConfig(seed=41, generations=0, evaluation_budget=20),
            MappingEvaluator({}),
            max_filters=1,
        )
