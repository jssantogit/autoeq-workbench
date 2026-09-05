import { describe, expect, it } from 'vitest'

import type { ErrorMetrics } from '../../../src/metrics/errorMetrics.js'
import type { V2Solution } from '../../../src/autoeq/v2/ranking.js'
import { selectV2StagedContinuationCandidates } from '../../../src/autoeq/v2/stagedContinuation.js'

function staged(violation: number): V2Solution {
  const metrics: ErrorMetrics = {
    maeDb: violation * 0.2,
    rmseDb: violation * 0.25,
    maxAbsDb: violation * 0.75,
    maxAbsFrequencyHz: 1_000,
  }
  return {
    filters: [],
    metrics,
    cancellationAudit: { pairs: [], totalScore: 0 },
  }
}

describe('Standard v2 adaptive staged third continuation', () => {
  it('skips the third continuation when the two best fast-pass violations are effectively tied', () => {
    const candidates = [staged(4), staged(4.003), staged(4.2)]

    expect(selectV2StagedContinuationCandidates(candidates)).toHaveLength(2)
  })

  it('keeps the third continuation when the top-two fast-pass spread reaches 0.1%', () => {
    const candidates = [staged(4), staged(4.004), staged(4.2)]

    expect(selectV2StagedContinuationCandidates(candidates)).toHaveLength(3)
  })
})
