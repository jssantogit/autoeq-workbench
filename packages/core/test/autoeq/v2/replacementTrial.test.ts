import { describe, expect, it } from 'vitest'

import { calculateErrorMetrics, evaluateV2Solution, type Filter } from '../../../src/index.js'
import { replaceV2ResponseCacheFilter } from '../../../src/autoeq/v2/responseCache.js'
import {
  evaluateV2ReplacementTrial,
  evaluateV2ReplacementTrialSinglePass,
  materializeV2ReplacementTrial,
} from '../../../src/autoeq/v2/replacementTrial.js'

const frequencies = [40, 100, 1_000, 5_000, 15_000]
const desiredDb = [1, -2, 3, -1, 0.5]
const sampleRateHz = 48_000
const filters: Filter[] = [
  { id: 'low', enabled: true, type: 'LS', frequencyHz: 100, gainDb: 3, q: 0.7 },
  { id: 'mid', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -4, q: 2 },
  { id: 'high', enabled: true, type: 'HS', frequencyHz: 10_000, gainDb: 2, q: 0.7 },
]

describe('Standard v2 replacement trial view', () => {
  it('matches the current materialized replacement metrics and arrays exactly', () => {
    const solution = evaluateV2Solution(filters, desiredDb, frequencies, sampleRateHz)
    const replacement: Filter = {
      ...solution.filters[1]!,
      frequencyHz: 1_250,
      gainDb: -3.5,
      q: 1.8,
    }
    const expectedFilters = solution.filters.map((filter, index) =>
      index === 1 ? replacement : filter)
    const expectedCache = replaceV2ResponseCacheFilter(
      solution.responseCache,
      1,
      replacement,
      frequencies,
      sampleRateHz,
    )
    const expectedResidual = desiredDb.map((desired, index) =>
      desired - expectedCache.cascadeDb[index]!)
    const expectedMetrics = calculateErrorMetrics(expectedResidual, frequencies)

    const trial = evaluateV2ReplacementTrial(
      solution,
      1,
      replacement,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    expect(trial.metrics).toEqual(expectedMetrics)

    const materialized = materializeV2ReplacementTrial(
      solution,
      trial,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    expect(materialized.filters).toEqual(expectedFilters)
    expect(materialized.responseCache.cascadeDb).toEqual(expectedCache.cascadeDb)
    expect(materialized.residualDb).toEqual(expectedResidual)
    expect(materialized.metrics).toEqual(expectedMetrics)
    expect(materialized.cancellationAudit).toBe(solution.cancellationAudit)
  })

  it('single-pass evaluation matches the current evaluator exactly for LS, PK, and HS trials', () => {
    const solution = evaluateV2Solution(filters, desiredDb, frequencies, sampleRateHz)
    const replacements: Array<{ index: number; filter: Filter }> = [
      {
        index: 0,
        filter: { ...solution.filters[0]!, frequencyHz: 125, gainDb: 2.5, q: 0.8 },
      },
      {
        index: 1,
        filter: { ...solution.filters[1]!, frequencyHz: 1_250, gainDb: -3.5, q: 1.8 },
      },
      {
        index: 2,
        filter: { ...solution.filters[2]!, frequencyHz: 9_000, gainDb: 1.5, q: 0.8 },
      },
    ]

    for (const replacement of replacements) {
      const expected = evaluateV2ReplacementTrial(
        solution,
        replacement.index,
        replacement.filter,
        desiredDb,
        frequencies,
        sampleRateHz,
      )
      const responseBuffer = new Array<number>(frequencies.length)
      const actual = evaluateV2ReplacementTrialSinglePass(
        solution,
        replacement.index,
        replacement.filter,
        desiredDb,
        frequencies,
        sampleRateHz,
        responseBuffer,
      )

      expect(actual).toEqual(expected)
      expect(actual.responseDb).toBe(responseBuffer)
    }
  })

  it('can reuse one response buffer while materialized winners retain an owned snapshot', () => {
    const solution = evaluateV2Solution(filters, desiredDb, frequencies, sampleRateHz)
    const replacement: Filter = {
      ...solution.filters[1]!,
      frequencyHz: 1_250,
      gainDb: -3.5,
      q: 1.8,
    }
    const responseBuffer = frequencies.map(() => Number.NaN)
    const trial = evaluateV2ReplacementTrial(
      solution,
      1,
      replacement,
      desiredDb,
      frequencies,
      sampleRateHz,
      responseBuffer,
    )
    expect(trial.responseDb).toBe(responseBuffer)

    const materialized = materializeV2ReplacementTrial(
      solution,
      trial,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const ownedResponse = materialized.responseCache.filterResponsesDb[1]!
    const snapshot = [...ownedResponse]
    expect(ownedResponse).not.toBe(responseBuffer)

    responseBuffer.fill(123)
    expect(materialized.responseCache.filterResponsesDb[1]).toEqual(snapshot)
  })
})
