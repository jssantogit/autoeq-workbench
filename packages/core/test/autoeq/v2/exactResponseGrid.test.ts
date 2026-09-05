import { describe, expect, it } from 'vitest'

import { biquadMagnitudeDb, type Filter } from '../../../src/index.js'
import {
  biquadMagnitudeDbExactOnGrid,
  createBiquadResponseGrid,
} from '../../../src/dsp/response.js'

const frequencies = [20, 31.5, 100, 999, 1_000, 3_141, 7_453, 13_089, 19_999]
const sampleRateHz = 48_000

function filter(type: Filter['type'], frequencyHz: number, gainDb: number, q: number): Filter {
  return { id: `${type}-${frequencyHz}`, enabled: true, type, frequencyHz, gainDb, q }
}

describe('Standard v2 exact response grid', () => {
  it.each([
    filter('PK', 7_453, -14.6, 11.99),
    filter('PK', 299, 9.5, 0.36),
    filter('LS', 120, 6.2, 0.7),
    filter('HS', 9_000, -5.4, 0.7),
  ])('matches the public physical response bit-for-bit for $id', (candidate) => {
    const grid = createBiquadResponseGrid(frequencies, sampleRateHz)
    expect(biquadMagnitudeDbExactOnGrid(candidate, grid)).toEqual(
      biquadMagnitudeDb(candidate, frequencies, sampleRateHz),
    )
  })
})
