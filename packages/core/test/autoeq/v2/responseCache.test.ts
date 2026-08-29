import { describe, expect, it } from 'vitest'

import {
  cascadeMagnitudeDb,
  createV2ResponseCache,
  replaceV2ResponseCacheFilter,
  type Filter,
} from '../../../src/index.js'

const frequencies = [40, 100, 1_000, 5_000, 15_000]
const sampleRateHz = 48_000
const filters: Filter[] = [
  { id: 'low', enabled: true, type: 'LS', frequencyHz: 100, gainDb: 3, q: 0.7 },
  { id: 'mid', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -4, q: 2 },
  { id: 'high', enabled: true, type: 'HS', frequencyHz: 10_000, gainDb: 2, q: 0.7 },
]

function expectCascade(cacheDb: readonly number[], expected: readonly number[]) {
  for (let index = 0; index < expected.length; index += 1) {
    expect(cacheDb[index]).toBeCloseTo(expected[index]!, 12)
  }
}

describe('Standard v2 response cache', () => {
  it('matches full cascade evaluation before and after one-filter replacement', () => {
    const cache = createV2ResponseCache(filters, frequencies, sampleRateHz)
    expectCascade(cache.cascadeDb, cascadeMagnitudeDb(filters, frequencies, sampleRateHz))

    const replacement: Filter = {
      id: 'mid-next', enabled: true, type: 'PK', frequencyHz: 1_200, gainDb: -3, q: 1.5,
    }
    const replaced = replaceV2ResponseCacheFilter(
      cache,
      1,
      replacement,
      frequencies,
      sampleRateHz,
    )
    expectCascade(
      replaced.cascadeDb,
      cascadeMagnitudeDb([filters[0]!, replacement, filters[2]!], frequencies, sampleRateHz),
    )
  })
})
