import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  STORM_TWO_HOP_REACHABILITY_CLASSIFICATIONS,
  STORM_TWO_HOP_REACHABILITY_MAX_DEPTH_EDGES,
  classifyStormTwoHopReachability,
  createStormTwoHopReachabilityArtifact,
  rankStormTwoHopCheapAdmission,
  stormTwoHopSemanticFilterKey,
  type StormTwoHopReachabilityArtifact,
} from '../../../../benchmarks/research/stormTwoHopReachabilityCensus.js'

const repositoryRoot = resolve(process.cwd(), '../..')
const predecessorPaths = [
  resolve(repositoryRoot, 'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json'),
  resolve(repositoryRoot, 'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json'),
  resolve(repositoryRoot, 'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json'),
  resolve(repositoryRoot, 'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json'),
  '/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json',
]

const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

let artifact: StormTwoHopReachabilityArtifact
let beforeHashes: string[]

describe('Storm two-hop reachability census', () => {
  beforeAll(() => {
    beforeHashes = predecessorPaths.map(digest)
    artifact = createStormTwoHopReachabilityArtifact()
  }, 120_000)

  it('uses the literal decision vocabulary and requires a two-edge path', () => {
    expect(STORM_TWO_HOP_REACHABILITY_CLASSIFICATIONS).toEqual([
      'temporary-worsening-bridge-supported',
      'two-hop-opportunity-reachable-currently',
      'two-hop-local-only',
      'two-hop-no-headroom',
      'mixed/unresolved',
    ])

    expect(classifyStormTwoHopReachability({
      bridgeSupported: true,
      reachableCurrently: false,
      localOnly: false,
      noHeadroom: false,
      unresolved: false,
    })).toBe('temporary-worsening-bridge-supported')
    expect(() => classifyStormTwoHopReachability({
      bridgeSupported: false,
      reachableCurrently: false,
      localOnly: false,
      noHeadroom: false,
      unresolved: false,
      maxDepthEdges: 3,
    })).toThrow(/depth/i)
  })

  it('covers exactly the frozen 31 intermediates and derives hop 2 from each delivered intermediate', () => {
    expect(artifact.intermediates).toHaveLength(31)
    expect(artifact.frozenCensus).toMatchObject({
      totalExpansionOccurrences: 20,
      initialExcludedOccurrences: 12,
      postInitialExpansionOccurrences: 8,
      uniquePostInitialParents: 1,
      repeatedOccurrencesRemoved: 7,
      proposalCount: 31,
      lexicalTop4: [1, 2, 3, 4],
      cheapTop4: [14, 15, 21, 22],
      overlap: 0,
    })
    artifact.intermediates.forEach((intermediate, index) => {
      expect(intermediate.rank).toBe(index + 1)
      expect(intermediate.censusCanonical).toEqual(intermediate.reconstructedCanonical)
      expect(intermediate.reconstructionFidelity.exactWithinTolerance).toBe(true)
      expect(intermediate.hop2ResidualSourceSemanticKey)
        .toBe(stormTwoHopSemanticFilterKey(intermediate.canonicalDeliveredFilters))
      expect(intermediate.hop2ProposalCount).toBe(intermediate.grandchildren.length)
      intermediate.grandchildren.forEach((grandchild) => {
        expect(grandchild.depthEdges).toBe(STORM_TWO_HOP_REACHABILITY_MAX_DEPTH_EDGES)
        expect(grandchild.intermediateRank).toBe(intermediate.rank)
      })
    })
    expect(artifact.totals.intermediateCount).toBe(31)
    expect(artifact.deterministic.depthEdges).toBe(2)
  })

  it('keeps admission ranking outcome-blind to full-polish labels', () => {
    const scores = [
      { proposalRank: 1, rmseDb: 2, maxAbsDb: 2, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 2, rmseDb: 1, maxAbsDb: 1, filterCount: 2, cancellationScore: 0 },
      { proposalRank: 3, rmseDb: 3, maxAbsDb: 3, filterCount: 2, cancellationScore: 0 },
    ]
    const withFutureLabels = scores.map((score) => ({
      ...score,
      fullPolishRmseDb: score.proposalRank === 3 ? 0 : 100,
      fullPolishReferenceImproved: score.proposalRank === 3,
    }))
    expect(rankStormTwoHopCheapAdmission(scores).ranking)
      .toEqual(rankStormTwoHopCheapAdmission(withFutureLabels).ranking)
    expect(artifact.controls).toMatchObject({
      fullPolishLabelsExcludedFromAdmission: true,
      outcomeBlindCheapRanking: true,
      futureLeakageAbsent: true,
      baselineComparatorsFrozen: true,
      noNormalBeamOrSearchExecution: true,
      maxDepthEdges: 2,
    })
  })

  it('preserves bridge provenance and distinguishes direct evidence from inference', () => {
    expect(artifact.bridgePaths.length).toBeGreaterThan(0)
    expect(artifact.bridgePaths.every((path) => path.evidence === 'inferred-offline-oracle' || path.evidence === 'direct-frozen-trajectory')).toBe(true)
    expect(artifact.bridgePaths.every((path) => path.blocker !== 'reachable-under-current-mechanism')).toBe(true)
    const groupsWithDuplicates = artifact.semanticGrandchildren.filter((group) => group.occurrenceCount > 1)
    expect(groupsWithDuplicates.length).toBeGreaterThan(0)
    expect(groupsWithDuplicates.every((group) => group.pathIds.length === group.occurrenceCount)).toBe(true)
    expect(artifact.totals.duplicateSemanticGrandchildPathCount)
      .toBe(groupsWithDuplicates.reduce((sum, group) => sum + group.occurrenceCount - 1, 0))
    expect(artifact.mechanismAttribution.evidenceBoundary.join(' ')).toMatch(/Direct evidence/)
    expect(artifact.mechanismAttribution.evidenceBoundary.join(' ')).toMatch(/Inference/)
  })

  it('freezes baseline/global-best comparisons and leaves predecessor artifacts byte-identical', () => {
    expect(artifact.originalParent.canonical).toEqual(artifact.bGlobalBest.canonical)
    expect(artifact.bGlobalBest.candidateId).toContain('proposal-4-remove')
    expect(artifact.controls.baselineComparatorsFrozen).toBe(true)
    expect(artifact.controls.futureLeakageAbsent).toBe(true)
    expect(artifact.frozenPredecessorArtifacts.every((entry) => entry.unchanged && entry.sha256Before === entry.sha256After)).toBe(true)
    expect(predecessorPaths.map(digest)).toEqual(beforeHashes)
  })

  it('reproduces a deterministic non-timing census without changing the frozen inputs', () => {
    const second = createStormTwoHopReachabilityArtifact()
    expect(JSON.stringify(second)).toBe(JSON.stringify(artifact))
    expect(second.deterministic.nonTimingArtifactReproduction).toBe(true)
    expect(second.deterministic.predecessorArtifactsUnchanged).toBe(true)
  }, 120_000)

  it('preserves factual gate results from existing artifact', () => {
    expect(artifact.testsAndGates.gateResults).toEqual({
      focused_test: 'PASS_THIS_RUN',
      runner_reproduction: 'PASS_THIS_RUN',
      predecessor_hashes: 'PASS_THIS_RUN',
      pnpm_test: 'FAIL',
      pnpm_typecheck: 'PASS_THIS_RUN',
      pnpm_build: 'PASS_THIS_RUN',
      pnpm_lint: 'PASS_THIS_RUN',
      core_benchmark: 'NOT_RUN',
      git_diff_check: 'PASS_THIS_RUN',
      routing_policy: 'PASS_THIS_RUN',
      depth_limit: 'PASS_THIS_RUN',
      no_normal_search: 'PASS_THIS_RUN',
      deterministic_reproduction: 'PASS_THIS_RUN',
    })
  })
})
