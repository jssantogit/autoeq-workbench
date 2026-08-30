import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  runStandardAutoEqV2,
  type Curve,
  type StandardAutoEqInputV2,
  type StandardV2ResearchTrace,
} from '../../../../src/index.js'

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
})
