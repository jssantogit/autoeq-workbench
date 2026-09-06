import numpy as np

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.objectives import (
    decode_vector,
    enumerate_oracle_layouts,
    scalarized_objective,
)
from autoeq_solver_lab.types import LabFilter, SolverLabProblem


def problem(filter_count: int = 3) -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-objective",
        inputSha256="b" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 500.0, 1000.0, 2000.0, 8000.0),
        desiredDb=(0.0, 0.0, 0.0, 0.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": filter_count,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def test_oracle_layouts_cover_the_exact_documented_topology_ensemble():
    assert [layout.filter_types for layout in enumerate_oracle_layouts(1)] == [
        ("PK",),
        ("LS",),
        ("HS",),
    ]
    assert [layout.filter_types for layout in enumerate_oracle_layouts(3)] == [
        ("PK", "PK", "PK"),
        ("LS", "PK", "PK"),
        ("PK", "PK", "HS"),
        ("LS", "PK", "HS"),
    ]
    assert len({layout.filter_types for layout in enumerate_oracle_layouts(3)}) == 4


def test_decode_vector_uses_log_frequency_and_log_pk_q_with_bounded_gain():
    lab_problem = problem()
    layout = enumerate_oracle_layouts(3)[-1]
    vector = np.asarray([0.0, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 0.75, 0.0])

    filters = decode_vector(lab_problem, layout, vector)

    assert [filter_.type for filter_ in filters] == ["LS", "PK", "HS"]
    assert filters[0].frequencyHz == lab_problem.bounds["minFrequencyHz"]
    assert filters[0].gainDb == 0.0
    assert filters[0].q == lab_problem.bounds["shelfQ"]
    assert filters[1].frequencyHz == 10 ** (
        np.log10(lab_problem.bounds["minFrequencyHz"])
        + 0.5 * (np.log10(lab_problem.bounds["maxFrequencyHz"]) - np.log10(lab_problem.bounds["minFrequencyHz"]))
    )
    assert filters[1].gainDb == 15.0
    assert filters[1].q == 12.0
    assert filters[2].frequencyHz == lab_problem.bounds["maxFrequencyHz"]
    assert all(np.isfinite([filter_.frequencyHz, filter_.gainDb, filter_.q]).all() for filter_ in filters)


def test_scalarized_objective_is_zero_for_a_matching_zero_response():
    lab_problem = problem(1)
    layout = enumerate_oracle_layouts(1)[0]
    zero_vector = np.asarray([0.5, 0.5, 0.5])
    assert scalarized_objective(lab_problem, layout, zero_vector, 1.0, 1.0) == 0.0
