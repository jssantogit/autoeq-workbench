import { calculateErrorMetrics } from '../../../../src/metrics/errorMetrics.js'
import {
  DEFAULT_AUTOEQ_SETTINGS,
  resolveStandardAutoEqV2Config,
  type AutoEqResultV2,
  type StandardAutoEqInputV2,
} from '../../../../src/index.js'
import { describe, expect, it } from 'vitest'

import { prepareResearchDesired, loadResearchCases } from '../../../../benchmarks/research/corpus.js'
import { runResearchCell } from '../../../../benchmarks/research/run.js'

function fakeResult(input: StandardAutoEqInputV2, caseId: 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'): AutoEqResultV2 {
  const prepared = prepareResearchDesired(caseId)
  const metrics = calculateErrorMetrics(prepared.desiredDb, prepared.frequenciesHz)
  const config = resolveStandardAutoEqV2Config(input.settings)
  return {
    filters: [],
    metrics,
    preampDb: 0,
    cancellationAudit: { pairs: [], totalScore: 0 },
    manifest: {
      schemaVersion: 3,
      algorithmVersion: 'standard-v2',
      profile: 'Standard',
      sampleRateHz: config.sampleRateHz,
      fitPointsPerOctave: config.fitPointsPerOctave,
      autoeqSettings: { ...input.settings },
      normalization: { ...input.normalization },
      sourceName: input.source.name,
      targetName: input.target.name,
      algorithmParameters: { ...config.algorithm },
      finalFilters: [],
      metrics: { ...metrics },
      preampDb: 0,
      cancellationAudit: { pairs: [], totalScore: 0 },
      terminationReason: 'converged',
      targetAchieved: false,
    },
  }
}

describe('research runner', () => {
  it('assembles a verified row from an injected trace-producing runner', async () => {
    const caseId = 'titan-to-storm' as const
    const expectedCases = loadResearchCases()
    let clockIndex = 0
    const clock = () => [0, 400, 900, 1_800, 3_000][clockIndex++] ?? 3_000

    const row = await runResearchCell({
      caseId,
      budgetSeconds: 15,
      maxFilters: 10,
      repeatIndex: 0,
      telemetryMode: 'light',
      nowMs: clock,
      run: (input, runtime) => {
        expect(input.source).toEqual(expectedCases[0]!.source)
        expect(input.target).toEqual(expectedCases[0]!.target)
        expect(input.settings).toMatchObject({ timeLimitSeconds: 15, maxFilters: 10 })

        const trace = runtime.researchTrace!
        trace.onBoundaryModeAttempt?.('half-height')
        trace.onCandidatesGenerated?.(4)
        trace.onCandidatesShortlisted?.(2)
        trace.onWorkingCheckpoint?.()
        trace.onJointRefineCompleted?.(3)
        trace.onDeliverableBuilt?.()
        for (const [rmseDb, maxAbsDb] of [
          [1.2, 2.5],
          [0.8, 1.7],
          [0.4, 1.2],
          [0.2, 0.7],
        ]) {
          trace.onBestDeliverableUpdated?.({
            metrics: {
              maeDb: rmseDb / 2,
              rmseDb,
              maxAbsDb,
              maxAbsFrequencyHz: 1_000,
            },
            filters: [],
            preampDb: 0,
          })
        }
        return fakeResult(input, caseId)
      },
    })

    expect(row.caseId).toBe(caseId)
    expect(row.final.deliveredFilterCount).toBe(0)
    expect(row.bands.map(({ id }) => id)).toEqual([
      'bass', 'low-mid', 'mid', 'presence', 'treble',
    ])
    expect(row.counters).toMatchObject({
      boundaryModeAttempts: 1,
      candidatesGenerated: 4,
      candidatesShortlisted: 2,
      workingCheckpoints: 1,
      deliverablesBuilt: 1,
      jointRefinementCount: 1,
      jointCoordinateTrials: 3,
    })
    expect(row.timeToQuality).toMatchObject({
      rmse100Ms: 900,
      rmse075Ms: 1_800,
      jointTargetMs: 3_000,
    })
    expect(row.timeline.slice(0, 4).map(({ elapsedMs, metrics }) => [elapsedMs, metrics.rmseDb])).toEqual([
      [500, 1.2],
      [1_000, 0.8],
      [2_000, 0.4],
      [3_000, 0.2],
    ])
  })
})
