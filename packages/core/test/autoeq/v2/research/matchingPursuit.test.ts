import { describe, expect, it } from 'vitest'

import {
  buildDictionary,
  runMatchingPursuit,
  solveBoundedCoordinateGains,
  type MatchingPursuitProblem,
} from '../../../../benchmarks/research/matchingPursuit.js'

const problem: MatchingPursuitProblem = {
  problemId: 'synthetic-matching-pursuit',
  inputSha256: 'a'.repeat(64),
  frequenciesHz: [20, 100, 1_000, 10_000],
  desiredDb: [0, 1, -1, 0.5],
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

describe('TypeScript matching pursuit research component', () => {
  it('keeps the approved dictionary order and atom geometry', () => {
    const atoms = buildDictionary(problem, {
      frequenciesPerOctave: 24,
      pkQValues: [0.35, 0.5, 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8],
      includeShelves: true,
    })

    expect(atoms).toHaveLength(2_880)
    expect(atoms[0]).toMatchObject({
      atomId: 'dict-pk-0000-00',
      type: 'PK',
      frequencyHz: 20,
      q: 0.35,
    })
    expect(atoms[9]).toMatchObject({ atomId: 'dict-pk-0000-09', q: 8 })
    expect(atoms[10]).toMatchObject({ atomId: 'dict-ls-0000', type: 'LS', frequencyHz: 20, q: 0.7 })
    expect(atoms[11]).toMatchObject({ atomId: 'dict-hs-0000', type: 'HS', frequencyHz: 20, q: 0.7 })
  })

  it('solves bounded gains with deterministic projected coordinate least squares', () => {
    const columns = [
      [1, 0, 0],
      [0, 1, 0],
    ]

    expect(solveBoundedCoordinateGains(columns, [2, -2, 0.5], -1, 1))
      .toEqual([1, -1])
  })

  it('continues with deterministic residual substitutions after the greedy pass', () => {
    const result = runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 30,
      checkpointEveryEvaluations: 1,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        const metric = 10 - candidate.filters.length
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
      },
    })

    expect(result.metadata.replacementCandidates).toBeGreaterThan(0)
    expect(result.metadata.searchPasses).toBeGreaterThan(1)
    expect(result.candidates.map((candidate) => candidate.filters.map((filter) => filter.id).join(',')))
      .toEqual([...new Set(result.candidates.map((candidate) => candidate.filters.map((filter) => filter.id).join(',')))])
    expect(result.stopReason).toMatch(/evaluation-budget|search-space-exhausted-under-current-mechanism/)
  })
})
