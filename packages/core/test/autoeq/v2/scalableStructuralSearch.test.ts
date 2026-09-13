import { describe, expect, it } from 'vitest'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  nextScalableCapacity,
  resolveScalableEffortConfig,
  resolveStructuralSearchConfig,
  structuralViolation,
} from '../../../src/index.js'

describe('scalable structural search policy', () => {
  it('grows capacity geometrically without Max20/Max30-specific presets', () => {
    expect(nextScalableCapacity(10, 64)).toBe(15)
    expect(nextScalableCapacity(15, 64)).toBe(23)
    expect(nextScalableCapacity(23, 64)).toBe(35)
    expect(nextScalableCapacity(35, 64)).toBe(53)
    expect(nextScalableCapacity(53, 64)).toBe(64)
    expect(nextScalableCapacity(64, 64)).toBe(64)
  })

  it('deepens search effort monotonically while keeping the requested capacity', () => {
    const base = resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 60,
    })
    const low = resolveScalableEffortConfig(base, 30, 0)
    const medium = resolveScalableEffortConfig(base, 30, 3)
    const high = resolveScalableEffortConfig(base, 30, 99)

    expect(low.maxFilters).toBe(30)
    expect(medium.maxFilters).toBe(30)
    expect(high.maxFilters).toBe(30)
    expect(medium.beamWidth).toBeGreaterThan(low.beamWidth)
    expect(medium.proposalsPerParent).toBeGreaterThan(low.proposalsPerParent)
    expect(medium.localPolishEvaluations).toBeGreaterThan(low.localPolishEvaluations)
    expect(high.beamWidth).toBeGreaterThanOrEqual(medium.beamWidth)
    expect(high.proposalsPerParent).toBeGreaterThanOrEqual(medium.proposalsPerParent)
    expect(high.localPolishEvaluations).toBeGreaterThanOrEqual(medium.localPolishEvaluations)
  })

  it('uses normalized violation as the monotonic quality objective', () => {
    expect(structuralViolation({ rmseDb: 0.25, maxAbsDb: 0.75 })).toBe(1)
    expect(structuralViolation({ rmseDb: 0.5, maxAbsDb: 0.3 })).toBe(2)
    expect(structuralViolation({ rmseDb: 0.1, maxAbsDb: 1.5 })).toBe(2)
  })
})
