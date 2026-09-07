from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any, Literal

import numpy as np

from .calibration import FAMILY_MATCH_TOLERANCE, MAX_ABS_SCALE_DB, RMSE_SCALE_DB
from .campaign import CONVERGENCE_CRITERION_VERSION, CONVERGENCE_MATERIAL_REGRET
from .dsp import cascade_response_db
from .io import parse_filter
from .metrics import error_metrics
from .objectives import ContinuousVectorLayout, decode_vector
from .pareto import dominates, nondominated, normalized_regret
from .types import LabFilter, SolverLabCandidate, SolverLabEvaluation, SolverLabProblem

DiagnosticObjectiveKind = Literal[
    "weighted-sum",
    "tchebycheff",
    "epsilon-maxabs",
    "epsilon-rmse",
]

DIAGNOSTIC_FRONTIER_CRITERION_VERSION = CONVERGENCE_CRITERION_VERSION
DIAGNOSTIC_FRONTIER_MATERIAL_REGRET = CONVERGENCE_MATERIAL_REGRET
DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE = FAMILY_MATCH_TOLERANCE
DIAGNOSTIC_CAPACITY_MATERIAL_GAIN_FRACTION = CONVERGENCE_MATERIAL_REGRET

DiagnosticObjectiveCallable = Callable[[np.ndarray], float]


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


def diagnostic_objective_callable(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    spec: DiagnosticObjective,
) -> DiagnosticObjectiveCallable:
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(problem.desiredDb, dtype=np.float64)

    def evaluate(vector: np.ndarray) -> float:
        filters = decode_vector(problem, layout, np.asarray(vector, dtype=np.float64))
        actual = cascade_response_db(frequencies, problem.sampleRateHz, filters)
        rmse, max_abs = error_metrics(desired, actual)
        return objective_value(rmse, max_abs, spec)

    return evaluate


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
    *,
    expected_repository_sha: str | None = None,
    expected_run_id: str | None = None,
    expected_artifact_id: str | None = None,
) -> tuple[SolverLabCandidate, ...]:
    if artifact.get("version") != 1 or artifact.get("oracle") != "reference-seeds":
        raise ValueError("reference artifact must be reference-seeds version 1")
    source_algorithm = artifact.get("sourceAlgorithm")
    if not isinstance(source_algorithm, str) or not source_algorithm:
        raise ValueError("reference artifact requires sourceAlgorithm")
    repository_sha = artifact.get("repositorySha")
    if not isinstance(repository_sha, str) or not repository_sha:
        raise ValueError("reference artifact requires repositorySha")
    expected_provenance = (
        ("repository SHA", expected_repository_sha, repository_sha),
        ("run ID", expected_run_id, artifact.get("sourceRunId")),
        ("artifact ID", expected_artifact_id, artifact.get("sourceArtifactId")),
    )
    for label, expected, actual in expected_provenance:
        if expected is not None and actual != expected:
            raise ValueError(f"reference source {label} mismatch")
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
        for label, expected, point_key in (
            ("repository SHA", expected_repository_sha, "sourceSha"),
            ("run ID", expected_run_id, "sourceRunId"),
            ("artifact ID", expected_artifact_id, "sourceArtifactId"),
        ):
            point_value = point.get(point_key, artifact.get({
                "sourceSha": "repositorySha",
                "sourceRunId": "sourceRunId",
                "sourceArtifactId": "sourceArtifactId",
            }[point_key]))
            if expected is not None and point_value != expected:
                raise ValueError(f"reference point source {label} mismatch")
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


def _point_distance(left: Any, right: Any) -> float:
    return normalized_regret(left, (right,))


def _frontier_regret(source: Sequence[Any], target: Sequence[Any]) -> float:
    if not source:
        return 0.0
    if not target:
        return math.inf
    return max(normalized_regret(point, target) for point in source)


def _matched_point(point: Any, frontier: Sequence[Any]) -> bool:
    return any(
        point.candidate_id == other.candidate_id or
        _point_distance(point, other) <= DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE
        for other in frontier
    )


def _domination_status(control: Any | None, frontier: Sequence[Any]) -> str:
    if control is None:
        return "unavailable"
    if any(dominates(point, control) for point in frontier):
        return "dominated"
    if any(
        point.candidate_id == control.candidate_id or
        (
            abs(point.rmse_db - control.rmse_db) <= 1e-12 and
            abs(point.max_abs_db - control.max_abs_db) <= 1e-12
        )
        for point in frontier
    ):
        return "frontier"
    return "not-dominated"


def compare_frontier_snapshots(
    previous: Sequence[Any],
    current: Sequence[Any],
    *,
    control: Any | None = None,
) -> dict[str, Any]:
    previous_frontier = nondominated(tuple(previous))
    current_frontier = nondominated(tuple(current))
    previous_to_current = _frontier_regret(previous_frontier, current_frontier)
    current_to_previous = _frontier_regret(current_frontier, previous_frontier)
    max_regret = max(previous_to_current, current_to_previous)

    union_frontier = nondominated((*previous_frontier, *current_frontier))
    union_ids = {point.candidate_id for point in union_frontier}
    new_points = tuple(
        point for point in current_frontier
        if point.candidate_id in union_ids and not _matched_point(point, previous_frontier)
    )
    removed_points = tuple(
        point for point in previous_frontier
        if not _matched_point(point, current_frontier) and any(
            dominates(other, point) for other in current_frontier
        )
    )

    previous_best_rmse = min((point.rmse_db for point in previous_frontier), default=None)
    current_best_rmse = min((point.rmse_db for point in current_frontier), default=None)
    previous_best_max_abs = min((point.max_abs_db for point in previous_frontier), default=None)
    current_best_max_abs = min((point.max_abs_db for point in current_frontier), default=None)

    def gain(current_value: float | None, previous_value: float | None) -> float | None:
        if current_value is None or previous_value is None:
            return None
        return previous_value - current_value

    return {
        "criterionVersion": DIAGNOSTIC_FRONTIER_CRITERION_VERSION,
        "materialRegretThreshold": DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
        "materialRegretThresholdSource": "campaign.CONVERGENCE_MATERIAL_REGRET",
        "pointMatchTolerance": DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE,
        "pointMatchToleranceSource": "calibration.FAMILY_MATCH_TOLERANCE",
        "comparisonAvailable": bool(previous_frontier and current_frontier),
        "previousPointCount": len(previous_frontier),
        "currentPointCount": len(current_frontier),
        "previousToCurrentNormalizedRegret": previous_to_current,
        "currentToPreviousNormalizedRegret": current_to_previous,
        "maxBidirectionalNormalizedRegret": max_regret,
        "materialChange": max_regret > DIAGNOSTIC_FRONTIER_MATERIAL_REGRET,
        "newNondominatedPointIds": [point.candidate_id for point in new_points],
        "removedThroughDominationPointIds": [point.candidate_id for point in removed_points],
        "bestRmsePreviousDb": previous_best_rmse,
        "bestRmseCurrentDb": current_best_rmse,
        "bestRmseMovementDb": None if gain(current_best_rmse, previous_best_rmse) is None else -gain(current_best_rmse, previous_best_rmse),
        "bestRmseGainDb": gain(current_best_rmse, previous_best_rmse),
        "bestMaxAbsPreviousDb": previous_best_max_abs,
        "bestMaxAbsCurrentDb": current_best_max_abs,
        "bestMaxAbsMovementDb": None if gain(current_best_max_abs, previous_best_max_abs) is None else -gain(current_best_max_abs, previous_best_max_abs),
        "bestMaxAbsGainDb": gain(current_best_max_abs, previous_best_max_abs),
        "controlDominationStatus": {
            "previous": _domination_status(control, previous_frontier),
            "current": _domination_status(control, current_frontier),
        },
    }


def classify_practical_convergence(comparison: Mapping[str, Any]) -> Literal[
    "converged", "still-moving", "ambiguous"
]:
    if comparison.get("comparisonAvailable") is not True:
        return "ambiguous"
    movement = comparison.get("maxBidirectionalNormalizedRegret")
    threshold = comparison.get("materialRegretThreshold", DIAGNOSTIC_FRONTIER_MATERIAL_REGRET)
    if (
        isinstance(movement, bool) or not isinstance(movement, (int, float)) or
        not math.isfinite(float(movement)) or
        isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or
        not math.isfinite(float(threshold)) or float(threshold) < 0
    ):
        return "ambiguous"
    return "still-moving" if float(movement) > float(threshold) else "converged"


def summarize_optimizer_family_agreement(
    points: Sequence[Mapping[str, Any]],
    *,
    families: tuple[str, str] = ("differential-evolution", "cma-es"),
    rmse_scale: float = RMSE_SCALE_DB,
    max_abs_scale: float = MAX_ABS_SCALE_DB,
    tolerance: float = DIAGNOSTIC_FRONTIER_MATCH_TOLERANCE,
) -> dict[str, Any]:
    by_family: dict[str, list[tuple[float, float]]] = {family: [] for family in families}
    for point in points:
        algorithm_id = point.get("algorithmId")
        metrics = point.get("metrics")
        if algorithm_id not in by_family or not isinstance(metrics, Mapping):
            continue
        rmse = metrics.get("rmseDb")
        max_abs = metrics.get("maxAbsDb")
        if (
            isinstance(rmse, bool) or not isinstance(rmse, (int, float)) or not math.isfinite(float(rmse)) or
            isinstance(max_abs, bool) or not isinstance(max_abs, (int, float)) or not math.isfinite(float(max_abs))
        ):
            raise ValueError("optimizer family metrics must be finite numbers")
        by_family[algorithm_id].append((float(rmse), float(max_abs)))
    left, right = (by_family[families[0]], by_family[families[1]])
    if not left or not right:
        return {
            "families": [families[0], families[1]],
            "pointCounts": {family: len(by_family[family]) for family in families},
            "matchedPointCounts": {},
            "agreementFraction": None,
            "regionsDiffer": False,
            "matchTolerance": tolerance,
        }

    def distance(first: tuple[float, float], second: tuple[float, float]) -> float:
        return math.hypot(
            (first[0] - second[0]) / rmse_scale,
            (first[1] - second[1]) / max_abs_scale,
        )

    matches = {
        families[0]: sum(any(distance(point, other) <= tolerance for other in right) for point in left),
        families[1]: sum(any(distance(point, other) <= tolerance for other in left) for point in right),
    }
    total = len(left) + len(right)
    agreement = (sum(matches.values()) / total) if total else None
    return {
        "families": [families[0], families[1]],
        "pointCounts": {family: len(by_family[family]) for family in families},
        "matchedPointCounts": matches,
        "agreementFraction": agreement,
        "regionsDiffer": bool(agreement is not None and agreement < 1.0),
        "matchTolerance": tolerance,
    }


def classify_causal_mechanisms(
    *,
    local_search: Mapping[str, Any],
    discovery_seeding: Mapping[str, Any],
    objective_scalarization: Mapping[str, Any],
    capacity: Mapping[str, Any] | None,
) -> dict[str, Any]:
    evidence_by_label = {
        "local-search-gap": dict(local_search),
        "discovery-seeding-gap": dict(discovery_seeding),
        "objective-scalarization-gap": dict(objective_scalarization),
    }
    if capacity is not None:
        evidence_by_label["capacity-gap"] = dict(capacity)
    labels = [
        label for label, evidence in evidence_by_label.items()
        if evidence.get("material") is True
    ]
    if not labels:
        labels = ["no-material-gap-found"]
    all_measured = all(evidence.get("available", True) is True for evidence in evidence_by_label.values())
    confidence = "strong" if all_measured else "moderate" if any(
        evidence.get("available", True) is True for evidence in evidence_by_label.values()
    ) else "weak"
    return {
        "labels": labels,
        "confidence": confidence,
        "evidence": evidence_by_label,
    }


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
