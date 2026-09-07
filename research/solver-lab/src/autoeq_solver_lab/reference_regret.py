"""Directed distance from a delivered point to a best-known reference frontier."""

from dataclasses import dataclass
import math
from collections.abc import Sequence

from .pareto import dominates
from .types import ObjectivePoint


REFERENCE_REGRET_VERSION = 1
DEFAULT_RMSE_SCALE_DB = 0.25
DEFAULT_MAX_ABS_SCALE_DB = 0.75


@dataclass(frozen=True)
class ReferenceRegretResult:
    regret: float
    reference_improved: bool

    def __post_init__(self) -> None:
        if not math.isfinite(self.regret) or self.regret < 0:
            raise ValueError("reference regret must be finite and non-negative")
        if not isinstance(self.reference_improved, bool):
            raise ValueError("reference_improved must be boolean")


def directed_reference_regret(
    point: ObjectivePoint,
    frontier: Sequence[ObjectivePoint],
    rmse_scale: float = DEFAULT_RMSE_SCALE_DB,
    max_abs_scale: float = DEFAULT_MAX_ABS_SCALE_DB,
) -> ReferenceRegretResult:
    if not frontier:
        raise ValueError("reference frontier must contain at least one point")
    if (
        not math.isfinite(rmse_scale) or rmse_scale <= 0 or
        not math.isfinite(max_abs_scale) or max_abs_scale <= 0
    ):
        raise ValueError("reference regret scales must be finite and positive")
    distances: list[float] = []
    for reference in frontier:
        # dominates() validates both ObjectivePoint values using the same
        # finite/shape rules as the existing Pareto implementation.
        dominates(point, reference)
        distances.append(math.hypot(
            max(0.0, point.rmse_db - reference.rmse_db) / rmse_scale,
            max(0.0, point.max_abs_db - reference.max_abs_db) / max_abs_scale,
        ))
    return ReferenceRegretResult(
        regret=min(distances),
        reference_improved=any(dominates(point, reference) for reference in frontier),
    )
