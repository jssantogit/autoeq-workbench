import { describe, expect, it } from 'vitest'

import {
  assertC2BatchBDevelopmentCaseIds,
  C2_BATCH_B_DEVELOPMENT_IDS,
  C2_BATCH_B_HOLDOUT_IDS,
  C2_BATCH_C_CASE_IDS,
  C2_OLD_STRUCTURAL_VNEXT_CASE_IDS,
  calculateC2Losses,
  calculateHuber075,
  classifyC2aGate,
  computeExactNPreference,
  deduplicateObservedStates,
  runC2ObserverFidelity,
  resolveC2SearchConfig,
  spearmanRankCorrelation,
} from '../../../../benchmarks/research/c2RobustLossDevCensus.js'
import type { C3ObservedState, C3PreparedSearchGrid } from '../../../../benchmarks/research/c3FilterKneeCensus.js'
import type { Filter } from '../../../../src/types/filter.js'

function filter(id: string, overrides: Partial<Filter> = {}): Filter {
  return { id, enabled: false, type: 'PK', frequencyHz: 1_000, gainDb: 0, q: 1, ...overrides }
}

function observed(filterValue: Filter, key = filterValue.id): C3ObservedState {
  return {
    filterStateKey: key,
    filters: [filterValue],
    rmseDb: 0,
    maxAbsDb: 0,
    maeDb: 0,
    cancellationScore: 0,
    stage: 'initial',
    generation: 0,
  }
}

const tinyGrid = {
  frequenciesHz: [20, 5_000, 6_000, 9_000, 13_000, 17_000, 20_000],
  desiredDb: [0, 0, 0, 0, 0, 0, 0],
  sampleRateHz: 48_000,
} satisfies C3PreparedSearchGrid

describe('C2a robust-loss census metrics', () => {
  it('implements MSE and MAE exactly and the frozen control violation', () => {
    const losses = calculateC2Losses([-1, 2, -3], Math.sqrt(14 / 3), 3)
    expect(losses.MSE).toBe(14 / 3)
    expect(losses.MAE).toBe(2)
    expect(losses.CONTROL).toBe(Math.max(Math.sqrt(14 / 3) / 0.25, 3 / 0.75))
  })

  it('implements Huber075 at zero, inside, transition, outside, and both signs', () => {
    expect(calculateHuber075([0])).toBe(0)
    expect(calculateHuber075([0.375])).toBe(0.125)
    expect(calculateHuber075([0.75])).toBe(0.5)
    expect(calculateHuber075([1.5])).toBe(1.5)
    expect(calculateHuber075([-0.375, 0.375, -0.75, 0.75])).toBe((0.125 + 0.125 + 0.5 + 0.5) / 4)
  })

  it('deduplicates quantized semantic state keys and retains earliest provenance', () => {
    const duplicate = observed(filter('later'), 'same')
    duplicate.stage = 'final'
    duplicate.generation = 9
    const states = deduplicateObservedStates([
      observed(filter('first'), 'same'),
      duplicate,
    ], tinyGrid)
    expect(states).toHaveLength(1)
    expect(states[0]?.stage).toBe('initial')
    expect(states[0]?.generation).toBe(0)
    expect(states[0]?.everFinal).toBe(true)
  })

  it('ranks exact-N states by each declared loss and uses deterministic state identity', () => {
    const states = deduplicateObservedStates([
      { ...observed(filter('a', { enabled: false })), filterStateKey: 'z' },
      { ...observed(filter('b', { enabled: false, frequencyHz: 2_000 })), filterStateKey: 'a' },
    ], tinyGrid)
    const exact = computeExactNPreference(states)
    expect(exact).toHaveLength(1)
    expect(exact[0]?.N).toBe(1)
    expect(exact[0]?.stateCount).toBe(2)
    expect(exact[0]?.winners.MSE.filterStateKey).toBe([...states.map((state) => state.filterStateKey)].sort()[0])
    expect(exact[0]?.winners.MAE.filterStateKey).toBe([...states.map((state) => state.filterStateKey)].sort()[0])
  })

  it('computes deterministic Spearman rank correlations, including ties', () => {
    expect(spearmanRankCorrelation([1, 2, 3], [1, 2, 3])).toBe(1)
    expect(spearmanRankCorrelation([1, 2, 3], [3, 2, 1])).toBe(-1)
    expect(spearmanRankCorrelation([1, 1, 2], [1, 2, 2])).toBeCloseTo(0.5)
  })

  it('proves observer OFF/ON equivalence under the C2 bounded replay', () => {
    const config = { ...resolveC2SearchConfig(), maxFilters: 2, beamWidth: 2, proposalsPerParent: 4 }
    const fidelity = runC2ObserverFidelity({
      frequenciesHz: [100, 500, 1_000, 2_000, 10_000],
      desiredDb: [0, 5, 0, 3, 0],
      sampleRateHz: 48_000,
    }, { config, maxGenerations: 3 })
    expect(fidelity.equivalent).toBe(true)
    expect(fidelity.resultEqual).toBe(true)
    expect(fidelity.completedGenerationCountEqual).toBe(true)
    expect(fidelity.retainedBeamSequenceEqual).toBe(true)
    expect(fidelity.workCountersEqual).toBe(true)
    expect(fidelity.naturalTerminationEqual).toBe(true)
    expect(fidelity.traceEqual).toBe(true)
    expect(fidelity.on.observations.length).toBeGreaterThan(0)
  })

  it('resolves the audited C43/e6 q31 full profile without changing it', () => {
    expect(resolveC2SearchConfig()).toMatchObject({
      maxFilters: 43,
      beamWidth: 16,
      proposalsPerParent: 32,
      localPolishEvaluations: 120,
      admission: 'q31-b4-p8',
      workProfile: 'full',
    })
  })

  it('rejects Batch B holdout, Batch C, old Structural VNext, and any non-exact selection', () => {
    expect(() => assertC2BatchBDevelopmentCaseIds(C2_BATCH_B_DEVELOPMENT_IDS)).not.toThrow()
    expect(() => assertC2BatchBDevelopmentCaseIds(C2_BATCH_B_HOLDOUT_IDS)).toThrow(/Batch B holdout/)
    expect(() => assertC2BatchBDevelopmentCaseIds(C2_BATCH_C_CASE_IDS)).toThrow(/Batch C/)
    expect(() => assertC2BatchBDevelopmentCaseIds(C2_OLD_STRUCTURAL_VNEXT_CASE_IDS)).toThrow(/old Structural VNext/)
    expect(() => assertC2BatchBDevelopmentCaseIds([...C2_BATCH_B_DEVELOPMENT_IDS, C2_BATCH_B_HOLDOUT_IDS[0]!])).toThrow(/Batch B holdout/)
  })

  it('applies the frozen C2a two-condition gate and candidate rule', () => {
    const divergence = (robustLossDivergence: boolean, mae: boolean, huber: boolean, correlation = true) => ({
      robustLossDivergence,
      lossConditions: { MAE: mae, 'HUBER-075': huber },
      huberMseCorrelationBelowThreshold: correlation,
    })
    const supported = classifyC2aGate([
      { divergence: divergence(true, true, true) },
      { divergence: divergence(true, true, false) },
      { divergence: divergence(false, false, false) },
    ], true)
    expect(supported).toMatchObject({
      coverage: 2,
      classification: 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED',
      frozenC2bCandidate: 'MAE',
      candidateCounts: { MAE: 2, 'HUBER-075': 1 },
    })
    expect(classifyC2aGate([
      { divergence: divergence(true, true, true) },
      { divergence: divergence(false, false, false) },
      { divergence: divergence(false, false, false) },
    ], false).classification).toBe('INCONCLUSIVE')
  })
})
