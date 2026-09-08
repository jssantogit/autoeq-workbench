from collections.abc import Sequence
from dataclasses import asdict, dataclass, replace
import argparse
import json
from pathlib import Path
from typing import Any, Literal

import numpy as np

from .canonical import CanonicalEvaluator
from .dsp import cascade_response_db
from .io import (
    load_control_candidates,
    parse_candidate,
    read_problems,
    serialize_candidate,
    serialize_evaluation,
    write_candidates,
)
from .objectives import ContinuousVectorLayout
from .optimizers.powell import PowellOptimizer
from .pareto import nondominated
from .quantization import quantize_filters
from .structural import generate_structural_mutations
from .types import ObjectivePoint, SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


DELIVERABLE_ORACLE_VERSION = "deliverable-oracle-v2-staged"
DeliverableSearchMode = Literal["legacy", "recovery"]


@dataclass(frozen=True)
class DeliverableOracleConfig:
    seed: int
    generations: int
    evaluation_budget: int
    max_parents: int = 4

    def __post_init__(self) -> None:
        if not isinstance(self.seed, int) or isinstance(self.seed, bool):
            raise ValueError("deliverable oracle seed must be an integer")
        if not isinstance(self.generations, int) or isinstance(self.generations, bool) or self.generations < 0:
            raise ValueError("deliverable oracle generations must be non-negative")
        if not isinstance(self.evaluation_budget, int) or isinstance(self.evaluation_budget, bool) or self.evaluation_budget <= 0:
            raise ValueError("deliverable oracle evaluation budget must be positive")
        if not isinstance(self.max_parents, int) or isinstance(self.max_parents, bool) or self.max_parents <= 0:
            raise ValueError("deliverable oracle max_parents must be positive")


@dataclass(frozen=True)
class _ArchiveEntry:
    candidate: SolverLabCandidate
    evaluation: SolverLabEvaluation


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


def _filter_key(filters) -> str:
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    ordered = sorted(
        filters,
        key=lambda filter_: (
            type_order[filter_.type],
            filter_.frequencyHz,
            filter_.gainDb,
            filter_.q,
            filter_.enabled,
        ),
    )
    return json.dumps(
        [
            {
                key: value
                for key, value in asdict(filter_).items()
                if key != "id"
            }
            for filter_ in ordered
        ],
        sort_keys=True,
        separators=(",", ":"),
    )


def _unique_candidates(candidates: Sequence[SolverLabCandidate]) -> tuple[SolverLabCandidate, ...]:
    by_vector: dict[str, SolverLabCandidate] = {}
    for candidate in candidates:
        key = _filter_key(candidate.filters)
        existing = by_vector.get(key)
        if existing is None or (
            candidate.algorithmId == "standard-v2-control" and
            existing.algorithmId != "standard-v2-control"
        ):
            by_vector[key] = candidate
    return tuple(by_vector.values())


def _candidate(
    problem: SolverLabProblem,
    filters,
    seed: int,
    label: str,
    index: int,
    algorithm_id: str = "deliverable-oracle",
) -> SolverLabCandidate:
    if len(filters) > problem.bounds["maxFilters"]:
        raise ValueError("candidate filter count exceeds maxFilters")
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=f"deliverable-oracle:{problem.problemId}:{seed}:{label}:{index}",
        algorithmId=algorithm_id,
        seed=seed,
        filters=tuple(filters),
    )


def _search_problem(problem: SolverLabProblem, max_filters: int) -> SolverLabProblem:
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("maxFilters must be a positive integer")
    if max_filters > problem.bounds["maxFilters"]:
        raise ValueError("maxFilters exceeds problem bounds")
    return replace(problem, bounds={**problem.bounds, "maxFilters": max_filters})


def _archive_entries(
    problem: SolverLabProblem,
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
    max_filters: int,
) -> tuple[_ArchiveEntry, ...]:
    candidates_by_id = {candidate.candidateId: candidate for candidate in candidates}
    points: list[ObjectivePoint] = []
    entries_by_id: dict[str, _ArchiveEntry] = {}
    for evaluation in evaluations:
        candidate = candidates_by_id.get(evaluation.candidateId)
        if candidate is None or not evaluation.valid or evaluation.deliverable is None:
            continue
        if candidate.problemId != problem.problemId or candidate.inputSha256 != problem.inputSha256:
            raise ValueError("candidate does not belong to problem")
        if len(candidate.filters) > max_filters:
            raise ValueError("candidate filter count exceeds maxFilters")
        actual_filter_count = len(evaluation.deliverableFilters)
        if actual_filter_count > max_filters:
            raise ValueError("delivered filter count exceeds maxFilters")
        entries_by_id[candidate.candidateId] = _ArchiveEntry(candidate, evaluation)
        points.append(ObjectivePoint(
            candidate_id=candidate.candidateId,
            rmse_db=evaluation.deliverable.rmseDb,
            max_abs_db=evaluation.deliverable.maxAbsDb,
            filter_count=actual_filter_count,
        ))
    return tuple(entries_by_id[point.candidate_id] for point in nondominated(points))


def _merge_archive(
    problem: SolverLabProblem,
    existing: Sequence[_ArchiveEntry],
    additions: Sequence[_ArchiveEntry],
    max_filters: int,
) -> tuple[_ArchiveEntry, ...]:
    by_candidate = _unique_candidates(tuple(
        entry.candidate for entry in (*existing, *additions)
    ))
    entries_by_id = {
        entry.candidate.candidateId: entry
        for entry in (*existing, *additions)
    }
    selected_entries = tuple(entries_by_id[candidate.candidateId] for candidate in by_candidate)
    return _archive_entries(
        problem,
        tuple(entry.candidate for entry in selected_entries),
        tuple(entry.evaluation for entry in selected_entries),
        max_filters,
    )


def _local_neighbors(
    problem: SolverLabProblem,
    parent: SolverLabCandidate,
) -> tuple[SolverLabCandidate, ...]:
    proposals: list[SolverLabCandidate] = []
    quantization_bounds = _quantization_bounds(problem)
    proposal_index = 0
    for filter_index, filter_ in enumerate(parent.filters):
        coordinates = [("frequencyHz", 1.0), ("gainDb", 0.1)]
        if filter_.type == "PK":
            coordinates.append(("q", 0.01))
        for coordinate, step in coordinates:
            for direction in (-1, 1):
                changed = replace(filter_, **{coordinate: getattr(filter_, coordinate) + direction * step})
                filters = list(parent.filters)
                filters[filter_index] = changed
                proposals.append(_candidate(
                    problem,
                    quantize_filters(tuple(filters), quantization_bounds),
                    parent.seed if parent.seed is not None else 0,
                    f"local:{parent.candidateId}",
                    proposal_index,
                ))
                proposal_index += 1
    return tuple(proposals)


def _structural_neighbor_proposals(
    problem: SolverLabProblem,
    parent: SolverLabCandidate,
    rng: np.random.Generator,
    label: str,
    audit: dict[str, Any] | None = None,
) -> tuple[tuple[str, SolverLabCandidate], ...]:
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(problem.desiredDb, dtype=np.float64)
    actual = cascade_response_db(frequencies, problem.sampleRateHz, parent.filters)
    residual = desired - actual
    proposals = generate_structural_mutations(problem, parent.filters, residual, frequencies, rng)
    if audit is not None:
        operations = audit["structuralOperations"]
        for proposal in proposals:
            mutation = proposal.mutation.value
            operations[mutation] = operations.get(mutation, 0) + 1
            audit["structuralProposalsGenerated"] += 1
            if mutation in {"add-pk", "add-ls", "add-hs"}:
                audit["addProposalsProposed"] += 1
            if mutation == "split":
                audit["splitProposalsProposed"] += 1
    quantization_bounds = _quantization_bounds(problem)
    return tuple((
        proposal.mutation.value,
        _candidate(
            problem,
            quantize_filters(proposal.filters, quantization_bounds),
            parent.seed if parent.seed is not None else 0,
            f"{label}:{parent.candidateId}",
            index,
        ),
    ) for index, proposal in enumerate(proposals))


def _structural_neighbors(
    problem: SolverLabProblem,
    parent: SolverLabCandidate,
    rng: np.random.Generator,
    label: str,
    audit: dict[str, Any] | None = None,
) -> tuple[SolverLabCandidate, ...]:
    return tuple(
        candidate
        for _, candidate in _structural_neighbor_proposals(problem, parent, rng, label, audit)
    )


def _powell_neighbor(
    problem: SolverLabProblem,
    parent: SolverLabCandidate,
    config: DeliverableOracleConfig,
    run_index: int,
) -> SolverLabCandidate | None:
    if not parent.filters:
        return None
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    ordered = tuple(sorted(parent.filters, key=lambda filter_: (type_order[filter_.type], filter_.frequencyHz)))
    layout = ContinuousVectorLayout(len(ordered), tuple(filter_.type for filter_ in ordered))
    polished = PowellOptimizer(run_index).optimize(
        problem,
        layout,
        config.seed,
        (0.5, 0.5),
        config.evaluation_budget,
        initial_candidate=parent,
    )
    return _candidate(
        problem,
        quantize_filters(polished.filters, _quantization_bounds(problem)),
        config.seed,
        "powell",
        run_index,
    )


def _evaluate_batch(
    canonical_evaluator: CanonicalEvaluator,
    problem: SolverLabProblem,
    candidates: Sequence[SolverLabCandidate],
    audit: dict[str, Any] | None,
) -> tuple[SolverLabEvaluation, ...]:
    if not candidates:
        return ()
    evaluations = tuple(canonical_evaluator.evaluate(problem, candidates))
    if audit is not None:
        audit["candidateEvaluations"] += len(evaluations)
    return evaluations


def _valid_entries(
    problem: SolverLabProblem,
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
    max_filters: int,
) -> tuple[_ArchiveEntry, ...]:
    candidates_by_id = {candidate.candidateId: candidate for candidate in candidates}
    entries: list[_ArchiveEntry] = []
    for evaluation in evaluations:
        candidate = candidates_by_id.get(evaluation.candidateId)
        if candidate is None or not evaluation.valid or evaluation.deliverable is None:
            continue
        if candidate.problemId != problem.problemId or candidate.inputSha256 != problem.inputSha256:
            raise ValueError("candidate does not belong to problem")
        if len(candidate.filters) > max_filters or len(evaluation.deliverableFilters) > max_filters:
            raise ValueError("candidate or delivered filter count exceeds maxFilters")
        entries.append(_ArchiveEntry(candidate, evaluation))
    return tuple(entries)


def _audit_rejection(audit: dict[str, Any], reason: str, *, is_add: bool = False) -> None:
    audit["proposalsRejected"] += 1
    reasons = audit["rejectionReasons"]
    reasons[reason] = reasons.get(reason, 0) + 1
    if is_add:
        audit["addProposalsRejected"] += 1


def _initialise_audit(
    audit: dict[str, Any] | None,
    *,
    mode: DeliverableSearchMode,
    cap: int,
    config: DeliverableOracleConfig,
    initial: Sequence[SolverLabCandidate],
) -> None:
    if audit is None:
        return
    initial_max = max((len(candidate.filters) for candidate in initial), default=0)
    audit.clear()
    audit.update({
        "schemaVersion": 1,
        "searchMode": mode,
        "maxFilters": cap,
        "filtersAvailable": cap,
        "initialCandidateCount": len(initial),
        "initialMaxFilterCount": initial_max,
        "capacityAtInitialParent": max(0, cap - initial_max),
        "maxObservedFilterCount": initial_max,
        "maxProposedFilterCount": initial_max,
        "proposalsGenerated": 0,
        "proposalsAccepted": 0,
        "proposalsRejected": 0,
        "rejectionReasons": {},
        "structuralProposalsGenerated": 0,
        "addProposalsProposed": 0,
        "addProposalsAccepted": 0,
        "addProposalsRejected": 0,
        "splitProposalsProposed": 0,
        "structuralOperations": {
            "add-pk": 0,
            "add-ls": 0,
            "add-hs": 0,
            "remove": 0,
            "split": 0,
            "merge": 0,
            "type-mutation": 0,
        },
        "candidateEvaluations": 0,
        "candidatesEvaluated": 0,
        "parentSelections": 0,
        "generationsExecuted": 0,
        "cycles": 0,
        "slices": 0,
        "refinementRounds": 0,
        "evaluationBudgetConfigured": config.evaluation_budget,
        "evaluationBudgetRemaining": config.evaluation_budget,
        "timeBudgetConfiguredMs": None,
        "timeBudgetRemainingMs": None,
        "noMutationRemainedAdmissible": False,
        "schedulerRunnableStates": None,
        "deduplicatedProposals": 0,
        "implicitActualDeliveredFilterCountCap": False,
        "earlyStopByNoImprovement": False,
        "structuralGrowthGenerationLimited": False,
        "archiveUpdates": 0,
        "polishCalls": 0,
        "polishEvaluationBudgetUpperBound": 0,
        "archiveSizeByGeneration": [],
        "generationStats": [],
        "stopReason": None,
        "capacityUnusedReason": None,
        "officialFrontierCount": 0,
        "officialMaxFilterCount": initial_max,
    })


def _update_audit_end(
    audit: dict[str, Any] | None,
    *,
    archive: Sequence[_ArchiveEntry],
    state_bank: Sequence[_ArchiveEntry],
    stop_reason: str,
    capacity_reason: str,
) -> None:
    if audit is None:
        return
    official_max = max((len(entry.evaluation.deliverableFilters) for entry in archive), default=0)
    observed_max = max((len(entry.evaluation.deliverableFilters) for entry in state_bank), default=0)
    audit["stopReason"] = stop_reason
    audit["capacityUnusedReason"] = capacity_reason
    audit["officialFrontierCount"] = len(archive)
    audit["officialMaxFilterCount"] = official_max
    audit["maxObservedFilterCount"] = max(audit["maxObservedFilterCount"], observed_max)
    audit["filtersUsed"] = official_max
    audit["capacityUnused"] = max(0, audit["maxFilters"] - official_max)
    audit["candidatesEvaluated"] = audit["candidateEvaluations"]
    audit["evaluationBudgetRemaining"] = max(
        0,
        audit["evaluationBudgetConfigured"] - audit["candidateEvaluations"],
    )


def _recovery_parent_order(entry: _ArchiveEntry) -> tuple[object, ...]:
    if entry.evaluation.deliverable is None:
        raise ValueError("recovery parent requires delivered metrics")
    return (
        -len(entry.evaluation.deliverableFilters),
        entry.evaluation.deliverable.rmseDb,
        entry.evaluation.deliverable.maxAbsDb,
        entry.candidate.candidateId,
    )


def _frontier_signature(entries: Sequence[_ArchiveEntry]) -> tuple[tuple[float, float, int], ...]:
    return tuple(sorted({
        (
            entry.evaluation.deliverable.rmseDb,
            entry.evaluation.deliverable.maxAbsDb,
            len(entry.evaluation.deliverableFilters),
        )
        for entry in entries
        if entry.evaluation.deliverable is not None
    }))


def _collapse_equivalent_frontier(entries: Sequence[_ArchiveEntry]) -> tuple[_ArchiveEntry, ...]:
    selected: dict[tuple[float, float, int], _ArchiveEntry] = {}
    for entry in entries:
        if entry.evaluation.deliverable is None:
            continue
        key = (
            entry.evaluation.deliverable.rmseDb,
            entry.evaluation.deliverable.maxAbsDb,
            len(entry.evaluation.deliverableFilters),
        )
        existing = selected.get(key)
        if existing is None or (
            entry.candidate.algorithmId == "standard-v2-control" and
            existing.candidate.algorithmId != "standard-v2-control"
        ):
            selected[key] = entry
    return tuple(sorted(selected.values(), key=lambda entry: (
        entry.evaluation.deliverable.rmseDb if entry.evaluation.deliverable is not None else float("inf"),
        entry.evaluation.deliverable.maxAbsDb if entry.evaluation.deliverable is not None else float("inf"),
        len(entry.evaluation.deliverableFilters),
        entry.candidate.candidateId,
    )))


def _recovery_parents(
    state_bank: Sequence[_ArchiveEntry],
    archive: Sequence[_ArchiveEntry],
    max_parents: int,
) -> tuple[_ArchiveEntry, ...]:
    by_filter_key: dict[str, _ArchiveEntry] = {}
    for entry in (*state_bank, *archive):
        by_filter_key.setdefault(_filter_key(entry.candidate.filters), entry)
    ordered = sorted(by_filter_key.values(), key=_recovery_parent_order)
    return tuple(ordered[:max_parents])


def _build_recovery_frontier(
    search_problem: SolverLabProblem,
    config: DeliverableOracleConfig,
    canonical_evaluator: CanonicalEvaluator,
    initial_entries: Sequence[_ArchiveEntry],
    initial_archive: Sequence[_ArchiveEntry],
    audit: dict[str, Any] | None,
) -> tuple[SolverLabCandidate, ...]:
    cap = search_problem.bounds["maxFilters"]
    state_bank = list(initial_entries)
    archive = _collapse_equivalent_frontier(initial_archive)
    visited = {_filter_key(entry.candidate.filters) for entry in state_bank}
    evaluations_used = len(initial_entries)
    rng = np.random.default_rng(config.seed)
    run_index = 0
    stop_reason = "search-space-exhausted-under-current-mechanism"
    last_generation_had_new_work = True

    for generation in range(1, config.generations + 1):
        if not state_bank:
            stop_reason = "no-admissible-proposals"
            break
        remaining_budget = config.evaluation_budget - evaluations_used
        if remaining_budget <= 0:
            stop_reason = "evaluation-budget"
            break
        parents = _recovery_parents(state_bank, archive, config.max_parents)
        if not parents:
            stop_reason = "no-admissible-proposals"
            break
        if audit is not None:
            audit["generationsExecuted"] += 1
            audit["parentSelections"] += len(parents)
            audit["cycles"] += 1
        pending: list[tuple[str, SolverLabCandidate, _ArchiveEntry]] = []
        pending_keys: set[str] = set()
        for parent in parents:
            local = _local_neighbors(search_problem, parent.candidate)
            structural = _structural_neighbor_proposals(search_problem, parent.candidate, rng, "structural", audit)
            polished = _powell_neighbor(search_problem, parent.candidate, config, run_index)
            run_index += 1
            if audit is not None:
                audit["proposalsGenerated"] += len(local) + len(structural) + (1 if polished is not None else 0)
                audit["refinementRounds"] += 1
                if polished is not None:
                    audit["polishCalls"] += 1
                    audit["polishEvaluationBudgetUpperBound"] += config.evaluation_budget
                local_and_polished = (*(("local", candidate) for candidate in local),)
                if polished is not None:
                    local_and_polished = (*local_and_polished, ("polish", polished))
                for _, candidate in (*local_and_polished, *(structural)):
                    audit["maxProposedFilterCount"] = max(
                        audit["maxProposedFilterCount"],
                        len(candidate.filters),
                    )
            polish_proposals: tuple[tuple[str, SolverLabCandidate], ...] = () if polished is None else (("polish", polished),)
            proposals: tuple[tuple[str, SolverLabCandidate], ...] = tuple(
                [("local", candidate) for candidate in local] +
                list(structural) +
                list(polish_proposals)
            )
            for mutation, candidate in proposals:
                is_add = mutation in {"add-pk", "add-ls", "add-hs"}
                if len(candidate.filters) > cap:
                    if audit is not None:
                        _audit_rejection(audit, "max-filters", is_add=is_add)
                    continue
                key = _filter_key(candidate.filters)
                if key in visited or key in pending_keys:
                    if audit is not None:
                        audit["deduplicatedProposals"] += 1
                        _audit_rejection(audit, "visited-filter-state", is_add=is_add)
                    continue
                if len(pending) >= remaining_budget:
                    if audit is not None:
                        _audit_rejection(audit, "evaluation-budget", is_add=is_add)
                    stop_reason = "evaluation-budget"
                    continue
                pending_keys.add(key)
                visited.add(key)
                pending.append((mutation, candidate, parent))
                if audit is not None:
                    audit["proposalsAccepted"] += 1
                    if is_add:
                        audit["addProposalsAccepted"] += 1

        if not pending:
            last_generation_had_new_work = False
            if audit is not None:
                audit["generationStats"].append({
                    "generation": generation,
                    "parentCount": len(parents),
                    "pendingSize": 0,
                    "archiveSize": len(archive),
                    "stateBankSize": len(state_bank),
                })
            if audit is not None and audit["deduplicatedProposals"] > 0:
                stop_reason = "no-admissible-proposals"
            else:
                stop_reason = "search-space-exhausted-under-current-mechanism"
            break

        batch = tuple(candidate for _, candidate, _ in pending)
        evaluations = _evaluate_batch(canonical_evaluator, search_problem, batch, audit)
        additions = _valid_entries(search_problem, batch, evaluations, cap)
        evaluations_used += len(evaluations)
        state_bank.extend(additions)
        before_frontier = _frontier_signature(archive)
        archive = _collapse_equivalent_frontier(
            _merge_archive(search_problem, archive, additions, cap)
        )
        if audit is not None:
            if _frontier_signature(archive) != before_frontier:
                audit["archiveUpdates"] += 1
            audit["archiveSizeByGeneration"].append({
                "generation": generation,
                "archiveSize": len(archive),
                "stateBankSize": len(state_bank),
            })
            audit["generationStats"].append({
                "generation": generation,
                "parentCount": len(parents),
                "pendingSize": len(pending),
                "evaluatedSize": len(additions),
                "archiveSize": len(archive),
                "stateBankSize": len(state_bank),
            })

        if len(archive) == 0:
            stop_reason = "no-admissible-proposals"
            break
    else:
        stop_reason = "generation-budget"

    if audit is not None:
        audit["noMutationRemainedAdmissible"] = not last_generation_had_new_work
        audit["schedulerRunnableStates"] = len(state_bank) if last_generation_had_new_work else 0
        official_max = max((len(entry.evaluation.deliverableFilters) for entry in archive), default=0)
        if official_max >= cap:
            capacity_reason = "capacity-fully-used"
        elif audit["archiveUpdates"] == 0:
            audit["earlyStopByNoImprovement"] = True
            capacity_reason = "capacity-unused-no-improving-proposal-found"
        elif stop_reason in {"evaluation-budget", "generation-budget"}:
            capacity_reason = "capacity-unused-budget-exhausted"
        elif audit["deduplicatedProposals"] > 0 and not last_generation_had_new_work:
            capacity_reason = "capacity-unused-dedup-limited"
        else:
            capacity_reason = "capacity-unused-search-exhausted"
        _update_audit_end(
            audit,
            archive=archive,
            state_bank=state_bank,
            stop_reason=stop_reason,
            capacity_reason=capacity_reason,
        )
    return tuple(entry.candidate for entry in archive)


def build_deliverable_frontier(
    problem: SolverLabProblem,
    continuous_cap_candidates: Sequence[SolverLabCandidate],
    config: DeliverableOracleConfig,
    canonical_evaluator: CanonicalEvaluator,
    known_deliverable_candidates: Sequence[SolverLabCandidate] = (),
    *,
    max_filters: int | None = None,
    search_mode: DeliverableSearchMode = "legacy",
    audit: dict[str, Any] | None = None,
) -> tuple[SolverLabCandidate, ...]:
    if search_mode not in {"legacy", "recovery"}:
        raise ValueError("search_mode must be legacy or recovery")
    if not continuous_cap_candidates and not known_deliverable_candidates:
        return ()
    cap = problem.bounds["maxFilters"] if max_filters is None else max_filters
    search_problem = _search_problem(problem, cap)
    quantization_bounds = _quantization_bounds(search_problem)
    initial_candidates: list[SolverLabCandidate] = []
    initial_candidates.extend(known_deliverable_candidates)
    for index, source in enumerate(continuous_cap_candidates):
        if source.algorithmId == "standard-v2-control":
            initial_candidates.append(source)
            continue
        initial_candidates.append(_candidate(
            search_problem,
            quantize_filters(source.filters, quantization_bounds),
            source.seed if source.seed is not None else config.seed,
            f"continuous:{source.candidateId}",
            index,
            algorithm_id=source.algorithmId,
        ))
    for candidate in initial_candidates:
        if candidate.problemId != problem.problemId or candidate.inputSha256 != problem.inputSha256:
            raise ValueError("candidate does not belong to problem")
        if len(candidate.filters) > cap:
            raise ValueError("candidate filter count exceeds maxFilters")
    initial = _unique_candidates(tuple(initial_candidates))
    _initialise_audit(audit, mode=search_mode, cap=cap, config=config, initial=initial)
    initial_evaluations = _evaluate_batch(canonical_evaluator, problem, initial, audit)
    archive = _archive_entries(problem, initial, initial_evaluations, cap)
    initial_entries = _valid_entries(problem, initial, initial_evaluations, cap)
    if audit is not None:
        audit["archiveSizeByGeneration"].append({
            "generation": 0,
            "archiveSize": len(archive),
            "stateBankSize": len(initial_entries),
        })
    if search_mode == "recovery":
        return _build_recovery_frontier(
            search_problem,
            config,
            canonical_evaluator,
            initial_entries,
            archive,
            audit,
        )

    rng = np.random.default_rng(config.seed)
    pending: list[tuple[str, SolverLabCandidate]] = []
    evaluated_entries = list(initial_entries)
    run_index = 0
    for generation in range(1, config.generations + 1):
        if not archive:
            if audit is not None:
                audit["structuralGrowthGenerationLimited"] = True
            break
        parent_count = min(config.max_parents, len(archive))
        parent_indices = rng.choice(len(archive), size=parent_count, replace=False)
        parents = tuple(archive[int(index)] for index in parent_indices)
        if audit is not None:
            audit["generationsExecuted"] += 1
            audit["parentSelections"] += len(parents)
            audit["cycles"] += 1
        for entry in parents:
            local = _local_neighbors(search_problem, entry.candidate)
            pending.extend(("local", candidate) for candidate in local)
            if audit is not None:
                audit["proposalsGenerated"] += len(local)
                audit["maxProposedFilterCount"] = max(
                    audit["maxProposedFilterCount"],
                    *(len(candidate.filters) for candidate in local),
                ) if local else audit["maxProposedFilterCount"]
            structural = _structural_neighbor_proposals(search_problem, entry.candidate, rng, "structural", audit)
            pending.extend(structural)
            if audit is not None:
                audit["proposalsGenerated"] += len(structural)
                audit["maxProposedFilterCount"] = max(
                    audit["maxProposedFilterCount"],
                    *(len(candidate.filters) for candidate in structural),
                ) if structural else audit["maxProposedFilterCount"]
            polished = _powell_neighbor(search_problem, entry.candidate, config, run_index)
            run_index += 1
            if audit is not None:
                audit["refinementRounds"] += 1
                if polished is not None:
                    audit["polishCalls"] += 1
                    audit["polishEvaluationBudgetUpperBound"] += config.evaluation_budget
            if polished is not None:
                pending.append(("polish", polished))
                if audit is not None:
                    audit["proposalsGenerated"] += 1
                    audit["maxProposedFilterCount"] = max(audit["maxProposedFilterCount"], len(polished.filters))
        if generation % 10 == 0:
            before_archive = _frontier_signature(archive)
            unique_pending: dict[str, tuple[str, SolverLabCandidate]] = {}
            for mutation, candidate in pending:
                key = _filter_key(candidate.filters)
                if key in unique_pending:
                    if audit is not None:
                        audit["deduplicatedProposals"] += 1
                        _audit_rejection(audit, "duplicate-pending", is_add=mutation in {"add-pk", "add-ls", "add-hs"})
                else:
                    unique_pending[key] = (mutation, candidate)
            batch = tuple(candidate for _, candidate in unique_pending.values())
            if batch:
                batch_evaluations = _evaluate_batch(canonical_evaluator, problem, batch, audit)
                batch_entries = _valid_entries(problem, batch, batch_evaluations, cap)
                evaluated_entries.extend(batch_entries)
                archive = _merge_archive(
                    problem,
                    archive,
                    _archive_entries(problem, batch, batch_evaluations, cap),
                    cap,
                )
                if audit is not None:
                    audit["proposalsAccepted"] += len(batch)
                    audit["addProposalsAccepted"] += sum(
                        mutation in {"add-pk", "add-ls", "add-hs"}
                        for mutation, _ in unique_pending.values()
                    )
                    if _frontier_signature(archive) != before_archive:
                        audit["archiveUpdates"] += 1
            pending = []
        if audit is not None:
            audit["generationStats"].append({
                "generation": generation,
                "archiveSize": len(archive),
                "pendingSize": len(pending),
            })
    unique_pending = dict((_filter_key(candidate.filters), (mutation, candidate)) for mutation, candidate in pending)
    if unique_pending:
        batch = tuple(candidate for _, candidate in unique_pending.values())
        batch_evaluations = _evaluate_batch(canonical_evaluator, problem, batch, audit)
        batch_entries = _valid_entries(problem, batch, batch_evaluations, cap)
        evaluated_entries.extend(batch_entries)
        archive = _merge_archive(
            problem,
            archive,
            _archive_entries(problem, batch, batch_evaluations, cap),
            cap,
        )
        if audit is not None:
            audit["proposalsAccepted"] += len(batch)
            audit["addProposalsAccepted"] += sum(
                mutation in {"add-pk", "add-ls", "add-hs"}
                for mutation, _ in unique_pending.values()
            )
    if audit is not None:
        official_max = max((len(entry.evaluation.deliverableFilters) for entry in archive), default=0)
        audit["schedulerRunnableStates"] = 0
        audit["noMutationRemainedAdmissible"] = False
        audit["generationStats"].append({
            "generation": "final-flush",
            "archiveSize": len(archive),
            "pendingSize": len(unique_pending),
        })
        _update_audit_end(
            audit,
            archive=archive,
            state_bank=evaluated_entries,
            stop_reason="search-space-exhausted-under-current-mechanism" if archive else "no-admissible-proposals",
            capacity_reason=(
                "capacity-fully-used"
                if official_max >= cap
                else "capacity-unused-structural-generation-limited"
            ),
        )
    return tuple(entry.candidate for entry in archive)


def _parse_int_list(value: str) -> tuple[int, ...]:
    values = tuple(int(part) for part in value.split(",") if part)
    if not values or any(value <= 0 for value in values):
        raise ValueError("seeds and filter counts must contain positive integers")
    return values


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the research-only Deliverable Oracle")
    parser.add_argument("--problems", required=True)
    parser.add_argument("--continuous-frontier", required=True)
    parser.add_argument("--control", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--generations", required=True, type=int)
    parser.add_argument("--eval-budget", required=True, type=int)
    parser.add_argument("--max-filters", type=int)
    parser.add_argument("--case-id")
    parser.add_argument("--campaign-mode", choices=("smoke", "screen", "confirm", "deep", "full"))
    parser.add_argument("--search-mode", choices=("legacy", "recovery"), default="legacy")
    parser.add_argument("--audit-out")
    parser.add_argument("--canonical-command", required=True)
    args = parser.parse_args(argv)
    problems = {problem.problemId: problem for problem in read_problems(args.problems)}
    if args.case_id is not None:
        if args.case_id not in problems:
            raise ValueError(f"case ID {args.case_id} is not present in the problem artifact")
        problems = {args.case_id: problems[args.case_id]}
    continuous_artifact = json.loads(Path(args.continuous_frontier).read_text(encoding="utf-8"))
    max_filters = continuous_artifact.get("config", {}).get("maxFilters")
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("continuous artifact config maxFilters is required")
    if args.max_filters is not None and args.max_filters != max_filters:
        raise ValueError("requested maxFilters does not match continuous artifact config")
    evaluator = CanonicalEvaluator(args.canonical_command)
    control_artifact = json.loads(Path(args.control).read_text(encoding="utf-8"))
    frontiers = []
    search_audits = []
    all_candidates: list[SolverLabCandidate] = []
    for problem in problems.values():
        matching_frontiers = [
            frontier for frontier in continuous_artifact.get("frontiers", [])
            if (
                frontier.get("problemId") == problem.problemId and
                frontier.get("frontierType") == "maxFilters" and
                frontier.get("maxFilters") == max_filters
            )
        ]
        if len(matching_frontiers) != 1:
            raise ValueError(f"continuous artifact must contain one cap frontier for {problem.problemId}")
        frontier_artifact = matching_frontiers[0]
        candidates = tuple(
            parse_candidate(point["candidate"])
            for point in frontier_artifact["points"]
        )
        known_control = load_control_candidates(control_artifact, problem, max_filters)
        audit: dict[str, Any] = {}
        frontier = build_deliverable_frontier(
            problem,
            candidates,
            DeliverableOracleConfig(args.seed, args.generations, args.eval_budget),
            evaluator,
            known_deliverable_candidates=known_control,
            max_filters=max_filters,
            search_mode=args.search_mode,
            audit=audit,
        )
        evaluations = evaluator.evaluate(problem, frontier)
        frontiers.append({
            "problemId": problem.problemId,
            "frontierType": "maxFilters",
            "maxFilters": max_filters,
            "points": [
                {
                    "candidate": json.loads(serialize_candidate(candidate)),
                    "evaluation": json.loads(serialize_evaluation(evaluation)),
                    "actualFilterCount": len(candidate.filters),
                    "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
                    "provenance": candidate.algorithmId,
                }
                for candidate, evaluation in zip(frontier, evaluations, strict=True)
            ],
        })
        search_audits.append({"problemId": problem.problemId, "maxFilters": max_filters, **audit})
        all_candidates.extend(frontier)
    output = Path(args.out)
    candidate_path = Path(f"{args.out}.candidates.jsonl")
    unique_by_id: dict[str, SolverLabCandidate] = {}
    for candidate in all_candidates:
        unique_by_id.setdefault(candidate.candidateId, candidate)
    write_candidates(candidate_path, tuple(unique_by_id.values()))
    output.write_text(json.dumps({
        "version": 1,
        "oracle": "deliverable",
        "oracleVersion": DELIVERABLE_ORACLE_VERSION,
        "config": {
            "seed": args.seed,
            "generations": args.generations,
            "evaluationBudget": args.eval_budget,
            "maxFilters": max_filters,
            "campaignMode": args.campaign_mode,
            "canonicalCommand": args.canonical_command,
            "searchMode": args.search_mode,
        },
        "candidatePath": str(candidate_path),
        "searchAudits": search_audits,
        "frontiers": frontiers,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.audit_out is not None:
        Path(args.audit_out).write_text(
            json.dumps({"version": 1, "searchAudits": search_audits}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
