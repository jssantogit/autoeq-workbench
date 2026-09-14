import { describe, expect, it } from 'vitest'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type StructuralSearchGenerationSnapshot,
} from '../../../../src/autoeq/v2/structuralSearch.js'
import {
  M4_DETERMINISTIC_GENERATION_BOUND,
  M4_SNAPSHOT_STRIDE,
  evaluateM4GenerationSnapshot,
  generateM4OracleCandidates,
  selectM4SnapshotGeneration,
  type M4OracleFamily,
} from '../../../../benchmarks/research/structuralSearchVnextM4.js'
import { DEFAULT_AUTOEQ_SETTINGS, resolveStandardAutoEqV2Config } from '../../../../src/index.js'
import type { Filter } from '../../../../src/types/filter.js'

const bounds = resolveStandardAutoEqV2Config({
  ...DEFAULT_AUTOEQ_SETTINGS,
  maxFilters: 10,
})

const parentFilters: Filter[] = [
  { id: 'parent-pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 },
]

function snapshot(filters: Filter[] = parentFilters): StructuralSearchGenerationSnapshot {
  const parent = {
    candidateId: 'parent',
    filters,
    rmseDb: 2,
    maxAbsDb: 3,
    cancellationScore: 0,
    semanticKey: 'parent-semantic',
    comparatorKey: [1, 4, 2, 3, 0, 1, 'parent'],
    structuralSignature: 'PK:0',
  }
  return {
    type: 'ordinary-baseline-generation',
    generation: 0,
    frequencies: [100, 500, 1_000, 2_000, 10_000],
    desiredDb: [0, 5, 0, 3, 0],
    sampleRateHz: 48_000,
    referenceBefore: parent,
    referenceAfter: parent,
    beamBefore: [parent],
    retainedBeam: [parent],
    parents: [{
      parent,
      residualDb: [0, 5, 0, 3, 0],
      generatedProposals: [],
      admittedProposals: [],
      prePolishCandidates: [],
      polishedCandidates: [],
    }],
  }
}

describe('structural-search M4 candidate-oracle diagnostics', () => {
  it('uses a frozen first/every-N/final generation sampling rule', () => {
    expect(M4_DETERMINISTIC_GENERATION_BOUND).toBe(21)
    expect(M4_SNAPSHOT_STRIDE).toBe(10)
    expect(selectM4SnapshotGeneration(0, false)).toBe(true)
    expect(selectM4SnapshotGeneration(1, false)).toBe(false)
    expect(selectM4SnapshotGeneration(10, false)).toBe(true)
    expect(selectM4SnapshotGeneration(11, true)).toBe(true)

    const capturedByBound = Array.from({ length: M4_DETERMINISTIC_GENERATION_BOUND }, (_, generation) => generation)
      .filter((generation) => selectM4SnapshotGeneration(generation))
    expect(capturedByBound).toEqual([0, 10, 20])
  })

  it('captures a natural terminal generation even when it is not a stride generation', () => {
    const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
    const captured: StructuralSearchGenerationSnapshot[] = []
    let naturalStopGeneration: number | null = null
    const seedFilters: Filter[] = [{
      id: 'natural-stop-seed',
      enabled: true,
      type: 'PK',
      frequencyHz: 1_000,
      gainDb: 2,
      q: 1,
    }]
    runStructuralSearch({
      desiredDb: [0, 0],
      frequencies: [100, 10_000],
      sampleRateHz: 48_000,
      config,
      seedFilters,
      deadline: { isExpired: () => false },
      onTrace: (event) => {
        if (event.type === 'beam-stop' && event.reason === 'no-next-states') {
          naturalStopGeneration = event.generation ?? null
        }
      },
      captureBaselineGeneration: (generation, isFinal) =>
        selectM4SnapshotGeneration(generation, isFinal),
      onBaselineSnapshot: (value) => captured.push(value),
    })

    expect(naturalStopGeneration).toBeGreaterThan(0)
    expect(naturalStopGeneration).not.toBe(10)
    expect(captured.map((value) => value.generation)).toEqual([0, naturalStopGeneration])
  })

  it('keeps family-local candidate absence separate from generation-global absence', () => {
    const evaluation = evaluateM4GenerationSnapshot(snapshot([]), bounds)

    expect(evaluation.byFamily.O4_TOPOLOGY_SUBSTITUTION.familyLocalCandidateAbsence).toBe(1)
    expect(evaluation.byFamily.O4_TOPOLOGY_SUBSTITUTION.classifications.NO_STRUCTURAL_CANDIDATE).toBe(1)
    expect(evaluation.decomposition.NO_STRUCTURAL_CANDIDATE).toBe(0)
  })

  it('constructs deterministic O1/O2/O3 candidates and rejects semantic duplicates', () => {
    const first = generateM4OracleCandidates(snapshot(), bounds)
    const second = generateM4OracleCandidates(snapshot(), bounds)
    expect(first).toEqual(second)
    expect(first.map((candidate) => candidate.family)).toEqual(expect.arrayContaining([
      'O1_RESIDUAL_EXTREMUM_PK',
      'O2_RESIDUAL_REGION_PK',
    ] satisfies M4OracleFamily[]))
    expect(new Set(first.map((candidate) => candidate.semanticKey)).size).toBe(first.length)
    expect(first.filter((candidate) => candidate.family !== 'O4_TOPOLOGY_SUBSTITUTION').every((candidate) => candidate.filters.length === 2)).toBe(true)
    expect(first.filter((candidate) => candidate.family === 'O4_TOPOLOGY_SUBSTITUTION').every((candidate) => candidate.filters.length === 1)).toBe(true)
  })

  it('preserves observer-only baseline equivalence while evaluating an oracle offline', () => {
    const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
    const input = {
      desiredDb: [0, 5, 0, 3, 0],
      frequencies: [100, 500, 1_000, 2_000, 10_000],
      sampleRateHz: 48_000,
      config,
      seedFilters: [],
    }
    const makeDeadline = () => {
      let calls = 0
      return { isExpired: () => ++calls > 80 }
    }
    const baseline = runStructuralSearch({ ...input, deadline: makeDeadline() })
    const captured: StructuralSearchGenerationSnapshot[] = []
    const instrumented = runStructuralSearch({
      ...input,
      deadline: makeDeadline(),
      captureBaselineGeneration: selectM4SnapshotGeneration,
      onBaselineSnapshot: (value) => captured.push(value),
    })
    expect(instrumented).toEqual(baseline)
    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0]).toMatchObject({
      frequencies: input.frequencies,
      desiredDb: input.desiredDb,
      parents: [{
        parent: { filters: expect.any(Array) },
        residualDb: expect.any(Array),
        generatedProposals: expect.any(Array),
        admittedProposals: expect.any(Array),
        prePolishCandidates: expect.any(Array),
        polishedCandidates: expect.any(Array),
      }],
      retainedBeam: expect.any(Array),
    })
    const evaluation = evaluateM4GenerationSnapshot(captured[0]!, bounds, {
      localPolishEvaluations: config.localPolishEvaluations,
      beamWidth: config.beamWidth,
    })
    expect(instrumented).toEqual(baseline)
    expect(evaluation.metrics).toHaveProperty('candidatesGenerated')
    expect(evaluation.candidates.every((candidate) => candidate.enteredBaselineBeam === false)).toBe(true)
    expect(evaluation.candidates.every((candidate) =>
      candidate.work.coordinateTrials <= candidate.work.polishEvaluationBudget,
    )).toBe(true)
    expect(evaluation.candidates.every((candidate) => candidate.prePolish.comparatorKey.length > 0)).toBe(true)
  })

  it('uses the same bounded equal-work polish budget for every oracle candidate', () => {
    const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
    const captured: StructuralSearchGenerationSnapshot[] = []
    runStructuralSearch({
      desiredDb: [0, 5, 0, 3, 0],
      frequencies: [100, 500, 1_000, 2_000, 10_000],
      sampleRateHz: 48_000,
      config,
      seedFilters: [],
      deadline: { isExpired: () => false },
      captureBaselineGeneration: (generation) => generation === 0,
      onBaselineSnapshot: (value) => captured.push(value),
    })
    const evaluation = evaluateM4GenerationSnapshot(captured[0]!, bounds, {
      localPolishEvaluations: config.localPolishEvaluations,
      beamWidth: config.beamWidth,
    })

    expect(evaluation.candidates.length).toBeGreaterThan(0)
    expect(new Set(evaluation.candidates.map((candidate) => candidate.work.polishEvaluationBudget)).size).toBe(1)
    expect(evaluation.candidates.every((candidate) =>
      candidate.work.coordinateTrials <= candidate.work.polishEvaluationBudget,
    )).toBe(true)
  })

  it('does not retain an unselected generation ledger', () => {
    const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
    const input = {
      desiredDb: [0, 5, 0, 3, 0],
      frequencies: [100, 500, 1_000, 2_000, 10_000],
      sampleRateHz: 48_000,
      config,
      seedFilters: [],
    }
    const makeDeadline = () => {
      let calls = 0
      return { isExpired: () => ++calls > 80 }
    }
    const baseline = runStructuralSearch({ ...input, deadline: makeDeadline() })
    const captured: StructuralSearchGenerationSnapshot[] = []
    const gated = runStructuralSearch({
      ...input,
      deadline: makeDeadline(),
      captureBaselineGeneration: () => false,
      onBaselineSnapshot: (value) => captured.push(value),
    })
    expect(gated).toEqual(baseline)
    expect(captured).toEqual([])
  })
})
