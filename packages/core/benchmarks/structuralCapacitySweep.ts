import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../src/index.js'
import { prepareResearchDesired } from './research/corpus.js'

const CASE_IDS = ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio'] as const
const CAPACITIES = [10, 15, 20, 30, 64] as const
const DEADLINE_MS = 15_000

const rows = []

for (const caseId of CASE_IDS) {
  const prepared = prepareResearchDesired(caseId)

  for (const maxFilters of CAPACITIES) {
    const config = {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds: 15,
      }),
      maxFilters,
    }

    const startedAt = performance.now()
    const deadlineAt = startedAt + DEADLINE_MS
    const result = runStructuralSearch({
      desiredDb: prepared.desiredDb,
      frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config,
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
    const signature = createHash('sha256')
      .update(JSON.stringify({
        filters: result.filters,
        rmseDb: metrics.rmseDb,
        maxAbsDb: metrics.maxAbsDb,
      }))
      .digest('hex')

    rows.push({
      caseId,
      maxFilters,
      deliveredFilterCount: result.filters.length,
      elapsedMs,
      deadlineExpired: performance.now() >= deadlineAt,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      violation,
      signature,
    })
  }
}

const annotated = rows.map((row) => {
  const baseline = rows.find(
    (candidate) => candidate.caseId === row.caseId && candidate.maxFilters === 10,
  )!
  return {
    ...row,
    violationDeltaVs10: row.violation - baseline.violation,
    violationPercentVs10:
      baseline.violation === 0 ? null : ((row.violation / baseline.violation) - 1) * 100,
    elapsedDeltaMsVs10: row.elapsedMs - baseline.elapsedMs,
  }
})

console.log(JSON.stringify({
  budgetSeconds: DEADLINE_MS / 1000,
  capacities: CAPACITIES,
  caseCount: CASE_IDS.length,
  rows: annotated,
}, null, 2))
