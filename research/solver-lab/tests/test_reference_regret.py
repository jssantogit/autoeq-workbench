import json
from pathlib import Path

import pytest

from autoeq_solver_lab.calibration import CalibrationPoint, directed_regret
from autoeq_solver_lab.reference_regret import (
    ReferenceRegretResult,
    directed_reference_regret,
)
from autoeq_solver_lab.types import ObjectivePoint


FIXTURE = Path(__file__).parent / "fixtures" / "reference-regret-v1.json"


def point(value: dict[str, object]) -> ObjectivePoint:
    return ObjectivePoint(
        candidate_id=str(value["candidateId"]),
        rmse_db=float(value["rmseDb"]),
        max_abs_db=float(value["maxAbsDb"]),
        filter_count=int(value["filterCount"]),
    )


def test_directed_reference_regret_matches_shared_vectors():
    vectors = json.loads(FIXTURE.read_text(encoding="utf-8"))

    for vector in vectors:
        result = directed_reference_regret(
            point(vector["point"]),
            tuple(point(item) for item in vector["frontier"]),
        )
        assert isinstance(result, ReferenceRegretResult)
        assert result.regret == pytest.approx(vector["regret"], abs=1e-12)
        assert result.reference_improved is vector["referenceImproved"]


def test_calibration_directed_regret_reuses_the_directed_reference_contract():
    calibration_point = CalibrationPoint(
        candidate_id="candidate",
        problem_id="case",
        max_filters=10,
        actual_filter_count=1,
        actual_delivered_filter_count=1,
        rmse_db=0.5,
        max_abs_db=0.5,
        algorithm_id="fixture",
        seed=11,
    )
    reference = CalibrationPoint(
        candidate_id="reference",
        problem_id="case",
        max_filters=10,
        actual_filter_count=1,
        actual_delivered_filter_count=1,
        rmse_db=0.25,
        max_abs_db=0.5,
        algorithm_id="fixture",
        seed=29,
    )

    assert directed_regret(calibration_point, (reference,)) == 1.0


@pytest.mark.parametrize(
    "frontier",
    [(), (ObjectivePoint("reference", 0.1, 0.2, 1),)],
)
def test_directed_reference_regret_validates_frontier_and_point(frontier):
    if not frontier:
        with pytest.raises(ValueError, match="frontier"):
            directed_reference_regret(ObjectivePoint("candidate", 0.1, 0.2, 1), frontier)
        return

    with pytest.raises(ValueError, match="finite"):
        directed_reference_regret(
            ObjectivePoint("candidate", float("nan"), 0.2, 1),
            frontier,
        )

    with pytest.raises(ValueError, match="scales"):
        directed_reference_regret(
            ObjectivePoint("candidate", 0.1, 0.2, 1),
            frontier,
            rmse_scale=0.0,
        )
