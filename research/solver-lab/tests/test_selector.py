import json
from pathlib import Path

import pytest

from autoeq_solver_lab.selector import SelectorPoint, select_reference_point


FIXTURE = Path(__file__).parent / "fixtures" / "reference-selector-v1.json"


def test_reference_selector_matches_shared_vectors():
    vectors = json.loads(FIXTURE.read_text(encoding="utf-8"))

    for vector in vectors:
        points = tuple(SelectorPoint(
            candidate_id=item["candidateId"],
            rmse_db=item["rmseDb"],
            max_abs_db=item["maxAbsDb"],
            filter_count=item["filterCount"],
            cancellation_score=item["cancellationScore"],
        ) for item in vector["points"])
        assert select_reference_point(points).candidate_id == vector["winner"], vector["id"]


def test_reference_selector_requires_finite_points_and_non_empty_input():
    with pytest.raises(ValueError, match="point"):
        select_reference_point(())
    with pytest.raises(ValueError, match="finite"):
        select_reference_point((SelectorPoint("bad", float("nan"), 1.0, 1, 0.0),))
