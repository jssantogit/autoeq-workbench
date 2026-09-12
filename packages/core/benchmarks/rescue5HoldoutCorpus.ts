import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  prepareCurve,
  resolveStructuralSearchConfig,
  runStandardAutoEqV2,
  runStructuralSearch,
} from '../src/index.js'
import { V2_HOLDOUT_CASES } from './v2HoldoutCases.js'

const frequencies = createEvaluationGrid()
const CANDIDATE_REPEATS = 5
const SAFETY_FUSE_MS = 15_000

function signature(filters: readonly unknown[], rmseDb: number, maxAbsDb: number): string {
  return createHash('sha256')
    .update(JSON.stringify({ filters, rmseDb, maxAbsDb }))
    .digest('hex')
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

const rows = []

for (const benchmarkCase of V2_HOLDOUT_CASES) {
  const v2Started = performance.now()
  const v2 = runStandardAutoEqV2(benchmarkCase)
  const v2ElapsedMs = performance.now() - v2Started

  const preparedSource = prepareCurve(
    benchmarkCase.source,
    benchmarkCase.normalization,
    frequencies,
  )
  const preparedTarget = prepareCurve(
    benchmarkCase.target,
    benchmarkCase.normalization,
    frequencies,
  )
  const desiredDb = desiredCorrection(preparedSource.db, preparedTarget.db)

  const candidateRuns = []
  for (let repeatIndex = 0; repeatIndex < CANDIDATE_REPEATS; repeatIndex += 1) {
    const config = {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      }),
      maxFilters: benchmarkCase.settings.maxFilters,
    }

    const startedAt = performance.now()
    const deadlineAt = startedAt + SAFETY_FUSE_MS
    const result = runStructuralSearch({
      desiredDb,
      frequencies,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config,
      deadline: { isExpired: () => performance.now() >= deadlineAt },
    })
    const elapsedMs = performance.now() - startedAt

    const responseDb = cascadeMagnitudeDb(
      result.filters,
      frequencies,
      MVP_NUMERIC_POLICY.sampleRateHz,
    )
    const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
    const metrics = calculateErrorMetrics(residualDb, frequencies)

    candidateRuns.push({
      repeatIndex,
      elapsedMs,
      expired: performance.now() >= deadlineAt,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
      filterCount: result.filters.length,
      filters: result.filters.map((filter) => ({ ...filter })),
      signature: signature(result.filters, metrics.rmseDb, metrics.maxAbsDb),
    })
  }

  const candidateRmse = candidateRuns.map((run) => run.rmseDb)
  const candidateMaxAbs = candidateRuns.map((run) => run.maxAbsDb)
  const candidateViolation = candidateRuns.map((run) => run.violation)
  const candidateElapsed = candidateRuns.map((run) => run.elapsedMs)
  const candidateSignatures = [...new Set(candidateRuns.map((run) => run.signature))]
  const representative = [...candidateRuns].sort(
    (a, b) => a.violation - b.violation || a.elapsedMs - b.elapsedMs,
  )[0]!

  rows.push({
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    maxFilters: benchmarkCase.settings.maxFilters,
    v2: {
      elapsedMs: v2ElapsedMs,
      terminationReason: v2.manifest.terminationReason,
      targetAchieved: v2.manifest.targetAchieved,
      rmseDb: v2.metrics.rmseDb,
      maxAbsDb: v2.metrics.maxAbsDb,
      violation: Math.max(v2.metrics.rmseDb / 0.25, v2.metrics.maxAbsDb / 0.75),
      filterCount: v2.filters.length,
      filters: v2.filters.map((filter) => ({ ...filter })),
    },
    candidate: {
      repeats: CANDIDATE_REPEATS,
      uniqueSignatureCount: candidateSignatures.length,
      exactRepeatability: candidateSignatures.length === 1,
      deadlineCount: candidateRuns.filter((run) => run.expired).length,
      rmseDbMedian: median(candidateRmse),
      maxAbsDbMedian: median(candidateMaxAbs),
      violationMedian: median(candidateViolation),
      elapsedMsMedian: median(candidateElapsed),
      filterCounts: [...new Set(candidateRuns.map((run) => run.filterCount))].sort((a, b) => a - b),
      representativeFilters: representative.filters,
      runs: candidateRuns,
    },
  })
}

const summary = {
  caseCount: rows.length,
  candidateExactRepeatabilityCases: rows.filter((row) => row.candidate.exactRepeatability).length,
  candidateDeadlineFreeCases: rows.filter((row) => row.candidate.deadlineCount === 0).length,
  candidateBetterViolationCases: rows.filter((row) => row.candidate.violationMedian < row.v2.violation).length,
  candidateWorseViolationCases: rows.filter((row) => row.candidate.violationMedian > row.v2.violation).length,
  candidateEqualViolationCases: rows.filter((row) => row.candidate.violationMedian === row.v2.violation).length,
  rows: rows.map((row) => ({
    caseId: row.caseId,
    category: row.category,
    maxFilters: row.maxFilters,
    v2Violation: row.v2.violation,
    candidateViolation: row.candidate.violationMedian,
    violationDelta: row.candidate.violationMedian - row.v2.violation,
    v2RmseDb: row.v2.rmseDb,
    candidateRmseDb: row.candidate.rmseDbMedian,
    v2MaxAbsDb: row.v2.maxAbsDb,
    candidateMaxAbsDb: row.candidate.maxAbsDbMedian,
    v2ElapsedMs: row.v2.elapsedMs,
    candidateElapsedMs: row.candidate.elapsedMsMedian,
    candidateExactRepeatability: row.candidate.exactRepeatability,
    candidateDeadlineCount: row.candidate.deadlineCount,
  })),
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'rescue5-holdout-corpus')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify({ summary, rows }, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
