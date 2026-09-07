from __future__ import annotations

import math

from autoeq_solver_lab.diagnostics import (
    DiagnosticObjective,
    build_reference_candidate,
    infer_layout_from_filters,
    objective_value,
    reference_candidates_from_artifact,
    summarize_capacity_gap,
)
from autoeq_solver_lab.types import CanonicalMetricSet, LabFilter, SolverLabEvaluation, SolverLabProblem


def _problem(max_filters: int = 10) -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="diagnostic-case",
        inputSha256="abc123",
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0, 10000.0),
        desiredDb=(1.0, -2.0, 0.5),
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
        quantization={"frequencyHz": 1.0, "gainDb": 0.1, "q": 0.01},
    )


def _filter(
    id_: str,
    type_: str,
    frequency: float,
    gain: float = 1.0,
    q: float = 1.0,
) -> LabFilter:
    return LabFilter(
        id=id_,
        enabled=True,
        type=type_,  # type: ignore[arg-type]
        frequencyHz=frequency,
        gainDb=gain,
        q=q,
    )


def _evaluation(candidate_id: str, rmse: float, max_abs: float) -> SolverLabEvaluation:
    metrics = CanonicalMetricSet(rmseDb=rmse, maxAbsDb=max_abs, bandRmseDb={})
    return SolverLabEvaluation(
        protocolVersion=1,
        candidateId=candidate_id,
        valid=True,
        rejectionReason=None,
        continuous=metrics,
        deliverable=metrics,
        deliverableFilters=(),
        cancellationTotalScore=0.0,
    )


def test_infer_layout_matches_encode_filter_order() -> None:
    layout = infer_layout_from_filters((
        _filter("pk-high", "PK", 8000.0),
        _filter("hs", "HS", 12000.0, q=0.7),
        _filter("ls", "LS", 90.0, q=0.7),
        _filter("pk-low", "PK", 300.0),
    ))

    assert layout.filter_count == 4
    assert layout.filter_types == ("LS", "PK", "PK", "HS")


def test_build_reference_candidate_uses_current_problem_identity_and_provenance() -> None:
    problem = _problem()
    candidate = build_reference_candidate(
        problem,
        provenance="coherent-warm-start",
        source_id="artifact-9975764396:titan-to-u12t:30",
        filters=(
            _filter("old-1", "LS", 100.0, q=0.7),
            _filter("old-2", "PK", 5000.0, gain=-4.0, q=3.0),
        ),
    )

    assert candidate.problemId == problem.problemId
    assert candidate.inputSha256 == problem.inputSha256
    assert candidate.algorithmId == "reference:coherent-warm-start"
    assert candidate.seed is None
    assert candidate.candidateId.startswith("reference:coherent-warm-start:diagnostic-case:")
    assert [filter_.id for filter_ in candidate.filters] == ["reference-1", "reference-2"]


def test_reference_artifact_rebinds_historical_seed_to_current_problem_for_canonical_recheck() -> None:
    problem = _problem()
    artifact = {
        "version": 1,
        "oracle": "reference-seeds",
        "sourceAlgorithm": "coherent-warm-start",
        "repositorySha": "historical-sha",
        "corpusLayer": "adversarial",
        "maxFilters": 10,
        "points": [{
            "problemId": "diagnostic-case",
            "inputSha256": "historical-input-hash",
            "provenance": "coherent-warm-start",
            "sourceId": "artifact-9975764396:diagnostic-case:30:max10",
            "filters": [{
                "id": "historical-1",
                "enabled": True,
                "type": "PK",
                "frequencyHz": 5000.0,
                "gainDb": -4.0,
                "q": 3.0,
            }],
        }],
    }

    candidates = reference_candidates_from_artifact(problem, artifact)

    assert len(candidates) == 1
    assert candidates[0].problemId == problem.problemId
    assert candidates[0].inputSha256 == problem.inputSha256
    assert candidates[0].algorithmId == "reference:coherent-warm-start"
    assert candidates[0].filters[0].id == "reference-1"


def test_tchebycheff_objective_uses_both_normalized_axes() -> None:
    spec = DiagnosticObjective(
        kind="tchebycheff",
        rmse_weight=0.5,
        max_abs_weight=0.5,
        rmse_scale=2.0,
        max_abs_scale=4.0,
    )

    value = objective_value(1.0, 3.0, spec)

    # max(0.5*0.5, 0.5*0.75) plus a small augmentation term.
    assert math.isclose(value, 0.375 + 0.05 * (0.25 + 0.375), rel_tol=0, abs_tol=1e-12)


def test_epsilon_constraint_penalizes_only_constraint_violation() -> None:
    feasible = DiagnosticObjective(
        kind="epsilon-maxabs",
        rmse_weight=1.0,
        max_abs_weight=0.0,
        rmse_scale=2.0,
        max_abs_scale=4.0,
        epsilon=0.8,
    )
    violating = objective_value(1.0, 4.0, feasible)
    non_violating = objective_value(1.0, 3.0, feasible)

    assert math.isclose(non_violating, 0.5, rel_tol=0, abs_tol=1e-12)
    assert violating > non_violating


def test_capacity_gap_summary_separates_quality_gain_from_filter_count() -> None:
    cap10 = _evaluation("cap10", rmse=1.2, max_abs=4.0)
    cap20 = _evaluation("cap20", rmse=0.8, max_abs=3.0)
    cap40 = _evaluation("cap40", rmse=0.78, max_abs=2.95)

    summary = summarize_capacity_gap({10: cap10, 20: cap20, 40: cap40})

    assert summary["bestCap"] == 40
    assert summary["cap10To20GainFraction"] > 0.2
    assert summary["cap20To40GainFraction"] < 0.05
