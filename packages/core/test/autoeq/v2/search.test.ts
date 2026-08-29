import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  retainV2SearchPaths,
  searchStandardV2WorkingSolutions,
  resolveStandardAutoEqV2Config,
  type ErrorMetrics,
  type V2Solution,
} from '../../../src/index.js'

function solution(violation: number): V2Solution {
  const metrics: ErrorMetrics = {
    maeDb: violation * 0.25,
    rmseDb: violation * 0.25,
    maxAbsDb: violation * 0.75,
    maxAbsFrequencyHz: 1_000,
  }
  return { filters: [], metrics, cancellationAudit: { pairs: [], totalScore: 0 } }
}

describe('Standard v2 bounded search', () => {
  it('retains ordinary alternatives through 1.02 and caps paths at three', () => {
    const retained = retainV2SearchPaths(
      [solution(1), solution(1.01), solution(1.019), solution(1.021)],
      false,
    )
    expect(retained).toHaveLength(3)
    expect(retained.map((entry) => entry.metrics.rmseDb / 0.25)).toEqual([1, 1.01, 1.019])
  })

  it('allows one deterministic escape outside 1.02 only for stagnation', () => {
    expect(retainV2SearchPaths([solution(1), solution(1.03), solution(1.04)], false)).toHaveLength(1)
    expect(retainV2SearchPaths([solution(1), solution(1.03), solution(1.04)], true))
      .toHaveLength(2)
  })

  it('returns a bounded zero-filter solution without starting work at an expired deadline', () => {
    const frequencies = [100, 1_000, 10_000]
    const result = searchStandardV2WorkingSolutions({
      desiredDb: [2, -2, 1],
      frequencies,
      config: resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS),
      deadline: { isExpired: () => true },
    })

    expect(result.bestSolution.filters).toEqual([])
    expect(result.peakWorkingFilterCount).toBe(0)
    expect(result.termination).toBe('time-limit')
  })
})
