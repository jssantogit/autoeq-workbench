import {
  compareV2Solutions,
  runStandardAutoEqV2,
  type AutoEqResultV2,
  type Filter,
  type StandardAutoEqInputV2,
} from '../src/index.js'
import { V2_BENCHMARK_CASES, type V2BenchmarkCase } from './v2Cases.js'
import { V2_HOLDOUT_CASES } from './v2HoldoutCases.js'

interface V2BenchmarkResult {
  caseId: string
  algorithmVersion: 'standard-v2'
  elapsedMs: number
  terminationReason: AutoEqResultV2['manifest']['terminationReason']
  targetAchieved: boolean
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

const cases = process.argv.includes('--holdout') ? V2_HOLDOUT_CASES : V2_BENCHMARK_CASES

function deterministic(result: AutoEqResultV2) {
  return result
}

function resultRow(caseId: string, result: AutoEqResultV2, elapsedMs: number): V2BenchmarkResult {
  return {
    caseId,
    algorithmVersion: result.manifest.algorithmVersion,
    elapsedMs,
    terminationReason: result.manifest.terminationReason,
    targetAchieved: result.manifest.targetAchieved,
    maeDb: result.metrics.maeDb,
    rmseDb: result.metrics.rmseDb,
    maxAbsDb: result.metrics.maxAbsDb,
    filterCount: result.filters.length,
    maxQ: Math.max(0, ...result.filters.map(({ q }) => q)),
    maxFilterBoostDb: Math.max(0, ...result.filters.map(({ gainDb }) => gainDb)),
    preampDb: result.preampDb,
    moderateCancellations: result.cancellationAudit.pairs.filter(({ severity }) => severity === 'moderate').length,
    strongCancellations: result.cancellationAudit.pairs.filter(({ severity }) => severity === 'strong').length,
    filters: result.filters.map((filter) => ({ ...filter })),
  }
}

function assertCase(benchmarkCase: V2BenchmarkCase, result: AutoEqResultV2) {
  if (result.filters.length > benchmarkCase.settings.maxFilters) {
    throw new Error(`${benchmarkCase.id}: delivered ${result.filters.length} filters above Max Filters ${benchmarkCase.settings.maxFilters}`)
  }
  if (benchmarkCase.category === 'solvable' && !result.manifest.targetAchieved) {
    throw new Error(
      `${benchmarkCase.id}: missed target; RMSE=${result.metrics.rmseDb}, maxAbs=${result.metrics.maxAbsDb}, termination=${result.manifest.terminationReason}`,
    )
  }
}

const rows: V2BenchmarkResult[] = []
for (const benchmarkCase of cases) {
  const startedAt = performance.now()
  const result = runStandardAutoEqV2(benchmarkCase)
  const elapsedMs = performance.now() - startedAt
  assertCase(benchmarkCase, result)
  if (result.manifest.terminationReason !== 'time-limit') {
    const repeated = runStandardAutoEqV2(benchmarkCase, { nowMs: () => 0 })
    if (JSON.stringify(deterministic(repeated)) !== JSON.stringify(deterministic(result))) {
      throw new Error(`${benchmarkCase.id}: deterministic non-timeout repeat drift`)
    }
  }
  rows.push(resultRow(benchmarkCase.id, result, elapsedMs))
}

if (!process.argv.includes('--holdout')) {
  const representative = V2_BENCHMARK_CASES[0]!
  const timeoutRun = (input: StandardAutoEqInputV2) => {
    let now = 0
    return runStandardAutoEqV2(input, { nowMs: () => (now += 1_000) })
  }
  const firstTimeout = timeoutRun({
    ...representative,
    settings: { ...representative.settings, timeLimitSeconds: 5 },
  })
  const secondTimeout = timeoutRun({
    ...representative,
    settings: { ...representative.settings, timeLimitSeconds: 5 },
  })
  if (JSON.stringify(firstTimeout) !== JSON.stringify(secondTimeout)) {
    throw new Error('fake-clock timeout repeat drift')
  }

  let shortNow = 0
  const short = runStandardAutoEqV2(
    { ...representative, settings: { ...representative.settings, timeLimitSeconds: 5 } },
    { nowMs: () => (shortNow += 100) },
  )
  let longNow = 0
  const long = runStandardAutoEqV2(
    { ...representative, settings: { ...representative.settings, timeLimitSeconds: 15 } },
    { nowMs: () => (longNow += 100) },
  )
  if (compareV2Solutions(long, short) > 0) {
    throw new Error('longer prefix-equivalent budget returned a worse deliverable')
  }
}

console.log(JSON.stringify(rows, null, 2))
