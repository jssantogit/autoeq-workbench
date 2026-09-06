import json
from pathlib import Path

import pytest

from autoeq_solver_lab.io import (
    read_candidates,
    read_evaluations,
    read_problems,
    serialize_candidate,
    serialize_problem,
)
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


def problem_payload() -> dict:
    return {
        "protocolVersion": 1,
        "problemId": "synthetic-narrow-peak",
        "inputSha256": "a" * 64,
        "sampleRateHz": 48000,
        "frequenciesHz": [20.0, 1000.0, 20000.0],
        "desiredDb": [0.0, 2.0, 0.0],
        "allowedFilterTypes": ["PK", "LS", "HS"],
        "bounds": {
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -12.0,
            "maxGainDb": 12.0,
            "minPkQ": 0.1,
            "maxPkQ": 10.0,
            "shelfQ": 0.707,
            "maxFilters": 10,
        },
        "quantization": {
            "frequencyStepHz": 1,
            "gainStepDb": 0.1,
            "qStep": 0.01,
        },
    }


def filter_payload() -> dict:
    return {
        "id": "filter-1",
        "enabled": True,
        "type": "PK",
        "frequencyHz": 1000.0,
        "gainDb": 2.0,
        "q": 1.0,
    }


def candidate_payload() -> dict:
    return {
        "protocolVersion": 1,
        "problemId": "synthetic-narrow-peak",
        "inputSha256": "a" * 64,
        "candidateId": "fixture:1",
        "algorithmId": "fixture",
        "seed": 17,
        "filters": [filter_payload()],
    }


def evaluation_payload() -> dict:
    metric = {
        "rmseDb": 0.2,
        "maxAbsDb": 0.4,
        "bandRmseDb": {"bass": 0.1},
    }
    return {
        "protocolVersion": 1,
        "candidateId": "fixture:1",
        "valid": True,
        "rejectionReason": None,
        "continuous": metric,
        "deliverable": {
            "filters": [filter_payload()],
            **metric,
            "cancellationTotalScore": 0.0,
        },
    }


def test_problem_round_trip_rejects_wrong_protocol(tmp_path: Path):
    path = tmp_path / "problem.jsonl"
    path.write_text(json.dumps({"protocolVersion": 2}) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="protocolVersion"):
        list(read_problems(path))


def test_problem_reader_rejects_nonfinite_arrays_and_bad_sha(tmp_path: Path):
    for field, value in (("frequenciesHz", [float("nan")]), ("desiredDb", [float("inf")])):
        payload = problem_payload()
        payload[field] = value
        path = tmp_path / f"{field}.jsonl"
        path.write_text(json.dumps(payload, allow_nan=True) + "\n", encoding="utf-8")
        with pytest.raises(ValueError, match=field):
            list(read_problems(path))

    payload = problem_payload()
    payload["inputSha256"] = "not-a-sha"
    path = tmp_path / "sha.jsonl"
    path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="inputSha256"):
        list(read_problems(path))


def test_candidate_reader_validates_filter_types_and_preserves_seed(tmp_path: Path):
    path = tmp_path / "candidates.jsonl"
    path.write_text(json.dumps(candidate_payload()) + "\n", encoding="utf-8")
    candidates = list(read_candidates(path))
    assert candidates[0].seed == 17
    assert candidates[0].filters[0].type == "PK"

    invalid = candidate_payload()
    invalid["filters"][0]["type"] = "AP"
    path.write_text(json.dumps(invalid) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="filter type"):
        list(read_candidates(path))


def test_serialization_is_deterministic_and_evaluations_are_strict(tmp_path: Path):
    problem = SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-narrow-peak",
        inputSha256="a" * 64,
        sampleRateHz=48000,
        frequenciesHz=(20.0, 1000.0, 20000.0),
        desiredDb=(0.0, 2.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds=problem_payload()["bounds"],
        quantization=problem_payload()["quantization"],
    )
    candidate = SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId="fixture:1",
        algorithmId="fixture",
        seed=17,
        filters=(LabFilter(**filter_payload()),),
    )
    assert serialize_problem(problem) == serialize_problem(problem)
    assert serialize_candidate(candidate) == serialize_candidate(candidate)

    evaluation_path = tmp_path / "evaluations.jsonl"
    evaluation_path.write_text(json.dumps(evaluation_payload()) + "\n", encoding="utf-8")
    evaluations = list(read_evaluations(evaluation_path))
    assert evaluations == [
        SolverLabEvaluation(
            protocolVersion=1,
            candidateId="fixture:1",
            valid=True,
            rejectionReason=None,
            continuous=CanonicalMetricSet(
                rmseDb=0.2, maxAbsDb=0.4, bandRmseDb={"bass": 0.1}
            ),
            deliverable=CanonicalMetricSet(
                rmseDb=0.2, maxAbsDb=0.4, bandRmseDb={"bass": 0.1}
            ),
            deliverableFilters=(LabFilter(**filter_payload()),),
            cancellationTotalScore=0.0,
        ),
    ]

    invalid = evaluation_payload()
    invalid["unexpected"] = True
    evaluation_path.write_text(json.dumps(invalid) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="unknown field"):
        list(read_evaluations(evaluation_path))
