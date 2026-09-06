import json
from pathlib import Path

from autoeq_solver_lab.quantization import quantize_filters
from autoeq_solver_lab.types import LabFilter


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "canonical-quantization-v1.json"


def test_python_quantization_matches_every_canonical_fixture_field_exactly():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    for case in fixture["cases"]:
        bounds = case["bounds"]
        inputs = tuple(LabFilter(**value) for value in case["filters"])
        actual = quantize_filters(inputs, bounds)
        assert [value.__dict__ for value in actual] == case["quantizedFilters"], case["id"]
