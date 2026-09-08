import { describe, expect, it } from 'vitest'

import {
  buildDictionary,
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
    maxPkQ: 16,
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
})
