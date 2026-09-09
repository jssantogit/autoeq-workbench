import { describe, expect, it } from 'vitest'

import {
  allocateDistributedSeedWork,
  freezeSeedPool,
  runEqualizedSeedAllocation,
  selectConcentratedSeed,
} from '../../../../benchmarks/research/seedAllocation.js'

const seeds = [
  { seedId: 'later', origin: 'mp', semanticKey: 'c', selectionKey: '3', canonicalRmseDb: 3, canonicalMaxAbsDb: 3 },
  { seedId: 'first', origin: 'mp', semanticKey: 'a', selectionKey: '1', canonicalRmseDb: 1, canonicalMaxAbsDb: 4 },
  { seedId: 'middle', origin: 'mp', semanticKey: 'b', selectionKey: '2', canonicalRmseDb: 2, canonicalMaxAbsDb: 2 },
] as const

describe('equalized seed allocation', () => {
  it('freezes one common deterministic pool for concentrated and distributed allocation', () => {
    const pool = freezeSeedPool(seeds)

    expect(pool.map((seed) => seed.seedId)).toEqual(['first', 'middle', 'later'])
    expect(selectConcentratedSeed(pool).seedId).toBe('first')
    expect(allocateDistributedSeedWork(pool, 12, 3)).toEqual([
      { seedId: 'first', observedWorkTarget: 4 },
      { seedId: 'middle', observedWorkTarget: 4 },
      { seedId: 'later', observedWorkTarget: 4 },
    ])
    expect(allocateDistributedSeedWork(pool, 10, 3)).toEqual([
      { seedId: 'first', observedWorkTarget: 4 },
      { seedId: 'middle', observedWorkTarget: 3 },
      { seedId: 'later', observedWorkTarget: 3 },
    ])
  })

  it('rejects duplicate semantic seeds before any allocation can double count them', () => {
    expect(() => freezeSeedPool([...seeds, { ...seeds[0], seedId: 'duplicate', selectionKey: '4' }]))
      .toThrow(/semantic key must be unique/)
  })

  it('rejects duplicate seed identities even when their semantic keys differ', () => {
    expect(() => freezeSeedPool([
      seeds[0],
      { ...seeds[1], seedId: seeds[0].seedId },
    ])).toThrow(/seed ID must be unique/)
  })

  it('requires exact observed structural work in both arms before allowing a causal claim', () => {
    const result = runEqualizedSeedAllocation({
      pool: freezeSeedPool(seeds),
      targetObservedStructuralEvaluations: 12,
      distributedSeedCount: 3,
      runSeed: ({ seed, observedWorkTarget }) => ({
        seedId: seed.seedId,
        observedStructuralEvaluations: seed.seedId === 'later' ? observedWorkTarget - 1 : observedWorkTarget,
        usefulSeedImprovements: 0,
        paretoNovelDescendants: 0,
        firstUsefulImprovementEvaluation: null,
        bestResultEvaluation: observedWorkTarget,
      }),
    })

    expect(result.concentrated.observedStructuralEvaluations).toBe(12)
    expect(result.distributed.observedStructuralEvaluations).toBe(11)
    expect(result.equalization).toEqual({ status: 'not-equalized', causalClaimAllowed: false })
    expect(result.distributed.perSeed.map((entry) => entry.seedId)).toEqual(['first', 'middle', 'later'])
  })

  it('preserves exact work, per-seed accounting, and a causal-comparable status when every allocation consumes its target', () => {
    const result = runEqualizedSeedAllocation({
      pool: freezeSeedPool(seeds),
      targetObservedStructuralEvaluations: 12,
      distributedSeedCount: 3,
      runSeed: ({ seed, observedWorkTarget }) => ({
        seedId: seed.seedId,
        observedStructuralEvaluations: observedWorkTarget,
        usefulSeedImprovements: seed.seedId === 'first' ? 1 : 0,
        paretoNovelDescendants: 1,
        firstUsefulImprovementEvaluation: 2,
        bestResultEvaluation: observedWorkTarget,
      }),
    })

    expect(result.equalization).toEqual({ status: 'equalized', causalClaimAllowed: true })
    expect(result.frozenSeedIds).toEqual(['first', 'middle', 'later'])
    expect(result.concentrated).toMatchObject({
      concentratedSeedId: 'first',
      allocations: [{ seedId: 'first', observedWorkTarget: 12 }],
    })
    expect(result.distributed.allocations).toEqual([
      { seedId: 'first', observedWorkTarget: 4 },
      { seedId: 'middle', observedWorkTarget: 4 },
      { seedId: 'later', observedWorkTarget: 4 },
    ])
    expect(result.concentrated.perSeed).toEqual([{ seedId: 'first', observedWorkTarget: 12, observedStructuralEvaluations: 12, usefulSeedImprovements: 1, paretoNovelDescendants: 1, firstUsefulImprovementEvaluation: 2, bestResultEvaluation: 12 }])
    expect(result.distributed.observedStructuralEvaluations).toBe(12)
  })

  it('forbids a claim when a seed over-consumes and another under-consumes its assigned work', () => {
    let calls = 0
    const result = runEqualizedSeedAllocation({
      pool: freezeSeedPool(seeds),
      targetObservedStructuralEvaluations: 12,
      distributedSeedCount: 3,
      runSeed: ({ seed, observedWorkTarget }) => ({
        seedId: seed.seedId,
        observedStructuralEvaluations: calls++ === 0 ? observedWorkTarget : seed.seedId === 'first'
          ? observedWorkTarget + 1
          : seed.seedId === 'middle' ? observedWorkTarget - 1 : observedWorkTarget,
        usefulSeedImprovements: 0,
        paretoNovelDescendants: 0,
        firstUsefulImprovementEvaluation: null,
        bestResultEvaluation: null,
      }),
    })

    expect(result.distributed.observedStructuralEvaluations).toBe(12)
    expect(result.equalization).toEqual({ status: 'not-equalized', causalClaimAllowed: false })
  })

  it('never mutates the common frozen pool while either arm executes', () => {
    const pool = freezeSeedPool(seeds)
    const result = runEqualizedSeedAllocation({
      pool,
      targetObservedStructuralEvaluations: 3,
      distributedSeedCount: 2,
      runSeed: ({ seed, observedWorkTarget }) => {
        ;(seed as { semanticKey: string }).semanticKey = 'mutated-by-runner'
        return {
          seedId: seed.seedId,
          observedStructuralEvaluations: observedWorkTarget,
          usefulSeedImprovements: 0,
          paretoNovelDescendants: 0,
          firstUsefulImprovementEvaluation: null,
          bestResultEvaluation: null,
        }
      },
    })

    expect(result.frozenSeedIds).toEqual(['first', 'middle', 'later'])
    expect(pool.map((seed) => seed.semanticKey)).toEqual(['a', 'b', 'c'])
  })
})
