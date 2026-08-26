import type { AutoEqSettings } from '../config/autoeqSettings.js'
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

export interface RunManifest {
  schemaVersion: 1
  algorithmVersion: 'standard-v1'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettings
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardAlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
}

export interface AutoEqResult {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifest
}

export interface StandardAutoEqInput {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettings
}
