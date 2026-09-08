import { describe, expect, it } from 'vitest'

import {
  generateStructuralMutations,
  type StructuralBeamProblem,
} from '../../../../benchmarks/research/structuralBeam.js'

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
    maxPkQ: 16,
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
})
