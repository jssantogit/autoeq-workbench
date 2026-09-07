"""Fixed-cap sparse matching pursuit for research experiments only."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
import math
import re
from typing import Protocol

import numpy as np
from scipy.optimize import lsq_linear

from ..canonical import CanonicalEvaluator
from ..dsp import cascade_response_db
from ..quantization import quantize_filters
from ..quality_time import compute_quality_time_frontier
from ..reference_regret import directed_reference_regret
from ..trajectory import (
    SolverRunResult,
    SolverTrajectoryPoint,
    append_best_so_far,
    trajectory_quality_time_points,
)
from ..types import (
    FilterType,
    LabFilter,
    ObjectivePoint,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)


_SHA256 = re.compile(r"^[a-f0-9]{64}$")


class CanonicalEvaluatorLike(Protocol):
    def evaluate(
        self,
        problem: SolverLabProblem,
        candidates: Sequence[SolverLabCandidate],
    ) -> Sequence[SolverLabEvaluation]:
        ...


@dataclass(frozen=True)
class DictionaryConfig:
    frequencies_per_octave: int = 24
    pk_q_values: tuple[float, ...] = (0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0)
    include_shelves: bool = True

    def __post_init__(self) -> None:
        if isinstance(self.frequencies_per_octave, bool) or not isinstance(self.frequencies_per_octave, int):
            raise ValueError("frequencies_per_octave must be an integer")
        if self.frequencies_per_octave <= 0:
            raise ValueError("frequencies_per_octave must be positive")
        if not self.pk_q_values or any(
            not math.isfinite(q) or q <= 0 for q in self.pk_q_values
        ):
            raise ValueError("pk_q_values must contain finite positive values")
        if not isinstance(self.include_shelves, bool):
            raise ValueError("include_shelves must be boolean")


@dataclass(frozen=True)
class MatchingPursuitConfig:
    dictionary: DictionaryConfig
    max_filters: int
    checkpoint_every_evaluations: int
    nonlinear_polish_evaluations: int

    def __post_init__(self) -> None:
        if isinstance(self.max_filters, bool) or not isinstance(self.max_filters, int) or self.max_filters <= 0:
            raise ValueError("max_filters must be a positive integer")
        if (
            isinstance(self.checkpoint_every_evaluations, bool) or
            not isinstance(self.checkpoint_every_evaluations, int) or
            self.checkpoint_every_evaluations <= 0
        ):
            raise ValueError("checkpoint_every_evaluations must be a positive integer")
        if (
            isinstance(self.nonlinear_polish_evaluations, bool) or
            not isinstance(self.nonlinear_polish_evaluations, int) or
            self.nonlinear_polish_evaluations < 0
        ):
            raise ValueError("nonlinear_polish_evaluations must be non-negative")


@dataclass(frozen=True)
class DictionaryAtom:
    atom_id: str
    type: FilterType
    frequencyHz: float
    q: float


def _bound(problem: SolverLabProblem, key: str) -> float:
    value = problem.bounds.get(key)
    if value is None or isinstance(value, bool) or not math.isfinite(float(value)):
        raise ValueError(f"problem bound {key} must be finite")
    return float(value)


def _frequency_positions(problem: SolverLabProblem, frequencies_per_octave: int) -> tuple[float, ...]:
    minimum = _bound(problem, "minFrequencyHz")
    maximum = _bound(problem, "maxFrequencyHz")
    if minimum <= 0 or maximum <= minimum:
        raise ValueError("problem frequency bounds must be positive and ordered")
    positions: list[float] = []
    index = 0
    while True:
        frequency = minimum * 2 ** (index / frequencies_per_octave)
        if frequency > maximum + 1e-12:
            break
        positions.append(min(maximum, frequency))
        index += 1
    if not positions:
        raise ValueError("dictionary has no frequency positions")
    return tuple(positions)


def build_dictionary(
    problem: SolverLabProblem,
    config: DictionaryConfig,
) -> tuple[DictionaryAtom, ...]:
    minimum_q = _bound(problem, "minPkQ")
    maximum_q = _bound(problem, "maxPkQ")
    shelf_q = _bound(problem, "shelfQ")
    q_values = tuple(sorted({q for q in config.pk_q_values if minimum_q <= q <= maximum_q}))
    if not q_values:
        raise ValueError("dictionary has no PK Q values inside problem bounds")

    atoms: list[DictionaryAtom] = []
    for frequency_index, frequency in enumerate(_frequency_positions(problem, config.frequencies_per_octave)):
        for q_index, q in enumerate(q_values):
            atoms.append(DictionaryAtom(
                atom_id=f"dict-pk-{frequency_index:04d}-{q_index:02d}",
                type="PK",
                frequencyHz=frequency,
                q=q,
            ))
        if config.include_shelves:
            atoms.extend((
                DictionaryAtom(
                    atom_id=f"dict-ls-{frequency_index:04d}",
                    type="LS",
                    frequencyHz=frequency,
                    q=shelf_q,
                ),
                DictionaryAtom(
                    atom_id=f"dict-hs-{frequency_index:04d}",
                    type="HS",
                    frequencyHz=frequency,
                    q=shelf_q,
                ),
            ))
    return tuple(atoms)


def build_unit_response_matrix(
    problem: SolverLabProblem,
    atoms: Sequence[DictionaryAtom],
) -> np.ndarray:
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    if frequencies.ndim != 1 or frequencies.size == 0:
        raise ValueError("problem frequencies must be a non-empty one-dimensional array")
    columns = [cascade_response_db(
        frequencies,
        problem.sampleRateHz,
        (type_filter(atom, gain_db=1.0),),
    ) for atom in atoms]
    if not columns:
        raise ValueError("unit response matrix requires at least one atom")
    matrix = np.column_stack(columns).astype(np.float64, copy=False)
    if not np.all(np.isfinite(matrix)):
        raise ValueError("unit response matrix must be finite")
    return matrix


def type_filter(atom: DictionaryAtom, gain_db: float) -> LabFilter:
    return LabFilter(
        id=atom.atom_id,
        enabled=True,
        type=atom.type,
        frequencyHz=atom.frequencyHz,
        gainDb=gain_db,
        q=atom.q,
    )


def _quantization_bounds(problem: SolverLabProblem) -> dict[str, float | int]:
    return {
        "minFrequencyHz": problem.bounds["minFrequencyHz"],
        "maxFrequencyHz": problem.bounds["maxFrequencyHz"],
        "minGainDb": problem.bounds["minGainDb"],
        "maxGainDb": problem.bounds["maxGainDb"],
        "minQ": problem.bounds["minPkQ"],
        "maxQ": problem.bounds["maxPkQ"],
        "shelfQ": problem.bounds["shelfQ"],
    }


def _evaluate(
    canonical_evaluator: CanonicalEvaluatorLike | CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
) -> SolverLabEvaluation:
    if hasattr(canonical_evaluator, "evaluate"):
        evaluations = canonical_evaluator.evaluate(problem, (candidate,))
    else:
        evaluations = canonical_evaluator(problem, (candidate,))
    if len(evaluations) != 1 or evaluations[0].candidateId != candidate.candidateId:
        raise ValueError("canonical evaluator returned an unexpected candidate set")
    evaluation = evaluations[0]
    if not evaluation.valid or evaluation.deliverable is None:
        raise ValueError(f"canonical evaluation rejected candidate {candidate.candidateId}")
    return evaluation


def _reference_result(
    evaluation: SolverLabEvaluation,
    candidate_id: str,
    references: Sequence[ObjectivePoint],
) -> tuple[float, bool]:
    if evaluation.deliverable is None:
        raise ValueError("reference result requires delivered metrics")
    point = ObjectivePoint(
        candidate_id=candidate_id,
        rmse_db=evaluation.deliverable.rmseDb,
        max_abs_db=evaluation.deliverable.maxAbsDb,
        filter_count=len(evaluation.deliverableFilters),
    )
    if not references:
        return 0.0, False
    result = directed_reference_regret(point, references)
    return result.regret, result.reference_improved


def _trajectory_point(
    evaluation: SolverLabEvaluation,
    candidate: SolverLabCandidate,
    evaluation_count: int,
    elapsed_ms: float,
    references: Sequence[ObjectivePoint],
) -> SolverTrajectoryPoint:
    if evaluation.deliverable is None:
        raise ValueError("trajectory point requires a delivered evaluation")
    regret, improved = _reference_result(evaluation, candidate.candidateId, references)
    return SolverTrajectoryPoint(
        evaluation_count=evaluation_count,
        elapsed_ms=elapsed_ms,
        candidate_id=candidate.candidateId,
        actual_delivered_filter_count=len(evaluation.deliverableFilters),
        canonical_rmse_db=evaluation.deliverable.rmseDb,
        canonical_max_abs_db=evaluation.deliverable.maxAbsDb,
        reference_regret=regret,
        reference_improved=improved,
    )


def compute_quality_time(trajectory: Sequence[SolverTrajectoryPoint]) -> float:
    return compute_quality_time_frontier(trajectory_quality_time_points(trajectory))


class MatchingPursuitSolver:
    algorithm_id = "matching-pursuit-v1"

    def __init__(
        self,
        config: MatchingPursuitConfig,
        preferred_frequencies: Sequence[float] = (),
    ) -> None:
        self.config = config
        if any(not math.isfinite(frequency) or frequency <= 0 for frequency in preferred_frequencies):
            raise ValueError("preferred_frequencies must contain finite positive values")
        self.preferred_frequencies = tuple(float(frequency) for frequency in preferred_frequencies)
        self.last_selected_atoms: tuple[DictionaryAtom, ...] = ()
        self.last_candidate_sequence: tuple[SolverLabCandidate, ...] = ()

    def _candidate(
        self,
        problem: SolverLabProblem,
        filters,
        seed: int,
        label: str,
    ) -> SolverLabCandidate:
        return SolverLabCandidate(
            protocolVersion=1,
            problemId=problem.problemId,
            inputSha256=problem.inputSha256,
            candidateId=f"{self.algorithm_id}:{problem.problemId}:{seed}:{label}",
            algorithmId=self.algorithm_id,
            seed=seed,
            filters=tuple(filters),
        )

    def _polish(
        self,
        problem: SolverLabProblem,
        candidate: SolverLabCandidate,
        seed: int,
    ) -> SolverLabCandidate:
        if self.config.nonlinear_polish_evaluations == 0 or not candidate.filters:
            return candidate
        from ..objectives import ContinuousVectorLayout
        from ..optimizers.powell import PowellOptimizer

        type_order = {"LS": 0, "PK": 1, "HS": 2}
        ordered = tuple(sorted(candidate.filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz, filter_.id)))
        layout = ContinuousVectorLayout(len(ordered), tuple(filter_.type for filter_ in ordered))
        polished = PowellOptimizer(0).optimize(
            problem,
            layout,
            seed,
            (0.5, 0.5),
            self.config.nonlinear_polish_evaluations,
            initial_candidate=SolverLabCandidate(
                protocolVersion=1,
                problemId=problem.problemId,
                inputSha256=problem.inputSha256,
                candidateId=candidate.candidateId,
                algorithmId=self.algorithm_id,
                seed=seed,
                filters=ordered,
            ),
        )
        return self._candidate(problem, polished.filters, seed, "polish")

    def run(
        self,
        problem: SolverLabProblem,
        seed: int,
        evaluation_budget: int,
        reference_frontier: Sequence[ObjectivePoint],
        reference_snapshot_sha256: str,
        canonical_evaluator: CanonicalEvaluatorLike | CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
    ) -> SolverRunResult:
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise ValueError("matching pursuit seed must be an integer")
        if isinstance(evaluation_budget, bool) or not isinstance(evaluation_budget, int) or evaluation_budget <= 0:
            raise ValueError("matching pursuit evaluation_budget must be positive")
        if _SHA256.fullmatch(reference_snapshot_sha256) is None:
            raise ValueError("matching pursuit reference snapshot must be a SHA-256 hex digest")
        if self.config.max_filters > problem.bounds["maxFilters"]:
            raise ValueError("matching pursuit max_filters exceeds problem maxFilters")

        atoms = build_dictionary(problem, self.config.dictionary)
        if self.preferred_frequencies:
            atoms = tuple(
                atom for _, atom in sorted(
                    enumerate(atoms),
                    key=lambda item: (
                        min(abs(math.log2(item[1].frequencyHz / frequency)) for frequency in self.preferred_frequencies),
                        item[0],
                    ),
                )
            )
        matrix = build_unit_response_matrix(problem, atoms)
        desired = np.asarray(problem.desiredDb, dtype=np.float64)
        if desired.ndim != 1 or desired.size != matrix.shape[0] or not np.all(np.isfinite(desired)):
            raise ValueError("problem desiredDb must match the unit response matrix")

        candidates: list[SolverLabCandidate] = []
        trajectory = ()
        selected_indices: list[int] = []
        selected_gains = np.empty(0, dtype=np.float64)
        quantization_bounds = _quantization_bounds(problem)
        candidate_index = 0

        def record(filters, label: str, work_count: int) -> None:
            nonlocal trajectory, candidate_index
            candidate = self._candidate(problem, filters, seed, f"{label}-{candidate_index:04d}")
            candidate_index += 1
            evaluation = _evaluate(canonical_evaluator, problem, candidate)
            candidates.append(candidate)
            point = _trajectory_point(
                evaluation,
                candidate,
                min(evaluation_budget, work_count),
                min(60_000.0, float(max(0, work_count))),
                reference_frontier,
            )
            trajectory = append_best_so_far(trajectory, point)

        record((), "baseline", 0)
        residual = desired.copy()
        while len(selected_indices) < min(self.config.max_filters, len(atoms)):
            next_work_count = (len(selected_indices) + 1) * self.config.checkpoint_every_evaluations
            if next_work_count > evaluation_budget:
                break
            scores = np.full(len(atoms), -np.inf, dtype=np.float64)
            for index in range(len(atoms)):
                if index in selected_indices:
                    continue
                atom = matrix[:, index]
                scores[index] = abs(float(np.dot(atom, residual))) / max(float(np.dot(atom, atom)), 1e-30)
            selected_index = int(np.argmax(scores))
            if not math.isfinite(float(scores[selected_index])) or scores[selected_index] <= 1e-12:
                break
            selected_indices.append(selected_index)
            selected_matrix = matrix[:, selected_indices]
            least_squares = lsq_linear(
                selected_matrix,
                desired,
                bounds=(_bound(problem, "minGainDb"), _bound(problem, "maxGainDb")),
                method="trf",
                lsmr_tol="auto",
            )
            if not least_squares.success and not np.all(np.isfinite(least_squares.x)):
                raise ValueError("bounded matching pursuit gain solve failed")
            selected_gains = np.asarray(least_squares.x, dtype=np.float64)
            residual = desired - selected_matrix @ selected_gains
            filters = tuple(
                type_filter(atom, float(gain))
                for atom, gain in zip((atoms[index] for index in selected_indices), selected_gains)
            )
            delivered_filters = quantize_filters(filters, quantization_bounds)
            record(delivered_filters, "sparse", next_work_count)

        self.last_selected_atoms = tuple(atoms[index] for index in selected_indices)
        self.last_candidate_sequence = tuple(candidates)
        if selected_indices and self.config.nonlinear_polish_evaluations > 0:
            sparse_filters = tuple(
                type_filter(atom, float(gain))
                for atom, gain in zip((atoms[index] for index in selected_indices), selected_gains)
            )
            sparse_candidate = self._candidate(
                problem,
                quantize_filters(sparse_filters, quantization_bounds),
                seed,
                f"polish-input-{candidate_index:04d}",
            )
            polished_candidate = self._polish(problem, sparse_candidate, seed)
            polished_delivered_candidate = self._candidate(
                problem,
                quantize_filters(polished_candidate.filters, quantization_bounds),
                seed,
                f"polish-{candidate_index:04d}",
            )
            polished_evaluation = _evaluate(canonical_evaluator, problem, polished_delivered_candidate)
            candidates.append(polished_delivered_candidate)
            polished_point = _trajectory_point(
                polished_evaluation,
                polished_delivered_candidate,
                min(evaluation_budget, evaluation_budget),
                min(60_000.0, float(evaluation_budget)),
                reference_frontier,
            )
            trajectory = append_best_so_far(trajectory, polished_point)

        self.last_candidate_sequence = tuple(candidates)
        quality_time = compute_quality_time(trajectory)
        return SolverRunResult(
            schema_version=1,
            algorithm_id=self.algorithm_id,
            variant_id="matching-pursuit-v1",
            problem_id=problem.problemId,
            input_sha256=problem.inputSha256,
            max_filters=self.config.max_filters,
            reference_snapshot_sha256=reference_snapshot_sha256,
            seed=seed,
            evaluation_budget=evaluation_budget,
            trajectory=tuple(trajectory),
            quality_time_frontier_v1=quality_time,
            metadata={
                "dictionaryAtoms": len(atoms),
                "selectedAtoms": len(selected_indices),
                "checkpointEveryEvaluations": self.config.checkpoint_every_evaluations,
                "nonlinearPolishEvaluations": self.config.nonlinear_polish_evaluations,
                "timingBasis": "synthetic-evaluation-count-not-wall-clock",
            },
        )
