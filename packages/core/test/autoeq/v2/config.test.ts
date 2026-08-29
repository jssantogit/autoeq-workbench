import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  STANDARD_V2_CONFIG,
  calculateWorkingMaxFilters,
  resolveStandardAutoEqV2Config,
} from '../../../src/index.js'

describe('Standard v2 config', () => {
  it('resolves the approved versioned parameters without changing them', () => {
    expect(STANDARD_V2_CONFIG.algorithm).toEqual({
      targetRmseDb: 0.25,
      targetMaxAbsDb: 0.75,
      candidateResidualFloorDb: 0.15,
      pkQScaleMultipliers: [0.5, 1, 2],
      maxExactCandidatesPerIteration: 8,
      maxActiveSearchPaths: 3,
      alternateRetentionRatio: 1.02,
      maxJointRefinementCycles: 6,
    })
    expect(resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)).toMatchObject({
      algorithmVersion: 'standard-v2',
      maxFilters: 10,
      workingMaxFilters: 15,
      algorithm: STANDARD_V2_CONFIG.algorithm,
    })
  })

  it.each([
    [0, 0],
    [5, 9],
    [10, 15],
    [20, 30],
    [64, 64],
  ])('uses working cap %i -> %i', (maxFilters, expected) => {
    expect(calculateWorkingMaxFilters(maxFilters)).toBe(expected)
  })
})
