from dataclasses import dataclass
from enum import Enum
import math
from collections.abc import Sequence

import numpy as np

from .types import FilterType, LabFilter, SolverLabProblem


class StructuralMutation(str, Enum):
    ADD_PK = "add-pk"
    ADD_LS = "add-ls"
    ADD_HS = "add-hs"
    REMOVE = "remove"
    TYPE_MUTATION = "type-mutation"
    SPLIT = "split"
    MERGE = "merge"


@dataclass(frozen=True)
class StructuralProposal:
    mutation: StructuralMutation
    filters: tuple[LabFilter, ...]


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _project_filter(problem: SolverLabProblem, filter_: LabFilter) -> LabFilter:
    filter_type: FilterType = filter_.type
    q = (
        _clamp(filter_.q, float(problem.bounds["minPkQ"]), float(problem.bounds["maxPkQ"]))
        if filter_type == "PK"
        else float(problem.bounds["shelfQ"])
    )
    return LabFilter(
        id=filter_.id,
        enabled=filter_.enabled,
        type=filter_type,
        frequencyHz=_clamp(
            filter_.frequencyHz,
            float(problem.bounds["minFrequencyHz"]),
            float(problem.bounds["maxFrequencyHz"]),
        ),
        gainDb=_clamp(
            filter_.gainDb,
            float(problem.bounds["minGainDb"]),
            float(problem.bounds["maxGainDb"]),
        ),
        q=q,
    )


def _canonical(filters: Sequence[LabFilter]) -> tuple[LabFilter, ...]:
    order = {"LS": 0, "PK": 1, "HS": 2}
    return tuple(sorted(filters, key=lambda filter_: (order[filter_.type], filter_.frequencyHz, filter_.id)))


def _unique_id(filters: Sequence[LabFilter], prefix: str) -> str:
    existing = {filter_.id for filter_ in filters}
    candidate = prefix
    suffix = 1
    while candidate in existing:
        candidate = f"{prefix}-{suffix}"
        suffix += 1
    return candidate


def _feature_frequency(
    problem: SolverLabProblem,
    residual_db: np.ndarray,
    frequencies_hz: np.ndarray,
) -> tuple[float, float]:
    if residual_db.ndim != 1 or frequencies_hz.ndim != 1 or residual_db.shape != frequencies_hz.shape:
        raise ValueError("residual_db and frequencies_hz must be one-dimensional arrays of equal length")
    if residual_db.size == 0 or not np.all(np.isfinite(residual_db)) or not np.all(np.isfinite(frequencies_hz)):
        raise ValueError("residual_db and frequencies_hz must be non-empty and finite")
    local_extrema = [
        index for index in range(residual_db.size)
        if (
            index == 0 or abs(residual_db[index]) >= abs(residual_db[index - 1])
        ) and (
            index == residual_db.size - 1 or abs(residual_db[index]) >= abs(residual_db[index + 1])
        )
    ]
    index = max(local_extrema, key=lambda candidate: (abs(residual_db[candidate]), -candidate))
    return (
        _clamp(
            float(frequencies_hz[index]),
            float(problem.bounds["minFrequencyHz"]),
            float(problem.bounds["maxFrequencyHz"]),
        ),
        float(residual_db[index]),
    )


def _add_proposal(
    problem: SolverLabProblem,
    filters: tuple[LabFilter, ...],
    mutation: StructuralMutation,
    filter_type: FilterType,
    frequency_hz: float,
    residual: float,
) -> StructuralProposal:
    gain = _clamp(
        residual,
        float(problem.bounds["minGainDb"]),
        float(problem.bounds["maxGainDb"]),
    )
    q = (
        math.sqrt(float(problem.bounds["minPkQ"]) * float(problem.bounds["maxPkQ"]))
        if filter_type == "PK"
        else float(problem.bounds["shelfQ"])
    )
    new_filter = LabFilter(
        id=_unique_id(filters, f"struct-{mutation.value}"),
        enabled=True,
        type=filter_type,
        frequencyHz=frequency_hz,
        gainDb=gain,
        q=q,
    )
    return StructuralProposal(mutation, _canonical((*filters, new_filter)))


def generate_structural_mutations(
    problem: SolverLabProblem,
    filters: Sequence[LabFilter],
    residual_db: np.ndarray,
    frequencies_hz: np.ndarray,
    rng: np.random.Generator,
) -> tuple[StructuralProposal, ...]:
    del rng
    current = tuple(_project_filter(problem, filter_) for filter_ in filters)
    max_filters = int(problem.bounds["maxFilters"])
    frequency_hz, residual = _feature_frequency(problem, residual_db, frequencies_hz)
    proposals: list[StructuralProposal] = []
    if len(current) < max_filters:
        for mutation, filter_type in (
            (StructuralMutation.ADD_PK, "PK"),
            (StructuralMutation.ADD_LS, "LS"),
            (StructuralMutation.ADD_HS, "HS"),
        ):
            proposals.append(_add_proposal(
                problem, current, mutation, filter_type, frequency_hz, residual
            ))
    for index, filter_ in enumerate(current):
        proposals.append(StructuralProposal(
            StructuralMutation.REMOVE,
            _canonical(current[:index] + current[index + 1:]),
        ))
        next_type: FilterType = {"PK": "LS", "LS": "HS", "HS": "PK"}[filter_.type]  # type: ignore[index]
        proposals.append(StructuralProposal(
            StructuralMutation.TYPE_MUTATION,
            _canonical(current[:index] + (
                _project_filter(problem, LabFilter(
                    id=filter_.id,
                    enabled=filter_.enabled,
                    type=next_type,
                    frequencyHz=filter_.frequencyHz,
                    gainDb=filter_.gainDb,
                    q=filter_.q,
                )),
            ) + current[index + 1:]),
        ))
        if len(current) < max_filters:
            ratio = 2 ** (1 / 24)
            first = _project_filter(problem, LabFilter(
                id=_unique_id(current, f"{filter_.id}-split-low"),
                enabled=filter_.enabled,
                type=filter_.type,
                frequencyHz=filter_.frequencyHz / ratio,
                gainDb=filter_.gainDb / 2,
                q=filter_.q,
            ))
            second = _project_filter(problem, LabFilter(
                id=_unique_id((*current, first), f"{filter_.id}-split-high"),
                enabled=filter_.enabled,
                type=filter_.type,
                frequencyHz=filter_.frequencyHz * ratio,
                gainDb=filter_.gainDb / 2,
                q=filter_.q,
            ))
            proposals.append(StructuralProposal(
                StructuralMutation.SPLIT,
                _canonical(current[:index] + (first, second) + current[index + 1:]),
            ))
    for left_index, left in enumerate(current):
        for right_index in range(left_index + 1, len(current)):
            right = current[right_index]
            if left.type != right.type:
                continue
            if abs(math.log2(left.frequencyHz / right.frequencyHz)) > 1 / 12:
                continue
            left_weight = abs(left.gainDb)
            right_weight = abs(right.gainDb)
            total_weight = left_weight + right_weight
            center_octave = (
                (left_weight * math.log2(left.frequencyHz) + right_weight * math.log2(right.frequencyHz)) / total_weight
                if total_weight > 0
                else (math.log2(left.frequencyHz) + math.log2(right.frequencyHz)) / 2
            )
            merged = _project_filter(problem, LabFilter(
                id=_unique_id(current, f"merge-{left.id}-{right.id}"),
                enabled=left.enabled or right.enabled,
                type=left.type,
                frequencyHz=2 ** center_octave,
                gainDb=left.gainDb + right.gainDb,
                q=(left.q + right.q) / 2,
            ))
            remaining = tuple(
                filter_ for index, filter_ in enumerate(current)
                if index not in (left_index, right_index)
            )
            proposals.append(StructuralProposal(
                StructuralMutation.MERGE,
                _canonical((*remaining, merged)),
            ))
    return tuple(proposals)
