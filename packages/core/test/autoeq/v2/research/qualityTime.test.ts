import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  QUALITY_TIME_FORMULA_DESCRIPTOR,
  computeQualityTimeFrontier,
  qualityFromRegret,
  qualityTimeFormulaSha256,
  type QualityTimePoint,
} from '../../../../benchmarks/research/qualityTime.js'

type Vector = {
  id: string
  points: QualityTimePoint[]
  score: number
}

const fixturePath = new URL(
  '../../../../../../research/solver-lab/tests/fixtures/quality-time-frontier-v1.json',
  import.meta.url,
)

describe('reference-based QTF v1', () => {
  it('matches the shared Python integration vectors', () => {
    const vectors = JSON.parse(readFileSync(fixturePath, 'utf8')) as Vector[]
    for (const vector of vectors) {
      expect(computeQualityTimeFrontier(vector.points), vector.id)
        .toBeCloseTo(vector.score, 12)
    }
  })

  it('keeps the transform, descriptor, and hash stable', () => {
    expect(qualityFromRegret(0)).toBe(1)
    expect(qualityFromRegret(1)).toBeCloseTo(0.36787944117144233, 15)
    expect(qualityTimeFormulaSha256()).toBe(
      '10d387db6ea37b2cbdf6a5c6c614c5d3f0a790046e45cbadfa931b32471d9965',
    )
    expect(QUALITY_TIME_FORMULA_DESCRIPTOR).toBe(
      '{"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","reference":"oracle-reference-snapshot-v1:deliverable-frontier","regret":"directed-reference-regret-v1","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}',
    )
  })

  it('rejects invalid timestamps and regrets', () => {
    expect(() => computeQualityTimeFrontier([
      { elapsedSeconds: -1, regret: 0 },
    ])).toThrow(/elapsed/)
    expect(() => computeQualityTimeFrontier([
      { elapsedSeconds: 0, regret: -1 },
    ])).toThrow(/regret/)
    expect(() => computeQualityTimeFrontier([
      { elapsedSeconds: 1, regret: 0 },
    ])).toThrow(/baseline/)
  })
})
