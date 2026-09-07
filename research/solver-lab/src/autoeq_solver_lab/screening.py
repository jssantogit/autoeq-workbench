"""Research screening summaries without promotion/calibration thresholds."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

from .quality_time import compute_quality_time_frontier
from .trajectory import SolverRunResult, trajectory_quality_time_points, validate_solver_run_result


@dataclass(frozen=True)
class ScreeningSummary:
    algorithm_id: str
    variant_id: str
    median_final_reference_regret: float
    median_qtf_v1: float | None
    reference_improvement_count: int
    unique_case_win_count: int


def summarize_screening(
    results: Sequence[SolverRunResult],
    comparison_results: Sequence[SolverRunResult] = (),
) -> ScreeningSummary:
    if not results:
        raise ValueError("screening requires at least one run result")
    for result in results:
        validate_solver_run_result(result)
    algorithm_id = results[0].algorithm_id
    variant_id = results[0].variant_id
    if any(result.algorithm_id != algorithm_id or result.variant_id != variant_id for result in results):
        raise ValueError("screening results must contain one algorithm and variant")
    regrets = [result.trajectory[-1].reference_regret for result in results]
    qtf_values = [
        result.quality_time_frontier_v1
        if result.quality_time_frontier_v1 is not None
        else compute_quality_time_frontier(trajectory_quality_time_points(result.trajectory))
        for result in results
    ]
    unique_wins = 0
    all_results = (*results, *comparison_results)
    for case_key in sorted({(result.problem_id, result.max_filters) for result in results}):
        contenders = [result for result in all_results if (result.problem_id, result.max_filters) == case_key]
        winners = [min(
            contenders,
            key=lambda result: (
                result.trajectory[-1].canonical_rmse_db,
                result.trajectory[-1].canonical_max_abs_db,
                result.trajectory[-1].actual_delivered_filter_count,
                result.algorithm_id,
                result.variant_id,
                result.trajectory[-1].candidate_id,
            ),
        )] if contenders else []
        distinct = {(winner.algorithm_id, winner.variant_id) for winner in winners}
        if len(distinct) == 1 and (algorithm_id, variant_id) in distinct:
            unique_wins += 1
    return ScreeningSummary(
        algorithm_id=algorithm_id,
        variant_id=variant_id,
        median_final_reference_regret=float(median(regrets)),
        median_qtf_v1=float(median(qtf_values)) if qtf_values else None,
        reference_improvement_count=sum(
            any(point.reference_improved for point in result.trajectory)
            for result in results
        ),
        unique_case_win_count=unique_wins if comparison_results else 0,
    )
