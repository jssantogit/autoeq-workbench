from dataclasses import replace
import math

import numpy as np

from autoeq_solver_lab.dsp import cascade_response_db
from autoeq_solver_lab.metrics import error_metrics
from autoeq_solver_lab.quantization import quantize_filters
from autoeq_solver_lab.solvers.matching_pursuit import (
    DictionaryConfig,
    MatchingPursuitConfig,
    MatchingPursuitSolver,
    build_dictionary,
)
from autoeq_solver_lab.types import (
    CanonicalMetricSet,
    LabFilter,
    SolverLabEvaluation,
    SolverLabProblem,
)


def problem(desired: np.ndarray, max_filters: int = 2) -> SolverLabProblem:
    frequencies = np.geomspace(20, 20_000, desired.size)
    return SolverLabProblem(
        protocolVersion=1,
        problemId="synthetic-matching-pursuit",
        inputSha256="a" * 64,
        sampleRateHz=48_000,
        frequenciesHz=tuple(float(value) for value in frequencies),
        desiredDb=tuple(float(value) for value in desired),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20_000.0,
            "minGainDb": -12.0,
            "maxGainDb": 12.0,
            "minPkQ": 0.5,
            "maxPkQ": 4.0,
            "shelfQ": 0.7,
            "maxFilters": max_filters,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


class SyntheticCanonicalEvaluator:
    def __init__(self) -> None:
        self.candidates = []

    def evaluate(self, active_problem, candidates):
        evaluations = []
        frequencies = np.asarray(active_problem.frequenciesHz, dtype=np.float64)
        desired = np.asarray(active_problem.desiredDb, dtype=np.float64)
        for candidate in candidates:
            self.candidates.extend(candidate.filters)
            delivered = quantize_filters(candidate.filters, {
                **active_problem.bounds,
                "minQ": active_problem.bounds["minPkQ"],
                "maxQ": active_problem.bounds["maxPkQ"],
            })
            actual = cascade_response_db(frequencies, active_problem.sampleRateHz, delivered)
            rmse, max_abs = error_metrics(desired, actual)
            metric = CanonicalMetricSet(rmse, max_abs, {})
            evaluations.append(SolverLabEvaluation(
                protocolVersion=1,
                candidateId=candidate.candidateId,
                valid=True,
                rejectionReason=None,
                continuous=metric,
                deliverable=metric,
                deliverableFilters=delivered,
                cancellationTotalScore=0.0,
            ))
        return tuple(evaluations)


def config(max_filters: int = 2) -> MatchingPursuitConfig:
    return MatchingPursuitConfig(
        dictionary=DictionaryConfig(
            frequencies_per_octave=24,
            pk_q_values=(0.5, 1.0, 2.0, 4.0),
            include_shelves=False,
        ),
        max_filters=max_filters,
        checkpoint_every_evaluations=1,
        nonlinear_polish_evaluations=0,
    )


def peak_target(frequency_hz: float, gain_db: float, q: float, count: int = 96) -> np.ndarray:
    frequencies = np.geomspace(20, 20_000, count)
    return cascade_response_db(
        frequencies,
        48_000,
        (LabFilter("target", True, "PK", frequency_hz, gain_db, q),),
    )


def test_dictionary_has_deterministic_log_positions_and_canonical_q_order():
    active_problem = problem(np.zeros(96), max_filters=10)
    atoms = build_dictionary(active_problem, config(10).dictionary)

    frequencies = sorted({atom.frequencyHz for atom in atoms})
    assert frequencies[0] == active_problem.bounds["minFrequencyHz"]
    assert all(
        math.isclose(math.log2(right / left), 1 / 24, rel_tol=0, abs_tol=1e-12) or right == frequencies[-1]
        for left, right in zip(frequencies, frequencies[1:])
    )
    assert [atom.q for atom in atoms if atom.frequencyHz == frequencies[0]] == [0.5, 1.0, 2.0, 4.0]
    assert len(atoms) == len(frequencies) * 4


def test_matching_pursuit_is_deterministic_for_repeated_seed():
    active_problem = problem(peak_target(1_000, 5.0, 1.0), max_filters=2)
    first_solver = MatchingPursuitSolver(config())
    second_solver = MatchingPursuitSolver(config())
    reference = ()

    first_solver.run(active_problem, 17, 2, reference, "b" * 64, SyntheticCanonicalEvaluator())
    second_solver.run(active_problem, 17, 2, reference, "b" * 64, SyntheticCanonicalEvaluator())

    assert first_solver.last_candidate_sequence == second_solver.last_candidate_sequence


def test_one_peak_selects_a_nearby_atom_and_beats_zero_filter_baseline():
    active_problem = problem(peak_target(1_000, 5.0, 1.0), max_filters=1)
    solver = MatchingPursuitSolver(config(1))
    result = solver.run(active_problem, 7, 1, (), "b" * 64, SyntheticCanonicalEvaluator())

    selected = solver.last_selected_atoms
    assert len(selected) == 1
    assert abs(math.log2(selected[0].frequencyHz / 1_000)) <= 1 / 24 + 1e-12
    baseline_rmse, _ = error_metrics(
        np.asarray(active_problem.desiredDb),
        np.zeros(len(active_problem.desiredDb)),
    )
    assert result.trajectory[-1].canonical_rmse_db < baseline_rmse


def test_two_selected_features_reduce_both_canonical_metrics():
    active_problem = problem(
        peak_target(500, 4.0, 1.0) + peak_target(4_000, -3.0, 1.4),
        max_filters=2,
    )
    solver = MatchingPursuitSolver(config())
    result = solver.run(active_problem, 11, 2, (), "b" * 64, SyntheticCanonicalEvaluator())

    assert len(solver.last_candidate_sequence) >= 2
    first = result.trajectory[0]
    last = result.trajectory[-1]
    assert last.canonical_rmse_db < first.canonical_rmse_db
    assert last.canonical_max_abs_db < first.canonical_max_abs_db
