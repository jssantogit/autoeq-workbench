import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  resolveStandardAutoEqV2Config,
} from '../../../../src/index.js'
import {
  calculateResearchDeliveredMetrics,
  evaluateQuantizationStress,
  evaluateSampleRateReplay,
} from '../../../../benchmarks/research/deliveredMetrics.js'
import { loadSyntheticGroundTruthCorpus } from '../../../../benchmarks/research/syntheticCorpus.js'

describe('delivered research metrics', () => {
  const value = loadSyntheticGroundTruthCorpus()[0]!

  it('reports rich band metrics and non-comparator complexity observations', () => {
    const report = calculateResearchDeliveredMetrics(
      value.truthFilters,
      value.desiredDb,
      value.frequenciesHz,
      value.sampleRateHz,
    )
    expect(report.metrics.rmseDb).toBeLessThan(1e-10)
    expect(report.bands.map(({ id }) => id)).toEqual(['20-5k', '20-8k', '20-10k', '20-14k', 'main-band'])
    expect(report.complexity).toMatchObject({ filterCount: 2, qMedian: 0.7, qP90: 0.7, qMax: 0.7, maxAbsGainDb: 4, countQAbove4: 0 })
    expect(report.weightedMaeDb).toBeNull()
  })

  it('replays repository V2 quantization and sample-rate response without changing filters', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const filters = value.truthFilters.map((filter) => ({
      ...filter,
      frequencyHz: filter.frequencyHz + 0.4,
      gainDb: filter.gainDb + 0.04,
      q: filter.type === 'PK' ? filter.q + 0.004 : filter.q,
    }))
    const quantized = evaluateQuantizationStress(filters, value.desiredDb, value.frequenciesHz, config)
    expect(quantized.quantizedFilters).not.toEqual(filters)
    expect(Number.isFinite(quantized.quantizedMetrics.metrics.rmseDb)).toBe(true)
    expect(Number.isFinite(quantized.deltaMaeDb)).toBe(true)

    const replay = evaluateSampleRateReplay(filters, value.desiredDb, value.frequenciesHz, [44_100, 48_000, 96_000])
    expect(replay.map(({ sampleRateHz }) => sampleRateHz)).toEqual([44_100, 48_000, 96_000])
    expect(replay.every(({ metrics }) => metrics.metrics.rmseDb >= 0)).toBe(true)
  })
})
