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
}

export interface StandardV2ResearchTrace {
  onPhaseStart?(phase: StandardV2ResearchPhase): void
  onPhaseEnd?(phase: StandardV2ResearchPhase): void
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  onCandidatesGenerated?(count: number): void
  onCandidatesShortlisted?(count: number): void
  onJointRefineCompleted?(coordinateTrials: number): void
  onWorkingCheckpoint?(): void
  onDeliverableBuilt?(): void
  onBestDeliverableUpdated?(checkpoint: StandardV2SafeCheckpoint): void
  onDiscreteTrial?(): void
  onDiscreteAcceptedMove?(): void
  onCompressionRemovalTrial?(): void
  onPeakWorkingFilterCount?(count: number): void
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
