import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  createStormSingleBlockerBridgeCausalArtifact,
  createSingleBlockerRescueOverride,
  classifyStormSingleBlocker,
  EXPECTED_CENSUS_SHA256,
  STORM_SINGLE_BLOCKER_BEAM_WIDTH,
  STORM_SINGLE_BLOCKER_BRIDGE_CAUSAL_CENSUS_INPUT,
  STORM_SINGLE_BLOCKER_BRIDGE_MUTATION,
  STORM_SINGLE_BLOCKER_BRIDGE_PATH,
  STORM_SINGLE_BLOCKER_CLASSIFICATIONS,
  STORM_SINGLE_BLOCKER_DISPLACED_RANK,
  STORM_SINGLE_BLOCKER_EVALUATION_BUDGET,
  STORM_SINGLE_BLOCKER_GRANDCHILD_LEXICAL_RANK,
  STORM_SINGLE_BLOCKER_INTERMEDIATE_RANK,
  STORM_SINGLE_BLOCKER_LOCAL_POLISH,
  STORM_SINGLE_BLOCKER_MAX_FILTERS,
  STORM_SINGLE_BLOCKER_PROPOSALS_PER_PARENT,
  type StormSingleBlockerBridgeCausalArtifact,
  type StormSingleBlockerArmResult,
} from '../../../../benchmarks/research/stormSingleBlockerBridgeCausal.js'
import { stormTwoHopSemanticFilterKey } from '../../../../benchmarks/research/stormTwoHopReachabilityCensus.js'

const repositoryRoot = resolve(process.cwd(), '../..')
const censusPath = resolve(repositoryRoot, STORM_SINGLE_BLOCKER_BRIDGE_CAUSAL_CENSUS_INPUT)

const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

let artifact: StormSingleBlockerBridgeCausalArtifact
let censusHashBefore: string

describe('Storm single-blocker bridge causal experiment', () => {
  beforeAll(() => {
    censusHashBefore = digest(censusPath)
    artifact = createStormSingleBlockerBridgeCausalArtifact()
  }, 120_000)

  it('preserves the predecessor census artifact hash byte-identically', () => {
    const censusHashAfter = digest(censusPath)
    expect(censusHashAfter).toBe(censusHashBefore)
    expect(censusHashAfter).toBe(EXPECTED_CENSUS_SHA256)
    expect(artifact.frozenPredecessorArtifacts[0]?.unchanged).toBe(true)
    expect(artifact.frozenPredecessorArtifacts[0]?.sha256Before).toBe(EXPECTED_CENSUS_SHA256)
  })

  it('uses the literal decision vocabulary for classification', () => {
    expect(STORM_SINGLE_BLOCKER_CLASSIFICATIONS).toEqual([
      'single-blocker-bridge-causal-impact-supported',
      'bridge-reached-no-selected-best-gain',
      'single-blocker-contract-invalid',
      'bridge-not-realized-under-normal-continuation',
      'inconclusive',
    ])
  })

  it('preserves the frozen search configuration exactly', () => {
    expect(artifact.experimentConfig).toEqual({
      beamWidth: STORM_SINGLE_BLOCKER_BEAM_WIDTH,
      proposalsPerParent: STORM_SINGLE_BLOCKER_PROPOSALS_PER_PARENT,
      localPolishEvaluations: STORM_SINGLE_BLOCKER_LOCAL_POLISH,
      maxFilters: STORM_SINGLE_BLOCKER_MAX_FILTERS,
      evaluationBudget: STORM_SINGLE_BLOCKER_EVALUATION_BUDGET,
    })
    expect(artifact.experimentConfig.beamWidth).toBe(2)
    expect(artifact.experimentConfig.proposalsPerParent).toBe(4)
    expect(artifact.experimentConfig.localPolishEvaluations).toBe(24)
    expect(artifact.experimentConfig.evaluationBudget).toBe(9)
  })

  it('control arm uses unmodified lexical admission with no override', () => {
    const control = artifact.control
    expect(control.hop1InterventionApplied).toBe(false)
    expect(control.hop1InterventionSlotReplaced).toBeNull()
    expect(control.hop1BridgeIntermediateAdmitted).toBe(false)
    expect(control.hop1AdmittedRanks).toEqual([1, 2, 3, 4])
    expect(control.bridgeIntermediateInBeam).toBe(false)
    expect(control.bridgeExpandedAtHop2).toBe(false)
    expect(control.bridgeGrandchildGenerated).toBe(false)
    expect(control.bridgeGrandchildAdmitted).toBe(false)
    expect(control.bridgeGrandchildEvaluated).toBe(false)
    expect(control.selectorWinsOverParent).toBe(false)
    expect(control.improvementEvaluationIndex).toBeNull()
  })

  it('rescue arm changes exactly one hop-1 admission decision (replaces slot 4 with rank 16)', () => {
    const rescue = artifact.rescue
    expect(rescue.hop1InterventionApplied).toBe(true)
    expect(rescue.hop1InterventionSlotReplaced).toBe(STORM_SINGLE_BLOCKER_DISPLACED_RANK)
    expect(rescue.hop1InterventionSlotReplaced).toBe(4)
    expect(rescue.hop1BridgeIntermediateAdmitted).toBe(true)
    expect(rescue.hop1AdmittedRanks).toEqual([1, 2, 3, 16])
  })

  it('freezes bridge identity from the census artifact without hardcoding', () => {
    expect(artifact.frozenBridgePath).toBe(STORM_SINGLE_BLOCKER_BRIDGE_PATH)
    expect(artifact.frozenBridgeIntermediateRank).toBe(16)
    expect(artifact.frozenBridgeMutation).toBe(STORM_SINGLE_BLOCKER_BRIDGE_MUTATION)
    expect(artifact.frozenBridgeGrandchildLexicalRank).toBe(1)
    expect(artifact.predeclaredSelectionRule).toBe(
      'best-selector-winner-by-frozen-census-rmse-among-valid-rank16-grandchildren',
    )

    // Verify the frozen keys match census intermediate 16 and grandchild 1
    const censusData = JSON.parse(readFileSync(censusPath, 'utf8'))
    const inter16 = censusData.intermediates.find((i: { rank: number }) => i.rank === 16)
    expect(inter16).toBeDefined()
    expect(inter16.mutation).toBe('split')
    const key16 = stormTwoHopSemanticFilterKey(inter16.filtersBeforePolish)
    expect(artifact.frozenIntermediateSemanticKey).toBe(key16)

    const gc1 = inter16.grandchildren.find((gc: { lexicalRank: number }) => gc.lexicalRank === 1)
    expect(gc1).toBeDefined()
    expect(gc1.mutation).toBe('merge')
    const keyGc = stormTwoHopSemanticFilterKey(gc1.filtersBeforePolish)
    expect(artifact.frozenGrandchildSemanticKey).toBe(keyGc)
  })

  it('override self-disables after first hop and does not intervene again', () => {
    const { override, state } = createSingleBlockerRescueOverride(artifact.frozenIntermediateSemanticKey)
    expect(state.applied).toBe(false)

    // Dummy context for layer 1 parent 0
    const dummyProposal = {
      mutation: 'split' as const,
      filters: [],
    }
    const ctxLayer1 = {
      layerIndex: 1,
      parentIndex: 0,
      parent: {} as any,
      orderedProposals: [dummyProposal],
      admittedProposals: [dummyProposal],
    }

    // First call applies or sets applied
    override.apply(ctxLayer1)
    expect(state.applied).toBe(true)

    // Subsequent call at layer 2 must return null
    const ctxLayer2 = {
      layerIndex: 2,
      parentIndex: 0,
      parent: {} as any,
      orderedProposals: [dummyProposal],
      admittedProposals: [dummyProposal],
    }
    expect(override.apply(ctxLayer2)).toBeNull()

    // Subsequent call at layer 1 parent 1 must return null
    const ctxLayer1Parent1 = {
      layerIndex: 1,
      parentIndex: 1,
      parent: {} as any,
      orderedProposals: [dummyProposal],
      admittedProposals: [dummyProposal],
    }
    expect(override.apply(ctxLayer1Parent1)).toBeNull()
  })

  it('traverses the natural continuation: retained, expanded, admitted, evaluated', () => {
    const rescue = artifact.rescue
    // Intermediate naturally retained by beamWidth=2
    expect(rescue.bridgeIntermediateInBeam).toBe(true)
    expect(rescue.retainedBeamAfterHop1).toHaveLength(2)

    // Intermediate naturally expanded at hop 2
    expect(rescue.bridgeExpandedAtHop2).toBe(true)
    expect(rescue.hop2ParentsExpanded).toHaveLength(2)

    // Grandchild naturally generated, admitted (lexical rank 1 <= 4), and evaluated
    expect(rescue.bridgeGrandchildGenerated).toBe(true)
    expect(rescue.bridgeGrandchildAdmitted).toBe(true)
    expect(rescue.bridgeGrandchildEvaluated).toBe(true)
    expect(rescue.exactBridgePathFollowed).toBe(true)
    expect(rescue.bridgeGrandchildCanonical).not.toBeNull()
    expect(rescue.bridgeGrandchildCanonical!.rmseDb).toBeCloseTo(1.785598, 4)
    expect(rescue.bridgeGrandchildCanonical!.maxAbsDb).toBeCloseTo(5.493176, 4)
  })

  it('enforces exact equal descendant evaluation work between arms', () => {
    expect(artifact.equalWorkEnforced).toBe(true)

    const ctrlWork = artifact.control.workBreakdown
    const rscWork = artifact.rescue.workBreakdown

    expect(ctrlWork.seedEvaluations).toBe(1)
    expect(rscWork.seedEvaluations).toBe(1)

    expect(ctrlWork.hop1DescendantEvaluations).toBe(4)
    expect(rscWork.hop1DescendantEvaluations).toBe(4)

    expect(ctrlWork.hop2DescendantEvaluations).toBe(4)
    expect(rscWork.hop2DescendantEvaluations).toBe(4)

    expect(ctrlWork.totalDescendants).toBe(8)
    expect(rscWork.totalDescendants).toBe(8)
    expect(artifact.control.descendantEvaluations).toBe(8)
    expect(artifact.rescue.descendantEvaluations).toBe(8)

    expect(ctrlWork.canonicalEvaluations).toBe(9)
    expect(rscWork.canonicalEvaluations).toBe(9)
    expect(artifact.control.evaluationCount).toBe(9)
    expect(artifact.rescue.evaluationCount).toBe(9)

    expect(ctrlWork.fullPolishCoordinateTrials).toBe(192)
    expect(rscWork.fullPolishCoordinateTrials).toBe(192)
  })

  it('achieves causal improvement and supports single-blocker-bridge-causal-impact-supported', () => {
    expect(artifact.classification).toBe('single-blocker-bridge-causal-impact-supported')
    expect(artifact.rescue.selectorWinsOverParent).toBe(true)
    expect(artifact.rescue.selectorWinsOverBGlobalBest).toBe(true)
    expect(artifact.rescue.bestMaxAbs).toBeLessThan(artifact.control.bestMaxAbs!)
    expect(artifact.rescue.improvementEvaluationIndex).toBe(6)

    // Unit classification helper checks
    expect(classifyStormSingleBlocker(artifact.control, artifact.rescue)).toBe(
      'single-blocker-bridge-causal-impact-supported',
    )

    // Contract invalid when unequal work
    const unequalControl = { ...artifact.control, descendantEvaluations: 7 }
    expect(classifyStormSingleBlocker(unequalControl as StormSingleBlockerArmResult, artifact.rescue)).toBe(
      'inconclusive',
    )

    // Contract invalid when wrong slot replaced
    const invalidRescue = { ...artifact.rescue, hop1InterventionSlotReplaced: 2 }
    expect(classifyStormSingleBlocker(artifact.control, invalidRescue as StormSingleBlockerArmResult)).toBe(
      'single-blocker-contract-invalid',
    )
  })

  it('is deterministic on non-timing fields', () => {
    const second = createStormSingleBlockerBridgeCausalArtifact()
    expect(second.classification).toBe(artifact.classification)
    expect(second.control.bestRmse).toBe(artifact.control.bestRmse)
    expect(second.control.bestMaxAbs).toBe(artifact.control.bestMaxAbs)
    expect(second.rescue.bestRmse).toBe(artifact.rescue.bestRmse)
    expect(second.rescue.bestMaxAbs).toBe(artifact.rescue.bestMaxAbs)
    expect(second.control.workBreakdown).toEqual(artifact.control.workBreakdown)
    expect(second.rescue.workBreakdown).toEqual(artifact.rescue.workBreakdown)
    expect(second.rescue.selectedBestCandidateId).toBe(artifact.rescue.selectedBestCandidateId)
    expect(second.rescue.improvementEvaluationIndex).toBe(artifact.rescue.improvementEvaluationIndex)
  })
})
