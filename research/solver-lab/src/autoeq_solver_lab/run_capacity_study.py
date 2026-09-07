"""Orchestrate the directed Fixed-Cap study without inventing missing evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from collections.abc import Mapping, Sequence
from typing import Any

from .case_classification import (
    HighCapObservation,
    evaluate_high_cap_solvability,
)
from .reference_snapshot import load_reference_snapshot


CAPACITY_STUDY_CASES = (
    "titan-to-storm",
    "titan-to-u12t",
    "titan-to-trio",
)
CAPACITY_STUDY_EVALUATION_BUDGETS = (2000, 10000, 50000)
CAPACITY_STUDY_SEEDS = (11, 29, 47, 71, 101)
CAPACITY_STUDY_CAPACITIES = (10, 20, 40, 64)


def _evidence_collection_blockers() -> list[str]:
    return [
        "python-fixed-cap-study-not-run:canonical problem/evidence inputs are unavailable",
        "teacher-compression-study-not-run:canonical high-cap teacher inputs are unavailable",
    ]


def validate_study_configuration(
    cases: Sequence[str],
    evaluation_budgets: Sequence[int],
    seeds: Sequence[int],
) -> None:
    if tuple(cases) != CAPACITY_STUDY_CASES:
        raise ValueError("capacity study cases must be exactly the three approved real cases in order")
    if tuple(evaluation_budgets) != CAPACITY_STUDY_EVALUATION_BUDGETS:
        raise ValueError("capacity study evaluation budgets must be exactly 2000,10000,50000")
    if tuple(seeds) != CAPACITY_STUDY_SEEDS:
        raise ValueError("capacity study seeds must be exactly 11,29,47,71,101")


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _artifact_path(run_dir: Path, case_id: str, policy: str, budget: int) -> Path:
    return run_dir / f"{case_id}-{policy}-{budget}.json"


def _validate_typescript_artifact(
    value: Mapping[str, Any],
    *,
    case_id: str,
    budget: int,
    snapshot_sha256: str,
    input_sha256: str,
) -> dict[str, Any]:
    if value.get("schemaVersion") != 1:
        raise ValueError("TypeScript run artifact schemaVersion must be 1")
    if value.get("problemId") != case_id:
        raise ValueError("TypeScript run artifact problemId does not match case")
    if value.get("inputSha256") != input_sha256:
        raise ValueError("TypeScript run artifact inputSha256 does not match snapshot cell")
    if value.get("maxFilters") != 10:
        raise ValueError("TypeScript capacity study artifacts must be Max10")
    if value.get("referenceSnapshotSha256") != snapshot_sha256:
        raise ValueError("TypeScript run artifact snapshot hash does not match study snapshot")
    if value.get("evaluationBudget") != budget:
        raise ValueError("TypeScript run artifact evaluation budget does not match study round")
    trajectory = value.get("trajectory")
    if not isinstance(trajectory, list) or not trajectory:
        raise ValueError("TypeScript run artifact trajectory must be non-empty")
    last = trajectory[-1]
    if not isinstance(last, Mapping):
        raise ValueError("TypeScript run artifact final trajectory point must be an object")
    required = (
        "canonicalRmseDb",
        "canonicalMaxAbsDb",
        "actualDeliveredFilterCount",
        "referenceRegret",
        "referenceImproved",
    )
    if any(field not in last for field in required):
        raise ValueError("TypeScript run artifact final trajectory point is incomplete")
    return {
        "artifactSha256": _sha256_file(Path(value["__path"])),
        "algorithmId": value.get("algorithmId"),
        "variantId": value.get("variantId"),
        "seed": value.get("seed"),
        "evaluationBudget": budget,
        "canonicalRmseDb": last["canonicalRmseDb"],
        "canonicalMaxAbsDb": last["canonicalMaxAbsDb"],
        "actualDeliveredFilterCount": last["actualDeliveredFilterCount"],
        "referenceRegret": last["referenceRegret"],
        "referenceImproved": last["referenceImproved"],
        "qualityTimeFrontierV1": value.get("qualityTimeFrontierV1"),
        "metadata": value.get("metadata", {}),
    }


def _snapshot_high_cap_observation(
    snapshot,
    case_id: str,
    max_filters: int,
    max10_reference,
) -> HighCapObservation:
    matching = [
        cell for cell in snapshot.cells
        if cell.problem_id == case_id and
        cell.input_sha256 == max10_reference.input_sha256 and
        cell.max_filters == max_filters
    ]
    if not matching:
        return HighCapObservation(
            case_id=case_id,
            max_filters=max_filters,
            available=False,
            canonical_rmse_db=None,
            canonical_max_abs_db=None,
            actual_delivered_filter_count=None,
            pareto_reference_relationship="not-compared",
            reference_state=None,
            raw_deltas_vs_max10={},
            provenance="snapshot-cell-unavailable",
            config_hash="unavailable",
            input_sha256=max10_reference.input_sha256,
            reference_snapshot_sha256=snapshot.content_sha256,
            solvability_conclusion="insufficient-evidence",
        )
    cell = matching[0]
    frontier_ids = set(cell.deliverable_frontier_candidate_ids)
    candidates = [candidate for candidate in cell.candidates if candidate.candidate_id in frontier_ids]
    if not candidates:
        return HighCapObservation(
            case_id=case_id,
            max_filters=max_filters,
            available=False,
            canonical_rmse_db=None,
            canonical_max_abs_db=None,
            actual_delivered_filter_count=None,
            pareto_reference_relationship="not-compared",
            reference_state=cell.reference_state,
            raw_deltas_vs_max10={},
            provenance="snapshot-frontier-unavailable",
            config_hash="unavailable",
            input_sha256=cell.input_sha256,
            reference_snapshot_sha256=snapshot.content_sha256,
            solvability_conclusion="insufficient-evidence",
        )
    candidate = min(candidates, key=lambda value: (value.canonical_rmse_db, value.canonical_max_abs_db, value.candidate_id))
    high_point = {
        "rmse": candidate.canonical_rmse_db,
        "max": candidate.canonical_max_abs_db,
    }
    relationship = "incomparable"
    if high_point["rmse"] <= max10_reference.canonical_rmse_db and high_point["max"] <= max10_reference.canonical_max_abs_db and (
        high_point["rmse"] < max10_reference.canonical_rmse_db or
        high_point["max"] < max10_reference.canonical_max_abs_db
    ):
        relationship = "strictly-dominates-max10"
    elif (
        max10_reference.canonical_rmse_db <= high_point["rmse"] and
        max10_reference.canonical_max_abs_db <= high_point["max"] and
        (
            max10_reference.canonical_rmse_db < high_point["rmse"] or
            max10_reference.canonical_max_abs_db < high_point["max"]
        )
    ):
        relationship = "dominated-by-max10"
    elif high_point["rmse"] == max10_reference.canonical_rmse_db and high_point["max"] == max10_reference.canonical_max_abs_db:
        relationship = "equal"
    return HighCapObservation(
        case_id=case_id,
        max_filters=max_filters,
        available=True,
        canonical_rmse_db=candidate.canonical_rmse_db,
        canonical_max_abs_db=candidate.canonical_max_abs_db,
        actual_delivered_filter_count=candidate.actual_delivered_filter_count,
        pareto_reference_relationship=relationship,
        reference_state=cell.reference_state,
        raw_deltas_vs_max10={
            "rmseDb": candidate.canonical_rmse_db - max10_reference.canonical_rmse_db,
            "maxAbsDb": candidate.canonical_max_abs_db - max10_reference.canonical_max_abs_db,
        },
        provenance=candidate.provenance,
        config_hash="snapshot-reference-cell",
        input_sha256=cell.input_sha256,
        reference_snapshot_sha256=snapshot.content_sha256,
        # A snapshot cell alone does not prove Max40/64 search solvability.
        solvability_conclusion="insufficient-evidence",
    )


def _unavailable_high_cap_check(case_id: str) -> dict[str, Any]:
    observations = [
        {
            "maxFilters": capacity,
            "available": False,
            "canonicalDeliveredRmseDb": None,
            "canonicalDeliveredMaxAbsDb": None,
            "actualDeliveredFilterCount": None,
            "paretoReferenceRelationship": "not-compared",
            "referenceState": None,
            "rawDeltasVsMax10": {},
            "provenance": "reference-cell-unavailable",
            "configHash": "unavailable",
            "inputSha256": "unavailable",
            "referenceSnapshotSha256": "unavailable",
            "referenceStillMoving": False,
            "solvabilityConclusion": "insufficient-evidence",
        }
        for capacity in (40, 64)
    ]
    return {
        "caseId": case_id,
        "requiredCapacities": [40],
        "conclusion": "insufficient-evidence",
        "blocksCapLimited": True,
        "observations": observations,
    }


def _observation_mapping(observation: HighCapObservation) -> dict[str, Any]:
    return {
        "maxFilters": observation.max_filters,
        "available": observation.available,
        "canonicalDeliveredRmseDb": observation.canonical_rmse_db,
        "canonicalDeliveredMaxAbsDb": observation.canonical_max_abs_db,
        "actualDeliveredFilterCount": observation.actual_delivered_filter_count,
        "paretoReferenceRelationship": observation.pareto_reference_relationship,
        "referenceState": observation.reference_state,
        "rawDeltasVsMax10": observation.raw_deltas_vs_max10,
        "provenance": observation.provenance,
        "configHash": observation.config_hash,
        "inputSha256": observation.input_sha256,
        "referenceSnapshotSha256": observation.reference_snapshot_sha256,
        "referenceStillMoving": observation.reference_still_moving,
        "solvabilityConclusion": observation.solvability_conclusion,
    }


def build_capacity_study_report(
    snapshot_path: str | Path,
    typescript_run_dir: str | Path,
    cases: Sequence[str] = CAPACITY_STUDY_CASES,
    evaluation_budgets: Sequence[int] = CAPACITY_STUDY_EVALUATION_BUDGETS,
    seeds: Sequence[int] = CAPACITY_STUDY_SEEDS,
) -> dict[str, Any]:
    validate_study_configuration(cases, evaluation_budgets, seeds)
    snapshot_file = Path(snapshot_path)
    if not snapshot_file.is_file():
        return {
            "schemaVersion": 1,
            "program": "autoeq-capacity-aware-solver",
            "status": "blocked",
            "snapshot": {"path": str(snapshot_file), "contentSha256": None, "createdFromRepositorySha": None},
            "configuration": {
                "cases": list(cases),
                "evaluationBudgets": list(evaluation_budgets),
                "seeds": list(seeds),
                "typescriptPolicies": ["resumable-beam-v1", "state-bank-v1"],
                "pythonMechanisms": ["matching-pursuit", "structural-beam-4", "structural-beam-12", "matching-pursuit->structural-beam-4"],
                "capacities": list(CAPACITY_STUDY_CAPACITIES),
            },
            "typescriptRuns": [],
            "pythonRuns": [],
            "teacherAttempts": [],
            "highCapChecks": [_unavailable_high_cap_check(case_id) for case_id in cases],
            "classifications": [
                {
                    "caseId": case_id,
                    "classification": "capacity-suspected",
                    "reason": "corrected Oracle reference snapshot is unavailable",
                    "highCapSolvability": "insufficient-evidence",
                    "highCapStrictAdvantage": False,
                    "allOfficialTeachersAttempted": False,
                    "compressionAttemptCount": 0,
                }
                for case_id in cases
            ],
            "shortlist": [],
            "blockers": [
                f"oracle-reference-snapshot-unavailable:{snapshot_file}",
                *_evidence_collection_blockers(),
            ],
            "holdout": {"executed": False},
            "productionPromotion": {"executed": False},
        }
    snapshot = load_reference_snapshot(snapshot_file)
    run_dir = Path(typescript_run_dir)
    blockers: list[str] = _evidence_collection_blockers()
    ts_runs: list[dict[str, Any]] = []
    high_cap_checks: list[dict[str, Any]] = []
    classifications: list[dict[str, Any]] = []
    for case_id in cases:
        max10_cells = [
            cell for cell in snapshot.cells
            if cell.problem_id == case_id and cell.max_filters == 10
        ]
        if not max10_cells:
            blockers.append(f"missing-max10-reference-cell:{case_id}")
            high_cap_checks.append(_unavailable_high_cap_check(case_id))
            classifications.append({
                "caseId": case_id,
                "classification": "capacity-suspected",
                "reason": "Max10 reference cell is unavailable",
                "highCapSolvability": "insufficient-evidence",
                "highCapStrictAdvantage": False,
                "allOfficialTeachersAttempted": False,
                "compressionAttemptCount": 0,
            })
            continue
        max10_cell = max10_cells[0]
        max10_ids = set(max10_cell.deliverable_frontier_candidate_ids)
        max10_candidates = [candidate for candidate in max10_cell.candidates if candidate.candidate_id in max10_ids]
        if not max10_candidates:
            blockers.append(f"missing-max10-deliverable-frontier:{case_id}")
            high_cap_checks.append(_unavailable_high_cap_check(case_id))
            classifications.append({
                "caseId": case_id,
                "classification": "capacity-suspected",
                "reason": "Max10 delivered frontier is unavailable",
                "highCapSolvability": "insufficient-evidence",
                "highCapStrictAdvantage": False,
                "allOfficialTeachersAttempted": False,
                "compressionAttemptCount": 0,
            })
            continue
        max10_reference = min(max10_candidates, key=lambda value: (value.canonical_rmse_db, value.canonical_max_abs_db, value.candidate_id))
        observations = tuple(
            _snapshot_high_cap_observation(snapshot, case_id, capacity, max10_reference)
            for capacity in (40, 64)
        )
        check = evaluate_high_cap_solvability(observations)
        high_cap_checks.append({
            "caseId": case_id,
            "requiredCapacities": list(check.required_capacities),
            "conclusion": check.conclusion,
            "blocksCapLimited": check.blocks_cap_limited,
            "observations": [_observation_mapping(observation) for observation in check.observations],
        })
        for budget in evaluation_budgets:
            for policy in ("resumable-beam-v1", "state-bank-v1"):
                path = _artifact_path(run_dir, case_id, policy, budget)
                if not path.is_file():
                    blockers.append(f"missing-typescript-run:{path}")
                    continue
                try:
                    raw = _read_json(path)
                    if not isinstance(raw, Mapping):
                        raise ValueError("artifact must be an object")
                    with_path = {**raw, "__path": str(path)}
                    ts_runs.append(_validate_typescript_artifact(
                        with_path,
                        case_id=case_id,
                        budget=budget,
                        snapshot_sha256=snapshot.content_sha256,
                        input_sha256=max10_cell.input_sha256,
                    ))
                except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
                    blockers.append(f"invalid-typescript-run:{path}:{error}")
        classifications.append({
            "caseId": case_id,
            "classification": "capacity-suspected",
            "reason": "fixed-cap and compression evidence must be populated before classification",
            "max10ReferenceState": max10_cell.reference_state,
            "highCapReferenceState": "still-moving" if any(observation.reference_still_moving for observation in observations) else "stable-under-current-search",
            "highCapSolvability": check.conclusion,
            "highCapStrictAdvantage": any(observation.pareto_reference_relationship == "strictly-dominates-max10" for observation in observations),
            "allOfficialTeachersAttempted": False,
            "compressionAttemptCount": 0,
        })
    status = "blocked" if blockers else "evidence-ready-for-analysis"
    return {
        "schemaVersion": 1,
        "program": "autoeq-capacity-aware-solver",
        "status": status,
        "snapshot": {
            "path": str(snapshot_file),
            "contentSha256": snapshot.content_sha256,
            "createdFromRepositorySha": snapshot.created_from_repository_sha,
        },
        "configuration": {
            "cases": list(cases),
            "evaluationBudgets": list(evaluation_budgets),
            "seeds": list(seeds),
            "typescriptPolicies": ["resumable-beam-v1", "state-bank-v1"],
            "pythonMechanisms": ["matching-pursuit", "structural-beam-4", "structural-beam-12", "matching-pursuit->structural-beam-4"],
            "capacities": list(CAPACITY_STUDY_CAPACITIES),
        },
        "typescriptRuns": ts_runs,
        "pythonRuns": [],
        "teacherAttempts": [],
        "highCapChecks": high_cap_checks,
        "classifications": classifications,
        "shortlist": [],
        "blockers": blockers,
        "holdout": {"executed": False},
        "productionPromotion": {"executed": False},
    }


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the directed AutoEQ Capacity-Aware Solver study")
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--typescript-run-dir", required=True)
    parser.add_argument("--cases", required=True)
    parser.add_argument("--evaluation-budgets", required=True)
    parser.add_argument("--seeds", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    report = build_capacity_study_report(
        args.snapshot,
        args.typescript_run_dir,
        tuple(args.cases.split(",")),
        tuple(int(value) for value in args.evaluation_budgets.split(",")),
        tuple(int(value) for value in args.seeds.split(",")),
    )
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    (output / "capacity-study-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
