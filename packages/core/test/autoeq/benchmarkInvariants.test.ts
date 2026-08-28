import { describe, expect, it } from 'vitest'

import {
  AUTOEQ_PRODUCT_LIMITS,
  calculatePreampDb,
  MVP_NUMERIC_POLICY,
  POWERAMP_MANUAL_ENTRY_POLICY,
  runStandardAutoEq,
} from '../../src/index.js'
import { BENCHMARK_CASES } from '../../benchmarks/cases.js'

const EXPECTED_CASE_IDS = [
  'flat_identity',
  'broad_bass_shelf',
  'single_mid_peak',
  'vocal_multi_feature',
  'irregular_treble',
  'narrow_feature',
  'filter_budget',
  'quantization_sensitive',
  'preamp_overlap',
  'opposing_filters_pressure',
]

const onStep = (value: number, step: number) =>
  Math.abs(value / step - Math.round(value / step)) < 1e-9

describe('Standard-v1 benchmark invariants', () => {
  it('contains exactly the ten approved synthetic cases', () => {
    expect(BENCHMARK_CASES.map(({ id }) => id)).toEqual(EXPECTED_CASE_IDS)
    expect(BENCHMARK_CASES.every(({ source, target }) =>
      source.metadata.synthetic === true && target.metadata.synthetic === true
    )).toBe(true)
  })

  it('keeps delivered results bounded, deterministic, and safely preamped', () => {
    for (const benchmarkCase of BENCHMARK_CASES) {
      const result = runStandardAutoEq(benchmarkCase)
      const runAgain = runStandardAutoEq(benchmarkCase)

      expect(result.filters.length).toBeLessThanOrEqual(benchmarkCase.settings.maxFilters)
      expect(result.filters.every((filter) =>
        filter.frequencyHz >= AUTOEQ_PRODUCT_LIMITS.minFrequencyHz &&
        filter.frequencyHz <= AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz &&
        filter.gainDb >= AUTOEQ_PRODUCT_LIMITS.minGainDb &&
        filter.gainDb <= AUTOEQ_PRODUCT_LIMITS.maxGainDb &&
        filter.q >= AUTOEQ_PRODUCT_LIMITS.minQ &&
        filter.q <= AUTOEQ_PRODUCT_LIMITS.maxQ &&
        onStep(filter.frequencyHz, POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz) &&
        onStep(filter.gainDb, POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb) &&
        onStep(filter.q, POWERAMP_MANUAL_ENTRY_POLICY.qStep)
      )).toBe(true)
      expect(result.filters.every((filter) => filter.gainDb !== 0)).toBe(true)
      expect(result.cancellationAudit.pairs.some(({ severity }) => severity === 'strong')).toBe(false)

      const preamp = calculatePreampDb(result.filters, MVP_NUMERIC_POLICY.sampleRateHz)
      expect(result.preampDb).toBe(preamp.preampDb)
      expect(result.preampDb).toBeLessThanOrEqual(-preamp.maxBoostDb + 1e-10)
      expect(runAgain.filters).toEqual(result.filters)
      expect(runAgain.metrics).toEqual(result.metrics)
    }
  }, 120_000)

  it('delivers no filters for flat identity', () => {
    const identity = BENCHMARK_CASES.find(({ id }) => id === 'flat_identity')!
    expect(runStandardAutoEq(identity).filters).toHaveLength(0)
  })
})
