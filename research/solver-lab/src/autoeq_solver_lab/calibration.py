from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
import argparse
import json
import math
from pathlib import Path
import re

from .types import ObjectivePoint


RMSE_SCALE_DB = 0.25
MAX_ABS_SCALE_DB = 0.75
FAMILY_MATCH_TOLERANCE = 0.05
ORACLE_CALIBRATION_VERSION = "oracle-calibration-v1"


@dataclass(frozen=True)
class CalibrationPoint:
    candidate_id: str
    problem_id: str
    filter_count: int
    rmse_db: float
    max_abs_db: float
    algorithm_id: str
    seed: int | None

    def __post_init__(self) -> None:
        if not self.candidate_id or not self.problem_id or not self.algorithm_id:
            raise ValueError("calibration point identifiers are required")
        if isinstance(self.filter_count, bool) or not isinstance(self.filter_count, int) or self.filter_count < 0:
            raise ValueError("calibration point filter_count must be a non-negative integer")
        if not math.isfinite(self.rmse_db) or not math.isfinite(self.max_abs_db):
            raise ValueError("calibration point metrics must be finite")
        if self.seed is not None and (isinstance(self.seed, bool) or not isinstance(self.seed, int)):
            raise ValueError("calibration point seed must be an integer or null")

    def objective(self) -> ObjectivePoint:
        return ObjectivePoint(
            candidate_id=self.candidate_id,
            rmse_db=self.rmse_db,
            max_abs_db=self.max_abs_db,
            filter_count=self.filter_count,
        )


def _threshold(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"manifest threshold {name} must be a number")
    numeric = float(value)
    if not math.isfinite(numeric) or numeric < 0 or numeric > 1:
        raise ValueError(f"manifest threshold {name} must be finite and between 0 and 1")
    return numeric


def validate_manifest(value: Mapping[str, object]) -> dict[str, object]:
    if not isinstance(value, Mapping) or value.get("version") != 1:
        raise ValueError("calibration manifest version must be 1")
    repository_sha = value.get("createdFromRepositorySha")
    if (
        not isinstance(repository_sha, str) or
        not re.fullmatch(r"(?:[a-f0-9]{40}|[a-f0-9]{64})", repository_sha) or
        repository_sha == "0" * len(repository_sha)
    ):
        raise ValueError("calibration manifest repository SHA must be a non-zero Git or SHA-256 hex digest")
    for field in ("corpusVersion", "continuousOracleVersion", "deliverableOracleVersion"):
        if not isinstance(value.get(field), str) or not value[field]:
            raise ValueError(f"calibration manifest {field} is required")
    if value.get("qualityTimeFormulaVersion") != 1:
        raise ValueError("calibration manifest quality-time formula version must be 1")
    thresholds = value.get("materialImprovementThresholds")
    if not isinstance(thresholds, Mapping):
        raise ValueError("calibration manifest thresholds are required")
    names = (
        "minimumAggregateFrontierGainFraction",
        "maximumPerCaseQualityRegressionFraction",
        "maximumCatastrophicCaseRate",
    )
    normalized_thresholds = {name: _threshold(thresholds.get(name), name) for name in names}
    return {
        "version": 1,
        "createdFromRepositorySha": repository_sha,
        "corpusVersion": value["corpusVersion"],
        "continuousOracleVersion": value["continuousOracleVersion"],
        "deliverableOracleVersion": value["deliverableOracleVersion"],
        "qualityTimeFormulaVersion": 1,
        "materialImprovementThresholds": normalized_thresholds,
    }


def directed_regret(
    point: CalibrationPoint,
    frontier: Sequence[CalibrationPoint],
) -> float | None:
    if not frontier:
        return None
    return min(
        math.hypot(
            max(0.0, point.rmse_db - frontier_point.rmse_db) / RMSE_SCALE_DB,
            max(0.0, point.max_abs_db - frontier_point.max_abs_db) / MAX_ABS_SCALE_DB,
        )
        for frontier_point in frontier
    )


def _sorted_points(points: Sequence[CalibrationPoint]) -> tuple[CalibrationPoint, ...]:
    return tuple(sorted(
        points,
        key=lambda point: (
            point.rmse_db,
            point.max_abs_db,
            point.filter_count,
            point.candidate_id,
        ),
    ))


def _point_record(point: CalibrationPoint) -> dict[str, object]:
    record = asdict(point)
    return {
        "candidateId": record["candidate_id"],
        "filterCount": record["filter_count"],
        "rmseDb": record["rmse_db"],
        "maxAbsDb": record["max_abs_db"],
        "algorithmId": record["algorithm_id"],
        "seed": record["seed"],
    }


def _gap_summary(
    continuous: Sequence[CalibrationPoint],
    deliverable: Sequence[CalibrationPoint],
) -> dict[str, float | None]:
    values = [directed_regret(point, continuous) for point in deliverable]
    finite_values = [value for value in values if value is not None]
    if not finite_values:
        return {"best": None, "mean": None, "worst": None}
    return {
        "best": min(finite_values),
        "mean": sum(finite_values) / len(finite_values),
        "worst": max(finite_values),
    }


def _family_agreement(points: Sequence[CalibrationPoint]) -> dict[str, object]:
    by_family: dict[str, tuple[CalibrationPoint, ...]] = {}
    for point in points:
        if point.algorithm_id in {"differential-evolution", "cma-es"}:
            by_family[point.algorithm_id] = (*by_family.get(point.algorithm_id, ()), point)
    families = sorted(by_family)
    if len(families) < 2:
        return {
            "families": families,
            "pointCounts": {family: len(by_family[family]) for family in families},
            "matchedPointCounts": {},
            "agreementFraction": None,
            "matchTolerance": FAMILY_MATCH_TOLERANCE,
        }
    left, right = families[:2]
    # A point is counted once even when the other family contains duplicate
    # objective coordinates from different runs.
    matches: dict[str, int] = {}
    matches[left] = sum(
        any(_objective_distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in by_family[right])
        for point in by_family[left]
    )
    matches[right] = sum(
        any(_objective_distance(point, candidate) <= FAMILY_MATCH_TOLERANCE for candidate in by_family[left])
        for point in by_family[right]
    )
    total = len(by_family[left]) + len(by_family[right])
    return {
        "families": families,
        "pointCounts": {family: len(by_family[family]) for family in families},
        "matchedPointCounts": matches,
        "agreementFraction": (sum(matches.values()) / total) if total else None,
        "matchTolerance": FAMILY_MATCH_TOLERANCE,
    }


def _objective_distance(left: CalibrationPoint, right: CalibrationPoint) -> float:
    return math.hypot(
        (left.rmse_db - right.rmse_db) / RMSE_SCALE_DB,
        (left.max_abs_db - right.max_abs_db) / MAX_ABS_SCALE_DB,
    )


def _quality_regression_fraction(control: CalibrationPoint, deliverable: Sequence[CalibrationPoint]) -> float | None:
    if not deliverable:
        return None
    best_rmse = min(point.rmse_db for point in deliverable)
    best_max_abs = min(point.max_abs_db for point in deliverable)
    return max(
        0.0,
        (best_rmse - control.rmse_db) / max(abs(control.rmse_db), 1e-12),
        (best_max_abs - control.max_abs_db) / max(abs(control.max_abs_db), 1e-12),
    )


def _frontier_gain_fraction(control: CalibrationPoint, continuous: Sequence[CalibrationPoint]) -> float | None:
    if not continuous:
        return None
    best_rmse = min(point.rmse_db for point in continuous)
    best_max_abs = min(point.max_abs_db for point in continuous)
    return max(
        0.0,
        (control.rmse_db - best_rmse) / max(abs(control.rmse_db), 1e-12),
        (control.max_abs_db - best_max_abs) / max(abs(control.max_abs_db), 1e-12),
    )


def _quantile(values: Sequence[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def _fractional_recommendation(value: float | None) -> float | None:
    return None if value is None else min(1.0, max(0.0, value))


def build_calibration_report(
    control: Sequence[CalibrationPoint],
    continuous: Sequence[CalibrationPoint],
    deliverable: Sequence[CalibrationPoint],
    manifest: Mapping[str, object],
) -> dict[str, object]:
    validated_manifest = validate_manifest(manifest)
    control_by_cell: dict[tuple[str, int], CalibrationPoint] = {}
    for point in _sorted_points(control):
        control_by_cell.setdefault((point.problem_id, point.filter_count), point)
    continuous_by_cell: dict[tuple[str, int], list[CalibrationPoint]] = {}
    for point in continuous:
        continuous_by_cell.setdefault((point.problem_id, point.filter_count), []).append(point)
    deliverable_by_cell: dict[tuple[str, int], list[CalibrationPoint]] = {}
    for point in deliverable:
        deliverable_by_cell.setdefault((point.problem_id, point.filter_count), []).append(point)

    cells: list[dict[str, object]] = []
    gains: list[float] = []
    regressions: list[float] = []
    catastrophic = 0
    for key in sorted(set(control_by_cell) | set(continuous_by_cell) | set(deliverable_by_cell)):
        problem_id, filter_count = key
        control_point = control_by_cell.get(key)
        continuous_points = _sorted_points(continuous_by_cell.get(key, ()))
        deliverable_points = _sorted_points(deliverable_by_cell.get(key, ()))
        cell: dict[str, object] = {
            "problemId": problem_id,
            "filterCount": filter_count,
            "control": None if control_point is None else _point_record(control_point),
            "continuousFrontier": [_point_record(point) for point in continuous_points],
            "deliverableFrontier": [_point_record(point) for point in deliverable_points],
            "controlToContinuous": {
                "regret": None if control_point is None else directed_regret(control_point, continuous_points),
            },
            "controlToDeliverable": {
                "regret": None if control_point is None else directed_regret(control_point, deliverable_points),
            },
            "continuousToDeliverableGap": _gap_summary(continuous_points, deliverable_points),
            "independentFamilyAgreement": _family_agreement(continuous_points),
        }
        if control_point is not None:
            gain = _frontier_gain_fraction(control_point, continuous_points)
            if gain is not None:
                gains.append(gain)
            regression = _quality_regression_fraction(control_point, deliverable_points)
            if regression is not None:
                regressions.append(regression)
                if regression > 0.5:
                    catastrophic += 1
        cells.append(cell)

    report = {
        "version": 1,
        "report": ORACLE_CALIBRATION_VERSION,
        "corpusVersion": validated_manifest["corpusVersion"],
        "manifest": validated_manifest,
        "cells": cells,
        "recommendations": {
            "minimumAggregateFrontierGainFraction": _fractional_recommendation(_quantile(gains, 0.25)),
            "maximumPerCaseQualityRegressionFraction": _fractional_recommendation(_quantile(regressions, 0.95)),
            "maximumCatastrophicCaseRate": _fractional_recommendation(
                (catastrophic / len(regressions)) if regressions else None
            ),
            "evidenceCellCount": len(cells),
            "thresholdsAreDerivedFromHoldout": False,
        },
    }
    return report


def _as_calibration_point(
    candidate: Mapping[str, object],
    metrics: Mapping[str, object],
    problem_id: str,
    filter_count: int,
) -> CalibrationPoint:
    return CalibrationPoint(
        candidate_id=str(candidate["candidateId"]),
        problem_id=problem_id,
        filter_count=filter_count,
        rmse_db=float(metrics["rmseDb"]),
        max_abs_db=float(metrics["maxAbsDb"]),
        algorithm_id=str(candidate.get("algorithmId", "unknown")),
        seed=None if candidate.get("seed") is None else int(candidate["seed"]),
    )


def load_oracle_points(value: Mapping[str, object], metric: str) -> tuple[CalibrationPoint, ...]:
    frontiers = value.get("frontiers")
    if not isinstance(frontiers, Sequence) or isinstance(frontiers, (str, bytes)):
        raise ValueError("oracle artifact frontiers are required")
    points: list[CalibrationPoint] = []
    for frontier in frontiers:
        if not isinstance(frontier, Mapping):
            raise ValueError("oracle artifact frontier must be an object")
        problem_id = frontier.get("problemId")
        filter_count = frontier.get("filterCount")
        raw_points = frontier.get("points")
        if not isinstance(problem_id, str) or not isinstance(filter_count, int) or isinstance(filter_count, bool) or filter_count < 0 or not isinstance(raw_points, Sequence):
            raise ValueError("oracle artifact frontier is incomplete")
        for raw_point in raw_points:
            if not isinstance(raw_point, Mapping):
                raise ValueError("oracle artifact point must be an object")
            candidate = raw_point.get("candidate")
            evaluation = raw_point.get("evaluation")
            if not isinstance(candidate, Mapping) or not isinstance(evaluation, Mapping):
                raise ValueError("oracle artifact point is incomplete")
            metrics = evaluation.get(metric)
            if not isinstance(metrics, Mapping):
                continue
            filters = candidate.get("filters")
            if not isinstance(filters, Sequence) or isinstance(filters, (str, bytes)):
                raise ValueError("oracle candidate filters are required")
            points.append(_as_calibration_point(candidate, metrics, problem_id, filter_count))
    return tuple(points)


def load_control_points(value: Mapping[str, object]) -> tuple[CalibrationPoint, ...]:
    raw_points = value.get("points")
    if not isinstance(raw_points, Sequence) or isinstance(raw_points, (str, bytes)):
        raise ValueError("control artifact points are required")
    return tuple(CalibrationPoint(
        candidate_id=str(point["candidateId"]),
        problem_id=str(point["problemId"]),
        filter_count=int(point["filterCount"]),
        rmse_db=float(point["rmseDb"]),
        max_abs_db=float(point["maxAbsDb"]),
        algorithm_id="standard-v2-control",
        seed=None,
    ) for point in raw_points if isinstance(point, Mapping))


def _read_json(path: str) -> dict[str, object]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Report research-only solver oracle calibration")
    parser.add_argument("--control", required=True)
    parser.add_argument("--continuous", required=True)
    parser.add_argument("--deliverable", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--repository-sha", required=True)
    parser.add_argument("--corpus-version", default="research-corpus-v1")
    parser.add_argument("--continuous-version", default="continuous-oracle-v1")
    parser.add_argument("--deliverable-version", default="deliverable-oracle-v1")
    parser.add_argument("--minimum-aggregate-frontier-gain-fraction", required=True, type=float)
    parser.add_argument("--maximum-per-case-quality-regression-fraction", required=True, type=float)
    parser.add_argument("--maximum-catastrophic-case-rate", required=True, type=float)
    args = parser.parse_args(argv)
    manifest = {
        "version": 1,
        "createdFromRepositorySha": args.repository_sha,
        "corpusVersion": args.corpus_version,
        "continuousOracleVersion": args.continuous_version,
        "deliverableOracleVersion": args.deliverable_version,
        "qualityTimeFormulaVersion": 1,
        "materialImprovementThresholds": {
            "minimumAggregateFrontierGainFraction": args.minimum_aggregate_frontier_gain_fraction,
            "maximumPerCaseQualityRegressionFraction": args.maximum_per_case_quality_regression_fraction,
            "maximumCatastrophicCaseRate": args.maximum_catastrophic_case_rate,
        },
    }
    report = build_calibration_report(
        load_control_points(_read_json(args.control)),
        load_oracle_points(_read_json(args.continuous), "continuous"),
        load_oracle_points(_read_json(args.deliverable), "deliverable"),
        manifest,
    )
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
