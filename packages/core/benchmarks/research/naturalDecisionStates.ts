import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
} from '../../src/index.js'
import {
  evaluateFactorizedSchedulerDecision,
  type SchedulerDecisionSnapshot,
} from '../../src/autoeq/v2/decisionOracle.js'
import {
  runScalableStructuralSearch,
  type ScalableSearchDecisionSnapshot,
} from '../../src/autoeq/v2/scalableStructuralSearch.js'
import {
  DECISION_ORACLE_CASE_IDS,
  naturalDecisionCaptureReasons,
} from './decisionOracle.js'
import { prepareManualRegressionDesired } from './manualRegression.js'

/** Predeclared sparse protocol: 17 ceiling, 1 s live trajectory, 250 ms arms. */
const MAXIMUM_CAPACITY = 17
const LIVE_BUDGET_MS = 1_000
const STAGE_QUANTUM_MS = 250
const DECISION_QUANTUM_MS = 250

function oracleSnapshot(value: ScalableSearchDecisionSnapshot): SchedulerDecisionSnapshot {
  return {
    desiredDb: [...value.desiredDb], frequencies: [...value.frequencies],
    sampleRateHz: value.sampleRateHz, baseConfig: { ...value.baseConfig },
    resolvedConfig: { ...value.resolvedConfig },
    incumbent: { filters: value.incumbent.filters.map((filter) => ({ ...filter })), rmseDb: value.incumbent.rmseDb, maxAbsDb: value.incumbent.maxAbsDb },
    currentCapacity: value.currentCapacity, maximumCapacity: value.maximumCapacity,
    effortLevel: value.effortLevel, recentGains: [...value.recentGains],
    recentGain: value.recentGain, workSinceMeaningfulImprovement: { ...value.workSinceMeaningfulImprovement },
    expansionOpportunity: { ...value.expansionOpportunity }, residualTelemetry: { ...value.expansionOpportunity },
    capacityPressure: { ...value.capacityPressure }, frontierUtilization: { ...value.frontierUtilization },
    incumbentUtilization: value.incumbentUtilization, cumulativeWork: { ...value.cumulativeWork },
    remainingWallClockMs: value.remainingWallClockMs, stageIndex: value.stageIndex,
  }
}

/** Captures outcome-blind live scheduler states then evaluates the three causal arms. */
export function runNaturalDecisionStateProbe(): unknown[] {
  const records: unknown[] = []
  for (const caseId of DECISION_ORACLE_CASE_IDS) {
    const prepared = prepareManualRegressionDesired(caseId)
    const captured = new Set<string>()
    const states: Array<{ reasons: string[]; snapshot: ScalableSearchDecisionSnapshot }> = []
    const deadlineAt = performance.now() + LIVE_BUDGET_MS
    runScalableStructuralSearch({
      desiredDb: prepared.desiredDb, frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz, maxFilters: MAXIMUM_CAPACITY,
      baseConfig: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 5 }),
      deadline: { isExpired: () => performance.now() >= deadlineAt },
      stageQuantumMs: STAGE_QUANTUM_MS, nowMs: () => performance.now(),
      remainingWallClockMs: () => Math.max(0, deadlineAt - performance.now()),
      onDecision: (snapshot) => {
        const reasons = naturalDecisionCaptureReasons(snapshot, captured)
        if (reasons.length === 0) return
        reasons.forEach((reason) => captured.add(reason))
        states.push({ reasons, snapshot })
      },
    })
    for (const state of states) {
      const snapshot = oracleSnapshot(state.snapshot)
      const factorized = evaluateFactorizedSchedulerDecision(snapshot, {
        structuralSearchInvocations: 1, stageQuantumMs: DECISION_QUANTUM_MS,
      })
      records.push({
        type: 'natural-decision-state-factorized', caseId, captureReasons: state.reasons,
        protocol: { maximumCapacity: MAXIMUM_CAPACITY, liveBudgetMs: LIVE_BUDGET_MS, stageQuantumMs: STAGE_QUANTUM_MS, decisionQuantumMs: DECISION_QUANTUM_MS, invocationsPerArm: 1 },
        snapshot,
        arms: factorized.arms.map((arm) => ({ action: arm.action, resolvedConfig: arm.resolvedConfig, finalQuality: arm.finalQuality, absoluteGain: arm.absoluteGain, relativeGain: arm.relativeGain ?? null, rawWork: arm.workDelta, frontierUtilization: arm.frontierUtilization, additionalStructuralSlotsUsed: arm.additionalStructuralSlotsUsed })),
        workComparison: factorized.workComparison,
      })
    }
  }
  return records
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const record of runNaturalDecisionStateProbe()) process.stdout.write(`${JSON.stringify(record)}\n`)
}
