import { describe, expect, it } from 'vitest'

import {
  aggregateGlobalSeedAllocationMetrics,
  allocateDistributedSeedWork,
  freezeSeedPool,
  runEqualizedSeedAllocation,
  selectDiverseAlternateSeeds,
  selectPrimarySeed,
  type SeedAllocationPoint,
} from '../../../../benchmarks/research/seedAllocation.js'

const filters = (seedId: string) => [{
  id: `${seedId}-filter`, enabled: true as const, type: 'PK' as const,
  frequencyHz: seedId === 'primary' ? 1000 : seedId === 'alternate-a' ? 500 : 2500,
  gainDb: seedId === 'alternate-b' ? -2 : 1, q: 1,
}]

const seeds = [
  {
    seedId: 'lexically-early-dominated', origin: 'mp', semanticKey: 'semantic-dominated', selectionKey: '000',
    canonicalRmseDb: 9, canonicalMaxAbsDb: 9, filters: filters('lexically-early-dominated'),
  },
  {
    seedId: 'primary', origin: 'mp', semanticKey: 'semantic-primary', selectionKey: '900',
    canonicalRmseDb: 1, canonicalMaxAbsDb: 2, filters: filters('primary'),
  },
  {
    seedId: 'alternate-a', origin: 'mp', semanticKey: 'semantic-alternate-a', selectionKey: '100',
    canonicalRmseDb: 2, canonicalMaxAbsDb: 3, filters: filters('alternate-a'),
  },
  {
    seedId: 'alternate-b', origin: 'mp', semanticKey: 'semantic-alternate-b', selectionKey: '200',
    canonicalRmseDb: 3, canonicalMaxAbsDb: 4, filters: filters('alternate-b'),
  },
] as const

const point = (
  candidateId: string,
  rmseDb: number,
  maxAbsDb: number,
  phase: SeedAllocationPoint['phase'],
): SeedAllocationPoint => ({
  candidateId, canonicalRmseDb: rmseDb, canonicalMaxAbsDb: maxAbsDb,
  filterCount: 1, directedReferenceRegretV1: rmseDb, referenceImproved: rmseDb <= 1,
  phase,
})

describe('causal Storm seed allocation contract', () => {
  it('selects the canonical primary from entry metrics rather than lexical pool order', () => {
    const frozen = freezeSeedPool(seeds)

    expect(frozen[0]!.seedId).toBe('lexically-early-dominated')
    expect(selectPrimarySeed(frozen).seedId).toBe('primary')
  })

  it('freezes a detached common pool and chooses deterministic structural alternates', () => {
    const frozen = freezeSeedPool(seeds)
    const first = selectDiverseAlternateSeeds(frozen, selectPrimarySeed(frozen), 2)
    const second = selectDiverseAlternateSeeds([...frozen].reverse(), selectPrimarySeed(frozen), 2)

    expect(first.map((seed) => seed.seedId)).toEqual(second.map((seed) => seed.seedId))
    expect(first.map((seed) => seed.seedId)).not.toContain('primary')
    expect(first).toHaveLength(2)
    ;(seeds[1]!.filters[0] as { gainDb: number }).gainDb = 99
    expect(frozen.find((seed) => seed.seedId === 'primary')!.filters[0]!.gainDb).toBe(1)
  })

  it('allocates the same new-descendant budget while giving every distributed seed work', () => {
    const frozen = freezeSeedPool(seeds)
    const primary = selectPrimarySeed(frozen)
    const allocations = allocateDistributedSeedWork(frozen, 10, 3, primary.seedId)

    expect(allocations.reduce((sum, item) => sum + item.descendantWorkTarget, 0)).toBe(10)
    expect(allocations.every((item) => item.descendantWorkTarget >= 1)).toBe(true)
    expect(allocations[0]!.seedId).toBe(primary.seedId)
  })

  it('keeps validation and descendant counters distinct and forbids unequal causal claims', () => {
    const result = runEqualizedSeedAllocation({
      pool: seeds,
      targetDescendantEvaluations: 10,
      distributedSeedCount: 3,
      runSeed: ({ seed, descendantWorkTarget }) => {
        const descendants = seed.seedId === 'primary' ? descendantWorkTarget : descendantWorkTarget - 1
        return {
          seedId: seed.seedId,
          seedValidationEvaluations: 1,
          descendantProposalEvaluations: descendants,
          totalStructuralCandidateEvaluations: descendants + 1,
          descendantsProduced: descendants,
          seedValidationPoints: [point(`${seed.seedId}-seed`, seed.canonicalRmseDb, seed.canonicalMaxAbsDb, 'seed-validation')],
          descendantPoints: [],
        }
      },
    })

    expect(result.concentrated.seedValidationEvaluations).toBe(1)
    expect(result.concentrated.descendantProposalEvaluations).toBe(10)
    expect(result.concentrated.totalStructuralCandidateEvaluations).toBe(11)
    expect(result.distributed.descendantProposalEvaluations).toBeLessThan(10)
    expect(result.equalization).toMatchObject({ status: 'not-equalized', causalClaimAllowed: false })
  })

  it('requires every distributed seed to produce at least one descendant before permitting a claim', () => {
    const result = runEqualizedSeedAllocation({
      pool: seeds,
      targetDescendantEvaluations: 6,
      distributedSeedCount: 3,
      runSeed: ({ seed, descendantWorkTarget }) => ({
        seedId: seed.seedId,
        seedValidationEvaluations: 1,
        descendantProposalEvaluations: descendantWorkTarget,
        totalStructuralCandidateEvaluations: descendantWorkTarget + 1,
        descendantsProduced: seed.seedId === 'primary' ? descendantWorkTarget : 0,
        seedValidationPoints: [point(`${seed.seedId}-seed`, seed.canonicalRmseDb, seed.canonicalMaxAbsDb, 'seed-validation')],
        descendantPoints: [],
      }),
    })

    expect(result.equalization).toMatchObject({ status: 'equalized', causalClaimAllowed: false })
    expect(result.equalization.reason).toMatch(/zero descendants/)
  })

  it('aggregates Pareto novelty and selected-best changes globally, not by summing local summaries', () => {
    const initial = [
      point('seed-a', 2, 2, 'seed-validation'),
      point('seed-b', 3, 3, 'seed-validation'),
    ]
    const descendants = [
      point('a-descendant', 1, 3, 'descendant'),
      point('b-descendant', 1.5, 3.5, 'descendant'),
      point('seed-dominated', 2.5, 2.5, 'descendant'),
      point('shared-dominated', 2.5, 4, 'descendant'),
    ]
    const metrics = aggregateGlobalSeedAllocationMetrics(initial, descendants)

    expect(metrics.paretoNovelDescendants).toBe(1)
    expect(metrics.paretoNovelAgainstSeedBaselines).toBe(1)
    expect(metrics.paretoNovelDescendantsOnly).toBe(2)
    expect(metrics.selectedBestChanges).toBe(1)
    expect(metrics.referenceImprovements).toBe(1)
    expect(metrics.globalParetoFrontier.map((candidate) => candidate.candidateId)).toEqual([
      'seed-a',
      'a-descendant',
    ])
  })

  it('does not admit a descendant as Pareto-novel when a validated seed already dominates it', () => {
    const metrics = aggregateGlobalSeedAllocationMetrics(
      [point('validated-seed', 2, 2, 'seed-validation')],
      [point('dominated-descendant', 2.5, 2.5, 'descendant')],
    )

    expect(metrics.paretoNovelAgainstSeedBaselines).toBe(0)
    expect(metrics.globalParetoFrontier.map((candidate) => candidate.candidateId)).toEqual([
      'validated-seed',
    ])
  })
})
