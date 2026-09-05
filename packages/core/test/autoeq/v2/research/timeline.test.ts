import { describe, expect, it } from 'vitest'

import {
  createResearchTelemetry,
  RESEARCH_BANDS,
} from '../../../../benchmarks/research/telemetry.js'
import {
  calculateTimeToQuality,
  projectTimeline,
  RESEARCH_TIMELINE_MARKS_MS,
} from '../../../../benchmarks/research/timeline.js'
import type { ResearchCheckpoint } from '../../../../benchmarks/research/types.js'

function checkpoint(
  elapsedMs: number,
  rmseDb: number,
  maxAbsDb: number,
  filterCount = 1,
): ResearchCheckpoint {
  return {
    elapsedMs,
    metrics: {
      maeDb: rmseDb / 2,
      rmseDb,
      maxAbsDb,
      maxAbsFrequencyHz: 1_000,
    },
    filterCount,
  }
}

describe('research quality timeline', () => {
  it('uses the fixed reporting-only regional bands', () => {
    expect(RESEARCH_BANDS).toEqual([
      { id: 'bass', minHz: 20, maxHz: 200 },
      { id: 'low-mid', minHz: 200, maxHz: 1_000 },
      { id: 'mid', minHz: 1_000, maxHz: 4_000 },
      { id: 'presence', minHz: 4_000, maxHz: 8_000 },
      { id: 'treble', minHz: 8_000, maxHz: 20_000 },
    ])
  })

  it('projects monotonic best-safe checkpoints onto fixed observation marks', () => {
    expect(RESEARCH_TIMELINE_MARKS_MS).toEqual([
      500, 1_000, 2_000, 3_000, 5_000, 10_000,
      15_000, 20_000, 30_000, 45_000, 60_000,
    ])

    const projected = projectTimeline([
      checkpoint(400, 1.2, 2.5),
      checkpoint(900, 0.8, 1.7),
      checkpoint(950, 1.1, 2.1),
      checkpoint(1_800, 0.4, 1.2),
    ], [500, 1_000, 2_000])

    expect(projected).toEqual([
      checkpoint(500, 1.2, 2.5),
      checkpoint(1_000, 0.8, 1.7),
    ])
  })

  it('calculates first threshold crossings and preserves null failures', () => {
    const checkpoints = [
      checkpoint(400, 1.2, 2.5),
      checkpoint(900, 0.8, 1.7),
      checkpoint(950, 1.1, 2.1),
      checkpoint(1_800, 0.4, 1.2),
      checkpoint(3_000, 0.2, 0.7),
    ]

    expect(calculateTimeToQuality(checkpoints)).toEqual({
      rmse100Ms: 900,
      rmse075Ms: 1_800,
      rmse050Ms: 1_800,
      rmse035Ms: 3_000,
      rmse025Ms: 3_000,
      maxAbs200Ms: 900,
      maxAbs150Ms: 1_800,
      maxAbs100Ms: 3_000,
      maxAbs075Ms: 3_000,
      jointTargetMs: 3_000,
    })

    expect(calculateTimeToQuality([
      checkpoint(400, 1.2, 2.5),
    ])).toMatchObject({
      rmse025Ms: null,
      maxAbs075Ms: null,
      jointTargetMs: null,
    })
  })

  it('keeps light timing separate from deep phase profiling and records run termination', () => {
    let lightClockCalls = 0
    const light = createResearchTelemetry({
      mode: 'light',
      nowMs: () => {
        lightClockCalls += 1
        return lightClockCalls * 10
      },
    })
    light.trace.onPhaseStart?.('prepare')
    light.trace.onPhaseEnd?.('prepare')
    light.trace.onBestDeliverableUpdated?.({
      metrics: checkpoint(0, 0.8, 1.5).metrics,
      filters: [],
      preampDb: 0,
    })

    const lightSnapshot = light.snapshot()
    expect(lightClockCalls).toBe(3)
    expect(lightSnapshot.checkpoints.map(({ elapsedMs }) => elapsedMs)).toEqual([10, 20])

    let deepClock = 100
    const deep = createResearchTelemetry({
      mode: 'deep',
      nowMs: () => {
        deepClock += 10
        return deepClock
      },
    })
    deep.trace.onPhaseStart?.('prepare')
    deep.trace.onPhaseEnd?.('prepare')

    expect(deep.snapshot().phaseTimingMs.prepare).toBe(10)
  })
})
