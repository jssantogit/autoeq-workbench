import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { resolveResearchPath } from '../../../../benchmarks/research/seedAllocationRun.js'
import { resolveCapacityRecoveryPath } from '../../../../benchmarks/research/frozenResearchInputs.js'
import { generateIndependentPolicyCells } from '../../../../benchmarks/research/stormAdmissionIndependentPolicyValidation.js'
import {
  CAUSAL_WIDTH_ARMS,
  buildVariableQuotaSelection,
  classifyCausalExhaustion,
  createCausalAdmissionOverride,
  proposalKey,
  runCausalArmOnCell,
  performOfflineTerminalFrontierCensus,
  STAGE_A_DEADLINE_MS,
  type CausalWidthArmConfig,
} from '../../../../benchmarks/research/stormExhaustionCausalHarness.js'
import {
  createStructuralBeamExhaustionTrace,
  type StructuralBeamExhaustionTrace,
  type StructuralProposal,
} from '../../../../benchmarks/research/structuralBeam.js'

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('Storm structural search exhaustion causal harness', () => {
  it('verifies predecessor artifact SHAs remain strictly unchanged', () => {
    const expected = {
      auditReport: 'ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b',
      singleBlocker: '646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7',
      twoHop: '733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d',
      postInitial: 'fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920',
    }

    const auditPath = resolveResearchPath(
      'packages/core/.research-artifacts/storm-bridge-detectability-audit-20260911/sparse-0010/audit-report.json',
    )
    const singleBlockerPath = resolveResearchPath(
      'packages/core/.research-artifacts/storm-single-blocker-bridge-causal-20260911/sparse-0010/experiment-report.json',
    )
    const twoHopPath = resolveResearchPath(
      'packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json',
    )
    const postInitialPath = resolveResearchPath(
      'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json',
    )

    if (existsSync(auditPath)) expect(fileSha256(auditPath)).toBe(expected.auditReport)
    if (existsSync(singleBlockerPath)) expect(fileSha256(singleBlockerPath)).toBe(expected.singleBlocker)
    if (existsSync(twoHopPath)) expect(fileSha256(twoHopPath)).toBe(expected.twoHop)
    if (existsSync(postInitialPath)) expect(fileSha256(postInitialPath)).toBe(expected.postInitial)
  })

  it('defines exactly the 11 predeclared causal width and novelty arms', () => {
    expect(CAUSAL_WIDTH_ARMS).toHaveLength(11)
    const armIds = CAUSAL_WIDTH_ARMS.map((a) => a.armId)
    expect(armIds).toEqual([
      'Q40-B2-P4',
      'Q31-B2-P4',
      'Q31-B4-P4',
      'Q31-B2-P8',
      'Q31-B4-P8',
      'Q04-B2-P4',
      'Q04-B4-P4',
      'Q04-B2-P8',
      'Q04-B4-P8',
      'Q31-NOVELTY-BACKFILL',
      'Q31-NOVELTY-BACKFILL-B4-P8',
    ])

    // Verify Q40 is pure lexical (no RMSE quota)
    const q40 = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q40-B2-P4')!
    expect(q40.rmseQuota).toBe(0)
    expect(q40.lexicalQuota).toBe(4)

    // Verify B2 vs B4 differs only in beamWidth
    const q31_b2_p4 = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q31-B2-P4')!
    const q31_b4_p4 = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q31-B4-P4')!
    expect(q31_b2_p4.beamWidth).toBe(2)
    expect(q31_b4_p4.beamWidth).toBe(4)
    expect(q31_b2_p4.proposalsPerParent).toBe(q31_b4_p4.proposalsPerParent)
    expect(q31_b2_p4.lexicalQuota).toBe(q31_b4_p4.lexicalQuota)
    expect(q31_b2_p4.rmseQuota).toBe(q31_b4_p4.rmseQuota)

    // Verify P4 vs P8 differs only in proposalsPerParent and scaled quota
    const q31_b2_p8 = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q31-B2-P8')!
    expect(q31_b2_p8.proposalsPerParent).toBe(8)
    expect(q31_b2_p8.lexicalQuota).toBe(6)
    expect(q31_b2_p8.rmseQuota).toBe(2)
  })

  it('selects correct variable quota proposals deterministically', () => {
    const lexical = [
      { key: 'p0', rank: 0 },
      { key: 'p1', rank: 1 },
      { key: 'p2', rank: 2 },
      { key: 'p3', rank: 3 },
      { key: 'p4', rank: 4 },
      { key: 'p5', rank: 5 },
      { key: 'p6', rank: 6 },
      { key: 'p7', rank: 7 },
    ]
    const rmse = [
      { key: 'p7', rank: 7 },
      { key: 'p6', rank: 6 },
      { key: 'p5', rank: 5 },
      { key: 'p4', rank: 4 },
      { key: 'p3', rank: 3 },
      { key: 'p2', rank: 2 },
      { key: 'p1', rank: 1 },
      { key: 'p0', rank: 0 },
    ]

    // Q31-P4: 3 lexical + 1 rmse
    const selQ31_P4 = buildVariableQuotaSelection(lexical, rmse, 3, 1, 4)
    expect(selQ31_P4.map((x) => x.key)).toEqual(['p0', 'p1', 'p2', 'p7'])

    // Q04-P4: 0 lexical + 4 rmse
    const selQ04_P4 = buildVariableQuotaSelection(lexical, rmse, 0, 4, 4)
    expect(selQ04_P4.map((x) => x.key)).toEqual(['p7', 'p6', 'p5', 'p4'])

    // Q31-P8: 6 lexical + 2 rmse
    const selQ31_P8 = buildVariableQuotaSelection(lexical, rmse, 6, 2, 8)
    expect(selQ31_P8.map((x) => x.key)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p6'])

    // Q04-P8: 0 lexical + 8 rmse
    const selQ04_P8 = buildVariableQuotaSelection(lexical, rmse, 0, 8, 8)
    expect(selQ04_P8.map((x) => x.key)).toEqual(['p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0'])
  })

  it('classifies exhaustion causes factually from lifecycle telemetry', () => {
    expect(classifyCausalExhaustion('deadline', 5000, 5000)).toBe('DEADLINE')
    expect(classifyCausalExhaustion('evaluation-budget', 1200, 5000)).toBe('EVALUATION_CEILING')

    // Generator empty trace
    const emptyTrace: StructuralBeamExhaustionTrace = {
      enabled: true,
      layers: [{
        schemaVersion: 1,
        layerIndex: 0,
        beamBeforeCandidateIds: ['c0'],
        parents: [{
          schemaVersion: 1,
          layerIndex: 0,
          parentIndex: 0,
          parentCandidateId: 'c0',
          parentFilterCount: 3,
          orderedProposalCount: 0,
          defaultAdmittedCount: 0,
          selectedProposalCount: 0,
          admissionIntervention: 'default',
          prePolishAlreadyVisitedCount: 0,
          overMaxFiltersCount: 0,
          postPolishVisitedCount: 0,
          evaluatedNewCount: 0,
          evaluatedCandidateIds: [],
          rawProposalsGenerated: 0,
          semanticUniqueProposalsBeforeAdmission: 0,
        }],
        generatedCandidateIds: [],
        retainedCandidateIds: ['c0'],
        retainedGeneratedCandidateIds: [],
        droppedGeneratedCandidateIds: [],
        terminalNoGenerated: true,
      }],
    }
    expect(classifyCausalExhaustion('no-admissible-proposals', 300, 5000, emptyTrace)).toBe('GENERATOR_EMPTY')

    // Beam retention cycle trace
    const beamCycleTrace: StructuralBeamExhaustionTrace = {
      enabled: true,
      layers: [
        {
          schemaVersion: 1,
          layerIndex: 0,
          beamBeforeCandidateIds: ['c0'],
          parents: [],
          generatedCandidateIds: ['c1', 'c2'],
          retainedCandidateIds: ['c0'],
          retainedGeneratedCandidateIds: [],
          droppedGeneratedCandidateIds: ['c1', 'c2'],
          terminalNoGenerated: false,
        },
        {
          schemaVersion: 1,
          layerIndex: 1,
          beamBeforeCandidateIds: ['c0'],
          parents: [{
            schemaVersion: 1,
            layerIndex: 1,
            parentIndex: 0,
            parentCandidateId: 'c0',
            parentFilterCount: 3,
            orderedProposalCount: 4,
            defaultAdmittedCount: 4,
            selectedProposalCount: 4,
            admissionIntervention: 'default',
            prePolishAlreadyVisitedCount: 0,
            overMaxFiltersCount: 0,
            postPolishVisitedCount: 4,
            evaluatedNewCount: 0,
            evaluatedCandidateIds: [],
            rawProposalsGenerated: 4,
            semanticUniqueProposalsBeforeAdmission: 4,
          }],
          generatedCandidateIds: [],
          retainedCandidateIds: ['c0'],
          retainedGeneratedCandidateIds: [],
          droppedGeneratedCandidateIds: [],
          terminalNoGenerated: true,
        },
      ],
    }
    expect(classifyCausalExhaustion('no-admissible-proposals', 500, 5000, beamCycleTrace)).toBe(
      'BEAM_RETENTION_ELIMINATES_NOVELTY',
    )
  })

  it('keeps trajectory invariant when exhaustion tracing is enabled vs disabled', () => {
    const snapshot = JSON.parse(
      readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
    )
    const cells = generateIndependentPolicyCells(snapshot)
    const cell = cells.find((c) => c.cellId === 'u12t-sparse-0002')!
    const arm = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q40-B2-P4')!

    const runWithoutTrace = runCausalArmOnCell(arm, cell, snapshot, undefined, 2000)
    const trace = createStructuralBeamExhaustionTrace()
    const runWithTrace = runCausalArmOnCell(arm, cell, snapshot, trace, 2000)

    expect(runWithoutTrace.stopReason).toBe(runWithTrace.stopReason)
    expect(runWithoutTrace.downstreamEvaluations).toBe(runWithTrace.downstreamEvaluations)
    expect(runWithoutTrace.selectedBest?.candidateId).toBe(runWithTrace.selectedBest?.candidateId)
    expect(runWithoutTrace.selectedBest?.rmseDb).toBe(runWithTrace.selectedBest?.rmseDb)
    expect(runWithoutTrace.selectedBest?.maxAbsDb).toBe(runWithTrace.selectedBest?.maxAbsDb)
  }, 30_000)

  it('verifies accounting invariants: totalEvaluations = downstream + signal canonical', () => {
    const snapshot = JSON.parse(
      readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
    )
    const cells = generateIndependentPolicyCells(snapshot)
    const cell = cells.find((c) => c.cellId === 'u12t-sparse-0002')!
    const arm = CAUSAL_WIDTH_ARMS.find((a) => a.armId === 'Q31-B2-P4')!

    const trace = createStructuralBeamExhaustionTrace()
    const run = runCausalArmOnCell(arm, cell, snapshot, trace, 2000)

    expect(run.totalEvaluations).toBe(run.downstreamEvaluations + run.signalCanonicalEvaluations)
    expect(run.totalElapsedMs).toBeGreaterThan(0)
    expect(run.totalCoordinateTrials).toBeGreaterThanOrEqual(0)
  }, 30_000)
})

