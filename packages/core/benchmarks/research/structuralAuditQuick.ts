import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateBandMetrics,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../../src/index.js'
import { prepareResearchDesired } from './corpus.js'
import { RESEARCH_BANDS } from './telemetry.js'

const CASE_IDS = ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio'] as const

function runOne(caseId: (typeof CASE_IDS)[number], repeatIndex: number) {
  const prepared = prepareResearchDesired(caseId)
  const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
  const startedAt = performance.now()
  const deadlineAt = startedAt + 5000
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline: { isExpired: () => performance.now() >= deadlineAt },
  })
  const elapsedMs = performance.now() - startedAt
  const cascadeDb = cascadeMagnitudeDb(result.filters, prepared.frequenciesHz, MVP_NUMERIC_POLICY.sampleRateHz)
  const residualDb = prepared.desiredDb.map((desired, index) => desired - cascadeDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)
  const signature = createHash('sha256').update(JSON.stringify({
    filters: result.filters,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
  })).digest('hex')
  return {
    caseId,
    repeatIndex,
    elapsedMs,
    expired: performance.now() >= deadlineAt,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    normalizedViolation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
    deliveredFilterCount: result.filters.length,
    signature,
    bands: calculateBandMetrics(residualDb, prepared.frequenciesHz, RESEARCH_BANDS),
    filters: result.filters,
  }
}

const runs = []
for (const caseId of CASE_IDS) {
  for (let repeatIndex = 0; repeatIndex < 5; repeatIndex++) runs.push(runOne(caseId, repeatIndex))
}
const aggregates = CASE_IDS.map(caseId => {
  const rows = runs.filter(r => r.caseId === caseId)
  const sigs = [...new Set(rows.map(r => r.signature))]
  const sort = (xs: number[]) => [...xs].sort((a,b)=>a-b)
  const median = (xs: number[]) => sort(xs)[Math.floor(xs.length/2)]!
  return {
    caseId,
    runCount: rows.length,
    uniqueSignatureCount: sigs.length,
    exactRepeatability: sigs.length === 1,
    deadlineCount: rows.filter(r => r.expired).length,
    rmseDbMedian: median(rows.map(r => r.rmseDb)),
    maxAbsDbMedian: median(rows.map(r => r.maxAbsDb)),
    normalizedViolationMedian: median(rows.map(r => r.normalizedViolation)),
    elapsedMsMedian: median(rows.map(r => r.elapsedMs)),
    filterCounts: [...new Set(rows.map(r => r.deliveredFilterCount))],
  }
})
const report = {
  schemaVersion: 1,
  candidateCommit: process.env.GITHUB_SHA ?? 'local',
  config: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
  runs,
  aggregates,
}
const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'autoeq-structural-audit-quick')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir,'results.json'), JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(aggregates))
