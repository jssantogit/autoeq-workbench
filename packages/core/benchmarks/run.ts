import { readFile, writeFile } from 'node:fs/promises'

import {
  auditCancellations,
  createEvaluationGrid,
  MVP_NUMERIC_POLICY,
  runStandardAutoEq,
  type Filter,
} from '../src/index.js'
import { BENCHMARK_CASES } from './cases.js'

export interface BenchmarkResult {
  caseId: string
  algorithmVersion: 'standard-v1'
  elapsedMs: number
  maeDb: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  maxQ: number
  maxFilterBoostDb: number
  preampDb: number
  moderateCancellations: number
  strongCancellations: number
  filters: Filter[]
}

const baselineUrl = new URL('./baseline-standard-v1.json', import.meta.url)
const frequenciesHz = createEvaluationGrid()

function runCases(): BenchmarkResult[] {
  return BENCHMARK_CASES.map((benchmarkCase) => {
    const startedAt = performance.now()
    const result = runStandardAutoEq(benchmarkCase)
    const elapsedMs = performance.now() - startedAt
    const cancellationAudit = auditCancellations(
      result.filters,
      frequenciesHz,
      MVP_NUMERIC_POLICY.sampleRateHz,
    )

    return {
      caseId: benchmarkCase.id,
      algorithmVersion: result.manifest.algorithmVersion,
      elapsedMs,
      maeDb: result.metrics.maeDb,
      rmseDb: result.metrics.rmseDb,
      maxAbsDb: result.metrics.maxAbsDb,
      filterCount: result.filters.length,
      maxQ: Math.max(0, ...result.filters.map(({ q }) => q)),
      maxFilterBoostDb: Math.max(0, ...result.filters.map(({ gainDb }) => gainDb)),
      preampDb: result.preampDb,
      moderateCancellations: cancellationAudit.pairs.filter(
        ({ severity }) => severity === 'moderate',
      ).length,
      strongCancellations: cancellationAudit.pairs.filter(
        ({ severity }) => severity === 'strong',
      ).length,
      filters: result.filters.map((filter) => ({ ...filter })),
    }
  })
}

const deterministic = ({ elapsedMs: _elapsedMs, ...result }: BenchmarkResult) => result
const results = runCases()

if (process.argv.includes('--write-baseline')) {
  await writeFile(baselineUrl, `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${results.length} Standard-v1 benchmark cases.`)
} else {
  const baseline = JSON.parse(await readFile(baselineUrl, 'utf8')) as BenchmarkResult[]
  const expected = JSON.stringify(baseline.map(deterministic))
  const actual = JSON.stringify(results.map(deterministic))
  if (actual !== expected) {
    throw new Error('Standard-v1 benchmark drift detected; run benchmark:update only for reviewed changes')
  }
  console.log(JSON.stringify(results, null, 2))
}
