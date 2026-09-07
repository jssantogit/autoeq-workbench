import hashlib
import json
from copy import deepcopy

import pytest

from autoeq_solver_lab.reference_snapshot import (
    OracleReferenceSnapshotV1,
    canonical_snapshot_payload,
    parse_reference_snapshot,
    serialize_reference_snapshot,
    snapshot_content_sha256,
)


def _filter(filter_id: str = "pk-1") -> dict[str, object]:
    return {
        "id": filter_id,
        "enabled": True,
        "type": "PK",
        "frequencyHz": 1000.0,
        "gainDb": 1.0,
        "q": 1.0,
    }


def _candidate(
    candidate_id: str,
    *,
    problem_id: str = "titan-to-storm",
    input_sha256: str = "a" * 64,
    max_filters: int = 10,
    rmse: float = 1.0,
    max_abs: float = 1.0,
) -> dict[str, object]:
    return {
        "candidateId": candidate_id,
        "problemId": problem_id,
        "inputSha256": input_sha256,
        "maxFilters": max_filters,
        "actualDeliveredFilterCount": 1,
        "filters": [_filter(f"{candidate_id}-filter")],
        "canonicalRmseDb": rmse,
        "canonicalMaxAbsDb": max_abs,
        "algorithmId": "standard-v2-control" if candidate_id == "control" else "fixture",
        "seed": None if candidate_id == "control" else 11,
        "provenance": "synthetic-fixture",
    }


def _without_hash() -> dict[str, object]:
    return {
        "version": 1,
        "createdFromRepositorySha": "b" * 40,
        "corpusVersion": "autoeq-research-corpus-v1",
        "canonicalEvaluatorVersion": "standard-v2-canonical-v1",
        "cells": [
            {
                "problemId": "titan-to-storm",
                "inputSha256": "a" * 64,
                "maxFilters": 10,
                "referenceState": "stable-under-current-search",
                "controlCandidateId": "control",
                "candidates": [
                    _candidate("control", rmse=1.0, max_abs=1.0),
                    _candidate("strong", rmse=0.1, max_abs=0.2),
                ],
                "deliverableFrontierCandidateIds": ["strong"],
                "continuousDiagnosticFrontier": [
                    {
                        "candidateId": "continuous-1",
                        "rmseDb": 0.1,
                        "maxAbsDb": 0.2,
                        "filterCount": 1,
                    },
                ],
            },
        ],
    }


def _mapping() -> dict[str, object]:
    value = _without_hash()
    value["contentSha256"] = snapshot_content_sha256(value)
    return value


def test_reference_snapshot_keeps_control_but_allows_dominated_control_to_leave_frontier():
    snapshot = parse_reference_snapshot(_mapping())

    assert isinstance(snapshot, OracleReferenceSnapshotV1)
    cell = snapshot.cells[0]
    assert cell.control_candidate_id == "control"
    assert {candidate.candidate_id for candidate in cell.candidates} == {"control", "strong"}
    assert cell.deliverable_frontier_candidate_ids == ("strong",)
    assert snapshot.content_sha256 == _mapping()["contentSha256"]


def test_reference_snapshot_serialization_is_canonical_and_hash_excludes_only_top_level_hash():
    snapshot = parse_reference_snapshot(_mapping())
    serialized = serialize_reference_snapshot(snapshot)
    decoded = json.loads(serialized)

    assert serialized == canonical_snapshot_payload(decoded)
    without_hash = dict(decoded)
    del without_hash["contentSha256"]
    assert decoded["contentSha256"] == hashlib.sha256(
        canonical_snapshot_payload(without_hash).encode("utf-8")
    ).hexdigest()


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("duplicate cells", lambda value: value["cells"].append(deepcopy(value["cells"][0]))),
        (
            "duplicate candidate IDs",
            lambda value: value["cells"][0]["candidates"].append(
                deepcopy(value["cells"][0]["candidates"][0])
            ),
        ),
        (
            "problem mismatch",
            lambda value: value["cells"][0]["candidates"][1].update(problemId="other-case"),
        ),
        (
            "input hash mismatch",
            lambda value: value["cells"][0]["candidates"][1].update(inputSha256="c" * 64),
        ),
        (
            "cap mismatch",
            lambda value: value["cells"][0]["candidates"][1].update(maxFilters=20),
        ),
        (
            "delivered count above cap",
            lambda value: value["cells"][0]["candidates"][1].update(actualDeliveredFilterCount=11),
        ),
        (
            "non-finite metrics",
            lambda value: value["cells"][0]["candidates"][1].update(canonicalRmseDb=float("nan")),
        ),
        (
            "invalid candidate SHA",
            lambda value: value["cells"][0]["candidates"][1].update(inputSha256="not-a-sha"),
        ),
        (
            "invalid reference state",
            lambda value: value["cells"][0].update(referenceState="converged"),
        ),
        (
            "frontier ID absent",
            lambda value: value["cells"][0].update(deliverableFrontierCandidateIds=["missing"]),
        ),
    ],
)
def test_reference_snapshot_rejects_invalid_schema(label, mutate):
    value = _mapping()
    mutate(value)
    if label != "non-finite metrics":
        value["contentSha256"] = snapshot_content_sha256({
            key: item for key, item in value.items() if key != "contentSha256"
        })

    with pytest.raises(ValueError, match=".+") as error:
        parse_reference_snapshot(value)
    assert str(error.value)


def test_reference_snapshot_rejects_tampered_content_hash():
    value = _mapping()
    value["contentSha256"] = "0" * 64

    with pytest.raises(ValueError, match="contentSha256"):
        parse_reference_snapshot(value)


def test_reference_snapshot_rejects_unknown_top_level_fields():
    value = _mapping()
    value["unexpected"] = True
    value["contentSha256"] = snapshot_content_sha256({
        key: item for key, item in value.items() if key != "contentSha256"
    })

    with pytest.raises(ValueError, match="unknown"):
        parse_reference_snapshot(value)
