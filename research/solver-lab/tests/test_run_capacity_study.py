import pytest

from autoeq_solver_lab.run_capacity_study import (
    CAPACITY_STUDY_CASES,
    CAPACITY_STUDY_EVALUATION_BUDGETS,
    CAPACITY_STUDY_SEEDS,
    build_capacity_study_report,
    validate_study_configuration,
)


def test_capacity_study_accepts_only_the_declared_case_rounds_and_seeds():
    validate_study_configuration(
        CAPACITY_STUDY_CASES,
        CAPACITY_STUDY_EVALUATION_BUDGETS,
        CAPACITY_STUDY_SEEDS,
    )


@pytest.mark.parametrize(
    "cases,budgets,seeds",
    [
        (("other",), CAPACITY_STUDY_EVALUATION_BUDGETS, CAPACITY_STUDY_SEEDS),
        (CAPACITY_STUDY_CASES, (123,), CAPACITY_STUDY_SEEDS),
        (CAPACITY_STUDY_CASES, CAPACITY_STUDY_EVALUATION_BUDGETS, (1,)),
    ],
)
def test_capacity_study_rejects_non_declared_configuration(cases, budgets, seeds):
    with pytest.raises(ValueError):
        validate_study_configuration(cases, budgets, seeds)


def test_missing_reference_report_keeps_python_and_teacher_evidence_blocked(tmp_path):
    report = build_capacity_study_report(
        tmp_path / "corrected-oracle-snapshot.json",
        tmp_path / "typescript-runs",
    )

    assert report["status"] == "blocked"
    assert len(report["highCapChecks"]) == 3
    assert all(check["blocksCapLimited"] for check in report["highCapChecks"])
    assert all(
        {observation["maxFilters"] for observation in check["observations"]} == {40, 64}
        for check in report["highCapChecks"]
    )
    assert "python-fixed-cap-study-not-run" in " ".join(report["blockers"])
    assert "teacher-compression-study-not-run" in " ".join(report["blockers"])
