from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest
from autoeq_solver_lab.io import serialize_candidate, serialize_evaluation
from autoeq_solver_lab.oracle_diagnosis import (
    OracleDiagnosisConfig,
    aggregate_oracle_diagnosis_reports,
    build_alternative_objectives,
    canonically_evaluate_reference,
    compare_existing_stage_frontiers,
    frontier_extension_evidence,
    historical_reference_artifact_from_results,
    recover_historical_reference,
    run_capacity_diagnosis,
    run_control_seeded_refinement,
    run_known_good_recovery,
    run_oracle_diagnosis_case,
    summarize_capacity_frontiers,
)
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


def _problem(max_filters: int = 10) -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="case-a",
        inputSha256="a" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0),
        desiredDb=(0.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20_000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": max_filters,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def _historical_filter() -> dict[str, object]:
    return {
        "id": "autoeq-1",
        "enabled": True,
        "type": "PK",
        "frequencyHz": 1000.0,
        "gainDb": -4.0,
        "q": 3.0,
    }


def test_historical_reference_artifact_preserves_exact_filters_and_provenance() -> None:
    artifact = historical_reference_artifact_from_results(
        [{
            "caseId": "case-a",
            "budgetSeconds": 30,
            "geometryWarmStart": True,
            "repeatIndex": 0,
            "filters": [_historical_filter()],
            "final": {"rmseDb": 0.8, "maxAbsDb": 2.0},
        }],
        provenance="reference:coherent-warm-start",
        source_sha="d" * 40,
        source_run_id="33987922969",
        source_artifact_id="9975764396",
        selections={"case-a": {"budgetSeconds": 30, "geometryWarmStart": True}},
    )

    recovered = recover_historical_reference(
        _problem(),
        artifact,
        expected_source_sha="d" * 40,
        expected_run_id="33987922969",
        expected_artifact_id="9975764396",
    )

    assert recovered["status"] == "recovered"
    assert recovered["candidate"].filters[0] == LabFilter(
        "reference-1", True, "PK", 1000.0, -4.0, 3.0
    )
    assert recovered["provenance"] == "reference:coherent-warm-start"


def test_historical_reference_without_exact_filter_vector_is_unavailable() -> None:
    artifact = historical_reference_artifact_from_results(
        [{"caseId": "case-a", "budgetSeconds": 30, "geometryWarmStart": True}],
        provenance="reference:standard-v1",
        source_sha="e" * 40,
        source_run_id="33960904540",
        source_artifact_id="9967947984",
        selections={"case-a": {"budgetSeconds": 30}},
    )

    recovered = recover_historical_reference(
        _problem(),
        artifact,
        expected_source_sha="e" * 40,
        expected_run_id="33960904540",
        expected_artifact_id="9967947984",
    )

    assert recovered == {
        "status": "unavailable",
        "reason": "exact-filter-vector-not-recoverable",
        "provenance": "reference:standard-v1",
        "sourceRunId": "33960904540",
        "sourceArtifactId": "9967947984",
        "sourceSha": "e" * 40,
    }


def test_malformed_historical_filter_is_rejected_instead_of_reconstructed() -> None:
    malformed = {**_historical_filter(), "type": "not-a-filter"}

    with pytest.raises(ValueError, match="unsupported filter type"):
        historical_reference_artifact_from_results(
            [{"caseId": "case-a", "filters": [malformed]}],
            provenance="reference:coherent-warm-start",
            source_sha="d" * 40,
            source_run_id="33987922969",
            source_artifact_id="9975764396",
            selections={"case-a": {}},
        )


def test_capacity_frontier_summary_reports_pairwise_gain_and_best_cap() -> None:
    summary = summarize_capacity_frontiers({
        10: [{"candidateId": "cap10", "rmseDb": 1.2, "maxAbsDb": 4.0}],
        20: [{"candidateId": "cap20", "rmseDb": 0.8, "maxAbsDb": 3.0}],
        40: [{"candidateId": "cap40", "rmseDb": 0.78, "maxAbsDb": 2.95}],
    })

    assert summary["bestCap"] == 40
    assert summary["cap10To20GainFraction"] > 0.2
    assert summary["cap20To40GainFraction"] < 0.05
    assert summary["material"] is True


def test_diagnosis_report_aggregation_is_sorted_and_rejects_sha_mismatch() -> None:
    report_a = {
        "version": 1,
        "report": "OracleDiagnosisReportV1",
        "repositorySha": "f" * 40,
        "frozenControlSha": "c" * 40,
        "caseId": "case-a",
    }
    report_b = {**report_a, "caseId": "case-b"}

    first = aggregate_oracle_diagnosis_reports(
        [report_b, report_a],
        expected_case_ids=("case-b", "case-a"),
        repository_sha="f" * 40,
        frozen_control_sha="c" * 40,
    )
    second = aggregate_oracle_diagnosis_reports(
        [report_a, report_b],
        expected_case_ids=("case-a", "case-b"),
        repository_sha="f" * 40,
        frozen_control_sha="c" * 40,
    )

    assert first["caseIds"] == ["case-a", "case-b"]
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    with pytest.raises(ValueError, match="repository SHA"):
        aggregate_oracle_diagnosis_reports(
            [report_a],
            expected_case_ids=("case-a",),
            repository_sha="0" * 40,
            frozen_control_sha="c" * 40,
        )


def _candidate(problem: SolverLabProblem, candidate_id: str, algorithm_id: str) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=candidate_id,
        algorithmId=algorithm_id,
        seed=None,
        filters=(LabFilter("filter-1", True, "PK", 1000.0, 0.0, 1.0),),
    )


def _evaluation(candidate_id: str, rmse: float, max_abs: float) -> SolverLabEvaluation:
    metric = CanonicalMetricSet(rmse, max_abs, {})
    return SolverLabEvaluation(
        protocolVersion=1,
        candidateId=candidate_id,
        valid=True,
        rejectionReason=None,
        continuous=metric,
        deliverable=metric,
        deliverableFilters=(),
        cancellationTotalScore=0.0,
    )


class _ReferenceEvaluator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, ...]] = []

    def evaluate(self, problem: SolverLabProblem, candidates: tuple[SolverLabCandidate, ...]):
        del problem
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        return tuple(_evaluation(candidate.candidateId, 0.25, 0.5) for candidate in candidates)


def test_reference_candidate_is_canonically_evaluated_before_comparison() -> None:
    problem = _problem()
    candidate = _candidate(problem, "reference:case-a", "reference:coherent-warm-start")
    evaluator = _ReferenceEvaluator()

    result = canonically_evaluate_reference(
        {"status": "recovered", "candidate": candidate, "provenance": "reference:coherent-warm-start"},
        problem,
        evaluator,
    )

    assert result["evaluation"].candidateId == candidate.candidateId
    assert evaluator.calls == [(candidate.candidateId,)]


def test_known_good_does_not_claim_a_seeding_gap_for_an_existing_deep_region() -> None:
    problem = _problem()
    control = _candidate(problem, "control", "standard-v2-control")
    artifact = historical_reference_artifact_from_results(
        [{"caseId": problem.problemId, "filters": [_historical_filter()]}],
        provenance="reference:coherent-warm-start",
        source_sha="d" * 40,
        source_run_id="33987922969",
        source_artifact_id="9975764396",
        selections={problem.problemId: {}},
    )

    class _KnownEvaluator:
        def evaluate(self, _problem, candidates):
            return tuple(
                _evaluation(
                    candidate.candidateId,
                    1.0 if candidate.algorithmId == "standard-v2-control" else 0.5,
                    1.0 if candidate.algorithmId == "standard-v2-control" else 0.5,
                )
                for candidate in candidates
            )

    result = run_known_good_recovery(
        problem,
        control,
        [{"candidateId": "deep-equivalent", "rmseDb": 0.5, "maxAbsDb": 0.5}],
        _KnownEvaluator(),
        [{
            "artifact": artifact,
            "sourceSha": "d" * 40,
            "sourceRunId": "33987922969",
            "sourceArtifactId": "9975764396",
        }],
    )

    reference = result["references"][0]
    assert reference["unseededFailedToRediscover"] is False
    assert reference["material"] is False


class _RecordingOptimizer:
    def __init__(self, algorithm_id: str, calls: list[tuple[str, str | None, tuple[str, ...]]]) -> None:
        self.algorithm_id = algorithm_id
        self.calls = calls

    def optimize(self, problem, layout, seed, objective_weights, evaluation_budget, initial_candidate=None, objective=None):
        del layout, seed, objective_weights, evaluation_budget, objective
        self.calls.append((self.algorithm_id, None if initial_candidate is None else initial_candidate.candidateId, tuple(
            filter_.type for filter_ in (initial_candidate.filters if initial_candidate is not None else ())
        )))
        assert initial_candidate is not None
        return replace(
            initial_candidate,
            candidateId=f"{self.algorithm_id}:{len(self.calls)}",
            algorithmId=self.algorithm_id,
        )


class _RefinementEvaluator(_ReferenceEvaluator):
    def evaluate(self, problem, candidates):
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        values = {
            "standard-v2-control": (1.0, 1.0),
            "powell": (0.7, 0.8),
            "cma-es": (0.8, 0.7),
        }
        return tuple(_evaluation(candidate.candidateId, *values[candidate.algorithmId]) for candidate in candidates)


def test_control_seeded_refinement_preserves_exact_control_topology() -> None:
    problem = _problem()
    control = replace(_candidate(problem, "control", "standard-v2-control"), seed=None)
    calls: list[tuple[str, str | None, tuple[str, ...]]] = []
    evaluator = _RefinementEvaluator()

    result = run_control_seeded_refinement(
        problem,
        control,
        evaluator,
        seeds=(11,),
        evaluation_budget=5,
        optimizer_factory=lambda algorithm_id, _run_index: _RecordingOptimizer(algorithm_id, calls),
    )

    assert result["topology"] == {"filterCount": 1, "filterTypes": ["PK"]}
    assert {call[0] for call in calls} == {"powell", "cma-es"}
    assert {call[1] for call in calls} == {"control"}
    assert all(record["sourceControlCandidateId"] == "control" for record in result["records"])


def test_existing_stage_frontiers_report_both_marginal_movements() -> None:
    control = {"candidateId": "control", "rmseDb": 1.0, "maxAbsDb": 1.0}
    stages = {
        "screen": [control],
        "confirm": [control, {"candidateId": "confirm-new", "rmseDb": 0.9, "maxAbsDb": 0.95}],
        "deep": [control, {"candidateId": "deep-new", "rmseDb": 0.75, "maxAbsDb": 0.85}],
    }

    movement = compare_existing_stage_frontiers(stages, control=control)

    assert movement["screenToConfirm"]["materialChange"] is True
    assert movement["confirmToDeep"]["newNondominatedPointIds"] == ["deep-new"]
    assert movement["practicalConvergence"] == "still-moving"


def test_alternative_objective_specs_keep_explicit_normalized_epsilon_values() -> None:
    specs = build_alternative_objectives(rmse_scale=1.25, max_abs_scale=4.5)

    assert [spec["kind"] for spec in specs] == [
        "tchebycheff", "tchebycheff", "tchebycheff", "epsilon-maxabs", "epsilon-rmse",
    ]
    assert all(spec["rmseScale"] == 1.25 and spec["maxAbsScale"] == 4.5 for spec in specs)
    assert specs[-2]["epsilon"] == 1.0
    assert specs[-1]["epsilon"] == 1.0


def test_alternative_frontier_extension_requires_a_new_nondominated_region() -> None:
    previous = [{"candidateId": "old", "rmseDb": 1.0, "maxAbsDb": 1.0}]
    equivalent = [{"candidateId": "same", "rmseDb": 1.0, "maxAbsDb": 1.0}]
    improved = [{"candidateId": "better", "rmseDb": 0.7, "maxAbsDb": 0.8}]

    assert frontier_extension_evidence(previous, equivalent)["material"] is False
    assert frontier_extension_evidence(previous, improved)["material"] is True


def test_frontier_extension_can_compare_deliverable_metrics() -> None:
    problem = _problem()
    candidate = _candidate(problem, "candidate", "standard-v2-control")
    evaluation = SolverLabEvaluation(
        protocolVersion=1,
        candidateId=candidate.candidateId,
        valid=True,
        rejectionReason=None,
        continuous=CanonicalMetricSet(0.2, 0.2, {}),
        deliverable=CanonicalMetricSet(1.0, 1.0, {}),
        deliverableFilters=candidate.filters,
        cancellationTotalScore=0.0,
    )
    point = {
        "candidate": json.loads(serialize_candidate(candidate)),
        "evaluation": json.loads(serialize_evaluation(evaluation)),
        "actualFilterCount": len(candidate.filters),
        "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
    }

    assert frontier_extension_evidence(
        [{"candidateId": "old", "rmseDb": 1.0, "maxAbsDb": 1.0}],
        [point],
    )["material"] is True
    assert frontier_extension_evidence(
        [{"candidateId": "old", "rmseDb": 1.0, "maxAbsDb": 1.0}],
        [point],
        metric="deliverable",
    )["material"] is False


def _control_artifact(problem: SolverLabProblem, cap: int) -> dict[str, object]:
    return {
        "version": 1,
        "oracle": "standard-v2-control",
        "repositorySha": "f" * 40,
        "corpusLayer": "adversarial",
        "maxFilters": cap,
        "budgetSeconds": 30,
        "algorithmVersion": "5dafaa50410b9fa3157c28a1f7757d676b33152a",
        "points": [{
            "candidateId": f"control:{cap}",
            "problemId": problem.problemId,
            "inputSha256": problem.inputSha256,
            "maxFilters": cap,
            "rmseDb": 1.0,
            "maxAbsDb": 1.0,
            "maeDb": 1.0,
            "maxAbsFrequencyHz": 1000.0,
            "targetAchieved": False,
            "deliveredFilterCount": 1,
            "terminationReason": "time-limit",
            "filters": [_historical_filter()],
        }],
    }


class _CapacityEvaluator(_ReferenceEvaluator):
    def evaluate(self, problem, candidates):
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        metrics = {
            10: (1.0, 1.0),
            20: (0.8, 0.9),
            40: (0.79, 0.89),
        }[problem.bounds["maxFilters"]]
        return tuple(
            SolverLabEvaluation(
                protocolVersion=1,
                candidateId=candidate.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=CanonicalMetricSet(*metrics, {}),
                deliverable=CanonicalMetricSet(*metrics, {}),
                deliverableFilters=candidate.filters,
                cancellationTotalScore=0.0,
            )
            for candidate in candidates
        )


def test_capacity_diagnosis_compares_exact_product_states_at_all_caps() -> None:
    problem = _problem()
    result = run_capacity_diagnosis(
        problem,
        {cap: _control_artifact(problem, cap) for cap in (10, 20, 40)},
        _CapacityEvaluator(),
        seeds=(11,),
        evaluation_budget=5,
        optimizer_factory=lambda algorithm_id, _run_index: _RecordingOptimizer(algorithm_id, []),
    )

    assert [result["results"][str(cap)]["cap"] for cap in (10, 20, 40)] == [10, 20, 40]
    assert all(result["results"][str(cap)]["actualFilterCounts"] == [1] for cap in (10, 20, 40))
    assert result["comparisons"]["10To20"]["materialChange"] is True
    assert result["comparisons"]["20To40"]["materialChange"] is False
    assert result["material"] is True


def _stage_artifact(problem: SolverLabProblem, candidate: SolverLabCandidate, evaluation: SolverLabEvaluation) -> dict[str, object]:
    point = {
        "candidate": json.loads(serialize_candidate(candidate)),
        "evaluation": json.loads(serialize_evaluation(evaluation)),
        "actualFilterCount": len(candidate.filters),
        "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
        "provenance": {"algorithmId": candidate.algorithmId},
    }
    return {
        "version": 1,
        "oracle": "continuous-oracle",
        "frontiers": [{
            "problemId": problem.problemId,
            "frontierType": "maxFilters",
            "maxFilters": 10,
            "points": [point],
        }],
    }


class _CaseOptimizer:
    def __init__(self, algorithm_id: str, counter: list[int]) -> None:
        self.algorithm_id = algorithm_id
        self.counter = counter
        self.last_evaluation_count = 1

    def optimize(self, problem, layout, seed, objective_weights, evaluation_budget, initial_candidate=None, objective=None):
        del layout, objective_weights, evaluation_budget, objective
        self.counter[0] += 1
        base = initial_candidate or _candidate(problem, "generated", self.algorithm_id)
        return replace(
            base,
            candidateId=f"{self.algorithm_id}:{self.counter[0]}",
            algorithmId=self.algorithm_id,
            seed=seed,
        )


class _CaseEvaluator(_ReferenceEvaluator):
    def evaluate(self, problem, candidates):
        self.calls.append(tuple(candidate.candidateId for candidate in candidates))
        values = {
            "powell": {
                10: (0.7, 0.8),
                20: (0.5, 0.6),
                40: (0.49, 0.59),
            },
            "cma-es": {
                10: (0.8, 0.7),
                20: (0.5, 0.6),
                40: (0.49, 0.59),
            },
            "differential-evolution": {
                10: (0.6, 0.9),
                20: (0.5, 0.6),
                40: (0.49, 0.59),
            },
        }
        result = []
        for candidate in candidates:
            if candidate.algorithmId.startswith("reference:"):
                metric = (0.5, 0.5)
            elif candidate.algorithmId == "standard-v2-control":
                metric = {
                    10: (1.0, 1.0),
                    20: (0.8, 0.9),
                    40: (0.79, 0.89),
                }[problem.bounds["maxFilters"]]
            else:
                metric = values[candidate.algorithmId][problem.bounds["maxFilters"]]
            result.append(SolverLabEvaluation(
                protocolVersion=1,
                candidateId=candidate.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=CanonicalMetricSet(*metric, {}),
                deliverable=CanonicalMetricSet(*metric, {}),
                deliverableFilters=candidate.filters,
                cancellationTotalScore=0.0,
            ))
        return tuple(result)


def test_case_aggregation_persists_all_diagnosis_evidence_without_freezing_calibration() -> None:
    problem = _problem()
    control_artifacts = {cap: _control_artifact(problem, cap) for cap in (10, 20, 40)}
    control = _candidate(problem, "control:10", "standard-v2-control")
    control_evaluation = _evaluation("control:10", 1.0, 1.0)
    stage_artifacts = {
        stage: _stage_artifact(problem, control, control_evaluation)
        for stage in ("screen", "confirm", "deep")
    }
    historical = historical_reference_artifact_from_results(
        [{"caseId": problem.problemId, "filters": [_historical_filter()]}],
        provenance="reference:coherent-warm-start",
        source_sha="d" * 40,
        source_run_id="33987922969",
        source_artifact_id="9975764396",
        selections={problem.problemId: {}},
    )
    config = OracleDiagnosisConfig(
        repository_sha="f" * 40,
        frozen_control_sha="5dafaa50410b9fa3157c28a1f7757d676b33152a",
        local_seeds=(11,),
        alternative_seeds=(11,),
        confirmation_seeds=(11,),
        local_evaluation_budget=1,
        alternative_evaluation_budget=1,
        confirmation_evaluation_budget=1,
    )
    counter = [0]
    report = run_oracle_diagnosis_case(
        problem,
        control_artifacts[10],
        stage_artifacts,
        [{
            "artifact": historical,
            "sourceSha": "d" * 40,
            "sourceRunId": "33987922969",
            "sourceArtifactId": "9975764396",
        }],
        _CaseEvaluator(),
        config=config,
        capacity_control_artifacts=control_artifacts,
        optimizer_factory=lambda algorithm_id, _run_index: _CaseOptimizer(algorithm_id, counter),
    )

    assert report["report"] == "OracleDiagnosisReportV1"
    assert report["marginalFrontierMovement"]["practicalConvergence"] == "converged"
    assert set(report["classification"]["labels"]) == {
        "local-search-gap",
        "discovery-seeding-gap",
        "objective-scalarization-gap",
        "capacity-gap",
    }
    assert report["calibration"] == {
        "calibrationFrozen": False,
        "status": "insufficient",
        "existingStatus": "insufficient",
        "statusChanged": False,
        "bestKnownFrontierReevaluated": True,
        "reason": "diagnosis does not alter existing strict calibration gate",
    }
    assert all(
        point.get("provenance")
        for point in report["updatedBestKnownFrontier"]["continuous"]
    )
    json.dumps(report, sort_keys=True)
    assert report["holdoutOpened"] is False
    assert report["productionBehaviorChanged"] is False


def test_diagnosis_workflow_is_marker_gated_and_reuses_prior_aggregates() -> None:
    workflow = Path(__file__).parents[3] / ".github" / "workflows" / "autoeq-oracle-diagnosis.yml"
    text = workflow.read_text(encoding="utf-8")

    assert "contains(github.event.head_commit.message, '[oracle-diagnosis]')" in text
    assert "prepare-diagnosis-inputs" in text
    assert "max-parallel: 4" in text
    assert "aggregate-diagnosis" in text
    source = (Path(__file__).parents[1] / "src" / "autoeq_solver_lab" / "oracle_diagnosis.py").read_text(encoding="utf-8")
    for run_id, artifact_id in (
        ("34110098435", "10014165079"),
        ("34110901484", "10014731506"),
        ("34112286380", "10016580986"),
    ):
        assert run_id in text
        assert artifact_id in source
