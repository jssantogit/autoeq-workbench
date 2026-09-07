"""Conservative per-case capacity classification and Max40/64 sanity gate."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
import math
from typing import Literal

from .pareto import dominates
from .reference_snapshot import ReferenceState
from .types import ObjectivePoint


HighCapSolvabilityConclusion = Literal[
    "resolved",
    "unresolved-search-or-representation",
    "insufficient-evidence",
]
HighCapParetoRelationship = Literal[
    "strictly-dominates-max10",
    "incomparable",
    "dominated-by-max10",
    "equal",
    "not-compared",
]
CaseClassification = Literal[
    "search-recoverable",
    "mixed",
    "capacity-suspected",
    "cap-limited",
]


@dataclass(frozen=True)
class HighCapObservation:
    case_id: str
    max_filters: int
    available: bool
    canonical_rmse_db: float | None
    canonical_max_abs_db: float | None
    actual_delivered_filter_count: int | None
    pareto_reference_relationship: HighCapParetoRelationship
    reference_state: ReferenceState | None
    raw_deltas_vs_max10: dict[str, float]
    provenance: str
    config_hash: str
    input_sha256: str
    reference_snapshot_sha256: str
    solvability_conclusion: HighCapSolvabilityConclusion

    def __post_init__(self) -> None:
        if not self.case_id:
            raise ValueError("high-cap observation case_id is required")
        if self.max_filters not in (40, 64):
            raise ValueError("high-cap observation max_filters must be 40 or 64")
        if not isinstance(self.available, bool):
            raise ValueError("high-cap observation available must be boolean")
        if self.available:
            if self.canonical_rmse_db is None or self.canonical_max_abs_db is None:
                raise ValueError("available high-cap observation requires canonical metrics")
            if not math.isfinite(self.canonical_rmse_db) or not math.isfinite(self.canonical_max_abs_db):
                raise ValueError("high-cap canonical metrics must be finite")
            if (
                self.actual_delivered_filter_count is None or
                isinstance(self.actual_delivered_filter_count, bool) or
                not isinstance(self.actual_delivered_filter_count, int) or
                self.actual_delivered_filter_count < 0 or
                self.actual_delivered_filter_count > self.max_filters
            ):
                raise ValueError("high-cap delivered filter count is invalid")
            if self.reference_state not in ("stable-under-current-search", "still-moving"):
                raise ValueError("available high-cap observation requires a reference state")
        elif self.reference_state is not None:
            raise ValueError("unavailable high-cap observation cannot have a reference state")
        if self.pareto_reference_relationship not in {
            "strictly-dominates-max10",
            "incomparable",
            "dominated-by-max10",
            "equal",
            "not-compared",
        }:
            raise ValueError("high-cap Pareto relationship is invalid")
        if not self.provenance or not self.config_hash or not self.input_sha256 or not self.reference_snapshot_sha256:
            raise ValueError("high-cap observation provenance and hashes are required")
        if self.solvability_conclusion not in {
            "resolved",
            "unresolved-search-or-representation",
            "insufficient-evidence",
        }:
            raise ValueError("high-cap solvability conclusion is invalid")

    @property
    def reference_still_moving(self) -> bool:
        return self.reference_state == "still-moving"


@dataclass(frozen=True)
class HighCapSolvabilityCheck:
    case_id: str
    required_capacities: tuple[int, ...]
    observations: tuple[HighCapObservation, ...]
    conclusion: HighCapSolvabilityConclusion
    blocks_cap_limited: bool


def evaluate_high_cap_solvability(
    observations: Sequence[HighCapObservation],
    required_capacities: Sequence[int] = (40,),
) -> HighCapSolvabilityCheck:
    if not required_capacities:
        raise ValueError("high-cap solvability requires at least one capacity")
    required = tuple(required_capacities)
    if any(capacity not in (40, 64) for capacity in required) or len(set(required)) != len(required):
        raise ValueError("high-cap required capacities must be unique values from 40 and 64")
    if not observations:
        raise ValueError("high-cap solvability requires observations")
    ordered = tuple(sorted(observations, key=lambda observation: observation.max_filters))
    case_ids = {observation.case_id for observation in ordered}
    if len(case_ids) != 1:
        raise ValueError("high-cap solvability observations must belong to one case")
    capacities = {observation.max_filters for observation in ordered}
    if len(capacities) != len(ordered):
        raise ValueError("high-cap solvability observations must have unique capacities")
    required_observations = [
        observation for observation in ordered
        if observation.max_filters in required
    ]
    if any(
        observation.solvability_conclusion == "unresolved-search-or-representation"
        for observation in ordered
    ):
        conclusion: HighCapSolvabilityConclusion = "unresolved-search-or-representation"
    elif any(
        observation.available and observation.solvability_conclusion != "resolved"
        for observation in ordered
    ):
        conclusion = "insufficient-evidence"
    elif any(observation.reference_still_moving for observation in ordered):
        conclusion = "insufficient-evidence"
    elif (
        len(required_observations) != len(required) or
        any(not observation.available for observation in required_observations) or
        any(observation.solvability_conclusion != "resolved" for observation in required_observations)
    ):
        conclusion = "insufficient-evidence"
    else:
        conclusion = "resolved"
    return HighCapSolvabilityCheck(
        case_id=next(iter(case_ids)),
        required_capacities=required,
        observations=ordered,
        conclusion=conclusion,
        blocks_cap_limited=conclusion != "resolved",
    )


def compute_high_cap_strict_advantage(
    high_cap_points: Sequence[ObjectivePoint],
    max10_frontier: Sequence[ObjectivePoint],
) -> bool:
    return any(
        dominates(high_cap, max10)
        for high_cap in high_cap_points
        for max10 in max10_frontier
    )


@dataclass(frozen=True)
class CaseClassificationInputs:
    case_id: str
    max10_reference_state: ReferenceState
    high_cap_reference_state: ReferenceState
    high_cap_check: HighCapSolvabilityCheck | None
    high_cap_strict_advantage: bool
    max10_reference_improved_by_compression: bool
    max10_reference_improved_by_fixed_cap_search: bool
    all_official_teachers_attempted: bool
    compression_attempt_count: int

    def __post_init__(self) -> None:
        if not self.case_id:
            raise ValueError("classification case_id is required")
        if self.max10_reference_state not in ("stable-under-current-search", "still-moving"):
            raise ValueError("max10 reference state is invalid")
        if self.high_cap_reference_state not in ("stable-under-current-search", "still-moving"):
            raise ValueError("high-cap reference state is invalid")
        if (
            isinstance(self.compression_attempt_count, bool) or
            not isinstance(self.compression_attempt_count, int) or
            self.compression_attempt_count < 0
        ):
            raise ValueError("compression_attempt_count must be non-negative")


def classify_case(inputs: CaseClassificationInputs) -> CaseClassification:
    high_cap_gate_open = (
        inputs.high_cap_check is not None and
        not inputs.high_cap_check.blocks_cap_limited and
        inputs.high_cap_check.case_id == inputs.case_id
    )
    if (
        inputs.max10_reference_state == "still-moving" or
        inputs.high_cap_reference_state == "still-moving" or
        not high_cap_gate_open
    ):
        return "capacity-suspected"
    if inputs.max10_reference_improved_by_compression:
        return "mixed"
    if inputs.max10_reference_improved_by_fixed_cap_search:
        return "search-recoverable"
    if (
        inputs.high_cap_strict_advantage and
        inputs.all_official_teachers_attempted and
        inputs.compression_attempt_count > 0
    ):
        return "cap-limited"
    return "capacity-suspected"


__all__ = [
    "CaseClassification",
    "CaseClassificationInputs",
    "HighCapObservation",
    "HighCapSolvabilityCheck",
    "HighCapSolvabilityConclusion",
    "classify_case",
    "compute_high_cap_strict_advantage",
    "evaluate_high_cap_solvability",
]
