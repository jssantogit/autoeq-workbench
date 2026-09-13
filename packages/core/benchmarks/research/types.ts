import type { Curve } from '../../src/types/curve.js'
import type { ErrorMetrics } from '../../src/metrics/errorMetrics.js'
import type { BandMetric } from '../../src/metrics/bandMetrics.js'
import type { Filter } from '../../src/types/filter.js'
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

export interface ResearchFinalQuality {
  maeDb: number
  rmseDb: number
  maxAbsDb: number
  maxAbsFrequencyHz: number
  targetAchieved: boolean
  terminationReason: ResearchTerminationReason
  deliveredFilterCount: number
  preampDb: number
}

export interface ResearchRunRow {
  caseId: ResearchCaseId
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  maxFilters: number
  repeatIndex: number
  elapsedMs: number
  final: ResearchFinalQuality
  bands: BandMetric[]
  counters: StandardV2ResearchCounters
  timeToQuality: ResearchTimeToQuality
  timeline: ResearchCheckpoint[]
  filters: Filter[]
  telemetryMode: 'light' | 'deep'
  phaseTimingMs: StandardV2ResearchPhaseTimingMs
}

export interface ResearchAggregateRow {
  caseId: ResearchCaseId
  budgetSeconds: number
  maxFilters: number
  runCount: number
  rmseDb: { best: number; median: number; worst: number; spread: number }
  maxAbsDb: { best: number; median: number; worst: number; spread: number }
  targetAchievedCount: number
  targetAchievedRate: number
  terminationReasons: Record<string, number>
  timeToQualityMedian: ResearchTimeToQuality
  timeToQualityWorst: ResearchTimeToQuality
  elapsedMs: { best: number; median: number; worst: number; spread: number }
  peakWorkingFilterCount: { best: number; median: number; worst: number; spread: number }
  jointRefinementCount: { best: number; median: number; worst: number; spread: number }
}

export interface ResearchBaselineIdentity {
  schemaVersion: 1
  implementationCommit: string
  corpusSchemaVersion: 1
  corpusHashes: Record<string, string>
  parserPreparationSchemaVersion: 1
  runnerSchemaVersion: 1
}

export interface ResearchBaselineFile {
  identity: ResearchBaselineIdentity
  runs?: ResearchRunRow[]
  aggregates: ResearchAggregateRow[]
}

export interface ResearchMetricDelta {
  candidate: number
  baseline: number
  delta: number
  percentDelta: number | null
}

export interface ResearchNullableMetricDelta {
  candidate: number | null
  baseline: number | null
  delta: number | null
  percentDelta: number | null
}

export interface ResearchComparisonDelta {
  caseId: ResearchCaseId
  budgetSeconds: number
  maxFilters: number
  rmseDb: ResearchMetricDelta
  maxAbsDb: ResearchMetricDelta
  targetAchievedRate: ResearchMetricDelta
  timeToRmse050Ms: ResearchNullableMetricDelta
  timeToJointTargetMs: ResearchNullableMetricDelta
  elapsedMs: ResearchMetricDelta
  peakWorkingFilterCount: ResearchMetricDelta
  jointRefinementCount: ResearchMetricDelta
}

export interface ResearchComparison {
  compatible: boolean
  reason?: 'baseline-incompatible'
  deltas: ResearchComparisonDelta[]
}

export interface ResearchWarning {
  type: 'practical-monotonicity'
  caseId: ResearchCaseId
  maxFilters: number
  shorterBudgetSeconds: 15 | 30
  longerBudgetSeconds: 30 | 60
  rmseDb: { shorter: number; longer: number; delta: number; threshold: number }
  maxAbsDb: { shorter: number; longer: number; delta: number; threshold: number }
  triggers: Array<'rmse' | 'maxAbs'>
  message: string
}

export interface ResearchRunMetadata {
  schemaVersion: 1
  candidateCommit: string
  baselineCommit: string
  runnerSchemaVersion: 1
  fixtureHashes: Record<string, string>
  preset: 'quick' | 'full'
  requestedAtIso?: string
  testMode?: boolean
}
