from collections.abc import Mapping, Sequence
import argparse
import json
import math
from pathlib import Path
import shlex

from .calibration import FAMILY_MATCH_TOLERANCE, MAX_ABS_SCALE_DB, RMSE_SCALE_DB
from .canonical import CanonicalEvaluator, DEFAULT_CANONICAL_COMMAND
from .continuous_oracle import (
    DEFAULT_OBJECTIVE_WEIGHTS,
    OracleRunConfig,
    build_continuous_exact_frontier,
)
from .io import read_problems
from .types import SolverLabProblem


def _objective_distance(left: Mapping[str, object], right: Mapping[str, object]) -> float:
    return math.hypot(
        (float(left["rmseDb"]) - float(right["rmseDb"])) / RMSE_SCALE_DB,
        (float(left["maxAbsDb"]) - float(right["maxAbsDb"])) / MAX_ABS_SCALE_DB,
    )


def summarize_frontier_convergence(points: Sequence[Mapping[str, object]]) -> dict[str, object]:
    by_family: dict[str, list[Mapping[str, object]]] = {
        "differential-evolution": [],
        "cma-es": [],
    }
    for point in points:
        algorithm_id = point.get("algorithmId")
        if algorithm_id in by_family:
            by_family[algorithm_id].append(point)
    families = [family for family in by_family if by_family[family]]
    if len(families) < 2:
        return {
            "families": families,
            "pointCounts": {family: len(by_family[family]) for family in families},
            "matchedPointCounts": {},
            "agreementFraction": None,
            "matchTolerance": FAMILY_MATCH_TOLERANCE,
            "meaningfulIndependentOverlap": False,
        }
    left, right = families
    matches = {
        left: sum(
            any(_objective_distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in by_family[right])
            for point in by_family[left]
        ),
        right: sum(
            any(_objective_distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in by_family[left])
            for point in by_family[right]
        ),
    }
    total = len(by_family[left]) + len(by_family[right])
    return {
        "families": families,
        "pointCounts": {family: len(by_family[family]) for family in families},
        "matchedPointCounts": matches,
        "agreementFraction": sum(matches.values()) / total if total else None,
        "matchTolerance": FAMILY_MATCH_TOLERANCE,
        "meaningfulIndependentOverlap": all(matches[family] > 0 for family in families),
    }


def _parse_int_list(value: str, label: str) -> tuple[int, ...]:
    try:
        parsed = tuple(int(part) for part in value.split(",") if part)
    except ValueError as error:
        raise ValueError(f"{label} must be comma-separated integers") from error
    if not parsed or any(number <= 0 for number in parsed):
        raise ValueError(f"{label} must contain positive integers")
    if len(set(parsed)) != len(parsed):
        raise ValueError(f"{label} must not contain duplicates")
    return parsed


def _frontier_changed(previous: Sequence[Mapping[str, object]], current: Sequence[Mapping[str, object]]) -> bool:
    if len(previous) != len(current):
        return True
    return any(
        not any(_objective_distance(point, prior) <= FAMILY_MATCH_TOLERANCE for prior in previous)
        for point in current
    )


def _best_scalar(points: Sequence[Mapping[str, object]]) -> float | None:
    if not points:
        return None
    return min(
        math.hypot(
            float(point["rmseDb"]) / RMSE_SCALE_DB,
            float(point["maxAbsDb"]) / MAX_ABS_SCALE_DB,
        )
        for point in points
    )


def run_convergence_pilot(
    problems: Sequence[SolverLabProblem],
    case_ids: Sequence[str],
    seeds: Sequence[int],
    budgets: Sequence[int],
    filter_count: int,
    canonical_evaluator: CanonicalEvaluator,
) -> dict[str, object]:
    problem_by_id = {problem.problemId: problem for problem in problems}
    selected_problems = []
    for case_id in case_ids:
        problem = problem_by_id.get(case_id)
        if problem is None:
            raise ValueError(f"convergence pilot case is not present in problems: {case_id}")
        selected_problems.append(problem)
    if not selected_problems:
        raise ValueError("convergence pilot requires at least one case")
    if len(set(seeds)) < 8:
        raise ValueError("convergence pilot requires at least 8 independent seeds")
    if filter_count <= 0:
        raise ValueError("convergence pilot filter count must be positive")
    if any(filter_count > problem.bounds["maxFilters"] for problem in selected_problems):
        raise ValueError("convergence pilot filter count exceeds a problem maxFilters bound")

    records: list[dict[str, object]] = []
    for budget in budgets:
        config = OracleRunConfig(
            seeds=tuple(seeds),
            filter_counts=(filter_count,),
            objective_weights=DEFAULT_OBJECTIVE_WEIGHTS,
            evaluation_budget_per_run=budget,
        )
        for problem in selected_problems:
            frontier = build_continuous_exact_frontier(
                problem,
                filter_count,
                config,
                canonical_evaluator,
            )
            evaluations = canonical_evaluator.evaluate(problem, frontier)
            evaluations_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
            points = []
            for candidate in frontier:
                evaluation = evaluations_by_id[candidate.candidateId]
                if not evaluation.valid or evaluation.continuous is None:
                    raise ValueError("convergence pilot admitted a non-canonical point")
                points.append({
                    "candidateId": candidate.candidateId,
                    "algorithmId": candidate.algorithmId,
                    "seed": candidate.seed,
                    "actualFilterCount": len(candidate.filters),
                    "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
                    "rmseDb": evaluation.continuous.rmseDb,
                    "maxAbsDb": evaluation.continuous.maxAbsDb,
                })
            records.append({
                "problemId": problem.problemId,
                "frontierType": "exactFilterCount",
                "exactFilterCount": filter_count,
                "evaluationBudgetPerRun": budget,
                "seedCount": len(seeds),
                "points": points,
                "independentFamilyAgreement": summarize_frontier_convergence(points),
            })

    records_by_case: dict[str, list[dict[str, object]]] = {}
    for record in records:
        records_by_case.setdefault(str(record["problemId"]), []).append(record)
    case_assessments = []
    for problem_id, case_records in sorted(records_by_case.items()):
        ordered = sorted(case_records, key=lambda record: int(record["evaluationBudgetPerRun"]))
        overlap = any(
            record["independentFamilyAgreement"]["meaningfulIndependentOverlap"]
            for record in ordered
        )
        previous_points = ordered[-2]["points"] if len(ordered) >= 2 else None
        final_points = ordered[-1]["points"]
        previous_best = None if previous_points is None else _best_scalar(previous_points)
        final_best = _best_scalar(final_points)
        case_assessments.append({
            "problemId": problem_id,
            "budgets": [record["evaluationBudgetPerRun"] for record in ordered],
            "meaningfulIndependentOverlap": overlap,
            "frontierChangedAtFinalBudget": (
                None if previous_points is None else _frontier_changed(previous_points, final_points)
            ),
            "previousBestScalar": previous_best,
            "finalBestScalar": final_best,
            "finalBestScalarImproved": (
                None if previous_best is None or final_best is None else final_best < previous_best - 1e-12
            ),
        })

    return {
        "schemaVersion": 1,
        "oracle": "continuous",
        "pilotType": "simple-synthetic-convergence",
        "caseIds": list(case_ids),
        "exactFilterCount": filter_count,
        "seeds": list(seeds),
        "budgets": list(budgets),
        "records": records,
        "caseAssessments": case_assessments,
        "assessment": {
            "meaningfulIndependentOverlap": any(
                assessment["meaningfulIndependentOverlap"] for assessment in case_assessments
            ),
            "additionalComputeImprovedFinalFrontier": any(
                assessment["finalBestScalarImproved"] is True for assessment in case_assessments
            ),
            "additionalComputeNoLongerImproving": bool(case_assessments) and all(
                assessment["finalBestScalarImproved"] is False and
                assessment["frontierChangedAtFinalBudget"] is False
                for assessment in case_assessments
            ),
        },
    }


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run simple synthetic Continuous Oracle convergence pilots")
    parser.add_argument("--problems", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--case-ids", required=True)
    parser.add_argument("--seeds", required=True)
    parser.add_argument("--budgets", required=True)
    parser.add_argument("--filter-count", required=True, type=int)
    parser.add_argument("--canonical-command", default=" ".join(DEFAULT_CANONICAL_COMMAND))
    args = parser.parse_args(argv)
    output = run_convergence_pilot(
        read_problems(args.problems),
        tuple(case_id for case_id in args.case_ids.split(",") if case_id),
        _parse_int_list(args.seeds, "--seeds"),
        _parse_int_list(args.budgets, "--budgets"),
        args.filter_count,
        CanonicalEvaluator(shlex.split(args.canonical_command)),
    )
    Path(args.out).write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
