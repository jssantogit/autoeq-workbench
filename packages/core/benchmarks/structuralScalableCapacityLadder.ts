import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  SCALABLE_BASE_CAPACITY,
  SCALABLE_CAPACITY_GROWTH,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  structuralViolation,
} from '../src/index.js'
import type { ScalableSearchStage } from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
} from './research/manualRegression.js'

const TOTAL_BUDGET_SECONDS = 60
const FINAL_CAPS = [10, 15, 20] as const

function runScalable(
  caseId: ReturnType<typeof loadManualRegressionCases>[number]['id'],
  finalMaxFilters: number,
) {
  const prepared = prepareManualRegressionDesired(caseId)
  const startedAt = performance.now()
  const deadlineAt = startedAt + TOTAL_BUDGET_SECONDS * 1_000
  const deadline = { isExpired: () => performance.now() >= deadlineAt }

  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: TOTAL_BUDGET_SECONDS,
  })
  const stages: Array<ScalableSearchStage & {
    stageElapsedMs: number
    totalElapsedMs: number
  }> = []
  let previousElapsedMs = 0

  const result = runScalableStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    maxFilters: finalMaxFilters,
    baseConfig,
    deadline,
    onStage: (stage) => {
      const totalElapsedMs = performance.now() - startedAt
      stages.push({
        ...stage,
        stageElapsedMs: totalElapsedMs - previousElapsedMs,
        totalElapsedMs,
      })
      previousElapsedMs = totalElapsedMs
    },
  })

  return {
    finalMaxFilters,
    elapsedMs: performance.now() - startedAt,
    deadlineExpired: deadline.isExpired(),
    finalFilterCount: result.filters.length,
    finalRmseDb: result.rmseDb,
    finalMaxAbsDb: result.maxAbsDb,
    finalViolation: structuralViolation(result),
    stages,
  }
}

const rows = []

for (const regressionCase of loadManualRegressionCases()) {
  const cells = FINAL_CAPS.map((finalMaxFilters) =>
    runScalable(regressionCase.id, finalMaxFilters)
  )
  rows.push({
    caseId: regressionCase.id,
    cells,
    monotonic: cells.every(
      (cell, index) => index === 0 ||
        cell.finalViolation <= cells[index - 1]!.finalViolation + 1e-9,
    ),
  })
}

console.log(JSON.stringify({
  totalBudgetSeconds: TOTAL_BUDGET_SECONDS,
  baseCapacity: SCALABLE_BASE_CAPACITY,
  growthFactor: SCALABLE_CAPACITY_GROWTH,
  finalCaps: FINAL_CAPS,
  rows,
  monotonicCases: rows.filter((row) => row.monotonic).length,
}, null, 2))
