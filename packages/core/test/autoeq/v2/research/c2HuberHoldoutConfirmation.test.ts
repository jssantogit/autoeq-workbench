import { describe, expect, it } from 'vitest'

import {
  C2B_CANDIDATE,
  C2B_DIVERGENCE_CORRELATION_THRESHOLD,
  C2B_DIVERGENCE_EXACT_N_THRESHOLD,
  C2B_PROTOCOL_SCHEMA_VERSION,
  C2_BATCH_B_DEVELOPMENT_IDS,
  C2_BATCH_B_HOLDOUT_IDS,
  C2_BATCH_C_CASE_IDS,
  assertC2bBatchBHoldoutCaseIds,
  assertC2bBatchCRejected,
  assertC2bCorpusProvenance,
  calculateC2bHuber075,
  classifyC2bDivergence,
  classifyC2bGate,
  exactNHuberDivergence,
  resolveC2SearchConfig,
} from '../../../../benchmarks/research/c2HuberHoldoutConfirmation.js'

describe('C2b frozen Huber holdout protocol', () => {
  it('uses exactly the frozen Huber-075 formula and boundary', () => {
    expect(calculateC2bHuber075([0])).toBe(0)
    expect(calculateC2bHuber075([0.375])).toBe(0.125)
    expect(calculateC2bHuber075([0.75])).toBe(0.5)
    expect(calculateC2bHuber075([1.5])).toBe(1.5)
    expect(calculateC2bHuber075([-0.375, 0.375, -0.75, 0.75])).toBe(0.3125)
    expect(C2B_CANDIDATE).toBe('HUBER-075')
  })

  it('freezes strict correlation and inclusive exact-N boundaries', () => {
    expect(C2B_DIVERGENCE_CORRELATION_THRESHOLD).toBe(0.995)
    expect(C2B_DIVERGENCE_EXACT_N_THRESHOLD).toBe(0.25)
    expect(classifyC2bDivergence({
      globalWinnerDiffersFromMSE: false,
      exactNDivergenceFraction: 0.25,
      mseHuberCorrelation: 0.994999,
    })).toEqual({ conditionA: true, conditionB: true, huberPreferenceDivergence: true })
    expect(classifyC2bDivergence({
      globalWinnerDiffersFromMSE: false,
      exactNDivergenceFraction: 0.249999,
      mseHuberCorrelation: 0.995,
    })).toEqual({ conditionA: false, conditionB: false, huberPreferenceDivergence: false })
    expect(classifyC2bDivergence({
      globalWinnerDiffersFromMSE: false,
      exactNDivergenceFraction: 0.25,
      mseHuberCorrelation: 0.995,
    }).huberPreferenceDivergence).toBe(false)
  })

  it('computes exact-N divergence only across counts with at least two states', () => {
    const exact = [
      { N: 8, stateCount: 1, winners: { MSE: { filterStateKey: 'a', loss: 1, filterCount: 8 }, 'HUBER-075': { filterStateKey: 'a', loss: 1, filterCount: 8 } } },
      { N: 9, stateCount: 2, winners: { MSE: { filterStateKey: 'b', loss: 1, filterCount: 9 }, 'HUBER-075': { filterStateKey: 'c', loss: 1, filterCount: 9 } } },
      { N: 10, stateCount: 2, winners: { MSE: { filterStateKey: 'd', loss: 1, filterCount: 10 }, 'HUBER-075': { filterStateKey: 'd', loss: 1, filterCount: 10 } } },
      { N: 11, stateCount: 3, winners: { MSE: { filterStateKey: 'e', loss: 1, filterCount: 11 }, 'HUBER-075': { filterStateKey: 'f', loss: 1, filterCount: 11 } } },
    ] as const as unknown as Parameters<typeof exactNHuberDivergence>[0]
    expect(exactNHuberDivergence(exact)).toEqual({
      comparableCount: 3,
      differingCount: 2,
      fraction: 2 / 3,
      firstN: 9,
      lastN: 11,
    })
  })

  it.each([0, 1, 2, 3])('applies the final %s/3 holdout coverage gate', (coverage) => {
    const cases = Array.from({ length: 3 }, (_, index) => ({ huberPreferenceDivergence: index < coverage }))
    const result = classifyC2bGate(cases, true, true)
    expect(result.coverage).toBe(coverage)
    expect(result.total).toBe(3)
    expect(result.classification).toBe(coverage >= 2 ? 'HUBER_PREFERENCE_GENERALIZES' : 'HUBER_PREFERENCE_NOT_CONFIRMED')
  })

  it('fails closed to INCONCLUSIVE for fidelity or provenance failure', () => {
    expect(classifyC2bGate([{ huberPreferenceDivergence: true }, { huberPreferenceDivergence: true }, { huberPreferenceDivergence: true }], false, true).classification).toBe('INCONCLUSIVE')
    expect(classifyC2bGate([{ huberPreferenceDivergence: true }, { huberPreferenceDivergence: true }, { huberPreferenceDivergence: true }], true, false).classification).toBe('INCONCLUSIVE')
  })

  it('requires exactly the untouched Batch B holdout IDs', () => {
    expect(() => assertC2bBatchBHoldoutCaseIds(C2_BATCH_B_HOLDOUT_IDS)).not.toThrow()
    expect(() => assertC2bBatchBHoldoutCaseIds(C2_BATCH_B_DEVELOPMENT_IDS)).toThrow(/development/)
    expect(() => assertC2bBatchBHoldoutCaseIds([...C2_BATCH_B_HOLDOUT_IDS, C2_BATCH_B_HOLDOUT_IDS[0]!])).toThrow(/exactly/)
    expect(() => assertC2bBatchBHoldoutCaseIds([...C2_BATCH_B_HOLDOUT_IDS].reverse())).not.toThrow()
  })

  it('rejects every Batch C execution attempt explicitly', () => {
    expect(() => assertC2bBatchCRejected(C2_BATCH_C_CASE_IDS)).toThrow(/Batch C/)
    expect(() => assertC2bBatchBHoldoutCaseIds(C2_BATCH_C_CASE_IDS)).toThrow(/Batch C/)
  })

  it('validates frozen corpus provenance and the audited trajectory profile', () => {
    expect(() => assertC2bCorpusProvenance()).not.toThrow()
    expect(C2B_PROTOCOL_SCHEMA_VERSION).toBe(1)
    expect(resolveC2SearchConfig()).toMatchObject({
      maxFilters: 43,
      beamWidth: 16,
      proposalsPerParent: 32,
      localPolishEvaluations: 120,
      admission: 'q31-b4-p8',
      workProfile: 'full',
    })
  })
})
