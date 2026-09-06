from collections.abc import Sequence
import math

import numpy as np

from .types import LabFilter


def _validate_frequencies(frequencies_hz: np.ndarray, sample_rate_hz: float) -> None:
    if not isinstance(frequencies_hz, np.ndarray) or frequencies_hz.ndim != 1:
        raise ValueError("frequencies_hz must be a one-dimensional NumPy array")
    if frequencies_hz.size == 0 or not np.all(np.isfinite(frequencies_hz)):
        raise ValueError("frequencies_hz must be a non-empty finite array")
    if not math.isfinite(sample_rate_hz) or sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be finite and positive")
    if np.any(frequencies_hz <= 0) or np.any(frequencies_hz >= sample_rate_hz / 2):
        raise ValueError("frequencies_hz must be positive and below Nyquist")


def _coefficients(filter_: LabFilter, sample_rate_hz: float) -> tuple[float, ...]:
    if filter_.type not in ("PK", "LS", "HS"):
        raise ValueError(f"unsupported filter type {filter_.type}")
    if not math.isfinite(filter_.frequencyHz) or not 0 < filter_.frequencyHz < sample_rate_hz / 2:
        raise ValueError("filter frequency must be positive and below Nyquist")
    if not math.isfinite(filter_.gainDb) or not math.isfinite(filter_.q) or filter_.q <= 0:
        raise ValueError("filter gain and Q must be finite and Q must be positive")

    a = 10 ** (filter_.gainDb / 40)
    w0 = (2 * math.pi * filter_.frequencyHz) / sample_rate_hz
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2 * filter_.q)

    if filter_.type == "PK":
        b0 = 1 + alpha * a
        b1 = -2 * cos_w0
        b2 = 1 - alpha * a
        a0 = 1 + alpha / a
        a1 = -2 * cos_w0
        a2 = 1 - alpha / a
    elif filter_.type == "LS":
        shelf_alpha = 2 * math.sqrt(a) * alpha
        b0 = a * ((a + 1) - (a - 1) * cos_w0 + shelf_alpha)
        b1 = 2 * a * ((a - 1) - (a + 1) * cos_w0)
        b2 = a * ((a + 1) - (a - 1) * cos_w0 - shelf_alpha)
        a0 = a + 1 + (a - 1) * cos_w0 + shelf_alpha
        a1 = -2 * ((a - 1) + (a + 1) * cos_w0)
        a2 = a + 1 + (a - 1) * cos_w0 - shelf_alpha
    else:
        shelf_alpha = 2 * math.sqrt(a) * alpha
        b0 = a * ((a + 1) + (a - 1) * cos_w0 + shelf_alpha)
        b1 = -2 * a * ((a - 1) + (a + 1) * cos_w0)
        b2 = a * ((a + 1) + (a - 1) * cos_w0 - shelf_alpha)
        a0 = a + 1 - (a - 1) * cos_w0 + shelf_alpha
        a1 = 2 * ((a - 1) - (a + 1) * cos_w0)
        a2 = a + 1 - (a - 1) * cos_w0 - shelf_alpha

    coefficients = (
        b0 / a0,
        b1 / a0,
        b2 / a0,
        1.0,
        a1 / a0,
        a2 / a0,
    )
    if not all(math.isfinite(value) for value in coefficients):
        raise ValueError("biquad coefficients must be finite")
    return coefficients


def biquad_magnitude_db(
    frequencies_hz: np.ndarray,
    sample_rate_hz: float,
    filter_: LabFilter,
) -> np.ndarray:
    _validate_frequencies(frequencies_hz, sample_rate_hz)
    b0, b1, b2, a0, a1, a2 = _coefficients(filter_, sample_rate_hz)
    w = (2 * np.pi * frequencies_hz) / sample_rate_hz
    cos_w = np.cos(w)
    sin_w = np.sin(w)
    cos_2w = np.cos(2 * w)
    sin_2w = np.sin(2 * w)
    numerator_re = b0 + b1 * cos_w + b2 * cos_2w
    numerator_im = -b1 * sin_w - b2 * sin_2w
    denominator_re = a0 + a1 * cos_w + a2 * cos_2w
    denominator_im = -a1 * sin_w - a2 * sin_2w
    magnitude_squared = (
        (numerator_re**2 + numerator_im**2)
        / (denominator_re**2 + denominator_im**2)
    )
    magnitude = np.sqrt(magnitude_squared)
    result = 20 * np.log10(np.maximum(magnitude, 1e-300))
    if not np.all(np.isfinite(result)):
        raise ValueError("biquad magnitude must be finite")
    return result


def cascade_response_db(
    frequencies_hz: np.ndarray,
    sample_rate_hz: float,
    filters: Sequence[LabFilter],
) -> np.ndarray:
    _validate_frequencies(frequencies_hz, sample_rate_hz)
    response = np.zeros(frequencies_hz.shape, dtype=np.float64)
    for filter_ in filters:
        if filter_.enabled:
            response += biquad_magnitude_db(frequencies_hz, sample_rate_hz, filter_)
    return response
