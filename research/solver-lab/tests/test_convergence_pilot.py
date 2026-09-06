from autoeq_solver_lab.convergence_pilot import summarize_frontier_convergence


def test_convergence_summary_requires_bidirectional_de_cma_overlap():
    points = [
        {"algorithmId": "differential-evolution", "rmseDb": 0.10, "maxAbsDb": 0.30},
        {"algorithmId": "cma-es", "rmseDb": 0.11, "maxAbsDb": 0.31},
        {"algorithmId": "powell", "rmseDb": 0.02, "maxAbsDb": 0.02},
    ]

    summary = summarize_frontier_convergence(points)

    assert summary["meaningfulIndependentOverlap"] is True
    assert summary["matchedPointCounts"] == {
        "cma-es": 1,
        "differential-evolution": 1,
    }


def test_convergence_summary_marks_single_family_as_uninformative():
    summary = summarize_frontier_convergence([
        {"algorithmId": "differential-evolution", "rmseDb": 0.10, "maxAbsDb": 0.30},
    ])

    assert summary["meaningfulIndependentOverlap"] is False
    assert summary["agreementFraction"] is None
