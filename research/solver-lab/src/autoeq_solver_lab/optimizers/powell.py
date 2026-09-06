import numpy as np
from scipy.optimize import minimize

from ..objectives import (
    ContinuousVectorLayout,
    candidate_from_vector,
    encode_filters,
    scalarized_objective,
)
from ..types import SolverLabCandidate, SolverLabProblem
from .base import (
    ContinuousOptimizer,
    EvaluationBudgetExhausted,
    ObjectiveTracker,
    validate_optimizer_inputs,
)


class PowellOptimizer(ContinuousOptimizer):
    algorithm_id = "powell"

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
        validate_optimizer_inputs(problem, layout, seed, objective_weights, evaluation_budget)
        if initial_candidate is None:
            raise ValueError("Powell optimizer requires an explicit initial_candidate")
        if initial_candidate.problemId != problem.problemId or initial_candidate.inputSha256 != problem.inputSha256:
            raise ValueError("Powell initial candidate does not belong to the problem")
        initial_vector = encode_filters(problem, layout, initial_candidate.filters)
        tracker = ObjectiveTracker(
            lambda vector: scalarized_objective(
                problem, layout, np.clip(vector, 0.0, 1.0), objective_weights[0], objective_weights[1]
            ),
            evaluation_budget,
        )
        try:
            minimize(
                tracker.evaluate,
                initial_vector,
                method="Powell",
                bounds=[(0.0, 1.0)] * initial_vector.size,
                options={"maxfev": evaluation_budget, "maxiter": evaluation_budget},
            )
        except EvaluationBudgetExhausted:
            pass
        vector = tracker.best_vector if tracker.best_vector is not None else initial_vector
        return candidate_from_vector(
            problem, layout, vector, self.algorithm_id, seed, self.run_index
        )
