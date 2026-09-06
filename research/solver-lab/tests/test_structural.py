import numpy as np

from autoeq_solver_lab.structural import (
    StructuralMutation,
    generate_structural_mutations,
)
from autoeq_solver_lab.types import LabFilter, SolverLabProblem


def problem() -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="structural-problem",
        inputSha256="f" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0, 1050.0, 2000.0),
        desiredDb=(0.0, 2.0, 2.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": 4,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def base_filters() -> tuple[LabFilter, ...]:
    return (
        LabFilter("pk-a", True, "PK", 1000.0, 2.0, 1.0),
        LabFilter("pk-b", True, "PK", 1050.0, 1.0, 1.5),
    )


def assert_valid(problem: SolverLabProblem, filters: tuple[LabFilter, ...]) -> None:
    assert len(filters) <= problem.bounds["maxFilters"]
    for filter_ in filters:
        assert filter_.type in problem.allowedFilterTypes
        assert problem.bounds["minFrequencyHz"] <= filter_.frequencyHz <= problem.bounds["maxFrequencyHz"]
        assert problem.bounds["minGainDb"] <= filter_.gainDb <= problem.bounds["maxGainDb"]
        assert np.isfinite([filter_.frequencyHz, filter_.gainDb, filter_.q]).all()
        if filter_.type == "PK":
            assert problem.bounds["minPkQ"] <= filter_.q <= problem.bounds["maxPkQ"]
        else:
            assert filter_.q == problem.bounds["shelfQ"]


def test_structural_mutations_preserve_product_invariants_and_are_reproducible():
    lab_problem = problem()
    residual = np.asarray(lab_problem.desiredDb, dtype=np.float64)
    frequencies = np.asarray(lab_problem.frequenciesHz, dtype=np.float64)

    first = generate_structural_mutations(
        lab_problem, base_filters(), residual, frequencies, np.random.default_rng(23)
    )
    second = generate_structural_mutations(
        lab_problem, base_filters(), residual, frequencies, np.random.default_rng(23)
    )

    assert first == second
    assert {proposal.mutation for proposal in first} == {
        StructuralMutation.ADD_PK,
        StructuralMutation.ADD_LS,
        StructuralMutation.ADD_HS,
        StructuralMutation.REMOVE,
        StructuralMutation.TYPE_MUTATION,
        StructuralMutation.SPLIT,
        StructuralMutation.MERGE,
    }
    for proposal in first:
        assert_valid(lab_problem, proposal.filters)
