import { describe, expect, it } from 'vitest'

import {
  CoreError,
  biquadCoefficients,
  biquadMagnitudeDb,
  type Filter,
} from '../src/index.js'
import { biquadCoefficientsWithFrequencyTrig } from '../src/dsp/biquad.js'

const sampleRateHz = 192_000

function filter(overrides: Partial<Filter> = {}): Filter {
  return {
    id: 'filter-1',
    enabled: true,
    type: 'PK',
    frequencyHz: 1000,
    gainDb: 6,
    q: 0.707,
    ...overrides,
  }
}

function expectValidationError(operation: () => unknown, message: RegExp) {
  expect(operation).toThrow(CoreError)
  expect(operation).toThrow(message)
  try {
    operation()
  } catch (error) {
    expect(error).toMatchObject({ category: 'validation' })
  }
}

describe('biquadCoefficients', () => {
  it.each(['PK', 'LS', 'HS'] as const)('normalizes finite %s coefficients', (type) => {
    const coefficients = biquadCoefficients(filter({ type }), sampleRateHz)

    expect(coefficients.a0).toBe(1)
    expect(Object.values(coefficients).every(Number.isFinite)).toBe(true)
  })

  it.each([
    ['PK gain trial', filter({ type: 'PK', frequencyHz: 1234.5, gainDb: -5.25, q: 3.7 })],
    ['PK Q trial', filter({ type: 'PK', frequencyHz: 7452.944, gainDb: 8.4, q: 7.25 })],
    ['low shelf', filter({ type: 'LS', frequencyHz: 87.25, gainDb: 4.75, q: 0.7 })],
    ['high shelf', filter({ type: 'HS', frequencyHz: 12_345.67, gainDb: -6.5, q: 0.7 })],
  ] as const)('reuses precomputed center-frequency trig bit-exactly for %s', (_name, candidate) => {
    const w0 = (2 * Math.PI * candidate.frequencyHz) / sampleRateHz
    expect(
      biquadCoefficientsWithFrequencyTrig(
        candidate,
        sampleRateHz,
        Math.cos(w0),
        Math.sin(w0),
      ),
    ).toEqual(biquadCoefficients(candidate, sampleRateHz))
  })

  it.each([
    ['non-object filter', null as unknown as Filter, sampleRateHz, /filter/i],
    ['unsupported type', filter({ type: 'LP' as Filter['type'] }), sampleRateHz, /type/i],
    ['zero center frequency', filter({ frequencyHz: 0 }), sampleRateHz, /frequency/i],
    ['center frequency at Nyquist', filter({ frequencyHz: sampleRateHz / 2 }), sampleRateHz, /nyquist|frequency/i],
    ['non-finite gain', filter({ gainDb: Number.NaN }), sampleRateHz, /gain/i],
    ['zero Q', filter({ q: 0 }), sampleRateHz, /q/i],
    ['non-finite Q', filter({ q: Number.POSITIVE_INFINITY }), sampleRateHz, /q/i],
    ['zero sample rate', filter(), 0, /sample rate/i],
    ['non-finite sample rate', filter(), Number.NaN, /sample rate/i],
  ])('rejects %s', (_name, invalidFilter, invalidSampleRate, message) => {
    expectValidationError(
      () => biquadCoefficients(invalidFilter, invalidSampleRate),
      message,
    )
  })
})

describe('biquadMagnitudeDb', () => {
  it.each(['PK', 'LS', 'HS'] as const)('is magnitude-neutral for a 0 dB %s', (type) => {
    const magnitude = biquadMagnitudeDb(
      filter({ type, gainDb: 0 }),
      [20, 1000, 20_000],
      48_000,
    )

    magnitude.forEach((value) => expect(value).toBeCloseTo(0, 10))
  })

  it('matches PK gain at the center frequency', () => {
    expect(biquadMagnitudeDb(filter({ q: 2 }), [1000], sampleRateHz)[0]).toBeCloseTo(6, 6)
  })

  it('approaches the low-shelf gain below Fc and 0 dB above Fc', () => {
    const [low, high] = biquadMagnitudeDb(filter({ type: 'LS' }), [10, 40_000], sampleRateHz)

    expect(low).toBeCloseTo(6, 2)
    expect(high).toBeCloseTo(0, 2)
  })

  it('approaches 0 dB below Fc and the high-shelf gain above Fc', () => {
    const [low, high] = biquadMagnitudeDb(filter({ type: 'HS' }), [10, 40_000], sampleRateHz)

    expect(low).toBeCloseTo(0, 2)
    expect(high).toBeCloseTo(6, 2)
  })

  it('returns the physical response even when the filter is disabled', () => {
    const enabled = biquadMagnitudeDb(filter(), [1000], sampleRateHz)
    const disabled = biquadMagnitudeDb(filter({ enabled: false }), [1000], sampleRateHz)

    expect(disabled).toEqual(enabled)
    expect(disabled[0]).toBeCloseTo(6, 6)
  })

  it('accepts an empty frequency input', () => {
    expect(biquadMagnitudeDb(filter(), [], sampleRateHz)).toEqual([])
  })

  it('rejects a non-array frequency input', () => {
    expectValidationError(
      () => biquadMagnitudeDb(filter(), null as unknown as number[], sampleRateHz),
      /frequencies|array/i,
    )
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['non-finite', Number.NaN],
    ['Nyquist', sampleRateHz / 2],
    ['above Nyquist', sampleRateHz],
  ])('rejects a %s response frequency', (_name, frequencyHz) => {
    expectValidationError(
      () => biquadMagnitudeDb(filter(), [frequencyHz], sampleRateHz),
      /frequency|nyquist/i,
    )
  })
})
