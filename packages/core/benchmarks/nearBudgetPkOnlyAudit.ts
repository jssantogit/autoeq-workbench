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

const benchmarkCase = V2_BENCHMARK_CASES.find((item) => item.id === 'near_budget')
if (!benchmarkCase) throw new Error('near_budget case not found')

const frequencies = createEvaluationGrid()
const source = prepareCurve(benchmarkCase.source, benchmarkCase.normalization, frequencies)
const target = prepareCurve(benchmarkCase.target, benchmarkCase.normalization, frequencies)
const desiredDb = desiredCorrection(source.db, target.db)

const runs = []
for (let repeatIndex = 0; repeatIndex < 5; repeatIndex += 1) {
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
    filters: result.filters,
    signature,
  })
}

const report = {
  caseId: benchmarkCase.id,
  uniqueSignatureCount: new Set(runs.map((run) => run.signature)).size,
  deadlineCount: runs.filter((run) => run.expired).length,
  runs,
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'near-budget-pk-only-audit')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
