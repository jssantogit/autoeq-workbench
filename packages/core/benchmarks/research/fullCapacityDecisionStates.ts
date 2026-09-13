import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  evaluateConfiguredContinuation,
  evaluateSchedulerDecisionPair,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  structuralViolation,
  type ScalableSearchStage,
  type SchedulerDecisionSnapshot,
} from '../../src/index.js'
import { DECISION_ORACLE_CASE_IDS, classifyDecisionOracleOutcome } from './decisionOracle.js'
import { prepareManualRegressionDesired } from './manualRegression.js'

const MAXIMUM_CAPACITY = 17
const LIVE_BUDGET_MS = 1_000
const STAGE_QUANTUM_MS = 250
const DECISION_QUANTUM_MS = 250

function cloneStage(stage: ScalableSearchStage): ScalableSearchStage {
  return {
    ...stage,
    incumbent: stage.incumbent === undefined ? undefined : {
      filters: stage.incumbent.filters.map((filter) => ({ ...filter })),
      rmseDb: stage.incumbent.rmseDb,
      maxAbsDb: stage.incumbent.maxAbsDb,
    },
    capacityPressure: stage.capacityPressure === undefined ? undefined : { ...stage.capacityPressure },
    cumulativeCapacityPressure: stage.cumulativeCapacityPressure === undefined
      ? undefined : { ...stage.cumulativeCapacityPressure },
  }
}

function pressure(stage: ScalableSearchStage): boolean {
  const value = stage.capacityPressure
  return value !== undefined && (
    value.additiveMutationGatesBlockedByCapacity > 0 ||
    value.rescueAddGatesBlockedByCapacity > 0 ||
    value.pairAddGatesBlockedByCapacity > 0
  )
}

export function runFullCapacityDecisionStateProbe(): unknown[] {
  const records: unknown[] = []
  for (const caseId of DECISION_ORACLE_CASE_IDS) {
    const prepared = prepareManualRegressionDesired(caseId)
    const stages: ScalableSearchStage[] = []
    const startedAt = performance.now()
    const deadlineAt = startedAt + LIVE_BUDGET_MS
    runScalableStructuralSearch({
      desiredDb: prepared.desiredDb,
      frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      maxFilters: MAXIMUM_CAPACITY,
      baseConfig: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 5 }),
      deadline: { isExpired: () => performance.now() >= deadlineAt },
      stageQuantumMs: STAGE_QUANTUM_MS,
      nowMs: () => performance.now(),
      onStage: (stage) => stages.push(cloneStage(stage)),
    })
    const natural = stages.find((stage) =>
      stage.filterCount === stage.capacity || pressure(stage),
    )
    const source = natural ?? stages.at(-1)
    if (source?.incumbent === undefined || source.filterCount === undefined) {
      records.push({ type: 'full-capacity-decision-state', caseId, availability: 'unavailable', stages })
      continue
    }
    const reconstructed = natural === undefined
    const currentCapacity = reconstructed ? source.filterCount : source.capacity
    const snapshot: SchedulerDecisionSnapshot = {
      desiredDb: [...prepared.desiredDb], frequencies: [...prepared.frequenciesHz],
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      baseConfig: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 5 }),
      incumbent: source.incumbent,
      currentCapacity,
      maximumCapacity: MAXIMUM_CAPACITY,
      effortLevel: source.effortLevel,
      recentGain: source.qualityDelta ?? 0,
      workSinceMeaningfulImprovement: source.workSinceMeaningfulImprovement,
      expansionOpportunity: source.expansionOpportunity,
      capacityPressure: source.capacityPressure,
      cumulativeWork: source.cumulativeWork,
      remainingWallClockMs: DECISION_QUANTUM_MS,
      stageIndex: source.stageIndex,
    }
    const budget = { structuralSearchInvocations: 1, stageQuantumMs: DECISION_QUANTUM_MS }
    const pair = evaluateSchedulerDecisionPair(snapshot, budget)
    const control = evaluateConfiguredContinuation(snapshot, { capacity: currentCapacity, effortLevel: source.effortLevel }, budget)
    const effortOnly = evaluateConfiguredContinuation(snapshot, { capacity: currentCapacity, effortLevel: Math.min(6, source.effortLevel + 1) }, budget)
    const capacityOnly = evaluateConfiguredContinuation(snapshot, { capacity: Math.min(MAXIMUM_CAPACITY, Math.max(currentCapacity + 1, Math.ceil(currentCapacity * 1.5))), effortLevel: source.effortLevel }, budget)
    records.push({
      type: 'full-capacity-decision-state', caseId,
      snapshotOrigin: reconstructed ? 'reconstructed-from-live-incumbent' : 'naturally-full-or-pressured',
      liveStages: stages.map((stage) => ({
        stageIndex: stage.stageIndex, capacity: stage.capacity, filterCount: stage.filterCount,
        utilization: stage.filterCount === undefined ? null : stage.filterCount / stage.capacity,
        action: stage.action, recentGain: stage.qualityDelta, capacityPressure: stage.capacityPressure, frontierUtilization: stage.frontierUtilization,
      })),
      snapshot: { currentCapacity, filterCount: source.filterCount, headroom: currentCapacity - source.filterCount,
        utilization: source.filterCount / currentCapacity, recentGain: source.qualityDelta,
        residual: source.expansionOpportunity, pressure: source.capacityPressure, frontierUtilization: source.frontierUtilization },
      outcome: classifyDecisionOracleOutcome(pair.byAction['deepen-current-regime'].absoluteGain, pair.byAction['expand-capacity'].absoluteGain),
      deepenGain: pair.byAction['deepen-current-regime'].absoluteGain,
      expandGain: pair.byAction['expand-capacity'].absoluteGain,
      factorized: { control, effortOnly, capacityOnly, capacityOnlyUsedNewSlot: capacityOnly.frontierUtilization.generatedCandidateFilterCountMax > currentCapacity },
      workComparison: pair.workComparison, deepenFrontier: pair.byAction['deepen-current-regime'].frontierUtilization, expandFrontier: pair.byAction['expand-capacity'].frontierUtilization,
      startingViolation: structuralViolation(source.incumbent),
    })
  }
  return records
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const record of runFullCapacityDecisionStateProbe()) process.stdout.write(`${JSON.stringify(record)}\n`)
}
