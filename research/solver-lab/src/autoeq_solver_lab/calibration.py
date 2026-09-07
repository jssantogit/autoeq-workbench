from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
import argparse
import json
import math
from pathlib import Path
import re

from .io import parse_candidate, parse_evaluation, parse_filter
from .pareto import dominates, nondominated, normalized_regret
from .reference_regret import directed_reference_regret
from .types import ObjectivePoint


RMSE_SCALE_DB = 0.25
MAX_ABS_SCALE_DB = 0.75
FAMILY_MATCH_TOLERANCE = 0.05
ORACLE_CALIBRATION_VERSION = "oracle-calibration-v1"
MIN_CALIBRATION_SEED_COUNT = 8
VACUOUS_CATASTROPHIC_RATE = 0.8


@dataclass(frozen=True)
class CalibrationPoint:
    candidate_id: str
    problem_id: str
    max_filters: int
    actual_filter_count: int
    actual_delivered_filter_count: int
    rmse_db: float
    max_abs_db: float
    algorithm_id: str
    seed: int | None

    def __post_init__(self) -> None:
        if not self.candidate_id or not self.problem_id or not self.algorithm_id:
            raise ValueError("calibration point identifiers are required")
        for value, label in (
            (self.max_filters, "max_filters"),
            (self.actual_filter_count, "actual_filter_count"),
            (self.actual_delivered_filter_count, "actual_delivered_filter_count"),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"calibration point {label} must be a non-negative integer")
        if self.actual_filter_count > self.max_filters:
            raise ValueError("calibration point actual_filter_count exceeds max_filters")
        if self.actual_delivered_filter_count > self.max_filters:
            raise ValueError("calibration point actual_delivered_filter_count exceeds max_filters")
        if not math.isfinite(self.rmse_db) or not math.isfinite(self.max_abs_db):
            raise ValueError("calibration point metrics must be finite")
        if self.seed is not None and (isinstance(self.seed, bool) or not isinstance(self.seed, int)):
            raise ValueError("calibration point seed must be an integer or null")

    def objective(self) -> ObjectivePoint:
        return ObjectivePoint(
            candidate_id=self.candidate_id,
            rmse_db=self.rmse_db,
            max_abs_db=self.max_abs_db,
            filter_count=self.actual_delivered_filter_count,
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
    if _vacuous_thresholds(normalized_thresholds):
        raise ValueError("calibration manifest is insufficient for promotion")
    normalized = {
        "version": 1,
        "createdFromRepositorySha": repository_sha,
        "corpusVersion": value["corpusVersion"],
        "continuousOracleVersion": value["continuousOracleVersion"],
        "deliverableOracleVersion": value["deliverableOracleVersion"],
        "qualityTimeFormulaVersion": 1,
        "materialImprovementThresholds": normalized_thresholds,
    }
    campaign_evidence = value.get("campaignEvidence")
    if campaign_evidence is not None:
        if not isinstance(campaign_evidence, Mapping):
            raise ValueError("calibration manifest campaignEvidence must be an object")
        normalized["campaignEvidence"] = dict(campaign_evidence)
    return normalized


def _vacuous_thresholds(thresholds: Mapping[str, float]) -> bool:
    return (
        thresholds["minimumAggregateFrontierGainFraction"] <= 1e-12 or
        thresholds["maximumPerCaseQualityRegressionFraction"] >= 1.0 or
        thresholds["maximumCatastrophicCaseRate"] >= VACUOUS_CATASTROPHIC_RATE
    )


def directed_regret(
    point: CalibrationPoint,
    frontier: Sequence[CalibrationPoint],
) -> float | None:
    if not frontier:
        return None
    return directed_reference_regret(
        point.objective(),
        tuple(frontier_point.objective() for frontier_point in frontier),
        rmse_scale=RMSE_SCALE_DB,
        max_abs_scale=MAX_ABS_SCALE_DB,
    ).regret


def _sorted_points(points: Sequence[CalibrationPoint]) -> tuple[CalibrationPoint, ...]:
    return tuple(sorted(
        points,
        key=lambda point: (
            point.rmse_db,
            point.max_abs_db,
            point.actual_delivered_filter_count,
            point.candidate_id,
        ),
    ))


def _point_record(point: CalibrationPoint) -> dict[str, object]:
    record = asdict(point)
    return {
        "candidateId": record["candidate_id"],
        "maxFilters": record["max_filters"],
        "actualFilterCount": record["actual_filter_count"],
        "actualDeliveredFilterCount": record["actual_delivered_filter_count"],
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


def _normalized_regret(
    point: CalibrationPoint,
    frontier: Sequence[CalibrationPoint],
) -> float | None:
    if not frontier:
        return None
    return normalized_regret(point.objective(), tuple(frontier_point.objective() for frontier_point in frontier))


def _insufficiency_reasons(
    recommendations: Mapping[str, object],
    validation: Mapping[str, object] | None,
    *,
    evidence_cell_count: int,
) -> list[str]:
    reasons: list[str] = []
    if validation is not None and validation.get("valid") is not True:
        reasons.extend(str(error) for error in validation.get("errors", ()))
    if evidence_cell_count == 0:
        reasons.append("no-calibration-evidence")
    gain = recommendations.get("minimumAggregateFrontierGainFraction")
    if not isinstance(gain, (int, float)) or gain <= 1e-12:
        reasons.append("oracle-does-not-strictly-improve-control")
    regression = recommendations.get("maximumPerCaseQualityRegressionFraction")
    catastrophic = recommendations.get("maximumCatastrophicCaseRate")
    if isinstance(regression, (int, float)) and regression >= 1.0:
        reasons.append("recommended-regression-policy-is-vacuous")
    if isinstance(catastrophic, (int, float)) and catastrophic >= VACUOUS_CATASTROPHIC_RATE:
        reasons.append("recommended-catastrophic-rate-is-near-one")
    return list(dict.fromkeys(reasons))


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
    manifest: Mapping[str, object] | None,
    campaign_validation: Mapping[str, object] | None = None,
) -> dict[str, object]:
    validated_manifest = None
    manifest_error: str | None = None
    if manifest is not None:
        try:
            validated_manifest = validate_manifest(manifest)
        except ValueError as error:
            manifest_error = str(error)
    control_by_cell: dict[tuple[str, int], CalibrationPoint] = {}
    for point in _sorted_points(control):
        control_by_cell.setdefault((point.problem_id, point.max_filters), point)
    continuous_by_cell: dict[tuple[str, int], list[CalibrationPoint]] = {}
    for point in continuous:
        continuous_by_cell.setdefault((point.problem_id, point.max_filters), []).append(point)
    deliverable_by_cell: dict[tuple[str, int], list[CalibrationPoint]] = {}
    for point in deliverable:
        deliverable_by_cell.setdefault((point.problem_id, point.max_filters), []).append(point)

    cells: list[dict[str, object]] = []
    gains: list[float] = []
    regressions: list[float] = []
    catastrophic = 0
    for key in sorted(set(control_by_cell) | set(continuous_by_cell) | set(deliverable_by_cell)):
        problem_id, max_filters = key
        control_point = control_by_cell.get(key)
        continuous_points = _sorted_points(continuous_by_cell.get(key, ()))
        deliverable_points = _sorted_points(deliverable_by_cell.get(key, ()))
        cell: dict[str, object] = {
            "problemId": problem_id,
            "maxFilters": max_filters,
            "control": None if control_point is None else _point_record(control_point),
            "continuousFrontier": [_point_record(point) for point in continuous_points],
            "deliverableFrontier": [_point_record(point) for point in deliverable_points],
            "controlToContinuous": {
                "regret": None if control_point is None else directed_regret(control_point, continuous_points),
                "normalizedRegret": None if control_point is None else _normalized_regret(control_point, continuous_points),
            },
            "controlToDeliverable": {
                "regret": None if control_point is None else directed_regret(control_point, deliverable_points),
                "normalizedRegret": None if control_point is None else _normalized_regret(control_point, deliverable_points),
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

    recommendations = {
        "minimumAggregateFrontierGainFraction": _fractional_recommendation(_quantile(gains, 0.25)),
        "maximumPerCaseQualityRegressionFraction": _fractional_recommendation(_quantile(regressions, 0.95)),
        "maximumCatastrophicCaseRate": _fractional_recommendation(
            (catastrophic / len(regressions)) if regressions else None
        ),
        "evidenceCellCount": len(cells),
        "thresholdsAreDerivedFromHoldout": False,
    }
    if manifest_error is not None:
        manifest_reasons = [manifest_error]
    else:
        manifest_reasons = []
    insufficiency_reasons = _insufficiency_reasons(
        recommendations,
        campaign_validation,
        evidence_cell_count=len(cells),
    )
    insufficiency_reasons.extend(reason for reason in manifest_reasons if reason not in insufficiency_reasons)
    report = {
        "version": 1,
        "report": ORACLE_CALIBRATION_VERSION,
        "corpusVersion": "research-corpus-v1" if validated_manifest is None else validated_manifest["corpusVersion"],
        "status": "valid" if not insufficiency_reasons else "insufficient",
        "insufficiencyReasons": insufficiency_reasons,
        "manifest": validated_manifest if not insufficiency_reasons else None,
        "cells": cells,
        "recommendations": recommendations,
        "campaignValidation": None if campaign_validation is None else dict(campaign_validation),
    }
    return report


def _as_calibration_point(
    candidate: Mapping[str, object],
    metrics: Mapping[str, object],
    problem_id: str,
    max_filters: int,
    actual_filter_count: int,
    actual_delivered_filter_count: int,
) -> CalibrationPoint:
    return CalibrationPoint(
        candidate_id=str(candidate["candidateId"]),
        problem_id=problem_id,
        max_filters=max_filters,
        actual_filter_count=actual_filter_count,
        actual_delivered_filter_count=actual_delivered_filter_count,
        rmse_db=float(metrics["rmseDb"]),
        max_abs_db=float(metrics["maxAbsDb"]),
        algorithm_id=str(candidate.get("algorithmId", "unknown")),
        seed=None if candidate.get("seed") is None else int(candidate["seed"]),
    )


def load_oracle_points(value: Mapping[str, object], metric: str) -> tuple[CalibrationPoint, ...]:
    if value.get("version") != 1:
        raise ValueError("oracle artifact version must be 1")
    if value.get("oracle") != metric:
        raise ValueError(f"oracle artifact oracle must be {metric}")
    frontiers = value.get("frontiers")
    if not isinstance(frontiers, Sequence) or isinstance(frontiers, (str, bytes)):
        raise ValueError("oracle artifact frontiers are required")
    points: list[CalibrationPoint] = []
    for frontier in frontiers:
        if not isinstance(frontier, Mapping):
            raise ValueError("oracle artifact frontier must be an object")
        problem_id = frontier.get("problemId")
        frontier_type = frontier.get("frontierType")
        raw_points = frontier.get("points")
        if frontier_type == "exactFilterCount":
            exact_filter_count = frontier.get("exactFilterCount")
            if not isinstance(exact_filter_count, int) or isinstance(exact_filter_count, bool) or exact_filter_count <= 0:
                raise ValueError("exact frontier exactFilterCount is required")
            if "maxFilters" in frontier:
                raise ValueError("exact frontier cannot contain maxFilters")
            # Exact-N frontiers are diagnostic only and never enter calibration cells.
            continue
        max_filters = frontier.get("maxFilters")
        if frontier_type != "maxFilters" or "exactFilterCount" in frontier:
            raise ValueError("oracle artifact frontier must distinguish exactFilterCount from maxFilters")
        if not isinstance(problem_id, str) or not isinstance(max_filters, int) or isinstance(max_filters, bool) or max_filters <= 0 or not isinstance(raw_points, Sequence):
            raise ValueError("oracle artifact frontier is incomplete")
        for raw_point in raw_points:
            if not isinstance(raw_point, Mapping):
                raise ValueError("oracle artifact point must be an object")
            if "filterCount" in raw_point:
                raise ValueError("oracle point cannot use filterCount; use actual filter counts")
            candidate = raw_point.get("candidate")
            evaluation = raw_point.get("evaluation")
            if not isinstance(candidate, Mapping) or not isinstance(evaluation, Mapping):
                raise ValueError("oracle artifact point is incomplete")
            parsed_candidate = parse_candidate(candidate)
            parsed_evaluation = parse_evaluation(evaluation)
            metrics_value = evaluation.get(metric)
            if not isinstance(metrics_value, Mapping):
                continue
            if not parsed_evaluation.valid or parsed_evaluation.candidateId != parsed_candidate.candidateId:
                raise ValueError("oracle point must contain a valid matching canonical evaluation")
            actual_filter_count_value = raw_point.get("actualFilterCount")
            actual_delivered_filter_count_value = raw_point.get("actualDeliveredFilterCount")
            if (
                not isinstance(actual_filter_count_value, int) or isinstance(actual_filter_count_value, bool) or
                not isinstance(actual_delivered_filter_count_value, int) or isinstance(actual_delivered_filter_count_value, bool)
            ):
                raise ValueError("oracle point actual filter counts must be integers")
            if actual_filter_count_value != len(parsed_candidate.filters):
                raise ValueError("oracle point actualFilterCount does not match candidate filters")
            if actual_delivered_filter_count_value != len(parsed_evaluation.deliverableFilters):
                raise ValueError("oracle point actualDeliveredFilterCount does not match evaluation")
            points.append(_as_calibration_point(
                candidate,
                metrics_value,
                problem_id,
                max_filters,
                actual_filter_count_value,
                actual_delivered_filter_count_value,
            ))
    return tuple(points)


def load_control_points(value: Mapping[str, object]) -> tuple[CalibrationPoint, ...]:
    if "filterCount" in value:
        raise ValueError("control artifact cannot use filterCount; use maxFilters and actualFilterCount")
    raw_points = value.get("points")
    if not isinstance(raw_points, Sequence) or isinstance(raw_points, (str, bytes)):
        raise ValueError("control artifact points are required")
    for index, raw_point in enumerate(raw_points):
        if isinstance(raw_point, Mapping) and "filterCount" in raw_point:
            raise ValueError(f"control artifact point {index} cannot use filterCount; use maxFilters")
    artifact_max_filters = value.get("maxFilters")
    if isinstance(artifact_max_filters, bool) or not isinstance(artifact_max_filters, int) or artifact_max_filters <= 0:
        raise ValueError("control artifact maxFilters must be a positive integer")
    required = {
        "candidateId",
        "problemId",
        "inputSha256",
        "maxFilters",
        "rmseDb",
        "maxAbsDb",
        "maeDb",
        "maxAbsFrequencyHz",
        "targetAchieved",
        "deliveredFilterCount",
        "terminationReason",
        "filters",
    }
    points: list[CalibrationPoint] = []
    for index, raw_point in enumerate(raw_points):
        if not isinstance(raw_point, Mapping):
            raise ValueError(f"control artifact point {index} must be an object")
        if "filterCount" in raw_point:
            raise ValueError(f"control artifact point {index} cannot use filterCount; use maxFilters")
        missing = required - set(raw_point)
        unknown = set(raw_point) - required
        if missing or unknown:
            details = []
            if missing:
                details.append(f"missing required field(s): {', '.join(sorted(missing))}")
            if unknown:
                details.append(f"unknown field(s): {', '.join(sorted(unknown))}")
            raise ValueError(f"control artifact point {index} " + "; ".join(details))
        if raw_point["maxFilters"] != artifact_max_filters:
            raise ValueError(f"control artifact point {index} maxFilters does not match artifact")
        input_sha = raw_point["inputSha256"]
        if not isinstance(input_sha, str) or re.fullmatch(r"[a-f0-9]{64}", input_sha) is None:
            raise ValueError(f"control artifact point {index} inputSha256 must be a SHA-256 hex digest")
        filters_value = raw_point["filters"]
        if not isinstance(filters_value, Sequence) or isinstance(filters_value, (str, bytes)):
            raise ValueError(f"control artifact point {index} filters must be an array")
        filters = tuple(
            parse_filter(filter_value, f"control artifact point {index}.filters[{filter_index}]")
            for filter_index, filter_value in enumerate(filters_value)
        )
        delivered_count = raw_point["deliveredFilterCount"]
        if (
            isinstance(delivered_count, bool) or
            not isinstance(delivered_count, int) or
            delivered_count != len(filters)
        ):
            raise ValueError(f"control artifact point {index} deliveredFilterCount does not match filters")
        points.append(CalibrationPoint(
            candidate_id=str(raw_point["candidateId"]),
            problem_id=str(raw_point["problemId"]),
            max_filters=artifact_max_filters,
            actual_filter_count=len(filters),
            actual_delivered_filter_count=delivered_count,
            rmse_db=float(raw_point["rmseDb"]),
            max_abs_db=float(raw_point["maxAbsDb"]),
            algorithm_id="standard-v2-control",
            seed=None,
        ))
    return tuple(points)


def validate_oracle_campaign(
    control: Mapping[str, object],
    continuous: Mapping[str, object],
    deliverable: Mapping[str, object],
) -> dict[str, object]:
    errors: list[str] = []

    def positive_integer(value: object, label: str) -> int | None:
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            errors.append(f"{label} must be a positive integer")
            return None
        return value

    def records(value: object, label: str) -> Sequence[Mapping[str, object]]:
        if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
            errors.append(f"{label} must be an array")
            return ()
        result: list[Mapping[str, object]] = []
        for index, entry in enumerate(value):
            if not isinstance(entry, Mapping):
                errors.append(f"{label}[{index}] must be an object")
            else:
                result.append(entry)
        return tuple(result)

    if control.get("version") != 1:
        errors.append("control artifact version must be 1")
    control_max_filters = positive_integer(control.get("maxFilters"), "control maxFilters")
    if control.get("oracle") != "standard-v2-control":
        errors.append("control artifact oracle must be standard-v2-control")
    if not isinstance(control.get("repositorySha"), str) or not control["repositorySha"]:
        errors.append("control artifact repositorySha is required")
    if control.get("corpusLayer") not in {"development", "adversarial"}:
        errors.append("control artifact corpusLayer must be development or adversarial")
    if (
        isinstance(control.get("budgetSeconds"), bool) or
        not isinstance(control.get("budgetSeconds"), int) or
        control["budgetSeconds"] not in {5, 15, 30, 60, 120}
    ):
        errors.append("control artifact budgetSeconds must be one of 5, 15, 30, 60, 120")
    if not isinstance(control.get("algorithmVersion"), str) or not control["algorithmVersion"]:
        errors.append("control artifact algorithmVersion is required")
    control_points = records(control.get("points"), "control points")
    controls_by_case: dict[str, dict[str, object]] = {}
    for index, point in enumerate(control_points):
        label = f"control points[{index}]"
        if "filterCount" in point:
            errors.append(f"{label} uses filterCount; control caps must use maxFilters")
        problem_id = point.get("problemId")
        candidate_id = point.get("candidateId")
        input_sha = point.get("inputSha256")
        point_max = point.get("maxFilters")
        filters_value = point.get("filters")
        if not isinstance(problem_id, str) or not problem_id:
            errors.append(f"{label}.problemId is required")
            continue
        if not isinstance(candidate_id, str) or not candidate_id:
            errors.append(f"{label}.candidateId is required")
            continue
        if not isinstance(input_sha, str) or re.fullmatch(r"[a-f0-9]{64}", input_sha) is None:
            errors.append(f"{label}.inputSha256 must be a SHA-256 hex digest")
            continue
        if control_max_filters is not None and point_max != control_max_filters:
            errors.append(f"{label}.maxFilters does not match control maxFilters")
        if not isinstance(filters_value, Sequence) or isinstance(filters_value, (str, bytes)):
            errors.append(f"{label}.filters must be an array")
            continue
        try:
            filters = tuple(parse_filter(filter_value, f"{label}.filters[{filter_index}]") for filter_index, filter_value in enumerate(filters_value))
        except ValueError as error:
            errors.append(str(error))
            continue
        delivered_count = point.get("deliveredFilterCount")
        if not isinstance(delivered_count, int) or isinstance(delivered_count, bool) or delivered_count != len(filters):
            errors.append(f"{label}.deliveredFilterCount does not match filters")
        if control_max_filters is not None and len(filters) > control_max_filters:
            errors.append(f"{label} candidate exceeds maxFilters")
        rmse_db = point.get("rmseDb")
        max_abs_db = point.get("maxAbsDb")
        if (
            isinstance(rmse_db, bool) or not isinstance(rmse_db, (int, float)) or not math.isfinite(float(rmse_db)) or
            isinstance(max_abs_db, bool) or not isinstance(max_abs_db, (int, float)) or not math.isfinite(float(max_abs_db))
        ):
            errors.append(f"{label} control metrics must be finite numbers")
            continue
        if problem_id in controls_by_case:
            errors.append(f"duplicate control case {problem_id}")
        controls_by_case[problem_id] = {
            "candidateId": candidate_id,
            "inputSha256": input_sha,
            "maxFilters": point_max,
            "rmseDb": float(rmse_db),
            "maxAbsDb": float(max_abs_db),
            "filterCount": len(filters),
        }

    if continuous.get("version") != 1:
        errors.append("continuous artifact version must be 1")
    if continuous.get("oracle") != "continuous":
        errors.append("continuous artifact oracle must be continuous")
    if deliverable.get("version") != 1:
        errors.append("deliverable artifact version must be 1")
    if deliverable.get("oracle") != "deliverable":
        errors.append("deliverable artifact oracle must be deliverable")

    continuous_config = continuous.get("config")
    if not isinstance(continuous_config, Mapping):
        errors.append("continuous config is required")
        continuous_config = {}
    continuous_max_filters = positive_integer(continuous_config.get("maxFilters"), "continuous config maxFilters")
    if control_max_filters is not None and continuous_max_filters != control_max_filters:
        errors.append("continuous config maxFilters does not match control maxFilters")
    positive_integer(
        continuous_config.get("evaluationBudgetPerRun"),
        "continuous config evaluationBudgetPerRun",
    )
    caps = continuous_config.get("caps")
    if not isinstance(caps, Sequence) or isinstance(caps, (str, bytes)):
        errors.append("continuous config caps must be an explicit array")
    elif continuous_max_filters is not None and tuple(caps) != (continuous_max_filters,):
        errors.append("continuous config caps must contain the requested maxFilters")
    filter_counts = continuous_config.get("filterCounts")
    expected_filter_counts = (
        tuple(range(1, continuous_max_filters + 1))
        if continuous_max_filters is not None else ()
    )
    if not isinstance(filter_counts, Sequence) or isinstance(filter_counts, (str, bytes)):
        errors.append("continuous config exact filter counts are required for every N through maxFilters")
    elif (
        any(isinstance(count, bool) or not isinstance(count, int) or count <= 0 for count in filter_counts) or
        tuple(sorted(filter_counts)) != expected_filter_counts
    ):
        errors.append("continuous config exact filter counts must contain every N from 1 through maxFilters")
    seeds = continuous_config.get("seeds")
    campaign_mode = continuous_config.get("campaignMode")
    staged_seed_requirements = {
        "smoke": 2,
        "screen": 2,
        "confirm": 4,
        "deep": 8,
        "full": 8,
    }
    required_seed_count = (
        staged_seed_requirements.get(campaign_mode, MIN_CALIBRATION_SEED_COUNT)
        if isinstance(campaign_mode, str)
        else MIN_CALIBRATION_SEED_COUNT
    )
    configured_minimum_seed_count = continuous_config.get("minimumIndependentSeedCount")
    if configured_minimum_seed_count is not None:
        if (
            isinstance(configured_minimum_seed_count, bool) or
            not isinstance(configured_minimum_seed_count, int) or
            configured_minimum_seed_count != required_seed_count
        ):
            errors.append("continuous config minimumIndependentSeedCount does not match campaign mode")
    elif isinstance(campaign_mode, str) and campaign_mode in staged_seed_requirements:
        errors.append("staged continuous config must record minimumIndependentSeedCount")
    if not isinstance(seeds, Sequence) or isinstance(seeds, (str, bytes)):
        errors.append("continuous config seeds must be an explicit array")
    else:
        if len(seeds) < required_seed_count:
            errors.append(f"continuous config requires at least {required_seed_count} explicit seeds")
        if any(isinstance(seed, bool) or not isinstance(seed, int) for seed in seeds):
            errors.append("continuous config seeds must be integers")
        elif len(set(seeds)) < required_seed_count:
            errors.append(f"continuous config requires {required_seed_count} independent seeds")
    optimizer_configs = continuous_config.get("optimizerConfigs")
    if not isinstance(optimizer_configs, Mapping):
        errors.append("continuous optimizer config records are required")
    else:
        for algorithm_id in ("differential-evolution", "cma-es", "powell"):
            config = optimizer_configs.get(algorithm_id)
            if not isinstance(config, Mapping):
                errors.append(f"continuous optimizer config missing {algorithm_id}")
            elif "seedSource" not in config or "bounds" not in config:
                errors.append(f"continuous optimizer config incomplete for {algorithm_id}")

    deliverable_config = deliverable.get("config")
    if not isinstance(deliverable_config, Mapping):
        errors.append("deliverable config is required")
        deliverable_config = {}
    deliverable_max_filters = positive_integer(
        deliverable_config.get("maxFilters"),
        "deliverable config maxFilters",
    )
    if control_max_filters is not None and deliverable_max_filters != control_max_filters:
        errors.append("deliverable config maxFilters does not match control maxFilters")
    for field in ("seed", "generations", "evaluationBudget"):
        positive_integer(deliverable_config.get(field), f"deliverable config {field}")

    def validate_frontiers(
        artifact: Mapping[str, object],
        oracle_name: str,
        allow_exact: bool,
        artifact_max_filters: int | None,
    ) -> tuple[dict[str, list[ObjectivePoint]], dict[str, set[str]]]:
        raw_frontiers = records(artifact.get("frontiers"), f"{oracle_name} frontiers")
        caps_by_case: dict[str, list[ObjectivePoint]] = {}
        ids_by_case: dict[str, set[str]] = {}
        for index, frontier in enumerate(raw_frontiers):
            label = f"{oracle_name} frontiers[{index}]"
            frontier_type = frontier.get("frontierType")
            problem_id = frontier.get("problemId")
            raw_points = frontier.get("points")
            if not isinstance(problem_id, str) or not problem_id:
                errors.append(f"{label}.problemId is required")
                continue
            if problem_id not in controls_by_case:
                errors.append(f"{label}.problemId is not present in the control artifact")
            points = records(raw_points, f"{label}.points")
            if frontier_type == "exactFilterCount":
                if not allow_exact:
                    errors.append(f"{label} exactFilterCount frontier is not allowed for {oracle_name}")
                    continue
                exact_count = positive_integer(frontier.get("exactFilterCount"), f"{label}.exactFilterCount")
                if "maxFilters" in frontier:
                    errors.append(f"{label} conflates exactFilterCount and maxFilters")
                if exact_count is None:
                    continue
                if artifact_max_filters is not None and exact_count > artifact_max_filters:
                    errors.append(f"{label}.exactFilterCount exceeds maxFilters")
                for point_index, raw_point in enumerate(points):
                    objective = _validate_stored_point(
                        raw_point,
                        problem_id,
                        artifact_max_filters or exact_count,
                        controls_by_case,
                        f"{label}.points[{point_index}]",
                        "continuous",
                    )
                    if objective is not None and objective.filter_count != exact_count:
                        errors.append(f"{label}.points[{point_index}] actualFilterCount does not match exactFilterCount")
                continue
            if frontier_type != "maxFilters":
                errors.append(f"{label} must declare frontierType exactFilterCount or maxFilters")
                continue
            if "exactFilterCount" in frontier:
                errors.append(f"{label} conflates exactFilterCount and maxFilters")
            frontier_max_filters = positive_integer(frontier.get("maxFilters"), f"{label}.maxFilters")
            if artifact_max_filters is not None and frontier_max_filters != artifact_max_filters:
                errors.append(f"{label}.maxFilters does not match requested cap")
            if not points:
                errors.append(f"{oracle_name} cap frontier for {problem_id} is empty")
            if problem_id in caps_by_case:
                errors.append(f"duplicate {oracle_name} cap frontier for {problem_id}")
            objectives: list[ObjectivePoint] = []
            identifiers: set[str] = set()
            for point_index, raw_point in enumerate(points):
                objective = _validate_stored_point(
                    raw_point,
                    problem_id,
                    frontier_max_filters or artifact_max_filters or 0,
                    controls_by_case,
                    f"{label}.points[{point_index}]",
                    "deliverable" if oracle_name == "deliverable" else "continuous",
                )
                if objective is not None:
                    if objective.candidate_id in identifiers:
                        errors.append(f"{label}.points[{point_index}] duplicates candidateId")
                    objectives.append(objective)
                    identifiers.add(objective.candidate_id)
            if objectives and len(nondominated(objectives)) != len(objectives):
                errors.append(f"{label} contains dominated frontier points")
            caps_by_case[problem_id] = objectives
            ids_by_case[problem_id] = identifiers
        return caps_by_case, ids_by_case

    def _validate_stored_point(
        raw_point: Mapping[str, object],
        problem_id: str,
        max_filters: int,
        controls: Mapping[str, Mapping[str, object]],
        label: str,
        metric_name: str,
    ) -> ObjectivePoint | None:
        if "filterCount" in raw_point:
            errors.append(f"{label} uses filterCount; use actualFilterCount and actualDeliveredFilterCount")
        expected_point_keys = {
            "candidate",
            "evaluation",
            "actualFilterCount",
            "actualDeliveredFilterCount",
            "provenance",
        }
        missing_point_keys = expected_point_keys - {"provenance"} - set(raw_point)
        unknown_point_keys = set(raw_point) - expected_point_keys
        if missing_point_keys:
            errors.append(f"{label} missing required field(s): {', '.join(sorted(missing_point_keys))}")
        if unknown_point_keys:
            errors.append(f"{label} contains unknown field(s): {', '.join(sorted(unknown_point_keys))}")
        candidate_raw = raw_point.get("candidate")
        evaluation_raw = raw_point.get("evaluation")
        if not isinstance(candidate_raw, Mapping) or not isinstance(evaluation_raw, Mapping):
            errors.append(f"{label} requires candidate and evaluation")
            return None
        try:
            candidate = parse_candidate(candidate_raw)
            evaluation = parse_evaluation(evaluation_raw)
        except ValueError as error:
            errors.append(f"{label}: {error}")
            return None
        if candidate.problemId != problem_id:
            errors.append(f"{label} candidate problemId does not match frontier")
        control = controls.get(problem_id)
        if control is None:
            errors.append(f"{label} has no matching control case")
        elif candidate.inputSha256 != control["inputSha256"]:
            errors.append(f"{label} candidate inputSha256 does not match control")
        if evaluation.candidateId != candidate.candidateId:
            errors.append(f"{label} evaluation candidateId does not match candidate")
        if metric_name == "continuous":
            allowed_algorithms = {"standard-v2-control", "differential-evolution", "cma-es", "powell"}
        else:
            allowed_algorithms = {
                "standard-v2-control",
                "differential-evolution",
                "cma-es",
                "powell",
                "deliverable-oracle",
                "continuous",
            }
        if candidate.algorithmId not in allowed_algorithms:
            errors.append(f"{label} has unknown optimizer provenance {candidate.algorithmId}")
        if candidate.algorithmId != "standard-v2-control" and candidate.seed is None:
            errors.append(f"{label} optimizer provenance requires a seed")
        if not evaluation.valid:
            errors.append(f"{label} canonical evaluation is invalid")
            return None
        metric = evaluation.continuous if metric_name == "continuous" else evaluation.deliverable
        if metric is None:
            errors.append(f"{label} is missing canonical {metric_name} metrics")
            return None
        if len(candidate.filters) > max_filters:
            errors.append(f"{label} candidate exceeds maxFilters")
        if len(evaluation.deliverableFilters) > max_filters:
            errors.append(f"{label} delivered candidate exceeds maxFilters")
        actual_filter_count = raw_point.get("actualFilterCount")
        actual_delivered_filter_count = raw_point.get("actualDeliveredFilterCount")
        if not isinstance(actual_filter_count, int) or isinstance(actual_filter_count, bool):
            errors.append(f"{label} actualFilterCount is required")
        elif actual_filter_count != len(candidate.filters):
            errors.append(f"{label} actualFilterCount does not match candidate")
        if not isinstance(actual_delivered_filter_count, int) or isinstance(actual_delivered_filter_count, bool):
            errors.append(f"{label} actualDeliveredFilterCount is required")
        elif actual_delivered_filter_count != len(evaluation.deliverableFilters):
            errors.append(f"{label} actualDeliveredFilterCount does not match evaluation")
        objective_filter_count = len(evaluation.deliverableFilters) if metric_name == "deliverable" else len(candidate.filters)
        return ObjectivePoint(
            candidate_id=candidate.candidateId,
            rmse_db=metric.rmseDb,
            max_abs_db=metric.maxAbsDb,
            filter_count=objective_filter_count,
        )

    continuous_caps, continuous_ids = validate_frontiers(
        continuous,
        "continuous",
        True,
        continuous_max_filters,
    )
    deliverable_caps, deliverable_ids = validate_frontiers(
        deliverable,
        "deliverable",
        False,
        deliverable_max_filters,
    )
    expected_cases = set(controls_by_case)
    for oracle_name, caps, identifiers in (
        ("continuous", continuous_caps, continuous_ids),
        ("deliverable", deliverable_caps, deliverable_ids),
    ):
        missing = sorted(expected_cases - set(caps))
        for problem_id in missing:
            errors.append(f"missing {oracle_name} cap frontier for {problem_id}")
        for problem_id, control_point in controls_by_case.items():
            points = caps.get(problem_id, [])
            control_objective = ObjectivePoint(
                candidate_id=str(control_point["candidateId"]),
                rmse_db=float(control_point["rmseDb"]),
                max_abs_db=float(control_point["maxAbsDb"]),
                filter_count=int(control_point["filterCount"]),
            )
            if control_objective.candidate_id in identifiers.get(problem_id, set()):
                continue
            if not any(dominates(point, control_objective) for point in points):
                errors.append(
                    f"{oracle_name} best-known frontier for {problem_id} neither contains nor dominates frozen control"
                )

    unique_errors = list(dict.fromkeys(errors))
    return {
        "valid": not unique_errors,
        "errors": unique_errors,
        "expectedCases": sorted(expected_cases),
        "maxFilters": control_max_filters,
        "continuousCapCases": sorted(continuous_caps),
        "deliverableCapCases": sorted(deliverable_caps),
    }


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
    parser.add_argument("--minimum-aggregate-frontier-gain-fraction", type=float)
    parser.add_argument("--maximum-per-case-quality-regression-fraction", type=float)
    parser.add_argument("--maximum-catastrophic-case-rate", type=float)
    parser.add_argument("--campaign-evidence")
    parser.add_argument("--recommend-only", action="store_true")
    args = parser.parse_args(argv)
    threshold_values = (
        args.minimum_aggregate_frontier_gain_fraction,
        args.maximum_per_case_quality_regression_fraction,
        args.maximum_catastrophic_case_rate,
    )
    if args.recommend_only:
        if any(value is not None for value in threshold_values):
            parser.error("--recommend-only cannot be combined with manifest thresholds")
        selected_thresholds = None
    elif any(value is None for value in threshold_values):
        parser.error("manifest thresholds are required unless --recommend-only is used")
    else:
        selected_thresholds = {
            "minimumAggregateFrontierGainFraction": args.minimum_aggregate_frontier_gain_fraction,
            "maximumPerCaseQualityRegressionFraction": args.maximum_per_case_quality_regression_fraction,
            "maximumCatastrophicCaseRate": args.maximum_catastrophic_case_rate,
        }
    control_artifact = _read_json(args.control)
    continuous_artifact = _read_json(args.continuous)
    deliverable_artifact = _read_json(args.deliverable)
    campaign_evidence = None if args.campaign_evidence is None else _read_json(args.campaign_evidence)
    campaign_validation = validate_oracle_campaign(
        control_artifact,
        continuous_artifact,
        deliverable_artifact,
    )
    control_points = load_control_points(control_artifact)
    continuous_points = load_oracle_points(continuous_artifact, "continuous")
    deliverable_points = load_oracle_points(deliverable_artifact, "deliverable")
    report = build_calibration_report(
        control_points,
        continuous_points,
        deliverable_points,
        None,
        campaign_validation,
    )
    if campaign_evidence is not None:
        report["campaignEvidence"] = campaign_evidence
    if selected_thresholds is not None:
        manifest = {
            "version": 1,
            "createdFromRepositorySha": args.repository_sha,
            "corpusVersion": args.corpus_version,
            "continuousOracleVersion": args.continuous_version,
            "deliverableOracleVersion": args.deliverable_version,
            "qualityTimeFormulaVersion": 1,
            "materialImprovementThresholds": selected_thresholds,
        }
        if campaign_evidence is not None:
            manifest["campaignEvidence"] = campaign_evidence
        try:
            manifest = validate_manifest(manifest)
        except ValueError as error:
            report["status"] = "insufficient"
            reasons = list(report.get("insufficiencyReasons", []))
            reasons.append(str(error))
            report["insufficiencyReasons"] = list(dict.fromkeys(reasons))
            report["manifest"] = None
        else:
            report = build_calibration_report(
                control_points,
                continuous_points,
                deliverable_points,
                manifest,
                campaign_validation,
            )
            if campaign_evidence is not None:
                report["campaignEvidence"] = campaign_evidence
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if selected_thresholds is not None and report["status"] != "valid":
        reasons = "; ".join(str(reason) for reason in report["insufficiencyReasons"])
        raise ValueError(f"oracle calibration insufficient: {reasons}")


if __name__ == "__main__":
    main()
