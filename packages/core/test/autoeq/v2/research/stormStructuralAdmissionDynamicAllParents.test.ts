import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DYNAMIC_ALL_PARENTS_ARM_ORDER,
  DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET,
  DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET,
  DYNAMIC_ALL_PARENTS_HORIZONS_MS,
  DYNAMIC_ALL_PARENTS_PARTIAL_REFINEMENT_COORDINATE_TRIALS,
  DYNAMIC_ALL_PARENTS_REPETITIONS,
  classifyStormStructuralAdmissionDynamicAllParentsOutcome,
  reproduceStormStructuralAdmissionDynamicAllParentsFidelity,
  type StormStructuralAdmissionDynamicAllParentsClassificationInput,
} from '../../../../benchmarks/research/stormStructuralAdmissionDynamicAllParents.js'

const artifactPath = resolve(
  process.cwd(),
  '.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json',
)

describe('Storm structural admission dynamic-all-parents experiment', () => {
  it('keeps the three-arm, fixed-budget, balanced same-process protocol predeclared', () => {
    expect(DYNAMIC_ALL_PARENTS_REPETITIONS).toBe(4)
    expect(DYNAMIC_ALL_PARENTS_ARM_ORDER).toEqual([
      'lexical-all',
      'cheap-initial-only',
      'cheap-all-parents',
      'cheap-initial-only',
      'cheap-all-parents',
      'lexical-all',
      'cheap-all-parents',
      'lexical-all',
      'lexical-all',
      'cheap-initial-only',
      'cheap-all-parents',
      'cheap-initial-only',
    ])
    expect(DYNAMIC_ALL_PARENTS_ARM_ORDER.filter((arm) => arm === 'lexical-all')).toHaveLength(4)
    expect(DYNAMIC_ALL_PARENTS_ARM_ORDER.filter((arm) => arm === 'cheap-initial-only')).toHaveLength(4)
    expect(DYNAMIC_ALL_PARENTS_ARM_ORDER.filter((arm) => arm === 'cheap-all-parents')).toHaveLength(4)
    expect(DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET).toBe(16)
    expect(DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET).toBe(17)
    expect(DYNAMIC_ALL_PARENTS_HORIZONS_MS).toEqual([5_000, 15_000, 30_000, 60_000])
  })

  it('recomputes the initial frozen-selector admission without partial refinement or oracle inputs', () => {
    const fidelity = reproduceStormStructuralAdmissionDynamicAllParentsFidelity()

    expect(fidelity.controlTop4).toEqual([1, 2, 3, 4])
    expect(fidelity.cheapInitialOnlyTop4).toEqual([3, 1, 10, 9])
    expect(fidelity.cheapAllParentsInitialTop4).toEqual([3, 1, 10, 9])
    expect(fidelity.prePolishCanonicalEvaluations).toBe(21)
    expect(fidelity.partialRefinementCoordinateTrials).toBe(DYNAMIC_ALL_PARENTS_PARTIAL_REFINEMENT_COORDINATE_TRIALS)
    expect(fidelity.oracleInputsUsed).toEqual([])
    expect(fidelity.initialRankingDerivedAtRuntime).toBe(true)
    expect(fidelity.normalSolverUnchangedOutsideExperimentalMode).toBe(true)
  })

  it('forces an inconclusive result when replication or causal contract gates fail', () => {
    const invalid: StormStructuralAdmissionDynamicAllParentsClassificationInput = {
      fidelityValid: false,
      replicationValid: false,
      timingProtocolValid: true,
      budgetSufficient: true,
      noOracleInputs: true,
      cherryPickingAbsent: true,
      initialOnlyBestRegret: 1,
      lexicalAllBestRegret: 2,
      dynamicAllParentsBestRegret: 0.5,
      initialOnlyBestRmseDb: 1,
      lexicalAllBestRmseDb: 2,
      dynamicAllParentsBestRmseDb: 0.5,
      initialOnlyBestMaxAbsDb: 1,
      lexicalAllBestMaxAbsDb: 2,
      dynamicAllParentsBestMaxAbsDb: 0.5,
      dynamicPairwiseWins: 4,
      dynamicPairwiseLosses: 0,
      dynamicTimeToQualityConsistentlyWorse: false,
      dynamicParentOutcomeBenefits: 2,
      dynamicParentOutcomeLosses: 0,
      dynamicNoChangeScoringParents: 0,
    }

    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome(invalid)).toBe('inconclusive')
  })

  it('distinguishes supported, sufficient, harmful, and mixed incremental outcomes', () => {
    const base: StormStructuralAdmissionDynamicAllParentsClassificationInput = {
      fidelityValid: true,
      replicationValid: true,
      timingProtocolValid: true,
      budgetSufficient: true,
      noOracleInputs: true,
      cherryPickingAbsent: true,
      initialOnlyBestRegret: 1,
      lexicalAllBestRegret: 1.2,
      dynamicAllParentsBestRegret: 0.8,
      initialOnlyBestRmseDb: 1,
      lexicalAllBestRmseDb: 1.2,
      dynamicAllParentsBestRmseDb: 0.8,
      initialOnlyBestMaxAbsDb: 1,
      lexicalAllBestMaxAbsDb: 1.2,
      dynamicAllParentsBestMaxAbsDb: 0.8,
      dynamicPairwiseWins: 3,
      dynamicPairwiseLosses: 1,
      dynamicTimeToQualityConsistentlyWorse: false,
      dynamicParentOutcomeBenefits: 2,
      dynamicParentOutcomeLosses: 0,
      dynamicNoChangeScoringParents: 1,
    }
    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome(base)).toBe('dynamic-all-parent-supported')

    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome({
      ...base,
      dynamicAllParentsBestRegret: 1,
      dynamicAllParentsBestRmseDb: 1,
      dynamicAllParentsBestMaxAbsDb: 1,
      dynamicPairwiseWins: 2,
      dynamicPairwiseLosses: 2,
      dynamicParentOutcomeBenefits: 0,
      dynamicParentOutcomeLosses: 0,
      dynamicNoChangeScoringParents: 3,
    })).toBe('initial-only-sufficient-at-this-budget')

    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome({
      ...base,
      dynamicAllParentsBestRegret: 1.3,
      dynamicAllParentsBestRmseDb: 1.3,
      dynamicAllParentsBestMaxAbsDb: 1.3,
      dynamicPairwiseWins: 0,
      dynamicPairwiseLosses: 4,
      dynamicTimeToQualityConsistentlyWorse: true,
      dynamicParentOutcomeBenefits: 0,
      dynamicParentOutcomeLosses: 3,
    })).toBe('dynamic-all-parent-harmful')

    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome({
      ...base,
      dynamicAllParentsBestRegret: 1.05,
      dynamicAllParentsBestRmseDb: 1.05,
      dynamicAllParentsBestMaxAbsDb: 1.05,
      dynamicPairwiseWins: 2,
      dynamicPairwiseLosses: 2,
      dynamicParentOutcomeBenefits: 2,
      dynamicParentOutcomeLosses: 2,
    })).toBe('dynamic-all-parent-mixed')
  })

  it('classifies equal C/B outcomes as initial-only sufficient despite descriptive parent mechanisms', () => {
    const equalOutcomeWithMechanisms: StormStructuralAdmissionDynamicAllParentsClassificationInput = {
      fidelityValid: true,
      replicationValid: true,
      timingProtocolValid: true,
      budgetSufficient: true,
      noOracleInputs: true,
      cherryPickingAbsent: true,
      initialOnlyBestRegret: 1.5509895845764776,
      lexicalAllBestRegret: 1.6357158771757774,
      dynamicAllParentsBestRegret: 1.5509895845764776,
      initialOnlyBestRmseDb: 1.6989353408590506,
      lexicalAllBestRmseDb: 1.694436673146729,
      dynamicAllParentsBestRmseDb: 1.6989353408590506,
      initialOnlyBestMaxAbsDb: 5.850643387777495,
      lexicalAllBestMaxAbsDb: 6.025019232356895,
      dynamicAllParentsBestMaxAbsDb: 5.850643387777495,
      dynamicPairwiseWins: 0,
      dynamicPairwiseLosses: 0,
      dynamicTimeToQualityConsistentlyWorse: false,
      dynamicParentOutcomeBenefits: 0,
      dynamicParentOutcomeLosses: 0,
      dynamicNoChangeScoringParents: 0,
    }

    expect(classifyStormStructuralAdmissionDynamicAllParentsOutcome(equalOutcomeWithMechanisms)).toBe(
      'initial-only-sufficient-at-this-budget',
    )
  })

  it('records arm-local admission scope and charges every cheap score separately', () => {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      fidelity: Record<string, unknown>
      classification: string
      runs: Array<{
        armId: string
        work: { prePolishCanonicalEvaluations: number; descendantEvaluations: number }
        timing: { admissionElapsedMs: number; totalElapsedMs: number }
        parentDecisions: Array<{
          proposalCount: number
          cheapRanking: number[] | null
          canonicalPrePolishEvaluationCount: number
          rankingSource: string
          layerIndex: number
        }>
      }>
    }

    expect(artifact.fidelity).toMatchObject({
      valid: true,
      futureRankingDerivedAtRuntime: true,
      parentLocalRankingNoOutcomeReuse: true,
      partialRefinementCoordinateTrials: 0,
    })
    expect(artifact.runs).toHaveLength(DYNAMIC_ALL_PARENTS_ARM_ORDER.length)
    for (const run of artifact.runs) {
      expect(run.work.descendantEvaluations).toBeLessThanOrEqual(DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET)
      expect(run.timing.totalElapsedMs).toBeGreaterThanOrEqual(run.timing.admissionElapsedMs)
      if (run.armId === 'lexical-all') {
        expect(run.work.prePolishCanonicalEvaluations).toBe(0)
        expect(run.parentDecisions.every((decision) => decision.cheapRanking === null)).toBe(true)
      } else if (run.armId === 'cheap-initial-only') {
        expect(run.work.prePolishCanonicalEvaluations).toBe(21)
        expect(run.parentDecisions.filter((decision) => decision.cheapRanking !== null)).toHaveLength(1)
      } else {
        expect(run.work.prePolishCanonicalEvaluations).toBeGreaterThan(21)
        expect(run.parentDecisions.every((decision) =>
          decision.cheapRanking !== null &&
          decision.rankingSource === 'runtime-pre-polish-frozen-selector' &&
          decision.canonicalPrePolishEvaluationCount === decision.proposalCount,
        )).toBe(true)
        expect(run.parentDecisions.some((decision) => decision.layerIndex > 1)).toBe(true)
      }
    }
    expect([
      'dynamic-all-parent-supported',
      'initial-only-sufficient-at-this-budget',
      'dynamic-all-parent-harmful',
      'dynamic-all-parent-mixed',
      'inconclusive',
    ]).toContain(artifact.classification)
  })
})
