import copy
import json
from dataclasses import asdict
from pathlib import Path

import pytest

from autoeq_solver_lab.campaign import (
    CONVERGENCE_CRITERION_VERSION,
    build_case_matrix,
    build_stage_config,
    compare_canonical_frontiers,
    decide_escalation,
    stable_seed_prefix,
    aggregate_case_artifacts,
    write_case_manifest,
)
from autoeq_solver_lab.continuous_oracle import OPTIMIZER_CONFIGS
from autoeq_solver_lab.io import serialize_candidate, write_problems
from autoeq_solver_lab.types import LabFilter, ObjectivePoint, SolverLabCandidate, SolverLabProblem


SEED_POOL = (11, 29, 47, 83, 101, 131, 167, 197)


def test_stage_seed_prefixes_are_nested_and_budgeted():
    smoke = build_stage_config("smoke", SEED_POOL)
    screen = build_stage_config("screen", SEED_POOL)
    confirm = build_stage_config("confirm", SEED_POOL)
    deep = build_stage_config("deep", SEED_POOL)
    full = build_stage_config("full", SEED_POOL)

    assert smoke["seeds"] == [11, 29]
    assert screen["seeds"] == [11, 29]
    assert confirm["seeds"] == [11, 29, 47, 83]
    assert deep["seeds"] == list(SEED_POOL)
    assert full["seeds"] == list(SEED_POOL)
    assert [smoke["evaluationBudgetPerRun"], screen["evaluationBudgetPerRun"], confirm["evaluationBudgetPerRun"], deep["evaluationBudgetPerRun"]] == [60, 120, 240, 600]
    assert screen["evidenceEligible"] is True
    assert smoke["evidenceEligible"] is False
    assert stable_seed_prefix(SEED_POOL, "confirm") == (11, 29, 47, 83)


def test_stage_config_rejects_non_nested_or_duplicate_seed_pool():
    with pytest.raises(ValueError, match="unique"):
        stable_seed_prefix((11, 11, 29), "screen")
    with pytest.raises(ValueError, match="at least"):
        build_stage_config("deep", (11, 29, 47, 83))


def test_case_matrix_is_sorted_and_has_bounded_parallelism():
    matrix = build_case_matrix(("case-b", "case-a"))

    assert matrix == {
        "caseIds": ["case-a", "case-b"],
        "maxParallel": 8,
    }
    with pytest.raises(ValueError, match="duplicate"):
        build_case_matrix(("case-a", "case-a"))
    with pytest.raises(ValueError, match="max_parallel"):
        build_case_matrix(("case-a",), max_parallel=0)


def test_workflow_declares_case_matrix_and_deterministic_aggregation():
    workflow = Path(__file__).parents[3] / ".github" / "workflows" / "autoeq-oracle-research.yml"
    text = workflow.read_text(encoding="utf-8")

    assert "  prepare:" in text
    assert "  oracle-case:" in text
    assert "      fail-fast: false" in text
    assert "      max-parallel: 8" in text
    assert "case_id: ${{ fromJSON(needs.prepare.outputs.case_ids) }}" in text
    assert "  aggregate:" in text
    assert "campaign-manifest.json" in text


def test_convergence_comparison_reports_material_frontier_change():
    previous = (
        ObjectivePoint("old-a", 0.2, 0.8, 1),
        ObjectivePoint("old-b", 0.4, 0.4, 2),
    )
    current = (
        ObjectivePoint("new-a", 0.1, 0.3, 2),
    )

    comparison = compare_canonical_frontiers(previous, current)

    assert comparison["criterionVersion"] == CONVERGENCE_CRITERION_VERSION
    assert comparison["materialChange"] is True
    assert comparison["maxBidirectionalNormalizedRegret"] > 0.05
    assert comparison["previousPointCount"] == 2
    assert comparison["currentPointCount"] == 1


def test_escalation_is_restricted_to_unresolved_cases():
    unresolved = decide_escalation(
        frontier_comparison={"materialChange": True},
        family_agreement_fraction=0.4,
        continuous_deliverable_gap=0.2,
        optimizer_regions_differ=True,
    )
    converged = decide_escalation(
        frontier_comparison={"materialChange": False},
        family_agreement_fraction=0.95,
        continuous_deliverable_gap=0.01,
        optimizer_regions_differ=False,
    )

    assert unresolved["unresolved"] is True
    assert unresolved["reasons"]
    assert converged["unresolved"] is False
    assert converged["reasons"] == []


def _metric(rmse_db: float, max_abs_db: float, filters: list[dict]) -> dict:
    return {
        "rmseDb": rmse_db,
        "maxAbsDb": max_abs_db,
        "bandRmseDb": {"bass": rmse_db, "mid": rmse_db, "treble": rmse_db},
        "filters": filters,
        "cancellationTotalScore": 0.0,
    }


def _evaluation(candidate_id: str, rmse_db: float, max_abs_db: float) -> dict:
    return {
        "protocolVersion": 1,
        "candidateId": candidate_id,
        "valid": True,
        "rejectionReason": None,
        "continuous": {
            "rmseDb": rmse_db,
            "maxAbsDb": max_abs_db,
            "bandRmseDb": {"bass": rmse_db, "mid": rmse_db, "treble": rmse_db},
        },
        "deliverable": _metric(rmse_db, max_abs_db, []),
    }


def _make_case_artifact(root: Path, case_id: str, stage: dict) -> None:
    root.mkdir(parents=True)
    input_sha = (case_id.encode("utf-8").hex() * 64)[:64]
    problem = SolverLabProblem(
        protocolVersion=1,
        problemId=case_id,
        inputSha256=input_sha,
        sampleRateHz=48000,
        frequenciesHz=(100.0,),
        desiredDb=(0.0,),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20_000.0,
            "minGainDb": -12.0,
            "maxGainDb": 12.0,
            "minPkQ": 0.1,
            "maxPkQ": 10.0,
            "shelfQ": 0.7,
            "maxFilters": 1,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )
    write_problems(root / "problems.jsonl", (problem,))
    filter_value = LabFilter("filter-1", True, "PK", 100.0, 0.0, 1.0)
    oracle_candidate = SolverLabCandidate(
        protocolVersion=1,
        problemId=case_id,
        inputSha256=input_sha,
        candidateId=f"de:{case_id}",
        algorithmId="differential-evolution",
        seed=11,
        filters=(filter_value,),
    )
    control_candidate = SolverLabCandidate(
        protocolVersion=1,
        problemId=case_id,
        inputSha256=input_sha,
        candidateId=f"standard-v2-control:{case_id}:1:15",
        algorithmId="standard-v2-control",
        seed=None,
        filters=(),
    )
    oracle_raw = json.loads(serialize_candidate(oracle_candidate))
    control_raw = json.loads(serialize_candidate(control_candidate))
    oracle_eval = _evaluation(oracle_candidate.candidateId, 0.5, 1.2)
    control_eval = _evaluation(control_candidate.candidateId, 1.0, 1.0)
    oracle_point = {
        "candidate": oracle_raw,
        "evaluation": oracle_eval,
        "actualFilterCount": 1,
        "actualDeliveredFilterCount": 0,
        "provenance": "differential-evolution",
    }
    control_point = {
        "candidate": control_raw,
        "evaluation": control_eval,
        "actualFilterCount": 0,
        "actualDeliveredFilterCount": 0,
        "provenance": "standard-v2-control",
    }
    control = {
        "version": 1,
        "oracle": "standard-v2-control",
        "repositorySha": "a" * 40,
        "corpusLayer": "adversarial",
        "maxFilters": 1,
        "budgetSeconds": 15,
        "algorithmVersion": "control-v1",
        "points": [{
            "candidateId": control_candidate.candidateId,
            "problemId": case_id,
            "inputSha256": input_sha,
            "maxFilters": 1,
            "rmseDb": 1.0,
            "maxAbsDb": 1.0,
            "maeDb": 1.0,
            "maxAbsFrequencyHz": 100.0,
            "targetAchieved": False,
            "deliveredFilterCount": 0,
            "terminationReason": "converged",
            "filters": [],
        }],
    }
    config = {
        "seeds": stage["seeds"],
        "filterCounts": [1],
        "maxFilters": 1,
        "caps": [1],
        "objectiveWeights": [[1.0, 0.0]],
        "evaluationBudgetPerRun": stage["evaluationBudgetPerRun"],
        "optimizerConfigs": copy.deepcopy(OPTIMIZER_CONFIGS),
        "canonicalCommand": ["fixture"],
        "campaignMode": stage["mode"],
        "minimumIndependentSeedCount": stage["minimumIndependentSeedCount"],
        "objectiveWeightsVersion": "continuous-objectives-v1",
    }
    continuous = {
        "version": 1,
        "oracle": "continuous",
        "config": config,
        "candidatePath": "continuous.json.candidates.jsonl",
        "frontiers": [
            {"frontierType": "exactFilterCount", "exactFilterCount": 1, "problemId": case_id, "points": [oracle_point]},
            {"frontierType": "maxFilters", "maxFilters": 1, "problemId": case_id, "points": [control_point, oracle_point]},
        ],
    }
    deliverable = {
        "version": 1,
        "oracle": "deliverable",
        "config": {
            "seed": 41,
            "generations": 1,
            "evaluationBudget": 1,
            "maxFilters": 1,
            "canonicalCommand": ["fixture"],
        },
        "candidatePath": "deliverable.json.candidates.jsonl",
        "frontiers": [{
            "frontierType": "maxFilters",
            "maxFilters": 1,
            "problemId": case_id,
            "points": [control_point, oracle_point],
        }],
    }
    (root / "control.json").write_text(json.dumps(control, sort_keys=True) + "\n", encoding="utf-8")
    (root / "continuous.json").write_text(json.dumps(continuous, sort_keys=True) + "\n", encoding="utf-8")
    (root / "deliverable.json").write_text(json.dumps(deliverable, sort_keys=True) + "\n", encoding="utf-8")
    candidates = f"{serialize_candidate(control_candidate)}\n{serialize_candidate(oracle_candidate)}\n"
    (root / "continuous.json.candidates.jsonl").write_text(candidates, encoding="utf-8")
    (root / "deliverable.json.candidates.jsonl").write_text(candidates, encoding="utf-8")
    write_case_manifest(
        root,
        repository_sha="a" * 40,
        case_id=case_id,
        corpus_layer="adversarial",
        max_filters=1,
        stage=stage,
        node_version="v22.0.0",
        python_version="3.12.0",
        workflow_run_id="run-1",
        artifact_name=f"artifact-{case_id}",
    )


def test_case_aggregation_is_complete_and_byte_deterministic(tmp_path: Path):
    stage = build_stage_config("screen", SEED_POOL)
    case_a = tmp_path / "case-a"
    case_b = tmp_path / "case-b"
    _make_case_artifact(case_a, "case-a", stage)
    _make_case_artifact(case_b, "case-b", stage)

    first_out = tmp_path / "aggregate-a"
    second_out = tmp_path / "aggregate-b"
    first = aggregate_case_artifacts(
        [case_b, case_a],
        expected_case_ids=("case-b", "case-a"),
        repository_sha="a" * 40,
        corpus_layer="adversarial",
        max_filters=1,
        output_dir=first_out,
        stage_config=stage,
    )
    second = aggregate_case_artifacts(
        [case_a, case_b],
        expected_case_ids=("case-a", "case-b"),
        repository_sha="a" * 40,
        corpus_layer="adversarial",
        max_filters=1,
        output_dir=second_out,
        stage_config=stage,
    )

    assert first["complete"] is True
    assert first["campaignValidation"]["valid"] is True
    assert first["completedCaseIds"] == ["case-a", "case-b"]
    assert second["completedCaseIds"] == first["completedCaseIds"]
    for name in (
        "control-aggregate.json",
        "continuous-aggregate.json",
        "deliverable-aggregate.json",
        "continuous-aggregate.json.candidates.jsonl",
        "deliverable-aggregate.json.candidates.jsonl",
        "calibration-report.json",
        "campaign-manifest.json",
    ):
        assert (first_out / name).read_bytes() == (second_out / name).read_bytes()


def test_case_aggregation_marks_missing_cases_incomplete(tmp_path: Path):
    stage = build_stage_config("screen", SEED_POOL)
    case_a = tmp_path / "case-a"
    _make_case_artifact(case_a, "case-a", stage)

    manifest = aggregate_case_artifacts(
        [case_a],
        expected_case_ids=("case-a", "case-b"),
        repository_sha="a" * 40,
        corpus_layer="adversarial",
        max_filters=1,
        output_dir=tmp_path / "aggregate",
        stage_config=stage,
    )

    assert manifest["complete"] is False
    assert manifest["missingCaseIds"] == ["case-b"]
    report = json.loads((tmp_path / "aggregate" / "calibration-report.json").read_text(encoding="utf-8"))
    assert report["status"] == "insufficient"
    assert any("missing" in error for error in report["campaignValidation"]["errors"])


def test_case_aggregation_rejects_sha_mismatch(tmp_path: Path):
    stage = build_stage_config("screen", SEED_POOL)
    case_a = tmp_path / "case-a"
    _make_case_artifact(case_a, "case-a", stage)

    with pytest.raises(ValueError, match="repository SHA"):
        aggregate_case_artifacts(
            [case_a],
            expected_case_ids=("case-a",),
            repository_sha="b" * 40,
            corpus_layer="adversarial",
            max_filters=1,
            output_dir=tmp_path / "aggregate",
            stage_config=stage,
        )


def test_case_aggregation_rejects_stage_config_mismatch(tmp_path: Path):
    stage = build_stage_config("screen", SEED_POOL)
    case_a = tmp_path / "case-a"
    _make_case_artifact(case_a, "case-a", stage)

    with pytest.raises(ValueError, match="stage configuration"):
        aggregate_case_artifacts(
            [case_a],
            expected_case_ids=("case-a",),
            repository_sha="a" * 40,
            corpus_layer="adversarial",
            max_filters=1,
            output_dir=tmp_path / "aggregate",
            stage_config=build_stage_config("confirm", SEED_POOL),
        )


def test_case_aggregation_rejects_problem_hash_mismatch(tmp_path: Path):
    stage = build_stage_config("screen", SEED_POOL)
    case_a = tmp_path / "case-a"
    _make_case_artifact(case_a, "case-a", stage)
    problem_line = (case_a / "problems.jsonl").read_text(encoding="utf-8")
    problem_value = json.loads(problem_line)
    problem_value["inputSha256"] = "f" * 64
    (case_a / "problems.jsonl").write_text(json.dumps(problem_value, sort_keys=True) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="inputSha256"):
        aggregate_case_artifacts(
            [case_a],
            expected_case_ids=("case-a",),
            repository_sha="a" * 40,
            corpus_layer="adversarial",
            max_filters=1,
            output_dir=tmp_path / "aggregate",
            stage_config=stage,
        )
