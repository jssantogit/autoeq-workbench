import pytest

from autoeq_solver_lab.diagnosis import (
    augmented_tchebycheff_score,
    epsilon_constraint_score,
    layout_for_candidate,
    load_v1_reference_metrics,
    load_warm_start_candidates,
)
from autoeq_solver_lab.types import LabFilter, SolverLabCandidate, SolverLabProblem


def problem(problem_id: str = "titan-to-u12t", max_filters: int = 10) -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId=problem_id,
        inputSha256="a" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0),
        desiredDb=(0.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": max_filters,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def test_layout_for_candidate_matches_the_encoder_topology_order():
    lab_problem = problem()
    candidate = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="seed",
        algorithmId="known-good",
        seed=None,
        filters=(
            LabFilter("high", True, "HS", 9000.0, -2.0, 0.7),
            LabFilter("peak-b", True, "PK", 3000.0, 1.0, 2.0),
            LabFilter("low", True, "LS", 100.0, 2.0, 0.7),
            LabFilter("peak-a", True, "PK", 1000.0, -3.0, 1.0),
        ),
    )

    layout = layout_for_candidate(candidate)

    assert layout.filter_count == 4
    assert layout.filter_types == ("LS", "PK", "PK", "HS")


def test_warm_start_loader_selects_the_requested_budget_and_preserves_filters():
    lab_problem = problem()
    artifact = [
        {
            "geometryWarmStart": True,
            "caseId": lab_problem.problemId,
            "budgetSeconds": 5,
            "maxFilters": 10,
            "final": {"deliveredFilterCount": 1},
            "filters": [
                {"id": "five", "enabled": True, "type": "PK", "frequencyHz": 900.0, "gainDb": 1.0, "q": 1.0}
            ],
        },
        {
            "geometryWarmStart": True,
            "caseId": lab_problem.problemId,
            "budgetSeconds": 30,
            "maxFilters": 10,
            "final": {"deliveredFilterCount": 2},
            "filters": [
                {"id": "low", "enabled": True, "type": "LS", "frequencyHz": 120.0, "gainDb": 2.0, "q": 0.7},
                {"id": "peak", "enabled": True, "type": "PK", "frequencyHz": 2000.0, "gainDb": -4.0, "q": 2.0},
            ],
        },
        {
            "geometryWarmStart": False,
            "caseId": lab_problem.problemId,
            "budgetSeconds": 30,
            "maxFilters": 10,
            "final": {"deliveredFilterCount": 1},
            "filters": [
                {"id": "cold", "enabled": True, "type": "PK", "frequencyHz": 1000.0, "gainDb": 0.0, "q": 1.0}
            ],
        },
    ]

    candidates = load_warm_start_candidates(
        artifact,
        (lab_problem,),
        budget_seconds=30,
        max_filters=10,
        source_label="run-33987922969",
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.problemId == lab_problem.problemId
    assert candidate.inputSha256 == lab_problem.inputSha256
    assert candidate.algorithmId == "known-good-warm-start"
    assert candidate.candidateId == "known-good-warm-start:run-33987922969:titan-to-u12t:30"
    assert tuple(filter_.type for filter_ in candidate.filters) == ("LS", "PK")


def test_warm_start_loader_rejects_a_delivered_count_mismatch():
    lab_problem = problem()
    artifact = [{
        "geometryWarmStart": True,
        "caseId": lab_problem.problemId,
        "budgetSeconds": 30,
        "maxFilters": 10,
        "final": {"deliveredFilterCount": 2},
        "filters": [
            {"id": "peak", "enabled": True, "type": "PK", "frequencyHz": 1000.0, "gainDb": 1.0, "q": 1.0}
        ],
    }]

    with pytest.raises(ValueError, match="deliveredFilterCount"):
        load_warm_start_candidates(
            artifact,
            (lab_problem,),
            budget_seconds=30,
            max_filters=10,
            source_label="test",
        )


def test_v1_reference_loader_keeps_metrics_as_reference_only():
    artifact = {
        "schemaVersion": 1,
        "rows": [
            {
                "caseId": "titan-to-u12t",
                "metrics": {"rmseDb": 0.5578, "maxAbsDb": 3.6374},
                "filterCount": 10,
            }
        ],
    }

    references = load_v1_reference_metrics(artifact)

    assert references == {
        "titan-to-u12t": {
            "rmseDb": pytest.approx(0.5578),
            "maxAbsDb": pytest.approx(3.6374),
            "filterCount": 10,
        }
    }


def test_augmented_tchebycheff_rewards_balanced_normalized_improvement():
    baseline = augmented_tchebycheff_score(1.0, 4.0, (0.5, 0.5))
    improved_both = augmented_tchebycheff_score(0.8, 3.2, (0.5, 0.5))
    improved_rmse_only = augmented_tchebycheff_score(0.6, 4.0, (0.5, 0.5))

    assert improved_both < baseline
    assert improved_both < improved_rmse_only


def test_epsilon_constraint_penalizes_only_max_abs_violation():
    feasible = epsilon_constraint_score(0.8, 3.0, epsilon_max_abs_db=3.5)
    infeasible = epsilon_constraint_score(0.7, 4.0, epsilon_max_abs_db=3.5)

    assert feasible == pytest.approx(0.8 / 0.25)
    assert infeasible > feasible
