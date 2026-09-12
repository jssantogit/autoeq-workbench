import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  generateStructuralMutations,
  polishFilters,
  prepareCurve,
  resolveStandardAutoEqV2Config,
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
const config = {
  ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
  maxFilters: benchmarkCase.settings.maxFilters,
}
const bounds = resolveStandardAutoEqV2Config({
  ...DEFAULT_AUTOEQ_SETTINGS,
  maxFilters: benchmarkCase.settings.maxFilters,
})

const search = runStructuralSearch({
  desiredDb,
  frequencies,
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  config,
  deadline: { isExpired: () => false },
})

const responseDb = cascadeMagnitudeDb(search.filters, frequencies, MVP_NUMERIC_POLICY.sampleRateHz)
const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
const incumbentMetrics = calculateErrorMetrics(residualDb, frequencies)
const incumbentViolation = Math.max(
  incumbentMetrics.rmseDb / 0.25,
  incumbentMetrics.maxAbsDb / 0.75,
)

const proposals = generateStructuralMutations(
  search.filters,
  residualDb,
  frequencies,
  bounds,
).filter((proposal) => proposal.mutation === 'swap-pk')

const evaluated = proposals.map((proposal, index) => {
  const startedAt = performance.now()
  const polished = polishFilters(
    proposal.filters,
    Math.max(config.localPolishEvaluations, proposal.filters.length * 8),
    bounds,
    desiredDb,
    frequencies,
    { isExpired: () => false },
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  return {
    index,
    elapsedMs: performance.now() - startedAt,
    rmseDb: polished.rmseDb,
    maxAbsDb: polished.maxAbsDb,
    violation: Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75),
    filters: polished.filters,
  }
}).sort((left, right) => left.violation - right.violation)

const report = {
  incumbent: {
    rmseDb: incumbentMetrics.rmseDb,
    maxAbsDb: incumbentMetrics.maxAbsDb,
    violation: incumbentViolation,
    filters: search.filters,
  },
  swapProposalCount: proposals.length,
  bestSwap: evaluated[0] ?? null,
  improvingSwapCount: evaluated.filter((item) => item.violation < incumbentViolation).length,
  evaluated,
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'near-budget-swap-diagnostic')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
