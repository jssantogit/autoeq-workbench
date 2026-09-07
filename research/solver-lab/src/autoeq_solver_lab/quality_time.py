"""Quality-Time Frontier (QTF) normalized to a deliverable reference snapshot."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import hashlib
import math


QUALITY_TIME_FORMULA_VERSION = 1
QUALITY_TIME_T_MIN_SECONDS = 0.5
QUALITY_TIME_T_MAX_SECONDS = 60.0
QUALITY_TIME_FORMULA_DESCRIPTOR = (
    '{"integration":"left-continuous-piecewise-constant-log-time",'
    '"qualityTransform":"exp(-max(0,regret))",'
    '"reference":"oracle-reference-snapshot-v1:deliverable-frontier",'
    '"regret":"directed-reference-regret-v1","tMaxSeconds":60,'
    '"tMinSeconds":0.5,"version":1}'
)


@dataclass(frozen=True)
class QualityTimePoint:
    elapsed_seconds: float
    regret: float


def quality_from_regret(regret: float) -> float:
    if not math.isfinite(regret) or regret < 0:
        raise ValueError("regret must be finite and non-negative")
    return math.exp(-regret)


def quality_time_formula_sha256() -> str:
    return hashlib.sha256(QUALITY_TIME_FORMULA_DESCRIPTOR.encode("utf-8")).hexdigest()


def _point(value: object, label: str) -> QualityTimePoint:
    if isinstance(value, QualityTimePoint):
        point = value
    elif isinstance(value, Mapping):
        elapsed = value.get("elapsed_seconds", value.get("elapsedSeconds"))
        if elapsed is None and "elapsed_ms" in value:
            elapsed = float(value["elapsed_ms"]) / 1000.0
        if elapsed is None and "elapsedMs" in value:
            elapsed = float(value["elapsedMs"]) / 1000.0
        regret = value.get("regret", value.get("reference_regret", value.get("referenceRegret")))
        if elapsed is None or regret is None:
            raise ValueError(f"{label} must contain elapsed time and regret")
        point = QualityTimePoint(float(elapsed), float(regret))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)) and len(value) == 2:
        point = QualityTimePoint(float(value[0]), float(value[1]))
    else:
        elapsed_seconds = getattr(value, "elapsed_seconds", None)
        if elapsed_seconds is None:
            elapsed_ms = getattr(value, "elapsed_ms", None)
            elapsed_seconds = None if elapsed_ms is None else float(elapsed_ms) / 1000.0
        regret = getattr(value, "regret", getattr(value, "reference_regret", None))
        if elapsed_seconds is None or regret is None:
            raise ValueError(f"{label} must contain elapsed time and regret")
        point = QualityTimePoint(float(elapsed_seconds), float(regret))
    if not math.isfinite(point.elapsed_seconds) or point.elapsed_seconds < 0 or point.elapsed_seconds > QUALITY_TIME_T_MAX_SECONDS:
        raise ValueError(f"{label}.elapsed_seconds must be finite and within the QTF window")
    quality_from_regret(point.regret)
    return point


def compute_quality_time_frontier(
    points: Sequence[QualityTimePoint] | Sequence[Mapping[str, object]],
) -> float:
    if not points:
        raise ValueError("quality-time trajectory must contain at least one point")
    ordered = sorted(
        (_point(point, f"trajectory[{index}]") for index, point in enumerate(points)),
        key=lambda point_with_index: point_with_index.elapsed_seconds,
    )
    collapsed: list[QualityTimePoint] = []
    for point in ordered:
        if collapsed and collapsed[-1].elapsed_seconds == point.elapsed_seconds:
            collapsed[-1] = point
        else:
            collapsed.append(point)
    baseline = [point for point in collapsed if point.elapsed_seconds <= QUALITY_TIME_T_MIN_SECONDS]
    if not baseline:
        raise ValueError("quality-time trajectory requires a point at or before the QTF baseline")
    active_quality = quality_from_regret(baseline[-1].regret)
    left = QUALITY_TIME_T_MIN_SECONDS
    area = 0.0
    for point in collapsed:
        if point.elapsed_seconds <= QUALITY_TIME_T_MIN_SECONDS:
            continue
        if point.elapsed_seconds >= QUALITY_TIME_T_MAX_SECONDS:
            break
        area += active_quality * math.log(point.elapsed_seconds / left)
        left = point.elapsed_seconds
        active_quality = quality_from_regret(point.regret)
    area += active_quality * math.log(QUALITY_TIME_T_MAX_SECONDS / left)
    return area / math.log(QUALITY_TIME_T_MAX_SECONDS / QUALITY_TIME_T_MIN_SECONDS)
