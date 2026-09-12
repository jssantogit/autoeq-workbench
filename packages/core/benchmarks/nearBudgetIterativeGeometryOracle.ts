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

function metricsFor(filters: readonly any[]) {
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
  ...metricsFor(initial.filters),
}
const steps = []

for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
  const generated = generateV2Candidates({
    frequencies,
    residualDb: current.residualDb,
    config: bounds,
    boundaryMode: 'mixed',
  }).filter((candidate) => candidate.type === 'PK')
  const shortlist = rankV2CandidateShortlist(generated).slice(0, 8)

  const evaluated = []
  for (let candidateIndex = 0; candidateIndex < shortlist.length; candidateIndex += 1) {
    const candidate = shortlist[candidateIndex]!
    for (let slotIndex = 0; slotIndex < current.filters.length; slotIndex += 1) {
      const replacement = {
        id: `oracle-step-${stepIndex}-candidate-${candidateIndex}-slot-${slotIndex}`,
        enabled: true,
        type: 'PK' as const,
        frequencyHz: candidate.frequencyHz,
        gainDb: candidate.gainDb,
        q: candidate.q,
      }
      const filters = [
        ...current.filters.slice(0, slotIndex),
        replacement,
        ...current.filters.slice(slotIndex + 1),
      ]
      const polished = polishFilters(
        filters,
        Math.max(config.localPolishEvaluations, filters.length * 8),
        bounds,
        desiredDb,
        frequencies,
        { isExpired: () => false },
        MVP_NUMERIC_POLICY.sampleRateHz,
      )
      evaluated.push({
        candidateIndex,
        slotIndex,
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
      })
    }
  }

  evaluated.sort((left, right) =>
    left.violation - right.violation ||
    left.rmseDb - right.rmseDb ||
    left.maxAbsDb - right.maxAbsDb ||
    left.candidateIndex - right.candidateIndex ||
    left.slotIndex - right.slotIndex
  )

  const best = evaluated[0]
  if (!best || best.violation >= current.violation - 1e-12) break

  const previousViolation = current.violation
  const nextMetrics = metricsFor(best.filters)
  current = {
    filters: best.filters,
    ...nextMetrics,
  }
  steps.push({
    stepIndex,
    previousViolation,
    nextViolation: current.violation,
    improvement: previousViolation - current.violation,
    candidateIndex: best.candidateIndex,
    slotIndex: best.slotIndex,
    seed: best.seed,
    filters: current.filters,
  })
}

const report = {
  initial: {
    rmseDb: metricsFor(initial.filters).rmseDb,
    maxAbsDb: metricsFor(initial.filters).maxAbsDb,
    violation: metricsFor(initial.filters).violation,
    filters: initial.filters,
  },
  steps,
  final: {
    rmseDb: current.rmseDb,
    maxAbsDb: current.maxAbsDb,
    violation: current.violation,
    filters: current.filters,
  },
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'near-budget-iterative-geometry-oracle')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({
  initialViolation: report.initial.violation,
  stepCount: steps.length,
  steps: steps.map((step) => ({
    stepIndex: step.stepIndex,
    previousViolation: step.previousViolation,
    nextViolation: step.nextViolation,
    improvement: step.improvement,
    slotIndex: step.slotIndex,
    seed: step.seed,
  })),
  final: report.final,
}, null, 2))
