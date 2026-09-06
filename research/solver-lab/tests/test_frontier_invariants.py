import pytest

from autoeq_solver_lab.calibration import load_control_points, validate_oracle_campaign


def test_campaign_validation_requires_nonempty_cap_frontiers_and_optimizer_provenance():
    control = {
        "version": 1,
        "oracle": "standard-v2-control",
        "maxFilters": 2,
        "points": [{
            "candidateId": "standard-v2-control:case-a:2:30",
            "problemId": "case-a",
            "inputSha256": "a" * 64,
            "maxFilters": 2,
            "deliveredFilterCount": 0,
            "rmseDb": 0.1,
            "maxAbsDb": 0.2,
            "filters": [],
        }],
    }
    continuous = {
        "version": 1,
        "oracle": "continuous",
        "config": {"maxFilters": 2, "seeds": [11, 29]},
        "frontiers": [{
            "frontierType": "exactFilterCount",
            "problemId": "case-a",
            "exactFilterCount": 1,
            "points": [],
        }],
    }
    deliverable = {
        "version": 1,
        "oracle": "deliverable",
        "config": {"maxFilters": 2},
        "frontiers": [],
    }

    validation = validate_oracle_campaign(control, continuous, deliverable)

    assert validation["valid"] is False
    assert any("continuous" in error and "cap frontier" in error for error in validation["errors"])
    assert any("deliverable" in error and "cap frontier" in error for error in validation["errors"])
    assert any("exact filter counts" in error for error in validation["errors"])
    assert any("optimizer config" in error for error in validation["errors"])


def test_campaign_validation_rejects_exact_cap_field_conflation():
    artifact = {
        "version": 1,
        "oracle": "standard-v2-control",
        "maxFilters": 1,
        "points": [{
            "candidateId": "control",
            "problemId": "case-a",
            "inputSha256": "a" * 64,
            "filterCount": 1,
            "deliveredFilterCount": 1,
            "filters": [],
        }],
    }

    validation = validate_oracle_campaign(artifact, artifact, artifact)

    assert validation["valid"] is False
    assert any("filterCount" in error for error in validation["errors"])


def test_campaign_validation_rejects_wrong_artifact_identity():
    control = {
        "version": 2,
        "oracle": "standard-v2-control",
        "maxFilters": 1,
        "points": [],
    }
    continuous = {"version": 1, "oracle": "wrong", "config": {}, "frontiers": []}
    deliverable = {"version": 1, "oracle": "wrong", "config": {}, "frontiers": []}

    validation = validate_oracle_campaign(control, continuous, deliverable)

    assert validation["valid"] is False
    assert any("version" in error for error in validation["errors"])
    assert any("continuous artifact oracle" in error for error in validation["errors"])
    assert any("deliverable artifact oracle" in error for error in validation["errors"])


def test_control_loader_rejects_legacy_filter_count_field():
    with pytest.raises(ValueError, match="filterCount"):
        load_control_points({
            "oracle": "standard-v2-control",
            "points": [{"filterCount": 1}],
        })
