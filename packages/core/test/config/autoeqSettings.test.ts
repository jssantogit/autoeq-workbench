import {
  AUTOEQ_PRODUCT_LIMITS,
  AUTOEQ_TIME_LIMIT_OPTIONS,
  DEFAULT_AUTOEQ_SETTINGS,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  MVP_NUMERIC_POLICY,
  isValidAutoEqSettings,
  isValidAutoEqSettingsV1,
  type AutoEqSettings,
} from '../../src/index.js'
import { describe, expect, it } from 'vitest'

describe('AutoEQ settings', () => {
  it('exposes immutable product limits and defaults aligned with numeric policy', () => {
    expect(AUTOEQ_PRODUCT_LIMITS).toEqual({
      minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
      maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
      minGainDb: -15,
      maxGainDb: 15,
      minQ: 0.1,
      maxQ: 12,
      defaultMaxFilters: 10,
      hardMaxFilters: 64,
    })
    expect(AUTOEQ_TIME_LIMIT_OPTIONS).toEqual([5, 15, 30, 60, 120])
    expect(DEFAULT_AUTOEQ_SETTINGS_V1).toEqual({
      minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
      maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
      minGainDb: -15,
      maxGainDb: 15,
      minQ: 0.1,
      maxQ: 12,
      maxFilters: 10,
    })
    expect(DEFAULT_AUTOEQ_SETTINGS).toEqual({
      ...DEFAULT_AUTOEQ_SETTINGS_V1,
      timeLimitSeconds: 60,
    })
    expect(Object.isFrozen(AUTOEQ_PRODUCT_LIMITS)).toBe(true)
    expect(Object.isFrozen(DEFAULT_AUTOEQ_SETTINGS_V1)).toBe(true)
    expect(Object.isFrozen(DEFAULT_AUTOEQ_SETTINGS)).toBe(true)
  })

  it('accepts effective run settings inside the hard product bounds', () => {
    expect(isValidAutoEqSettings(DEFAULT_AUTOEQ_SETTINGS)).toBe(true)
    expect(isValidAutoEqSettings({
      minFrequencyHz: 30,
      maxFrequencyHz: 19_000,
      minGainDb: -12,
      maxGainDb: 10,
      minQ: 0.5,
      maxQ: 8,
      maxFilters: 6,
      timeLimitSeconds: 30,
    })).toBe(true)
    expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 0 })).toBe(true)
    expect(isValidAutoEqSettings({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: AUTOEQ_PRODUCT_LIMITS.hardMaxFilters,
    })).toBe(true)
  })

  it.each([
    ['non-finite minimum frequency', { minFrequencyHz: Number.NaN }],
    ['non-finite maximum frequency', { maxFrequencyHz: Number.POSITIVE_INFINITY }],
    ['non-finite minimum gain', { minGainDb: Number.NaN }],
    ['non-finite maximum gain', { maxGainDb: Number.NEGATIVE_INFINITY }],
    ['non-finite minimum Q', { minQ: Number.NaN }],
    ['non-finite maximum Q', { maxQ: Number.POSITIVE_INFINITY }],
    ['minimum frequency below product range', { minFrequencyHz: 19 }],
    ['maximum frequency above product range', { maxFrequencyHz: 20_001 }],
    ['equal frequencies', { minFrequencyHz: 20_000 }],
    ['reversed frequencies', { minFrequencyHz: 10_000, maxFrequencyHz: 5_000 }],
    ['minimum gain below product range', { minGainDb: -15.1 }],
    ['maximum gain above product range', { maxGainDb: 15.1 }],
    ['equal gains', { minGainDb: 2, maxGainDb: 2 }],
    ['reversed gains', { minGainDb: 3, maxGainDb: 2 }],
    ['minimum Q below product range', { minQ: 0.09 }],
    ['maximum Q above product range', { maxQ: 12.1 }],
    ['equal Q bounds', { minQ: 12 }],
    ['reversed Q bounds', { minQ: 2, maxQ: 1 }],
    ['negative maxFilters', { maxFilters: -1 }],
    ['maxFilters above hard ceiling', { maxFilters: 65 }],
    ['fractional maxFilters', { maxFilters: 10.5 }],
    ['non-finite maxFilters', { maxFilters: Number.NaN }],
  ])('rejects %s', (_label, update) => {
    expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, ...update })).toBe(false)
  })

  it('accepts only the five approved time limits', () => {
    for (const timeLimitSeconds of [5, 15, 30, 60, 120] as const) {
      expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds })).toBe(true)
    }
    for (const timeLimitSeconds of [0, 10, 29, 31, 121, Number.NaN]) {
      expect(isValidAutoEqSettings({
        ...DEFAULT_AUTOEQ_SETTINGS,
        timeLimitSeconds,
      } as AutoEqSettings)).toBe(false)
    }
  })

  it('validates the frozen historical settings shape separately', () => {
    expect(isValidAutoEqSettingsV1(DEFAULT_AUTOEQ_SETTINGS_V1)).toBe(true)
  })
})
