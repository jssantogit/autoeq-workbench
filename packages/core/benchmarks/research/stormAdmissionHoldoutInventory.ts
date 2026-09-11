import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'

export const PREVIOUSLY_OBSERVED_STORM_POLICY_IDS = Object.freeze([
  'matching-pursuit-v1:titan-to-storm:0:sparse-0001',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0002',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0003',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0004',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0005',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0006',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0007',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0008',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0009',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010',
  'matching-pursuit-v1:titan-to-storm:0:replacement-2-2572',
] as const)

export const HOLDOUT_STRATA = Object.freeze([
  { id: '1-4', minFilters: 1, maxFilters: 4 },
  { id: '5-6', minFilters: 5, maxFilters: 6 },
  { id: '7-8', minFilters: 7, maxFilters: 8 },
  { id: '9-10', minFilters: 9, maxFilters: 10 },
] as const)

export const HOLDOUTS_PER_STRATUM = 3 as const

interface TournamentPoint {
  candidateId: string
  evaluationCount: number
  elapsedMs: number
  actualDeliveredFilterCount: number
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  referenceRegret: number
  referenceImproved: boolean
  filters: unknown[]
}

interface InventoryCandidate {
  candidateId: string
  firstEvaluationCount: number
  firstElapsedMs: number
  filterCount: number
  rmseDb: number
  maxAbsDb: number
  regret: number
  referenceImproved: boolean
  filters: unknown[]
  stratum: string
}

function stratumFor(filterCount: number): string | null {
  return HOLDOUT_STRATA.find((stratum) =>
    filterCount >= stratum.minFilters && filterCount <= stratum.maxFilters)?.id ?? null
}

function isTournamentPoint(value: unknown): value is TournamentPoint {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const point = value as Partial<TournamentPoint>
  return typeof point.candidateId === 'string' &&
    Number.isFinite(point.evaluationCount) &&
    Number.isFinite(point.elapsedMs) &&
    Number.isFinite(point.actualDeliveredFilterCount) &&
    Number.isFinite(point.canonicalRmseDb) &&
    Number.isFinite(point.canonicalMaxAbsDb) &&
    Number.isFinite(point.referenceRegret) &&
    typeof point.referenceImproved === 'boolean' &&
    Array.isArray(point.filters)
}

export function buildStormHoldoutInventory(sameRun: unknown) {
  if (sameRun === null || typeof sameRun !== 'object' || Array.isArray(sameRun)) {
    throw new Error('same-runtime tournament must be an object')
  }
  const runs = (sameRun as { runs?: unknown }).runs
  if (!Array.isArray(runs)) throw new Error('same-runtime tournament runs are missing')
  const stormRun = runs.find((run) => {
    if (run === null || typeof run !== 'object' || Array.isArray(run)) return false
    const record = run as Record<string, unknown>
    return record.problemId === 'titan-to-storm' &&
      record.algorithmId === 'matching-pursuit-v1' &&
      record.variantId === 'matching-pursuit-v1'
  }) as Record<string, unknown> | undefined
  if (stormRun === undefined) throw new Error('frozen Storm matching-pursuit-v1 run is missing')

  const progressTrace = stormRun.progressTrace
  if (!Array.isArray(progressTrace)) throw new Error('Storm progressTrace is missing')

  const observed = new Set<string>(PREVIOUSLY_OBSERVED_STORM_POLICY_IDS)
  const byCandidateId = new Map<string, InventoryCandidate>()
  for (const raw of progressTrace) {
    if (!isTournamentPoint(raw)) continue
    if (observed.has(raw.candidateId)) continue
    if (raw.actualDeliveredFilterCount <= 0 || raw.actualDeliveredFilterCount > 10) continue
    if (raw.filters.length !== raw.actualDeliveredFilterCount) continue
    const stratum = stratumFor(raw.actualDeliveredFilterCount)
    if (stratum === null) continue
    const current = byCandidateId.get(raw.candidateId)
    if (current !== undefined && current.firstEvaluationCount <= raw.evaluationCount) continue
    byCandidateId.set(raw.candidateId, {
      candidateId: raw.candidateId,
      firstEvaluationCount: raw.evaluationCount,
      firstElapsedMs: raw.elapsedMs,
      filterCount: raw.actualDeliveredFilterCount,
      rmseDb: raw.canonicalRmseDb,
      maxAbsDb: raw.canonicalMaxAbsDb,
      regret: raw.referenceRegret,
      referenceImproved: raw.referenceImproved,
      filters: raw.filters,
      stratum,
    })
  }

  const eligible = [...byCandidateId.values()].sort((left, right) =>
    left.firstEvaluationCount - right.firstEvaluationCount ||
    left.candidateId.localeCompare(right.candidateId))

  const selected = HOLDOUT_STRATA.flatMap((stratum) =>
    eligible
      .filter((candidate) => candidate.stratum === stratum.id)
      .slice(0, HOLDOUTS_PER_STRATUM))

  const countsByStratum = Object.fromEntries(HOLDOUT_STRATA.map((stratum) => [
    stratum.id,
    eligible.filter((candidate) => candidate.stratum === stratum.id).length,
  ]))

  return {
    schemaVersion: 1,
    experimentVersion: 'storm-admission-holdout-inventory-v1',
    source: {
      artifact: 'same-runtime-tournament/tournament-report.json',
      problemId: 'titan-to-storm',
      algorithmId: 'matching-pursuit-v1',
      variantId: 'matching-pursuit-v1',
    },
    selectionRule: {
      outcomeBlind: true,
      excludePreviouslyObservedCandidateIds: [...PREVIOUSLY_OBSERVED_STORM_POLICY_IDS],
      deduplicateBy: 'candidateId-first-appearance',
      orderBy: ['firstEvaluationCount-asc', 'candidateId-asc'],
      strata: HOLDOUT_STRATA,
      takePerStratum: HOLDOUTS_PER_STRATUM,
    },
    progressTraceRows: progressTrace.length,
    uniqueEligibleCandidates: eligible.length,
    countsByStratum,
    selectedCount: selected.length,
    selected,
  }
}

export function runInventory() {
  const path = resolveCapacityRecoveryPath('same-runtime-tournament/tournament-report.json')
  const sameRun = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const report = buildStormHoldoutInventory(sameRun)
  const outPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-admission-holdout-inventory-20260911/inventory-report.json',
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({
    uniqueEligibleCandidates: report.uniqueEligibleCandidates,
    countsByStratum: report.countsByStratum,
    selectedCount: report.selectedCount,
    selected: report.selected.map((candidate) => ({
      candidateId: candidate.candidateId,
      firstEvaluationCount: candidate.firstEvaluationCount,
      filterCount: candidate.filterCount,
      rmseDb: candidate.rmseDb,
      maxAbsDb: candidate.maxAbsDb,
      regret: candidate.regret,
      stratum: candidate.stratum,
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runInventory()
}
