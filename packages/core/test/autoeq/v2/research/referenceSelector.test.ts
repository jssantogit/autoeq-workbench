import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  selectReferencePoint,
  type SelectorPoint,
} from '../../../../benchmarks/research/referenceSelector.js'

type Vector = {
  id: string
  points: SelectorPoint[]
  winner: string
}

const fixturePath = new URL(
  '../../../../../../research/solver-lab/tests/fixtures/reference-selector-v1.json',
  import.meta.url,
)

describe('Reference Pareto Selector v1', () => {
  it('matches the shared Python vectors', () => {
    const vectors = JSON.parse(readFileSync(fixturePath, 'utf8')) as Vector[]
    for (const vector of vectors) {
      expect(selectReferencePoint(vector.points).candidateId, vector.id).toBe(vector.winner)
    }
  })

  it('rejects an empty or non-finite point set', () => {
    expect(() => selectReferencePoint([])).toThrow(/point/)
    expect(() => selectReferencePoint([{
      candidateId: 'bad',
      rmseDb: Number.NaN,
      maxAbsDb: 1,
      filterCount: 1,
      cancellationScore: 0,
    }])).toThrow(/finite/)
  })
})
