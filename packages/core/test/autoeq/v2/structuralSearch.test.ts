import { describe, expect, it } from 'vitest'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  resolveStructuralSearchConfig,
} from '../../../src/index.js'

describe('Experimental structural search work profiles', () => {
  it('uses the deterministic short profile only for the 5 second budget', () => {
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 5,
    }).workProfile).toBe('short-5s')
  })

  it.each([15, 30, 60, 120])(
    'uses the full profile for a %i second budget',
    (timeLimitSeconds) => {
      expect(resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds,
      }).workProfile).toBe('full')
    },
  )

  it('defaults to the full profile when no time budget is provided', () => {
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }).workProfile).toBe('full')
  })
})
