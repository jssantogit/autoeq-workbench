import { describe, expect, it } from 'vitest'

import {
  generateStructuralMutations,
  runStructuralBeam,
  type StructuralBeamProblem,
} from '../../../../benchmarks/research/structuralBeam.js'
import type { SolverLabCandidateV1, SolverLabEvaluationV1 } from '../../../../benchmarks/research/labProtocol.js'

const problem: StructuralBeamProblem = {
  problemId: 'synthetic-structural-beam',
  inputSha256: 'b'.repeat(64),
  frequenciesHz: [20, 100, 1_000, 10_000],
  sampleRateHz: 48_000,
  bounds: {
    minFrequencyHz: 20,
    maxFrequencyHz: 20_000,
    minGainDb: -15,
    maxGainDb: 15,
    minPkQ: 0.1,
    maxPkQ: 12,
    shelfQ: 0.7,
    maxFilters: 10,
  },
}

describe('TypeScript structural beam research component', () => {
  it('mirrors approved add/remove/type/split proposal geometry', () => {
    const proposals = generateStructuralMutations(
      problem,
      [{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -6, q: 1 }],
      [0, 0, 4, 0],
    )

    expect(proposals.map((proposal) => proposal.mutation)).toEqual([
      'add-pk',
      'add-ls',
      'add-hs',
      'remove',
      'type-mutation',
      'split',
    ])
    const split = proposals.find((proposal) => proposal.mutation === 'split')!
    expect(split.filters).toHaveLength(2)
    expect(split.filters.map((filter) => filter.gainDb)).toEqual([-3, -3])
  })

  it('emits the weighted same-type merge geometry', () => {
    const proposals = generateStructuralMutations(
      problem,
      [
        { id: 'left', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -4, q: 1 },
        { id: 'right', enabled: true, type: 'PK', frequencyHz: 1_050, gainDb: -2, q: 2 },
      ],
      [0, 0, 0, 0],
    )
    const merge = proposals.find((proposal) => proposal.mutation === 'merge')!
    expect(merge.filters).toHaveLength(1)
    expect(merge.filters[0]).toMatchObject({ type: 'PK', gainDb: -6, q: 1.5 })
    expect(merge.filters[0]!.frequencyHz).toBeGreaterThan(1_000)
    expect(merge.filters[0]!.frequencyHz).toBeLessThan(1_050)
  })

  it('continues residual-driven structural growth across multiple beam layers', () => {
    const evaluations: number[] = []
    const result = runStructuralBeam({
      problem: { ...problem, desiredDb: [0, 0, 4, 0] },
      seed: 0,
      evaluationBudget: 20,
      referenceSnapshotSha256: 'c'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 4 }],
      config: { beamWidth: 1, proposalsPerParent: 3, localPolishEvaluations: 0, maxFilters: 4 },
      evaluate: filterCountEvaluator(true, evaluations),
    })

    expect(Math.max(...result.candidates.map((candidate) => candidate.filters.length))).toBe(4)
    expect(result.metadata.layersExecuted).toBeGreaterThan(1)
    expect(result.metadata.maxObservedFilterCount).toBe(4)
    expect(evaluations.length).toBe(result.candidates.length)
  })

  it('does not retain extra filters that worsen the Pareto frontier', () => {
    const result = runStructuralBeam({
      problem: { ...problem, desiredDb: [0, 0, 4, 0] },
      seed: 0,
      evaluationBudget: 20,
      referenceSnapshotSha256: 'c'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 1 }],
      config: { beamWidth: 2, proposalsPerParent: 3, localPolishEvaluations: 0, maxFilters: 4 },
      evaluate: filterCountEvaluator(false),
    })

    expect(result.states.every((state) => state.candidate.filters.length === 0)).toBe(true)
    expect(result.stopReason).toBe('no-admissible-proposals')
    expect(result.metadata.deduplicatedProposals).toBeGreaterThan(0)
  })

  it('can continue an explicit handoff seed without reevaluating the zero seed', () => {
    const seed = [{ id: 'handoff', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 2, q: 1 }]
    const result = runStructuralBeam({
      problem: { ...problem, desiredDb: [0, 0, 4, 0] },
      seed: 0,
      evaluationBudget: 1,
      referenceSnapshotSha256: 'c'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 1 }],
      includeZeroSeed: false,
      seeds: [{ seedId: 'mp-handoff', origin: 'matching-pursuit', filters: seed }],
      evaluate: filterCountEvaluator(true),
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]!.filters).toHaveLength(1)
  })
})

function filterCountEvaluator(improving: boolean, counts: number[] = []) {
  return (candidate: SolverLabCandidateV1): SolverLabEvaluationV1 => {
    const count = candidate.filters.length
    counts.push(count)
    const metric = improving ? 1 / (count + 1) : count === 0 ? 1 : 10 + count
    return {
      protocolVersion: 1,
      candidateId: candidate.candidateId,
      valid: true,
      rejectionReason: null,
      continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
      deliverable: {
        filters: candidate.filters.map((filter) => ({ ...filter })),
        rmseDb: metric,
        maxAbsDb: metric,
        bandRmseDb: {},
        cancellationTotalScore: 0,
      },
    }
  }
}
