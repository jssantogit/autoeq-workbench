import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  findResidualRegions,
  generateCandidates,
  resolveStandardAutoEqConfig,
} from '../../src/index.js'

const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)

describe('findResidualRegions', () => {
  it('closes a region at a sub-threshold sample', () => {
    expect(findResidualRegions(
      [100, 200, 400],
      [1, 0.49, 1],
      0.5,
    )).toMatchObject([
      { startIndex: 0, endIndex: 0, sign: 1 },
      { startIndex: 2, endIndex: 2, sign: 1 },
    ])
  })

  it('splits contiguous material residuals when their sign changes', () => {
    expect(findResidualRegions(
      [100, 200, 400, 800],
      [1, 1, -1, -1],
      0.5,
    )).toEqual([
      {
        startIndex: 0,
        endIndex: 1,
        startHz: 100,
        endHz: 200,
        sign: 1,
        regionOctaves: 1,
      },
      {
        startIndex: 2,
        endIndex: 3,
        startHz: 400,
        endHz: 800,
        sign: -1,
        regionOctaves: 1,
      },
    ])
  })

  it.each([
    [[], []],
    [[100], [1, 2]],
    [[0], [1]],
    [[100, 100], [1, 2]],
    [[200, 100], [1, 2]],
    [[100, Number.NaN], [1, 2]],
    [[100, 200], [1, Number.POSITIVE_INFINITY]],
  ])('rejects invalid frequency/residual arrays', (frequencies, residualDb) => {
    expect(() => findResidualRegions(frequencies, residualDb, 0.5)).toThrow(CoreError)
  })

  it.each([0, -0.5, Number.NaN])('rejects an invalid threshold', (thresholdDb) => {
    expect(() => findResidualRegions([100], [1], thresholdDb)).toThrow(CoreError)
  })
})

describe('generateCandidates', () => {
  it('creates a PK at the geometric center with interpolated gain and width Q', () => {
    const candidates = generateCandidates({
      frequencies: [500, 1_000, 2_000],
      residualDb: [2, 4, 2],
      config,
    })
    const peak = candidates.find((candidate) => candidate.type === 'PK')

    expect(peak).toMatchObject({
      enabled: true,
      frequencyHz: 1_000,
      gainDb: 4,
      q: 2 / 3,
      regionOctaves: 2,
    })
  })

  it('clamps PK frequency, gain and Q to the effective envelope', () => {
    const narrow = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 900,
      maxFrequencyHz: 1_100,
      minGainDb: -3,
      maxGainDb: 3,
      minQ: 1,
      maxQ: 4,
    })
    const peak = generateCandidates({
      frequencies: [800, 900, 1_000, 1_100, 1_200],
      residualDb: [15, 15, 15, 15, 15],
      config: narrow,
    }).find((candidate) => candidate.type === 'PK')

    expect(peak).toMatchObject({ frequencyHz: expect.any(Number), gainDb: 3, q: 4 })
    expect(peak!.frequencyHz).toBeGreaterThanOrEqual(900)
    expect(peak!.frequencyHz).toBeLessThanOrEqual(1_100)
  })

  it('excludes out-of-envelope samples from PK parameters', () => {
    const narrow = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 900,
      maxFrequencyHz: 1_100,
    })
    const peak = generateCandidates({
      frequencies: [100, 900, 1_000, 1_100, 10_000],
      residualDb: [15, 2, 4, 2, 15],
      config: narrow,
    }).find((candidate) => candidate.type === 'PK')

    expect(peak).toMatchObject({
      frequencyHz: Math.sqrt(900 * 1_100),
      regionOctaves: Math.log2(1_100 / 900),
    })
  })

  it('creates an LS only from broad 20-200 Hz evidence', () => {
    const low = generateCandidates({
      frequencies: [20, 40, 80, 120, 160, 200, 400],
      residualDb: [2, 2, 2, 2, -0.2, 2, -10],
      config,
    }).find((candidate) => candidate.type === 'LS')

    expect(low).toMatchObject({ frequencyHz: 105, gainDb: 2, q: 0.7 })
  })

  it('creates an HS only from broad 8-20 kHz evidence', () => {
    const high = generateCandidates({
      frequencies: [4_000, 8_000, 10_000, 12_000, 16_000, 20_000],
      residualDb: [10, -3, -3, -3, 0.1, -3],
      config,
    }).find((candidate) => candidate.type === 'HS')

    expect(high).toMatchObject({ frequencyHz: 10_000, gainDb: -3, q: 0.7 })
  })

  it('rejects shelf evidence below 70% sign agreement', () => {
    const candidates = generateCandidates({
      frequencies: [20, 40, 80, 120, 160, 200],
      residualDb: [2, 2, 2, 2, -2, -2],
      config,
    })

    expect(candidates.some((candidate) => candidate.type === 'LS')).toBe(false)
  })

  it('rejects shelf evidence below the median magnitude threshold', () => {
    const candidates = generateCandidates({
      frequencies: [20, 40, 80, 120, 160, 200],
      residualDb: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      config,
    })

    expect(candidates.some((candidate) => candidate.type === 'LS')).toBe(false)
  })

  it('does not use excluded frequencies as shelf evidence', () => {
    const highOnly = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 10_000,
      maxFrequencyHz: 20_000,
    })
    const candidates = generateCandidates({
      frequencies: [8_000, 9_000, 10_000, 12_000, 16_000, 20_000],
      residualDb: [4, 4, -4, -4, 4, 4],
      config: highOnly,
    })

    expect(candidates.some((candidate) => candidate.type === 'HS')).toBe(false)
    expect(candidates.every((candidate) => candidate.frequencyHz >= 10_000)).toBe(true)
  })

  it('sorts stably, deduplicates same-type near matches, and assigns returned IDs', () => {
    const candidates = generateCandidates({
      frequencies: [1_000, 1_002, 1_004, 2_000, 4_000],
      residualDb: [1, 0, 2, -3, -3],
      config,
    })

    expect(candidates.map(({ id }) => id)).toEqual(
      candidates.map((_, index) => `candidate-${index + 1}`),
    )
    expect(candidates.filter(({ type }) => type === 'PK')).toHaveLength(2)
    expect(candidates[0]).toMatchObject({ type: 'PK', gainDb: -3 })
    expect(candidates[1]).toMatchObject({ type: 'PK', gainDb: 2 })
  })
})
