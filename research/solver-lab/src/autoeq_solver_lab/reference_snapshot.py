"""Immutable, best-known deliverable reference snapshots for solver research."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any, Literal

from .io import parse_candidate, parse_evaluation, parse_filter, read_candidates
from .pareto import nondominated
from .types import LabFilter, ObjectivePoint


ReferenceState = Literal["stable-under-current-search", "still-moving"]

_REFERENCE_STATES = {"stable-under-current-search", "still-moving"}
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_GIT_SHA = re.compile(r"^[a-f0-9]{40}$")
_REQUIRED_AGGREGATE_FILES = (
    "campaign-manifest.json",
    "control-aggregate.json",
    "continuous-aggregate.json",
    "deliverable-aggregate.json",
    "continuous-aggregate.json.candidates.jsonl",
    "deliverable-aggregate.json.candidates.jsonl",
)
_STAGE_RANK = {"smoke": 0, "screen": 1, "confirm": 2, "deep": 3, "full": 4}
_REQUIRED_CASES = ("titan-to-storm", "titan-to-u12t", "titan-to-trio")


@dataclass(frozen=True)
class ReferenceCandidateV1:
    candidate_id: str
    problem_id: str
    input_sha256: str
    max_filters: int
    actual_delivered_filter_count: int
    filters: tuple[LabFilter, ...]
    canonical_rmse_db: float
    canonical_max_abs_db: float
    algorithm_id: str
    seed: int | None
    provenance: str


@dataclass(frozen=True)
class ReferenceCellV1:
    problem_id: str
    input_sha256: str
    max_filters: int
    reference_state: ReferenceState
    control_candidate_id: str
    candidates: tuple[ReferenceCandidateV1, ...]
    deliverable_frontier_candidate_ids: tuple[str, ...]
    continuous_diagnostic_frontier: tuple[ObjectivePoint, ...]


@dataclass(frozen=True)
class OracleReferenceSnapshotV1:
    version: Literal[1]
    created_from_repository_sha: str
    corpus_version: str
    canonical_evaluator_version: str
    cells: tuple[ReferenceCellV1, ...]
    content_sha256: str


def canonical_snapshot_payload(value: Mapping[str, Any]) -> str:
    """Serialize a JSON mapping using the snapshot's canonical representation."""

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def snapshot_content_sha256(value_without_content_hash: Mapping[str, Any]) -> str:
    return hashlib.sha256(
        canonical_snapshot_payload(value_without_content_hash).encode("utf-8")
    ).hexdigest()


def _record(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def _strict_keys(value: Mapping[str, Any], expected: set[str], label: str) -> None:
    missing = expected - set(value)
    unknown = set(value) - expected
    if missing:
        raise ValueError(f"{label} missing required field(s): {', '.join(sorted(missing))}")
    if unknown:
        raise ValueError(f"{label} contains unknown field(s): {', '.join(sorted(unknown))}")


def _string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _integer(value: Any, label: str, *, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise ValueError(f"{label} must be at least {minimum}")
    return value


def _sha256(value: Any, label: str) -> str:
    text = _string(value, label)
    if _SHA256.fullmatch(text) is None:
        raise ValueError(f"{label} must be a SHA-256 hex digest")
    return text


def _reference_candidate_from_mapping(value: Any, label: str) -> ReferenceCandidateV1:
    record = _record(value, label)
    _strict_keys(record, {
        "candidateId",
        "problemId",
        "inputSha256",
        "maxFilters",
        "actualDeliveredFilterCount",
        "filters",
        "canonicalRmseDb",
        "canonicalMaxAbsDb",
        "algorithmId",
        "seed",
        "provenance",
    }, label)
    raw_filters = record["filters"]
    if not isinstance(raw_filters, Sequence) or isinstance(raw_filters, (str, bytes)):
        raise ValueError(f"{label}.filters must be an array")
    filters = tuple(
        parse_filter(filter_value, f"{label}.filters[{index}]")
        for index, filter_value in enumerate(raw_filters)
    )
    max_filters = _integer(record["maxFilters"], f"{label}.maxFilters", minimum=1)
    delivered_count = _integer(
        record["actualDeliveredFilterCount"],
        f"{label}.actualDeliveredFilterCount",
        minimum=0,
    )
    if delivered_count > max_filters:
        raise ValueError(f"{label}.actualDeliveredFilterCount exceeds maxFilters")
    if delivered_count != len(filters):
        raise ValueError(f"{label}.actualDeliveredFilterCount does not match filters")
    seed = record["seed"]
    if seed is not None:
        seed = _integer(seed, f"{label}.seed")
    return ReferenceCandidateV1(
        candidate_id=_string(record["candidateId"], f"{label}.candidateId"),
        problem_id=_string(record["problemId"], f"{label}.problemId"),
        input_sha256=_sha256(record["inputSha256"], f"{label}.inputSha256"),
        max_filters=max_filters,
        actual_delivered_filter_count=delivered_count,
        filters=filters,
        canonical_rmse_db=_finite(record["canonicalRmseDb"], f"{label}.canonicalRmseDb"),
        canonical_max_abs_db=_finite(record["canonicalMaxAbsDb"], f"{label}.canonicalMaxAbsDb"),
        algorithm_id=_string(record["algorithmId"], f"{label}.algorithmId"),
        seed=seed,
        provenance=_string(record["provenance"], f"{label}.provenance"),
    )


def _objective_point_from_mapping(value: Any, label: str) -> ObjectivePoint:
    record = _record(value, label)
    _strict_keys(record, {"candidateId", "rmseDb", "maxAbsDb", "filterCount"}, label)
    return ObjectivePoint(
        candidate_id=_string(record["candidateId"], f"{label}.candidateId"),
        rmse_db=_finite(record["rmseDb"], f"{label}.rmseDb"),
        max_abs_db=_finite(record["maxAbsDb"], f"{label}.maxAbsDb"),
        filter_count=_integer(record["filterCount"], f"{label}.filterCount", minimum=0),
    )


def _snapshot_without_hash_mapping(snapshot: OracleReferenceSnapshotV1) -> dict[str, Any]:
    return {
        "version": snapshot.version,
        "createdFromRepositorySha": snapshot.created_from_repository_sha,
        "corpusVersion": snapshot.corpus_version,
        "canonicalEvaluatorVersion": snapshot.canonical_evaluator_version,
        "cells": [
            {
                "problemId": cell.problem_id,
                "inputSha256": cell.input_sha256,
                "maxFilters": cell.max_filters,
                "referenceState": cell.reference_state,
                "controlCandidateId": cell.control_candidate_id,
                "candidates": [
                    {
                        "candidateId": candidate.candidate_id,
                        "problemId": candidate.problem_id,
                        "inputSha256": candidate.input_sha256,
                        "maxFilters": candidate.max_filters,
                        "actualDeliveredFilterCount": candidate.actual_delivered_filter_count,
                        "filters": [asdict(filter_) for filter_ in candidate.filters],
                        "canonicalRmseDb": candidate.canonical_rmse_db,
                        "canonicalMaxAbsDb": candidate.canonical_max_abs_db,
                        "algorithmId": candidate.algorithm_id,
                        "seed": candidate.seed,
                        "provenance": candidate.provenance,
                    }
                    for candidate in cell.candidates
                ],
                "deliverableFrontierCandidateIds": list(cell.deliverable_frontier_candidate_ids),
                "continuousDiagnosticFrontier": [
                    {
                        "candidateId": point.candidate_id,
                        "rmseDb": point.rmse_db,
                        "maxAbsDb": point.max_abs_db,
                        "filterCount": point.filter_count,
                    }
                    for point in cell.continuous_diagnostic_frontier
                ],
            }
            for cell in snapshot.cells
        ],
    }


def _validate_snapshot(snapshot: OracleReferenceSnapshotV1) -> None:
    if snapshot.version != 1:
        raise ValueError("snapshot version must be 1")
    repository_sha = snapshot.created_from_repository_sha
    if _GIT_SHA.fullmatch(repository_sha) is None and _SHA256.fullmatch(repository_sha) is None:
        raise ValueError("snapshot created_from_repository_sha must be a Git or SHA-256 hex digest")
    if set(repository_sha) == {"0"}:
        raise ValueError("snapshot repository SHA must not be zero")
    if not snapshot.corpus_version:
        raise ValueError("snapshot corpus_version is required")
    if not snapshot.canonical_evaluator_version:
        raise ValueError("snapshot canonical_evaluator_version is required")
    if not snapshot.cells:
        raise ValueError("snapshot must contain at least one cell")
    cell_keys: set[tuple[str, str, int]] = set()
    candidate_ids: set[str] = set()
    for cell_index, cell in enumerate(snapshot.cells):
        label = f"cells[{cell_index}]"
        key = (cell.problem_id, cell.input_sha256, cell.max_filters)
        if key in cell_keys:
            raise ValueError(f"duplicate reference cell {key}")
        cell_keys.add(key)
        _string(cell.problem_id, f"{label}.problem_id")
        _sha256(cell.input_sha256, f"{label}.input_sha256")
        _integer(cell.max_filters, f"{label}.max_filters", minimum=1)
        if cell.reference_state not in _REFERENCE_STATES:
            raise ValueError(f"{label}.reference_state is invalid")
        _string(cell.control_candidate_id, f"{label}.control_candidate_id")
        cell_candidate_ids: set[str] = set()
        for candidate_index, candidate in enumerate(cell.candidates):
            candidate_label = f"{label}.candidates[{candidate_index}]"
            if candidate.candidate_id in candidate_ids:
                raise ValueError(f"duplicate candidate ID {candidate.candidate_id}")
            candidate_ids.add(candidate.candidate_id)
            cell_candidate_ids.add(candidate.candidate_id)
            if candidate.problem_id != cell.problem_id:
                raise ValueError(f"{candidate_label}.problem_id does not match cell")
            if candidate.input_sha256 != cell.input_sha256:
                raise ValueError(f"{candidate_label}.input_sha256 does not match cell")
            if candidate.max_filters != cell.max_filters:
                raise ValueError(f"{candidate_label}.max_filters does not match cell")
            if candidate.actual_delivered_filter_count > cell.max_filters:
                raise ValueError(f"{candidate_label}.actual_delivered_filter_count exceeds cell cap")
            if len(candidate.filters) != candidate.actual_delivered_filter_count:
                raise ValueError(f"{candidate_label}.filters does not match delivered count")
            if not math.isfinite(candidate.canonical_rmse_db) or not math.isfinite(candidate.canonical_max_abs_db):
                raise ValueError(f"{candidate_label} metrics must be finite")
        if cell.control_candidate_id not in cell_candidate_ids:
            raise ValueError(f"{label}.control_candidate_id is absent from candidates")
        for frontier_id in cell.deliverable_frontier_candidate_ids:
            if frontier_id not in cell_candidate_ids:
                raise ValueError(f"frontier candidate ID {frontier_id} is absent from candidates")
        diagnostic_ids: set[str] = set()
        for point_index, point in enumerate(cell.continuous_diagnostic_frontier):
            if point.candidate_id in diagnostic_ids:
                raise ValueError(f"duplicate diagnostic candidate ID {point.candidate_id}")
            diagnostic_ids.add(point.candidate_id)
            if not math.isfinite(point.rmse_db) or not math.isfinite(point.max_abs_db):
                raise ValueError(f"{label}.continuous_diagnostic_frontier[{point_index}] metrics must be finite")
    expected_hash = snapshot_content_sha256(_snapshot_without_hash_mapping(snapshot))
    if _SHA256.fullmatch(snapshot.content_sha256) is None:
        raise ValueError("snapshot contentSha256 must be a SHA-256 hex digest")
    if expected_hash != snapshot.content_sha256:
        raise ValueError("snapshot contentSha256 does not match canonical content")


def parse_reference_snapshot(value: Mapping[str, Any]) -> OracleReferenceSnapshotV1:
    record = _record(value, "snapshot")
    _strict_keys(record, {
        "version",
        "createdFromRepositorySha",
        "corpusVersion",
        "canonicalEvaluatorVersion",
        "cells",
        "contentSha256",
    }, "snapshot")
    if record["version"] != 1:
        raise ValueError("snapshot version must be 1")
    raw_cells = record["cells"]
    if not isinstance(raw_cells, Sequence) or isinstance(raw_cells, (str, bytes)):
        raise ValueError("snapshot cells must be an array")
    cells: list[ReferenceCellV1] = []
    for cell_index, raw_cell in enumerate(raw_cells):
        label = f"snapshot.cells[{cell_index}]"
        cell_record = _record(raw_cell, label)
        _strict_keys(cell_record, {
            "problemId",
            "inputSha256",
            "maxFilters",
            "referenceState",
            "controlCandidateId",
            "candidates",
            "deliverableFrontierCandidateIds",
            "continuousDiagnosticFrontier",
        }, label)
        raw_candidates = cell_record["candidates"]
        if not isinstance(raw_candidates, Sequence) or isinstance(raw_candidates, (str, bytes)):
            raise ValueError(f"{label}.candidates must be an array")
        candidates = tuple(
            _reference_candidate_from_mapping(candidate, f"{label}.candidates[{index}]")
            for index, candidate in enumerate(raw_candidates)
        )
        raw_frontier_ids = cell_record["deliverableFrontierCandidateIds"]
        if not isinstance(raw_frontier_ids, Sequence) or isinstance(raw_frontier_ids, (str, bytes)):
            raise ValueError(f"{label}.deliverableFrontierCandidateIds must be an array")
        frontier_ids = tuple(
            _string(identifier, f"{label}.deliverableFrontierCandidateIds[{index}]")
            for index, identifier in enumerate(raw_frontier_ids)
        )
        raw_diagnostic = cell_record["continuousDiagnosticFrontier"]
        if not isinstance(raw_diagnostic, Sequence) or isinstance(raw_diagnostic, (str, bytes)):
            raise ValueError(f"{label}.continuousDiagnosticFrontier must be an array")
        diagnostic = tuple(
            _objective_point_from_mapping(point, f"{label}.continuousDiagnosticFrontier[{index}]")
            for index, point in enumerate(raw_diagnostic)
        )
        reference_state = cell_record["referenceState"]
        if reference_state not in _REFERENCE_STATES:
            raise ValueError(f"{label}.referenceState is invalid")
        cells.append(ReferenceCellV1(
            problem_id=_string(cell_record["problemId"], f"{label}.problemId"),
            input_sha256=_sha256(cell_record["inputSha256"], f"{label}.inputSha256"),
            max_filters=_integer(cell_record["maxFilters"], f"{label}.maxFilters", minimum=1),
            reference_state=reference_state,
            control_candidate_id=_string(cell_record["controlCandidateId"], f"{label}.controlCandidateId"),
            candidates=candidates,
            deliverable_frontier_candidate_ids=frontier_ids,
            continuous_diagnostic_frontier=diagnostic,
        ))
    snapshot = OracleReferenceSnapshotV1(
        version=1,
        created_from_repository_sha=_string(record["createdFromRepositorySha"], "snapshot.createdFromRepositorySha"),
        corpus_version=_string(record["corpusVersion"], "snapshot.corpusVersion"),
        canonical_evaluator_version=_string(record["canonicalEvaluatorVersion"], "snapshot.canonicalEvaluatorVersion"),
        cells=tuple(cells),
        content_sha256=_string(record["contentSha256"], "snapshot.contentSha256"),
    )
    _validate_snapshot(snapshot)
    return snapshot


def snapshot_to_mapping(snapshot: OracleReferenceSnapshotV1) -> dict[str, Any]:
    _validate_snapshot(snapshot)
    return {
        **_snapshot_without_hash_mapping(snapshot),
        "contentSha256": snapshot.content_sha256,
    }


def serialize_reference_snapshot(snapshot: OracleReferenceSnapshotV1) -> str:
    return canonical_snapshot_payload(snapshot_to_mapping(snapshot))


def load_reference_snapshot(path: str | Path) -> OracleReferenceSnapshotV1:
    def reject_constant(value: str) -> Any:
        raise ValueError(f"{path} contains non-finite JSON value {value}")

    value = json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject_constant)
    return parse_reference_snapshot(value)


def write_reference_snapshot(path: str | Path, snapshot: OracleReferenceSnapshotV1) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(serialize_reference_snapshot(snapshot) + "\n", encoding="utf-8")


def _read_json_object(path: Path) -> dict[str, Any]:
    def reject_constant(value: str) -> Any:
        raise ValueError(f"{path} contains non-finite JSON value {value}")

    value = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def discover_oracle_aggregates(campaign_root: str | Path) -> tuple[Path, ...]:
    root = Path(campaign_root)
    if not root.is_dir():
        raise ValueError(f"Oracle evidence directory does not exist: {root}")
    discovered = [
        manifest.parent
        for manifest in root.rglob("campaign-manifest.json")
        if all((manifest.parent / name).is_file() for name in _REQUIRED_AGGREGATE_FILES)
    ]
    return tuple(sorted(set(discovered), key=lambda path: str(path)))


def _aggregate_hash(root: Path) -> str:
    digest = hashlib.sha256()
    for name in _REQUIRED_AGGREGATE_FILES:
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update((root / name).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _load_aggregate_evidence(root: Path) -> dict[str, Any]:
    from .calibration import validate_oracle_campaign

    manifest = _read_json_object(root / "campaign-manifest.json")
    control = _read_json_object(root / "control-aggregate.json")
    continuous = _read_json_object(root / "continuous-aggregate.json")
    deliverable = _read_json_object(root / "deliverable-aggregate.json")
    validation = validate_oracle_campaign(control, continuous, deliverable)
    if validation.get("valid") is not True:
        errors = "; ".join(str(error) for error in validation.get("errors", ()))
        raise ValueError(f"Oracle aggregate {root} failed validation: {errors}")
    if manifest.get("complete") is not True:
        raise ValueError(f"Oracle aggregate {root} is incomplete")
    candidate_path = root / "deliverable-aggregate.json.candidates.jsonl"
    candidates = {candidate.candidateId: candidate for candidate in read_candidates(candidate_path)}
    return {
        "root": root,
        "manifest": manifest,
        "control": control,
        "continuous": continuous,
        "deliverable": deliverable,
        "candidates": candidates,
        "hash": _aggregate_hash(root),
    }


def _new_group() -> dict[str, Any]:
    return {
        "candidates": {},
        "controlIds": set(),
        "diagnostic": {},
        "evidence": [],
    }


def _make_snapshot_from_evidence(
    evidence: Sequence[Mapping[str, Any]],
    *,
    repository_sha: str,
    corpus_version: str,
    canonical_evaluator_version: str,
) -> OracleReferenceSnapshotV1:
    grouped: dict[tuple[str, str, int], dict[str, Any]] = {}
    for item in evidence:
        aggregate_hash = str(item["hash"])
        manifest = item["manifest"]
        control = item["control"]
        continuous = item["continuous"]
        deliverable = item["deliverable"]
        stage_rank = _STAGE_RANK.get(manifest.get("campaignMode"), -1)
        convergence = manifest.get("convergence")

        for raw_point in control.get("points", ()):
            if not isinstance(raw_point, Mapping):
                continue
            try:
                problem_id = _string(raw_point.get("problemId"), "control point problemId")
                input_sha256 = _sha256(raw_point.get("inputSha256"), "control point inputSha256")
                max_filters = _integer(raw_point.get("maxFilters"), "control point maxFilters", minimum=1)
                raw_filters = raw_point.get("filters")
                if not isinstance(raw_filters, Sequence) or isinstance(raw_filters, (str, bytes)):
                    raise ValueError("control point filters must be an array")
                filters = tuple(parse_filter(value, "control point filter") for value in raw_filters)
                delivered_count = _integer(raw_point.get("deliveredFilterCount"), "control point deliveredFilterCount", minimum=0)
                if delivered_count != len(filters) or delivered_count > max_filters:
                    raise ValueError("control point delivered count is invalid")
                control_candidate = ReferenceCandidateV1(
                    candidate_id=_string(raw_point.get("candidateId"), "control point candidateId"),
                    problem_id=problem_id,
                    input_sha256=input_sha256,
                    max_filters=max_filters,
                    actual_delivered_filter_count=delivered_count,
                    filters=filters,
                    canonical_rmse_db=_finite(raw_point.get("rmseDb"), "control point rmseDb"),
                    canonical_max_abs_db=_finite(raw_point.get("maxAbsDb"), "control point maxAbsDb"),
                    algorithm_id="standard-v2-control",
                    seed=None,
                    provenance=f"standard-v2-control;sourceAggregateSha256={aggregate_hash}",
                )
            except (TypeError, ValueError):
                continue
            key = (control_candidate.problem_id, control_candidate.input_sha256, control_candidate.max_filters)
            cell = grouped.setdefault(key, _new_group())
            existing = cell["candidates"].get(control_candidate.candidate_id)
            if existing is not None and existing != control_candidate:
                raise ValueError(f"candidate ID {control_candidate.candidate_id} has conflicting aggregate evidence")
            cell["candidates"][control_candidate.candidate_id] = control_candidate
            cell["controlIds"].add(control_candidate.candidate_id)
            cell["evidence"].append({
                "stageRank": stage_rank,
                "convergence": convergence,
                "problemId": control_candidate.problem_id,
                "aggregateHash": aggregate_hash,
            })

        for raw_frontier in deliverable.get("frontiers", ()):
            if not isinstance(raw_frontier, Mapping) or raw_frontier.get("frontierType") != "maxFilters":
                continue
            cap = raw_frontier.get("maxFilters")
            if isinstance(cap, bool) or not isinstance(cap, int) or cap <= 0:
                continue
            for raw_point in raw_frontier.get("points", ()):
                if not isinstance(raw_point, Mapping):
                    continue
                try:
                    candidate = parse_candidate(_record(raw_point.get("candidate"), "deliverable frontier candidate"))
                    evaluation = parse_evaluation(_record(raw_point.get("evaluation"), "deliverable frontier evaluation"))
                    if not evaluation.valid or evaluation.deliverable is None:
                        continue
                    delivered_filters = tuple(evaluation.deliverableFilters)
                    reference_candidate = ReferenceCandidateV1(
                        candidate_id=candidate.candidateId,
                        problem_id=candidate.problemId,
                        input_sha256=candidate.inputSha256,
                        max_filters=cap,
                        actual_delivered_filter_count=len(delivered_filters),
                        filters=delivered_filters,
                        canonical_rmse_db=evaluation.deliverable.rmseDb,
                        canonical_max_abs_db=evaluation.deliverable.maxAbsDb,
                        algorithm_id=candidate.algorithmId,
                        seed=candidate.seed,
                        provenance=f"{candidate.algorithmId};sourceAggregateSha256={aggregate_hash}",
                    )
                    if reference_candidate.actual_delivered_filter_count > cap:
                        continue
                except (TypeError, ValueError):
                    continue
                key = (reference_candidate.problem_id, reference_candidate.input_sha256, cap)
                cell = grouped.setdefault(key, _new_group())
                existing = cell["candidates"].get(reference_candidate.candidate_id)
                if existing is not None and existing != reference_candidate:
                    raise ValueError(f"candidate ID {reference_candidate.candidate_id} has conflicting aggregate evidence")
                cell["candidates"][reference_candidate.candidate_id] = reference_candidate
                cell["evidence"].append({
                    "stageRank": stage_rank,
                    "convergence": convergence,
                    "problemId": reference_candidate.problem_id,
                    "aggregateHash": aggregate_hash,
                })

        for raw_frontier in continuous.get("frontiers", ()):
            if not isinstance(raw_frontier, Mapping):
                continue
            frontier_cap = raw_frontier.get("maxFilters", raw_frontier.get("exactFilterCount"))
            if isinstance(frontier_cap, bool) or not isinstance(frontier_cap, int) or frontier_cap <= 0:
                continue
            for raw_point in raw_frontier.get("points", ()):
                if not isinstance(raw_point, Mapping):
                    continue
                try:
                    candidate = parse_candidate(_record(raw_point.get("candidate"), "continuous frontier candidate"))
                    evaluation = parse_evaluation(_record(raw_point.get("evaluation"), "continuous frontier evaluation"))
                    if not evaluation.valid or evaluation.continuous is None:
                        continue
                except (TypeError, ValueError):
                    continue
                key = (candidate.problemId, candidate.inputSha256, int(frontier_cap))
                cell = grouped.setdefault(key, _new_group())
                point = ObjectivePoint(
                    candidate_id=candidate.candidateId,
                    rmse_db=evaluation.continuous.rmseDb,
                    max_abs_db=evaluation.continuous.maxAbsDb,
                    filter_count=len(candidate.filters),
                )
                cell["diagnostic"][point.candidate_id] = point

    cells: list[ReferenceCellV1] = []
    for (problem_id, input_sha256, max_filters), value in grouped.items():
        candidates = tuple(sorted(value["candidates"].values(), key=lambda candidate: candidate.candidate_id))
        if not candidates:
            continue
        candidate_ids = {candidate.candidate_id for candidate in candidates}
        control_ids = sorted(value["controlIds"] & candidate_ids)
        if not control_ids:
            control_ids = sorted(
                candidate.candidate_id
                for candidate in candidates
                if candidate.algorithm_id == "standard-v2-control"
            )
        if not control_ids:
            continue
        points = tuple(ObjectivePoint(
            candidate_id=candidate.candidate_id,
            rmse_db=candidate.canonical_rmse_db,
            max_abs_db=candidate.canonical_max_abs_db,
            filter_count=candidate.actual_delivered_filter_count,
        ) for candidate in candidates)
        frontier_ids = tuple(point.candidate_id for point in nondominated(points))
        relevant = sorted(
            value["evidence"],
            key=lambda entry: (int(entry["stageRank"]), str(entry["aggregateHash"])),
            reverse=True,
        )
        reference_state: ReferenceState = "still-moving"
        if relevant:
            top = relevant[0]
            convergence = top.get("convergence")
            case_convergence = convergence.get(problem_id) if isinstance(convergence, Mapping) else None
            if isinstance(case_convergence, Mapping) and case_convergence.get("unresolved") is False:
                reference_state = "stable-under-current-search"
        cells.append(ReferenceCellV1(
            problem_id=problem_id,
            input_sha256=input_sha256,
            max_filters=max_filters,
            reference_state=reference_state,
            control_candidate_id=control_ids[0],
            candidates=candidates,
            deliverable_frontier_candidate_ids=frontier_ids,
            continuous_diagnostic_frontier=tuple(sorted(
                value["diagnostic"].values(),
                key=lambda point: (point.rmse_db, point.max_abs_db, point.candidate_id),
            )),
        ))
    if not cells:
        raise ValueError("Oracle evidence did not contain any valid deliverable reference cells")
    provisional = OracleReferenceSnapshotV1(
        version=1,
        created_from_repository_sha=repository_sha,
        corpus_version=corpus_version,
        canonical_evaluator_version=canonical_evaluator_version,
        cells=tuple(sorted(cells, key=lambda cell: (cell.problem_id, cell.max_filters, cell.input_sha256))),
        content_sha256="0" * 64,
    )
    content_hash = snapshot_content_sha256(_snapshot_without_hash_mapping(provisional))
    snapshot = OracleReferenceSnapshotV1(
        version=provisional.version,
        created_from_repository_sha=provisional.created_from_repository_sha,
        corpus_version=provisional.corpus_version,
        canonical_evaluator_version=provisional.canonical_evaluator_version,
        cells=provisional.cells,
        content_sha256=content_hash,
    )
    _validate_snapshot(snapshot)
    return snapshot


def freeze_reference_snapshot(
    campaign_root: str | Path,
    *,
    repository_sha: str,
    corpus_version: str,
    canonical_evaluator_version: str,
) -> OracleReferenceSnapshotV1:
    aggregates = discover_oracle_aggregates(campaign_root)
    if not aggregates:
        raise ValueError(f"no complete Oracle aggregate directories found under {campaign_root}")
    evidence = tuple(_load_aggregate_evidence(path) for path in aggregates)
    snapshot = _make_snapshot_from_evidence(
        evidence,
        repository_sha=repository_sha,
        corpus_version=corpus_version,
        canonical_evaluator_version=canonical_evaluator_version,
    )
    by_problem: dict[str, set[int]] = defaultdict(set)
    for cell in snapshot.cells:
        by_problem[cell.problem_id].add(cell.max_filters)
    missing_max10 = [case_id for case_id in _REQUIRED_CASES if 10 not in by_problem.get(case_id, set())]
    missing_high_cap = [
        case_id for case_id in _REQUIRED_CASES
        if not ({20, 40} & by_problem.get(case_id, set()))
    ]
    if missing_max10:
        raise ValueError(f"reference snapshot is missing required Max10 cells: {', '.join(missing_max10)}")
    if missing_high_cap:
        raise ValueError(f"reference snapshot is missing required Max20/Max40 cells: {', '.join(missing_high_cap)}")
    return snapshot


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Freeze or validate an OracleReferenceSnapshotV1")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--campaign-root")
    mode.add_argument("--validate")
    parser.add_argument("--repository-sha")
    parser.add_argument("--corpus-version")
    parser.add_argument("--canonical-evaluator-version")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    try:
        if args.validate is not None:
            snapshot = load_reference_snapshot(args.validate)
            print(f"valid OracleReferenceSnapshotV1 contentSha256={snapshot.content_sha256}")
            return
        if not all((args.repository_sha, args.corpus_version, args.canonical_evaluator_version, args.out)):
            parser.error("freeze mode requires --repository-sha, --corpus-version, --canonical-evaluator-version, and --out")
        snapshot = freeze_reference_snapshot(
            args.campaign_root,
            repository_sha=args.repository_sha,
            corpus_version=args.corpus_version,
            canonical_evaluator_version=args.canonical_evaluator_version,
        )
        write_reference_snapshot(args.out, snapshot)
        print(f"wrote OracleReferenceSnapshotV1 contentSha256={snapshot.content_sha256}")
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
