from collections.abc import Sequence
from pathlib import Path
import shlex
import subprocess
import tempfile

from .io import read_evaluations, write_candidates, write_problems
from .types import SolverLabCandidate, SolverLabEvaluation, SolverLabProblem


DEFAULT_CANONICAL_COMMAND: tuple[str, ...] = (
    "pnpm",
    "--filter",
    "@autoeq-workbench/core",
    "research:lab",
    "--",
)


class CanonicalEvaluator:
    def __init__(self, command: Sequence[str] | str = DEFAULT_CANONICAL_COMMAND) -> None:
        self.command = tuple(shlex.split(command) if isinstance(command, str) else command)
        if not self.command:
            raise ValueError("canonical evaluator command must not be empty")

    def evaluate(
        self,
        problem: SolverLabProblem,
        candidates: Sequence[SolverLabCandidate],
    ) -> tuple[SolverLabEvaluation, ...]:
        if not candidates:
            return ()
        candidate_ids = [candidate.candidateId for candidate in candidates]
        if len(set(candidate_ids)) != len(candidate_ids):
            raise ValueError("canonical evaluator requires unique candidate IDs")
        with tempfile.TemporaryDirectory(prefix="autoeq-canonical-") as temporary_directory:
            directory = Path(temporary_directory)
            problems_path = directory / "problems.jsonl"
            candidates_path = directory / "candidates.jsonl"
            evaluations_path = directory / "evaluations.jsonl"
            write_problems(problems_path, (problem,))
            write_candidates(candidates_path, candidates)
            command = [
                *self.command,
                "evaluate-jsonl",
                "--problems",
                str(problems_path),
                "--candidates",
                str(candidates_path),
                "--out",
                str(evaluations_path),
            ]
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
            )
            if completed.returncode != 0:
                detail = (completed.stderr or completed.stdout).strip()
                raise RuntimeError(
                    f"canonical evaluator failed with exit code {completed.returncode}: {detail}"
                )
            evaluations = read_evaluations(evaluations_path)
        evaluation_ids = [evaluation.candidateId for evaluation in evaluations]
        if set(evaluation_ids) != set(candidate_ids) or len(evaluation_ids) != len(candidate_ids):
            raise ValueError(
                "canonical evaluator candidate ID set mismatch: "
                f"requested={sorted(candidate_ids)} returned={sorted(evaluation_ids)}"
            )
        by_id = {evaluation.candidateId: evaluation for evaluation in evaluations}
        if len(by_id) != len(evaluations):
            raise ValueError("canonical evaluator returned duplicate candidate IDs")
        return tuple(by_id[candidate_id] for candidate_id in candidate_ids)
