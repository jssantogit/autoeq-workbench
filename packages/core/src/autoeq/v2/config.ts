import {
  AUTOEQ_PRODUCT_LIMITS,
  isValidAutoEqSettings,
  type AutoEqSettings,
} from '../../config/autoeqSettings.js'
import { MVP_NUMERIC_POLICY } from '../../config/numericPolicy.js'
import { CoreError } from '../../types/error.js'
import type { StandardV2AlgorithmParameters } from '../types.js'

const STANDARD_V2_ALGORITHM: Readonly<StandardV2AlgorithmParameters> = Object.freeze({
  targetRmseDb: 0.25,
  targetMaxAbsDb: 0.75,
  candidateResidualFloorDb: 0.15,
  pkQScaleMultipliers: [0.5, 1, 2],
  maxExactCandidatesPerIteration: 8,
  maxActiveSearchPaths: 3,
  alternateRetentionRatio: 1.02,
  maxJointRefinementCycles: 6,
})

export const STANDARD_V2_CONFIG = Object.freeze({
  algorithmVersion: 'standard-v2' as const,
  algorithm: STANDARD_V2_ALGORITHM,
})

export interface StandardAutoEqV2Config {
  algorithmVersion: 'standard-v2'
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
  workingMaxFilters: number
  algorithm: StandardV2AlgorithmParameters
}

export function calculateWorkingMaxFilters(maxFilters: number): number {
  return maxFilters === 0
    ? 0
    : Math.min(
        AUTOEQ_PRODUCT_LIMITS.hardMaxFilters,
        maxFilters + Math.max(4, Math.ceil(maxFilters / 2)),
      )
}

export function resolveStandardAutoEqV2Config(settings: AutoEqSettings): StandardAutoEqV2Config {
  if (!isValidAutoEqSettings(settings)) {
    throw new CoreError('validation', 'Invalid AutoEQ settings')
  }

  return {
    algorithmVersion: STANDARD_V2_CONFIG.algorithmVersion,
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
    workingMaxFilters: calculateWorkingMaxFilters(settings.maxFilters),
    algorithm: { ...STANDARD_V2_CONFIG.algorithm },
  }
}
