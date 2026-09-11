import { describe, expect, it } from 'vitest'

import {
  ANYTIME_ARMS,
  ANYTIME_CHECKPOINTS_MS,
  ANYTIME_EVALUATION_BUDGET_CEILING,
  ANYTIME_PANEL_CELL_IDS,
  classifyAnytimeCampaign,
  compareSelected,
  paretoRelation,
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

  it('treats identical policy outcomes as equivalent before candidate-id tie breaks', () => {
    const left = { candidateId: 'left', rmseDb: 1, maxAbsDb: 2, filterCount: 4 }
    const right = { candidateId: 'right', rmseDb: 1, maxAbsDb: 2, filterCount: 4 }
    expect(compareSelected(left, right)).toBe('equivalent')
    expect(paretoRelation(left, right)).toBe('equivalent')
  })

  it('classifies aggregate checkpoint wins without a hidden quality threshold', () => {
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 3, q04Wins: 2, ties: 1 },
      { checkpointMs: 15_000, q31Wins: 3, q04Wins: 2, ties: 1 },
    ], false)).toBe('Q31-anytime-favorable')
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 2, q04Wins: 3, ties: 1 },
    ], false)).toBe('Q04-anytime-favorable')
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 2, q04Wins: 2, ties: 2 },
    ], false)).toBe('anytime-tradeoff')
    expect(classifyAnytimeCampaign([
      { checkpointMs: 5_000, q31Wins: 1, q04Wins: 3, ties: 2 },
    ], true)).toBe('search-exhausted-before-first-checkpoint')
  })
})
