"""Research-only Oracle campaign planning and deterministic aggregation."""

from collections.abc import Mapping, Sequence
import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Literal

from .calibration import (
    FAMILY_MATCH_TOLERANCE,
    MAX_ABS_SCALE_DB,
    RMSE_SCALE_DB,
    build_calibration_report,
    load_control_points,
    load_oracle_points,
    validate_oracle_campaign,
)
from .continuous_oracle import CONTINUOUS_ORACLE_VERSION, OPTIMIZER_CONFIGS
from .deliverable_oracle import DELIVERABLE_ORACLE_VERSION
from .io import (
    load_control_candidates,
    parse_candidate,
    parse_evaluation,
    read_candidates,
    read_problems,
    serialize_candidate,
    write_candidates,
)
from .pareto import normalized_regret
from .types import ObjectivePoint, SolverLabCandidate, SolverLabProblem


CampaignMode = Literal["smoke", "screen", "confirm", "deep", "full"]

CAMPAIGN_SCHEMA_VERSION = 1
CONVERGENCE_CRITERION_VERSION = "normalized-pareto-regret-v1"
CONVERGENCE_MATERIAL_REGRET = 0.05
CONVERGENCE_FAMILY_AGREEMENT = 0.75
CONVERGENCE_DELIVERABLE_GAP = 0.05
SEED_PREFIX_LENGTHS: dict[CampaignMode, int] = {
    "smoke": 2,
    "screen": 2,
    "confirm": 4,
    "deep": 8,
    "full": 8,
}
DEFAULT_STAGE_BUDGETS: dict[CampaignMode, int] = {
    "smoke": 60,
    "screen": 120,
    "confirm": 240,
    "deep": 600,
    "full": 600,
}


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _parse_seed_list(value: str | Sequence[int]) -> tuple[int, ...]:
    if isinstance(value, str):
        try:
            seeds = tuple(int(part.strip()) for part in value.split(",") if part.strip())
        except ValueError as error:
            raise ValueError("seed pool must be comma-separated integers") from error
    else:
        seeds = tuple(value)
    if not seeds or any(isinstance(seed, bool) or not isinstance(seed, int) for seed in seeds):
        raise ValueError("seed pool must contain integer seeds")
    if len(set(seeds)) != len(seeds):
        raise ValueError("seed pool must contain unique seeds")
    if any(seed < 0 for seed in seeds):
        raise ValueError("seed pool must contain non-negative seeds")
    return seeds


def stable_seed_prefix(seed_pool: str | Sequence[int], mode: CampaignMode) -> tuple[int, ...]:
    if mode not in SEED_PREFIX_LENGTHS:
        raise ValueError(f"unknown campaign mode {mode}")
    seeds = _parse_seed_list(seed_pool)
    required = SEED_PREFIX_LENGTHS[mode]
    if len(seeds) < required:
        raise ValueError(f"campaign mode {mode} requires at least {required} seeds")
    return seeds[:required]


def build_stage_config(
    mode: CampaignMode,
    seed_pool: str | Sequence[int],
    evaluation_budget_override: int | None = None,
) -> dict[str, Any]:
    if mode not in DEFAULT_STAGE_BUDGETS:
        raise ValueError(f"unknown campaign mode {mode}")
    seeds = stable_seed_prefix(seed_pool, mode)
    default_budget = DEFAULT_STAGE_BUDGETS[mode]
    budget = default_budget if evaluation_budget_override is None else evaluation_budget_override
    if isinstance(budget, bool) or not isinstance(budget, int) or budget < default_budget:
        raise ValueError(f"campaign mode {mode} requires evaluation budget >= {default_budget}")
    return {
        "schemaVersion": CAMPAIGN_SCHEMA_VERSION,
        "mode": mode,
        "seeds": list(seeds),
        "seedPool": list(_parse_seed_list(seed_pool)),
        "minimumIndependentSeedCount": len(seeds),
        "evaluationBudgetPerRun": budget,
        "evidenceEligible": mode != "smoke",
        "polishStrategy": "all" if mode == "full" else "shortlist",
        "objectiveWeightsVersion": "continuous-objectives-v1",
        "convergenceCriterionVersion": CONVERGENCE_CRITERION_VERSION,
    }


def build_case_matrix(case_ids: Sequence[str], max_parallel: int = 8) -> dict[str, Any]:
    if isinstance(max_parallel, bool) or not isinstance(max_parallel, int) or max_parallel <= 0:
        raise ValueError("max_parallel must be a positive integer")
    normalized = tuple(sorted(case_ids))
    if any(not isinstance(case_id, str) or not case_id for case_id in normalized):
        raise ValueError("case IDs must be non-empty strings")
    if len(set(normalized)) != len(normalized):
        raise ValueError("case matrix contains duplicate case IDs")
    if not normalized:
        raise ValueError("case matrix requires at least one case ID")
    return {"caseIds": list(normalized), "maxParallel": max_parallel}


def _frontier_regret(source: Sequence[ObjectivePoint], target: Sequence[ObjectivePoint]) -> float:
    if not source:
        return 0.0
    if not target:
        return math.inf
    return max(normalized_regret(point, target) for point in source)


def compare_canonical_frontiers(
    previous: Sequence[ObjectivePoint],
    current: Sequence[ObjectivePoint],
) -> dict[str, Any]:
    previous_to_current = _frontier_regret(previous, current)
    current_to_previous = _frontier_regret(current, previous)
    max_regret = max(previous_to_current, current_to_previous)
    return {
        "criterionVersion": CONVERGENCE_CRITERION_VERSION,
        "materialRegretThreshold": CONVERGENCE_MATERIAL_REGRET,
        "previousPointCount": len(previous),
        "currentPointCount": len(current),
        "previousToCurrentNormalizedRegret": previous_to_current,
        "currentToPreviousNormalizedRegret": current_to_previous,
        "maxBidirectionalNormalizedRegret": max_regret,
        "materialChange": max_regret > CONVERGENCE_MATERIAL_REGRET,
    }


def decide_escalation(
    *,
    frontier_comparison: Mapping[str, Any],
    family_agreement_fraction: float | None,
    continuous_deliverable_gap: float | None,
    optimizer_regions_differ: bool,
) -> dict[str, Any]:
    reasons: list[str] = []
    if frontier_comparison.get("materialChange") is True:
        reasons.append("canonical-frontier-still-changing")
    if family_agreement_fraction is None or family_agreement_fraction < CONVERGENCE_FAMILY_AGREEMENT:
        reasons.append("independent-optimizer-frontiers-disagree")
    if continuous_deliverable_gap is None or continuous_deliverable_gap > CONVERGENCE_DELIVERABLE_GAP:
        reasons.append("continuous-deliverable-gap-remains-material")
    if optimizer_regions_differ:
        reasons.append("optimizer-families-reach-distinct-regions")
    return {
        "criterionVersion": CONVERGENCE_CRITERION_VERSION,
        "unresolved": bool(reasons),
        "reasons": reasons,
        "measured": {
            "frontierComparison": dict(frontier_comparison),
            "familyAgreementFraction": family_agreement_fraction,
            "continuousDeliverableGap": continuous_deliverable_gap,
            "optimizerRegionsDiffer": optimizer_regions_differ,
        },
        "stoppingThresholds": {
            "materialRegret": CONVERGENCE_MATERIAL_REGRET,
            "familyAgreementFraction": CONVERGENCE_FAMILY_AGREEMENT,
            "continuousDeliverableGap": CONVERGENCE_DELIVERABLE_GAP,
        },
    }


def _read_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _require_file(root: Path, name: str) -> Path:
    path = root / name
    if not path.is_file():
        raise ValueError(f"case artifact {root} is missing {name}")
    return path


def _validate_frontier_points(
    artifact: Mapping[str, Any],
    candidates: Mapping[str, SolverLabCandidate],
    problem: SolverLabProblem,
    max_filters: int,
    oracle: Literal["continuous", "deliverable"],
) -> None:
    frontiers = artifact.get("frontiers")
    if not isinstance(frontiers, Sequence) or isinstance(frontiers, (str, bytes)):
        raise ValueError(f"{oracle} frontiers must be an array")
    for frontier in frontiers:
        if not isinstance(frontier, Mapping) or frontier.get("problemId") != problem.problemId:
            raise ValueError(f"{oracle} frontier problem ID does not match case")
        frontier_type = frontier.get("frontierType")
        if oracle == "deliverable" and frontier_type != "maxFilters":
            raise ValueError("deliverable case artifact may contain only a maxFilters frontier")
        if oracle == "continuous" and frontier_type not in {"exactFilterCount", "maxFilters"}:
            raise ValueError("continuous frontier type is invalid")
        if frontier_type == "exactFilterCount":
            exact_count = frontier.get("exactFilterCount")
            if not isinstance(exact_count, int) or isinstance(exact_count, bool) or exact_count <= 0:
                raise ValueError("exactFilterCount must be a positive integer")
            if "maxFilters" in frontier:
                raise ValueError("exact frontier cannot contain maxFilters")
        elif frontier.get("maxFilters") != max_filters or "exactFilterCount" in frontier:
            raise ValueError("cap frontier must be labelled with maxFilters only")
        points = frontier.get("points")
        if not isinstance(points, Sequence) or isinstance(points, (str, bytes)):
            raise ValueError("frontier points must be an array")
        for raw_point in points:
            if not isinstance(raw_point, Mapping):
                raise ValueError("frontier point must be an object")
            if "filterCount" in raw_point:
                raise ValueError("frontier point cannot use filterCount")
            candidate_raw = raw_point.get("candidate")
            evaluation_raw = raw_point.get("evaluation")
            if not isinstance(candidate_raw, Mapping) or not isinstance(evaluation_raw, Mapping):
                raise ValueError("frontier point must contain candidate and evaluation")
            candidate = parse_candidate(candidate_raw)
            evaluation = parse_evaluation(evaluation_raw)
            if candidate.candidateId not in candidates:
                raise ValueError(f"frontier candidate {candidate.candidateId} is absent from candidate file")
            if evaluation.candidateId != candidate.candidateId or not evaluation.valid:
                raise ValueError("frontier point canonical evaluation does not match candidate")
            if candidate.problemId != problem.problemId or candidate.inputSha256 != problem.inputSha256:
                raise ValueError("frontier candidate problem/input hash does not match problem")
            if raw_point.get("provenance") not in {None, candidate.algorithmId}:
                raise ValueError("frontier provenance does not match candidate algorithm")
            if len(candidate.filters) > max_filters or len(evaluation.deliverableFilters) > max_filters:
                raise ValueError("frontier candidate exceeds maxFilters")
            if raw_point.get("actualFilterCount") != len(candidate.filters):
                raise ValueError("frontier actualFilterCount does not match candidate")
            if raw_point.get("actualDeliveredFilterCount") != len(evaluation.deliverableFilters):
                raise ValueError("frontier actualDeliveredFilterCount does not match evaluation")
            if frontier_type == "exactFilterCount" and len(candidate.filters) != exact_count:
                raise ValueError("exact frontier candidate count does not match exactFilterCount")


def validate_case_artifact(root: str | Path) -> dict[str, Any]:
    artifact_root = Path(root)
    manifest = _read_object(_require_file(artifact_root, "case-manifest.json"))
    if manifest.get("schemaVersion") != CAMPAIGN_SCHEMA_VERSION:
        raise ValueError("case manifest schemaVersion must be 1")
    case_id = manifest.get("caseId")
    if not isinstance(case_id, str) or not case_id:
        raise ValueError("case manifest caseId is required")
    repository_sha = manifest.get("repositorySha")
    if not isinstance(repository_sha, str) or not repository_sha:
        raise ValueError("case manifest repositorySha is required")
    corpus_layer = manifest.get("corpusLayer")
    if corpus_layer not in {"development", "adversarial"}:
        raise ValueError("case manifest corpusLayer is invalid")
    max_filters = manifest.get("maxFilters")
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("case manifest maxFilters must be positive")
    stage = manifest.get("stage")
    if not isinstance(stage, Mapping) or stage.get("mode") not in DEFAULT_STAGE_BUDGETS:
        raise ValueError("case manifest stage configuration is required")

    problems_path = _require_file(artifact_root, "problems.jsonl")
    problems = read_problems(problems_path)
    if len(problems) != 1 or problems[0].problemId != case_id:
        raise ValueError("case artifact must contain exactly one matching problem")
    problem = problems[0]
    if problem.inputSha256 != manifest.get("inputSha256"):
        raise ValueError("case manifest inputSha256 does not match problem")
    if problem.bounds.get("maxFilters") != max_filters:
        raise ValueError("problem maxFilters does not match case manifest")

    control = _read_object(_require_file(artifact_root, "control.json"))
    if control.get("repositorySha") != repository_sha:
        raise ValueError("control repository SHA does not match case manifest")
    if control.get("corpusLayer") != corpus_layer or control.get("maxFilters") != max_filters:
        raise ValueError("control corpus layer or maxFilters does not match case manifest")
    control_candidates = load_control_candidates(control, problem, max_filters)
    if len(control_candidates) != 1:
        raise ValueError("case control artifact must contain exactly one point")

    continuous = _read_object(_require_file(artifact_root, "continuous.json"))
    deliverable = _read_object(_require_file(artifact_root, "deliverable.json"))
    for artifact, oracle in ((continuous, "continuous"), (deliverable, "deliverable")):
        if artifact.get("version") != 1 or artifact.get("oracle") != oracle:
            raise ValueError(f"{oracle} artifact identity is invalid")
        config = artifact.get("config")
        if not isinstance(config, Mapping) or config.get("maxFilters") != max_filters:
            raise ValueError(f"{oracle} artifact config maxFilters is invalid")
    continuous_config = continuous["config"]
    if (
        continuous_config.get("campaignMode") != stage.get("mode") or
        list(continuous_config.get("seeds", ())) != list(stage.get("seeds", ())) or
        continuous_config.get("evaluationBudgetPerRun") != stage.get("evaluationBudgetPerRun") or
        continuous_config.get("minimumIndependentSeedCount") != stage.get("minimumIndependentSeedCount")
    ):
        raise ValueError("continuous artifact stage configuration does not match case manifest")

    continuous_candidates_path = _require_file(artifact_root, "continuous.json.candidates.jsonl")
    deliverable_candidates_path = _require_file(artifact_root, "deliverable.json.candidates.jsonl")
    continuous_candidates = read_candidates(continuous_candidates_path)
    deliverable_candidates = read_candidates(deliverable_candidates_path)
    for label, candidate_values in (("continuous", continuous_candidates), ("deliverable", deliverable_candidates)):
        if len({candidate.candidateId for candidate in candidate_values}) != len(candidate_values):
            raise ValueError(f"{label} candidate file contains duplicate IDs")
        for candidate in candidate_values:
            if candidate.problemId != case_id or candidate.inputSha256 != problem.inputSha256:
                raise ValueError(f"{label} candidate problem/input hash does not match case")
            if len(candidate.filters) > max_filters:
                raise ValueError(f"{label} candidate exceeds maxFilters")
    _validate_frontier_points(
        continuous,
        {candidate.candidateId: candidate for candidate in continuous_candidates},
        problem,
        max_filters,
        "continuous",
    )
    _validate_frontier_points(
        deliverable,
        {candidate.candidateId: candidate for candidate in deliverable_candidates},
        problem,
        max_filters,
        "deliverable",
    )

    file_hashes = manifest.get("fileSha256")
    if not isinstance(file_hashes, Mapping):
        raise ValueError("case manifest fileSha256 is required")
    for name in (
        "problems.jsonl",
        "control.json",
        "continuous.json",
        "continuous.json.candidates.jsonl",
        "deliverable.json",
        "deliverable.json.candidates.jsonl",
        "environment.json",
    ):
        path = _require_file(artifact_root, name)
        if file_hashes.get(name) != _sha256(path):
            raise ValueError(f"case manifest hash mismatch for {name}")

    return {
        "root": artifact_root,
        "manifest": manifest,
        "problem": problem,
        "control": control,
        "continuous": continuous,
        "deliverable": deliverable,
        "continuousCandidates": continuous_candidates,
        "deliverableCandidates": deliverable_candidates,
    }


def discover_case_artifacts(parent: str | Path) -> tuple[Path, ...]:
    root = Path(parent)
    if not root.exists():
        return ()
    return tuple(sorted(
        (path for path in root.iterdir() if path.is_dir() and (path / "case-manifest.json").is_file()),
        key=lambda path: path.name,
    ))


def _frontier_sort_key(frontier: Mapping[str, Any]) -> tuple[str, int, int]:
    frontier_type = frontier.get("frontierType")
    return (
        str(frontier.get("problemId")),
        0 if frontier_type == "exactFilterCount" else 1,
        int(frontier.get("exactFilterCount", frontier.get("maxFilters", 0))),
    )


def _candidate_sort_key(candidate: SolverLabCandidate) -> tuple[str, str, str, int]:
    return (
        candidate.problemId,
        candidate.candidateId,
        candidate.algorithmId,
        -1 if candidate.seed is None else candidate.seed,
    )


def _diagnostic_family_agreement(record: Mapping[str, Any]) -> tuple[float | None, bool]:
    by_family: dict[str, list[tuple[float, float]]] = {
        "differential-evolution": [],
        "cma-es": [],
    }
    for frontier in record["continuous"].get("frontiers", []):
        if frontier.get("frontierType") != "exactFilterCount":
            continue
        for point in frontier.get("points", []):
            candidate = point.get("candidate", {})
            evaluation = point.get("evaluation", {})
            algorithm_id = candidate.get("algorithmId")
            metrics = evaluation.get("continuous")
            if algorithm_id in by_family and isinstance(metrics, Mapping):
                by_family[algorithm_id].append((float(metrics["rmseDb"]), float(metrics["maxAbsDb"])))
    left = by_family["differential-evolution"]
    right = by_family["cma-es"]
    if not left or not right:
        return None, False

    def distance(point: tuple[float, float], other: tuple[float, float]) -> float:
        return math.hypot(
            (point[0] - other[0]) / RMSE_SCALE_DB,
            (point[1] - other[1]) / MAX_ABS_SCALE_DB,
        )

    left_matches = sum(any(distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in right) for point in left)
    right_matches = sum(any(distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in left) for point in right)
    total = len(left) + len(right)
    agreement = (left_matches + right_matches) / total if total else None
    return agreement, bool(agreement is not None and agreement < 1.0)


def _case_convergence(
    report: Mapping[str, Any],
    case_id: str,
    *,
    diagnostic_family_agreement: float | None,
    optimizer_regions_differ: bool,
) -> dict[str, Any]:
    cells = report.get("cells", [])
    if not isinstance(cells, Sequence):
        return decide_escalation(
            frontier_comparison={"materialChange": False},
            family_agreement_fraction=diagnostic_family_agreement,
            continuous_deliverable_gap=None,
            optimizer_regions_differ=optimizer_regions_differ,
        )
    cell = next((entry for entry in cells if isinstance(entry, Mapping) and entry.get("problemId") == case_id), None)
    if cell is None:
        return decide_escalation(
            frontier_comparison={"materialChange": False},
            family_agreement_fraction=diagnostic_family_agreement,
            continuous_deliverable_gap=None,
            optimizer_regions_differ=optimizer_regions_differ,
        )
    agreement = cell.get("independentFamilyAgreement", {})
    gap = cell.get("continuousToDeliverableGap", {})
    family_fraction = agreement.get("agreementFraction") if isinstance(agreement, Mapping) else None
    gap_value = gap.get("mean") if isinstance(gap, Mapping) else None
    return decide_escalation(
        frontier_comparison={"materialChange": False},
        family_agreement_fraction=(
            diagnostic_family_agreement
            if diagnostic_family_agreement is not None
            else family_fraction if isinstance(family_fraction, (int, float)) else None
        ),
        continuous_deliverable_gap=gap_value if isinstance(gap_value, (int, float)) else None,
        optimizer_regions_differ=optimizer_regions_differ,
    )


def aggregate_case_artifacts(
    case_artifact_roots: Sequence[str | Path],
    *,
    expected_case_ids: Sequence[str],
    repository_sha: str,
    corpus_layer: str,
    max_filters: int,
    output_dir: str | Path,
    stage_config: Mapping[str, Any] | None = None,
    artifact_names: Mapping[str, str] | None = None,
    aggregate_artifact_name: str | None = None,
    pilot_artifact_name: str | None = None,
    pilot_artifact: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    expected = tuple(sorted(expected_case_ids))
    if not expected or len(set(expected)) != len(expected):
        raise ValueError("expected case IDs must be non-empty and unique")
    if corpus_layer not in {"development", "adversarial"}:
        raise ValueError("corpus_layer is invalid")
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("max_filters must be positive")

    records: dict[str, dict[str, Any]] = {}
    for root in case_artifact_roots:
        record = validate_case_artifact(root)
        manifest = record["manifest"]
        case_id = manifest["caseId"]
        if case_id not in expected:
            raise ValueError(f"unexpected case artifact {case_id}")
        if case_id in records:
            raise ValueError(f"duplicate case artifact {case_id}")
        if manifest["repositorySha"] != repository_sha:
            raise ValueError(f"case {case_id} repository SHA does not match campaign")
        if manifest["corpusLayer"] != corpus_layer or manifest["maxFilters"] != max_filters:
            raise ValueError(f"case {case_id} campaign configuration does not match")
        if stage_config is not None and _json(manifest["stage"]) != _json(stage_config):
            raise ValueError(f"case {case_id} stage configuration does not match campaign")
        records[case_id] = record

    completed = tuple(sorted(records))
    missing = tuple(sorted(set(expected) - set(completed)))
    if records:
        first = records[completed[0]]
        for case_id in completed[1:]:
            record = records[case_id]
            if _json(record["continuous"]["config"]) != _json(first["continuous"]["config"]):
                raise ValueError(f"case {case_id} continuous config does not match campaign")
            if _json(record["deliverable"]["config"]) != _json(first["deliverable"]["config"]):
                raise ValueError(f"case {case_id} deliverable config does not match campaign")

    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    if records:
        first = records[completed[0]]
        control = json.loads(json.dumps(first["control"]))
        control["points"] = [
            point
            for case_id in completed
            for point in records[case_id]["control"].get("points", [])
        ]
        control["caseIds"] = list(completed)
        continuous = json.loads(json.dumps(first["continuous"]))
        deliverable = json.loads(json.dumps(first["deliverable"]))
        continuous["frontiers"] = sorted(
            [frontier for case_id in completed for frontier in records[case_id]["continuous"]["frontiers"]],
            key=_frontier_sort_key,
        )
        deliverable["frontiers"] = sorted(
            [frontier for case_id in completed for frontier in records[case_id]["deliverable"]["frontiers"]],
            key=_frontier_sort_key,
        )
        continuous["caseIds"] = list(completed)
        deliverable["caseIds"] = list(completed)
        continuous["candidatePath"] = "continuous-aggregate.json.candidates.jsonl"
        deliverable["candidatePath"] = "deliverable-aggregate.json.candidates.jsonl"
        continuous_candidates = tuple(sorted(
            {
                candidate.candidateId: candidate
                for case_id in completed
                for candidate in records[case_id]["continuousCandidates"]
            }.values(),
            key=_candidate_sort_key,
        ))
        deliverable_candidates = tuple(sorted(
            {
                candidate.candidateId: candidate
                for case_id in completed
                for candidate in records[case_id]["deliverableCandidates"]
            }.values(),
            key=_candidate_sort_key,
        ))
    else:
        control = {
            "version": 1,
            "oracle": "standard-v2-control",
            "repositorySha": repository_sha,
            "corpusLayer": corpus_layer,
            "maxFilters": max_filters,
            "points": [],
            "caseIds": [],
        }
        continuous = {
            "version": 1,
            "oracle": "continuous",
            "config": {"maxFilters": max_filters, "caseIds": []},
            "candidatePath": "continuous-aggregate.json.candidates.jsonl",
            "frontiers": [],
            "caseIds": [],
        }
        deliverable = {
            "version": 1,
            "oracle": "deliverable",
            "config": {"maxFilters": max_filters, "caseIds": []},
            "candidatePath": "deliverable-aggregate.json.candidates.jsonl",
            "frontiers": [],
            "caseIds": [],
        }
        continuous_candidates = ()
        deliverable_candidates = ()

    _write_json(output / "control-aggregate.json", control)
    _write_json(output / "continuous-aggregate.json", continuous)
    _write_json(output / "deliverable-aggregate.json", deliverable)
    write_candidates(output / "continuous-aggregate.json.candidates.jsonl", continuous_candidates)
    write_candidates(output / "deliverable-aggregate.json.candidates.jsonl", deliverable_candidates)

    validation = validate_oracle_campaign(control, continuous, deliverable)
    if missing:
        validation = {
            **validation,
            "valid": False,
            "errors": [
                *validation.get("errors", []),
                *(f"missing required case {case_id}" for case_id in missing),
            ],
        }
    report: dict[str, Any]
    try:
        control_points = load_control_points(control)
        continuous_points = load_oracle_points(continuous, "continuous")
        deliverable_points = load_oracle_points(deliverable, "deliverable")
        report = build_calibration_report(
            control_points,
            continuous_points,
            deliverable_points,
            None,
            validation,
        )
    except (TypeError, ValueError, KeyError) as error:
        report = {
            "version": 1,
            "report": "oracle-calibration-v1",
            "status": "insufficient",
            "insufficiencyReasons": [f"aggregate-artifact-load-failed: {error}"],
            "manifest": None,
            "cells": [],
            "recommendations": {},
            "campaignValidation": validation,
        }
    if stage_config is not None and stage_config.get("evidenceEligible") is False:
        report["status"] = "insufficient"
        reasons = list(report.get("insufficiencyReasons", []))
        reasons.append("smoke-stage-is-orchestration-only")
        report["insufficiencyReasons"] = list(dict.fromkeys(reasons))
        report["manifest"] = None

    convergence = {}
    for case_id in completed:
        family_agreement, regions_differ = _diagnostic_family_agreement(records[case_id])
        convergence[case_id] = _case_convergence(
            report,
            case_id,
            diagnostic_family_agreement=family_agreement,
            optimizer_regions_differ=regions_differ,
        )
    if pilot_artifact is not None:
        report["convergencePilot"] = dict(pilot_artifact)
    campaign_manifest = {
        "schemaVersion": CAMPAIGN_SCHEMA_VERSION,
        "repositorySha": repository_sha,
        "corpusLayer": corpus_layer,
        "maxFilters": max_filters,
        "campaignMode": None if stage_config is None else stage_config.get("mode"),
        "stage": None if stage_config is None else dict(stage_config),
        "expectedCaseIds": list(expected),
        "completedCaseIds": list(completed),
        "missingCaseIds": list(missing),
        "complete": not missing and bool(records),
        "caseArtifactNames": {
            case_id: (
                artifact_names[case_id]
                if artifact_names is not None and case_id in artifact_names
                else records[case_id]["root"].name
            )
            for case_id in completed
        },
        "aggregateArtifactName": aggregate_artifact_name,
        "pilotArtifactName": pilot_artifact_name,
        "convergenceCriterionVersion": CONVERGENCE_CRITERION_VERSION,
        "convergence": convergence,
        "campaignValidation": validation,
        "calibrationStatus": report.get("status"),
        "calibrationFrozen": False,
    }
    if records:
        campaign_manifest.update({
            "continuousOracleVersion": first["continuous"].get("oracleVersion", CONTINUOUS_ORACLE_VERSION),
            "deliverableOracleVersion": first["deliverable"].get("oracleVersion", DELIVERABLE_ORACLE_VERSION),
            "optimizerConfigs": first["continuous"].get("config", {}).get("optimizerConfigs", OPTIMIZER_CONFIGS),
            "objectiveWeightsVersion": first["continuous"].get("config", {}).get("objectiveWeightsVersion", "continuous-objectives-v1"),
        })
    report["campaignEvidence"] = campaign_manifest
    _write_json(output / "calibration-report.json", report)
    _write_json(output / "campaign-manifest.json", campaign_manifest)
    return campaign_manifest


def write_case_manifest(
    artifact_dir: str | Path,
    *,
    repository_sha: str,
    case_id: str,
    corpus_layer: str,
    max_filters: int,
    stage: Mapping[str, Any],
    node_version: str,
    python_version: str,
    workflow_run_id: str | None,
    artifact_name: str | None,
) -> dict[str, Any]:
    root = Path(artifact_dir)
    problem = read_problems(_require_file(root, "problems.jsonl"))
    if len(problem) != 1 or problem[0].problemId != case_id:
        raise ValueError("case manifest requires exactly one matching problem")
    continuous = _read_object(_require_file(root, "continuous.json"))
    deliverable = _read_object(_require_file(root, "deliverable.json"))
    environment = {
        "schemaVersion": CAMPAIGN_SCHEMA_VERSION,
        "repositorySha": repository_sha,
        "caseId": case_id,
        "corpusLayer": corpus_layer,
        "maxFilters": max_filters,
        "campaignMode": stage.get("mode"),
        "workflowRunId": workflow_run_id,
        "nodeVersion": node_version,
        "pythonVersion": python_version,
        "stage": dict(stage),
        "continuousConfig": continuous.get("config"),
        "deliverableConfig": deliverable.get("config"),
        "optimizerConfigs": continuous.get("config", {}).get("optimizerConfigs", OPTIMIZER_CONFIGS),
    }
    _write_json(root / "environment.json", environment)
    names = (
        "problems.jsonl",
        "control.json",
        "continuous.json",
        "continuous.json.candidates.jsonl",
        "deliverable.json",
        "deliverable.json.candidates.jsonl",
        "environment.json",
    )
    manifest = {
        "schemaVersion": CAMPAIGN_SCHEMA_VERSION,
        "repositorySha": repository_sha,
        "caseId": case_id,
        "corpusLayer": corpus_layer,
        "maxFilters": max_filters,
        "stage": dict(stage),
        "inputSha256": problem[0].inputSha256,
        "problemId": case_id,
        "nodeVersion": node_version,
        "pythonVersion": python_version,
        "workflowRunId": workflow_run_id,
        "artifactName": artifact_name,
        "objectiveWeightsVersion": continuous.get("config", {}).get("objectiveWeightsVersion", "continuous-objectives-v1"),
        "continuousOracleVersion": continuous.get("oracleVersion", CONTINUOUS_ORACLE_VERSION),
        "deliverableOracleVersion": deliverable.get("oracleVersion", DELIVERABLE_ORACLE_VERSION),
        "optimizerConfigs": continuous.get("config", {}).get("optimizerConfigs", OPTIMIZER_CONFIGS),
        "fileSha256": {name: _sha256(root / name) for name in names},
    }
    _write_json(root / "case-manifest.json", manifest)
    return manifest


def _main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Research-only Oracle campaign utilities")
    subparsers = parser.add_subparsers(dest="command", required=True)

    stage_parser = subparsers.add_parser("stage-config")
    stage_parser.add_argument("--mode", choices=tuple(DEFAULT_STAGE_BUDGETS), required=True)
    stage_parser.add_argument("--seed-pool", required=True)
    stage_parser.add_argument("--evaluation-budget", type=int)
    stage_parser.add_argument("--out")

    aggregate_parser = subparsers.add_parser("aggregate")
    aggregate_parser.add_argument("--case-artifacts-dir", required=True)
    aggregate_parser.add_argument("--expected-case-ids", required=True)
    aggregate_parser.add_argument("--repository-sha", required=True)
    aggregate_parser.add_argument("--corpus-layer", required=True)
    aggregate_parser.add_argument("--max-filters", type=int, required=True)
    aggregate_parser.add_argument("--stage-config", required=True)
    aggregate_parser.add_argument("--out-dir", required=True)
    aggregate_parser.add_argument("--aggregate-artifact-name")
    aggregate_parser.add_argument("--pilot-artifact-name")
    aggregate_parser.add_argument("--pilot")

    manifest_parser = subparsers.add_parser("case-manifest")
    manifest_parser.add_argument("--artifact-dir", required=True)
    manifest_parser.add_argument("--repository-sha", required=True)
    manifest_parser.add_argument("--case-id", required=True)
    manifest_parser.add_argument("--corpus-layer", required=True)
    manifest_parser.add_argument("--max-filters", type=int, required=True)
    manifest_parser.add_argument("--stage-config", required=True)
    manifest_parser.add_argument("--node-version", required=True)
    manifest_parser.add_argument("--python-version", required=True)
    manifest_parser.add_argument("--workflow-run-id")
    manifest_parser.add_argument("--artifact-name")

    args = parser.parse_args(argv)
    if args.command == "stage-config":
        value = build_stage_config(args.mode, args.seed_pool, args.evaluation_budget)
        if args.out:
            _write_json(Path(args.out), value)
        else:
            print(json.dumps(value, sort_keys=True, separators=(",", ":")))
        return
    if args.command == "case-manifest":
        stage = _read_object(Path(args.stage_config))
        write_case_manifest(
            args.artifact_dir,
            repository_sha=args.repository_sha,
            case_id=args.case_id,
            corpus_layer=args.corpus_layer,
            max_filters=args.max_filters,
            stage=stage,
            node_version=args.node_version,
            python_version=args.python_version,
            workflow_run_id=args.workflow_run_id,
            artifact_name=args.artifact_name,
        )
        return
    expected_case_ids = tuple(case_id for case_id in args.expected_case_ids.split(",") if case_id)
    stage = _read_object(Path(args.stage_config))
    pilot = None if args.pilot is None or not Path(args.pilot).is_file() else _read_object(Path(args.pilot))
    aggregate_case_artifacts(
        discover_case_artifacts(args.case_artifacts_dir),
        expected_case_ids=expected_case_ids,
        repository_sha=args.repository_sha,
        corpus_layer=args.corpus_layer,
        max_filters=args.max_filters,
        output_dir=args.out_dir,
        stage_config=stage,
        aggregate_artifact_name=args.aggregate_artifact_name,
        pilot_artifact_name=args.pilot_artifact_name,
        pilot_artifact=pilot,
    )


if __name__ == "__main__":
    _main()
