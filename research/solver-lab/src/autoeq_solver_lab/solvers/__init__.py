"""Research-only fixed-cap solver implementations."""

from .matching_pursuit import (
    DictionaryAtom,
    DictionaryConfig,
    MatchingPursuitConfig,
    MatchingPursuitSolver,
    build_dictionary,
    build_unit_response_matrix,
)

__all__ = [
    "DictionaryAtom",
    "DictionaryConfig",
    "MatchingPursuitConfig",
    "MatchingPursuitSolver",
    "build_dictionary",
    "build_unit_response_matrix",
]
