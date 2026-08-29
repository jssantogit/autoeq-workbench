import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  MVP_NUMERIC_POLICY,
  STANDARD_V1_CONFIG,
  resolveStandardAutoEqConfig,
} from '../../src/index.js'

describe('resolveStandardAutoEqConfig', () => {
  it('resolves product defaults with the approved Standard v1 algorithm', () => {
    expect(resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS_V1)).toEqual({
      algorithmVersion: 'standard-v1',
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
      shelfQ: 0.7,
      minFrequencyHz: 20,
      maxFrequencyHz: 20_000,
      minGainDb: -15,
      maxGainDb: 15,
      minPkQ: 0.1,
      maxPkQ: 12,
      maxFilters: 10,
      algorithm: STANDARD_V1_CONFIG.algorithm,
    })
    expect(STANDARD_V1_CONFIG).toEqual({
      algorithmVersion: 'standard-v1',
      algorithm: {
        deadbandDb: 0.1,
        huberDeltaDb: 1,
        candidateThresholdDb: 0.5,
        minObjectiveImprovement: 0.005,
        pruneTolerance: 0.002,
        filterCountWeight: 0.01,
        highQWeight: 0.002,
        gainWeight: 0.0005,
        cancellationWeight: 0.01,
      },
    })
  })

  it('preserves a narrower valid effective envelope exactly', () => {
    const settings = {
      minFrequencyHz: 40,
      maxFrequencyHz: 16_000,
      minGainDb: -9,
      maxGainDb: 8,
      minQ: 0.4,
      maxQ: 7,
      maxFilters: 5,
    }

    expect(resolveStandardAutoEqConfig(settings)).toMatchObject({
      minFrequencyHz: 40,
      maxFrequencyHz: 16_000,
      minGainDb: -9,
      maxGainDb: 8,
      minPkQ: 0.4,
      maxPkQ: 7,
      maxFilters: 5,
    })
  })

  it.each([0, 64])('accepts maxFilters=%i', (maxFilters) => {
    expect(resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS_V1,
      maxFilters,
    }).maxFilters).toBe(maxFilters)
  })

  it.each([
    { minFrequencyHz: 19 },
    { maxFrequencyHz: 20_001 },
    { minGainDb: -16 },
    { maxGainDb: 16 },
    { minQ: 0.09 },
    { maxQ: 12.1 },
    { maxFilters: -1 },
    { maxFilters: 65 },
  ])('rejects an invalid effective envelope: %o', (update) => {
    try {
      resolveStandardAutoEqConfig({ ...DEFAULT_AUTOEQ_SETTINGS_V1, ...update })
      throw new Error('Expected config resolution to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError)
      expect(error).toMatchObject({ category: 'validation' })
    }
  })
})
