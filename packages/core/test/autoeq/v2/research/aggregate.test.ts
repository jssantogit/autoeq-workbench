import { describe, expect, it } from 'vitest'

import { aggregateResearchRuns } from '../../../../benchmarks/research/aggregate.js'
import type {
  ResearchCheckpoint,
  ResearchJointRefineRecord,
  ResearchRunRow,
  ResearchTimeToQuality,
  StandardV2ResearchCounters,
} from '../../../../benchmarks/research/types.js'
import { summarizeResearchWorkEfficiency } from '../../../../benchmarks/research/aggregate.js'

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

const emptyWorkEfficiency = () => ({
  jointRefineRecords: 0,
  expiredJointRefines: 0,
  previouslyAttemptedEquivalent: 0,
  previouslyCompletedEquivalent: 0,
  retainedAfterStaging: 0,
  retainedAsActivePath: 0,
  contributedToBestDeliverable: 0,
  coordinateTrials: 0,
  coordinateTrialsContributingToBest: 0,
  medianNormalizedViolationGainPerCompletedCycle: null,
  timeToBestMs: null,
  timeSinceLastImprovementMs: null,
})

function jointRecord(
  traceId: string,
  overrides: Partial<ResearchJointRefineRecord> = {},
): ResearchJointRefineRecord {
  return {
    traceId,
    origin: 'search',
    parentKey: 'parent',
    parentFilterCount: 1,
    parentMetrics: { maeDb: 1, rmseDb: 1, maxAbsDb: 2, maxAbsFrequencyHz: 1_000 },
    candidateKey: 'candidate',
    candidate: {
      filter: { id: 'candidate', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 2, q: 1 },
      featureIndex: 0,
      boundaryMode: 'half-height',
      qScale: 1,
      cheapScore: 1,
    },
    refinementKey: 'refinement',
    resultKey: 'result',
    resultMetrics: { maeDb: 0.5, rmseDb: 0.5, maxAbsDb: 1, maxAbsFrequencyHz: 1_000 },
    cycles: [],
    completedCycles: 0,
    coordinateTrials: 0,
    expired: false,
    equivalentStatePreviouslyAttempted: false,
    equivalentStatePreviouslyCompleted: false,
    survivedStagedCandidateRetention: false,
    survivedActivePathRetention: false,
    contributedToBestDeliverable: false,
    ...overrides,
  }
}

const efficiencyCheckpoints = (): ResearchCheckpoint[] => [
  { elapsedMs: 0, metrics: { maeDb: 1, rmseDb: 1, maxAbsDb: 2, maxAbsFrequencyHz: 1_000 }, filterCount: 0, sourceSolutionKey: null },
  { elapsedMs: 500, metrics: { maeDb: 0.8, rmseDb: 0.8, maxAbsDb: 1.5, maxAbsFrequencyHz: 1_000 }, filterCount: 1, sourceSolutionKey: 'solution-a' },
  { elapsedMs: 1_000, metrics: { maeDb: 0.7, rmseDb: 0.7, maxAbsDb: 1.4, maxAbsFrequencyHz: 1_000 }, filterCount: 1, sourceSolutionKey: 'solution-b' },
  { elapsedMs: 2_000, metrics: { maeDb: 0.4, rmseDb: 0.4, maxAbsDb: 1, maxAbsFrequencyHz: 1_000 }, filterCount: 2, sourceSolutionKey: 'solution-c' },
]

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
    telemetryMode: 'light',
    phaseTimingMs: {
      prepare: 0,
      candidateScoring: 0,
      jointRefine: 0,
      deliverable: 0,
      discreteRefine: 0,
      compression: 0,
      other: 0,
    },
    workEfficiency: emptyWorkEfficiency(),
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

  it('summarizes refinement work and preserves unavailable timing as null', () => {
    const records = [
      jointRecord('trace-1', {
        cycles: [
          {
            cycleIndex: 1,
            completed: true,
            coordinateTrials: 2,
            startMetrics: { maeDb: 1, rmseDb: 1, maxAbsDb: 2, maxAbsFrequencyHz: 1_000 },
            endMetrics: { maeDb: 0.8, rmseDb: 0.8, maxAbsDb: 1.5, maxAbsFrequencyHz: 1_000 },
            normalizedViolationGain: 0.4,
          },
          {
            cycleIndex: 2,
            completed: false,
            coordinateTrials: 1,
            startMetrics: { maeDb: 0.8, rmseDb: 0.8, maxAbsDb: 1.5, maxAbsFrequencyHz: 1_000 },
            endMetrics: { maeDb: 0.8, rmseDb: 0.8, maxAbsDb: 1.5, maxAbsFrequencyHz: 1_000 },
            normalizedViolationGain: 0.1,
          },
        ],
        completedCycles: 1,
        coordinateTrials: 3,
        equivalentStatePreviouslyAttempted: true,
        equivalentStatePreviouslyCompleted: true,
        survivedStagedCandidateRetention: true,
        survivedActivePathRetention: false,
        contributedToBestDeliverable: true,
      }),
      jointRecord('trace-2', {
        cycles: [{
          cycleIndex: 1,
          completed: true,
          coordinateTrials: 4,
          startMetrics: { maeDb: 0.8, rmseDb: 0.8, maxAbsDb: 1.5, maxAbsFrequencyHz: 1_000 },
          endMetrics: { maeDb: 0.6, rmseDb: 0.6, maxAbsDb: 1.2, maxAbsFrequencyHz: 1_000 },
          normalizedViolationGain: 0.2,
        }],
        completedCycles: 1,
        coordinateTrials: 4,
        expired: true,
        equivalentStatePreviouslyAttempted: true,
        equivalentStatePreviouslyCompleted: false,
        survivedStagedCandidateRetention: false,
        survivedActivePathRetention: true,
        contributedToBestDeliverable: false,
      }),
    ]

    const efficiency = summarizeResearchWorkEfficiency(records, efficiencyCheckpoints(), 3_000)
    expect(efficiency).toMatchObject({
      jointRefineRecords: 2,
      expiredJointRefines: 1,
      previouslyAttemptedEquivalent: 2,
      previouslyCompletedEquivalent: 1,
      retainedAfterStaging: 1,
      retainedAsActivePath: 1,
      contributedToBestDeliverable: 1,
      coordinateTrials: 7,
      coordinateTrialsContributingToBest: 3,
      timeToBestMs: 2_000,
      timeSinceLastImprovementMs: 1_000,
    })
    expect(efficiency.medianNormalizedViolationGainPerCompletedCycle).toBeCloseTo(0.3)

    expect(summarizeResearchWorkEfficiency([], [], 0)).toMatchObject({
      medianNormalizedViolationGainPerCompletedCycle: null,
      timeToBestMs: null,
      timeSinceLastImprovementMs: null,
    })
  })
})
