import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  POWERAMP_MANUAL_ENTRY_POLICY,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  discreteRefine,
  quantizeFilters,
  resolveStandardAutoEqConfig,
  type Filter,
} from '../../src/index.js'
import { evaluateCascadeObjective } from '../../src/autoeq/refine.js'

const config = resolveStandardAutoEqConfig({
  ...DEFAULT_AUTOEQ_SETTINGS,
  minFrequencyHz: 100,
  maxFrequencyHz: 10_000,
  minGainDb: -6,
  maxGainDb: 6,
  minQ: 0.5,
  maxQ: 8,
})

function filter(update: Partial<Filter> = {}): Filter {
  return {
    id: 'candidate-1',
    enabled: true,
    type: 'PK',
    frequencyHz: 1_000,
    gainDb: 3,
    q: 2,
    ...update,
  }
}

describe('quantizeFilters', () => {
  it('publishes the approved manual-entry precision policy', () => {
    expect(POWERAMP_MANUAL_ENTRY_POLICY).toEqual({
      frequencyStepHz: 1,
      gainStepDb: 0.1,
      qStep: 0.01,
      preampStepDb: 0.1,
    })
  })

  it('projects out-of-envelope values to representable boundary points', () => {
    const [result] = quantizeFilters([
      filter({ frequencyHz: 10_000.6, gainDb: 6.06, q: 8.006 }),
    ], config)

    expect(result).toMatchObject({ frequencyHz: 10_000, gainDb: 6, q: 8 })
  })

  it('rounds to 1 Hz, 0.1 dB, and 0.01 Q', () => {
    const [result] = quantizeFilters([
      filter({ frequencyHz: 1_000.6, gainDb: 2.26, q: 1.236 }),
    ], config)

    expect(result).toMatchObject({ frequencyHz: 1_001, gainDb: 2.3, q: 1.24 })
  })

  it('keeps shelf Q fixed at 0.7', () => {
    const result = quantizeFilters([
      filter({ id: 'low', type: 'LS', q: 1.23 }),
      filter({ id: 'high', type: 'HS', q: 4.56 }),
    ], config)

    expect(result.map(({ q }) => q)).toEqual([0.7, 0.7])
  })

  it('normalizes decimal artifacts and negative zero', () => {
    const [result] = quantizeFilters([
      filter({ gainDb: -0.000_1, q: 1.005 }),
    ], config)

    expect(result!.gainDb).toBe(0)
    expect(Object.is(result!.gainDb, -0)).toBe(false)
    expect(result!.q).toBe(1)
  })

  it('uses lower frequency, lower gain magnitude, and lower Q for exact projection ties', () => {
    const [result] = quantizeFilters([
      filter({ frequencyHz: 1_000.5, gainDb: 0.05, q: 1.005 }),
    ], config)

    expect(result).toMatchObject({ frequencyHz: 1_000, gainDb: 0, q: 1 })
  })

  it('omits a PK when its Q envelope has no representable grid point', () => {
    const noRepresentableQ = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minQ: 0.101,
      maxQ: 0.109,
    })

    expect(quantizeFilters([filter({ q: 0.105 })], noRepresentableQ)).toEqual([])
  })

  it('projects PK Q to the nearest representable point inside a decimal envelope', () => {
    const oneRepresentableQ = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minQ: 0.104,
      maxQ: 0.116,
    })

    expect(quantizeFilters([filter({ q: 0.106 })], oneRepresentableQ)[0]!.q).toBe(0.11)
  })

  it('omits a filter when a decimal frequency envelope contains no integer Hz', () => {
    const noRepresentableFrequency = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 1_000.1,
      maxFrequencyHz: 1_000.9,
    })

    expect(quantizeFilters([
      filter({ frequencyHz: 1_000.5 }),
    ], noRepresentableFrequency)).toEqual([])
  })

  it('omits a filter when a decimal gain envelope contains no 0.1 dB point', () => {
    const noRepresentableGain = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minGainDb: 0.01,
      maxGainDb: 0.09,
    })

    expect(quantizeFilters([filter({ gainDb: 0.05 })], noRepresentableGain)).toEqual([])
  })

  it('uses the only grid point inside a decimal envelope', () => {
    const oneRepresentableFrequency = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 1_000.1,
      maxFrequencyHz: 1_001.1,
    })

    expect(quantizeFilters([
      filter({ frequencyHz: 1_000.2 }),
    ], oneRepresentableFrequency)[0]!.frequencyHz).toBe(1_001)
  })

  it('keeps shelves at Q 0.7 independently of an unrepresentable PK-Q envelope', () => {
    const noRepresentablePkQ = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minQ: 0.101,
      maxQ: 0.109,
    })
    const result = quantizeFilters([
      filter({ id: 'pk', q: 0.105 }),
      filter({ id: 'low', type: 'LS', q: 5 }),
      filter({ id: 'high', type: 'HS', q: 5 }),
    ], noRepresentablePkQ)

    expect(result.map(({ id, q }) => ({ id, q }))).toEqual([
      { id: 'low', q: 0.7 },
      { id: 'high', q: 0.7 },
    ])
  })
})

describe('discreteRefine', () => {
  it('never worsens the raw quantized starting objective', () => {
    const defaultConfig = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
    const frequencies = createEvaluationGrid()
    const desiredDb = cascadeMagnitudeDb([
      filter({ id: 'target', frequencyHz: 1_000, gainDb: 6, q: 2 }),
    ], frequencies, defaultConfig.sampleRateHz)
    const quantized = quantizeFilters([
      filter({ frequencyHz: 1_001, gainDb: 5.9, q: 1.99 }),
    ], defaultConfig)
    const initialObjective = evaluateCascadeObjective(
      quantized,
      desiredDb,
      frequencies,
      defaultConfig,
    )

    const refined = discreteRefine({
      filters: quantized,
      desiredDb,
      frequencies,
      config: defaultConfig,
    })

    expect(evaluateCascadeObjective(
      refined,
      desiredDb,
      frequencies,
      defaultConfig,
    )).toBeLessThanOrEqual(initialObjective)
  })

  it('stays on the manual-entry grid and inside effective bounds', () => {
    const frequencies = createEvaluationGrid().filter(
      (frequencyHz) => frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz,
    )
    const initial = quantizeFilters([
      filter({ frequencyHz: 100, gainDb: 6, q: 8 }),
      filter({ id: 'shelf', type: 'LS', frequencyHz: 10_000, gainDb: -6, q: 0.7 }),
    ], config)

    const refined = discreteRefine({
      filters: initial,
      desiredDb: frequencies.map(() => 12),
      frequencies,
      config,
    })

    for (const result of refined) {
      expect(result.frequencyHz).toBeGreaterThanOrEqual(config.minFrequencyHz)
      expect(result.frequencyHz).toBeLessThanOrEqual(config.maxFrequencyHz)
      expect(result.frequencyHz % POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz).toBe(0)
      expect(result.gainDb).toBeGreaterThanOrEqual(config.minGainDb)
      expect(result.gainDb).toBeLessThanOrEqual(config.maxGainDb)
      expect(Math.abs(result.gainDb * 10 - Math.round(result.gainDb * 10))).toBeLessThan(1e-9)
      if (result.type === 'PK') {
        expect(result.q).toBeGreaterThanOrEqual(config.minPkQ)
        expect(result.q).toBeLessThanOrEqual(config.maxPkQ)
        expect(Math.abs(result.q * 100 - Math.round(result.q * 100))).toBeLessThan(1e-9)
      } else {
        expect(result.q).toBe(config.shelfQ)
      }
    }
  })

  it('never lets current or plus/minus one step escape decimal envelopes', () => {
    const decimalConfig = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 1_000.2,
      maxFrequencyHz: 1_002.2,
      minGainDb: 0.04,
      maxGainDb: 0.24,
      minQ: 0.104,
      maxQ: 0.126,
    })
    const frequencies = createEvaluationGrid().filter(
      (frequencyHz) =>
        frequencyHz >= decimalConfig.minFrequencyHz &&
        frequencyHz <= decimalConfig.maxFrequencyHz,
    )
    const projected = quantizeFilters([
      filter({ frequencyHz: 1_002.2, gainDb: 0.24, q: 0.126 }),
    ], decimalConfig)

    const refined = discreteRefine({
      filters: projected,
      desiredDb: frequencies.map(() => 12),
      frequencies,
      config: decimalConfig,
    })

    expect(refined).toHaveLength(1)
    expect(refined[0]!.frequencyHz).toBeGreaterThanOrEqual(decimalConfig.minFrequencyHz)
    expect(refined[0]!.frequencyHz).toBeLessThanOrEqual(decimalConfig.maxFrequencyHz)
    expect(refined[0]!.gainDb).toBeGreaterThanOrEqual(decimalConfig.minGainDb)
    expect(refined[0]!.gainDb).toBeLessThanOrEqual(decimalConfig.maxGainDb)
    expect(refined[0]!.q).toBeGreaterThanOrEqual(decimalConfig.minPkQ)
    expect(refined[0]!.q).toBeLessThanOrEqual(decimalConfig.maxPkQ)
  })

  it('rejects empty, mismatched, or non-finite objective arrays', () => {
    expect(() => discreteRefine({
      filters: [filter()],
      desiredDb: [1],
      frequencies: [100, 200],
      config,
    })).toThrow(CoreError)
    expect(() => discreteRefine({
      filters: [filter()],
      desiredDb: [],
      frequencies: [],
      config,
    })).toThrow(CoreError)
    expect(() => discreteRefine({
      filters: [filter()],
      desiredDb: [Number.NaN],
      frequencies: [1_000],
      config,
    })).toThrow(CoreError)
  })

  it('starts only from filters that survive constrained projection', () => {
    const noRepresentablePkQ = resolveStandardAutoEqConfig({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minQ: 0.101,
      maxQ: 0.109,
    })
    const frequencies = createEvaluationGrid()

    const result = discreteRefine({
      filters: [
        filter({ id: 'pk', q: 0.105 }),
        filter({ id: 'shelf', type: 'LS', frequencyHz: 105, q: 5 }),
      ],
      desiredDb: frequencies.map(() => 0),
      frequencies,
      config: noRepresentablePkQ,
    })

    expect(result.map(({ id, q }) => ({ id, q }))).toEqual([{ id: 'shelf', q: 0.7 }])
  })
})
