from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, replace
import argparse
import json
from pathlib import Path
import shlex

from .canonical import CanonicalEvaluator, DEFAULT_CANONICAL_COMMAND
from .io import (
    load_control_candidates,
    read_problems,
    serialize_candidate,
    serialize_evaluation,
    write_candidates,
)
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

OPTIMIZER_CONFIGS: dict[str, dict[str, object]] = {
    "differential-evolution": {
        "bounds": [[0.0, 1.0]],
        "workers": 1,
        "updating": "immediate",
        "polish": False,
        "populationSizeLimit": 8,
        "seedSource": "candidate.seed",
    },
    "cma-es": {
        "bounds": [0.0, 1.0],
        "sigma": 0.25,
        "verbose": -9,
        "populationSizeLimit": 8,
        "seedSource": "candidate.seed",
    },
    "powell": {
        "method": "Powell",
        "bounds": [[0.0, 1.0]],
        "polishOnly": True,
        "seedSource": "parent.seed",
    },
}


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
    type_order = {"LS": 0, "PK": 1, "HS": 2}
    filters = sorted(
        candidate.filters,
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
            for filter_ in filters
        ],
        sort_keys=True,
        separators=(",", ":"),
    )


def _unique_candidates(candidates: Sequence[SolverLabCandidate]) -> tuple[SolverLabCandidate, ...]:
    by_vector: dict[str, SolverLabCandidate] = {}
    for candidate in candidates:
        key = _filter_vector_key(candidate)
        existing = by_vector.get(key)
        if existing is None or (
            candidate.algorithmId == "standard-v2-control" and
            existing.algorithmId != "standard-v2-control"
        ):
            by_vector[key] = candidate
    return tuple(by_vector.values())


def _validate_candidate_for_cap(
    problem: SolverLabProblem,
    candidate: SolverLabCandidate,
    max_filters: int,
) -> None:
    if candidate.problemId != problem.problemId:
        raise ValueError("candidate problemId does not match problem")
    if candidate.inputSha256 != problem.inputSha256:
        raise ValueError("candidate inputSha256 does not match problem")
    if len(candidate.filters) > max_filters:
        raise ValueError("candidate filter count exceeds maxFilters")


def _validated_frontier_candidates_for_problem(
    problem: SolverLabProblem,
    candidates: Sequence[SolverLabCandidate],
    evaluations: Sequence[SolverLabEvaluation],
    *,
    max_filters: int | None = None,
    exact_filter_count: int | None = None,
) -> tuple[SolverLabCandidate, ...]:
    by_id = {candidate.candidateId: candidate for candidate in candidates}
    points: list[ObjectivePoint] = []
    for evaluation in evaluations:
        candidate = by_id.get(evaluation.candidateId)
        if candidate is None or not evaluation.valid or evaluation.continuous is None:
            continue
        if max_filters is not None:
            _validate_candidate_for_cap(problem, candidate, max_filters)
        if exact_filter_count is not None and len(candidate.filters) != exact_filter_count:
            raise ValueError("exact frontier candidate filter count does not match exactFilterCount")
        points.append(ObjectivePoint(
            candidate_id=evaluation.candidateId,
            rmse_db=evaluation.continuous.rmseDb,
            max_abs_db=evaluation.continuous.maxAbsDb,
            filter_count=len(candidate.filters),
        ))
    selected = nondominated(points)
    return tuple(by_id[point.candidate_id] for point in selected)


def build_continuous_exact_frontier(
    problem: SolverLabProblem,
    filter_count: int,
    config: OracleRunConfig,
    canonical_evaluator: CanonicalEvaluator,
    optimizer_factory: OptimizerFactory | None = None,
) -> tuple[SolverLabCandidate, ...]:
    if isinstance(filter_count, bool) or not isinstance(filter_count, int) or filter_count <= 0:
        raise ValueError("exact filter count must be a positive integer")
    if filter_count > problem.bounds["maxFilters"]:
        raise ValueError("exact filter count exceeds problem maxFilters")
    factory = optimizer_factory or _default_optimizer_factory
    candidates: list[SolverLabCandidate] = []
    run_index = 0
    for layout in enumerate_oracle_layouts(filter_count):
        for seed in config.seeds:
            for objective_weights in config.objective_weights:
                optimizers = (
                    factory("differential-evolution", run_index),
                    factory("cma-es", run_index + 1),
                )
                run_index += 2
                for optimizer in optimizers:
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
    unique_candidates = _unique_candidates(candidates)
    evaluations = canonical_evaluator.evaluate(problem, unique_candidates)
    return _validated_frontier_candidates_for_problem(
        problem,
        unique_candidates,
        evaluations,
        max_filters=filter_count,
        exact_filter_count=filter_count,
    )


def build_continuous_frontier(
    problem: SolverLabProblem,
    config: OracleRunConfig,
    canonical_evaluator: CanonicalEvaluator,
    optimizer_factory: OptimizerFactory | None = None,
) -> tuple[SolverLabCandidate, ...]:
    if len(config.filter_counts) != 1:
        raise ValueError("build_continuous_frontier requires exactly one exact filter count")
    return build_continuous_exact_frontier(
        problem,
        config.filter_counts[0],
        config,
        canonical_evaluator,
        optimizer_factory,
    )


def build_continuous_cap_frontier(
    problem: SolverLabProblem,
    exact_frontiers: Sequence[Sequence[SolverLabCandidate]],
    max_filters: int,
    canonical_evaluator: CanonicalEvaluator,
    known_candidates: Sequence[SolverLabCandidate] = (),
) -> tuple[SolverLabCandidate, ...]:
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("maxFilters must be a positive integer")
    if max_filters > problem.bounds["maxFilters"]:
        raise ValueError("maxFilters exceeds problem bounds")
    candidates = tuple(
        candidate
        for frontier in exact_frontiers
        for candidate in frontier
    )
    candidates = (*known_candidates, *candidates)
    for candidate in candidates:
        _validate_candidate_for_cap(problem, candidate, max_filters)
    unique_candidates = _unique_candidates(candidates)
    if not unique_candidates:
        return ()
    evaluations = canonical_evaluator.evaluate(problem, unique_candidates)
    return _validated_frontier_candidates_for_problem(
        problem,
        unique_candidates,
        evaluations,
        max_filters=max_filters,
    )


def validate_exact_filter_counts(
    filter_counts: Sequence[int],
    max_filters: int,
) -> tuple[int, ...]:
    if isinstance(max_filters, bool) or not isinstance(max_filters, int) or max_filters <= 0:
        raise ValueError("maxFilters must be a positive integer")
    normalized = tuple(sorted(filter_counts))
    expected = tuple(range(1, max_filters + 1))
    if normalized != expected:
        raise ValueError(
            "official cap output requires exact filter counts for every N from 1 through maxFilters"
        )
    return normalized


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
    *,
    frontier_type: str,
    frontier_limit: int,
) -> dict:
    evaluation_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
    if frontier_type == "exactFilterCount":
        label = {"frontierType": frontier_type, "exactFilterCount": frontier_limit}
    elif frontier_type == "maxFilters":
        label = {"frontierType": frontier_type, "maxFilters": frontier_limit}
    else:
        raise ValueError("unknown frontier type")
    return {
        **label,
        "problemId": problem.problemId,
        "points": [
            {
                "candidate": json.loads(serialize_candidate(candidate)),
                "evaluation": json.loads(serialize_evaluation(evaluation_by_id[candidate.candidateId])),
                "actualFilterCount": len(candidate.filters),
                "actualDeliveredFilterCount": len(evaluation_by_id[candidate.candidateId].deliverableFilters),
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
    parser.add_argument("--max-filters", type=int)
    parser.add_argument("--control", required=True)
    parser.add_argument("--eval-budget", required=True, type=int)
    parser.add_argument("--canonical-command", default=" ".join(DEFAULT_CANONICAL_COMMAND))
    args = parser.parse_args(argv)
    config = OracleRunConfig(
        seeds=_parse_int_list(args.seeds, "--seeds"),
        filter_counts=_parse_int_list(args.filter_counts, "--filter-counts"),
        objective_weights=DEFAULT_OBJECTIVE_WEIGHTS,
        evaluation_budget_per_run=args.eval_budget,
    )
    max_filters = args.max_filters if args.max_filters is not None else max(config.filter_counts)
    try:
        exact_filter_counts = validate_exact_filter_counts(config.filter_counts, max_filters)
    except ValueError as error:
        parser.error(str(error))
    config = replace(config, filter_counts=exact_filter_counts)
    evaluator = CanonicalEvaluator(shlex.split(args.canonical_command))
    problems = read_problems(args.problems)
    control_artifact = json.loads(Path(args.control).read_text(encoding="utf-8"))
    frontiers: list[dict] = []
    all_candidates: list[SolverLabCandidate] = []
    for problem in problems:
        exact_frontiers: list[tuple[SolverLabCandidate, ...]] = []
        for filter_count in config.filter_counts:
            single_count_config = replace(config, filter_counts=(filter_count,))
            frontier = build_continuous_exact_frontier(
                problem,
                filter_count,
                single_count_config,
                evaluator,
            )
            evaluations = evaluator.evaluate(problem, frontier)
            frontiers.append(_artifact_for_frontier(
                problem,
                frontier,
                evaluations,
                frontier_type="exactFilterCount",
                frontier_limit=filter_count,
            ))
            exact_frontiers.append(frontier)
            all_candidates.extend(frontier)
        control_candidates = load_control_candidates(control_artifact, problem, max_filters)
        cap_frontier = build_continuous_cap_frontier(
            problem,
            tuple(exact_frontiers),
            max_filters,
            evaluator,
            known_candidates=control_candidates,
        )
        cap_evaluations = evaluator.evaluate(problem, cap_frontier)
        frontiers.append(_artifact_for_frontier(
            problem,
            cap_frontier,
            cap_evaluations,
            frontier_type="maxFilters",
            frontier_limit=max_filters,
        ))
        all_candidates.extend(cap_frontier)
    output = Path(args.out)
    candidate_path = Path(f"{args.out}.candidates.jsonl")
    unique_by_id: dict[str, SolverLabCandidate] = {}
    for candidate in all_candidates:
        unique_by_id.setdefault(candidate.candidateId, candidate)
    write_candidates(candidate_path, tuple(unique_by_id.values()))
    output.write_text(json.dumps({
        "version": 1,
        "oracle": "continuous",
        "config": {
            "seeds": list(config.seeds),
            "filterCounts": list(config.filter_counts),
            "maxFilters": max_filters,
            "caps": [max_filters],
            "objectiveWeights": [list(weights) for weights in config.objective_weights],
            "evaluationBudgetPerRun": config.evaluation_budget_per_run,
            "optimizerConfigs": OPTIMIZER_CONFIGS,
            "canonicalCommand": list(evaluator.command),
        },
        "candidatePath": str(candidate_path),
        "frontiers": frontiers,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
