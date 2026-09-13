import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
} from './research/manualRegression.js'

const MAX_FILTERS = 10
const BUDGET_MS = 60_000

const rows = []

for (const regressionCase of loadManualRegressionCases()) {
  const prepared = prepareManualRegressionDesired(regressionCase.id)
  const startedAt = performance.now()
  const deadlineAt = startedAt + BUDGET_MS

  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config: {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds: 60,
      }),
      maxFilters: MAX_FILTERS,
    },
    deadline: { isExpired: () => performance.now() >= deadlineAt },
    seedFilters: [],
  })
  const elapsedMs = performance.now() - startedAt

  const responseDb = cascadeMagnitudeDb(
    result.filters,
    prepared.frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = prepared.desiredDb.map(
    (desired, index) => desired - responseDb[index]!,
  )
  const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)
  const violation = Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75)
  const unresolved = violation > 1
  const unusedSlots = MAX_FILTERS - result.filters.length

  rows.push({
    caseId: regressionCase.id,
    elapsedMs,
    budgetSeconds: BUDGET_MS / 1000,
    budgetUtilization: elapsedMs / BUDGET_MS,
    filterCount: result.filters.length,
    unusedSlots,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    violation,
    targetAchieved: !unresolved,
    deadlineExpired: performance.now() >= deadlineAt,
    diagnostics: {
      prematureStagnationCandidate: unresolved && elapsedMs < BUDGET_MS / 2,
      unusedCapacityWhileUnresolved: unresolved && unusedSlots > 0,
    },
  })
}

console.log(JSON.stringify({
  caseCount: rows.length,
  configuration: {
    maxFilters: MAX_FILTERS,
    budgetSeconds: BUDGET_MS / 1000,
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  },
  prematureStagnationCases: rows.filter(
    (row) => row.diagnostics.prematureStagnationCandidate,
  ).length,
  unusedCapacityWhileUnresolvedCases: rows.filter(
    (row) => row.diagnostics.unusedCapacityWhileUnresolved,
  ).length,
  rows,
}, null, 2))
