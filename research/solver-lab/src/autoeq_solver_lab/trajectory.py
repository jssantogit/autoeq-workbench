"""Common best-so-far trajectory and solver-run artifact contract."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import math
import re
from typing import Any, Literal

from .pareto import dominates, nondominated
from .quality_time import QualityTimePoint, compute_quality_time_frontier
from .selector import SelectorPoint, select_reference_point
from .types import ObjectivePoint


_SHA256 = re.compile(r"^[a-f0-9]{64}$")


@dataclass(frozen=True)
class SolverTrajectoryPoint:
    evaluation_count: int
    elapsed_ms: float
    candidate_id: str
    actual_delivered_filter_count: int
    canonical_rmse_db: float
    canonical_max_abs_db: float
    reference_regret: float
    reference_improved: bool


@dataclass(frozen=True)
class SolverRunResult:
    schema_version: Literal[1]
    algorithm_id: str
    variant_id: str
    problem_id: str
    input_sha256: str
    max_filters: int
    reference_snapshot_sha256: str
    seed: int | None
    evaluation_budget: int
    trajectory: tuple[SolverTrajectoryPoint, ...]
    quality_time_frontier_v1: float | None
    metadata: dict[str, str | int | float | bool]


def _validate_point(point: SolverTrajectoryPoint, max_filters: int, label: str) -> None:
    if isinstance(point.evaluation_count, bool) or not isinstance(point.evaluation_count, int) or point.evaluation_count < 0:
        raise ValueError(f"{label}.evaluation_count must be a non-negative integer")
    if not math.isfinite(point.elapsed_ms) or point.elapsed_ms < 0:
        raise ValueError(f"{label}.elapsed_ms must be finite and non-negative")
    if not point.candidate_id:
        raise ValueError(f"{label}.candidate_id is required")
    if isinstance(point.actual_delivered_filter_count, bool) or not isinstance(point.actual_delivered_filter_count, int) or point.actual_delivered_filter_count < 0:
        raise ValueError(f"{label}.actual_delivered_filter_count must be a non-negative integer")
    if point.actual_delivered_filter_count > max_filters:
        raise ValueError(f"{label}.actual_delivered_filter_count exceeds max_filters")
    if not math.isfinite(point.canonical_rmse_db) or not math.isfinite(point.canonical_max_abs_db):
        raise ValueError(f"{label} canonical metrics must be finite")
    if not math.isfinite(point.reference_regret) or point.reference_regret < 0:
        raise ValueError(f"{label}.reference_regret must be finite and non-negative")
    if not isinstance(point.reference_improved, bool):
        raise ValueError(f"{label}.reference_improved must be boolean")


def _selector_point(point: SolverTrajectoryPoint) -> SelectorPoint:
    return SelectorPoint(
        candidate_id=point.candidate_id,
        rmse_db=point.canonical_rmse_db,
        max_abs_db=point.canonical_max_abs_db,
        filter_count=point.actual_delivered_filter_count,
    )


def _can_replace(current: SolverTrajectoryPoint, candidate: SolverTrajectoryPoint) -> bool:
    current_objective = ObjectivePoint(
        current.candidate_id,
        current.canonical_rmse_db,
        current.canonical_max_abs_db,
        current.actual_delivered_filter_count,
    )
    candidate_objective = ObjectivePoint(
        candidate.candidate_id,
        candidate.canonical_rmse_db,
        candidate.canonical_max_abs_db,
        candidate.actual_delivered_filter_count,
    )
    if dominates(candidate_objective, current_objective):
        return True
    front = nondominated((current_objective, candidate_objective))
    return select_reference_point(tuple(
        SelectorPoint(
            candidate_id=point.candidate_id,
            rmse_db=point.rmse_db,
            max_abs_db=point.max_abs_db,
            filter_count=point.filter_count,
        )
        for point in front
    )).candidate_id == candidate.candidate_id


def validate_solver_trajectory(
    trajectory: Sequence[SolverTrajectoryPoint],
    *,
    max_filters: int,
) -> None:
    if not trajectory:
        raise ValueError("solver trajectory must contain at least one point")
    previous: SolverTrajectoryPoint | None = None
    for index, point in enumerate(trajectory):
        _validate_point(point, max_filters, f"trajectory[{index}]")
        if previous is not None:
            if point.evaluation_count < previous.evaluation_count:
                raise ValueError("trajectory evaluation count must be nondecreasing")
            if point.elapsed_ms < previous.elapsed_ms:
                raise ValueError("trajectory elapsed time must be nondecreasing")
            if not _can_replace(previous, point):
                raise ValueError("trajectory best-so-far point regresses")
        previous = point


def append_best_so_far(
    trajectory: Sequence[SolverTrajectoryPoint],
    point: SolverTrajectoryPoint,
) -> tuple[SolverTrajectoryPoint, ...]:
    if not trajectory:
        _validate_point(point, point.actual_delivered_filter_count, "point")
        return (point,)
    max_filters = max(
        point.actual_delivered_filter_count,
        *(item.actual_delivered_filter_count for item in trajectory),
    )
    _validate_point(point, max_filters, "point")
    validate_solver_trajectory(trajectory, max_filters=max_filters)
    previous = trajectory[-1]
    if point.evaluation_count < previous.evaluation_count:
        raise ValueError("trajectory evaluation count must be nondecreasing")
    if point.elapsed_ms < previous.elapsed_ms:
        raise ValueError("trajectory elapsed time must be nondecreasing")
    return (*trajectory, point) if _can_replace(previous, point) else tuple(trajectory)


def validate_solver_run_result(result: SolverRunResult) -> None:
    if result.schema_version != 1:
        raise ValueError("solver run schema_version must be 1")
    for value, label in (
        (result.algorithm_id, "algorithm_id"),
        (result.variant_id, "variant_id"),
        (result.problem_id, "problem_id"),
    ):
        if not isinstance(value, str) or not value:
            raise ValueError(f"{label} is required")
    if _SHA256.fullmatch(result.input_sha256) is None:
        raise ValueError("input_sha256 must be a SHA-256 hex digest")
    if _SHA256.fullmatch(result.reference_snapshot_sha256) is None:
        raise ValueError("reference_snapshot_sha256 must be a SHA-256 hex digest")
    if isinstance(result.max_filters, bool) or not isinstance(result.max_filters, int) or result.max_filters <= 0:
        raise ValueError("max_filters must be a positive integer")
    if result.seed is not None and (isinstance(result.seed, bool) or not isinstance(result.seed, int)):
        raise ValueError("seed must be an integer or null")
    if isinstance(result.evaluation_budget, bool) or not isinstance(result.evaluation_budget, int) or result.evaluation_budget <= 0:
        raise ValueError("evaluation_budget must be a positive integer")
    validate_solver_trajectory(result.trajectory, max_filters=result.max_filters)
    if result.quality_time_frontier_v1 is not None and (
        not math.isfinite(result.quality_time_frontier_v1) or
        not 0 <= result.quality_time_frontier_v1 <= 1
    ):
        raise ValueError("quality_time_frontier_v1 must be null or a number between 0 and 1")
    for key, value in result.metadata.items():
        if not isinstance(key, str) or not key:
            raise ValueError("metadata keys must be non-empty strings")
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            continue
        if isinstance(value, float) and math.isfinite(value):
            continue
        if isinstance(value, str):
            continue
        raise ValueError("metadata values must be finite scalar values")


def trajectory_quality_time_points(
    trajectory: Sequence[SolverTrajectoryPoint],
) -> tuple[QualityTimePoint, ...]:
    return tuple(QualityTimePoint(point.elapsed_ms / 1000.0, point.reference_regret) for point in trajectory)


def ensure_quality_time_frontier(result: SolverRunResult) -> float:
    return compute_quality_time_frontier(trajectory_quality_time_points(result.trajectory))
