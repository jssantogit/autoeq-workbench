import math

import numpy as np


def error_metrics(
    desired_db: np.ndarray,
    actual_db: np.ndarray,
) -> tuple[float, float]:
    if not isinstance(desired_db, np.ndarray) or not isinstance(actual_db, np.ndarray):
        raise ValueError("desired_db and actual_db must be NumPy arrays")
    if desired_db.shape != actual_db.shape or desired_db.ndim != 1 or desired_db.size == 0:
        raise ValueError("desired_db and actual_db must be non-empty one-dimensional arrays of equal length")
    if not np.all(np.isfinite(desired_db)) or not np.all(np.isfinite(actual_db)):
        raise ValueError("desired_db and actual_db must be finite")
    residual = desired_db - actual_db
    rmse = float(math.sqrt(float(np.sum(residual**2)) / residual.size))
    max_abs = float(np.max(np.abs(residual)))
    if not math.isfinite(rmse) or not math.isfinite(max_abs):
        raise ValueError("error metrics must be finite")
    return rmse, max_abs
