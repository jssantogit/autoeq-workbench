import { readFileSync } from 'node:fs'
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
  type ManualRegressionCaseId,
} from './research/manualRegression.js'

const MAX_FILTERS = 10
const BUDGET_MS = 60_000
const VIOLATION_REGRESSION_TOLERANCE = 0.01

type BaselineCase = {
  rmseDb: number
  maxAbsDb: number
  violation: number
  filterCount: number
}

type ManualRegressionBaseline = {
  schemaVersion: 1
  implementationCommit: string
  configuration: {
    maxFilters: number
    budgetSeconds: number
    preset: string
  }
  cases: Record<ManualRegressionCaseId, BaselineCase>
}

const baseline = JSON.parse(
  readFileSync(
    new URL('./research/manual-regression-baseline.json', import.meta.url),
    'utf8',
  ),
) as ManualRegressionBaseline

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
  const baselineCase = baseline.cases[regressionCase.id]
  const violationDeltaVsBaseline = violation - baselineCase.violation

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
    baseline: baselineCase,
    deltasVsBaseline: {
      rmseDb: metrics.rmseDb - baselineCase.rmseDb,
      maxAbsDb: metrics.maxAbsDb - baselineCase.maxAbsDb,
      violation: violationDeltaVsBaseline,
      filterCount: result.filters.length - baselineCase.filterCount,
    },
    diagnostics: {
      prematureStagnationCandidate: unresolved && elapsedMs < BUDGET_MS / 2,
      unusedCapacityWhileUnresolved: unresolved && unusedSlots > 0,
      qualityRegression:
        violationDeltaVsBaseline > VIOLATION_REGRESSION_TOLERANCE,
    },
  })
}

const qualityRegressions = rows.filter(
  (row) => row.diagnostics.qualityRegression,
)

console.log(JSON.stringify({
  caseCount: rows.length,
  baselineImplementationCommit: baseline.implementationCommit,
  configuration: {
    maxFilters: MAX_FILTERS,
    budgetSeconds: BUDGET_MS / 1000,
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  },
  qualityRegressionTolerance: VIOLATION_REGRESSION_TOLERANCE,
  qualityRegressionCases: qualityRegressions.length,
  prematureStagnationCases: rows.filter(
    (row) => row.diagnostics.prematureStagnationCandidate,
  ).length,
  unusedCapacityWhileUnresolvedCases: rows.filter(
    (row) => row.diagnostics.unusedCapacityWhileUnresolved,
  ).length,
  rows,
}, null, 2))

if (qualityRegressions.length > 0) {
  throw new Error(
    `Manual real-FR quality regression in: ${qualityRegressions
      .map((row) => row.caseId)
      .join(', ')}`,
  )
}
