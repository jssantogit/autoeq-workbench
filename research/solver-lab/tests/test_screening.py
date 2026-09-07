from autoeq_solver_lab.screening import ScreeningSummary, summarize_screening
from autoeq_solver_lab.trajectory import SolverRunResult, SolverTrajectoryPoint


def run(algorithm_id: str, variant_id: str, case_id: str, regret: float, qtf: float) -> SolverRunResult:
    return SolverRunResult(
        schema_version=1,
        algorithm_id=algorithm_id,
        variant_id=variant_id,
        problem_id=case_id,
        input_sha256="a" * 64,
        max_filters=10,
        reference_snapshot_sha256="b" * 64,
        seed=11,
        evaluation_budget=100,
        trajectory=(SolverTrajectoryPoint(
            evaluation_count=100,
            elapsed_ms=1_000.0,
            candidate_id=f"{algorithm_id}-{case_id}",
            actual_delivered_filter_count=2,
            canonical_rmse_db=regret,
            canonical_max_abs_db=regret,
            reference_regret=regret,
            reference_improved=regret == 0,
        ),),
        quality_time_frontier_v1=qtf,
        metadata={},
    )


def test_screening_summary_has_medians_and_reference_improvement_count():
    results = (
        run("matching-pursuit", "v1", "storm", 0.2, 0.7),
        run("matching-pursuit", "v1", "u12t", 0.4, 0.5),
        run("matching-pursuit", "v1", "trio", 0.0, 1.0),
    )

    summary = summarize_screening(results)

    assert isinstance(summary, ScreeningSummary)
    assert summary.algorithm_id == "matching-pursuit"
    assert summary.variant_id == "v1"
    assert summary.median_final_reference_regret == 0.2
    assert summary.median_qtf_v1 == 0.7
    assert summary.reference_improvement_count == 1
    assert summary.unique_case_win_count == 0
