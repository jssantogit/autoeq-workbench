from dataclasses import dataclass
from typing import Callable, Protocol

import numpy as np

from ..objectives import ContinuousVectorLayout
from ..types import SolverLabCandidate, SolverLabProblem


class EvaluationBudgetExhausted(RuntimeError):
    pass


@dataclass
class ObjectiveTracker:
    objective: Callable[[np.ndarray], float]
    budget: int
    evaluations: int = 0
    best_value: float | None = None
    best_vector: np.ndarray | None = None

    def evaluate(self, vector: np.ndarray) -> float:
        if self.evaluations >= self.budget:
            raise EvaluationBudgetExhausted
        value = float(self.objective(np.asarray(vector, dtype=np.float64)))
        self.evaluations += 1
        if self.best_value is None or value < self.best_value:
            self.best_value = value
            self.best_vector = np.asarray(vector, dtype=np.float64).copy()
        return value


class ContinuousOptimizer(Protocol):
    algorithm_id: str

    def optimize(
        self,
        problem: SolverLabProblem,
        layout: ContinuousVectorLayout,
        seed: int,
        objective_weights: tuple[float, float],
        evaluation_budget: int,
        initial_candidate: SolverLabCandidate | None = None,
    ) -> SolverLabCandidate:
        ...


def validate_optimizer_inputs(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    seed: int,
    objective_weights: tuple[float, float],
    evaluation_budget: int,
) -> None:
    if layout.filter_count > problem.bounds["maxFilters"]:
        raise ValueError("layout exceeds problem maxFilters")
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ValueError("optimizer seed must be an integer")
    if not isinstance(evaluation_budget, int) or isinstance(evaluation_budget, bool) or evaluation_budget <= 0:
        raise ValueError("evaluation_budget must be a positive integer")
    if len(objective_weights) != 2:
        raise ValueError("objective_weights must contain RMSE and maxAbs weights")


def midpoint_vector(layout: ContinuousVectorLayout) -> np.ndarray:
    return np.full(layout.filter_count * 3, 0.5, dtype=np.float64)
