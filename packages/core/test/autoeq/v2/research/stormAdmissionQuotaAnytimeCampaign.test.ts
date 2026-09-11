import { describe, expect, it } from 'vitest'

import {
  ANYTIME_ARMS,
  ANYTIME_CHECKPOINTS_MS,
  ANYTIME_EVALUATION_BUDGET_CEILING,
  ANYTIME_PANEL_CELL_IDS,
  classifyAnytimeCampaign,
} from '../../../../benchmarks/research/stormAdmissionQuotaAnytimeCampaign.js'

describe('Storm admission Q31 vs Q04 anytime campaign', () => {
  it('predeclares only Q31 and Q04', () => {
    expect(ANYTIME_ARMS).toEqual([
      { armId: 'Q31', lexicalQuota: 3, rmseQuota: 1 },
      { armId: 'Q04', lexicalQuota: 0, rmseQuota: 4 },
    ])
  })

  it('predeclares 5/15/30/60 second checkpoints', () => {
    expect(ANYTIME_CHECKPOINTS_MS).toEqual([5_000, 15_000, 30_000, 60_000])
  })

  it('uses a fixed six-cell stratified timing panel', () => {
    expect(ANYTIME_PANEL_CELL_IDS).toEqual([
      'u12t-sparse-0002',
      'u12t-sparse-0008',
      'trio-sparse-0002',
      'trio-sparse-0008',
      'storm-replacement-holdout-01',
      'storm-replacement-holdout-06',
    ])
  })

  it('uses a ceiling high enough for the deadline to be the intended limiter', () => {
    expect(ANYTIME_EVALUATION_BUDGET_CEILING).toBe(100_000)
  })

  it('classifies aggregate checkpoint wins without a hidden quality threshold', () => {
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 3, q04Wins: 2, ties: 1 },
      { checkpointMs: 15_000, q31Wins: 3, q04Wins: 2, ties: 1 },
    ])).toBe('Q31-anytime-favorable')
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 2, q04Wins: 3, ties: 1 },
    ])).toBe('Q04-anytime-favorable')
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 2, q04Wins: 2, ties: 2 },
    ])).toBe('anytime-tradeoff')
  })
})
