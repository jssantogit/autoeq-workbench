import { describe, expect, it } from 'vitest'

import {
  createSyntheticCapacityProbeSequence,
  loadSyntheticGroundTruthCorpus,
} from '../../../../benchmarks/research/syntheticCorpus.js'

describe('deterministic synthetic ground-truth corpus', () => {
  it('covers the documented structural-search families with reproducible cascades', () => {
    const first = loadSyntheticGroundTruthCorpus()
    const second = loadSyntheticGroundTruthCorpus()
    expect(first.map(({ family }) => family)).toEqual([
      'easy-broadband',
      'sparse-structural',
      'mixed-shelf-peaks',
      'dense-known-structure',
      'high-q-valid',
      'upper-frequency-structure',
      'broad-deep-dip',
      'alternating-structure',
    ])
    expect(second).toEqual(first)
    for (const value of first) {
      expect(value.knownStructuralComplexity).toBe(value.truthFilters.length)
      expect(value.desiredDb).toHaveLength(value.frequenciesHz.length)
      expect(value.seed).toBeGreaterThan(0)
      expect(value.frequenciesHz[0]).toBe(20)
      expect(value.frequenciesHz.at(-1)).toBe(20_000)
    }
  })

  it('derives below/at/above capacity probes from known complexity', () => {
    const dense = loadSyntheticGroundTruthCorpus().find(({ family }) => family === 'dense-known-structure')!
    expect(createSyntheticCapacityProbeSequence(dense)).toEqual([
      dense.knownStructuralComplexity - 1,
      dense.knownStructuralComplexity,
      dense.knownStructuralComplexity + 1,
    ])
  })
})
