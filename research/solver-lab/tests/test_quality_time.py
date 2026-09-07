import json
from pathlib import Path

import pytest

from autoeq_solver_lab.quality_time import (
    QUALITY_TIME_FORMULA_DESCRIPTOR,
    QualityTimePoint,
    compute_quality_time_frontier,
    quality_from_regret,
    quality_time_formula_sha256,
)


FIXTURE = Path(__file__).parent / "fixtures" / "quality-time-frontier-v1.json"


def test_quality_time_matches_shared_vectors():
    vectors = json.loads(FIXTURE.read_text(encoding="utf-8"))

    for vector in vectors:
        score = compute_quality_time_frontier(
            tuple(
                QualityTimePoint(
                    elapsed_seconds=float(point["elapsedSeconds"]),
                    regret=float(point["regret"]),
                )
                for point in vector["points"]
            )
        )
        assert score == pytest.approx(vector["score"], abs=1e-12), vector["id"]


def test_quality_transform_and_formula_hash_are_frozen():
    assert quality_from_regret(0.0) == 1.0
    assert quality_from_regret(1.0) == pytest.approx(0.36787944117144233)
    assert quality_time_formula_sha256() == (
        "10d387db6ea37b2cbdf6a5c6c614c5d3f0a790046e45cbadfa931b32471d9965"
    )
    assert QUALITY_TIME_FORMULA_DESCRIPTOR == (
        '{"integration":"left-continuous-piecewise-constant-log-time",'
        '"qualityTransform":"exp(-max(0,regret))",'
        '"reference":"oracle-reference-snapshot-v1:deliverable-frontier",'
        '"regret":"directed-reference-regret-v1","tMaxSeconds":60,'
        '"tMinSeconds":0.5,"version":1}'
    )


@pytest.mark.parametrize(
    "points",
    [
        (QualityTimePoint(-0.1, 0.0),),
        (QualityTimePoint(61.0, 0.0),),
        (QualityTimePoint(0.0, -0.1),),
        (QualityTimePoint(float("nan"), 0.0),),
        (QualityTimePoint(1.0, float("inf")),),
        (QualityTimePoint(1.0, 0.0),),
    ],
)
def test_quality_time_rejects_invalid_or_missing_baseline(points):
    with pytest.raises(ValueError):
        compute_quality_time_frontier(points)
