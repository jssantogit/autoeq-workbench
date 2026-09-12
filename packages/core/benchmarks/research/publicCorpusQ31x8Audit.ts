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
  isV2TargetAchieved,
  prepareCurve,
  resolveStructuralSearchConfig,
  runStandardAutoEqV2,
  runStructuralSearch,
} from '../../src/index.js'
import { V2_BENCHMARK_CASES } from '../v2Cases.js'

interface StructuralRun {
  repeatIndex: number
  elapsedMs: number
  deadlineHit: boolean
  rmseDb: number
  maxAbsDb: number
  normalizedViolation: number
  targetAchieved: boolean
  filterCount: number
  signature: string
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function preparedDesired(benchmarkCase: (typeof V2_BENCHMARK_CASES)[number]) {
  const frequencies = createEvaluationGrid()
  const source = prepareCurve(benchmarkCase.source, benchmarkCase.normalization, frequencies)
  const target = prepareCurve(benchmarkCase.target, benchmarkCase.normalization, frequencies)
  return {
    frequencies,
    desiredDb: desiredCorrection(source.db, target.db),
  }
}

function runStructuralCase(
  benchmarkCase: (typeof V2_BENCHMARK_CASES)[number],
  repeatIndex: number,
): StructuralRun {
  const prepared = preparedDesired(benchmarkCase)
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  })
  const config = {
    ...baseConfig,
    maxFilters: benchmarkCase.settings.maxFilters,
  }

  const startedAt = performance.now()
  const deadlineAt = startedAt + 15_000
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequencies,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline: { isExpired: () => performance.now() >= deadlineAt },
  })
  const elapsedMs = performance.now() - startedAt
  const deadlineHit = performance.now() >= deadlineAt

  const responseDb = cascadeMagnitudeDb(
    result.filters,
    prepared.frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = prepared.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, prepared.frequencies)
  const targetAchieved = isV2TargetAchieved(metrics)
  const normalizedViolation = Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75)
  const signature = createHash('sha256')
    .update(JSON.stringify({
      filters: result.filters,
      metrics,
      targetAchieved,
    }))
    .digest('hex')

  return {
    repeatIndex,
    elapsedMs,
    deadlineHit,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    normalizedViolation,
    targetAchieved,
    filterCount: result.filters.length,
    signature,
  }
}

function runV2Case(benchmarkCase: (typeof V2_BENCHMARK_CASES)[number]) {
  const input = {
    ...benchmarkCase,
    settings: {
      ...benchmarkCase.settings,
      timeLimitSeconds: 60 as const,
    },
  }
  const startedAt = performance.now()
  const result = runStandardAutoEqV2(input)
  const elapsedMs = performance.now() - startedAt
  return {
    elapsedMs,
    terminationReason: result.manifest.terminationReason,
    targetAchieved: result.manifest.targetAchieved,
    rmseDb: result.metrics.rmseDb,
    maxAbsDb: result.metrics.maxAbsDb,
    normalizedViolation: Math.max(result.metrics.rmseDb / 0.25, result.metrics.maxAbsDb / 0.75),
    filterCount: result.filters.length,
  }
}

async function main() {
  const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'autoeq-q31-x8-public-corpus')
  mkdirSync(outputDir, { recursive: true })

  const rows = []
  for (const benchmarkCase of V2_BENCHMARK_CASES) {
    const v2 = runV2Case(benchmarkCase)
    const structuralRuns: StructuralRun[] = []
    for (let repeatIndex = 0; repeatIndex < 1; repeatIndex += 1) {
      structuralRuns.push(runStructuralCase(benchmarkCase, repeatIndex))
    }

    const signatures = [...new Set(structuralRuns.map((run) => run.signature))]
    const rmseValues = structuralRuns.map((run) => run.rmseDb)
    const maxAbsValues = structuralRuns.map((run) => run.maxAbsDb)
    const violationValues = structuralRuns.map((run) => run.normalizedViolation)
    const elapsedValues = structuralRuns.map((run) => run.elapsedMs)

    rows.push({
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      maxFilters: benchmarkCase.settings.maxFilters,
      standardV2: v2,
      q31x8: {
        runCount: structuralRuns.length,
        exactRepeatability: signatures.length === 1,
        uniqueSignatureCount: signatures.length,
        deadlineHits: structuralRuns.filter((run) => run.deadlineHit).length,
        targetAchievedCount: structuralRuns.filter((run) => run.targetAchieved).length,
        rmseDbMedian: median(rmseValues),
        rmseDbBest: Math.min(...rmseValues),
        rmseDbWorst: Math.max(...rmseValues),
        maxAbsDbMedian: median(maxAbsValues),
        maxAbsDbBest: Math.min(...maxAbsValues),
        maxAbsDbWorst: Math.max(...maxAbsValues),
        normalizedViolationMedian: median(violationValues),
        elapsedMsMedian: median(elapsedValues),
        filterCounts: [...new Set(structuralRuns.map((run) => run.filterCount))].sort((a, b) => a - b),
      },
    })
  }

  const summary = {
    cases: rows.length,
    q31ExactRepeatableCases: rows.filter((row) => row.q31x8.exactRepeatability).length,
    q31CasesWithoutDeadlineHit: rows.filter((row) => row.q31x8.deadlineHits === 0).length,
    q31CasesMeetingTargetAllRepeats: rows.filter((row) => row.q31x8.targetAchievedCount === 1).length,
    v2CasesMeetingTarget: rows.filter((row) => row.standardV2.targetAchieved).length,
    q31ViolationWins: rows.filter(
      (row) => row.q31x8.normalizedViolationMedian < row.standardV2.normalizedViolation - 1e-12,
    ).length,
    q31ViolationLosses: rows.filter(
      (row) => row.q31x8.normalizedViolationMedian > row.standardV2.normalizedViolation + 1e-12,
    ).length,
    q31ViolationTies: rows.filter(
      (row) => Math.abs(row.q31x8.normalizedViolationMedian - row.standardV2.normalizedViolation) <= 1e-12,
    ).length,
  }

  const report = {
    schemaVersion: 1,
    candidateCommit: process.env.GITHUB_SHA ?? 'local',
    candidate: 'frozen-q31-plus-filter-count-scaled-polish-x8',
    safetyFuseSeconds: 15,
    standardV2TimeLimitSeconds: 60,
    summary,
    rows,
  }

  writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(summary))
  for (const row of rows) {
    console.log(JSON.stringify({
      caseId: row.caseId,
      maxFilters: row.maxFilters,
      v2: {
        rmse: row.standardV2.rmseDb,
        maxAbs: row.standardV2.maxAbsDb,
        violation: row.standardV2.normalizedViolation,
        elapsedMs: row.standardV2.elapsedMs,
        termination: row.standardV2.terminationReason,
      },
      q31x8: {
        rmse: row.q31x8.rmseDbMedian,
        maxAbs: row.q31x8.maxAbsDbMedian,
        violation: row.q31x8.normalizedViolationMedian,
        elapsedMs: row.q31x8.elapsedMsMedian,
        exactRepeatability: row.q31x8.exactRepeatability,
        deadlineHits: row.q31x8.deadlineHits,
      },
    }))
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
