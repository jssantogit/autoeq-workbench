"""The frozen Reference Pareto Selector used by research comparisons."""

from __future__ import annotations

from dataclasses import dataclass
import math
from collections.abc import Sequence


TARGET_RMSE_DB = 0.25
TARGET_MAX_ABS_DB = 0.75


@dataclass(frozen=True)
class SelectorPoint:
    candidate_id: str
    rmse_db: float
    max_abs_db: float
    filter_count: int
    cancellation_score: float = 0.0


def _validate_point(point: SelectorPoint) -> None:
    if not isinstance(point, SelectorPoint):
        raise ValueError("selector point is required")
    if not point.candidate_id:
        raise ValueError("selector point candidate_id is required")
    if not math.isfinite(point.rmse_db) or not math.isfinite(point.max_abs_db):
        raise ValueError("selector point metrics must be finite")
    if isinstance(point.filter_count, bool) or not isinstance(point.filter_count, int) or point.filter_count < 0:
        raise ValueError("selector point filter_count must be a non-negative integer")
    if not math.isfinite(point.cancellation_score) or point.cancellation_score < 0:
        raise ValueError("selector point cancellation_score must be finite and non-negative")


def selector_key(point: SelectorPoint) -> tuple[object, ...]:
    _validate_point(point)
    achieved = point.rmse_db <= TARGET_RMSE_DB and point.max_abs_db <= TARGET_MAX_ABS_DB
    if achieved:
        return (
            0,
            point.filter_count,
            point.rmse_db,
            point.max_abs_db,
            point.cancellation_score,
            point.candidate_id,
        )
    return (
        1,
        math.hypot(point.rmse_db / TARGET_RMSE_DB, point.max_abs_db / TARGET_MAX_ABS_DB),
        point.rmse_db,
        point.max_abs_db,
        point.cancellation_score,
        point.filter_count,
        point.candidate_id,
    )


def select_reference_point(points: Sequence[SelectorPoint]) -> SelectorPoint:
    if not points:
        raise ValueError("selector requires at least one point")
    for point in points:
        _validate_point(point)
    return min(points, key=selector_key)
