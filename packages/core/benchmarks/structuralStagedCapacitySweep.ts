import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type Filter,
} from '../src/index.js'
import { prepareResearchDesired } from './research/corpus.js'

const CASE_IDS = ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio'] as const
const STAGES = [10, 15, 20] as const
const TOTAL_DEADLINE_MS = 15_000

function evaluate(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
) {
  const responseDb = cascadeMagnitudeDb(
    filters,
    frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  return {
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
  }
}

const rows = []

for (const caseId of CASE_IDS) {
  const prepared = prepareResearchDesired(caseId)
  const startedAt = performance.now()
  const deadlineAt = startedAt + TOTAL_DEADLINE_MS
  const deadline = { isExpired: () => performance.now() >= deadlineAt }

  let seedFilters: Filter[] = []
  let incumbentFilters: Filter[] = []
  let incumbentMetrics = {
    rmseDb: Number.POSITIVE_INFINITY,
    maxAbsDb: Number.POSITIVE_INFINITY,
    violation: Number.POSITIVE_INFINITY,
  }

  const stages = []

  for (const maxFilters of STAGES) {
    if (deadline.isExpired()) {
      stages.push({
        maxFilters,
        skipped: true,
        reason: 'deadline-before-stage',
      })
      continue
    }

    const stageStartedAt = performance.now()
    const result = runStructuralSearch({
      desiredDb: prepared.desiredDb,
      frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config: {
        ...resolveStructuralSearchConfig({
          preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
          timeLimitSeconds: 15,
        }),
        maxFilters,
      },
      deadline,
      seedFilters,
    })
    const stageElapsedMs = performance.now() - stageStartedAt
    const candidateMetrics = evaluate(
      result.filters,
      prepared.desiredDb,
      prepared.frequenciesHz,
    )
    const improved = candidateMetrics.violation < incumbentMetrics.violation

    if (improved) {
      incumbentFilters = result.filters.map((filter) => ({ ...filter }))
      incumbentMetrics = candidateMetrics
    }

    seedFilters = incumbentFilters.map((filter) => ({ ...filter }))

    stages.push({
      maxFilters,
      skipped: false,
      stageElapsedMs,
      totalElapsedMs: performance.now() - startedAt,
      deadlineExpiredAfterStage: deadline.isExpired(),
      candidateFilterCount: result.filters.length,
      candidateViolation: candidateMetrics.violation,
      improvedIncumbent: improved,
      incumbentFilterCount: incumbentFilters.length,
      incumbentViolation: incumbentMetrics.violation,
    })
  }

  rows.push({
    caseId,
    totalElapsedMs: performance.now() - startedAt,
    deadlineExpired: deadline.isExpired(),
    finalFilterCount: incumbentFilters.length,
    finalViolation: incumbentMetrics.violation,
    stages,
  })
}

console.log(JSON.stringify({
  totalBudgetSeconds: TOTAL_DEADLINE_MS / 1000,
  stages: STAGES,
  rows,
}, null, 2))
