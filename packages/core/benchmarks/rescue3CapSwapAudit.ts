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

const CASE_IDS = new Set([
  'dense_treble',
  'near_budget',
  'overcomplete_compress',
  'stress_mid_treble',
  'stress_mixed_edges',
])
const frequencies = createEvaluationGrid()
const repeats = 5

function pairStats(filters: readonly { frequencyHz: number }[]) {
  let withinTwelfth = 0
  let withinSixth = 0
  let minSeparationOctaves = Number.POSITIVE_INFINITY
  for (let i = 0; i < filters.length; i += 1) {
    for (let j = i + 1; j < filters.length; j += 1) {
      const d = Math.abs(Math.log2(filters[i]!.frequencyHz / filters[j]!.frequencyHz))
      minSeparationOctaves = Math.min(minSeparationOctaves, d)
      if (d <= 1 / 12) withinTwelfth += 1
      if (d <= 1 / 6) withinSixth += 1
    }
  }
  return {
    withinTwelfth,
    withinSixth,
    minSeparationOctaves: Number.isFinite(minSeparationOctaves) ? minSeparationOctaves : null,
  }
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

const rows = []
for (const benchmarkCase of V2_BENCHMARK_CASES.filter((item) => CASE_IDS.has(item.id))) {
  const source = prepareCurve(benchmarkCase.source, benchmarkCase.normalization, frequencies)
  const target = prepareCurve(benchmarkCase.target, benchmarkCase.normalization, frequencies)
  const desiredDb = desiredCorrection(source.db, target.db)
  const runs = []

  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
    const config = {
      ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
      maxFilters: benchmarkCase.settings.maxFilters,
    }
    const startedAt = performance.now()
    const deadlineAt = startedAt + 15_000
    const result = runStructuralSearch({
      desiredDb,
      frequencies,
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config,
      deadline: { isExpired: () => performance.now() >= deadlineAt },
    })
    const elapsedMs = performance.now() - startedAt
    const responseDb = cascadeMagnitudeDb(result.filters, frequencies, MVP_NUMERIC_POLICY.sampleRateHz)
    const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
    const metrics = calculateErrorMetrics(residualDb, frequencies)
    const signature = createHash('sha256')
      .update(JSON.stringify({ filters: result.filters, metrics }))
      .digest('hex')

    runs.push({
      repeatIndex,
      elapsedMs,
      expired: performance.now() >= deadlineAt,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
      filterCount: result.filters.length,
      splitLineageCount: result.filters.filter((filter) => filter.id.includes('split')).length,
      ...pairStats(result.filters),
      filters: result.filters,
      signature,
    })
  }

  const signatures = new Set(runs.map((run) => run.signature))
  rows.push({
    caseId: benchmarkCase.id,
    exactRepeatability: signatures.size === 1,
    uniqueSignatureCount: signatures.size,
    deadlineCount: runs.filter((run) => run.expired).length,
    violationMedian: median(runs.map((run) => run.violation)),
    rmseDbMedian: median(runs.map((run) => run.rmseDb)),
    maxAbsDbMedian: median(runs.map((run) => run.maxAbsDb)),
    elapsedMsMedian: median(runs.map((run) => run.elapsedMs)),
    representative: runs[0],
  })
}

const report = { rows }
const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'rescue3-cap-swap-audit')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
