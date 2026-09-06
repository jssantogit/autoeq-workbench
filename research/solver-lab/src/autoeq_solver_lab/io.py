import json
import math
import re
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .types import (
    CanonicalMetricSet,
    FilterType,
    LabFilter,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


PROTOCOL_VERSION = 1
ALLOWED_FILTER_TYPES: tuple[FilterType, ...] = ("PK", "LS", "HS")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_PROBLEM_KEYS = {
    "protocolVersion",
    "problemId",
    "inputSha256",
    "sampleRateHz",
    "frequenciesHz",
    "desiredDb",
    "allowedFilterTypes",
    "bounds",
    "quantization",
}
_BOUNDS_KEYS = {
    "minFrequencyHz",
    "maxFrequencyHz",
    "minGainDb",
    "maxGainDb",
    "minPkQ",
    "maxPkQ",
    "shelfQ",
    "maxFilters",
}
_QUANTIZATION_KEYS = {"frequencyStepHz", "gainStepDb", "qStep"}
_FILTER_KEYS = {"id", "enabled", "type", "frequencyHz", "gainDb", "q"}
_CANDIDATE_KEYS = {
    "protocolVersion",
    "problemId",
    "inputSha256",
    "candidateId",
    "algorithmId",
    "seed",
    "filters",
}
_METRIC_KEYS = {"rmseDb", "maxAbsDb", "bandRmseDb"}
_DELIVERABLE_KEYS = _METRIC_KEYS | {"filters", "cancellationTotalScore"}
_EVALUATION_KEYS = {
    "protocolVersion",
    "candidateId",
    "valid",
    "rejectionReason",
    "continuous",
    "deliverable",
}


def _record(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _strict_keys(value: Mapping[str, Any], expected: set[str], label: str) -> None:
    keys = set(value)
    missing = expected - keys
    unknown = keys - expected
    if missing:
        raise ValueError(f"{label} missing required field(s): {', '.join(sorted(missing))}")
    if unknown:
        raise ValueError(f"{label} contains unknown field(s): {', '.join(sorted(unknown))}")


def _string(value: Any, label: str, *, non_empty: bool = True) -> str:
    if not isinstance(value, str) or (non_empty and not value):
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not -(2**63) <= value < 2**63:
        raise ValueError(f"{label} must be an integer")
    return value


def _sha(value: Any, label: str) -> str:
    text = _string(value, label)
    if _SHA256.fullmatch(text) is None:
        raise ValueError(f"{label} must be a SHA-256 hex digest")
    return text


def _finite_array(value: Any, label: str) -> tuple[float, ...]:
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError(f"{label} must be a non-empty array")
    return tuple(_finite(entry, f"{label}[{index}]") for index, entry in enumerate(value))


def parse_filter(value: Any, label: str = "filter") -> LabFilter:
    record = _record(value, label)
    _strict_keys(record, _FILTER_KEYS, label)
    filter_type = record["type"]
    if filter_type not in ALLOWED_FILTER_TYPES:
        raise ValueError(f"{label} has unsupported filter type")
    return LabFilter(
        id=_string(record["id"], f"{label}.id"),
        enabled=record["enabled"] if isinstance(record["enabled"], bool) else _invalid(f"{label}.enabled must be boolean"),
        type=filter_type,
        frequencyHz=_finite(record["frequencyHz"], f"{label}.frequencyHz"),
        gainDb=_finite(record["gainDb"], f"{label}.gainDb"),
        q=_finite(record["q"], f"{label}.q"),
    )


def _invalid(message: str) -> Any:
    raise ValueError(message)


def parse_problem(value: Any) -> SolverLabProblem:
    record = _record(value, "problem")
    if record["protocolVersion"] != PROTOCOL_VERSION:
        raise ValueError("problem protocolVersion must be 1")
    _strict_keys(record, _PROBLEM_KEYS, "problem")
    if record["sampleRateHz"] != 48000:
        raise ValueError("problem sampleRateHz must be 48000")
    frequencies = _finite_array(record["frequenciesHz"], "problem.frequenciesHz")
    desired = _finite_array(record["desiredDb"], "problem.desiredDb")
    if len(frequencies) != len(desired):
        raise ValueError("problem frequenciesHz and desiredDb must have equal length")
    allowed = record["allowedFilterTypes"]
    if not isinstance(allowed, (list, tuple)) or tuple(allowed) != ALLOWED_FILTER_TYPES:
        raise ValueError("problem allowedFilterTypes must be canonical")
    bounds = _record(record["bounds"], "problem.bounds")
    _strict_keys(bounds, _BOUNDS_KEYS, "problem.bounds")
    parsed_bounds: dict[str, float | int] = {}
    for key in _BOUNDS_KEYS:
        parsed_bounds[key] = _integer(bounds[key], f"problem.bounds.{key}") if key == "maxFilters" else _finite(bounds[key], f"problem.bounds.{key}")
    quantization = _record(record["quantization"], "problem.quantization")
    _strict_keys(quantization, _QUANTIZATION_KEYS, "problem.quantization")
    parsed_quantization: dict[str, float | int] = {
        "frequencyStepHz": _integer(quantization["frequencyStepHz"], "problem.quantization.frequencyStepHz"),
        "gainStepDb": _finite(quantization["gainStepDb"], "problem.quantization.gainStepDb"),
        "qStep": _finite(quantization["qStep"], "problem.quantization.qStep"),
    }
    return SolverLabProblem(
        protocolVersion=1,
        problemId=_string(record["problemId"], "problem.problemId"),
        inputSha256=_sha(record["inputSha256"], "problem.inputSha256"),
        sampleRateHz=48000,
        frequenciesHz=frequencies,
        desiredDb=desired,
        allowedFilterTypes=ALLOWED_FILTER_TYPES,
        bounds=parsed_bounds,
        quantization=parsed_quantization,
    )


def parse_candidate(value: Any) -> SolverLabCandidate:
    record = _record(value, "candidate")
    if record["protocolVersion"] != PROTOCOL_VERSION:
        raise ValueError("candidate protocolVersion must be 1")
    _strict_keys(record, _CANDIDATE_KEYS, "candidate")
    seed = record["seed"]
    if seed is not None:
        seed = _integer(seed, "candidate.seed")
    filters_value = record["filters"]
    if not isinstance(filters_value, (list, tuple)):
        raise ValueError("candidate.filters must be an array")
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=_string(record["problemId"], "candidate.problemId"),
        inputSha256=_sha(record["inputSha256"], "candidate.inputSha256"),
        candidateId=_string(record["candidateId"], "candidate.candidateId"),
        algorithmId=_string(record["algorithmId"], "candidate.algorithmId"),
        seed=seed,
        filters=tuple(parse_filter(value, f"candidate.filters[{index}]") for index, value in enumerate(filters_value)),
    )


def parse_metric(value: Any, label: str) -> CanonicalMetricSet:
    record = _record(value, label)
    _strict_keys(record, _METRIC_KEYS, label)
    bands = _record(record["bandRmseDb"], f"{label}.bandRmseDb")
    if any(not isinstance(key, str) for key in bands):
        raise ValueError(f"{label}.bandRmseDb keys must be strings")
    return CanonicalMetricSet(
        rmseDb=_finite(record["rmseDb"], f"{label}.rmseDb"),
        maxAbsDb=_finite(record["maxAbsDb"], f"{label}.maxAbsDb"),
        bandRmseDb={key: _finite(value, f"{label}.bandRmseDb.{key}") for key, value in bands.items()},
    )


def parse_evaluation(value: Any) -> SolverLabEvaluation:
    record = _record(value, "evaluation")
    _strict_keys(record, _EVALUATION_KEYS, "evaluation")
    if record["protocolVersion"] != PROTOCOL_VERSION:
        raise ValueError("evaluation protocolVersion must be 1")
    if not isinstance(record["valid"], bool):
        raise ValueError("evaluation.valid must be boolean")
    rejection = record["rejectionReason"]
    if rejection is not None:
        rejection = _string(rejection, "evaluation.rejectionReason")
    continuous_value = record["continuous"]
    continuous = None if continuous_value is None else parse_metric(continuous_value, "evaluation.continuous")
    deliverable_value = record["deliverable"]
    deliverable = None
    deliverable_filters: tuple[LabFilter, ...] = ()
    cancellation: float | None = None
    if deliverable_value is not None:
        deliverable_record = _record(deliverable_value, "evaluation.deliverable")
        _strict_keys(deliverable_record, _DELIVERABLE_KEYS, "evaluation.deliverable")
        deliverable = parse_metric(
            {key: deliverable_record[key] for key in _METRIC_KEYS},
            "evaluation.deliverable",
        )
        filters_value = deliverable_record["filters"]
        if not isinstance(filters_value, (list, tuple)):
            raise ValueError("evaluation.deliverable.filters must be an array")
        deliverable_filters = tuple(parse_filter(value, f"evaluation.deliverable.filters[{index}]") for index, value in enumerate(filters_value))
        cancellation = _finite(deliverable_record["cancellationTotalScore"], "evaluation.deliverable.cancellationTotalScore")
    if record["valid"] and (continuous is None or deliverable is None):
        raise ValueError("valid evaluation requires continuous and deliverable metrics")
    if not record["valid"] and (continuous is not None or deliverable is not None):
        raise ValueError("invalid evaluation cannot contain metrics")
    return SolverLabEvaluation(
        protocolVersion=1,
        candidateId=_string(record["candidateId"], "evaluation.candidateId", non_empty=False),
        valid=record["valid"],
        rejectionReason=rejection,
        continuous=continuous,
        deliverable=deliverable,
        deliverableFilters=deliverable_filters,
        cancellationTotalScore=cancellation,
    )


def _json_loads(line: str, label: str) -> Any:
    try:
        return json.loads(line, parse_constant=lambda value: _invalid(f"{label} contains non-finite JSON number {value}"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{label} contains invalid JSON") from error


def _read_jsonl(path: str | Path, parser: Any) -> tuple[Any, ...]:
    source = Path(path)
    values: list[Any] = []
    for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        label = f"{source}:{line_number}"
        values.append(parser(_json_loads(line, label)))
    return tuple(values)


def read_problems(path: str | Path) -> tuple[SolverLabProblem, ...]:
    return _read_jsonl(path, parse_problem)


def read_candidates(path: str | Path) -> tuple[SolverLabCandidate, ...]:
    return _read_jsonl(path, parse_candidate)


def read_evaluations(path: str | Path) -> tuple[SolverLabEvaluation, ...]:
    return _read_jsonl(path, parse_evaluation)


def _json_default(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return asdict(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def _serialize(value: Any) -> str:
    return json.dumps(
        value,
        default=_json_default,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def serialize_problem(problem: SolverLabProblem) -> str:
    parse_problem(asdict(problem))
    return _serialize(problem)


def serialize_candidate(candidate: SolverLabCandidate) -> str:
    parse_candidate(asdict(candidate))
    return _serialize(candidate)


def serialize_evaluation(evaluation: SolverLabEvaluation) -> str:
    value = asdict(evaluation)
    deliverable = value.pop("deliverable")
    filters = value.pop("deliverableFilters")
    cancellation = value.pop("cancellationTotalScore")
    value["deliverable"] = None if deliverable is None else {
        **deliverable,
        "filters": filters,
        "cancellationTotalScore": cancellation,
    }
    parse_evaluation(value)
    return _serialize(value)


def _write_jsonl(path: str | Path, values: Iterable[Any], serializer: Any) -> None:
    Path(path).write_text("".join(f"{serializer(value)}\n" for value in values), encoding="utf-8")


def write_problems(path: str | Path, problems: Sequence[SolverLabProblem]) -> None:
    _write_jsonl(path, problems, serialize_problem)


def write_candidates(path: str | Path, candidates: Sequence[SolverLabCandidate]) -> None:
    _write_jsonl(path, candidates, serialize_candidate)


def write_evaluations(path: str | Path, evaluations: Sequence[SolverLabEvaluation]) -> None:
    _write_jsonl(path, evaluations, serialize_evaluation)
