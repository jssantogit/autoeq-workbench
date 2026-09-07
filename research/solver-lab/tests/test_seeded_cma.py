import numpy as np
import pytest

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.objectives import enumerate_oracle_layouts
from autoeq_solver_lab.optimizers.cma_es import CmaEsOptimizer
from autoeq_solver_lab.types import LabFilter, SolverLabCandidate, SolverLabProblem


def one_peak_problem() -> SolverLabProblem:
    frequencies = np.asarray([100.0, 250.0, 500.0, 750.0, 1000.0, 1500.0, 2000.0, 4000.0])
    target_filter = LabFilter("target", True, "PK", 1000.0, 6.0, 2.0)
    desired = cascade_response_db(frequencies, 48000.0, (target_filter,))
    return SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-seeded-cma",
        inputSha256="f" * 64,
        sampleRateHz=48000,
        frequenciesHz=tuple(frequencies.tolist()),
        desiredDb=tuple(desired.tolist()),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": 1,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def test_cma_uses_explicit_initial_candidate_as_its_starting_point():
    problem = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]
    initial = SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId="known-good",
        algorithmId="known-good",
        seed=None,
        filters=(LabFilter("known-good-filter", True, "PK", 850.0, 3.0, 1.5),),
    )

    result = CmaEsOptimizer().optimize(
        problem,
        layout,
        seed=17,
        objective_weights=(1.0, 0.0),
        evaluation_budget=1,
        initial_candidate=initial,
    )

    assert result.filters[0].frequencyHz == pytest.approx(initial.filters[0].frequencyHz)
    assert result.filters[0].gainDb == pytest.approx(initial.filters[0].gainDb)
    assert result.filters[0].q == pytest.approx(initial.filters[0].q)
    assert result.seed == 17
