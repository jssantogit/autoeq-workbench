import type { AutoEqSettings, AutoEqSettingsV1 } from '../config/autoeqSettings.js'
import type { ErrorMetrics } from '../metrics/errorMetrics.js'
import type { Curve, Normalization } from '../types/curve.js'
import type { Filter } from '../types/filter.js'

export interface StandardAlgorithmParameters {
  deadbandDb: number
  huberDeltaDb: number
  candidateThresholdDb: number
  minObjectiveImprovement: number
  pruneTolerance: number
  filterCountWeight: number
  highQWeight: number
  gainWeight: number
  cancellationWeight: number
}

export interface AutoEqConfig {
  algorithmVersion: 'standard-v1'
  sampleRateHz: number
  fitPointsPerOctave: number
  shelfQ: 0.7
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minPkQ: number
  maxPkQ: number
  maxFilters: number
  algorithm: StandardAlgorithmParameters
}

export interface CancellationPair {
  filterAId: string
  filterBId: string
  score: number
  severity: 'moderate' | 'strong'
}

export interface CancellationAudit {
  pairs: CancellationPair[]
  totalScore: number
}

export interface StandardV2AlgorithmParameters {
  targetRmseDb: 0.25
  targetMaxAbsDb: 0.75
  candidateResidualFloorDb: 0.15
  pkQScaleMultipliers: readonly [0.5, 1, 2]
  maxExactCandidatesPerIteration: 8
  maxActiveSearchPaths: 3
  alternateRetentionRatio: 1.02
  maxJointRefinementCycles: 6
}

export type StandardV2TerminationReason = 'target-reached' | 'converged' | 'time-limit'

export interface RunManifestV1 {
  schemaVersion: 2
  algorithmVersion: 'standard-v1'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettingsV1
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardAlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
}

export interface RunManifestV2 {
  schemaVersion: 3
  algorithmVersion: 'standard-v2'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettings
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardV2AlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  terminationReason: StandardV2TerminationReason
  targetAchieved: boolean
}

export interface AutoEqResultV1 {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifestV1
}

export interface AutoEqResultV2 {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifestV2
}

export interface StandardAutoEqInputV1 {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettingsV1
}

export interface StandardAutoEqInputV2 {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettings
}

export type RunManifest = RunManifestV1 | RunManifestV2
export type AutoEqResult = AutoEqResultV1 | AutoEqResultV2
export type StandardAutoEqInput = StandardAutoEqInputV1
