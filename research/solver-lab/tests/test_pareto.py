import math

import pytest

from autoeq_solver_lab.pareto import dominates, nondominated, normalized_regret
from autoeq_solver_lab.types import ObjectivePoint


def point(
    candidate_id: str,
    rmse_db: float,
    max_abs_db: float,
    filter_count: int = 2,
) -> ObjectivePoint:
    return ObjectivePoint(candidate_id, rmse_db, max_abs_db, filter_count)


def test_dominance_requires_strict_improvement_on_an_objective():
    equal = point("equal", 0.2, 0.4)
    one_axis = point("one-axis", 0.1, 0.4)
    worse = point("worse", 0.3, 0.5)

    assert not dominates(equal, equal)
    assert dominates(one_axis, equal)
    assert dominates(equal, worse)
    assert not dominates(worse, equal)


def test_dominance_respects_epsilon_and_rejects_nonfinite_points():
    baseline = point("baseline", 0.2, 0.4)
    within_epsilon = point("within-epsilon", 0.2 - 5e-13, 0.4 + 5e-13)
    outside_epsilon = point("outside-epsilon", 0.2 - 2e-12, 0.4)

    assert not dominates(within_epsilon, baseline)
    assert dominates(outside_epsilon, baseline)
    with pytest.raises(ValueError, match="finite"):
        dominates(point("nan", math.nan, 0.4), baseline)


def test_nondominated_returns_deterministically_sorted_points():
    points = [
        point("z", 0.2, 0.4, 4),
        point("a", 0.1, 0.5, 3),
        point("dominated", 0.3, 0.6, 1),
        point("b", 0.1, 0.5, 2),
        point("c", 0.05, 0.6, 8),
    ]

    assert nondominated(points) == (
        point("c", 0.05, 0.6, 8),
        point("b", 0.1, 0.5, 2),
        point("a", 0.1, 0.5, 3),
        point("z", 0.2, 0.4, 4),
    )


def test_normalized_regret_is_distance_to_nearest_frontier_point():
    frontier = (
        point("front-a", 0.1, 0.2),
        point("front-b", 0.3, 0.4),
    )
    assert normalized_regret(point("same", 0.1, 0.2), frontier) == 0.0
    assert normalized_regret(
        point("near-a", 0.1 + 0.01, 0.2 + 0.01), frontier,
        rmse_scale=0.25,
        max_abs_scale=0.75,
    ) == pytest.approx(math.hypot(0.04, 0.01 / 0.75))
    with pytest.raises(ValueError, match="frontier"):
        normalized_regret(point("orphan", 0.1, 0.2), ())
