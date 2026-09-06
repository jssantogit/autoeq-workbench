from collections.abc import Sequence
from dataclasses import asdict, dataclass, replace
import argparse
import json
from pathlib import Path

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


def _structural_neighbors(
    problem: SolverLabProblem,
    parent: SolverLabCandidate,
    rng: np.random.Generator,
    label: str,
) -> tuple[SolverLabCandidate, ...]:
    frequencies = np.asarray(problem.frequenciesHz, dtype=np.float64)
    desired = np.asarray(problem.desiredDb, dtype=np.float64)
    actual = cascade_response_db(frequencies, problem.sampleRateHz, parent.filters)
    residual = desired - actual
    proposals = generate_structural_mutations(problem, parent.filters, residual, frequencies, rng)
    quantization_bounds = _quantization_bounds(problem)
    return tuple(_candidate(
        problem,
        quantize_filters(proposal.filters, quantization_bounds),
        parent.seed if parent.seed is not None else 0,
        f"{label}:{parent.candidateId}",
        index,
    ) for index, proposal in enumerate(proposals))


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


def build_deliverable_frontier(
    problem: SolverLabProblem,
    continuous_cap_candidates: Sequence[SolverLabCandidate],
    config: DeliverableOracleConfig,
    canonical_evaluator: CanonicalEvaluator,
    known_deliverable_candidates: Sequence[SolverLabCandidate] = (),
    *,
    max_filters: int | None = None,
) -> tuple[SolverLabCandidate, ...]:
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
    archive = _archive_entries(problem, initial, canonical_evaluator.evaluate(problem, initial), cap)
    rng = np.random.default_rng(config.seed)
    pending: list[SolverLabCandidate] = []
    run_index = 0
    for generation in range(1, config.generations + 1):
        if not archive:
            break
        parent_count = min(config.max_parents, len(archive))
        parent_indices = rng.choice(len(archive), size=parent_count, replace=False)
        parents = tuple(archive[int(index)] for index in parent_indices)
        for entry in parents:
            pending.extend(_local_neighbors(search_problem, entry.candidate))
            pending.extend(_structural_neighbors(search_problem, entry.candidate, rng, "structural"))
            polished = _powell_neighbor(search_problem, entry.candidate, config, run_index)
            run_index += 1
            if polished is not None:
                pending.append(polished)
        if generation % 10 == 0:
            unique_pending: dict[str, SolverLabCandidate] = {}
            for candidate in pending:
                unique_pending.setdefault(_filter_key(candidate.filters), candidate)
            batch = tuple(unique_pending.values())
            if batch:
                archive = _merge_archive(
                    problem,
                    archive,
                    _archive_entries(problem, batch, canonical_evaluator.evaluate(problem, batch), cap),
                    cap,
                )
            pending = []
    unique_pending = dict((_filter_key(candidate.filters), candidate) for candidate in pending)
    if unique_pending:
        batch = tuple(unique_pending.values())
        archive = _merge_archive(
            problem,
            archive,
            _archive_entries(problem, batch, canonical_evaluator.evaluate(problem, batch), cap),
            cap,
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
    parser.add_argument("--canonical-command", required=True)
    args = parser.parse_args(argv)
    problems = {problem.problemId: problem for problem in read_problems(args.problems)}
    continuous_artifact = json.loads(Path(args.continuous_frontier).read_text(encoding="utf-8"))
    max_filters = continuous_artifact.get("config", {}).get("maxFilters")
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("continuous artifact config maxFilters is required")
    if args.max_filters is not None and args.max_filters != max_filters:
        raise ValueError("requested maxFilters does not match continuous artifact config")
    evaluator = CanonicalEvaluator(args.canonical_command)
    control_artifact = json.loads(Path(args.control).read_text(encoding="utf-8"))
    frontiers = []
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
        frontier = build_deliverable_frontier(
            problem,
            candidates,
            DeliverableOracleConfig(args.seed, args.generations, args.eval_budget),
            evaluator,
            known_deliverable_candidates=known_control,
            max_filters=max_filters,
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
                }
                for candidate, evaluation in zip(frontier, evaluations, strict=True)
            ],
        })
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
        "config": {
            "seed": args.seed,
            "generations": args.generations,
            "evaluationBudget": args.eval_budget,
            "maxFilters": max_filters,
            "canonicalCommand": args.canonical_command,
        },
        "candidatePath": str(candidate_path),
        "frontiers": frontiers,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
