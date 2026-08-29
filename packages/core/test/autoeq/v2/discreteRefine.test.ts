import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  compareV2Solutions,
  cyclicDiscreteRefineV2,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../../src/index.js'

describe('Standard v2 cyclic discrete refinement', () => {
  it('continues beyond two cycles on the manual grid without worsening', () => {
    const frequencies = [500, 750, 1_000, 1_500, 2_000]
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const desiredFilter: Filter = {
      id: 'desired', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1.5, q: 2,
    }
    const desiredDb = evaluateV2Solution([desiredFilter], [], frequencies, 48_000).cascadeDb
    const start = evaluateV2Solution(
      [{ ...desiredFilter, id: 'start', gainDb: 1 }],
      desiredDb,
      frequencies,
      48_000,
    )
    const result = cyclicDiscreteRefineV2({
      filters: start.filters,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
    })

    expect(result.completedCycles).toBeGreaterThan(2)
    expect(compareV2Solutions(result.solution, start)).toBeLessThanOrEqual(0)
    expect(result.filters[0]!.frequencyHz % 1).toBe(0)
    expect(Number.isInteger(result.filters[0]!.gainDb * 10)).toBe(true)
    expect(Number.isInteger(result.filters[0]!.q * 100)).toBe(true)
  })
})
