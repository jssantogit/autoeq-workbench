import math

import pytest

from autoeq_solver_lab.calibration import (
    CalibrationPoint,
    build_calibration_report,
    validate_manifest,
)


def point(
    candidate_id: str,
    problem_id: str,
    filter_count: int,
    rmse_db: float,
    max_abs_db: float,
    algorithm_id: str,
) -> CalibrationPoint:
    return CalibrationPoint(
        candidate_id=candidate_id,
        problem_id=problem_id,
        filter_count=filter_count,
        rmse_db=rmse_db,
        max_abs_db=max_abs_db,
        algorithm_id=algorithm_id,
        seed=11,
    )


def manifest(**thresholds: float) -> dict:
    return {
        "version": 1,
        "createdFromRepositorySha": "a" * 64,
        "corpusVersion": "research-corpus-v1",
        "continuousOracleVersion": "continuous-v1",
        "deliverableOracleVersion": "deliverable-v1",
        "qualityTimeFormulaVersion": 1,
        "materialImprovementThresholds": {
            "minimumAggregateFrontierGainFraction": thresholds.get("gain", 0.1),
            "maximumPerCaseQualityRegressionFraction": thresholds.get("regression", 0.2),
            "maximumCatastrophicCaseRate": thresholds.get("catastrophic", 0.25),
        },
    }


def test_report_has_directional_regret_gap_and_stable_cell_order():
    report = build_calibration_report(
        control=(point("control-a", "case-a", 10, 0.1, 0.6, "standard-v2-control"),),
        continuous=(
            point("cma-a", "case-a", 10, 0.01, 0.61, "cma-es"),
            point("de-a", "case-a", 10, 0.1, 0.6, "differential-evolution"),
        ),
        deliverable=(point("deliverable-a", "case-a", 10, 0.05, 0.62, "deliverable-oracle"),),
        manifest=manifest(),
    )

    cell = report["cells"][0]
    assert [(entry["problemId"], entry["filterCount"]) for entry in report["cells"]] == [
        ("case-a", 10),
    ]
    assert cell["controlToContinuous"]["regret"] == 0.0
    assert cell["controlToDeliverable"]["regret"] > 0.0
    assert cell["continuousToDeliverableGap"]["best"] > 0.0
    assert cell["continuousToDeliverableGap"]["worst"] >= cell["continuousToDeliverableGap"]["best"]
    assert cell["independentFamilyAgreement"]["families"] == [
        "cma-es",
        "differential-evolution",
    ]
    assert cell["continuousFrontier"][0]["candidateId"] == "cma-a"


@pytest.mark.parametrize("value", [-0.01, 1.01, math.nan, math.inf])
def test_manifest_rejects_invalid_fractional_thresholds(value: float):
    with pytest.raises(ValueError, match="threshold"):
        validate_manifest(manifest(gain=value))


def test_manifest_rejects_unknown_version_and_accepts_explicit_values():
    accepted = validate_manifest(manifest(gain=0.125, regression=0.375, catastrophic=0.0))
    assert accepted["materialImprovementThresholds"] == {
        "minimumAggregateFrontierGainFraction": 0.125,
        "maximumPerCaseQualityRegressionFraction": 0.375,
        "maximumCatastrophicCaseRate": 0.0,
    }
    git_sha_manifest = manifest()
    git_sha_manifest["createdFromRepositorySha"] = "b" * 40
    assert validate_manifest(git_sha_manifest)["createdFromRepositorySha"] == "b" * 40

    invalid = manifest()
    invalid["version"] = 2
    with pytest.raises(ValueError, match="version"):
        validate_manifest(invalid)
