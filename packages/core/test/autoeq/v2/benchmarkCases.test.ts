import { describe, expect, it } from 'vitest'

import { V2_BENCHMARK_CASES } from '../../../benchmarks/v2Cases.js'
import { V2_HOLDOUT_CASES } from '../../../benchmarks/v2HoldoutCases.js'

describe('Standard v2 benchmark corpus', () => {
  it('contains the approved synthetic tuning and stress cases', () => {
    expect(V2_BENCHMARK_CASES.map(({ id }) => id)).toEqual([
      'bass_mid_mix',
      'alternating_2_8k',
      'dense_treble',
      'mixed_widths',
      'overlap',
      'near_budget',
      'quantization_sensitive',
      'overcomplete_compress',
      'stress_mid_treble',
      'stress_mixed_edges',
    ])
    expect(V2_BENCHMARK_CASES.every(({ source, target, settings }) =>
      source.metadata.synthetic === true &&
      target.metadata.synthetic === true &&
      settings.timeLimitSeconds === 60
    )).toBe(true)
    expect(V2_BENCHMARK_CASES.find(({ id }) => id === 'near_budget')!.settings.maxFilters)
      .toBe(8)
    expect(V2_BENCHMARK_CASES.find(({ id }) => id === 'overcomplete_compress')!.settings.maxFilters)
      .toBe(6)
  })

  it('keeps the approved holdout cases in a separate module', () => {
    expect(V2_HOLDOUT_CASES.map(({ id }) => id)).toEqual([
      'holdout_solvable_a',
      'holdout_solvable_b',
      'holdout_stress',
    ])
    expect(V2_HOLDOUT_CASES.every(({ source, target }) =>
      source.metadata.synthetic === true && target.metadata.synthetic === true
    )).toBe(true)
  })
})
