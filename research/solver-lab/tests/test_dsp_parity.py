import json
from pathlib import Path

import numpy as np

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.metrics import error_metrics
from autoeq_solver_lab.types import LabFilter


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "canonical-response-v1.json"


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def make_filter(value: dict) -> LabFilter:
    return LabFilter(**value)


def test_python_cascade_matches_canonical_typescript_response_fixture():
    fixture = load_fixture()
    frequencies = np.asarray(fixture["frequenciesHz"], dtype=np.float64)
    for case in fixture["cases"]:
        actual = cascade_response_db(
            frequencies,
            fixture["sampleRateHz"],
            tuple(make_filter(value) for value in case["filters"]),
        )
        expected = np.asarray(case["responseDb"], dtype=np.float64)
        assert np.max(np.abs(actual - expected)) <= 1e-9, case["id"]


def test_python_scalar_metrics_match_canonical_typescript_values():
    fixture = load_fixture()
    for case in fixture["metricCases"]:
        rmse, max_abs = error_metrics(
            np.asarray(case["desiredDb"], dtype=np.float64),
            np.asarray(case["actualDb"], dtype=np.float64),
        )
        assert abs(rmse - case["rmseDb"]) <= 1e-10, case["id"]
        assert abs(max_abs - case["maxAbsDb"]) <= 1e-10, case["id"]
