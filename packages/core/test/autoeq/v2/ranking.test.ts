import { describe, expect, it } from 'vitest'

import {
  compareV2DeliverableQuality,
  compareV2Solutions,
  isV2TargetAchieved,
  type ErrorMetrics,
  type Filter,
  type V2Solution,
} from '../../../src/index.js'

function metrics(rmseDb: number, maxAbsDb: number): ErrorMetrics {
  return { maeDb: rmseDb, rmseDb, maxAbsDb, maxAbsFrequencyHz: 1_000 }
}

function solution(
  rmseDb: number,
  maxAbsDb: number,
  filters: Filter[] = [],
  totalScore = 0,
): V2Solution {
  return {
    filters,
    metrics: metrics(rmseDb, maxAbsDb),
    cancellationAudit: { pairs: [], totalScore },
  }
}

describe('Standard v2 ranking', () => {
  it('requires both delivered precision thresholds', () => {
    expect(isV2TargetAchieved(metrics(0.25, 0.75))).toBe(true)
    expect(isV2TargetAchieved(metrics(0.10, 0.76))).toBe(false)
    expect(isV2TargetAchieved(metrics(0.26, 0.10))).toBe(false)
  })

  it('ranks normalized violation before lower RMSE', () => {
    expect(compareV2Solutions(solution(0.24, 0.70), solution(0.10, 1.20))).toBeLessThan(0)
  })

  it('retains balanced delivered quality without changing search ranking', () => {
    const stormEarly = solution(1.433, 5.405)
    const stormLater = solution(1.640, 5.351)
    expect(compareV2Solutions(stormLater, stormEarly)).toBeLessThan(0)
    expect(compareV2DeliverableQuality(stormEarly, stormLater)).toBeLessThan(0)

    const u12tEarly = solution(1.286, 4.965)
    const u12tLater = solution(1.615, 4.846)
    expect(compareV2Solutions(u12tLater, u12tEarly)).toBeLessThan(0)
    expect(compareV2DeliverableQuality(u12tEarly, u12tLater)).toBeLessThan(0)
  })

  it('always ranks an achieved delivered target ahead of an outside-target solution', () => {
    expect(
      compareV2DeliverableQuality(solution(0.25, 0.75), solution(0.01, 0.76)),
    ).toBeLessThan(0)
  })

  it('uses aggressiveness and stable filter coordinates as deterministic ties', () => {
    const mild: Filter = {
      id: 'mild', enabled: true, type: 'LS', frequencyHz: 100, gainDb: 2, q: 0.7,
    }
    const aggressive: Filter = {
      id: 'aggressive', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 3, q: 4,
    }
    expect(compareV2Solutions(solution(0.5, 1, [mild]), solution(0.5, 1, [aggressive]))).toBeLessThan(0)
    expect(compareV2Solutions(solution(0.5, 1, [mild], 1), solution(0.5, 1, [mild], 2))).toBeLessThan(0)
  })
})
