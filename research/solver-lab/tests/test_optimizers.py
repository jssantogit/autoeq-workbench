import numpy as np

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.metrics import error_metrics
from autoeq_solver_lab.objectives import encode_filters, enumerate_oracle_layouts
from autoeq_solver_lab.optimizers.cma_es import CmaEsOptimizer
from autoeq_solver_lab.optimizers.differential_evolution import DifferentialEvolutionOptimizer
from autoeq_solver_lab.optimizers.powell import PowellOptimizer
import autoeq_solver_lab.optimizers.powell as powell_module
from autoeq_solver_lab.types import LabFilter, SolverLabCandidate, SolverLabProblem


def one_peak_problem() -> tuple[SolverLabProblem, LabFilter]:
    frequencies = np.asarray([100.0, 250.0, 500.0, 750.0, 1000.0, 1500.0, 2000.0, 4000.0])
    target_filter = LabFilter("target", True, "PK", 1000.0, 6.0, 2.0)
    desired = cascade_response_db(frequencies, 48000.0, (target_filter,))
    return SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-one-peak",
        inputSha256="c" * 64,
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
    ), target_filter


def candidate_rmse(problem: SolverLabProblem, candidate: SolverLabCandidate) -> float:
    actual = cascade_response_db(
        np.asarray(problem.frequenciesHz), problem.sampleRateHz, candidate.filters
    )
    return error_metrics(np.asarray(problem.desiredDb), actual)[0]


def test_differential_evolution_and_cma_are_seeded_and_improve_a_peak():
    lab_problem, _ = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]
    baseline = error_metrics(np.asarray(lab_problem.desiredDb), np.zeros(8))[0]

    for optimizer in (DifferentialEvolutionOptimizer(), CmaEsOptimizer()):
        first = optimizer.optimize(lab_problem, layout, 11, (1.0, 0.0), 200)
        second = optimizer.optimize(lab_problem, layout, 11, (1.0, 0.0), 200)
        assert candidate_rmse(lab_problem, first) < baseline
        assert first == second
        assert first.seed == 11


def test_powell_polishes_an_explicit_seed_candidate_with_a_budget():
    lab_problem, target_filter = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]
    initial = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="seed",
        algorithmId="seed",
        seed=3,
        filters=(LabFilter("seed-filter", True, "PK", 850.0, 3.0, 1.0),),
    )
    baseline = candidate_rmse(lab_problem, initial)

    polished = PowellOptimizer().optimize(
        lab_problem, layout, 3, (1.0, 0.0), 200, initial_candidate=initial
    )

    assert candidate_rmse(lab_problem, polished) < baseline
    assert polished.filters[0].type == target_filter.type


def test_powell_projects_the_best_vector_before_building_a_candidate(monkeypatch):
    lab_problem, _ = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]
    initial = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="seed",
        algorithmId="seed",
        seed=3,
        filters=(LabFilter("seed-filter", True, "PK", 850.0, 3.0, 1.0),),
    )

    def fake_minimize(objective, initial_vector, **_options):
        del initial_vector
        objective(np.asarray([1.25, -0.25, 0.5]))
        return None

    monkeypatch.setattr(powell_module, "minimize", fake_minimize)

    polished = PowellOptimizer().optimize(
        lab_problem, layout, 3, (1.0, 0.0), 1, initial_candidate=initial
    )

    vector = np.asarray([
        (polished.filters[0].frequencyHz - 20.0) / (20000.0 - 20.0),
        (polished.filters[0].gainDb + 15.0) / 30.0,
        (np.log10(polished.filters[0].q) - np.log10(0.1)) / (np.log10(12.0) - np.log10(0.1)),
    ])
    assert np.all(np.isfinite(vector))
    assert np.all((vector >= 0.0) & (vector <= 1.0))


def test_cma_accepts_a_small_explicit_budget_without_a_single_member_population():
    lab_problem, _ = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]

    first = CmaEsOptimizer().optimize(lab_problem, layout, 17, (1.0, 0.0), 5)
    second = CmaEsOptimizer().optimize(lab_problem, layout, 17, (1.0, 0.0), 5)

    assert first == second


def test_cma_uses_explicit_initial_candidate_as_the_neighborhood_center():
    lab_problem, _ = one_peak_problem()
    layout = enumerate_oracle_layouts(1)[0]
    initial = SolverLabCandidate(
        protocolVersion=1,
        problemId=lab_problem.problemId,
        inputSha256=lab_problem.inputSha256,
        candidateId="known-good",
        algorithmId="known-good",
        seed=None,
        filters=(LabFilter("seed-filter", True, "PK", 850.0, 3.0, 1.0),),
    )

    seeded = CmaEsOptimizer().optimize(
        lab_problem, layout, 17, (1.0, 0.0), 1, initial_candidate=initial
    )

    expected = encode_filters(lab_problem, layout, initial.filters)
    actual = encode_filters(lab_problem, layout, seeded.filters)
    assert np.allclose(actual, expected, rtol=0.0, atol=1e-12)
