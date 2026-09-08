from dataclasses import replace
import json
import pytest

from autoeq_solver_lab.deliverable_oracle import (
    DeliverableOracleConfig,
    _load_known_deliverable_candidates,
    _powell_neighbor,
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


class FilterCountEvaluator:
    def __init__(self, *, improving: bool):
        self.improving = improving
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
                continuous=CanonicalMetricSet(
                    (1.0 / (1 + len(candidate.filters))) if self.improving else (1.0 if len(candidate.filters) == 1 else 10.0 + len(candidate.filters)),
                    (1.0 / (1 + len(candidate.filters))) if self.improving else (1.0 if len(candidate.filters) == 1 else 10.0 + len(candidate.filters)),
                    {},
                ),
                deliverable=CanonicalMetricSet(
                    (1.0 / (1 + len(candidate.filters))) if self.improving else (1.0 if len(candidate.filters) == 1 else 10.0 + len(candidate.filters)),
                    (1.0 / (1 + len(candidate.filters))) if self.improving else (1.0 if len(candidate.filters) == 1 else 10.0 + len(candidate.filters)),
                    {},
                ),
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


def test_powell_neighbor_returns_the_quantized_polished_candidate(monkeypatch):
    lab_problem = problem()
    seed = control_candidate(lab_problem)
    polished = replace(
        seed,
        candidateId="powell-raw",
        algorithmId="powell",
        filters=(replace(seed.filters[0], frequencyHz=1000.6, gainDb=1.26, q=1.236),),
    )
    budgets = []
    def fake_optimize(*args, **kwargs):
        budgets.append(args[5] if len(args) > 5 else kwargs["evaluation_budget"])
        return polished
    monkeypatch.setattr(
        "autoeq_solver_lab.deliverable_oracle.PowellOptimizer.optimize",
        fake_optimize,
    )

    candidate = _powell_neighbor(
        lab_problem,
        seed,
        DeliverableOracleConfig(
            seed=41,
            generations=1,
            evaluation_budget=20,
            polish_evaluation_budget=7,
        ),
        3,
    )

    assert candidate is not None
    assert candidate.candidateId == "deliverable-oracle:deliverable-problem:41:powell:3"
    assert candidate.filters[0].frequencyHz == 1001
    assert candidate.filters[0].gainDb == 1.3
    assert candidate.filters[0].q == 1.24
    assert budgets == [7]


def test_recovery_prioritizes_residual_structural_growth_when_candidate_budget_is_tight():
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 4})
    seed = control_candidate(lab_problem)

    frontier = build_deliverable_frontier(
        lab_problem,
        (seed,),
        DeliverableOracleConfig(
            seed=41,
            generations=1,
            evaluation_budget=2,
            max_parents=1,
            polish_evaluation_budget=5,
        ),
        FilterCountEvaluator(improving=True),
        search_mode="recovery",
    )

    assert max(len(candidate.filters) for candidate in frontier) == 2


def test_known_deliverable_loader_selects_only_the_exact_case_and_cap(tmp_path):
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 20})
    known = control_candidate(lab_problem, "known-delivered")
    artifact = tmp_path / "deliverable.json"
    artifact.write_text(json.dumps({
        "frontiers": [
            {
                "problemId": lab_problem.problemId,
                "frontierType": "maxFilters",
                "maxFilters": 20,
                "points": [{"candidate": {
                    "protocolVersion": known.protocolVersion,
                    "problemId": known.problemId,
                    "inputSha256": known.inputSha256,
                    "candidateId": known.candidateId,
                    "algorithmId": known.algorithmId,
                    "seed": known.seed,
                    "filters": [vars(filter_) for filter_ in known.filters],
                }}],
            },
            {"problemId": lab_problem.problemId, "frontierType": "maxFilters", "maxFilters": 40, "points": []},
        ],
    }))

    loaded = _load_known_deliverable_candidates((str(artifact),), lab_problem, 20)

    assert [candidate.candidateId for candidate in loaded] == ["known-delivered"]


def test_recovery_mode_continues_residual_growth_after_the_first_expansion():
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 4})
    seed = control_candidate(lab_problem)
    evaluator = FilterCountEvaluator(improving=True)
    audit = {}

    frontier = build_deliverable_frontier(
        lab_problem,
        (seed,),
        DeliverableOracleConfig(seed=41, generations=3, evaluation_budget=200, max_parents=1),
        evaluator,
        search_mode="recovery",
        audit=audit,
    )

    assert max(len(candidate.filters) for candidate in frontier) >= 4
    assert audit["generationsExecuted"] == 3
    assert audit["maxProposedFilterCount"] >= 4
    assert audit["stopReason"] == "generation-budget"
    assert audit["capacityUnusedReason"] == "capacity-fully-used"
    assert audit["schedulerRunnableStates"] > 0
    assert audit["noMutationRemainedAdmissible"] is False


def test_recovery_mode_does_not_retain_worse_capacity_only_candidates():
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 4})
    seed = control_candidate(lab_problem)
    evaluator = FilterCountEvaluator(improving=False)
    audit = {}

    frontier = build_deliverable_frontier(
        lab_problem,
        (seed,),
        DeliverableOracleConfig(seed=41, generations=3, evaluation_budget=200, max_parents=1),
        evaluator,
        search_mode="recovery",
        audit=audit,
    )

    assert max(len(candidate.filters) for candidate in frontier) == 1
    assert audit["capacityUnusedReason"] == "capacity-unused-no-improving-proposal-found"
    assert audit["officialFrontierCount"] == 1
    assert audit["candidateEvaluations"] > 1


def test_recovery_mode_honors_max64_without_using_actual_delivered_count_as_cap():
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 64})
    seed_filters = tuple(
        replace(control_candidate(lab_problem).filters[0], id=f"control-{index}")
        for index in range(2)
    )
    seed = replace(control_candidate(lab_problem), filters=seed_filters)
    audit = {}

    build_deliverable_frontier(
        lab_problem,
        (seed,),
        DeliverableOracleConfig(seed=41, generations=1, evaluation_budget=200, max_parents=1),
        FilterCountEvaluator(improving=True),
        search_mode="recovery",
        audit=audit,
        max_filters=64,
    )

    assert audit["maxFilters"] == 64
    assert audit["capacityAtInitialParent"] == 62
    assert audit["implicitActualDeliveredFilterCountCap"] is False
