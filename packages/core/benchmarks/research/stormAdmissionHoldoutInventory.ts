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

interface SeedRecord {
  sourceId: string
  filters: unknown[]
  sourceKind?: string
}

function stratumFor(filterCount: number): string | null {
  return HOLDOUT_STRATA.find((stratum) =>
    filterCount >= stratum.minFilters && filterCount <= stratum.maxFilters)?.id ?? null
}

function isSeedRecord(value: unknown): value is SeedRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<SeedRecord>
  return typeof record.sourceId === 'string' && Array.isArray(record.filters)
}

export function buildStormHoldoutInventory(seedBundle: unknown) {
  if (seedBundle === null || typeof seedBundle !== 'object' || Array.isArray(seedBundle)) {
    throw new Error('Storm proposal seed bundle must be an object')
  }
  const seeds = (seedBundle as { seeds?: unknown }).seeds
  if (!Array.isArray(seeds)) throw new Error('Storm proposal seed bundle seeds are missing')

  const observed = new Set<string>(PREVIOUSLY_OBSERVED_STORM_POLICY_IDS)
  const eligible = seeds
    .filter(isSeedRecord)
    .filter((seed) => !observed.has(seed.sourceId))
    .map((seed) => ({
      sourceId: seed.sourceId,
      sourceKind: seed.sourceKind ?? null,
      filterCount: seed.filters.length,
      filters: seed.filters,
      stratum: stratumFor(seed.filters.length),
    }))
    .filter((seed) => seed.stratum !== null)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))

  const seen = new Set<string>()
  const uniqueEligible = eligible.filter((seed) => {
    const key = JSON.stringify(seed.filters)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const selected = HOLDOUT_STRATA.flatMap((stratum) =>
    uniqueEligible
      .filter((seed) => seed.stratum === stratum.id)
      .slice(0, HOLDOUTS_PER_STRATUM))

  const countsByStratum = Object.fromEntries(HOLDOUT_STRATA.map((stratum) => [
    stratum.id,
    uniqueEligible.filter((seed) => seed.stratum === stratum.id).length,
  ]))

  return {
    schemaVersion: 1,
    experimentVersion: 'storm-admission-holdout-inventory-v2',
    source: {
      artifact: 'mp-seeds/titan-to-storm-teacher-student.json',
      caseId: 'titan-to-storm',
    },
    selectionRule: {
      outcomeBlind: true,
      excludePreviouslyObservedSourceIds: [...PREVIOUSLY_OBSERVED_STORM_POLICY_IDS],
      deduplicateBy: 'exact-filter-payload',
      orderBy: ['sourceId-asc'],
      strata: HOLDOUT_STRATA,
      takePerStratum: HOLDOUTS_PER_STRATUM,
    },
    sourceSeedCount: seeds.length,
    uniqueEligibleCandidates: uniqueEligible.length,
    countsByStratum,
    selectedCount: selected.length,
    selected,
  }
}

export function runInventory() {
  const path = resolveCapacityRecoveryPath('mp-seeds/titan-to-storm-teacher-student.json')
  const bundle = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const report = buildStormHoldoutInventory(bundle)
  const outPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-admission-holdout-inventory-20260911/inventory-report.json',
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({
    sourceSeedCount: report.sourceSeedCount,
    uniqueEligibleCandidates: report.uniqueEligibleCandidates,
    countsByStratum: report.countsByStratum,
    selectedCount: report.selectedCount,
    selected: report.selected.map((seed) => ({
      sourceId: seed.sourceId,
      sourceKind: seed.sourceKind,
      filterCount: seed.filterCount,
      stratum: seed.stratum,
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runInventory()
}
