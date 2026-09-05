import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  runStandardAutoEqV2,
  type ErrorMetrics,
  type Filter,
  type Curve,
  type StandardAutoEqInputV2,
  type StandardV2JointRefineRecord,
  type StandardV2ResearchTrace,
} from '../../../../src/index.js'

import { createResearchTelemetry } from '../../../../benchmarks/research/telemetry.js'

function researchInput(): StandardAutoEqInputV2 {
  const frequencies = createEvaluationGrid()
  const curve = (kind: Curve['kind'], db: (frequencyHz: number) => number): Curve => ({
    id: kind,
    name: `Synthetic ${kind}`,
    kind,
    rawPoints: frequencies.map((frequencyHz) => ({ frequencyHz, db: db(frequencyHz) })),
    metadata: { synthetic: true },
  })

  return {
    source: curve('fr', (frequencyHz) => frequencyHz >= 1_000 ? -2 : 0),
    target: curve('target', () => 0),
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 0 },
    settings: { ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: 5, maxFilters: 3 },
  }
}

function createCountingTestTrace(): {
  trace: StandardV2ResearchTrace
  snapshot: () => {
    bestDeliverableUpdates: number
    candidatesGenerated: number
    candidatesShortlisted: number
    jointRefines: number
    workingCheckpoints: number
    deliverablesBuilt: number
  }
} {
  let bestDeliverableUpdates = 0
  let candidatesGenerated = 0
  let candidatesShortlisted = 0
  let jointRefines = 0
  let workingCheckpoints = 0
  let deliverablesBuilt = 0

  return {
    trace: {
      onBestDeliverableUpdated: (checkpoint) => {
        bestDeliverableUpdates += 1
        checkpoint.filters.length = 0
        checkpoint.metrics.rmseDb = Number.POSITIVE_INFINITY
      },
      onCandidatesGenerated: (count) => {
        candidatesGenerated += count
      },
      onCandidatesShortlisted: (count) => {
        candidatesShortlisted += count
      },
      onJointRefineCompleted: () => {
        jointRefines += 1
      },
      onWorkingCheckpoint: () => {
        workingCheckpoints += 1
      },
      onDeliverableBuilt: () => {
        deliverablesBuilt += 1
      },
      onJointRefineTrace: (record) => {
        record.parentMetrics.rmseDb = Number.POSITIVE_INFINITY
        record.candidate.filter.gainDb = Number.POSITIVE_INFINITY
        for (const cycle of record.cycles) {
          cycle.startMetrics.maxAbsDb = Number.POSITIVE_INFINITY
        }
      },
      onJointRefineRetention: () => {},
    },
    snapshot: () => ({
      bestDeliverableUpdates,
      candidatesGenerated,
      candidatesShortlisted,
      jointRefines,
      workingCheckpoints,
      deliverablesBuilt,
    }),
  }
}

describe('Standard v2 research trace', () => {
  it('preserves exact deterministic output while reporting opt-in events', () => {
    const input = researchInput()
    const withoutTrace = runStandardAutoEqV2(input, { nowMs: () => 0 })
    const counters = createCountingTestTrace()
    const withTrace = runStandardAutoEqV2(input, {
      nowMs: () => 0,
      researchTrace: counters.trace,
    })

    expect(withTrace).toEqual(withoutTrace)
    expect(counters.snapshot().bestDeliverableUpdates).toBeGreaterThan(0)
    expect(counters.snapshot().candidatesGenerated).toBeGreaterThan(0)
    expect(counters.snapshot().candidatesShortlisted).toBeGreaterThan(0)
    expect(counters.snapshot().jointRefines).toBeGreaterThan(0)
    expect(counters.snapshot().workingCheckpoints).toBeGreaterThan(0)
    expect(counters.snapshot().deliverablesBuilt).toBeGreaterThan(0)
  }, 30_000)

  it('records causal joint-refinement outcomes and exact duplicate states', () => {
    const metrics = (rmseDb: number, maxAbsDb: number): ErrorMetrics => ({
      maeDb: rmseDb / 2,
      rmseDb,
      maxAbsDb,
      maxAbsFrequencyHz: 1_000,
    })
    const candidate: Filter = {
      id: 'candidate',
      enabled: true,
      type: 'PK',
      frequencyHz: 1_000,
      gainDb: 2,
      q: 1.5,
    }
    const cycle = {
      cycleIndex: 1,
      completed: true,
      coordinateTrials: 3,
      startMetrics: metrics(1, 2),
      endMetrics: metrics(0.8, 1.6),
      normalizedViolationGain: 0.4,
    }
    const record = (traceId: string, resultKey: string): StandardV2JointRefineRecord => ({
      traceId,
      origin: 'search',
      boundaryMode: 'sign-crossing',
      parentKey: 'parent',
      parentFilterCount: 1,
      parentMetrics: metrics(1.2, 2.4),
      candidateKey: 'candidate',
      candidate: {
        filter: { ...candidate },
        featureIndex: 4,
        boundaryMode: 'sign-crossing',
        qScale: 1,
        cheapScore: 12,
      },
      refinementKey: 'same-state',
      resultKey,
      resultMetrics: metrics(0.8, 1.6),
      cycles: [{
        ...cycle,
        startMetrics: { ...cycle.startMetrics },
        endMetrics: { ...cycle.endMetrics },
      }],
      completedCycles: 1,
      coordinateTrials: 3,
      expired: false,
    })

    const telemetry = createResearchTelemetry({ mode: 'deep', nowMs: () => 0 })
    const first = record('search:1', 'result')
    telemetry.trace.onJointRefineTrace?.(first)
    first.candidate.filter.gainDb = 999
    telemetry.trace.onJointRefineRetention?.({
      traceId: 'search:1', stage: 'parent', retained: true,
    })
    telemetry.trace.onJointRefineRetention?.({
      traceId: 'search:1', stage: 'active', retained: true,
    })
    telemetry.trace.onBestDeliverableUpdated?.({
      metrics: metrics(0.8, 1.6),
      filters: [{ ...candidate }],
      preampDb: 0,
      sourceSolutionKey: 'result',
    })
    telemetry.trace.onJointRefineRetention?.({
      traceId: 'search:3', stage: 'parent', retained: true,
    })
    telemetry.trace.onJointRefineTrace?.(record('search:2', 'result-2'))
    telemetry.trace.onJointRefineTrace?.(record('search:3', 'result-3'))

    const snapshot = telemetry.snapshot()
    expect(snapshot.jointRefinements).toHaveLength(3)
    expect(snapshot.jointRefinements[0]).toMatchObject({
      traceId: 'search:1',
      equivalentStateAlreadyPaid: false,
      survivedParentRetention: true,
      survivedActivePathRetention: true,
      contributedToBestDeliverable: true,
    })
    expect(snapshot.jointRefinements[0]!.candidate.filter.gainDb).toBe(2)
    expect(snapshot.jointRefinements[1]).toMatchObject({
      traceId: 'search:2',
      equivalentStateAlreadyPaid: true,
      survivedParentRetention: false,
      survivedActivePathRetention: false,
      contributedToBestDeliverable: false,
    })
    expect(snapshot.jointRefinements[2]).toMatchObject({
      traceId: 'search:3',
      survivedParentRetention: true,
    })
  })
})
