from collections.abc import Callable

import numpy as np
from scipy.optimize import differential_evolution

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


class DifferentialEvolutionOptimizer(ContinuousOptimizer):
    algorithm_id = "differential-evolution"

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
        del initial_candidate
        validate_optimizer_inputs(problem, layout, seed, objective_weights, evaluation_budget)
        tracker = ObjectiveTracker(
            objective if objective is not None else (lambda vector: scalarized_objective(
                problem, layout, vector, objective_weights[0], objective_weights[1]
            )),
            evaluation_budget,
        )
        dimension = layout.filter_count * 3
        population_size = max(1, min(8, evaluation_budget // max(1, dimension)))
        max_iterations = max(1, evaluation_budget // (population_size * dimension) + 1)
        try:
            differential_evolution(
                tracker.evaluate,
                [(0.0, 1.0)] * dimension,
                seed=seed,
                workers=1,
                updating="immediate",
                polish=False,
                popsize=population_size,
                maxiter=max_iterations,
                tol=0.0,
                atol=0.0,
            )
        except EvaluationBudgetExhausted:
            pass
        self.last_evaluation_count = tracker.evaluations
        vector = tracker.best_vector if tracker.best_vector is not None else midpoint_vector(layout)
        return candidate_from_vector(
            problem, layout, vector, self.algorithm_id, seed, self.run_index
        )
