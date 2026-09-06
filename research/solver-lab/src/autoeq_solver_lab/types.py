from dataclasses import dataclass
from typing import Literal


FilterType = Literal["PK", "LS", "HS"]


@dataclass(frozen=True)
class LabFilter:
    id: str
    enabled: bool
    type: FilterType
    frequencyHz: float
    gainDb: float
    q: float


@dataclass(frozen=True)
class SolverLabProblem:
    protocolVersion: Literal[1]
    problemId: str
    inputSha256: str
    sampleRateHz: int
    frequenciesHz: tuple[float, ...]
    desiredDb: tuple[float, ...]
    allowedFilterTypes: tuple[FilterType, ...]
    bounds: dict[str, float | int]
    quantization: dict[str, float | int]


@dataclass(frozen=True)
class SolverLabCandidate:
    protocolVersion: Literal[1]
    problemId: str
    inputSha256: str
    candidateId: str
    algorithmId: str
    seed: int | None
    filters: tuple[LabFilter, ...]


@dataclass(frozen=True)
class CanonicalMetricSet:
    rmseDb: float
    maxAbsDb: float
    bandRmseDb: dict[str, float]


@dataclass(frozen=True)
class SolverLabEvaluation:
    protocolVersion: Literal[1]
    candidateId: str
    valid: bool
    rejectionReason: str | None
    continuous: CanonicalMetricSet | None
    deliverable: CanonicalMetricSet | None
    deliverableFilters: tuple[LabFilter, ...]
    cancellationTotalScore: float | None
