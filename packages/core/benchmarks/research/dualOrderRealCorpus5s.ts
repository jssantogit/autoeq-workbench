import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../../src/index.js'
import { prepareResearchDesired } from './corpus.js'

const CASE_IDS = ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio'] as const
const REPEATS = 5
const DEADLINE_MS = 5_000
const MAX_FILTERS = 10

type CaseId = (typeof CASE_IDS)[number]

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function signature(filters: readonly unknown[], rmseDb: number, maxAbsDb: number): string {
  return createHash('sha256')
    .update(JSON.stringify({ filters, rmseDb, maxAbsDb }))
    .digest('hex')
}

const baselinePath = new URL('./baseline-standard-v2.json', import.meta.url)
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
  aggregates: Array<{
    caseId: string
    budgetSeconds: number
    maxFilters: number
    rmseDb: { median: number }
    maxAbsDb: { median: number }
    elapsedMs: { median: number }
  }>
}

const rows = []

for (const caseId of CASE_IDS) {
  const prepared = prepareResearchDesired(caseId)
  const runs = []

  for (let repeatIndex = 0; repeatIndex < REPEATS; repeatIndex += 1) {
    const config = {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      }),
      maxFilters: MAX_FILTERS,
    }
    const startedAt = performance.now()
    const deadlineAt = startedAt + DEADLINE_MS
    const result = runStructuralSearch({
      desiredDb: prepared.desiredDb,
      frequencies: prepared.frequenciesHz,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config,
      deadline: { isExpired: () => performance.now() >= deadlineAt },
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

    runs.push({
      repeatIndex,
      elapsedMs,
      expired: performance.now() >= deadlineAt,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
      filterCount: result.filters.length,
      signature: signature(result.filters, metrics.rmseDb, metrics.maxAbsDb),
      filters: result.filters.map((filter) => ({ ...filter })),
    })
  }

  const baselineRow = baseline.aggregates.find(
    (row) =>
      row.caseId === caseId &&
      row.budgetSeconds === 5 &&
      row.maxFilters === MAX_FILTERS,
  )
  if (baselineRow === undefined) {
    throw new Error(`Missing 5s/10-filter baseline for ${caseId}`)
  }

  const candidateRmse = median(runs.map((run) => run.rmseDb))
  const candidateMaxAbs = median(runs.map((run) => run.maxAbsDb))
  const candidateViolation = median(runs.map((run) => run.violation))
  const baselineViolation = Math.max(
    baselineRow.rmseDb.median / 0.25,
    baselineRow.maxAbsDb.median / 0.75,
  )
  const signatures = [...new Set(runs.map((run) => run.signature))]

  rows.push({
    caseId,
    candidate: {
      rmseDbMedian: candidateRmse,
      maxAbsDbMedian: candidateMaxAbs,
      violationMedian: candidateViolation,
      elapsedMsMedian: median(runs.map((run) => run.elapsedMs)),
      filterCounts: [...new Set(runs.map((run) => run.filterCount))],
      exactRepeatability: signatures.length === 1,
      deadlineCount: runs.filter((run) => run.expired).length,
      signatures,
    },
    standardV2Baseline5s: {
      rmseDbMedian: baselineRow.rmseDb.median,
      maxAbsDbMedian: baselineRow.maxAbsDb.median,
      violationMedian: baselineViolation,
      elapsedMsMedian: baselineRow.elapsedMs.median,
    },
    violationDelta: candidateViolation - baselineViolation,
    candidateBetter: candidateViolation < baselineViolation,
  })
}

const summary = {
  caseCount: rows.length,
  exactRepeatabilityCases: rows.filter((row) => row.candidate.exactRepeatability).length,
  deadlineFreeCases: rows.filter((row) => row.candidate.deadlineCount === 0).length,
  candidateBetterCases: rows.filter((row) => row.candidateBetter).length,
  candidateWorseCases: rows.filter((row) => !row.candidateBetter).length,
  rows,
}

console.log(JSON.stringify(summary, null, 2))
