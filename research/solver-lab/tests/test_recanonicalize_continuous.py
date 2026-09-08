from dataclasses import asdict, replace

from autoeq_solver_lab.recanonicalize_continuous import rebuild_continuous_artifact
from test_deliverable_oracle import MappingEvaluator, control_candidate, problem


def candidate_json(candidate):
    return {
        "protocolVersion": candidate.protocolVersion,
        "problemId": candidate.problemId,
        "inputSha256": candidate.inputSha256,
        "candidateId": candidate.candidateId,
        "algorithmId": candidate.algorithmId,
        "seed": candidate.seed,
        "filters": [asdict(filter_) for filter_ in candidate.filters],
    }


def test_recanonicalization_replaces_conflicting_prior_control_with_current_control():
    lab_problem = replace(problem(), bounds={**problem().bounds, "maxFilters": 2})
    current = control_candidate(lab_problem, "standard-v2-control:case:2:30")
    prior = replace(current, filters=(replace(current.filters[0], frequencyHz=2000),))
    oracle = replace(current, candidateId="oracle-seed", algorithmId="powell", seed=11)
    source = {
        "config": {"maxFilters": 2},
        "frontiers": [{
            "problemId": lab_problem.problemId,
            "frontierType": "maxFilters",
            "maxFilters": 2,
            "points": [{"candidate": candidate_json(prior)}, {"candidate": candidate_json(oracle)}],
        }],
    }
    control = {
        "version": 1,
        "oracle": "standard-v2-control",
        "repositorySha": "a" * 40,
        "corpusLayer": "adversarial",
        "maxFilters": 2,
        "budgetSeconds": 30,
        "algorithmVersion": "test",
        "points": [{
            "candidateId": current.candidateId,
            "problemId": current.problemId,
            "inputSha256": current.inputSha256,
            "maxFilters": 2,
            "rmseDb": 0.1,
            "maxAbsDb": 0.2,
            "maeDb": 0.05,
            "maxAbsFrequencyHz": 1000,
            "targetAchieved": False,
            "terminationReason": "search-exhausted",
            "deliveredFilterCount": 1,
            "filters": [asdict(filter_) for filter_ in current.filters],
        }],
    }

    artifact, candidates = rebuild_continuous_artifact(
        lab_problem,
        source,
        control,
        MappingEvaluator({"standard-v2-control": (0.1, 0.2), "powell": (0.3, 0.4)}),
        2,
    )

    selected = {candidate.candidateId: candidate for candidate in candidates}
    assert selected[current.candidateId].filters == current.filters
    assert selected[current.candidateId].filters != prior.filters
    assert artifact["oracleVersion"] == "continuous-recanonicalized-seeds-v1"
