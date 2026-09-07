from autoeq_solver_lab.case_classification import (
    CaseClassificationInputs,
    HighCapObservation,
    classify_case,
    compute_high_cap_strict_advantage,
    evaluate_high_cap_solvability,
)
from autoeq_solver_lab.types import ObjectivePoint


def observation(
    capacity: int,
    *,
    state: str = "stable-under-current-search",
    solvability: str = "resolved",
    relationship: str = "strictly-dominates-max10",
) -> HighCapObservation:
    return HighCapObservation(
        case_id="titan-to-trio",
        max_filters=capacity,
        available=True,
        canonical_rmse_db=0.2,
        canonical_max_abs_db=0.4,
        actual_delivered_filter_count=capacity,
        pareto_reference_relationship=relationship,
        reference_state=state,
        raw_deltas_vs_max10={"rmseDb": -0.3, "maxAbsDb": -0.6},
        provenance="synthetic-teacher",
        config_hash="c" * 64,
        input_sha256="a" * 64,
        reference_snapshot_sha256="b" * 64,
        solvability_conclusion=solvability,
    )


def inputs(check):
    return CaseClassificationInputs(
        case_id="titan-to-trio",
        max10_reference_state="stable-under-current-search",
        high_cap_reference_state="stable-under-current-search",
        high_cap_check=check,
        high_cap_strict_advantage=True,
        max10_reference_improved_by_compression=False,
        max10_reference_improved_by_fixed_cap_search=False,
        all_official_teachers_attempted=True,
        compression_attempt_count=2,
    )


def test_high_cap_gate_blocks_cap_limited_when_reference_is_moving():
    check = evaluate_high_cap_solvability((observation(40, state="still-moving"),))

    assert check.conclusion == "insufficient-evidence"
    assert classify_case(inputs(check)) == "capacity-suspected"


def test_high_cap_gate_blocks_cap_limited_when_search_or_representation_is_unresolved():
    check = evaluate_high_cap_solvability((observation(40, solvability="unresolved-search-or-representation"),))

    assert check.conclusion == "unresolved-search-or-representation"
    assert classify_case(inputs(check)) == "capacity-suspected"


def test_stable_resolved_high_cap_can_support_cap_limited():
    check = evaluate_high_cap_solvability((observation(40), observation(64)))

    assert check.conclusion == "resolved"
    assert classify_case(inputs(check)) == "cap-limited"


def test_compression_and_search_override_capacity_classification():
    check = evaluate_high_cap_solvability((observation(40),))
    assert classify_case(CaseClassificationInputs(
        **{**inputs(check).__dict__, "max10_reference_improved_by_compression": True},
    )) == "mixed"
    assert classify_case(CaseClassificationInputs(
        **{**inputs(check).__dict__, "max10_reference_improved_by_fixed_cap_search": True},
    )) == "search-recoverable"


def test_strict_advantage_uses_raw_pareto_dominance_without_a_new_threshold():
    max10 = (ObjectivePoint("max10", 0.5, 1.0, 10),)
    high_cap = (ObjectivePoint("high", 0.4, 0.9, 20),)
    incomparable = (ObjectivePoint("high", 0.4, 1.1, 20),)

    assert compute_high_cap_strict_advantage(high_cap, max10) is True
    assert compute_high_cap_strict_advantage(incomparable, max10) is False
