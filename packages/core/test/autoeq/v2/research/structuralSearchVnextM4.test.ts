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
  aggregateM4OracleEvidence,
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
    visitedSemanticKeysBefore: ['parent-semantic'],
    nextStates: [],
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

function q31Proposal(index: number): { mutation: 'add-pk'; filters: Filter[] } {
  return {
    mutation: 'add-pk',
    filters: [{
      id: `ordinary-${index}`,
      enabled: true,
      type: 'PK',
      frequencyHz: 100 + index * 100,
      gainDb: 0,
      q: 1,
    }],
  }
}

function q31Snapshot(
  ordinaryCount: number,
  ordinaryMetrics: (index: number) => { rmseDb: number; maxAbsDb: number },
  overrides: {
    visitedSemanticKeysBefore?: string[]
    nextStates?: StructuralSearchGenerationSnapshot['nextStates']
  } = {},
): StructuralSearchGenerationSnapshot {
  const base = snapshot([])
  const ordinary = Array.from({ length: ordinaryCount }, (_, index) => {
    const proposal = q31Proposal(index)
    const metrics = ordinaryMetrics(index)
    return {
      proposal,
      semanticKey: JSON.stringify(proposal.filters.map(({ id: _id, ...filter }) => filter)),
      prePolish: {
        filters: proposal.filters,
        ...metrics,
        cancellationScore: 0,
        filterCount: proposal.filters.length,
        lexicalRank: index,
        semanticKey: JSON.stringify(proposal.filters.map(({ id: _id, ...filter }) => filter)),
        comparatorKey: [metrics.rmseDb, metrics.maxAbsDb, proposal.filters.length, 0, index],
      },
      postPolish: null,
      coordinateTrials: 0,
      polishEvaluationBudget: 0,
      acceptedNextState: false,
    }
  })
  const proposals = ordinary.map((entry) => entry.proposal)
  return {
    ...base,
    visitedSemanticKeysBefore: overrides.visitedSemanticKeysBefore ?? base.visitedSemanticKeysBefore,
    nextStates: overrides.nextStates ?? base.nextStates,
    parents: [{
      ...base.parents[0]!,
      generatedProposals: proposals,
      admittedProposals: proposals,
      prePolishCandidates: ordinary,
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
    const evaluation = evaluateM4GenerationSnapshot(snapshot([]), bounds, { proposalsPerParent: 8 })

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
    expect(captured[0]!.visitedSemanticKeysBefore).toEqual([
      captured[0]!.beamBefore[0]!.semanticKey,
    ])
    expect(captured[0]!.nextStates).toEqual(expect.any(Array))
    expect(captured[0]!.parents[0]).toMatchObject({
      prePolishCandidates: expect.arrayContaining([
        expect.objectContaining({ prePolish: expect.objectContaining({ lexicalRank: expect.any(Number) }) }),
      ]),
      polishedCandidates: expect.arrayContaining([
        expect.objectContaining({ acceptedNextState: expect.any(Boolean) }),
      ]),
    })
    const evaluation = evaluateM4GenerationSnapshot(captured[0]!, bounds, {
      localPolishEvaluations: config.localPolishEvaluations,
      beamWidth: config.beamWidth,
      proposalsPerParent: config.proposalsPerParent,
    })
    expect(instrumented).toEqual(baseline)
    expect(evaluation.metrics).toHaveProperty('candidatesGenerated')
    expect(evaluation.candidates.every((candidate) => candidate.enteredBaselineBeam === false)).toBe(true)
    expect(evaluation.candidates.every((candidate) =>
      candidate.work.coordinateTrials <= candidate.work.polishEvaluationBudget,
    )).toBe(true)
    expect(evaluation.candidates.every((candidate) => candidate.prePolish.comparatorKey.length > 0)).toBe(true)
    expect(evaluation.candidates.every((candidate) =>
      ['ORDINARY_ALREADY_GENERATED', 'NOVEL_Q31_REJECTED', 'VISITED_DUPLICATE', 'EXACT_BEAM_REJECTED', 'REFERENCE_NONIMPROVING', 'ONLINE_FEASIBLE_ORACLE_WIN']
        .includes(candidate.causalClassification),
    )).toBe(true)
    expect(evaluation.candidates.every((candidate) =>
      candidate.parentLocalQ31Admissible === null || typeof candidate.parentLocalQ31Admissible === 'boolean',
    )).toBe(true)
    expect(evaluation.candidates.every((candidate) => typeof candidate.ordinaryGenerated === 'boolean')).toBe(true)
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
      proposalsPerParent: config.proposalsPerParent,
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

  it('admits a qualifying novel oracle into an unused parent-local q31 slot', () => {
    const evaluation = evaluateM4GenerationSnapshot(
      q31Snapshot(7, () => ({ rmseDb: 0, maxAbsDb: 0 })),
      bounds,
      { proposalsPerParent: 8 },
    )
    const oracle = evaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')

    expect(oracle).toBeDefined()
    expect(oracle!.parentLocalQ31Admissible).toBe(true)
    expect(oracle!.parentLocalQ31DisplacedProposalKey).toBeNull()
  })

  it('replays full parent-local q31 competition and reports a displaced ordinary proposal', () => {
    const evaluation = evaluateM4GenerationSnapshot(
      q31Snapshot(8, () => ({ rmseDb: 100, maxAbsDb: 100 })),
      bounds,
      { proposalsPerParent: 8 },
    )
    const oracle = evaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')

    expect(oracle).toBeDefined()
    expect(oracle!.parentLocalQ31Admissible).toBe(true)
    expect(oracle!.parentLocalQ31DisplacedProposalKey).not.toBeNull()
  })

  it('rejects a tail-rank oracle from a full parent-local q31 admission', () => {
    const evaluation = evaluateM4GenerationSnapshot(
      q31Snapshot(8, () => ({ rmseDb: 0, maxAbsDb: 0 })),
      bounds,
      { proposalsPerParent: 8 },
    )
    const oracle = evaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')

    expect(oracle).toBeDefined()
    expect(oracle!.parentLocalQ31Admissible).toBe(false)
    expect(oracle!.parentLocalQ31DisplacedProposalKey).toBeNull()
  })

  it('classifies an oracle polish already present in visited state as a visited duplicate', () => {
    const ordinary = q31Snapshot(7, () => ({ rmseDb: 0, maxAbsDb: 0 }))
    const firstEvaluation = evaluateM4GenerationSnapshot(ordinary, bounds, { proposalsPerParent: 8 })
    const polishedSemanticKey = firstEvaluation.candidates.find((candidate) =>
      candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')!.polished.semanticKey
    const evaluation = evaluateM4GenerationSnapshot({
      ...ordinary,
      visitedSemanticKeysBefore: [...ordinary.visitedSemanticKeysBefore, polishedSemanticKey],
    }, bounds, { proposalsPerParent: 8 })
    const oracle = evaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')

    expect(oracle).toMatchObject({
      visitedBeforeGeneration: true,
      semanticallyNovel: false,
      causalClassification: 'VISITED_DUPLICATE',
    })
  })

  it('reconstructs the exact beam from beamBefore and ordinary nextStates only', () => {
    const ordinary = q31Snapshot(7, () => ({ rmseDb: 0, maxAbsDb: 0 }))
    const firstEvaluation = evaluateM4GenerationSnapshot(ordinary, bounds, { proposalsPerParent: 8 })
    const oracle = firstEvaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')!
    const unacceptedPolishedProposal = q31Proposal(100)
    const exactInput: StructuralSearchGenerationSnapshot = {
      ...ordinary,
      parents: [{
        ...ordinary.parents[0]!,
        admittedProposals: [...ordinary.parents[0]!.admittedProposals, unacceptedPolishedProposal],
        polishedCandidates: [{
          proposal: unacceptedPolishedProposal,
          semanticKey: 'unaccepted-polished',
          prePolish: null,
          postPolish: {
            ...ordinary.referenceBefore,
            candidateId: 'unaccepted-polished',
            filters: [],
            rmseDb: 0,
            maxAbsDb: 0,
            cancellationScore: 0,
            semanticKey: 'unaccepted-polished',
          },
          coordinateTrials: 0,
          polishEvaluationBudget: 0,
          acceptedNextState: false,
        }],
      }],
    }
    const evaluation = evaluateM4GenerationSnapshot(exactInput, bounds, { proposalsPerParent: 8 })
    const replayed = evaluation.candidates.find((candidate) => candidate.family === 'O1_RESIDUAL_EXTREMUM_PK')

    expect(replayed).toBeDefined()
    expect(replayed!.exactBeamSurvives).toBe(oracle.exactBeamSurvives)
    expect(replayed!.exactReferenceImproves).toBe(oracle.exactReferenceImproves)
    expect(replayed!.wouldSurviveFrozenParetoBeam).toBe(false)
  })

  it('computes the online-feasibility gate from de-duplicated deterministic cells', () => {
    const observedSnapshot = q31Snapshot(7, () => ({ rmseDb: 0, maxAbsDb: 0 }))
    const source = evaluateM4GenerationSnapshot(
      observedSnapshot,
      bounds,
      { proposalsPerParent: 8 },
    )
    const result = {
      ...source,
      candidates: source.candidates.map((candidate, index) => index === 0
        ? {
            ...candidate,
            classification: 'ORACLE_WIN' as const,
            causalClassification: 'ONLINE_FEASIBLE_ORACLE_WIN' as const,
            ordinaryGenerated: false,
            ordinaryAdmitted: false,
            parentLocalQ31Admissible: true,
            semanticallyNovel: true,
            exactBeamSurvives: true,
            exactReferenceImproves: true,
          }
        : candidate),
    }
    const observation = (repeatIndex: number) => ({
      caseId: 'case-a',
      family: 'real' as const,
      split: 'development' as const,
      repeatIndex,
      snapshot: observedSnapshot,
      result,
    })
    const aggregate = aggregateM4OracleEvidence([
      observation(0),
      observation(0),
      observation(1),
    ])

    expect(aggregate.causalCloseout.protocolCount.O1_RESIDUAL_EXTREMUM_PK.historicalOracleWin).toBe(3)
    expect(aggregate.causalCloseout.deterministicCount.O1_RESIDUAL_EXTREMUM_PK.historicalOracleWin).toBe(1)
    expect(aggregate.causalCloseout.onlineCoverage).toMatchObject({
      developmentCases: 1,
      holdoutCases: 0,
      overallCases: 1,
      distinctCaseGenerationCells: 1,
    })
  })
})
