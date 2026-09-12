import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  prepareCurve,
  resolveStandardAutoEqV2Config,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../src/index.js'
import { generateV2Candidates } from '../src/autoeq/v2/candidates.js'
import { polishFilters } from '../src/autoeq/v2/structuralSearch.js'
import { V2_BENCHMARK_CASES } from './v2Cases.js'

const benchmarkCase = V2_BENCHMARK_CASES.find((item) => item.id === 'stress_mid_treble')
if (!benchmarkCase) throw new Error('stress_mid_treble case not found')

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

function measure(filters: readonly any[]) {
  const responseDb = cascadeMagnitudeDb(filters, frequencies, MVP_NUMERIC_POLICY.sampleRateHz)
  const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  return {
    residualDb,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
  }
}

const initial = runStructuralSearch({
  desiredDb,
  frequencies,
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  config,
  deadline: { isExpired: () => false },
})
const initialMetrics = measure(initial.filters)

const candidates = generateV2Candidates({
  frequencies,
  residualDb: initialMetrics.residualDb,
  config: bounds,
  boundaryMode: 'mixed',
}).filter((candidate) => candidate.type === 'PK')

const evaluated = candidates.map((candidate, candidateIndex) => {
  const seeded = [
    ...initial.filters,
    {
      id: `all-candidate-${candidateIndex}`,
      enabled: true,
      type: 'PK' as const,
      frequencyHz: candidate.frequencyHz,
      gainDb: candidate.gainDb,
      q: candidate.q,
    },
  ]
  const polished = polishFilters(
    seeded,
    Math.max(config.localPolishEvaluations, seeded.length * 8),
    bounds,
    desiredDb,
    frequencies,
    { isExpired: () => false },
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  return {
    candidateIndex,
    seed: {
      frequencyHz: candidate.frequencyHz,
      gainDb: candidate.gainDb,
      q: candidate.q,
      qScale: candidate.qScale,
      boundaryMode: candidate.boundaryMode,
      cheapScore: candidate.cheapScore,
    },
    rmseDb: polished.rmseDb,
    maxAbsDb: polished.maxAbsDb,
    violation: Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75),
    filters: polished.filters,
  }
}).sort((left, right) =>
  left.violation - right.violation ||
  left.rmseDb - right.rmseDb ||
  left.maxAbsDb - right.maxAbsDb ||
  left.seed.frequencyHz - right.seed.frequencyHz
)

function bestAtOrAbove(hz: number) {
  return evaluated.find((item) => item.seed.frequencyHz >= hz) ?? null
}
function bestInRange(minHz: number, maxHz: number) {
  return evaluated.find((item) => item.seed.frequencyHz >= minHz && item.seed.frequencyHz < maxHz) ?? null
}

const report = {
  initial: {
    filterCount: initial.filters.length,
    rmseDb: initialMetrics.rmseDb,
    maxAbsDb: initialMetrics.maxAbsDb,
    violation: initialMetrics.violation,
    filters: initial.filters,
  },
  generatedPkCount: candidates.length,
  improvingCount: evaluated.filter((item) => item.violation < initialMetrics.violation).length,
  bestOverall: evaluated[0] ?? null,
  bestAbove5k: bestAtOrAbove(5_000),
  bestAbove8k: bestAtOrAbove(8_000),
  bestAbove12k: bestAtOrAbove(12_000),
  bestByRange: {
    under5k: bestInRange(0, 5_000),
    from5kTo8k: bestInRange(5_000, 8_000),
    from8kTo12k: bestInRange(8_000, 12_000),
    above12k: bestInRange(12_000, Number.POSITIVE_INFINITY),
  },
  top20: evaluated.slice(0, 20),
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'stress-all-candidate-oracle')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({
  initial: report.initial,
  generatedPkCount: report.generatedPkCount,
  improvingCount: report.improvingCount,
  bestOverall: report.bestOverall,
  bestAbove5k: report.bestAbove5k,
  bestAbove8k: report.bestAbove8k,
  bestAbove12k: report.bestAbove12k,
}, null, 2))
