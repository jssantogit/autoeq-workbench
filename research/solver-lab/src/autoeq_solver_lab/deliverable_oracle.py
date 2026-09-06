from collections.abc import Sequence
from dataclasses import asdict, dataclass, replace
import argparse
import json
from pathlib import Path

import numpy as np

from .canonical import CanonicalEvaluator
from .dsp import cascade_response_db
from .io import parse_filter, read_problems, write_candidates
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
    return json.dumps([asdict(filter_) for filter_ in filters], sort_keys=True, separators=(",", ":"))


def _candidate(
    problem: SolverLabProblem,
    filters,
    seed: int,
    label: str,
    index: int,
) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId=problem.problemId,
        inputSha256=problem.inputSha256,
        candidateId=f"deliverable-oracle:{problem.problemId}:{seed}:{label}:{index}",
        algorithmId="deliverable-oracle",
        seed=seed,
        filters=tuple(filters),
    )


def _archive_entries(
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
) -> tuple[_ArchiveEntry, ...]:
    candidates_by_id = {candidate.candidateId: candidate for candidate in candidates}
    points: list[ObjectivePoint] = []
    entries_by_id: dict[str, _ArchiveEntry] = {}
    for evaluation in evaluations:
        candidate = candidates_by_id.get(evaluation.candidateId)
        if candidate is None or not evaluation.valid or evaluation.deliverable is None:
            continue
        entries_by_id[candidate.candidateId] = _ArchiveEntry(candidate, evaluation)
        points.append(ObjectivePoint(
            candidate_id=candidate.candidateId,
            rmse_db=evaluation.deliverable.rmseDb,
            max_abs_db=evaluation.deliverable.maxAbsDb,
            filter_count=len(candidate.filters),
        ))
    return tuple(entries_by_id[point.candidate_id] for point in nondominated(points))


def _merge_archive(
    existing: Sequence[_ArchiveEntry],
    additions: Sequence[_ArchiveEntry],
) -> tuple[_ArchiveEntry, ...]:
    by_vector: dict[str, _ArchiveEntry] = {}
    for entry in (*existing, *additions):
        by_vector.setdefault(_filter_key(entry.candidate.filters), entry)
    return _archive_entries(
        tuple(entry.candidate for entry in by_vector.values()),
        tuple(entry.evaluation for entry in by_vector.values()),
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
                    "local",
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
        label,
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
    continuous_frontier: Sequence[SolverLabCandidate],
    config: DeliverableOracleConfig,
    canonical_evaluator: CanonicalEvaluator,
) -> tuple[SolverLabCandidate, ...]:
    if not continuous_frontier:
        return ()
    quantization_bounds = _quantization_bounds(problem)
    initial = tuple(_candidate(
        problem,
        quantize_filters(candidate.filters, quantization_bounds),
        config.seed,
        "initial",
        index,
    ) for index, candidate in enumerate(continuous_frontier))
    initial_by_vector: dict[str, SolverLabCandidate] = {}
    for candidate in initial:
        initial_by_vector.setdefault(_filter_key(candidate.filters), candidate)
    initial = tuple(initial_by_vector.values())
    archive = _archive_entries(initial, canonical_evaluator.evaluate(problem, initial))
    rng = np.random.default_rng(config.seed)
    pending: list[SolverLabCandidate] = []
    run_index = 0
    for generation in range(1, config.generations + 1):
        if not archive:
            break
        parents = tuple(
            archive[int(rng.integers(0, len(archive)))]
            for _ in range(min(config.max_parents, max(1, len(archive))))
        )
        for entry in parents:
            pending.extend(_local_neighbors(problem, entry.candidate))
            pending.extend(_structural_neighbors(problem, entry.candidate, rng, "structural"))
            polished = _powell_neighbor(problem, entry.candidate, config, run_index)
            run_index += 1
            if polished is not None:
                pending.append(polished)
        if generation % 10 == 0:
            unique_pending: dict[str, SolverLabCandidate] = {}
            for candidate in pending:
                unique_pending.setdefault(_filter_key(candidate.filters), candidate)
            batch = tuple(unique_pending.values())
            if batch:
                archive = _merge_archive(archive, _archive_entries(batch, canonical_evaluator.evaluate(problem, batch)))
            pending = []
    unique_pending = dict((_filter_key(candidate.filters), candidate) for candidate in pending)
    if unique_pending:
        batch = tuple(unique_pending.values())
        archive = _merge_archive(archive, _archive_entries(batch, canonical_evaluator.evaluate(problem, batch)))
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
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--generations", required=True, type=int)
    parser.add_argument("--eval-budget", required=True, type=int)
    parser.add_argument("--canonical-command", required=True)
    args = parser.parse_args(argv)
    problems = {problem.problemId: problem for problem in read_problems(args.problems)}
    continuous_artifact = json.loads(Path(args.continuous_frontier).read_text(encoding="utf-8"))
    evaluator = CanonicalEvaluator(args.canonical_command)
    frontiers = []
    all_candidates: list[SolverLabCandidate] = []
    for frontier_artifact in continuous_artifact["frontiers"]:
        problem = problems[frontier_artifact["problemId"]]
        candidates = tuple(
            SolverLabCandidate(**{
                **point["candidate"],
                "filters": tuple(parse_filter(filter_value) for filter_value in point["candidate"]["filters"]),
            })
            for point in frontier_artifact["points"]
        )
        frontier = build_deliverable_frontier(
            problem,
            candidates,
            DeliverableOracleConfig(args.seed, args.generations, args.eval_budget),
            evaluator,
        )
        evaluations = evaluator.evaluate(problem, frontier)
        frontiers.append({
            "problemId": problem.problemId,
            "points": [
                {"candidate": asdict(candidate), "evaluation": asdict(evaluation)}
                for candidate, evaluation in zip(frontier, evaluations, strict=True)
            ],
        })
        all_candidates.extend(frontier)
    output = Path(args.out)
    candidate_path = Path(f"{args.out}.candidates.jsonl")
    write_candidates(candidate_path, all_candidates)
    output.write_text(json.dumps({
        "version": 1,
        "oracle": "deliverable",
        "config": {
            "seed": args.seed,
            "generations": args.generations,
            "evaluationBudget": args.eval_budget,
            "canonicalCommand": args.canonical_command,
        },
        "candidatePath": str(candidate_path),
        "frontiers": frontiers,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
