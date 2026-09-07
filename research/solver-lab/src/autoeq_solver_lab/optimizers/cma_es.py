from collections.abc import Callable

import cma
import numpy as np

from ..objectives import (
    ContinuousVectorLayout,
    candidate_from_vector,
    encode_filters,
    scalarized_objective,
)
from ..types import SolverLabCandidate, SolverLabProblem
from .base import (
    ContinuousOptimizer,
    ObjectiveTracker,
    midpoint_vector,
    validate_optimizer_inputs,
)


class CmaEsOptimizer(ContinuousOptimizer):
    algorithm_id = "cma-es"

    def __init__(self, run_index: int = 0) -> None:
        self.run_index = run_index

    def optimize(
        self,
        problem: SolverLabProblem,
        layout: ContinuousVectorLayout,
        seed: int,
        objective_weights: tuple[float, float],
        evaluation_budget: int,
        initial_candidate: SolverLabCandidate | None = None,
        objective: Callable[[np.ndarray], float] | None = None,
    ) -> SolverLabCandidate:
        validate_optimizer_inputs(problem, layout, seed, objective_weights, evaluation_budget)
        if initial_candidate is not None:
            if initial_candidate.problemId != problem.problemId:
                raise ValueError("initial candidate problemId does not match problem")
            if initial_candidate.inputSha256 != problem.inputSha256:
                raise ValueError("initial candidate inputSha256 does not match problem")
            initial_vector = encode_filters(problem, layout, initial_candidate.filters)
            sigma = 0.08
        else:
            initial_vector = midpoint_vector(layout)
            sigma = 0.25
        tracker = ObjectiveTracker(
            objective if objective is not None else (lambda vector: scalarized_objective(
                problem, layout, vector, objective_weights[0], objective_weights[1]
            )),
            evaluation_budget,
        )
        dimension = layout.filter_count * 3
        if evaluation_budget < 2:
            self.last_evaluation_count = tracker.evaluations
            return candidate_from_vector(
                problem, layout, initial_vector, self.algorithm_id, seed, self.run_index
            )
        population_size = max(2, min(8, evaluation_budget // max(1, dimension)))
        strategy = cma.CMAEvolutionStrategy(
            initial_vector.tolist(),
            sigma,
            {
                "bounds": [0.0, 1.0],
                "seed": seed,
                "verbose": -9,
                "verb_disp": 0,
                "popsize": population_size,
                "maxfevals": evaluation_budget,
            },
        )
        while not strategy.stop() and tracker.evaluations + population_size <= evaluation_budget:
            vectors = strategy.ask()
            values = [tracker.evaluate(np.asarray(vector, dtype=np.float64)) for vector in vectors]
            strategy.tell(vectors, values)
        self.last_evaluation_count = tracker.evaluations
        vector = tracker.best_vector if tracker.best_vector is not None else initial_vector
        return candidate_from_vector(
            problem, layout, vector, self.algorithm_id, seed, self.run_index
        )
