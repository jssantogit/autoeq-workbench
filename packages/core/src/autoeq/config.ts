import {
  isValidAutoEqSettingsV1,
  type AutoEqSettingsV1,
} from '../config/autoeqSettings.js'
import { MVP_NUMERIC_POLICY } from '../config/numericPolicy.js'
import { CoreError } from '../types/error.js'
import type { AutoEqConfig, StandardAlgorithmParameters } from './types.js'

const STANDARD_V1_ALGORITHM: Readonly<StandardAlgorithmParameters> = Object.freeze({
  deadbandDb: 0.1,
  huberDeltaDb: 1,
  candidateThresholdDb: 0.5,
  minObjectiveImprovement: 0.005,
  pruneTolerance: 0.002,
  filterCountWeight: 0.01,
  highQWeight: 0.002,
  gainWeight: 0.0005,
  cancellationWeight: 0.01,
})

export const STANDARD_V1_CONFIG = Object.freeze({
  algorithmVersion: 'standard-v1' as const,
  algorithm: STANDARD_V1_ALGORITHM,
})

export function resolveStandardAutoEqConfig(settings: AutoEqSettingsV1): AutoEqConfig {
  if (!isValidAutoEqSettingsV1(settings)) {
    throw new CoreError('validation', 'Invalid AutoEQ settings')
  }

  return {
    algorithmVersion: STANDARD_V1_CONFIG.algorithmVersion,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
    shelfQ: 0.7,
    minFrequencyHz: settings.minFrequencyHz,
    maxFrequencyHz: settings.maxFrequencyHz,
    minGainDb: settings.minGainDb,
    maxGainDb: settings.maxGainDb,
    minPkQ: settings.minQ,
    maxPkQ: settings.maxQ,
    maxFilters: settings.maxFilters,
    algorithm: { ...STANDARD_V1_CONFIG.algorithm },
  }
}
