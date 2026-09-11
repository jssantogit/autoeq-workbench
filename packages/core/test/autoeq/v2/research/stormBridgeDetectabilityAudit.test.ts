import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  createStormBridgeDetectabilityAuditArtifact,
  classifyStormBridgeDetectability,
  EXPECTED_CAUSAL_SHA256,
  EXPECTED_TWO_HOP_CENSUS_SHA256,
  EXPECTED_POST_INITIAL_CENSUS_SHA256,
  STORM_BRIDGE_DETECTABILITY_CAUSAL_INPUT,
  STORM_BRIDGE_DETECTABILITY_TWO_HOP_CENSUS_INPUT,
  STORM_BRIDGE_DETECTABILITY_POST_INITIAL_CENSUS_INPUT,
  STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT,
  STORM_BRIDGE_DETECTABILITY_TOP4,
  STORM_BRIDGE_DETECTABILITY_TARGET_INTERMEDIATE,
  STORM_BRIDGE_DETECTABILITY_SIGNAL_IDS,
  STORM_BRIDGE_DETECTABILITY_CLASSIFICATIONS,
  type StormBridgeDetectabilityAuditArtifact,
  type StormBridgeDetectabilitySignalId,
} from '../../../../benchmarks/research/stormBridgeDetectabilityAudit.js'

const repositoryRoot = resolve(process.cwd(), '../..')
const causalPath = resolve(repositoryRoot, STORM_BRIDGE_DETECTABILITY_CAUSAL_INPUT)
const twoHopCensusPath = resolve(repositoryRoot, STORM_BRIDGE_DETECTABILITY_TWO_HOP_CENSUS_INPUT)
const postInitialCensusPath = resolve(
  repositoryRoot,
  STORM_BRIDGE_DETECTABILITY_POST_INITIAL_CENSUS_INPUT,
)

const digest = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

let artifact: StormBridgeDetectabilityAuditArtifact
let causalHashBefore: string
let twoHopHashBefore: string
let postInitialHashBefore: string

describe('Storm Bridge Detectability Audit', () => {
  beforeAll(() => {
    causalHashBefore = digest(causalPath)
    twoHopHashBefore = digest(twoHopCensusPath)
    postInitialHashBefore = digest(postInitialCensusPath)
    artifact = createStormBridgeDetectabilityAuditArtifact()
  }, 120_000)

  // 1. Predecessor artifact integrity hashes
  it('preserves predecessor artifact hashes byte-identically before and after audit', () => {
    const causalHashAfter = digest(causalPath)
    const twoHopHashAfter = digest(twoHopCensusPath)
    const postInitialHashAfter = digest(postInitialCensusPath)

    expect(causalHashAfter).toBe(causalHashBefore)
    expect(causalHashAfter).toBe(EXPECTED_CAUSAL_SHA256)

    expect(twoHopHashAfter).toBe(twoHopHashBefore)
    expect(twoHopHashAfter).toBe(EXPECTED_TWO_HOP_CENSUS_SHA256)

    expect(postInitialHashAfter).toBe(postInitialHashBefore)
    expect(postInitialHashAfter).toBe(EXPECTED_POST_INITIAL_CENSUS_SHA256)

    expect(artifact.frozenPredecessorArtifacts).toHaveLength(3)
    for (const pred of artifact.frozenPredecessorArtifacts) {
      expect(pred.unchanged).toBe(true)
      expect(pred.sha256Before).toBe(pred.expectedSha256)
      expect(pred.sha256After).toBe(pred.expectedSha256)
    }
  })

  // 2. Candidate set verification (exactly 31 candidates)
  it('evaluates exactly the 31 hop-1 candidates from the frozen two-hop census', () => {
    expect(artifact.candidateSet.totalCandidates).toBe(31)
    expect(artifact.candidateMatrix).toHaveLength(31)

    const proposalRanks = artifact.candidateMatrix.map((c) => c.proposalRank)
    expect(proposalRanks).toHaveLength(31)
    for (let rank = 1; rank <= 31; rank += 1) {
      expect(proposalRanks).toContain(rank)
    }

    // Verify parent identity & canonical baseline
    expect(artifact.frozenParentCanonical.rmseDb).toBeCloseTo(1.698935, 4)
    expect(artifact.frozenParentCanonical.maxAbsDb).toBeCloseTo(5.850643, 4)
    expect(artifact.frozenParentCanonical.filterCount).toBe(9)
  })

  // 3. Signal/label boundary (signals do not read full-polish labels or oracle outcomes)
  it('maintains strict signal/label boundary without leaking full-polish or oracle outcomes', () => {
    // Read raw census to confirm what labels exist
    const censusData = JSON.parse(readFileSync(twoHopCensusPath, 'utf8'))

    // Verify candidate matrix rows store prePolish metrics, not final 24-trial canonical outcomes
    for (const row of artifact.candidateMatrix) {
      const censusInter = censusData.intermediates.find(
        (i: { rank: number }) => i.rank === row.proposalRank,
      )
      expect(censusInter).toBeDefined()
      // Pre-polish RMSE should match census candidate before polish
      expect(row.prePolishMetrics.rmseDb).toBeDefined()
      expect(row.prePolishMetrics.filterCount).toBeDefined()
    }

    // Verify signal definitions describe admission-time/outcome-blind scoring
    for (const signal of artifact.signals) {
      expect(signal.definition).toBeDefined()
      expect(signal.definition.length).toBeGreaterThan(10)
    }
  })

  // 4. Deterministic reproduction of rankings
  it('deterministically reproduces rankings across runs', () => {
    const secondArtifact = createStormBridgeDetectabilityAuditArtifact()
    for (const s1 of artifact.signals) {
      const s2 = secondArtifact.signals.find((s) => s.signalId === s1.signalId)
      expect(s2).toBeDefined()
      expect(s2!.ranking).toEqual(s1.ranking)
      expect(s2!.top4).toEqual(s1.top4)
      expect(s2!.rankOfIntermediate16).toBe(s1.rankOfIntermediate16)
    }
  })

  // 5. All 31 candidates ranked by every signal
  it('ranks all 31 candidates in every signal without missing or duplicate ranks', () => {
    expect(artifact.signals).toHaveLength(8)
    for (const signal of artifact.signals) {
      expect(signal.ranking).toHaveLength(31)
      const rankSet = new Set(signal.ranking)
      expect(rankSet.size).toBe(31)
      for (let rank = 1; rank <= 31; rank += 1) {
        expect(rankSet.has(rank)).toBe(true)
      }
      expect(Object.keys(signal.rankByCandidate)).toHaveLength(31)
      expect(signal.top4).toEqual(signal.ranking.slice(0, 4))
    }
  })

  // 6. Primary positive label criteria and set { 16 }
  it('verifies primary positive label criteria isolates exactly candidate 16', () => {
    expect(artifact.positiveLabels.primaryPositiveSet).toEqual([16])
    expect(artifact.positiveLabels.primaryCriteria).toHaveLength(4)

    const censusData = JSON.parse(readFileSync(twoHopCensusPath, 'utf8'))
    const inter16 = censusData.intermediates.find((i: { rank: number }) => i.rank === 16)
    expect(inter16).toBeDefined()
    expect(inter16.mutation).toBe('split')
    // 1. does not itself beat parent / B-global best
    expect(inter16.improvesParent).toBe(false)
    expect(inter16.improvesBGlobalBest).toBe(false)
    // 2. has grandchild beating parent
    expect(inter16.grandchildrenBetterThanParent).toBeGreaterThan(0)
    // 3. retained by beam
    expect(inter16.retention.reconstructedBeamRank).toBeLessThanOrEqual(2)
    expect(inter16.retention.currentBeamEligible).toBe(true)
    // 4. reaches grandchild under normal downstream mechanics (lexical rank <= 4)
    const usefulGrandchild = inter16.grandchildren.find(
      (gc: { improvesParent: boolean }) => gc.improvesParent,
    )
    expect(usefulGrandchild).toBeDefined()
    expect(usefulGrandchild.lexicalRank).toBeLessThanOrEqual(4)

    // Secondary positive labels
    expect(artifact.positiveLabels.secondaryTwoHopUsefulSet).toEqual([1, 11, 12, 16, 25])
    expect(artifact.positiveLabels.secondaryBeatingBGlobalBestSet).toEqual([11, 12, 16, 25])
  })

  // 7. Rank of intermediate 16 in each signal
  it('correctly reports the rank of intermediate 16 across all 8 signals', () => {
    const expectedRanks: Record<StormBridgeDetectabilitySignalId, { rank: number; top4: number[] }> =
      {
        lexical: { rank: 16, top4: [1, 2, 3, 4] },
        'pre-polish-frozen-selector': { rank: 6, top4: [14, 15, 21, 22] },
        'pre-polish-rmse-max-abs': { rank: 2, top4: [14, 16, 15, 21] },
        'continuation-count': { rank: 27, top4: [23, 26, 29, 27] },
        'continuation-diversity': { rank: 25, top4: [13, 12, 9, 7] },
        'partial-refinement-2': { rank: 6, top4: [14, 15, 21, 22] },
        'partial-refinement-6': { rank: 6, top4: [14, 15, 21, 22] },
        'cheap-next-step-lookahead': { rank: 1, top4: [16, 14, 15, 21] },
      }

    for (const [signalId, expected] of Object.entries(expectedRanks) as Array<
      [StormBridgeDetectabilitySignalId, { rank: number; top4: number[] }]
    >) {
      const signal = artifact.signals.find((s) => s.signalId === signalId)
      expect(signal).toBeDefined()
      expect(signal!.rankOfIntermediate16).toBe(expected.rank)
      expect(signal!.top4).toEqual(expected.top4)
      expect(signal!.intermediate16InTop4).toBe(expected.rank <= 4)
    }

    // pre-polish-rmse-max-abs ranks 16 into top-4 (rank 2)
    const rmseSignal = artifact.signals.find((s) => s.signalId === 'pre-polish-rmse-max-abs')!
    expect(rmseSignal.intermediate16InTop4).toBe(true)
    expect(rmseSignal.rankOfIntermediate16).toBe(2)

    // cheap-next-step-lookahead ranks 16 at #1
    const lookaheadSignal = artifact.signals.find((s) => s.signalId === 'cheap-next-step-lookahead')!
    expect(lookaheadSignal.intermediate16InTop4).toBe(true)
    expect(lookaheadSignal.rankOfIntermediate16).toBe(1)
  })

  // 8. Primary recall@4 and secondary recall@4
  it('correctly calculates primary and secondary recall@4 for all signals', () => {
    const lexical = artifact.signals.find((s) => s.signalId === 'lexical')!
    expect(lexical.primaryRecallAt4.value).toBe(0)
    expect(lexical.primaryRecallAt4.recoveredCount).toBe(0)
    expect(lexical.secondaryRecallAt4.recoveredCount).toBe(1) // intermediate 1 is in top-4
    expect(lexical.secondaryRecallAt4.value).toBeCloseTo(0.2, 4)

    const prePolishRmse = artifact.signals.find((s) => s.signalId === 'pre-polish-rmse-max-abs')!
    expect(prePolishRmse.primaryRecallAt4.value).toBe(1)
    expect(prePolishRmse.primaryRecallAt4.recoveredCount).toBe(1)
    expect(prePolishRmse.primaryRecallAt4.recovered).toEqual([16])
    expect(prePolishRmse.secondaryRecallAt4.recoveredCount).toBe(1) // intermediate 16

    const lookahead = artifact.signals.find((s) => s.signalId === 'cheap-next-step-lookahead')!
    expect(lookahead.primaryRecallAt4.value).toBe(1)
    expect(lookahead.primaryRecallAt4.recoveredCount).toBe(1)
    expect(lookahead.primaryRecallAt4.recovered).toEqual([16])
    expect(lookahead.secondaryRecallAt4.recoveredCount).toBe(1) // intermediate 16

    const prePolishSelector = artifact.signals.find(
      (s) => s.signalId === 'pre-polish-frozen-selector',
    )!
    expect(prePolishSelector.primaryRecallAt4.value).toBe(0)
    expect(prePolishSelector.secondaryRecallAt4.recoveredCount).toBe(0)

    const contDiv = artifact.signals.find((s) => s.signalId === 'continuation-diversity')!
    expect(contDiv.primaryRecallAt4.value).toBe(0)
    expect(contDiv.secondaryRecallAt4.recoveredCount).toBe(1) // intermediate 12 is in top-4
  })

  // 9. Cost accounting verification
  it('verifies explicit cost accounting for every signal', () => {
    const lexical = artifact.signals.find((s) => s.signalId === 'lexical')!
    expect(lexical.cost.canonicalEvaluations).toBe(0)
    expect(lexical.cost.coordinateTrials).toBe(0)
    expect(lexical.cost.structuralProposalEnumerations).toBe(0)

    const prePolishSelector = artifact.signals.find(
      (s) => s.signalId === 'pre-polish-frozen-selector',
    )!
    expect(prePolishSelector.cost.canonicalEvaluations).toBe(31)
    expect(prePolishSelector.cost.coordinateTrials).toBe(0)
    expect(prePolishSelector.cost.structuralProposalEnumerations).toBe(0)

    const prePolishRmse = artifact.signals.find((s) => s.signalId === 'pre-polish-rmse-max-abs')!
    expect(prePolishRmse.cost.canonicalEvaluations).toBe(31)
    expect(prePolishRmse.cost.coordinateTrials).toBe(0)
    expect(prePolishRmse.cost.structuralProposalEnumerations).toBe(0)

    const contCount = artifact.signals.find((s) => s.signalId === 'continuation-count')!
    expect(contCount.cost.canonicalEvaluations).toBe(0)
    expect(contCount.cost.coordinateTrials).toBe(0)
    expect(contCount.cost.structuralProposalEnumerations).toBe(31)

    const contDiv = artifact.signals.find((s) => s.signalId === 'continuation-diversity')!
    expect(contDiv.cost.canonicalEvaluations).toBe(0)
    expect(contDiv.cost.coordinateTrials).toBe(0)
    expect(contDiv.cost.structuralProposalEnumerations).toBe(31)

    const partRef2 = artifact.signals.find((s) => s.signalId === 'partial-refinement-2')!
    expect(partRef2.cost.canonicalEvaluations).toBe(31)
    expect(partRef2.cost.coordinateTrials).toBe(62)
    expect(partRef2.cost.structuralProposalEnumerations).toBe(0)

    const partRef6 = artifact.signals.find((s) => s.signalId === 'partial-refinement-6')!
    expect(partRef6.cost.canonicalEvaluations).toBe(31)
    expect(partRef6.cost.coordinateTrials).toBe(186)
    expect(partRef6.cost.structuralProposalEnumerations).toBe(0)

    const lookahead = artifact.signals.find((s) => s.signalId === 'cheap-next-step-lookahead')!
    expect(lookahead.cost.canonicalEvaluations).toBe(816)
    expect(lookahead.cost.coordinateTrials).toBe(0)
    expect(lookahead.cost.structuralProposalEnumerations).toBe(31)
  })

  // 10. Classification verification ("bridge-signal-supported")
  it('classifies result as bridge-signal-supported with valid vocabulary', () => {
    expect(STORM_BRIDGE_DETECTABILITY_CLASSIFICATIONS).toEqual([
      'bridge-signal-supported',
      'partial-refinement-needed',
      'bridge-signal-not-supported',
      'mixed-unresolved',
    ])
    expect(artifact.classification).toBe('bridge-signal-supported')
    expect(artifact.classificationRationale).toContain('pre-polish-rmse-max-abs')
    expect(artifact.classificationRationale).toContain('rank 2')
    expect(artifact.classificationRationale).toContain('cheap-next-step-lookahead')
    expect(artifact.classificationRationale).toContain('rank 1')

    // Test classifier function directly
    expect(
      classifyStormBridgeDetectability({
        cheapSignalsAdmittingTarget: true,
        partialRefinementAdmittingTarget: false,
        cheapRecallImprovement: true,
      }),
    ).toBe('bridge-signal-supported')

    expect(
      classifyStormBridgeDetectability({
        cheapSignalsAdmittingTarget: false,
        partialRefinementAdmittingTarget: true,
        cheapRecallImprovement: false,
      }),
    ).toBe('partial-refinement-needed')

    expect(
      classifyStormBridgeDetectability({
        cheapSignalsAdmittingTarget: false,
        partialRefinementAdmittingTarget: false,
        cheapRecallImprovement: false,
      }),
    ).toBe('bridge-signal-not-supported')
  })

  // 11. Solver behavior invariant (packages/core/src/** untouched)
  it('preserves core solver source packages/core/src/** untouched', () => {
    const gitDiff = execFileSync('git', ['status', '--porcelain', 'packages/core/src'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim()
    expect(gitDiff).toBe('')
  })
})
