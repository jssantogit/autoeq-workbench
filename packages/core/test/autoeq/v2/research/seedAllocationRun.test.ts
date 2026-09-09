import { describe, expect, it } from 'vitest'

import {
  assertStormSeedAllocationArtifact,
  freezeStormSeeds,
  resolveResearchPath,
  STORM_SEED_ALLOCATION_EXPERIMENT_VERSION,
} from '../../../../benchmarks/research/seedAllocationRun.js'

const filter = (id: string, frequencyHz: number) => ({
  id, enabled: true, type: 'PK' as const, frequencyHz, gainDb: 1, q: 1,
})

const source = {
  sourceCommit: '22a05fdcac88bdd603b7d80d7d96ffe10a28d606',
  runs: [{
    variantId: 'matching-pursuit-selection-beam-v2',
    progressTrace: [
      { candidateId: 'candidate-a', filters: [filter('a', 500)], canonicalRmseDb: 2, canonicalMaxAbsDb: 5 },
      { candidateId: 'candidate-b', filters: [filter('b', 1000)], canonicalRmseDb: 1, canonicalMaxAbsDb: 2 },
      { candidateId: 'candidate-c', filters: [filter('c', 2000)], canonicalRmseDb: 3, canonicalMaxAbsDb: 4 },
    ],
    researchTrace: [
      { component: 'matching-pursuit-v1', phase: 'greedy', candidateId: 'candidate-a', selectedChange: true, paretoNovel: true, selectionKey: '001' },
      { component: 'matching-pursuit-v1', phase: 'greedy', candidateId: 'candidate-b', selectedChange: true, paretoNovel: true, selectionKey: '002' },
      { component: 'matching-pursuit-v1', phase: 'greedy', candidateId: 'candidate-c', selectedChange: true, paretoNovel: true, selectionKey: '003' },
      { component: 'matching-pursuit-v1', phase: 'greedy', candidateId: 'candidate-c', selectedChange: true, paretoNovel: true, selectionKey: '003' },
    ],
  }],
}

describe('Storm causal seed-allocation runner contract', () => {
  it('freezes source seeds and lets canonical entry metrics choose the primary', () => {
    const seeds = freezeStormSeeds(source)

    expect(seeds.map((seed) => seed.seedId)).toEqual(['candidate-a', 'candidate-b', 'candidate-c'])
    expect(seeds.find((seed) => seed.seedId === 'candidate-b')!.canonicalRmseDb).toBe(1)
  })

  it('rejects a causal artifact whose arms do not share the frozen pool and primary', () => {
    const base = validArtifact()
    expect(() => assertStormSeedAllocationArtifact({
      ...base,
      concentrated: {
        ...base.concentrated, primarySeedId: 'primary', frozenSeedPoolSha256: 'a'.repeat(64),
      },
      distributed: {
        ...base.distributed, primarySeedId: 'other', frozenSeedPoolSha256: 'b'.repeat(64),
      },
      equalization: { ...base.equalization, reason: 'bad' },
    })).toThrow(/primary|frozen pool/)
  })

  it('requires exact descendant equality and exercised distributed descendants', () => {
    const base = validArtifact()
    expect(() => assertStormSeedAllocationArtifact(base)).not.toThrow()
    expect(() => assertStormSeedAllocationArtifact({
      ...base,
      distributed: {
        ...base.distributed,
        descendantProposalEvaluations: 7,
        totalStructuralCandidateEvaluations: 9,
      },
      equalization: { status: 'not-equalized', causalClaimAllowed: true, reason: 'wrong' },
    })).toThrow(/causal claim|equaliz/)
    expect(() => assertStormSeedAllocationArtifact({
      ...base,
      distributed: {
        ...base.distributed,
        perSeed: [{ seedId: 'alternate', descendantWorkTarget: 1, descendantsProduced: 0 }],
      },
      equalization: { status: 'equalized', causalClaimAllowed: true, reason: 'wrong' },
    })).toThrow(/descendant|exercis|per-seed/)
  })

  it('anchors relative paths to the project root for isolated artifacts', () => {
    expect(resolveResearchPath('packages/core/benchmarks/research/seedAllocationRun.ts'))
      .toMatch(/autoeq-workbench\/packages\/core\/benchmarks\/research\/seedAllocationRun\.ts$/)
  })
})

function validArtifact() {
  const arm = {
    primarySeedId: 'primary', frozenSeedPoolSha256: 'a'.repeat(64), seedIds: ['primary', 'alternate'],
    allocations: [
      { seedId: 'primary', descendantWorkTarget: 4 },
      { seedId: 'alternate', descendantWorkTarget: 4 },
    ],
    seedValidationEvaluations: 2, descendantProposalEvaluations: 8, totalStructuralCandidateEvaluations: 10,
    perSeed: [
      { seedId: 'primary', descendantWorkTarget: 4, seedValidationEvaluations: 1, descendantProposalEvaluations: 4, totalStructuralCandidateEvaluations: 5, descendantsProduced: 4 },
      { seedId: 'alternate', descendantWorkTarget: 4, seedValidationEvaluations: 1, descendantProposalEvaluations: 4, totalStructuralCandidateEvaluations: 5, descendantsProduced: 4 },
    ],
    global: {
      initialSelectedBest: null, selectedBest: null, globalParetoFrontier: [], globalParetoNovelDescendants: 0,
      globalSelectedBestChanges: 0, globalReferenceImprovements: 0, firstUsefulDescendantEvaluation: null,
      descendantEvaluationsToBestResult: null, improvementPerDescendantEvaluation: null,
    },
  }
  return {
    schemaVersion: 2,
    experimentVersion: STORM_SEED_ALLOCATION_EXPERIMENT_VERSION,
    sourceCommit: '22a05fdcac88bdd603b7d80d7d96ffe10a28d606',
    sourceReportPath: '/historical/source.json', sourceReportSha256: 'b'.repeat(64),
    referenceSnapshotPath: '/tmp/reference.json', referenceSnapshotSha256: 'c'.repeat(64),
    problemId: 'titan-to-storm', frozenSeedPoolSha256: 'a'.repeat(64),
    frozenSeedPool: [{ seedId: 'primary' }, { seedId: 'alternate' }],
    primarySeedId: 'primary', alternateSeedIds: ['alternate'],
    diversityPolicy: { id: 'greedy-max-min-jaccard-v1', alternateCount: 1 },
    structuralConfig: { beamWidth: 2, proposalsPerParent: 4, localPolishEvaluations: 24, maxFilters: 10 },
    targetDescendantEvaluations: 8,
    controls: {
      canonicalDeliveredEvaluation: 'canonical-delivered-v1', quantization: 'standard-v2-quantized',
      frozenReferenceSnapshotSha256: 'c'.repeat(64), frozenSelector: 'reference-selector-v1',
      deadlineMode: 'cooperative', deadlineMs: 60_000,
    },
    concentrated: { ...arm, concentratedSeedId: 'primary' },
    distributed: arm,
    equalization: { status: 'equalized', causalClaimAllowed: true, reason: 'exact descendant work equalized and every distributed seed exercised' },
  }
}
