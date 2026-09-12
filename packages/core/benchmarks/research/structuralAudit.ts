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

interface AuditRun {
  caseId: CaseId
  mode: 'terminal' | 'realtime'
  budgetSeconds: number | null
  repeatIndex: number
  elapsedMs: number
  deadlineExpiredAtReturn: boolean
  termination: 'exhausted' | 'deadline'
  rmseDb: number
  maxAbsDb: number
  normalizedViolation: number
  deliveredFilterCount: number
  bands: ReturnType<typeof calculateBandMetrics>
  filters: ReturnType<typeof runStructuralSearch>['filters']
  signature: string
}

function signatureFor(run: Omit<AuditRun, 'signature'>): string {
  return createHash('sha256')
    .update(JSON.stringify({
      filters: run.filters,
      rmseDb: run.rmseDb,
      maxAbsDb: run.maxAbsDb,
      deliveredFilterCount: run.deliveredFilterCount,
      termination: run.termination,
    }))
    .digest('hex')
}

function executeOne(
  caseId: CaseId,
  mode: AuditRun['mode'],
  budgetSeconds: number | null,
  repeatIndex: number,
): AuditRun {
  const prepared = prepareResearchDesired(caseId)
  const config = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  })

  const startedAt = performance.now()
  const deadlineAt = budgetSeconds === null
    ? Number.POSITIVE_INFINITY
    : startedAt + budgetSeconds * 1000
  const deadline = {
    isExpired: () => performance.now() >= deadlineAt,
  }

  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline,
  })
  const elapsedMs = performance.now() - startedAt
  const deadlineExpiredAtReturn = budgetSeconds !== null && performance.now() >= deadlineAt

  const cascadeDb = cascadeMagnitudeDb(
    result.filters,
    prepared.frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = prepared.desiredDb.map((desired, index) =>
    desired - cascadeDb[index]!,
  )
  const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)

  if (
    Math.abs(metrics.rmseDb - result.rmseDb) > 1e-8 ||
    Math.abs(metrics.maxAbsDb - result.maxAbsDb) > 1e-8
  ) {
    throw new Error(`Structural result metric mismatch for ${caseId}`)
  }

  const withoutSignature: Omit<AuditRun, 'signature'> = {
    caseId,
    mode,
    budgetSeconds,
    repeatIndex,
    elapsedMs,
    deadlineExpiredAtReturn,
    termination: deadlineExpiredAtReturn ? 'deadline' : 'exhausted',
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    normalizedViolation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
    deliveredFilterCount: result.filters.length,
    bands: calculateBandMetrics(residualDb, prepared.frequenciesHz, RESEARCH_BANDS),
    filters: result.filters.map((filter) => ({ ...filter })),
  }
  return {
    ...withoutSignature,
    signature: signatureFor(withoutSignature),
  }
}

function aggregate(runs: AuditRun[]) {
  const groups = new Map<string, AuditRun[]>()
  for (const run of runs) {
    const key = [run.caseId, run.mode, run.budgetSeconds ?? 'terminal'].join('|')
    const current = groups.get(key) ?? []
    current.push(run)
    groups.set(key, current)
  }

  return [...groups.entries()].map(([key, rows]) => {
    const rmse = rows.map((row) => row.rmseDb).sort((a, b) => a - b)
    const maxAbs = rows.map((row) => row.maxAbsDb).sort((a, b) => a - b)
    const elapsed = rows.map((row) => row.elapsedMs).sort((a, b) => a - b)
    const signatures = [...new Set(rows.map((row) => row.signature))]
    const median = (values: number[]) => values[Math.floor(values.length / 2)]!
    return {
      key,
      caseId: rows[0]!.caseId,
      mode: rows[0]!.mode,
      budgetSeconds: rows[0]!.budgetSeconds,
      runCount: rows.length,
      uniqueSignatureCount: signatures.length,
      exactRepeatability: signatures.length === 1,
      signatures,
      deadlineCount: rows.filter((row) => row.termination === 'deadline').length,
      exhaustedCount: rows.filter((row) => row.termination === 'exhausted').length,
      rmseDb: {
        best: rmse[0]!,
        median: median(rmse),
        worst: rmse[rmse.length - 1]!,
        spread: rmse[rmse.length - 1]! - rmse[0]!,
      },
      maxAbsDb: {
        best: maxAbs[0]!,
        median: median(maxAbs),
        worst: maxAbs[maxAbs.length - 1]!,
        spread: maxAbs[maxAbs.length - 1]! - maxAbs[0]!,
      },
      elapsedMs: {
        best: elapsed[0]!,
        median: median(elapsed),
        worst: elapsed[elapsed.length - 1]!,
        spread: elapsed[elapsed.length - 1]! - elapsed[0]!,
      },
      deliveredFilterCounts: [...new Set(rows.map((row) => row.deliveredFilterCount))].sort((a, b) => a - b),
    }
  })
}

async function main() {
  const outputDir = resolve(process.env.AUDIT_OUTPUT_DIR ?? 'autoeq-structural-audit')
  mkdirSync(outputDir, { recursive: true })

  const runs: AuditRun[] = []
  for (const caseId of CASE_IDS) {
    for (let repeatIndex = 0; repeatIndex < 10; repeatIndex += 1) {
      runs.push(executeOne(caseId, 'terminal', null, repeatIndex))
    }
    for (const budgetSeconds of [5, 15]) {
      for (let repeatIndex = 0; repeatIndex < 5; repeatIndex += 1) {
        runs.push(executeOne(caseId, 'realtime', budgetSeconds, repeatIndex))
      }
    }
  }

  const report = {
    schemaVersion: 1,
    candidateCommit: process.env.GITHUB_SHA ?? 'local',
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    config: resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }),
    runs,
    aggregates: aggregate(runs),
  }

  writeFileSync(
    resolve(outputDir, 'results.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(`Structural audit: ${runs.length} runs written to ${outputDir}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
