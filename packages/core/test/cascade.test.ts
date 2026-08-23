import { describe, expect, it } from 'vitest'

import { CoreError, cascadeMagnitudeDb, type Filter } from '../src/index.js'

const sampleRateHz = 48_000

function peak(id: string, enabled = true): Filter {
  return {
    id,
    enabled,
    type: 'PK',
    frequencyHz: 1000,
    gainDb: 3,
    q: 1,
  }
}

describe('cascadeMagnitudeDb', () => {
  it('sums enabled filter magnitudes element by element', () => {
    const magnitude = cascadeMagnitudeDb([peak('1'), peak('2')], [100, 1000, 10_000], sampleRateHz)

    expect(magnitude[0]).toBeGreaterThan(0)
    expect(magnitude[1]).toBeCloseTo(6, 6)
    expect(magnitude[2]).toBeGreaterThan(0)
  })

  it('excludes disabled filters at the cascade boundary', () => {
    expect(
      cascadeMagnitudeDb([peak('1'), peak('2', false)], [1000], sampleRateHz)[0],
    ).toBeCloseTo(3, 6)
  })

  it('returns a zero response for no filters', () => {
    expect(cascadeMagnitudeDb([], [20, 1000, 20_000], sampleRateHz)).toEqual([0, 0, 0])
  })

  it('returns an empty response for no frequencies', () => {
    expect(cascadeMagnitudeDb([peak('1')], [], sampleRateHz)).toEqual([])
  })

  it('validates inputs even when the filter list is empty', () => {
    expect(() => cascadeMagnitudeDb([], [0], sampleRateHz)).toThrow(CoreError)
    expect(() => cascadeMagnitudeDb([], [1000], 0)).toThrow(CoreError)
    expect(() =>
      cascadeMagnitudeDb(null as unknown as Filter[], [1000], sampleRateHz),
    ).toThrow(CoreError)
  })

  it.each([
    ['non-object filter', null as unknown as Filter],
    [
      'non-boolean enabled value',
      { ...peak('1'), enabled: 'yes' } as unknown as Filter,
    ],
  ])('rejects a %s', (_name, invalidFilter) => {
    expect(() => cascadeMagnitudeDb([invalidFilter], [1000], sampleRateHz)).toThrow(CoreError)
  })
})
