import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from '../../../../benchmarks/research/referenceRegret.js'

type Vector = {
  id: string
  point: ReferenceRegretPoint
  frontier: ReferenceRegretPoint[]
  regret: number
  referenceImproved: boolean
}

const fixturePath = new URL(
  '../../../../../../research/solver-lab/tests/fixtures/reference-regret-v1.json',
  import.meta.url,
)

describe('Directed Reference Regret v1', () => {
  it('matches the shared Python parity vectors', () => {
    const vectors = JSON.parse(readFileSync(fixturePath, 'utf8')) as Vector[]

    for (const vector of vectors) {
      const result = directedReferenceRegret(vector.point, vector.frontier)
      expect(result.regret, vector.id).toBeCloseTo(vector.regret, 12)
      expect(result.referenceImproved, vector.id).toBe(vector.referenceImproved)
    }
  })

  it('rejects an empty frontier and invalid scales', () => {
    const point: ReferenceRegretPoint = {
      candidateId: 'candidate',
      rmseDb: 0.1,
      maxAbsDb: 0.2,
      filterCount: 1,
    }
    expect(() => directedReferenceRegret(point, [])).toThrow(/frontier/)
    expect(() => directedReferenceRegret(
      point,
      [{ candidateId: 'reference', rmseDb: 0.1, maxAbsDb: 0.2, filterCount: 1 }],
      0,
    )).toThrow(/scale/)
  })
})
