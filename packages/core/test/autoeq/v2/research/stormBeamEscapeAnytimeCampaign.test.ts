import { describe, expect, it } from 'vitest'

import {
  BEAM_ESCAPE_ANYTIME_DEADLINE_MS,
  classifyEscapeAnytime,
} from '../../../../benchmarks/research/stormBeamEscapeAnytimeCampaign.js'
import { ANYTIME_CHECKPOINTS_MS } from '../../../../benchmarks/research/stormAdmissionQuotaAnytimeCampaign.js'

const row = (checkpointMs: number, q31Wins: number, q04Wins: number, ties: number) => ({
  checkpointMs,
  q31Wins,
  q04Wins,
  ties,
  pareto: { q31Dominates: 0, q04Dominates: 0, tradeoffs: 0, equivalent: 0 },
  meanDeltaRmseDb: 0,
  meanDeltaMaxAbsDb: 0,
  meanDeltaRegret: 0,
  work: {
    Q31: { downstreamEvaluations: 0, signalCanonicalEvaluations: 0 },
    Q04: { downstreamEvaluations: 0, signalCanonicalEvaluations: 0 },
  },
})

describe('Storm beam-escape anytime campaign', () => {
  it('freezes the first real anytime horizon at 60 seconds', () => {
    expect(ANYTIME_CHECKPOINTS_MS).toEqual([5_000, 15_000, 30_000, 60_000])
    expect(BEAM_ESCAPE_ANYTIME_DEADLINE_MS).toBe(60_000)
  })

  it('classifies wins across all predeclared checkpoints', () => {
    expect(classifyEscapeAnytime([
      row(5_000, 4, 2, 0),
      row(15_000, 3, 3, 0),
    ])).toBe('Q31-escape-anytime-favorable')
    expect(classifyEscapeAnytime([
      row(5_000, 2, 4, 0),
    ])).toBe('Q04-escape-anytime-favorable')
    expect(classifyEscapeAnytime([
      row(5_000, 3, 3, 0),
    ])).toBe('escape-anytime-tradeoff')
  })
})
