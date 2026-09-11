import { describe, expect, it } from 'vitest'

import {
  POLICY_F_MAX_LEXICAL_FILTER_COUNT,
  POLICY_G_LOW_START_MAX_FILTER_COUNT,
  SPARSE_HOLDOUT_MAX_INDEX,
  STORM_REPLACEMENT_HOLDOUT_COUNT,
  STRUCTURAL_EVALUATION_BUDGET,
  classifyAdaptiveThreshold,
  classifyPurePolicy,
} from '../../../../benchmarks/research/stormAdmissionIndependentPolicyValidation.js'

describe('Storm admission independent policy validation', () => {
  it('predeclares the post-hoc adaptive hypothesis before new policy outcomes', () => {
    expect(POLICY_F_MAX_LEXICAL_FILTER_COUNT).toBe(4)
    expect(POLICY_G_LOW_START_MAX_FILTER_COUNT).toBe(4)
    expect(SPARSE_HOLDOUT_MAX_INDEX).toBe(9)
    expect(STORM_REPLACEMENT_HOLDOUT_COUNT).toBe(6)
    expect(STRUCTURAL_EVALUATION_BUDGET).toBe(17)
  })

  it('requires F to reduce losses without sacrificing wins for full support', () => {
    expect(classifyAdaptiveThreshold(
      { wins: 4, losses: 4 },
      { wins: 4, losses: 2 },
    )).toBe('adaptive-threshold-4-supported')
    expect(classifyAdaptiveThreshold(
      { wins: 4, losses: 4 },
      { wins: 3, losses: 2 },
    )).toBe('adaptive-threshold-4-partial-tradeoff')
    expect(classifyAdaptiveThreshold(
      { wins: 4, losses: 2 },
      { wins: 5, losses: 2 },
    )).toBe('adaptive-threshold-4-not-supported')
  })

  it('derives pure-policy classification from win/loss counts', () => {
    expect(classifyPurePolicy({ wins: 3, losses: 1 })).toBe('independent-policy-favorable')
    expect(classifyPurePolicy({ wins: 2, losses: 2 })).toBe('independent-policy-mixed')
    expect(classifyPurePolicy({ wins: 1, losses: 3 })).toBe('independent-policy-regressive')
  })
})
