import { describe, expect, it } from 'vitest'

import {
  assertC3BatchACaseIds,
  C3_BATCH_A_CASE_IDS,
  C3_BATCH_B_CASE_IDS,
  C3_BATCH_C_CASE_IDS,
  C3_OLD_STRUCTURAL_VNEXT_CASE_IDS,
  computeCumulativeFrontier,
  computeExactCountSeries,
  runC3ObserverFidelity,
  resolveC3SearchConfig,
  selectGeometricKnee,
  type C3ObservedState,
} from '../../../../benchmarks/research/c3FilterKneeCensus.js'
import type { Filter } from '../../../../src/types/filter.js'

function filter(id: string, gainDb = 1, frequencyHz = 1_000): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q: 1 }
}

function observed(
  filterCount: number,
  rmseDb: number,
  maxAbsDb = rmseDb,
  overrides: Partial<C3ObservedState> = {},
): C3ObservedState {
  return {
    filterStateKey: `state-${filterCount}-${rmseDb}-${maxAbsDb}`,
    filters: Array.from({ length: filterCount }, (_, index) => filter(`f-${index}`)),
    rmseDb,
    maxAbsDb,
    maeDb: rmseDb,
    cancellationScore: 0,
    stage: 'test',
    ...overrides,
  }
}

describe('C3 filter-count/error frontier geometry', () => {
  it('keeps the best frozen-baseline state for each exact filter count', () => {
    const exact = computeExactCountSeries([
      observed(2, 0.5, 0.8, { filterStateKey: 'worse' }),
      observed(2, 0.4, 0.9, { filterStateKey: 'better-rmse' }),
      observed(2, 0.4, 0.7, { filterStateKey: 'better-max' }),
      observed(1, 0.6, 0.6, { filterStateKey: 'one' }),
    ])

    expect(exact.map((point) => point.N)).toEqual([1, 2])
    expect(exact.find((point) => point.N === 2)?.filterStateKey).toBe('better-max')
  })

  it('builds a cumulative non-increasing frontier with evaluated representatives', () => {
    const exact = computeExactCountSeries([
      observed(1, 10, 10, { filterStateKey: 'one' }),
      observed(2, 4, 4, { filterStateKey: 'two' }),
      observed(3, 5, 5, { filterStateKey: 'three-worse' }),
      observed(4, 1, 1, { filterStateKey: 'four' }),
    ])
    const frontier = computeCumulativeFrontier(exact)

    expect(frontier.map((point) => point.N)).toEqual([1, 2, 3, 4])
    expect(frontier.map((point) => point.normalizedViolation)).toEqual([40, 16, 16, 4])
    expect(frontier[2]?.filterStateKey).toBe('two')
    expect(frontier.every((point, index) => index === 0 ||
      point.normalizedViolation <= frontier[index - 1]!.normalizedViolation)).toBe(true)
  })

  it('finds the unique positive geometric elbow', () => {
    const frontier = computeCumulativeFrontier(computeExactCountSeries([
      observed(1, 10, 10),
      observed(2, 2, 2),
      observed(3, 1, 1),
    ]))

    expect(selectGeometricKnee(frontier)).toMatchObject({
      status: 'UNIQUE_KNEE',
      N_knee: 2,
    })
  })

  it('returns no unique knee for a straight line', () => {
    const frontier = computeCumulativeFrontier(computeExactCountSeries([
      observed(1, 10, 10),
      observed(2, 5.5, 5.5),
      observed(3, 1, 1),
    ]))

    expect(selectGeometricKnee(frontier).status).toBe('NO_UNIQUE_KNEE')
  })

  it('returns no unique knee when the maximum distance is tied', () => {
    const frontier = computeCumulativeFrontier(computeExactCountSeries([
      observed(1, 1, 1),
      observed(2, 0.4, 0.4),
      observed(3, 1 / 15, 1 / 15),
      observed(4, 0, 0),
    ]))

    expect(selectGeometricKnee(frontier).status).toBe('NO_UNIQUE_KNEE')
  })

  it('returns no unique knee for an insufficient frontier', () => {
    const frontier = computeCumulativeFrontier(computeExactCountSeries([
      observed(1, 1, 1),
      observed(2, 0.5, 0.5),
    ]))

    expect(selectGeometricKnee(frontier)).toMatchObject({
      status: 'NO_UNIQUE_KNEE',
      reason: 'INSUFFICIENT_FRONTIER',
    })
  })

  it('resolves the established C43/e6 q31 full-work envelope', () => {
    expect(resolveC3SearchConfig()).toMatchObject({
      maxFilters: 43,
      beamWidth: 16,
      proposalsPerParent: 32,
      localPolishEvaluations: 120,
      admission: 'q31-b4-p8',
      workProfile: 'full',
    })
  })

  it('proves deterministic observer OFF/ON fidelity under a bounded replay', () => {
    const config = {
      ...resolveC3SearchConfig(),
      maxFilters: 2,
      beamWidth: 2,
      proposalsPerParent: 4,
    }
    const fidelity = runC3ObserverFidelity({
      frequenciesHz: [100, 500, 1_000, 2_000, 10_000],
      desiredDb: [0, 5, 0, 3, 0],
      sampleRateHz: 48_000,
    }, { config, maxGenerations: 3 })

    expect(fidelity.equivalent).toBe(true)
    expect(fidelity.resultEqual).toBe(true)
    expect(fidelity.completedGenerationCountEqual).toBe(true)
    expect(fidelity.retainedBeamSequenceEqual).toBe(true)
    expect(fidelity.workCountersEqual).toBe(true)
    expect(fidelity.naturalTerminationEqual).toBe(true)
    expect(fidelity.traceEqual).toBe(true)
    expect(fidelity.on.observations.length).toBeGreaterThan(0)
  })

  it('seals C3 to exactly Batch A and rejects Batch B, C, and old six-case IDs', () => {
    expect(() => assertC3BatchACaseIds(C3_BATCH_A_CASE_IDS)).not.toThrow()
    expect(() => assertC3BatchACaseIds(C3_BATCH_B_CASE_IDS)).toThrow(/Batch B/)
    expect(() => assertC3BatchACaseIds(C3_BATCH_C_CASE_IDS)).toThrow(/Batch C/)
    expect(() => assertC3BatchACaseIds(C3_OLD_STRUCTURAL_VNEXT_CASE_IDS)).toThrow(/old Structural VNext/)
  })
})
