import {
  DEFAULT_AUTOEQ_SETTINGS,
  MVP_NUMERIC_POLICY,
  isValidAutoEqSettings,
} from '../../src/index.js'
import { describe, expect, it } from 'vitest'

describe('AutoEQ settings', () => {
  it('exposes immutable defaults aligned with the numeric policy and approved bounds', () => {
    expect(DEFAULT_AUTOEQ_SETTINGS).toEqual({
      minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
      maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
      minGainDb: -15,
      maxGainDb: 15,
      minQ: 0.1,
      maxQ: 12,
    })
    expect(Object.isFrozen(DEFAULT_AUTOEQ_SETTINGS)).toBe(true)
    expect(Reflect.set(DEFAULT_AUTOEQ_SETTINGS, 'minQ', 1)).toBe(false)
    expect(DEFAULT_AUTOEQ_SETTINGS.minQ).toBe(0.1)
  })

  it('accepts finite settings satisfying exactly the requested invariants', () => {
    expect(isValidAutoEqSettings(DEFAULT_AUTOEQ_SETTINGS)).toBe(true)
    expect(isValidAutoEqSettings({
      minFrequencyHz: 30,
      maxFrequencyHz: 19_000,
      minGainDb: -20,
      maxGainDb: 20,
      minQ: 0.01,
      maxQ: 20,
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
    ['equal gains', { minGainDb: 2, maxGainDb: 2 }],
    ['reversed gains', { minGainDb: 3, maxGainDb: 2 }],
    ['non-positive minimum Q', { minQ: 0 }],
    ['equal Q bounds', { minQ: 12 }],
    ['reversed Q bounds', { minQ: 2, maxQ: 1 }],
  ])('rejects %s', (_label, update) => {
    expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, ...update })).toBe(false)
  })
})
