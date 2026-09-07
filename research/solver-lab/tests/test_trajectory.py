import pytest

from autoeq_solver_lab.trajectory import (
    SolverRunResult,
    SolverTrajectoryPoint,
    append_best_so_far,
    validate_solver_run_result,
)


def point(
    evaluation_count: int,
    elapsed_ms: float,
    candidate_id: str,
    rmse: float,
    max_abs: float,
) -> SolverTrajectoryPoint:
    return SolverTrajectoryPoint(
        evaluation_count=evaluation_count,
        elapsed_ms=elapsed_ms,
        candidate_id=candidate_id,
        actual_delivered_filter_count=2,
        canonical_rmse_db=rmse,
        canonical_max_abs_db=max_abs,
        reference_regret=0.5,
        reference_improved=False,
    )


def test_best_so_far_trajectory_replaces_only_with_dominance_or_selector_win():
    first = point(10, 100.0, "first", 0.8, 0.9)
    improved = point(20, 200.0, "improved", 0.7, 0.8)
    regressed = point(30, 300.0, "regressed", 0.9, 1.0)

    trajectory = append_best_so_far((first,), improved)
    assert [item.candidate_id for item in trajectory] == ["first", "improved"]
    assert append_best_so_far(trajectory, regressed) == trajectory


def test_trajectory_validates_identity_order_and_finite_fields():
    result = SolverRunResult(
        schema_version=1,
        algorithm_id="fixture",
        variant_id="v1",
        problem_id="case",
        input_sha256="a" * 64,
        max_filters=10,
        reference_snapshot_sha256="b" * 64,
        seed=11,
        evaluation_budget=100,
        trajectory=(point(10, 100.0, "first", 0.8, 0.9),),
        quality_time_frontier_v1=None,
        metadata={"source": "test"},
    )
    validate_solver_run_result(result)

    with pytest.raises(ValueError, match="evaluation"):
        validate_solver_run_result(SolverRunResult(
            **{**result.__dict__, "trajectory": (point(10, 100.0, "a", 0.8, 0.9), point(9, 200.0, "b", 0.7, 0.8))}
        ))
    with pytest.raises(ValueError, match="snapshot"):
        validate_solver_run_result(SolverRunResult(
            **{**result.__dict__, "reference_snapshot_sha256": "not-a-sha"}
        ))
