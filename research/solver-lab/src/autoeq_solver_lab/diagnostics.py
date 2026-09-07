from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
import math
from typing import Any, Literal, Mapping, Sequence

from .io import parse_filter
from .objectives import ContinuousVectorLayout
from .types import LabFilter, SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


DiagnosticObjectiveKind = Literal[
    "weighted-sum",
    "tchebycheff",
    "epsilon-maxabs",
    "epsilon-rmse",
]


@dataclass(frozen=True)
class DiagnosticObjective:
    kind: DiagnosticObjectiveKind
    rmse_weight: float
    max_abs_weight: float
    rmse_scale: float
    max_abs_scale: float
    epsilon: float | None = None
    penalty: float = 100.0

    def __post_init__(self) -> None:
        if self.kind not in {
            "weighted-sum",
            "tchebycheff",
            "epsilon-maxabs",
            "epsilon-rmse",
        }:
            raise ValueError("unsupported diagnostic objective kind")
        values = (
            self.rmse_weight,
            self.max_abs_weight,
            self.rmse_scale,
            self.max_abs_scale,
            self.penalty,
        )
        if any(not math.isfinite(value) for value in values):
            raise ValueError("diagnostic objective values must be finite")
        if self.rmse_weight < 0 or self.max_abs_weight < 0:
            raise ValueError("diagnostic objective weights must be non-negative")
        if self.rmse_scale <= 0 or self.max_abs_scale <= 0:
            raise ValueError("diagnostic objective scales must be positive")
        if self.penalty <= 0:
            raise ValueError("diagnostic objective penalty must be positive")
        if self.kind in {"weighted-sum", "tchebycheff"} and self.rmse_weight + self.max_abs_weight <= 0:
            raise ValueError("weighted diagnostic objectives require a non-zero weight")
        if self.kind.startswith("epsilon-"):
            if self.epsilon is None or not math.isfinite(self.epsilon) or self.epsilon <= 0:
                raise ValueError("epsilon objective requires a positive finite epsilon")


def objective_value(rmse_db: float, max_abs_db: float, spec: DiagnosticObjective) -> float:
    if not math.isfinite(rmse_db) or not math.isfinite(max_abs_db):
        return float("inf")
    rmse = rmse_db / spec.rmse_scale
    max_abs = max_abs_db / spec.max_abs_scale
    if spec.kind == "weighted-sum":
        return spec.rmse_weight * rmse + spec.max_abs_weight * max_abs
    if spec.kind == "tchebycheff":
        rmse_term = spec.rmse_weight * rmse
        max_abs_term = spec.max_abs_weight * max_abs
        return max(rmse_term, max_abs_term) + 0.05 * (rmse_term + max_abs_term)
    if spec.kind == "epsilon-maxabs":
        violation = max(0.0, max_abs - float(spec.epsilon))
        return rmse + spec.penalty * violation * violation
    if spec.kind == "epsilon-rmse":
        violation = max(0.0, rmse - float(spec.epsilon))
        return max_abs + spec.penalty * violation * violation
    raise AssertionError(f"unreachable diagnostic objective kind {spec.kind}")


def infer_layout_from_filters(filters: Sequence[LabFilter]) -> ContinuousVectorLayout:
    if not filters:
        raise ValueError("reference candidate must contain at least one filter")
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    ordered = sorted(filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz))
    return ContinuousVectorLayout(
        filter_count=len(ordered),
        filter_types=tuple(filter_.type for filter_ in ordered),
    )


def build_reference_candidate(
    problem: SolverLabProblem,
    *,
    provenance: str,
    source_id: str,
    filters: Sequence[LabFilter],
) -> SolverLabCandidate:
    if not provenance or not source_id:
        raise ValueError("reference candidate requires provenance and source_id")
    if not filters:
        raise ValueError("reference candidate requires filters")
    if len(filters) > int(problem.bounds["maxFilters"]):
        raise ValueError("reference candidate exceeds problem maxFilters")
    allowed = set(problem.allowedFilterTypes)
    normalized: list[LabFilter] = []
    for index, filter_ in enumerate(filters):
        if filter_.type not in allowed:
            raise ValueError("reference candidate contains a disallowed filter type")
        normalized.append(replace(filter_, id=f"reference-{index + 1}"))
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "sourceId": source_id,
                "filters": [
                    {
                        "enabled": filter_.enabled,
                        "type": filter_.type,
                        "frequencyHz": filter_.frequencyHz,
                        "gainDb": filter_.gainDb,
                        "q": filter_.q,
                    }
                    for filter_ in normalized
                ],
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()[:16]
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=f"reference:{provenance}:{problem.problemId}:{fingerprint}",
        algorithmId=f"reference:{provenance}",
        seed=None,
        filters=tuple(normalized),
    )


def _record(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def reference_candidates_from_artifact(
    problem: SolverLabProblem,
    artifact: Mapping[str, Any],
) -> tuple[SolverLabCandidate, ...]:
    if artifact.get("version") != 1 or artifact.get("oracle") != "reference-seeds":
        raise ValueError("reference artifact must be reference-seeds version 1")
    source_algorithm = artifact.get("sourceAlgorithm")
    if not isinstance(source_algorithm, str) or not source_algorithm:
        raise ValueError("reference artifact requires sourceAlgorithm")
    repository_sha = artifact.get("repositorySha")
    if not isinstance(repository_sha, str) or not repository_sha:
        raise ValueError("reference artifact requires repositorySha")
    raw_points = artifact.get("points")
    if not isinstance(raw_points, Sequence) or isinstance(raw_points, (str, bytes)):
        raise ValueError("reference artifact requires points")

    candidates: list[SolverLabCandidate] = []
    for index, raw_point in enumerate(raw_points):
        point = _record(raw_point, f"reference.points[{index}]")
        if point.get("problemId") != problem.problemId:
            continue
        provenance = point.get("provenance", source_algorithm)
        if not isinstance(provenance, str) or not provenance:
            raise ValueError("reference point requires provenance")
        source_id = point.get("sourceId")
        if source_id is None:
            source_id = f"{repository_sha}:{problem.problemId}:{index}"
        if not isinstance(source_id, str) or not source_id:
            raise ValueError("reference point sourceId must be a non-empty string")
        raw_filters = point.get("filters")
        if not isinstance(raw_filters, Sequence) or isinstance(raw_filters, (str, bytes)):
            raise ValueError("reference point requires filters")
        filters = tuple(
            parse_filter(raw_filter, f"reference.points[{index}].filters[{filter_index}]")
            for filter_index, raw_filter in enumerate(raw_filters)
        )
        candidates.append(build_reference_candidate(
            problem,
            provenance=provenance,
            source_id=source_id,
            filters=filters,
        ))
    return tuple(candidates)


def _deliverable_quality(evaluation: SolverLabEvaluation) -> float:
    if not evaluation.valid or evaluation.deliverable is None:
        return float("inf")
    return math.hypot(evaluation.deliverable.rmseDb, evaluation.deliverable.maxAbsDb)


def summarize_capacity_gap(
    evaluations_by_cap: Mapping[int, SolverLabEvaluation],
) -> dict[str, float | int | None]:
    if not evaluations_by_cap:
        raise ValueError("capacity summary requires at least one evaluated cap")
    normalized = {
        int(cap): evaluation
        for cap, evaluation in evaluations_by_cap.items()
        if isinstance(cap, int) and not isinstance(cap, bool) and cap > 0
    }
    if len(normalized) != len(evaluations_by_cap):
        raise ValueError("capacity caps must be positive integers")
    qualities = {cap: _deliverable_quality(evaluation) for cap, evaluation in normalized.items()}
    if all(not math.isfinite(value) for value in qualities.values()):
        raise ValueError("capacity summary has no valid deliverable evaluation")
    best_cap = min(qualities, key=lambda cap: (qualities[cap], cap))

    def gain(left_cap: int, right_cap: int) -> float | None:
        left = qualities.get(left_cap)
        right = qualities.get(right_cap)
        if left is None or right is None or not math.isfinite(left) or not math.isfinite(right) or left <= 0:
            return None
        return (left - right) / left

    return {
        "bestCap": best_cap,
        "cap10To20GainFraction": gain(10, 20),
        "cap20To40GainFraction": gain(20, 40),
    }
