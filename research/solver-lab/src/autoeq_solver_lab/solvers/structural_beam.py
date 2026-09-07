"""Structural beam research solver built on the approved mutation primitives."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
import math
from typing import Literal, Protocol

import numpy as np

from ..canonical import CanonicalEvaluator
from ..dsp import cascade_response_db
from ..objectives import ContinuousVectorLayout
from ..pareto import dominates, nondominated
from ..quantization import quantize_filters
from ..structural import StructuralProposal, generate_structural_mutations
from ..types import (
    CanonicalMetricSet,
    FilterType,
    LabFilter,
    ObjectivePoint,
    SolverLabCandidate,
    SolverLabEvaluation,
    SolverLabProblem,
)
from ..selector import SelectorPoint, select_reference_point


BeamOrigin = Literal['zero', 'matching-pursuit', 'teacher-compression']


class CanonicalEvaluatorLike(Protocol):
    def evaluate(
        self,
        problem: SolverLabProblem,
        candidates: Sequence[SolverLabCandidate],
    ) -> Sequence[SolverLabEvaluation]:
        ...


@dataclass(frozen=True)
class StructuralBeamConfig:
    beam_width: int
    proposals_per_parent: int
    local_polish_evaluations: int
    max_filters: int

    def __post_init__(self) -> None:
        for value, label in (
            (self.beam_width, 'beam_width'),
            (self.proposals_per_parent, 'proposals_per_parent'),
            (self.max_filters, 'max_filters'),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(f'{label} must be a positive integer')
        if (
            isinstance(self.local_polish_evaluations, bool) or
            not isinstance(self.local_polish_evaluations, int) or
            self.local_polish_evaluations < 0
        ):
            raise ValueError('local_polish_evaluations must be non-negative')


STRUCTURAL_BEAM_VARIANTS: dict[str, StructuralBeamConfig] = {
    'beam-4': StructuralBeamConfig(
        beam_width=4,
        proposals_per_parent=8,
        local_polish_evaluations=120,
        max_filters=10,
    ),
    'beam-12': StructuralBeamConfig(
        beam_width=12,
        proposals_per_parent=8,
        local_polish_evaluations=120,
        max_filters=10,
    ),
}


@dataclass(frozen=True)
class StructuralBeamSeed:
    seed_id: str
    origin: BeamOrigin
    filters: tuple[LabFilter, ...]


@dataclass(frozen=True)
class BeamState:
    candidate: SolverLabCandidate
    evaluation: SolverLabEvaluation
    origin: BeamOrigin | str


@dataclass(frozen=True)
class StructuralBeamResult:
    states: tuple[BeamState, ...]
    proposals_considered: int
    pareto_retained: int
    origin_counts: dict[str, int]


def _filter_key(filters: Sequence[LabFilter]) -> tuple[tuple[object, ...], ...]:
    type_order = {'LS': 0, 'PK': 1, 'HS': 2}
    return tuple(
        (
            type_order[filter_.type],
            filter_.frequencyHz,
            filter_.gainDb,
            filter_.q,
            filter_.enabled,
            filter_.id,
        )
        for filter_ in sorted(filters, key=lambda item: (
            type_order[item.type], item.frequencyHz, item.gainDb, item.q, item.id,
        ))
    )


def order_structural_proposals(
    proposals: Sequence[StructuralProposal],
) -> tuple[StructuralProposal, ...]:
    return tuple(sorted(
        proposals,
        key=lambda proposal: (proposal.mutation.value, _filter_key(proposal.filters)),
    ))


def _state_point(state: BeamState) -> ObjectivePoint:
    if state.evaluation.deliverable is None:
        raise ValueError('beam state requires delivered metrics')
    return ObjectivePoint(
        candidate_id=state.candidate.candidateId,
        rmse_db=state.evaluation.deliverable.rmseDb,
        max_abs_db=state.evaluation.deliverable.maxAbsDb,
        filter_count=len(state.evaluation.deliverableFilters),
    )


def retain_pareto_beam(
    states: Sequence[BeamState],
    beam_width: int,
) -> tuple[BeamState, ...]:
    if not states:
        return ()
    if isinstance(beam_width, bool) or not isinstance(beam_width, int) or beam_width <= 0:
        raise ValueError('beam_width must be a positive integer')
    points = tuple(_state_point(state) for state in states)
    by_id = {state.candidate.candidateId: state for state in states}
    frontier = list(nondominated(points))
    if len(frontier) <= beam_width:
        return tuple(by_id[point.candidate_id] for point in frontier)
    selected: list[ObjectivePoint] = []
    remaining = frontier
    while remaining and len(selected) < beam_width:
        selector = select_reference_point(tuple(
            SelectorPoint(
                candidate_id=point.candidate_id,
                rmse_db=point.rmse_db,
                max_abs_db=point.max_abs_db,
                filter_count=point.filter_count,
            )
            for point in remaining
        ))
        chosen = next(point for point in remaining if point.candidate_id == selector.candidate_id)
        selected.append(chosen)
        remaining = [point for point in remaining if point.candidate_id != chosen.candidate_id]
    selected_ids = {point.candidate_id for point in selected}
    return tuple(
        by_id[point.candidate_id]
        for point in frontier
        if point.candidate_id in selected_ids
    )


def _evaluate(
    evaluator: CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
) -> SolverLabEvaluation:
    evaluations = evaluator.evaluate(problem, (candidate,)) if hasattr(evaluator, 'evaluate') else evaluator(problem, (candidate,))
    if len(evaluations) != 1 or evaluations[0].candidateId != candidate.candidateId:
        raise ValueError('canonical evaluator returned an unexpected candidate')
    evaluation = evaluations[0]
    if not evaluation.valid or evaluation.deliverable is None:
        raise ValueError('canonical evaluator rejected structural beam candidate')
    return evaluation


def _polish(
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
    evaluations: int,
) -> SolverLabCandidate:
    if evaluations <= 0 or not candidate.filters:
        return candidate
    from ..optimizers.powell import PowellOptimizer

    type_order = {'LS': 0, 'PK': 1, 'HS': 2}
    ordered = tuple(sorted(candidate.filters, key=lambda filter_: (
        type_order[filter_.type], filter_.frequencyHz, filter_.id,
    )))
    layout = ContinuousVectorLayout(len(ordered), tuple(filter_.type for filter_ in ordered))
    polished = PowellOptimizer(0).optimize(
        problem,
        layout,
        candidate.seed if candidate.seed is not None else 0,
        (0.5, 0.5),
        evaluations,
        initial_candidate=replace(candidate, filters=ordered),
    )
    return replace(candidate, filters=polished.filters)


class StructuralBeamSolver:
    algorithm_id = 'structural-beam-v1'

    def __init__(self, config: StructuralBeamConfig) -> None:
        self.config = config

    def _candidate(
        self,
        problem: SolverLabProblem,
        filters: Sequence[LabFilter],
        seed: int,
        origin: str,
        seed_id: str,
    ) -> SolverLabCandidate:
        return SolverLabCandidate(
            protocolVersion=1,
            problemId=problem.problemId,
            inputSha256=problem.inputSha256,
            candidateId=f'{self.algorithm_id}:{problem.problemId}:{seed}:{origin}:{seed_id}',
            algorithmId=self.algorithm_id,
            seed=seed,
            filters=tuple(filters),
        )

    def run(
        self,
        problem: SolverLabProblem,
        seed: int,
        evaluation_budget: int,
        reference_frontier: Sequence[ObjectivePoint],
        reference_snapshot_sha256: str,
        canonical_evaluator: CanonicalEvaluatorLike | CanonicalEvaluator | Callable[..., Sequence[SolverLabEvaluation]],
        seeds: Sequence[StructuralBeamSeed] = (),
    ) -> StructuralBeamResult:
        del reference_frontier, reference_snapshot_sha256
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise ValueError('structural beam seed must be an integer')
        if isinstance(evaluation_budget, bool) or not isinstance(evaluation_budget, int) or evaluation_budget <= 0:
            raise ValueError('structural beam evaluation_budget must be positive')
        if self.config.max_filters > problem.bounds['maxFilters']:
            raise ValueError('structural beam max_filters exceeds problem maxFilters')
        if any(seed_item.origin not in {'matching-pursuit', 'teacher-compression', 'zero'} for seed_item in seeds):
            raise ValueError('structural beam seed origin is unsupported')
        quantization_bounds = {
            'minFrequencyHz': problem.bounds['minFrequencyHz'],
            'maxFrequencyHz': problem.bounds['maxFrequencyHz'],
            'minGainDb': problem.bounds['minGainDb'],
            'maxGainDb': problem.bounds['maxGainDb'],
            'minQ': problem.bounds['minPkQ'],
            'maxQ': problem.bounds['maxPkQ'],
            'shelfQ': problem.bounds['shelfQ'],
        }
        all_seeds = (StructuralBeamSeed('zero', 'zero', ()), *seeds)
        initial_states: list[BeamState] = []
        for seed_item in all_seeds:
            if len(seed_item.filters) > self.config.max_filters:
                raise ValueError('structural beam seed exceeds max_filters')
            filters = quantize_filters(seed_item.filters, quantization_bounds)
            candidate = self._candidate(problem, filters, seed, seed_item.origin, seed_item.seed_id)
            initial_states.append(BeamState(
                candidate=candidate,
                evaluation=_evaluate(canonical_evaluator, problem, candidate),
                origin=seed_item.origin,
            ))
        beam = retain_pareto_beam(initial_states, self.config.beam_width)
        if evaluation_budget <= len(initial_states):
            return StructuralBeamResult(
                states=beam,
                proposals_considered=0,
                pareto_retained=len(beam),
                origin_counts=_origin_counts(beam),
            )

        frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
        desired = np.asarray(problem.desiredDb, dtype=np.float64)
        rng = np.random.default_rng(seed)
        proposals_considered = 0
        generated: list[BeamState] = list(beam)
        evaluations_used = len(initial_states)
        for parent in beam:
            actual = cascade_response_db(frequencies, problem.sampleRateHz, parent.candidate.filters)
            proposals = order_structural_proposals(generate_structural_mutations(
                problem,
                parent.candidate.filters,
                desired - actual,
                frequencies,
                rng,
            ))[:self.config.proposals_per_parent]
            proposals_considered += len(proposals)
            for proposal_index, proposal in enumerate(proposals):
                if evaluations_used >= evaluation_budget:
                    break
                if len(proposal.filters) > self.config.max_filters:
                    continue
                candidate = self._candidate(
                    problem,
                    quantize_filters(proposal.filters, quantization_bounds),
                    seed,
                    str(parent.origin),
                    f'proposal-{proposal_index}-{proposal.mutation.value}',
                )
                polished = _polish(problem, candidate, self.config.local_polish_evaluations)
                polished = replace(
                    polished,
                    filters=quantize_filters(polished.filters, quantization_bounds),
                )
                generated.append(BeamState(
                    candidate=polished,
                    evaluation=_evaluate(canonical_evaluator, problem, polished),
                    origin=parent.origin,
                ))
                evaluations_used += 1
            if evaluations_used >= evaluation_budget:
                break
        final_beam = retain_pareto_beam(generated, self.config.beam_width)
        return StructuralBeamResult(
            states=final_beam,
            proposals_considered=proposals_considered,
            pareto_retained=len(final_beam),
            origin_counts=_origin_counts(final_beam),
        )


def _origin_counts(states: Sequence[BeamState]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for state in states:
        counts[state.origin] = counts.get(state.origin, 0) + 1
    return counts


__all__ = [
    'BeamState',
    'STRUCTURAL_BEAM_VARIANTS',
    'StructuralBeamConfig',
    'StructuralBeamResult',
    'StructuralBeamSeed',
    'StructuralBeamSolver',
    'order_structural_proposals',
    'retain_pareto_beam',
]
