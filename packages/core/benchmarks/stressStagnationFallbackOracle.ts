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
import { generateV2Candidates, rankV2CandidateShortlist } from '../src/autoeq/v2/candidates.js'
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

let current = {
  filters: initial.filters,
  ...measure(initial.filters),
}
const steps = []

while (current.filters.length < config.maxFilters) {
  const generated = generateV2Candidates({
    frequencies,
    residualDb: current.residualDb,
    config: bounds,
    boundaryMode: 'mixed',
  }).filter((candidate) => candidate.type === 'PK')
  const shortlist = rankV2CandidateShortlist(generated).slice(0, 8)
  const evaluated = shortlist.map((candidate, candidateIndex) => {
    const filter = {
      id: `fallback-pk-${steps.length}-${candidateIndex}`,
      enabled: true,
      type: 'PK' as const,
      frequencyHz: candidate.frequencyHz,
      gainDb: candidate.gainDb,
      q: candidate.q,
    }
    const seeded = [...current.filters, filter]
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
      filters: polished.filters,
      rmseDb: polished.rmseDb,
      maxAbsDb: polished.maxAbsDb,
      violation: Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75),
    }
  }).sort((left, right) =>
    left.violation - right.violation ||
    left.rmseDb - right.rmseDb ||
    left.maxAbsDb - right.maxAbsDb ||
    left.candidateIndex - right.candidateIndex
  )

  const best = evaluated[0]
  if (!best || best.violation >= current.violation - 1e-12) break

  const previousViolation = current.violation
  const nextMetrics = measure(best.filters)
  current = {
    filters: best.filters,
    ...nextMetrics,
  }
  steps.push({
    stepIndex: steps.length,
    previousViolation,
    nextViolation: current.violation,
    improvement: previousViolation - current.violation,
    seed: best.seed,
    filters: current.filters,
  })
}

const report = {
  initial: {
    rmseDb: measure(initial.filters).rmseDb,
    maxAbsDb: measure(initial.filters).maxAbsDb,
    violation: measure(initial.filters).violation,
    filterCount: initial.filters.length,
    filters: initial.filters,
  },
  steps,
  final: {
    rmseDb: current.rmseDb,
    maxAbsDb: current.maxAbsDb,
    violation: current.violation,
    filterCount: current.filters.length,
    filters: current.filters,
  },
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'stress-stagnation-fallback-oracle')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
