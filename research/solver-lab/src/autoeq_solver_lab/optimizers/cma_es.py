import numpy as np
import cma

from ..objectives import (
    ContinuousVectorLayout,
    candidate_from_vector,
    scalarized_objective,
)
from ..types import SolverLabCandidate, SolverLabProblem
from .base import (
    ContinuousOptimizer,
    EvaluationBudgetExhausted,
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
    ) -> SolverLabCandidate:
        del initial_candidate
        validate_optimizer_inputs(problem, layout, seed, objective_weights, evaluation_budget)
        tracker = ObjectiveTracker(
            lambda vector: scalarized_objective(
                problem, layout, vector, objective_weights[0], objective_weights[1]
            ),
            evaluation_budget,
        )
        dimension = layout.filter_count * 3
        if evaluation_budget < 2:
            return candidate_from_vector(
                problem, layout, midpoint_vector(layout), self.algorithm_id, seed, self.run_index
            )
        population_size = max(2, min(8, evaluation_budget // max(1, dimension)))
        strategy = cma.CMAEvolutionStrategy(
            midpoint_vector(layout).tolist(),
            0.25,
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
        vector = tracker.best_vector if tracker.best_vector is not None else midpoint_vector(layout)
        return candidate_from_vector(
            problem, layout, vector, self.algorithm_id, seed, self.run_index
        )
