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
type CaseId = (typeof CASE_IDS)[number]
type Mode = 'terminal' | 'realtime'

interface AuditRun {
  caseId: CaseId
  mode: Mode
  budgetSeconds: number | null
  repeatIndex: number
  elapsedMs: number
  termination: 'exhausted' | 'deadline'
  rmseDb: number
  maxAbsDb: number
  normalizedViolation: number
  deliveredFilterCount: number
  bands: ReturnType<typeof calculateBandMetrics>
  filters: ReturnType<typeof runStructuralSearch>['filters']
  signature: string
}

function runOne(caseId: CaseId, mode: Mode, budgetSeconds: number | null, repeatIndex: number): AuditRun {
  const prepared = prepareResearchDesired(caseId)
  const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
  const startedAt = performance.now()
  const deadlineAt = budgetSeconds === null ? Number.POSITIVE_INFINITY : startedAt + budgetSeconds * 1000
  const deadline = { isExpired: () => performance.now() >= deadlineAt }
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline,
  })
  const elapsedMs = performance.now() - startedAt
  const expired = budgetSeconds !== null && performance.now() >= deadlineAt
  const cascadeDb = cascadeMagnitudeDb(result.filters, prepared.frequenciesHz, MVP_NUMERIC_POLICY.sampleRateHz)
  const residualDb = prepared.desiredDb.map((desired, index) => desired - cascadeDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)
  const termination = expired ? 'deadline' as const : 'exhausted' as const
  const signature = createHash('sha256').update(JSON.stringify({
    filters: result.filters,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    termination,
  })).digest('hex')
  return {
    caseId, mode, budgetSeconds, repeatIndex, elapsedMs, termination,
    rmseDb: metrics.rmseDb, maxAbsDb: metrics.maxAbsDb,
    normalizedViolation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
    deliveredFilterCount: result.filters.length,
    bands: calculateBandMetrics(residualDb, prepared.frequenciesHz, RESEARCH_BANDS),
    filters: result.filters.map((filter) => ({ ...filter })),
    signature,
  }
}

function aggregate(runs: AuditRun[]) {
  const groups = new Map<string, AuditRun[]>()
  for (const run of runs) {
    const key = [run.caseId, run.mode, run.budgetSeconds ?? 'terminal'].join('|')
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  const median = (values: number[]) => values[Math.floor(values.length / 2)]!
  return [...groups.entries()].map(([key, rows]) => {
    const rmse = rows.map(r => r.rmseDb).sort((a,b)=>a-b)
    const maxAbs = rows.map(r => r.maxAbsDb).sort((a,b)=>a-b)
    const elapsed = rows.map(r => r.elapsedMs).sort((a,b)=>a-b)
    const signatures = [...new Set(rows.map(r => r.signature))]
    return {
      key, caseId: rows[0]!.caseId, mode: rows[0]!.mode, budgetSeconds: rows[0]!.budgetSeconds,
      runCount: rows.length, uniqueSignatureCount: signatures.length, exactRepeatability: signatures.length === 1,
      deadlineCount: rows.filter(r => r.termination === 'deadline').length,
      exhaustedCount: rows.filter(r => r.termination === 'exhausted').length,
      rmseDb: { best: rmse[0]!, median: median(rmse), worst: rmse.at(-1)!, spread: rmse.at(-1)! - rmse[0]! },
      maxAbsDb: { best: maxAbs[0]!, median: median(maxAbs), worst: maxAbs.at(-1)!, spread: maxAbs.at(-1)! - maxAbs[0]! },
      elapsedMs: { best: elapsed[0]!, median: median(elapsed), worst: elapsed.at(-1)!, spread: elapsed.at(-1)! - elapsed[0]! },
      deliveredFilterCounts: [...new Set(rows.map(r => r.deliveredFilterCount))].sort((a,b)=>a-b),
    }
  })
}

async function main() {
  const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'autoeq-structural-audit')
  mkdirSync(outputDir, { recursive: true })
  const runs: AuditRun[] = []
  for (const caseId of CASE_IDS) {
    for (let repeatIndex=0; repeatIndex<10; repeatIndex++) runs.push(runOne(caseId,'terminal',null,repeatIndex))
    for (const budgetSeconds of [5,15]) {
      for (let repeatIndex=0; repeatIndex<5; repeatIndex++) runs.push(runOne(caseId,'realtime',budgetSeconds,repeatIndex))
    }
  }
  const report = {
    schemaVersion: 1,
    candidateCommit: process.env.GITHUB_SHA ?? 'local',
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    config: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
    runs,
    aggregates: aggregate(runs),
  }
  writeFileSync(resolve(outputDir,'results.json'), JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report.aggregates))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
