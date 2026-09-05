import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  searchStandardV2WorkingSolutions,
  type ErrorMetrics,
  type Filter,
  type V2CandidateBoundaryMode,
} from '../../../src/index.js'

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

interface ObservedBatch {
  boundaryMode: V2CandidateBoundaryMode
  parentFilterCount: number
  parentMetrics: ErrorMetrics
  candidates: Array<{
    fastRank: number
    fastMetrics: ErrorMetrics
    continuedMetrics: ErrorMetrics
  }>
}

describe('Standard v2 staged-rank research telemetry', () => {
  it('reports fast-to-continuation rank batches without changing search output', () => {
    const frequencies = createEvaluationGrid()
    const desiredDb = evaluateV2Solution([
      pk('a', 90, 2, 1.2),
      pk('b', 220, -2.4, 1.5),
      pk('c', 520, 2.8, 1.8),
      pk('d', 1_200, -3, 2),
      pk('e', 2_600, 3.2, 2.4),
      pk('f', 5_200, -3, 2.8),
      pk('g', 9_000, 2.5, 3),
      pk('h', 15_000, -2, 2.5),
    ], [], frequencies, 48_000).cascadeDb
    const config = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 1,
    })
    const searchInput = {
      desiredDb,
      frequencies,
      config: { ...config, workingMaxFilters: 1 },
      deadline: { isExpired: () => false },
      boundaryMode: 'sign-crossing' as const,
    }
    const control = searchStandardV2WorkingSolutions(searchInput)
    const batches: ObservedBatch[] = []

    const traced = searchStandardV2WorkingSolutions({
      ...searchInput,
      researchTrace: {
        onStagedContinuationBatch: (batch: ObservedBatch) => batches.push(batch),
      },
    })

    expect(traced).toEqual(control)
    expect(batches.length).toBeGreaterThan(0)
    expect(batches[0]!.boundaryMode).toBe('sign-crossing')
    expect(batches[0]!.parentFilterCount).toBe(0)
    expect(batches[0]!.candidates.map((candidate) => candidate.fastRank)).toEqual([1, 2, 3])
  })
})
