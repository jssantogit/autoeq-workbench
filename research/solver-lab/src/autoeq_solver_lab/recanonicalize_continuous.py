"""Re-evaluate a prior continuous candidate pool under the current canonical contract."""

from collections.abc import Mapping, Sequence
import argparse
import json
from pathlib import Path

from .canonical import CanonicalEvaluator
from .io import (
    load_control_candidates,
    parse_candidate,
    read_problems,
    serialize_candidate,
    serialize_evaluation,
    write_candidates,
)
from .pareto import nondominated
from .types import ObjectivePoint, SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


def rebuild_continuous_artifact(
    problem: SolverLabProblem,
    source: Mapping[str, object],
    control: Mapping[str, object],
    evaluator: CanonicalEvaluator,
    max_filters: int,
) -> tuple[dict[str, object], tuple[SolverLabCandidate, ...]]:
    by_id: dict[str, SolverLabCandidate] = {}
    for frontier in source.get("frontiers", []):
        if not isinstance(frontier, Mapping) or frontier.get("problemId") != problem.problemId:
            continue
        for point in frontier.get("points", []):
            if not isinstance(point, Mapping):
                continue
            candidate = parse_candidate(point["candidate"])
            if candidate.algorithmId != "standard-v2-control":
                by_id.setdefault(candidate.candidateId, candidate)
    for candidate in load_control_candidates(control, problem, max_filters):
        by_id[candidate.candidateId] = candidate
    candidates = tuple(sorted(by_id.values(), key=lambda candidate: candidate.candidateId))
    evaluations = tuple(evaluator.evaluate(problem, candidates))
    evaluation_by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}

    def selected(pool: Sequence[SolverLabCandidate]) -> tuple[SolverLabCandidate, ...]:
        points = []
        for candidate in pool:
            evaluation = evaluation_by_id[candidate.candidateId]
            if evaluation.valid and evaluation.continuous is not None:
                points.append(ObjectivePoint(
                    candidate.candidateId,
                    evaluation.continuous.rmseDb,
                    evaluation.continuous.maxAbsDb,
                    len(candidate.filters),
                ))
        selected_ids = {point.candidate_id for point in nondominated(points)}
        return tuple(candidate for candidate in pool if candidate.candidateId in selected_ids)

    frontiers: list[dict[str, object]] = []
    exact_counts = sorted({
        int(frontier["exactFilterCount"])
        for frontier in source.get("frontiers", [])
        if isinstance(frontier, Mapping) and
        frontier.get("problemId") == problem.problemId and
        frontier.get("frontierType") == "exactFilterCount"
    })
    frontier_specs = [("exactFilterCount", count) for count in exact_counts] + [("maxFilters", max_filters)]
    used: dict[str, SolverLabCandidate] = {}
    for frontier_type, count in frontier_specs:
        pool = tuple(
            candidate for candidate in candidates if len(candidate.filters) == count
        ) if frontier_type == "exactFilterCount" else tuple(
            candidate for candidate in candidates if len(candidate.filters) <= max_filters
        )
        chosen = selected(pool)
        used.update((candidate.candidateId, candidate) for candidate in chosen)
        points = []
        for candidate in chosen:
            evaluation: SolverLabEvaluation = evaluation_by_id[candidate.candidateId]
            points.append({
                "candidate": json.loads(serialize_candidate(candidate)),
                "evaluation": json.loads(serialize_evaluation(evaluation)),
                "actualFilterCount": len(candidate.filters),
                "actualDeliveredFilterCount": len(evaluation.deliverableFilters),
                "provenance": candidate.algorithmId,
            })
        frontier: dict[str, object] = {
            "problemId": problem.problemId,
            "frontierType": frontier_type,
            "points": points,
        }
        frontier[frontier_type] = count
        frontiers.append(frontier)
    artifact = {
        "version": 1,
        "oracle": "continuous",
        "oracleVersion": "continuous-recanonicalized-seeds-v1",
        "config": dict(source["config"]),
        "candidatePath": "continuous.json.candidates.jsonl",
        "sourceArtifact": "prior-approved-continuous-candidate-pool",
        "frontiers": frontiers,
    }
    return artifact, tuple(sorted(used.values(), key=lambda candidate: candidate.candidateId))


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Recanonicalize an approved continuous candidate pool")
    parser.add_argument("--problems", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--control", required=True)
    parser.add_argument("--max-filters", required=True, type=int)
    parser.add_argument("--canonical-command", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    problems = read_problems(args.problems)
    if len(problems) != 1:
        raise ValueError("recanonicalization requires exactly one problem")
    source = json.loads(Path(args.source).read_text(encoding="utf-8"))
    control = json.loads(Path(args.control).read_text(encoding="utf-8"))
    artifact, candidates = rebuild_continuous_artifact(
        problems[0], source, control, CanonicalEvaluator(args.canonical_command), args.max_filters
    )
    output = Path(args.out)
    output.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_candidates(Path(f"{args.out}.candidates.jsonl"), candidates)


if __name__ == "__main__":
    main()
