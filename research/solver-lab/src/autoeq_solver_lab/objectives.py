from dataclasses import dataclass
import math
from typing import Sequence

import numpy as np

from .dsp import cascade_response_db
from .metrics import error_metrics
from .types import FilterType, LabFilter, SolverLabCandidate, SolverLabProblem


@dataclass(frozen=True)
class ContinuousVectorLayout:
    filter_count: int
    filter_types: tuple[FilterType, ...]

    def __post_init__(self) -> None:
        if self.filter_count <= 0 or len(self.filter_types) != self.filter_count:
            raise ValueError("layout filter_count must match a positive filter_types tuple")
        if any(filter_type not in ("PK", "LS", "HS") for filter_type in self.filter_types):
            raise ValueError("layout contains an unsupported filter type")


def enumerate_oracle_layouts(filter_count: int) -> tuple[ContinuousVectorLayout, ...]:
    if isinstance(filter_count, bool) or not isinstance(filter_count, int) or filter_count < 0:
        raise ValueError("filter_count must be a non-negative integer")
    if filter_count == 0:
        return ()
    layouts = [
        ("PK",) * filter_count,
        ("LS",) + ("PK",) * (filter_count - 1),
        ("PK",) * (filter_count - 1) + ("HS",),
    ]
    if filter_count >= 2:
        layouts.append(("LS",) + ("PK",) * (filter_count - 2) + ("HS",))
    return tuple(ContinuousVectorLayout(filter_count, types) for types in layouts)


def vector_dimension(layout: ContinuousVectorLayout) -> int:
    return layout.filter_count * 3


def _validate_vector(vector: np.ndarray, layout: ContinuousVectorLayout) -> None:
    if not isinstance(vector, np.ndarray) or vector.ndim != 1 or vector.size != vector_dimension(layout):
        raise ValueError("continuous vector has the wrong dimension")
    if not np.all(np.isfinite(vector)) or np.any(vector < 0) or np.any(vector > 1):
        raise ValueError("continuous vector coordinates must be finite and within [0, 1]")


def _log_interpolate(value: float, minimum: float, maximum: float) -> float:
    if minimum <= 0 or maximum <= minimum:
        raise ValueError("logarithmic bounds must be positive and ordered")
    if value <= 0:
        return minimum
    if value >= 1:
        return maximum
    return 10 ** (
        math.log10(minimum) + value * (math.log10(maximum) - math.log10(minimum))
    )


def decode_vector(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    x: np.ndarray,
) -> tuple[LabFilter, ...]:
    _validate_vector(x, layout)
    if layout.filter_count > problem.bounds["maxFilters"]:
        raise ValueError("layout exceeds problem maxFilters")
    min_frequency = float(problem.bounds["minFrequencyHz"])
    max_frequency = float(problem.bounds["maxFrequencyHz"])
    min_gain = float(problem.bounds["minGainDb"])
    max_gain = float(problem.bounds["maxGainDb"])
    min_q = float(problem.bounds["minPkQ"])
    max_q = float(problem.bounds["maxPkQ"])
    shelf_q = float(problem.bounds["shelfQ"])
    filters: list[LabFilter] = []
    for index, filter_type in enumerate(layout.filter_types):
        frequency_coordinate, gain_coordinate, q_coordinate = x[index * 3:index * 3 + 3]
        frequency_hz = _log_interpolate(float(frequency_coordinate), min_frequency, max_frequency)
        gain_db = min_gain + float(gain_coordinate) * (max_gain - min_gain)
        q = shelf_q if filter_type != "PK" else _log_interpolate(float(q_coordinate), min_q, max_q)
        filters.append(LabFilter(
            id=f"oracle-{filter_type.lower()}-{index}",
            enabled=True,
            type=filter_type,
            frequencyHz=frequency_hz,
            gainDb=gain_db,
            q=q,
        ))
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    return tuple(sorted(filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz)))


def encode_filters(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    filters: Sequence[LabFilter],
) -> np.ndarray:
    if len(filters) != layout.filter_count:
        raise ValueError("initial filters do not match layout filter_count")
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    ordered = sorted(filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz))
    if tuple(filter_.type for filter_ in ordered) != layout.filter_types:
        raise ValueError("initial filters do not match layout topology")
    minimum_frequency = float(problem.bounds["minFrequencyHz"])
    maximum_frequency = float(problem.bounds["maxFrequencyHz"])
    minimum_gain = float(problem.bounds["minGainDb"])
    maximum_gain = float(problem.bounds["maxGainDb"])
    minimum_q = float(problem.bounds["minPkQ"])
    maximum_q = float(problem.bounds["maxPkQ"])
    vector: list[float] = []
    for filter_ in ordered:
        if not minimum_frequency <= filter_.frequencyHz <= maximum_frequency:
            raise ValueError("initial filter frequency is out of bounds")
        if not minimum_gain <= filter_.gainDb <= maximum_gain:
            raise ValueError("initial filter gain is out of bounds")
        frequency_coordinate = (
            math.log10(filter_.frequencyHz) - math.log10(minimum_frequency)
        ) / (math.log10(maximum_frequency) - math.log10(minimum_frequency))
        gain_coordinate = (filter_.gainDb - minimum_gain) / (maximum_gain - minimum_gain)
        if filter_.type == "PK":
            if not minimum_q <= filter_.q <= maximum_q:
                raise ValueError("initial filter Q is out of bounds")
            q_coordinate = (
                math.log10(filter_.q) - math.log10(minimum_q)
            ) / (math.log10(maximum_q) - math.log10(minimum_q))
        else:
            q_coordinate = 0.5
        vector.extend((frequency_coordinate, gain_coordinate, q_coordinate))
    return np.asarray(vector, dtype=np.float64)


def scalarized_objective(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    x: np.ndarray,
    rmse_weight: float,
    max_abs_weight: float,
) -> float:
    if (
        not math.isfinite(rmse_weight) or not math.isfinite(max_abs_weight) or
        rmse_weight < 0 or max_abs_weight < 0 or rmse_weight + max_abs_weight <= 0
    ):
        raise ValueError("objective weights must be finite, non-negative, and non-zero")
    filters = decode_vector(problem, layout, x)
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(problem.desiredDb, dtype=np.float64)
    actual = cascade_response_db(frequencies, problem.sampleRateHz, filters)
    rmse, max_abs = error_metrics(desired, actual)
    return rmse_weight * rmse + max_abs_weight * max_abs


def candidate_from_vector(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    vector: np.ndarray,
    algorithm_id: str,
    seed: int,
    run_index: int = 0,
) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=f"{algorithm_id}:{problem.problemId}:{seed}:{layout.filter_count}:{run_index}",
        algorithmId=algorithm_id,
        seed=seed,
        filters=decode_vector(problem, layout, vector),
    )
