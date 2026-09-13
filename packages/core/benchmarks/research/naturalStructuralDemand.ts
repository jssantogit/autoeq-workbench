import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  runScalableStructuralSearch,
  type CapacityPressureDelta,
  type Filter,
  type FrontierUtilizationDelta,
  type ResolvedStructuralSearchConfig,
  type ScalableSearchAction,
  type ScalableStructuralSearchInput,
  type ScalableStructuralSearchResult,
  type SchedulerDecisionSearchRunner,
  type SearchWorkTotals,
} from '../../src/index.js'
import {
  evaluateFactorizedSchedulerDecision,
  type SchedulerDecisionArmResult,
  type SchedulerDecisionSnapshot,
} from '../../src/autoeq/v2/decisionOracle.js'
import type { ScalableSearchDecisionSnapshot } from '../../src/autoeq/v2/scalableStructuralSearch.js'
import {
  DECISION_ORACLE_CASE_IDS,
  naturalStructuralDemandCaptureReasons,
  type NaturalStructuralDemandCaptureReason,
  type NaturalStructuralDemandCaptureSnapshot,
} from './decisionOracle.js'
import {
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from './manualRegression.js'

export const NATURAL_STRUCTURAL_DEMAND_STAGE_QUANTUM_MS = 250
export const NATURAL_STRUCTURAL_DEMAND_ARM_QUANTUM_MS = 250
export const NATURAL_STRUCTURAL_DEMAND_INVOCATIONS_PER_ARM = 1
export const NATURAL_STRUCTURAL_DEMAND_LATE_BUDGET_FRACTION = 0.8

export interface NaturalStructuralDemandEnvelope {
  readonly id: 'short-reference' | 'long-natural-search'
  readonly maximumCapacity: number
  readonly liveBudgetMs: number
  readonly stageQuantumMs: 250
  readonly armQuantumMs: 250
  readonly invocationsPerArm: 1
}

export const NATURAL_STRUCTURAL_DEMAND_SHORT_ENVELOPE: NaturalStructuralDemandEnvelope = Object.freeze({
  id: 'short-reference',
  maximumCapacity: 17,
  liveBudgetMs: 1_000,
  stageQuantumMs: 250,
  armQuantumMs: 250,
  invocationsPerArm: 1,
})

export const NATURAL_STRUCTURAL_DEMAND_LONG_ENVELOPE: NaturalStructuralDemandEnvelope = Object.freeze({
  id: 'long-natural-search',
  maximumCapacity: 43,
  liveBudgetMs: 10_000,
  stageQuantumMs: 250,
  armQuantumMs: 250,
  invocationsPerArm: 1,
})

/**
 * The only resource envelopes used by this research program.  Keep this
 * frozen and do not add duration/capacity sweep options to the runner.
 */
export const NATURAL_STRUCTURAL_DEMAND_ENVELOPES: readonly NaturalStructuralDemandEnvelope[] = Object.freeze([
  NATURAL_STRUCTURAL_DEMAND_SHORT_ENVELOPE,
  NATURAL_STRUCTURAL_DEMAND_LONG_ENVELOPE,
])

export type CapacityOnlySlotUseClassification =
  | 'available-but-unused'
  | 'explored'
  | 'productively-used'

export interface CapacityOnlySlotUseObservation {
  oldCapacity: number
  newCapacity: number
  startingFilterCount: number
  generatedFrontierMaxFilterCount: number
  admittedFrontierMaxFilterCount: number
  polishedFrontierMaxFilterCount: number
  finalFilterCount: number
  finalQuality: readonly [number, number, number]
  controlFinalQuality: readonly [number, number, number]
  /** Test/report metadata only; classification never reads this value. */
  configuredMaxFilters?: number
}

export interface CapacityOnlySlotUseResult extends CapacityOnlySlotUseObservation {
  capacityExpanded: boolean
  candidateExceededOldCapacity: boolean
  acceptedCandidateExceededOldCapacity: boolean
  polishedCandidateExceededOldCapacity: boolean
  finalFilterCountExceededOldCapacity: boolean
  finalImprovementDependsOnUnavailableState: boolean
  classification: CapacityOnlySlotUseClassification
}

function compareQualityKey(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! < right[index]!) return -1
    if (left[index]! > right[index]!) return 1
  }
  return 0
}

function qualityIsFinite(
  quality: readonly [number, number, number],
): boolean {
  return quality.every((value) => Number.isFinite(value))
}

/**
 * Classify observed capacity-only frontier use.  A larger configured
 * maximum is not evidence: the searched frontier must cross the old ceiling.
 * Productive use is conservative and requires an admitted, polished, or
 * final state above that ceiling plus a strict final-quality improvement over
 * the cloned control arm.  At a fixed ceiling, capacity cannot be productive.
 */
export function classifyCapacityOnlySlotUse(
  observation: CapacityOnlySlotUseObservation,
): CapacityOnlySlotUseResult {
  const candidateExceededOldCapacity =
    observation.generatedFrontierMaxFilterCount > observation.oldCapacity
  const acceptedCandidateExceededOldCapacity =
    observation.admittedFrontierMaxFilterCount > observation.oldCapacity
  const polishedCandidateExceededOldCapacity =
    observation.polishedFrontierMaxFilterCount > observation.oldCapacity
  const finalFilterCountExceededOldCapacity =
    observation.finalFilterCount > observation.oldCapacity
  const structuralStateAboveOldCapacity =
    acceptedCandidateExceededOldCapacity ||
    polishedCandidateExceededOldCapacity ||
    finalFilterCountExceededOldCapacity
  const qualityImproved = qualityIsFinite(observation.finalQuality) &&
    qualityIsFinite(observation.controlFinalQuality) &&
    compareQualityKey(observation.finalQuality, observation.controlFinalQuality) < 0
  const finalImprovementDependsOnUnavailableState =
    observation.newCapacity > observation.oldCapacity &&
    structuralStateAboveOldCapacity &&
    qualityImproved

  return {
    ...observation,
    capacityExpanded: observation.newCapacity > observation.oldCapacity,
    candidateExceededOldCapacity,
    acceptedCandidateExceededOldCapacity,
    polishedCandidateExceededOldCapacity,
    finalFilterCountExceededOldCapacity,
    finalImprovementDependsOnUnavailableState,
    classification: !candidateExceededOldCapacity
      ? 'available-but-unused'
      : finalImprovementDependsOnUnavailableState
        ? 'productively-used'
        : 'explored',
  }
}

export interface NaturalStructuralDemandCausalInput {
  controlFinalQuality: readonly [number, number, number]
  effortOnlyFinalQuality: readonly [number, number, number]
  capacityOnlyFinalQuality: readonly [number, number, number]
  capacityOnlySlotUse: CapacityOnlySlotUseClassification | CapacityOnlySlotUseResult
}

export type NaturalStructuralDemandCausalLabel =
  | 'early-effort-dominant'
  | 'structural-capacity-demand'
  | 'both-useful'
  | 'neither-useful'
  | 'noisy-inconclusive'

/** Apply descriptive first-order comparisons; no fitted threshold is used. */
export function classifyNaturalStructuralDemand(
  input: NaturalStructuralDemandCausalInput,
): NaturalStructuralDemandCausalLabel {
  if (
    !qualityIsFinite(input.controlFinalQuality) ||
    !qualityIsFinite(input.effortOnlyFinalQuality) ||
    !qualityIsFinite(input.capacityOnlyFinalQuality)
  ) return 'noisy-inconclusive'

  const effortUseful = compareQualityKey(
    input.effortOnlyFinalQuality,
    input.controlFinalQuality,
  ) < 0
  const capacityClass = typeof input.capacityOnlySlotUse === 'string'
    ? input.capacityOnlySlotUse
    : input.capacityOnlySlotUse.classification
  const capacityUseful = capacityClass === 'productively-used' &&
    compareQualityKey(
      input.capacityOnlyFinalQuality,
      input.controlFinalQuality,
    ) < 0

  if (effortUseful && capacityUseful) return 'both-useful'
  if (effortUseful) return 'early-effort-dominant'
  if (capacityUseful) return 'structural-capacity-demand'
  return 'neither-useful'
}

export interface NaturalStructuralDemandTrajectoryEntry {
  elapsedMs: number
  stage: number
  stageIndex: number
  capacity: number
  effort: number
  effortLevel: number
  incumbentFilterCount: number
  frontierMaxFilterCount: number
  incumbentUtilization: number
  frontierUtilization: FrontierUtilizationDelta
  capacityPressure: CapacityPressureDelta
  recentIncumbentGain: number
  deterministicWork: SearchWorkTotals
  workSinceMeaningfulImprovement: SearchWorkTotals
  schedulerAction?: ScalableSearchAction
}

export interface NaturalStructuralDemandArmRecord {
  action: SchedulerDecisionArmResult['action']
  resolvedConfig: ResolvedStructuralSearchConfig
  finalQuality: readonly [number, number, number]
  absoluteGain: number
  relativeGain: number | null
  workDelta: SearchWorkTotals
  elapsedMs: number
  oldCapacity: number
  newCapacity: number
  startingFilterCount: number
  generatedFrontierMaxFilterCount: number
  admittedFrontierMaxFilterCount: number
  polishedFrontierMaxFilterCount: number
  finalFilterCount: number
  capacityExpanded: boolean
  candidateExceededOldCapacity: boolean
  acceptedCandidateExceededOldCapacity: boolean
  polishedCandidateExceededOldCapacity: boolean
  finalFilterCountExceededOldCapacity: boolean
  finalImprovementDependsOnUnavailableState: boolean
  slotUseClassification: CapacityOnlySlotUseClassification
}

export interface NaturalStructuralDemandCaptureRecord {
  snapshotOrigin: 'natural'
  captureReasons: NaturalStructuralDemandCaptureReason[]
  elapsedMs: number
  snapshot: SchedulerDecisionSnapshot
  arms: [
    NaturalStructuralDemandArmRecord,
    NaturalStructuralDemandArmRecord,
    NaturalStructuralDemandArmRecord,
  ]
  causalLabel: NaturalStructuralDemandCausalLabel
}

export interface NaturalStructuralDemandRunRecord {
  type: 'natural-structural-demand'
  caseId: ManualRegressionCaseId
  envelope: NaturalStructuralDemandEnvelope
  protocol: {
    stageQuantumMs: 250
    armQuantumMs: 250
    invocationsPerArm: 1
    lateBudgetFraction: 0.8
  }
  trajectory: NaturalStructuralDemandTrajectoryEntry[]
  captures: NaturalStructuralDemandCaptureRecord[]
}

export interface NaturalStructuralDemandProbeOptions {
  caseIds?: readonly ManualRegressionCaseId[]
  nowMs?: () => number
  /** Structural runner used by each factorized arm. */
  run?: SchedulerDecisionSearchRunner
  /** Optional injected live runner for deterministic harness tests. */
  liveRun?: (
    input: ScalableStructuralSearchInput,
  ) => ScalableStructuralSearchResult
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneWork(work: SearchWorkTotals): SearchWorkTotals {
  return { ...work }
}

function cloneCapacityPressure(value: CapacityPressureDelta): CapacityPressureDelta {
  return { ...value }
}

function cloneFrontierUtilization(value: FrontierUtilizationDelta): FrontierUtilizationDelta {
  return { ...value }
}

function cloneScalableSnapshot(
  snapshot: ScalableSearchDecisionSnapshot,
): ScalableSearchDecisionSnapshot {
  return {
    ...snapshot,
    desiredDb: [...snapshot.desiredDb],
    frequencies: [...snapshot.frequencies],
    baseConfig: { ...snapshot.baseConfig },
    resolvedConfig: { ...snapshot.resolvedConfig },
    incumbent: {
      filters: cloneFilters(snapshot.incumbent.filters),
      rmseDb: snapshot.incumbent.rmseDb,
      maxAbsDb: snapshot.incumbent.maxAbsDb,
    },
    recentGains: [...snapshot.recentGains],
    workSinceMeaningfulImprovement: cloneWork(snapshot.workSinceMeaningfulImprovement),
    frontierUtilization: cloneFrontierUtilization(snapshot.frontierUtilization),
    capacityPressure: cloneCapacityPressure(snapshot.capacityPressure),
    cumulativeCapacityPressure: cloneCapacityPressure(snapshot.cumulativeCapacityPressure),
    expansionOpportunity: { ...snapshot.expansionOpportunity },
    cumulativeWork: cloneWork(snapshot.cumulativeWork),
  }
}

function oracleSnapshot(
  value: ScalableSearchDecisionSnapshot,
): SchedulerDecisionSnapshot {
  return {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequencies],
    sampleRateHz: value.sampleRateHz,
    baseConfig: { ...value.baseConfig },
    resolvedConfig: { ...value.resolvedConfig },
    incumbent: {
      filters: cloneFilters(value.incumbent.filters),
      rmseDb: value.incumbent.rmseDb,
      maxAbsDb: value.incumbent.maxAbsDb,
    },
    currentCapacity: value.currentCapacity,
    maximumCapacity: value.maximumCapacity,
    effortLevel: value.effortLevel,
    recentGains: [...value.recentGains],
    recentGain: value.recentGain,
    workSinceMeaningfulImprovement: cloneWork(value.workSinceMeaningfulImprovement),
    expansionOpportunity: { ...value.expansionOpportunity },
    residualTelemetry: { ...value.expansionOpportunity },
    capacityPressure: cloneCapacityPressure(value.capacityPressure),
    frontierUtilization: cloneFrontierUtilization(value.frontierUtilization),
    incumbentUtilization: value.incumbentUtilization,
    cumulativeWork: cloneWork(value.cumulativeWork),
    remainingWallClockMs: value.remainingWallClockMs,
    stageIndex: value.stageIndex,
  }
}

function trajectoryEntry(
  snapshot: ScalableSearchDecisionSnapshot,
  elapsedMs: number,
): NaturalStructuralDemandTrajectoryEntry {
  return {
    elapsedMs,
    stage: snapshot.stageIndex,
    stageIndex: snapshot.stageIndex,
    capacity: snapshot.currentCapacity,
    effort: snapshot.effortLevel,
    effortLevel: snapshot.effortLevel,
    incumbentFilterCount: snapshot.incumbent.filters.length,
    frontierMaxFilterCount: snapshot.frontierUtilization.generatedCandidateFilterCountMax,
    incumbentUtilization: snapshot.incumbentUtilization,
    frontierUtilization: cloneFrontierUtilization(snapshot.frontierUtilization),
    capacityPressure: cloneCapacityPressure(snapshot.capacityPressure),
    recentIncumbentGain: snapshot.recentGain,
    deterministicWork: cloneWork(snapshot.cumulativeWork),
    workSinceMeaningfulImprovement: cloneWork(snapshot.workSinceMeaningfulImprovement),
  }
}

function serializeArm(
  arm: SchedulerDecisionArmResult,
  control: SchedulerDecisionArmResult,
  oldCapacity: number,
): NaturalStructuralDemandArmRecord {
  const frontier = arm.frontierUtilization
  const slotUse = classifyCapacityOnlySlotUse({
    oldCapacity,
    newCapacity: arm.capacityAfter,
    startingFilterCount: arm.startingIncumbent.filters.length,
    generatedFrontierMaxFilterCount: frontier.generatedCandidateFilterCountMax,
    admittedFrontierMaxFilterCount: frontier.admittedCandidateFilterCountMax,
    polishedFrontierMaxFilterCount: frontier.polishedCandidateFilterCountMax,
    finalFilterCount: arm.finalIncumbent.filters.length,
    finalQuality: arm.finalQuality,
    controlFinalQuality: control.finalQuality,
    configuredMaxFilters: arm.resolvedConfig.maxFilters,
  })
  return {
    action: arm.action,
    resolvedConfig: { ...arm.resolvedConfig },
    finalQuality: [...arm.finalQuality] as [number, number, number],
    absoluteGain: arm.absoluteGain,
    relativeGain: arm.relativeGain ?? null,
    workDelta: cloneWork(arm.workDelta),
    elapsedMs: arm.elapsedMs,
    oldCapacity: slotUse.oldCapacity,
    newCapacity: slotUse.newCapacity,
    startingFilterCount: slotUse.startingFilterCount,
    generatedFrontierMaxFilterCount: slotUse.generatedFrontierMaxFilterCount,
    admittedFrontierMaxFilterCount: slotUse.admittedFrontierMaxFilterCount,
    polishedFrontierMaxFilterCount: slotUse.polishedFrontierMaxFilterCount,
    finalFilterCount: slotUse.finalFilterCount,
    capacityExpanded: slotUse.capacityExpanded,
    candidateExceededOldCapacity: slotUse.candidateExceededOldCapacity,
    acceptedCandidateExceededOldCapacity: slotUse.acceptedCandidateExceededOldCapacity,
    polishedCandidateExceededOldCapacity: slotUse.polishedCandidateExceededOldCapacity,
    finalFilterCountExceededOldCapacity: slotUse.finalFilterCountExceededOldCapacity,
    finalImprovementDependsOnUnavailableState: slotUse.finalImprovementDependsOnUnavailableState,
    slotUseClassification: slotUse.classification,
  }
}

function resolveCaseIds(
  caseIds: readonly ManualRegressionCaseId[] | undefined,
): ManualRegressionCaseId[] {
  const selected = caseIds === undefined
    ? [...DECISION_ORACLE_CASE_IDS]
    : [...caseIds]
  const approved = new Set(DECISION_ORACLE_CASE_IDS)
  if (
    selected.length === 0 ||
    new Set(selected).size !== selected.length ||
    selected.some((caseId) => !approved.has(caseId))
  ) throw new Error('Natural structural-demand probe requires unique approved case IDs')
  return selected
}

function runEnvelope(
  caseId: ManualRegressionCaseId,
  envelope: NaturalStructuralDemandEnvelope,
  nowMs: () => number,
  liveRun: (
    input: ScalableStructuralSearchInput,
  ) => ScalableStructuralSearchResult,
  oracleRun: SchedulerDecisionSearchRunner,
): NaturalStructuralDemandRunRecord {
  const prepared = prepareManualRegressionDesired(caseId)
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: 5,
  })
  const startedAt = nowMs()
  const deadlineAt = startedAt + envelope.liveBudgetMs
  const capturedReasons = new Set<string>()
  const liveSnapshots: Array<{
    reasons: NaturalStructuralDemandCaptureReason[]
    snapshot: ScalableSearchDecisionSnapshot
    elapsedMs: number
  }> = []
  const trajectory: NaturalStructuralDemandTrajectoryEntry[] = []
  const trajectoryByStage = new Map<number, NaturalStructuralDemandTrajectoryEntry>()

  liveRun({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    maxFilters: envelope.maximumCapacity,
    baseConfig,
    deadline: { isExpired: () => nowMs() >= deadlineAt },
    stageQuantumMs: envelope.stageQuantumMs,
    nowMs,
    remainingWallClockMs: () => Math.max(0, deadlineAt - nowMs()),
    onDecision: (value) => {
      const snapshot = cloneScalableSnapshot(value)
      const elapsedMs = Math.max(0, nowMs() - startedAt)
      const captureInput: NaturalStructuralDemandCaptureSnapshot = {
        elapsedMs,
        envelopeMs: envelope.liveBudgetMs,
        stageIndex: snapshot.stageIndex,
        currentCapacity: snapshot.currentCapacity,
        maximumCapacity: snapshot.maximumCapacity,
        incumbentFilterCount: snapshot.incumbent.filters.length,
        frontierGeneratedFilterCountMax: snapshot.frontierUtilization.generatedCandidateFilterCountMax,
        capacityPressure: cloneCapacityPressure(snapshot.capacityPressure),
      }
      const reasons = naturalStructuralDemandCaptureReasons(captureInput, capturedReasons)
      reasons.forEach((reason) => capturedReasons.add(reason))
      const entry = trajectoryEntry(snapshot, elapsedMs)
      trajectory.push(entry)
      trajectoryByStage.set(snapshot.stageIndex, entry)
      if (reasons.length > 0) liveSnapshots.push({ reasons, snapshot, elapsedMs })
    },
    onStage: (stage) => {
      const entry = trajectoryByStage.get(stage.stageIndex)
      if (entry !== undefined) entry.schedulerAction = stage.action
    },
  })

  const captures = liveSnapshots.map(({ reasons, snapshot, elapsedMs }) => {
    const factorized = evaluateFactorizedSchedulerDecision(
      oracleSnapshot(snapshot),
      {
        structuralSearchInvocations: envelope.invocationsPerArm,
        stageQuantumMs: envelope.armQuantumMs,
      },
      { nowMs, run: oracleRun },
    )
    const control = factorized.byAction.control
    const arms = factorized.arms.map((arm) => serializeArm(arm, control, snapshot.currentCapacity)) as [
      NaturalStructuralDemandArmRecord,
      NaturalStructuralDemandArmRecord,
      NaturalStructuralDemandArmRecord,
    ]
    return {
      snapshotOrigin: 'natural' as const,
      captureReasons: [...reasons],
      elapsedMs,
      snapshot: oracleSnapshot(snapshot),
      arms,
      causalLabel: classifyNaturalStructuralDemand({
        controlFinalQuality: control.finalQuality,
        effortOnlyFinalQuality: factorized.byAction['effort-only'].finalQuality,
        capacityOnlyFinalQuality: factorized.byAction['capacity-only'].finalQuality,
        capacityOnlySlotUse: arms[2]!.slotUseClassification,
      }),
    }
  })

  return {
    type: 'natural-structural-demand',
    caseId,
    envelope: { ...envelope },
    protocol: {
      stageQuantumMs: envelope.stageQuantumMs,
      armQuantumMs: envelope.armQuantumMs,
      invocationsPerArm: envelope.invocationsPerArm,
      lateBudgetFraction: NATURAL_STRUCTURAL_DEMAND_LATE_BUDGET_FRACTION,
    },
    trajectory,
    captures,
  }
}

/** Run the two-envelope natural trajectory and factorized-oracle protocol. */
export function runNaturalStructuralDemandProbe(
  options: NaturalStructuralDemandProbeOptions = {},
): NaturalStructuralDemandRunRecord[] {
  const nowMs = options.nowMs ?? (() => performance.now())
  const liveRun = options.liveRun ?? runScalableStructuralSearch
  const oracleRun = options.run ?? runStructuralSearch
  return resolveCaseIds(options.caseIds).flatMap((caseId) =>
    NATURAL_STRUCTURAL_DEMAND_ENVELOPES.map((envelope) =>
      runEnvelope(caseId, envelope, nowMs, liveRun, oracleRun),
    ),
  )
}

export function main(): void {
  for (const record of runNaturalStructuralDemandProbe()) {
    process.stdout.write(`${JSON.stringify(record)}\n`)
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  try {
    main()
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
