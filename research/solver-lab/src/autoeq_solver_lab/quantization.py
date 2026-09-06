from collections.abc import Sequence
import math

from .types import LabFilter


def _decimals(step: float) -> int:
    text = str(step)
    return len(text.split(".", 1)[1]) if "." in text else 0


def _normalize(value: float, step: float) -> float:
    normalized = float(f"{value:.{_decimals(step)}f}")
    return 0.0 if normalized == 0.0 else normalized


def _project(
    value: float,
    step: float,
    minimum: float,
    maximum: float,
    prefer_lower_magnitude: bool,
) -> float | None:
    epsilon = 1e-10
    min_index = math.ceil(minimum / step - epsilon)
    max_index = math.floor(maximum / step + epsilon)
    if min_index > max_index:
        return None
    scaled = value / step
    indexes = [
        min(max_index, max(min_index, math.floor(scaled))),
        min(max_index, max(min_index, math.ceil(scaled))),
    ]
    best_index = indexes[0]
    best_distance = abs(value - best_index * step)
    for index in indexes[1:]:
        distance = abs(value - index * step)
        tie_break = (
            prefer_lower_magnitude and (
                abs(index) < abs(best_index) or
                (abs(index) == abs(best_index) and index < best_index)
            )
        ) or (not prefer_lower_magnitude and index < best_index)
        if distance < best_distance - epsilon or (
            abs(distance - best_distance) <= epsilon and tie_break
        ):
            best_index = index
            best_distance = distance
    return _normalize(best_index * step, step)


def quantize_filters(
    filters: Sequence[LabFilter],
    bounds: dict[str, float | int],
) -> tuple[LabFilter, ...]:
    result: list[LabFilter] = []
    for filter_ in filters:
        frequency = _project(
            filter_.frequencyHz,
            1,
            float(bounds["minFrequencyHz"]),
            float(bounds["maxFrequencyHz"]),
            False,
        )
        gain = _project(
            filter_.gainDb,
            0.1,
            float(bounds["minGainDb"]),
            float(bounds["maxGainDb"]),
            True,
        )
        q = (
            _project(
                filter_.q,
                0.01,
                float(bounds["minQ"]),
                float(bounds["maxQ"]),
                False,
            )
            if filter_.type == "PK"
            else float(bounds["shelfQ"])
        )
        if frequency is None or gain is None or q is None:
            continue
        result.append(LabFilter(
            id=filter_.id,
            enabled=filter_.enabled,
            type=filter_.type,
            frequencyHz=frequency,
            gainDb=gain,
            q=q,
        ))
    return tuple(result)
