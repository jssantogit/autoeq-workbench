import { describe, expect, it } from 'vitest'

import {
  assertEqualizedSeedAllocationArtifact,
  freezeStormSeeds,
  resolveResearchPath,
  selectBestArtifactEntry,
} from '../../../../benchmarks/research/seedAllocationRun.js'

const artifactBase = {
  schemaVersion: 1,
  sourceCommit: '5f252d270be08b2d2180c5bcde8cf5fbb0e5a80b',
  sourceReportPath: '/repo/source-report.json',
  sourceReportSha256: 'a'.repeat(64),
  referenceSnapshotPath: '/tmp/reference.json',
  referenceSnapshotSha256: 'b'.repeat(64),
  problemId: 'titan-to-storm',
  frozenSeedPool: [{
    seedId: 'seed-a', origin: 'matching-pursuit-selection-beam-v2', semanticKey: 'semantic-a',
    selectionKey: 'selection-a', canonicalRmseDb: 1, canonicalMaxAbsDb: 2, filters: [],
  }],
  structuralConfig: { beamWidth: 2, proposalsPerParent: 4, localPolishEvaluations: 24, maxFilters: 10 },
  targetObservedStructuralEvaluations: 12,
  deadlineMode: 'cooperative', deadlineMs: 60_000,
  configuredPolishAllowance: 24, observedPolishWork: null, polishWorkObservation: 'not-measured',
  concentrated: {
    concentratedSeedId: 'seed-a', allocations: [{ seedId: 'seed-a', observedWorkTarget: 12 }],
    observedStructuralEvaluations: 12, perSeed: [], selectedBest: null,
    paretoNovelDescendants: 0, usefulSeedImprovements: 0,
  },
  distributed: {
    allocations: [{ seedId: 'seed-a', observedWorkTarget: 12 }],
    observedStructuralEvaluations: 12, perSeed: [], selectedBest: null,
    paretoNovelDescendants: 0, usefulSeedImprovements: 0,
  },
}

describe('equalized seed-allocation artifact', () => {
  it('rejects a causal claim when observed structural work is not exactly equalized', () => {
    expect(() => assertEqualizedSeedAllocationArtifact({
      schemaVersion: 1,
      equalization: { status: 'not-equalized', causalClaimAllowed: true },
      concentrated: { observedStructuralEvaluations: 12 },
      distributed: { observedStructuralEvaluations: 11 },
    })).toThrow(/not-equalized artifact must forbid a causal claim/)
  })

  it('accepts an artifact only when both arms match the declared observed-work target', () => {
    expect(() => assertEqualizedSeedAllocationArtifact({
      ...artifactBase,
      targetObservedStructuralEvaluations: 12,
      equalization: { status: 'equalized', causalClaimAllowed: true },
    })).not.toThrow()
  })

  it('rejects an unmeasured polish count encoded as zero', () => {
    expect(() => assertEqualizedSeedAllocationArtifact({
      ...artifactBase,
      observedPolishWork: 0,
      equalization: { status: 'not-equalized', causalClaimAllowed: false },
    })).toThrow(/unmeasured polish work must be null/)
  })

  it('requires equalized artifacts to explicitly permit the causal claim', () => {
    expect(() => assertEqualizedSeedAllocationArtifact({
      ...artifactBase,
      equalization: { status: 'equalized', causalClaimAllowed: false },
    })).toThrow(/equalized artifact must permit a causal claim/)
  })

  it('anchors relative runner paths at the project root even when invoked from packages/core', () => {
    const root = resolveResearchPath('.')
    expect(resolveResearchPath('packages/core/benchmarks/research/seedAllocationRun.ts'))
      .toBe(`${root}/packages/core/benchmarks/research/seedAllocationRun.ts`)
  })

  it('deduplicates repeated progress reports while preserving all eligible frozen seeds', () => {
    const point = (candidateId: string, filters: unknown[] = [{
      id: candidateId, enabled: true, type: 'PK', frequencyHz: candidateId === 'seed-a' ? 1_000 : 2_000, gainDb: 1, q: 1,
    }]) => ({
      candidateId,
      filters,
      canonicalRmseDb: 1,
      canonicalMaxAbsDb: 2,
    })
    const event = (candidateId: string, selectionKey: string) => ({
      component: 'matching-pursuit-v1', candidateId, phase: 'greedy',
      selectedChange: true, paretoNovel: true, selectionKey,
    })
    const source = {
      runs: [{
        variantId: 'matching-pursuit-selection-beam-v2',
        progressTrace: [
          point('seed-b'), point('seed-a'), point('seed-a'), point('seed-b'),
        ],
        researchTrace: [event('seed-b', '2'), event('seed-a', '1'), event('seed-a', '1')],
      }],
    }

    expect(freezeStormSeeds(source).map((seed) => seed.seedId)).toEqual(['seed-a', 'seed-b'])
  })

  it('selects the aggregate arm best across every allocated seed', () => {
    expect(selectBestArtifactEntry([
      { selectedBest: { candidateId: 'worse', canonicalRmseDb: 2, canonicalMaxAbsDb: 2, filterCount: 2 } },
      { selectedBest: { candidateId: 'better', canonicalRmseDb: 1, canonicalMaxAbsDb: 1, filterCount: 2 } },
    ])).toMatchObject({ candidateId: 'better' })
  })
})
