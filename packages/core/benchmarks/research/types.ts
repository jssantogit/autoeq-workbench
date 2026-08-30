import type { Curve } from '../../src/types/curve.js'
import type { ErrorMetrics } from '../../src/metrics/errorMetrics.js'
import type { StandardV2ResearchPhase } from '../../src/autoeq/v2/researchTrace.js'

export type ResearchCaseId = 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'

export interface ResearchCase {
  id: ResearchCaseId
  source: Curve
  target: Curve
}

export interface ResearchCheckpoint {
  elapsedMs: number
  metrics: ErrorMetrics
  filterCount: number
}

export interface ResearchTimeToQuality {
  rmse100Ms: number | null
  rmse075Ms: number | null
  rmse050Ms: number | null
  rmse035Ms: number | null
  rmse025Ms: number | null
  maxAbs200Ms: number | null
  maxAbs150Ms: number | null
  maxAbs100Ms: number | null
  maxAbs075Ms: number | null
  jointTargetMs: number | null
}

export interface StandardV2ResearchCounters {
  boundaryModeAttempts: number
  candidatesGenerated: number
  candidatesShortlisted: number
  workingCheckpoints: number
  deliverablesBuilt: number
  peakWorkingFilterCount: number
  jointRefinementCount: number
  jointCoordinateTrials: number
  discreteTrials: number
  discreteAcceptedMoves: number
  compressionRemovalTrials: number
}

export interface StandardV2ResearchPhaseTimingMs {
  prepare: number
  candidateScoring: number
  jointRefine: number
  deliverable: number
  discreteRefine: number
  compression: number
  other: number
}

export interface ResearchTelemetrySnapshot {
  mode: 'light' | 'deep'
  counters: StandardV2ResearchCounters
  checkpoints: ResearchCheckpoint[]
  phaseTimingMs: StandardV2ResearchPhaseTimingMs
  phasesObserved: StandardV2ResearchPhase[]
}

export type ResearchTerminationReason = 'target-reached' | 'converged' | 'time-limit'
