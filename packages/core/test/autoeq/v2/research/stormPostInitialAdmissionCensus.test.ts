import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  POST_INITIAL_ADMISSION_CENSUS_CLASSIFICATIONS,
  classifyPostInitialAdmissionCensus,
  createStormPostInitialAdmissionCensusArtifact,
  deduplicatePostInitialParentOccurrences,
  rankPostInitialCheapAdmission,
  selectTrajectoryGlobalBestAtEvaluation,
  semanticStructuralParentKey,
  type PostInitialMetric,
  type PostInitialParentOccurrence,
} from '../../../../benchmarks/research/stormPostInitialAdmissionCensus.js'

const artifactPath = resolve(
  process.cwd(),
  '.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json',
)

function occurrence(
  parentIdentity: string,
  filterId: string,
  location: { runOrder: number; layerIndex: number; parentIndex: number },
  frequencyHz = 100,
): PostInitialParentOccurrence {
  return {
    parentIdentity,
    filters: [{
      id: filterId,
      enabled: true,
      type: 'PK',
      frequencyHz,
      gainDb: 1,
      q: 1,
    }],
    ...location,
  }
}

describe('Storm post-initial admission census', () => {
  it('deduplicates parents by deterministic structure and excludes the initial state', () => {
    const initial = occurrence('seed-id', 'seed-filter', { runOrder: 0, layerIndex: 1, parentIndex: 0 })
    const repeatInitial = occurrence('seed-id-2', 'seed-filter-2', { runOrder: 1, layerIndex: 2, parentIndex: 0 })
    const postInitial = occurrence('child-id', 'child-filter', { runOrder: 0, layerIndex: 2, parentIndex: 1 }, 200)
    const repeatPostInitial = occurrence('child-id-2', 'child-filter-2', { runOrder: 0, layerIndex: 3, parentIndex: 1 }, 200)

    expect(semanticStructuralParentKey(initial.filters)).toBe(semanticStructuralParentKey(repeatInitial.filters))
    const result = deduplicatePostInitialParentOccurrences(
      [initial, repeatInitial, postInitial, repeatPostInitial],
      'seed-id',
    )

    expect(result.totalExpansionOccurrences).toBe(4)
    expect(result.initialExcludedOccurrences).toBe(2)
    expect(result.postInitialExpansionOccurrences).toBe(2)
    expect(result.uniquePostInitialParents).toHaveLength(1)
    expect(result.repeatedOccurrencesRemoved).toBe(1)
    expect(result.recurringParents).toEqual([{ semanticKey: result.uniquePostInitialParents[0]!.semanticKey, occurrences: 2 }])
  })

  it('ranks cheap admission from pre-polish metrics only and preserves lexical tie order', () => {
    const ranked = rankPostInitialCheapAdmission([
      { proposalRank: 1, rmseDb: 2, maxAbsDb: 2, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 2, rmseDb: 3, maxAbsDb: 3, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 3, rmseDb: 1, maxAbsDb: 1, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 4, rmseDb: 4, maxAbsDb: 4, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 5, rmseDb: 1, maxAbsDb: 1, filterCount: 2, cancellationScore: 0 },
    ])

    expect(ranked.top4).toEqual([3, 5, 1, 2])
    expect(ranked.ranking).toEqual([3, 5, 1, 2, 4])
    expect(ranked.canonicalPrePolishEvaluations).toBe(5)
  })

  it('uses the literal post-initial classification vocabulary', () => {
    expect(POST_INITIAL_ADMISSION_CENSUS_CLASSIFICATIONS).toEqual([
      'post-initial-admission-opportunity-supported',
      'post-initial-local-only',
      'initial-only-bottleneck-supported',
      'signal-misaligned-post-initial',
      'mixed/unresolved',
    ])
    expect(classifyPostInitialAdmissionCensus({
      materialUsefulRecovered: false,
      localOnlyRecovered: false,
      usefulMissesNotRecovered: false,
      parentOutcomes: ['no-opportunity'],
    })).toBe('initial-only-bottleneck-supported')
    expect(classifyPostInitialAdmissionCensus({
      materialUsefulRecovered: true,
      localOnlyRecovered: false,
      usefulMissesNotRecovered: false,
      parentOutcomes: ['material'],
    })).toBe('post-initial-admission-opportunity-supported')
  })

  it('bounds the trajectory-global-best comparator to the requested B prefix', () => {
    const metric = (rmseDb: number, maxAbsDb: number): PostInitialMetric => ({
      rmseDb,
      maxAbsDb,
      filterCount: 1,
      cancellationScore: 0,
      referenceRegret: rmseDb,
    })
    const trajectory = [
      { evaluationIndex: 0, candidateId: 'seed', metrics: metric(2, 2) },
      { evaluationIndex: 4, candidateId: 'current-parent', metrics: metric(1.5, 1.5) },
      { evaluationIndex: 5, candidateId: 'future-superior', metrics: metric(0.1, 0.1) },
    ]

    expect(selectTrajectoryGlobalBestAtEvaluation(trajectory, 4).candidateId).toBe('current-parent')
    expect(selectTrajectoryGlobalBestAtEvaluation(trajectory, 5).candidateId).toBe('future-superior')
  })

  it('does not mutate frozen source inputs while reproducing the offline census', () => {
    const paths = [
      resolve(process.cwd(), '.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json'),
      resolve(process.cwd(), '.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json'),
      resolve(process.cwd(), '.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json'),
      '/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json',
    ]
    const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
    const before = paths.map(digest)
    const artifact = createStormPostInitialAdmissionCensusArtifact()
    const after = paths.map(digest)

    expect(after).toEqual(before)
    expect(artifact.deterministic.nonTimingArtifactReproduction).toBe(true)
  })

  it('records the final deterministic census contract and gate statuses', () => {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      censusFrozenBeforeOutcomes: boolean
      initialParentExcluded: boolean
      semanticDeduplication: { deterministic: boolean; totalExpansionOccurrences: number; uniquePostInitialParents: number; repeatedOccurrencesRemoved: number }
      controls: { lexicalRankingRuntimeReproduced: boolean; cheapRankingOutcomeBlind: boolean; fullPolishLabelsExcludedFromRanking: boolean; futureLeakageAbsent: boolean; trajectoryUnmodified: boolean; repeatsNotIndependentEvidence: boolean }
      classification: string
      parents: Array<{ lexicalTop4: number[]; cheapTop4: number[]; materiallyUsefulProposalRanks: number[]; localOnlyProposalRanks: number[] }>
      doNotChange: string[]
      costAccounting: { uniqueParents: number; proposalCount: number; canonicalPrePolishEvaluations: number; fullPolishCoordinateTrials: number; canonicalLabelEvaluations: number }
      testsAndGates: { gateResults: Record<string, string> }
    }

    expect(artifact.censusFrozenBeforeOutcomes).toBe(true)
    expect(artifact.initialParentExcluded).toBe(true)
    expect(artifact.semanticDeduplication).toMatchObject({
      deterministic: true,
      totalExpansionOccurrences: 20,
      uniquePostInitialParents: 1,
      repeatedOccurrencesRemoved: 7,
    })
    expect(artifact.controls).toMatchObject({
      lexicalRankingRuntimeReproduced: true,
      cheapRankingOutcomeBlind: true,
      fullPolishLabelsExcludedFromRanking: true,
      futureLeakageAbsent: true,
      trajectoryUnmodified: true,
      repeatsNotIndependentEvidence: true,
    })
    expect(artifact.classification).toBe('post-initial-local-only')
    expect(artifact.parents).toHaveLength(1)
    expect(artifact.parents[0]!.lexicalTop4).toEqual([1, 2, 3, 4])
    expect(artifact.parents[0]!.cheapTop4).toEqual([14, 15, 21, 22])
    expect(artifact.parents[0]!.materiallyUsefulProposalRanks).toEqual([])
    expect(artifact.parents[0]!.localOnlyProposalRanks).toEqual([14, 15, 21, 22])
    expect(artifact.costAccounting).toMatchObject({
      uniqueParents: 1,
      proposalCount: 31,
      canonicalPrePolishEvaluations: 31,
      canonicalLabelEvaluations: 31,
    })
    expect(artifact.doNotChange).toEqual(expect.arrayContaining([
      'packages/core/src/**',
      'normal solver policy',
      'mutation library',
      'frozen selector/reference',
      'fixtures/baselines',
      'UI/export/product',
      'historical artifacts',
    ]))
    expect(Object.values(artifact.testsAndGates.gateResults).every((status) => [
      'PASS_THIS_RUN', 'PASS_PREVIOUSLY_VERIFIED', 'FAIL', 'BLOCKED_KNOWN', 'NOT_RUN',
    ].includes(status))).toBe(true)
  })
})
