from collections.abc import Sequence
import math

from .types import ObjectivePoint


def _validate_point(point: ObjectivePoint) -> None:
    if not isinstance(point, ObjectivePoint):
        raise ValueError("objective point is required")
    if not isinstance(point.candidate_id, str):
        raise ValueError("objective point candidate_id must be a string")
    if not math.isfinite(point.rmse_db) or not math.isfinite(point.max_abs_db):
        raise ValueError("objective point metrics must be finite")
    if isinstance(point.filter_count, bool) or not isinstance(point.filter_count, int) or point.filter_count < 0:
        raise ValueError("objective point filter_count must be a non-negative integer")


def _validate_epsilon(eps: float) -> None:
    if not math.isfinite(eps) or eps < 0:
        raise ValueError("epsilon must be finite and non-negative")


def dominates(a: ObjectivePoint, b: ObjectivePoint, eps: float = 1e-12) -> bool:
    _validate_point(a)
    _validate_point(b)
    _validate_epsilon(eps)
    no_worse = a.rmse_db <= b.rmse_db + eps and a.max_abs_db <= b.max_abs_db + eps
    strict = a.rmse_db < b.rmse_db - eps or a.max_abs_db < b.max_abs_db - eps
    return no_worse and strict


def nondominated(points: Sequence[ObjectivePoint]) -> tuple[ObjectivePoint, ...]:
    for point in points:
        _validate_point(point)
    result = tuple(
        point for point in points
        if not any(other is not point and dominates(other, point) for other in points)
    )
    return tuple(sorted(
        result,
        key=lambda point: (point.rmse_db, point.max_abs_db, point.filter_count, point.candidate_id),
    ))


def normalized_regret(
    point: ObjectivePoint,
    frontier: Sequence[ObjectivePoint],
    rmse_scale: float = 0.25,
    max_abs_scale: float = 0.75,
) -> float:
    _validate_point(point)
    if not frontier:
        raise ValueError("frontier must contain at least one point")
    for frontier_point in frontier:
        _validate_point(frontier_point)
    if (
        not math.isfinite(rmse_scale) or rmse_scale <= 0 or
        not math.isfinite(max_abs_scale) or max_abs_scale <= 0
    ):
        raise ValueError("frontier scales must be finite and positive")
    return min(
        math.hypot(
            (point.rmse_db - frontier_point.rmse_db) / rmse_scale,
            (point.max_abs_db - frontier_point.max_abs_db) / max_abs_scale,
        )
        for frontier_point in frontier
    )
