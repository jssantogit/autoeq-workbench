import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateBandMetrics,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  prepareCurve,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../../src/index.js'
import { V2_BENCHMARK_CASES } from '../v2Cases.js'

const CASE_IDS = new Set([
  'dense_treble',
  'near_budget',
  'overcomplete_compress',
  'stress_mid_treble',
  'stress_mixed_edges',
])

const bands = [
  { id: 'bass', label: '20-200 Hz', minHz: 20, maxHz: 200 },
  { id: 'low-mid', label: '200-1000 Hz', minHz: 200, maxHz: 1000 },
  { id: 'mid', label: '1-4 kHz', minHz: 1000, maxHz: 4000 },
  { id: 'presence', label: '4-8 kHz', minHz: 4000, maxHz: 8000 },
  { id: 'treble', label: '8-20 kHz', minHz: 8000, maxHz: 20000 },
] as const

const rows = []

for (const benchmarkCase of V2_BENCHMARK_CASES) {
  if (!CASE_IDS.has(benchmarkCase.id)) continue

  const frequencies = createEvaluationGrid()
  const source = prepareCurve(benchmarkCase.source, benchmarkCase.normalization, frequencies)
  const target = prepareCurve(benchmarkCase.target, benchmarkCase.normalization, frequencies)
  const desiredDb = desiredCorrection(source.db, target.db)
  const config = {
    ...resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }),
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

  rows.push({
    caseId: benchmarkCase.id,
    maxFilters: benchmarkCase.settings.maxFilters,
    elapsedMs,
    metrics,
    bands: calculateBandMetrics(residualDb, frequencies, bands),
    filters: result.filters,
  })
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'autoeq-q31-x8-failure-topology')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify({ rows }, null, 2) + '\n')
console.log(JSON.stringify(rows.map((row) => ({
  caseId: row.caseId,
  elapsedMs: row.elapsedMs,
  metrics: row.metrics,
  filters: row.filters,
}))))
