from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, replace
import argparse
import json
from pathlib import Path
import shlex

from .canonical import CanonicalEvaluator, DEFAULT_CANONICAL_COMMAND
from .io import read_problems, serialize_candidate, write_candidates
from .objectives import ContinuousVectorLayout, enumerate_oracle_layouts
from .optimizers.base import ContinuousOptimizer
from .optimizers.cma_es import CmaEsOptimizer
from .optimizers.differential_evolution import DifferentialEvolutionOptimizer
from .optimizers.powell import PowellOptimizer
from .pareto import nondominated
from .types import ObjectivePoint, SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


DEFAULT_OBJECTIVE_WEIGHTS: tuple[tuple[float, float], ...] = (
    (1.0, 0.0),
    (0.75, 0.25),
    (0.5, 0.5),
    (0.25, 0.75),
    (0.0, 1.0),
)


@dataclass(frozen=True)
class OracleRunConfig:
    seeds: tuple[int, ...]
    filter_counts: tuple[int, ...]
    objective_weights: tuple[tuple[float, float], ...]
    evaluation_budget_per_run: int

    def __post_init__(self) -> None:
        if not self.seeds or any(not isinstance(seed, int) or isinstance(seed, bool) for seed in self.seeds):
            raise ValueError("oracle config requires integer seeds")
        if not self.filter_counts or any(
            not isinstance(count, int) or isinstance(count, bool) or count <= 0
            for count in self.filter_counts
        ):
            raise ValueError("oracle config requires positive filter counts")
        if not self.objective_weights:
            raise ValueError("oracle config requires objective weights")
        if self.evaluation_budget_per_run <= 0:
            raise ValueError("oracle config evaluation budget must be positive")


OptimizerFactory = Callable[[str, int], ContinuousOptimizer]


def _default_optimizer_factory(algorithm_id: str, run_index: int) -> ContinuousOptimizer:
    if algorithm_id == "differential-evolution":
        return DifferentialEvolutionOptimizer(run_index)
    if algorithm_id == "cma-es":
        return CmaEsOptimizer(run_index)
    if algorithm_id == "powell":
        return PowellOptimizer(run_index)
    raise ValueError(f"unknown continuous optimizer {algorithm_id}")


def _filter_vector_key(candidate: SolverLabCandidate) -> str:
    return json.dumps(
        [asdict(filter_) for filter_ in candidate.filters],
        sort_keys=True,
        separators=(",", ":"),
    )


def _validated_frontier_candidates(
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
) -> tuple[SolverLabCandidate, ...]:
    by_id = {candidate.candidateId: candidate for candidate in candidates}
    points: list[ObjectivePoint] = []
    for evaluation in evaluations:
        candidate = by_id.get(evaluation.candidateId)
        if candidate is None or not evaluation.valid or evaluation.continuous is None:
            continue
        points.append(ObjectivePoint(
            candidate_id=evaluation.candidateId,
            rmse_db=evaluation.continuous.rmseDb,
            max_abs_db=evaluation.continuous.maxAbsDb,
            filter_count=len(candidate.filters),
        ))
    selected = nondominated(points)
    return tuple(by_id[point.candidate_id] for point in selected)


def build_continuous_frontier(
    problem: SolverLabProblem,
    config: OracleRunConfig,
    canonical_evaluator: CanonicalEvaluator,
    optimizer_factory: OptimizerFactory | None = None,
) -> tuple[SolverLabCandidate, ...]:
    factory = optimizer_factory or _default_optimizer_factory
    candidates: list[SolverLabCandidate] = []
    run_index = 0
    for filter_count in config.filter_counts:
        if filter_count > problem.bounds["maxFilters"]:
            raise ValueError(f"filter count {filter_count} exceeds problem maxFilters")
        for layout in enumerate_oracle_layouts(filter_count):
            for seed in config.seeds:
                for objective_weights in config.objective_weights:
                    seeds_and_optimizers = (
                        ("differential-evolution", factory("differential-evolution", run_index)),
                        ("cma-es", factory("cma-es", run_index + 1)),
                    )
                    run_index += 2
                    for algorithm_id, optimizer in seeds_and_optimizers:
                        del algorithm_id
                        candidate = optimizer.optimize(
                            problem,
                            layout,
                            seed,
                            objective_weights,
                            config.evaluation_budget_per_run,
                        )
                        candidates.append(candidate)
                        polish = factory("powell", run_index)
                        run_index += 1
                        candidates.append(polish.optimize(
                            problem,
                            layout,
                            seed,
                            objective_weights,
                            config.evaluation_budget_per_run,
                            initial_candidate=candidate,
                        ))
    unique_candidates: list[SolverLabCandidate] = []
    seen_vectors: set[str] = set()
    for candidate in candidates:
        key = _filter_vector_key(candidate)
        if key not in seen_vectors:
            seen_vectors.add(key)
            unique_candidates.append(candidate)
    evaluations = canonical_evaluator.evaluate(problem, unique_candidates)
    return _validated_frontier_candidates(unique_candidates, evaluations)


def _parse_int_list(value: str, label: str) -> tuple[int, ...]:
    try:
        values = tuple(int(part) for part in value.split(",") if part)
    except ValueError as error:
        raise ValueError(f"{label} must be comma-separated integers") from error
    if not values or any(value <= 0 for value in values):
        raise ValueError(f"{label} must contain positive integers")
    return values


def _artifact_for_frontier(
    problem: SolverLabProblem,
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
    filter_count: int,
) -> dict:
    evaluation_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    return {
        "problemId": problem.problemId,
        "filterCount": filter_count,
        "points": [
            {
                "candidate": asdict(candidate),
                "evaluation": asdict(evaluation_by_id[candidate.candidateId]),
            }
            for candidate in candidates
            if candidate.candidateId in evaluation_by_id
        ],
    }


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the research-only Continuous Oracle")
    parser.add_argument("--problems", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seeds", required=True)
    parser.add_argument("--filter-counts", required=True)
    parser.add_argument("--eval-budget", required=True, type=int)
    parser.add_argument("--canonical-command", default=" ".join(DEFAULT_CANONICAL_COMMAND))
    args = parser.parse_args(argv)
    config = OracleRunConfig(
        seeds=_parse_int_list(args.seeds, "--seeds"),
        filter_counts=_parse_int_list(args.filter_counts, "--filter-counts"),
        objective_weights=DEFAULT_OBJECTIVE_WEIGHTS,
        evaluation_budget_per_run=args.eval_budget,
    )
    evaluator = CanonicalEvaluator(shlex.split(args.canonical_command))
    problems = read_problems(args.problems)
    frontiers: list[dict] = []
    all_candidates: list[SolverLabCandidate] = []
    for problem in problems:
        for filter_count in config.filter_counts:
            single_count_config = replace(config, filter_counts=(filter_count,))
            frontier = build_continuous_frontier(problem, single_count_config, evaluator)
            evaluations = evaluator.evaluate(problem, frontier)
            frontiers.append(_artifact_for_frontier(
                problem,
                frontier,
                evaluations,
                filter_count,
            ))
            all_candidates.extend(frontier)
    output = Path(args.out)
    candidate_path = Path(f"{args.out}.candidates.jsonl")
    write_candidates(candidate_path, all_candidates)
    output.write_text(json.dumps({
        "version": 1,
        "oracle": "continuous",
        "config": {
            "seeds": list(config.seeds),
            "filterCounts": list(config.filter_counts),
            "objectiveWeights": [list(weights) for weights in config.objective_weights],
            "evaluationBudgetPerRun": config.evaluation_budget_per_run,
            "canonicalCommand": list(evaluator.command),
        },
        "candidatePath": str(candidate_path),
        "frontiers": frontiers,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
