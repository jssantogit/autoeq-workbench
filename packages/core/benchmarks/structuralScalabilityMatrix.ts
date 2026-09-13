import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
} from './research/manualRegression.js'

const timeBudgetsSeconds = [5, 15, 60] as const
const capacityCaps = [10, 15, 20] as const

function runCell(
  caseId: ReturnType<typeof loadManualRegressionCases>[number]['id'],
  maxFilters: number,
  budgetSeconds: number,
) {
  const prepared = prepareManualRegressionDesired(caseId)
  const startedAt = performance.now()
  const deadlineAt = startedAt + budgetSeconds * 1_000
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config: {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds: budgetSeconds,
      }),
      maxFilters,
    },
    deadline: { isExpired: () => performance.now() >= deadlineAt },
    seedFilters: [],
  })
  const elapsedMs = performance.now() - startedAt
  return {
    maxFilters,
    budgetSeconds,
    elapsedMs,
    deadlineExpired: performance.now() >= deadlineAt,
    filterCount: result.filters.length,
    rmseDb: result.rmseDb,
    maxAbsDb: result.maxAbsDb,
    violation: Math.max(result.rmseDb / 0.25, result.maxAbsDb / 0.75),
  }
}

const rows = []

for (const regressionCase of loadManualRegressionCases()) {
  const timeSweep = timeBudgetsSeconds.map(
    (budgetSeconds) => runCell(regressionCase.id, 10, budgetSeconds),
  )
  const capacitySweep = capacityCaps.map(
    (maxFilters) => runCell(regressionCase.id, maxFilters, 60),
  )

  const timeMonotonic = timeSweep.every(
    (cell, index) => index === 0 ||
      cell.violation <= timeSweep[index - 1]!.violation + 1e-9,
  )
  const capacityMonotonic = capacitySweep.every(
    (cell, index) => index === 0 ||
      cell.violation <= capacitySweep[index - 1]!.violation + 1e-9,
  )

  rows.push({
    caseId: regressionCase.id,
    timeSweep,
    capacitySweep,
    timeMonotonic,
    capacityMonotonic,
  })
}

console.log(JSON.stringify({
  timeBudgetsSeconds,
  capacityCaps,
  rows,
  summary: {
    timeMonotonicCases: rows.filter((row) => row.timeMonotonic).length,
    capacityMonotonicCases: rows.filter((row) => row.capacityMonotonic).length,
    totalCases: rows.length,
  },
}, null, 2))
