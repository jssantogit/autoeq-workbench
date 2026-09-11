import { describe, expect, it } from 'vitest'

import {
  QUOTA_ARMS,
  buildQuotaSelection,
  classifyQuotaCampaign,
  quotaParetoFrontier,
} from '../../../../benchmarks/research/stormAdmissionQuotaCampaign.js'

describe('Storm admission quota campaign', () => {
  it('predeclares all lexical:RMSE quotas', () => {
    expect(QUOTA_ARMS).toEqual([
      { armId: 'Q40', lexicalQuota: 4, rmseQuota: 0 },
      { armId: 'Q31', lexicalQuota: 3, rmseQuota: 1 },
      { armId: 'Q22', lexicalQuota: 2, rmseQuota: 2 },
      { armId: 'Q13', lexicalQuota: 1, rmseQuota: 3 },
      { armId: 'Q04', lexicalQuota: 0, rmseQuota: 4 },
    ])
  })

  it('fills lexical first, then unique RMSE entries', () => {
    const lexical = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key }))
    const rmse = ['c', 'e', 'b', 'f', 'a', 'd'].map((key) => ({ key }))

    expect(buildQuotaSelection(lexical, rmse, 3, 1).map((entry) => entry.key))
      .toEqual(['a', 'b', 'c', 'e'])
    expect(buildQuotaSelection(lexical, rmse, 2, 2).map((entry) => entry.key))
      .toEqual(['a', 'b', 'c', 'e'])
    expect(buildQuotaSelection(lexical, rmse, 1, 3).map((entry) => entry.key))
      .toEqual(['a', 'c', 'e', 'b'])
    expect(buildQuotaSelection(lexical, rmse, 0, 4).map((entry) => entry.key))
      .toEqual(['c', 'e', 'b', 'f'])
  })

  it('rejects malformed quotas', () => {
    expect(() => buildQuotaSelection([{ key: 'a' }], [{ key: 'a' }], 2, 1))
      .toThrow(/sum to four/)
  })

  it('derives the win/loss Pareto frontier', () => {
    expect(quotaParetoFrontier({
      Q40: { wins: 0, losses: 0 },
      Q31: { wins: 10, losses: 1 },
      Q22: { wins: 12, losses: 1 },
      Q13: { wins: 14, losses: 2 },
      Q04: { wins: 13, losses: 3 },
    })).toEqual(['Q40', 'Q22', 'Q13'])
  })

  it('separates hybrid dominance from a safety-quality tradeoff', () => {
    expect(classifyQuotaCampaign({
      Q40: { wins: 0, losses: 0 },
      Q31: { wins: 16, losses: 1 },
      Q22: { wins: 14, losses: 1 },
      Q13: { wins: 15, losses: 2 },
      Q04: { wins: 16, losses: 2 },
    })).toBe('hybrid-dominates-pure-rmse')

    expect(classifyQuotaCampaign({
      Q40: { wins: 0, losses: 0 },
      Q31: { wins: 14, losses: 1 },
      Q22: { wins: 13, losses: 1 },
      Q13: { wins: 15, losses: 2 },
      Q04: { wins: 16, losses: 2 },
    })).toBe('hybrid-tradeoff-only')
  })
})
