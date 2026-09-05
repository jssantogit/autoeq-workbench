import type { ErrorMetrics } from '../../metrics/errorMetrics.js'
import type { Filter } from '../../types/filter.js'
import type { V2CandidateBoundaryMode } from './candidates.js'

export type StandardV2ResearchPhase =
  | 'prepare'
  | 'candidateScoring'
  | 'jointRefine'
  | 'deliverable'
  | 'discreteRefine'
  | 'compression'

export interface StandardV2SafeCheckpoint {
  metrics: ErrorMetrics
  filters: Filter[]
  preampDb: number
  sourceSolutionKey?: string
}

export type StandardV2JointRefineOrigin = 'search' | 'compression'

export type StandardV2JointRefineRetentionStage = 'parent' | 'active'

export interface StandardV2JointRefineCandidate {
  filter: Filter
  featureIndex: number | null
  boundaryMode: V2CandidateBoundaryMode | null
  qScale: 0.5 | 1 | 2 | null
  cheapScore: number | null
}

export interface StandardV2JointRefineContext {
  traceId: string
  origin: StandardV2JointRefineOrigin
  boundaryMode?: V2CandidateBoundaryMode
  parentKey: string
  parentFilterCount: number
  parentMetrics: ErrorMetrics
  candidateKey: string
  candidate: StandardV2JointRefineCandidate
  refinementKey: string
}

export interface StandardV2JointRefineCycle {
  cycleIndex: number
  completed: boolean
  coordinateTrials: number
  startMetrics: ErrorMetrics
  endMetrics: ErrorMetrics
  normalizedViolationGain: number
}

export interface StandardV2JointRefineRecord extends StandardV2JointRefineContext {
  resultKey: string
  resultMetrics: ErrorMetrics
  cycles: StandardV2JointRefineCycle[]
  completedCycles: number
  coordinateTrials: number
  expired: boolean
}

export interface StandardV2JointRefineRetention {
  traceId: string
  stage: StandardV2JointRefineRetentionStage
  retained: boolean
}

export interface StandardV2ResearchTrace {
  onPhaseStart?(phase: StandardV2ResearchPhase): void
  onPhaseEnd?(phase: StandardV2ResearchPhase): void
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  onCandidatesGenerated?(count: number): void
  onCandidatesShortlisted?(count: number): void
  onJointRefineCompleted?(coordinateTrials: number): void
  onJointRefineTrace?(record: StandardV2JointRefineRecord): void
  onJointRefineRetention?(retention: StandardV2JointRefineRetention): void
  onWorkingCheckpoint?(): void
  onDeliverableBuilt?(): void
  onBestDeliverableUpdated?(checkpoint: StandardV2SafeCheckpoint): void
  onDiscreteTrial?(): void
  onDiscreteAcceptedMove?(): void
  onCompressionRemovalTrial?(): void
  onPeakWorkingFilterCount?(count: number): void
}

function filterKey(filter: Filter): string {
  return JSON.stringify([
    filter.enabled,
    filter.type,
    filter.frequencyHz,
    filter.gainDb,
    filter.q,
  ])
}

export function createV2FilterKey(filter: Filter): string {
  return filterKey(filter)
}

export function createV2SolutionKey(filters: readonly Filter[]): string {
  return JSON.stringify(filters.map(filterKey))
}

export function withResearchTracePhase<T>(
  trace: StandardV2ResearchTrace | undefined,
  phase: StandardV2ResearchPhase,
  callback: () => T,
): T {
  if (trace === undefined) return callback()
  trace?.onPhaseStart?.(phase)
  try {
    return callback()
  } finally {
    trace?.onPhaseEnd?.(phase)
  }
}
