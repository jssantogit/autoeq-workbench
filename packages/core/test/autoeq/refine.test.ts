import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  optimizeGreedy,
  refineFilters,
  resolveStandardAutoEqConfig,
  type Filter,
} from '../../src/index.js'

function residual(desiredDb: readonly number[], actualDb: readonly number[]): number[] {
  return desiredDb.map((value, index) => value - actualDb[index]!)
}

describe('refineFilters', () => {
  it('reduces complete-cascade MAE toward a known PK response', () => {
    const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
    const frequencies = createEvaluationGrid()
    const desiredDb = cascadeMagnitudeDb([
      {
        id: 'target',
        enabled: true,
        type: 'PK',
        frequencyHz: 1_000,
        gainDb: 6,
        q: 2,
      },
    ], frequencies, config.sampleRateHz)
    const initial: Filter[] = [{
      id: 'candidate-1',
      enabled: true,
      type: 'PK',
      frequencyHz: 900,
      gainDb: 5,
      q: 1.5,
    }]

    const refined = refineFilters({ filters: initial, desiredDb, frequencies, config })
    const initialMae = calculateErrorMetrics(
      residual(desiredDb, cascadeMagnitudeDb(initial, frequencies, config.sampleRateHz)),
      frequencies,
    ).maeDb
    const refinedMae = calculateErrorMetrics(
      residual(desiredDb, cascadeMagnitudeDb(refined, frequencies, config.sampleRateHz)),
      frequencies,
    ).maeDb

    expect(refinedMae).toBeLessThan(initialMae)
  })

  it('keeps every coordinate inside the effective envelope and shelf Q fixed', () => {
    const config = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 800,
      maxFrequencyHz: 1_200,
      minGainDb: -3,
      maxGainDb: 3,
      minQ: 1,
      maxQ: 2,
    })
    const frequencies = createEvaluationGrid().filter(
      (frequencyHz) => frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz,
    )
    const desiredDb = frequencies.map(() => 12)
    const initial: Filter[] = [
      {
        id: 'candidate-1',
        enabled: true,
        type: 'PK',
        frequencyHz: 1_000,
        gainDb: 3,
        q: 2,
      },
      {
        id: 'candidate-2',
        enabled: true,
        type: 'LS',
        frequencyHz: 850,
        gainDb: 2,
        q: 0.7,
      },
      {
        id: 'candidate-3',
        enabled: true,
        type: 'HS',
        frequencyHz: 1_150,
        gainDb: 2,
        q: 0.7,
      },
    ]

    const refined = refineFilters({ filters: initial, desiredDb, frequencies, config })

    for (const filter of refined) {
      expect(filter.frequencyHz).toBeGreaterThanOrEqual(config.minFrequencyHz)
      expect(filter.frequencyHz).toBeLessThanOrEqual(config.maxFrequencyHz)
      expect(filter.gainDb).toBeGreaterThanOrEqual(config.minGainDb)
      expect(filter.gainDb).toBeLessThanOrEqual(config.maxGainDb)
      if (filter.type === 'PK') {
        expect(filter.q).toBeGreaterThanOrEqual(config.minPkQ)
        expect(filter.q).toBeLessThanOrEqual(config.maxPkQ)
      } else {
        expect(filter.q).toBe(config.shelfQ)
      }
    }
  })

  it('improves a multi-filter response by evaluating the complete cascade', () => {
    const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
    const frequencies = createEvaluationGrid()
    const desiredDb = cascadeMagnitudeDb([
      {
        id: 'target-1',
        enabled: true,
        type: 'PK',
        frequencyHz: 500,
        gainDb: 4,
        q: 1,
      },
      {
        id: 'target-2',
        enabled: true,
        type: 'PK',
        frequencyHz: 4_000,
        gainDb: -5,
        q: 2,
      },
    ], frequencies, config.sampleRateHz)
    const initial: Filter[] = [
      {
        id: 'candidate-1',
        enabled: true,
        type: 'PK',
        frequencyHz: 450,
        gainDb: 3,
        q: 0.8,
      },
      {
        id: 'candidate-2',
        enabled: true,
        type: 'PK',
        frequencyHz: 4_500,
        gainDb: -4,
        q: 1.5,
      },
    ]

    const initialMae = calculateErrorMetrics(
      residual(desiredDb, cascadeMagnitudeDb(initial, frequencies, config.sampleRateHz)),
      frequencies,
    ).maeDb
    const refined = refineFilters({ filters: initial, desiredDb, frequencies, config })
    const refinedMae = calculateErrorMetrics(
      residual(desiredDb, cascadeMagnitudeDb(refined, frequencies, config.sampleRateHz)),
      frequencies,
    ).maeDb

    expect(refinedMae).toBeLessThan(initialMae)
  })
})

describe('optimizeGreedy', () => {
  it('adds useful filters without treating maxFilters as a fill target', () => {
    const config = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 5,
    })
    const frequencies = createEvaluationGrid()
    const desiredDb = frequencies.map(() => 3)
    const originalFrequencies = [...frequencies]
    const originalDesiredDb = [...desiredDb]

    const result = optimizeGreedy({ desiredDb, frequencies, config })

    expect(result.filters.length).toBeGreaterThan(0)
    expect(result.filters.length).toBeLessThan(config.maxFilters)
    expect(frequencies).toEqual(originalFrequencies)
    expect(desiredDb).toEqual(originalDesiredDb)
  })

  it('returns no filters when maxFilters is zero', () => {
    const config = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 0,
    })
    const frequencies = createEvaluationGrid()

    const result = optimizeGreedy({
      desiredDb: frequencies.map(() => 6),
      frequencies,
      config,
    })

    expect(result.filters).toEqual([])
    expect(result.acceptedObjectives).toEqual([])
  })

  it('records accepted objectives in monotonic non-increasing order', () => {
    const config = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 5,
    })
    const frequencies = createEvaluationGrid()
    const desiredDb = cascadeMagnitudeDb([
      {
        id: 'target-1',
        enabled: true,
        type: 'PK',
        frequencyHz: 300,
        gainDb: 4,
        q: 1,
      },
      {
        id: 'target-2',
        enabled: true,
        type: 'PK',
        frequencyHz: 3_000,
        gainDb: -5,
        q: 2,
      },
    ], frequencies, config.sampleRateHz)

    const result = optimizeGreedy({ desiredDb, frequencies, config })

    expect(result.acceptedObjectives.length).toBeGreaterThan(1)
    for (let index = 1; index < result.acceptedObjectives.length; index += 1) {
      expect(result.acceptedObjectives[index]).toBeLessThanOrEqual(
        result.acceptedObjectives[index - 1]!,
      )
    }
    expect(result.filters.map(({ id }) => id)).toEqual(
      result.filters.map((_, index) => `candidate-${index + 1}`),
    )
  })

  it('does not add a candidate whose improvement is below the minimum', () => {
    const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
    const frequencies = createEvaluationGrid()
    const desiredDb = frequencies.map(() => 0)
    desiredDb[Math.floor(desiredDb.length / 2)] = config.algorithm.candidateThresholdDb

    const result = optimizeGreedy({ desiredDb, frequencies, config })

    expect(result.filters).toEqual([])
    expect(result.acceptedObjectives).toEqual([])
  })

  it('validates desired and frequency lengths even when maxFilters is zero', () => {
    const config = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 0,
    })

    expect(() => optimizeGreedy({
      desiredDb: [1],
      frequencies: [100, 200],
      config,
    })).toThrow(CoreError)
  })
})
