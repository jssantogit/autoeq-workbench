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
  runStructuralSearch,
} from '../src/index.js'
import { V2_BENCHMARK_CASES } from './v2Cases.js'

const frequencies = createEvaluationGrid()
const REPEATS = 5
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

for (const benchmarkCase of V2_BENCHMARK_CASES) {
  const source = prepareCurve(benchmarkCase.source, benchmarkCase.normalization, frequencies)
  const target = prepareCurve(benchmarkCase.target, benchmarkCase.normalization, frequencies)
  const desiredDb = desiredCorrection(source.db, target.db)

  const runs = []
  for (let repeatIndex = 0; repeatIndex < REPEATS; repeatIndex += 1) {
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

    runs.push({
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

  const signatures = [...new Set(runs.map((run) => run.signature))]
  const representative = [...runs].sort(
    (a, b) => a.violation - b.violation || a.elapsedMs - b.elapsedMs,
  )[0]!

  rows.push({
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    maxFilters: benchmarkCase.settings.maxFilters,
    exactRepeatability: signatures.length === 1,
    uniqueSignatureCount: signatures.length,
    deadlineCount: runs.filter((run) => run.expired).length,
    rmseDbMedian: median(runs.map((run) => run.rmseDb)),
    maxAbsDbMedian: median(runs.map((run) => run.maxAbsDb)),
    violationMedian: median(runs.map((run) => run.violation)),
    elapsedMsMedian: median(runs.map((run) => run.elapsedMs)),
    filterCounts: [...new Set(runs.map((run) => run.filterCount))].sort((a, b) => a - b),
    representativeFilters: representative.filters,
    runs,
  })
}

const report = {
  candidateCommit: process.env.GITHUB_SHA ?? 'local',
  caseCount: rows.length,
  exactRepeatabilityCases: rows.filter((row) => row.exactRepeatability).length,
  deadlineFreeCases: rows.filter((row) => row.deadlineCount === 0).length,
  rows,
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'zero-rescue-corpus-audit')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
