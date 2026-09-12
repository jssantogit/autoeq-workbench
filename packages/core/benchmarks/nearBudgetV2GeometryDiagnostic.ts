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

const incumbent = runStructuralSearch({
  desiredDb,
  frequencies,
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  config,
  deadline: { isExpired: () => false },
})

const responseDb = cascadeMagnitudeDb(
  incumbent.filters,
  frequencies,
  MVP_NUMERIC_POLICY.sampleRateHz,
)
const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
const incumbentMetrics = calculateErrorMetrics(residualDb, frequencies)
const incumbentViolation = Math.max(
  incumbentMetrics.rmseDb / 0.25,
  incumbentMetrics.maxAbsDb / 0.75,
)

const generated = generateV2Candidates({
  frequencies,
  residualDb,
  config: bounds,
  boundaryMode: 'mixed',
}).filter((candidate) => candidate.type === 'PK')
const shortlist = rankV2CandidateShortlist(generated).slice(0, 8)

const evaluated = []
for (let candidateIndex = 0; candidateIndex < shortlist.length; candidateIndex += 1) {
  const candidate = shortlist[candidateIndex]!
  for (let slotIndex = 0; slotIndex < incumbent.filters.length; slotIndex += 1) {
    const replacement = {
      id: `v2-geometry-${candidateIndex}-slot-${slotIndex}`,
      enabled: true,
      type: 'PK' as const,
      frequencyHz: candidate.frequencyHz,
      gainDb: candidate.gainDb,
      q: candidate.q,
    }
    const filters = [
      ...incumbent.filters.slice(0, slotIndex),
      replacement,
      ...incumbent.filters.slice(slotIndex + 1),
    ]
    const startedAt = performance.now()
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
      candidate: {
        frequencyHz: candidate.frequencyHz,
        gainDb: candidate.gainDb,
        q: candidate.q,
        qScale: candidate.qScale,
        boundaryMode: candidate.boundaryMode,
        cheapScore: candidate.cheapScore,
      },
      elapsedMs: performance.now() - startedAt,
      rmseDb: polished.rmseDb,
      maxAbsDb: polished.maxAbsDb,
      violation: Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75),
      filters: polished.filters,
    })
  }
}
evaluated.sort((left, right) => left.violation - right.violation)

const report = {
  incumbent: {
    rmseDb: incumbentMetrics.rmseDb,
    maxAbsDb: incumbentMetrics.maxAbsDb,
    violation: incumbentViolation,
    filters: incumbent.filters,
  },
  generatedPkCount: generated.length,
  shortlist,
  evaluatedSwapCount: evaluated.length,
  improvingSwapCount: evaluated.filter((item) => item.violation < incumbentViolation).length,
  bestSwap: evaluated[0] ?? null,
  top10: evaluated.slice(0, 10),
}

const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'near-budget-v2-geometry-diagnostic')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({
  incumbentViolation,
  generatedPkCount: generated.length,
  shortlistCount: shortlist.length,
  evaluatedSwapCount: evaluated.length,
  improvingSwapCount: report.improvingSwapCount,
  bestSwap: report.bestSwap && {
    candidateIndex: report.bestSwap.candidateIndex,
    slotIndex: report.bestSwap.slotIndex,
    candidate: report.bestSwap.candidate,
    violation: report.bestSwap.violation,
    rmseDb: report.bestSwap.rmseDb,
    maxAbsDb: report.bestSwap.maxAbsDb,
  },
}, null, 2))
