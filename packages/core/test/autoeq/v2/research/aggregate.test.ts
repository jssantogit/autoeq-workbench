import { describe, expect, it } from 'vitest'

import { aggregateResearchRuns } from '../../../../benchmarks/research/aggregate.js'
import type {
  ResearchRunRow,
  ResearchTimeToQuality,
  StandardV2ResearchCounters,
} from '../../../../benchmarks/research/types.js'

const emptyTimeToQuality = (): ResearchTimeToQuality => ({
  rmse100Ms: null,
  rmse075Ms: null,
  rmse050Ms: null,
  rmse035Ms: null,
  rmse025Ms: null,
  maxAbs200Ms: null,
  maxAbs150Ms: null,
  maxAbs100Ms: null,
  maxAbs075Ms: null,
  jointTargetMs: null,
})

const counters = (): StandardV2ResearchCounters => ({
  boundaryModeAttempts: 1,
  candidatesGenerated: 2,
  candidatesShortlisted: 1,
  workingCheckpoints: 1,
  deliverablesBuilt: 1,
  peakWorkingFilterCount: 3,
  jointRefinementCount: 4,
  jointCoordinateTrials: 5,
  discreteTrials: 6,
  discreteAcceptedMoves: 7,
  compressionRemovalTrials: 8,
})

function row(
  repeatIndex: number,
  rmseDb: number,
  maxAbsDb: number,
  overrides: Partial<ResearchRunRow> = {},
): ResearchRunRow {
  return {
    caseId: 'titan-to-storm',
    budgetSeconds: 15,
    maxFilters: 10,
    repeatIndex,
    elapsedMs: 100 + repeatIndex * 50,
    final: {
      maeDb: rmseDb / 2,
      rmseDb,
      maxAbsDb,
      maxAbsFrequencyHz: 1_000,
      targetAchieved: repeatIndex !== 1,
      terminationReason: repeatIndex === 1 ? 'time-limit' : 'converged',
      deliveredFilterCount: 2,
      preampDb: -1,
    },
    bands: [],
    counters: counters(),
    timeToQuality: {
      ...emptyTimeToQuality(),
      rmse050Ms: repeatIndex === 1 ? null : repeatIndex * 200,
      jointTargetMs: repeatIndex === 1 ? null : repeatIndex * 300,
    },
    timeline: [],
    filters: [],
    ...overrides,
  }
}

describe('research run aggregation', () => {
  it('aggregates quality statistics and failure-aware threshold times', () => {
    const [aggregate] = aggregateResearchRuns([
      row(0, 0.4, 0.9),
      row(1, 0.2, 0.6),
      row(2, 0.8, 1.2),
    ])

    expect(aggregate).toMatchObject({
      caseId: 'titan-to-storm',
      budgetSeconds: 15,
      maxFilters: 10,
      runCount: 3,
      rmseDb: { best: 0.2, median: 0.4, worst: 0.8 },
      maxAbsDb: { best: 0.6, median: 0.9, worst: 1.2 },
      targetAchievedCount: 2,
      targetAchievedRate: 2 / 3,
      terminationReasons: { converged: 2, 'time-limit': 1 },
    })
    expect(aggregate.rmseDb.spread).toBeCloseTo(0.6)
    expect(aggregate.maxAbsDb.spread).toBeCloseTo(0.6)
    expect(aggregate.timeToQualityMedian.rmse050Ms).toBe(400)
    expect(aggregate.timeToQualityWorst.rmse050Ms).toBeNull()
    expect(aggregate.timeToQualityMedian.jointTargetMs).toBe(600)
    expect(aggregate.timeToQualityWorst.jointTargetMs).toBeNull()
  })

  it('keeps separate settings cells separate', () => {
    const aggregates = aggregateResearchRuns([
      row(0, 0.4, 0.9),
      row(0, 0.3, 0.8, { budgetSeconds: 30 }),
      row(0, 0.2, 0.7, { maxFilters: 20 }),
    ])

    expect(aggregates.map(({ budgetSeconds, maxFilters }) => [budgetSeconds, maxFilters])).toEqual([
      [15, 10],
      [30, 10],
      [15, 20],
    ])
  })
})
