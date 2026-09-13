import { describe, expect, it } from 'vitest'

import {
  createSyntheticCapacityProbeSequence,
  loadSyntheticGroundTruthCorpus,
  runSyntheticCapacityThresholdProbe,
} from '../../../../benchmarks/research/syntheticCorpus.js'
import type { Filter } from '../../../../src/types/filter.js'

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
      // The equality checks provenance: knownStructuralComplexity records the
      // number of filters used to generate this fixture, not a proof that the
      // delivered response cannot be represented with fewer filters.
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

  it('evaluates matched fixed-capacity trajectories for the threshold probes', () => {
    const value = loadSyntheticGroundTruthCorpus().find(({ family }) => family === 'sparse-structural')!
    const result = runSyntheticCapacityThresholdProbe(value, {
      checkpointSeconds: [1],
      stageQuantumMs: 1_000,
      nowMs: () => 0,
      run: ({ config, seedFilters }): { filters: Filter[]; rmseDb: number; maxAbsDb: number } => {
        const filters = [...(seedFilters ?? [])]
        if (filters.length < config.maxFilters) filters.push({ id: `synthetic-${filters.length}`, enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 })
        return { filters, rmseDb: 1 / Math.max(1, filters.length), maxAbsDb: 1 / Math.max(1, filters.length) }
      },
    })
    expect(result.ceilings).toEqual([2, 3, 4])
    expect(result.trajectories.map(({ capacity }) => capacity)).toEqual([2, 3, 4])
    expect(result.trajectories.every(({ checkpoints }) => checkpoints.length === 1)).toBe(true)
  })
})
