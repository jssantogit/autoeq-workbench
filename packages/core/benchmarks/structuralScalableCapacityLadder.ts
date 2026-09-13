import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type Filter,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
} from './research/manualRegression.js'

const TOTAL_BUDGET_SECONDS = 60
const FINAL_CAPS = [10, 15, 20] as const
const BASE_CAPACITY = 10
const GROWTH_FACTOR = 1.5

function violationOf(result: { rmseDb: number; maxAbsDb: number }): number {
  return Math.max(result.rmseDb / 0.25, result.maxAbsDb / 0.75)
}

function nextCapacity(current: number, maximum: number): number {
  if (current >= maximum) return maximum
  return Math.min(
    maximum,
    Math.max(current + 1, Math.ceil(current * GROWTH_FACTOR)),
  )
}

function runScalable(
  caseId: ReturnType<typeof loadManualRegressionCases>[number]['id'],
  finalMaxFilters: number,
) {
  const prepared = prepareManualRegressionDesired(caseId)
  const startedAt = performance.now()
  const deadlineAt = startedAt + TOTAL_BUDGET_SECONDS * 1_000
  const deadline = { isExpired: () => performance.now() >= deadlineAt }

  let capacity = Math.min(BASE_CAPACITY, finalMaxFilters)
  let incumbentFilters: Filter[] = []
  let incumbent = {
    rmseDb: Number.POSITIVE_INFINITY,
    maxAbsDb: Number.POSITIVE_INFINITY,
  }
  const stages = []

  let firstStage = true
  while (!deadline.isExpired()) {
    const stageStartedAt = performance.now()
    const result = runStructuralSearch({
      desiredDb: prepared.desiredDb,
      frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config: {
        ...resolveStructuralSearchConfig({
          preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
          timeLimitSeconds: TOTAL_BUDGET_SECONDS,
        }),
        maxFilters: capacity,
      },
      deadline,
      seedFilters: firstStage ? [] : incumbentFilters,
    })
    firstStage = false

    const candidateViolation = violationOf(result)
    const incumbentViolation = violationOf(incumbent)
    const improved = candidateViolation < incumbentViolation - 1e-12

    if (improved) {
      incumbentFilters = result.filters.map((filter) => ({ ...filter }))
      incumbent = {
        rmseDb: result.rmseDb,
        maxAbsDb: result.maxAbsDb,
      }
    }

    stages.push({
      capacity,
      stageElapsedMs: performance.now() - stageStartedAt,
      totalElapsedMs: performance.now() - startedAt,
      candidateFilterCount: result.filters.length,
      candidateViolation,
      improved,
      incumbentFilterCount: incumbentFilters.length,
      incumbentViolation: violationOf(incumbent),
    })

    if (capacity >= finalMaxFilters) break
    capacity = nextCapacity(capacity, finalMaxFilters)
  }

  return {
    finalMaxFilters,
    elapsedMs: performance.now() - startedAt,
    deadlineExpired: deadline.isExpired(),
    finalFilterCount: incumbentFilters.length,
    finalRmseDb: incumbent.rmseDb,
    finalMaxAbsDb: incumbent.maxAbsDb,
    finalViolation: violationOf(incumbent),
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
  baseCapacity: BASE_CAPACITY,
  growthFactor: GROWTH_FACTOR,
  finalCaps: FINAL_CAPS,
  rows,
  monotonicCases: rows.filter((row) => row.monotonic).length,
}, null, 2))
