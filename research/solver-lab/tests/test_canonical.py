import json
import sys
from pathlib import Path

import pytest

from autoeq_solver_lab.canonical import CanonicalEvaluator
from autoeq_solver_lab.types import LabFilter, SolverLabCandidate, SolverLabProblem


def problem() -> SolverLabProblem:
    return SolverLabProblem(
        protocolVersion=1,
        problemId="canonical-problem",
        inputSha256="d" * 64,
        sampleRateHz=48000,
        frequenciesHz=(100.0, 1000.0),
        desiredDb=(0.0, 0.0),
        allowedFilterTypes=("PK", "LS", "HS"),
        bounds={
            "minFrequencyHz": 20.0,
            "maxFrequencyHz": 20000.0,
            "minGainDb": -15.0,
            "maxGainDb": 15.0,
            "minPkQ": 0.1,
            "maxPkQ": 12.0,
            "shelfQ": 0.7,
            "maxFilters": 2,
        },
        quantization={"frequencyStepHz": 1, "gainStepDb": 0.1, "qStep": 0.01},
    )


def candidate(candidate_id: str) -> SolverLabCandidate:
    return SolverLabCandidate(
        protocolVersion=1,
        problemId="canonical-problem",
        inputSha256="d" * 64,
        candidateId=candidate_id,
        algorithmId="fixture",
        seed=9,
        filters=(LabFilter(f"filter-{candidate_id}", True, "PK", 1000.0, 1.0, 1.0),),
    )


def fake_cli(tmp_path: Path, *, fail: bool = False) -> list[str]:
    script = tmp_path / "fake-canonical.py"
    script.write_text(
        "import json, sys\n"
        "from pathlib import Path\n"
        "args = sys.argv[1:]\n"
        "if '--fail' in args: sys.exit(7)\n"
        "def value(flag): return Path(args[args.index(flag) + 1])\n"
        "candidates = [json.loads(line) for line in value('--candidates').read_text().splitlines() if line]\n"
        "out = []\n"
        "for index, candidate in enumerate(reversed(candidates)):\n"
        "    out.append({'protocolVersion': 1, 'candidateId': candidate['candidateId'], 'valid': True, 'rejectionReason': None, 'continuous': {'rmseDb': index + 0.1, 'maxAbsDb': index + 0.2, 'bandRmseDb': {}}, 'deliverable': {'filters': candidate['filters'], 'rmseDb': index + 0.1, 'maxAbsDb': index + 0.2, 'bandRmseDb': {}, 'cancellationTotalScore': 0.0}})\n"
        "value('--out').write_text(''.join(json.dumps(item) + '\\n' for item in out))\n",
        encoding="utf-8",
    )
    command = [sys.executable, str(script)]
    if fail:
        command.append("--fail")
    return command


def test_canonical_evaluator_batches_and_matches_results_by_candidate_id(tmp_path: Path):
    evaluator = CanonicalEvaluator(fake_cli(tmp_path))
    candidates = (candidate("candidate-b"), candidate("candidate-a"))

    evaluations = evaluator.evaluate(problem(), candidates)

    assert [evaluation.candidateId for evaluation in evaluations] == [
        "candidate-b", "candidate-a"
    ]
    assert [evaluation.continuous.rmseDb for evaluation in evaluations if evaluation.continuous] == [
        1.1, 0.1
    ]


def test_canonical_evaluator_rejects_nonzero_exit_and_id_mismatch(tmp_path: Path):
    with pytest.raises(RuntimeError, match="canonical evaluator"):
        CanonicalEvaluator(fake_cli(tmp_path, fail=True)).evaluate(problem(), (candidate("one"),))

    script = tmp_path / "bad-canonical.py"
    script.write_text(
        "import sys\n"
        "from pathlib import Path\n"
        "out = Path(sys.argv[sys.argv.index('--out') + 1])\n"
        "out.write_text('{\"protocolVersion\":1,\"candidateId\":\"wrong\",\"valid\":false,\"rejectionReason\":\"bad\",\"continuous\":null,\"deliverable\":null}\\n')\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="candidate ID"):
        CanonicalEvaluator([sys.executable, str(script)]).evaluate(problem(), (candidate("one"),))
