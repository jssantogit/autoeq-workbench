import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import { join } from 'node:path'

/**
 * Small, research-only JSONL runner.  It intentionally owns orchestration
 * state only; search policy and result interpretation remain in the existing
 * benchmark/oracle modules.
 */
export const RESEARCH_CAMPAIGN_SCHEMA_VERSION = 1 as const
export const RESEARCH_CAMPAIGN_HARNESS_VERSION = 'resource-envelope-generic-1' as const

export type ResearchCampaignRunStatus = 'completed' | 'failed' | 'skipped'

export interface ResearchCampaignCell {
  cellId: string
  caseId?: string
  experimentFamily?: string
  resourceEnvelope?: string | number
  repeatIndex?: number
  [key: string]: unknown
}

export interface ResearchCampaignManifestInput {
  gitCommit: string
  sourceIdentity?: string
  targetIdentity?: string
  corpusSchema?: string | number
  normalization?: unknown
  interpolation?: unknown
  preparation?: unknown
  evaluationGrid?: unknown
  sampleRateHz?: number
  structuralBounds?: unknown
  maxStructuralCapacity?: number
  effort?: unknown
  beamWidth?: number
  proposalsPerParent?: number
  polishEvaluations?: number
  stageQuantumMs?: number
  requestedHorizon?: unknown
  optimizerVersion?: string
  repeatIndex?: number
  schedulerPolicy?: string
  harnessVersion?: string
  finalMetrics?: unknown
  rawWorkCounters?: unknown
}

export interface ResearchCampaignManifest extends ResearchCampaignManifestInput {
  schemaVersion: typeof RESEARCH_CAMPAIGN_SCHEMA_VERSION
  harnessVersion: string
  identityHash: string
  createdAtIso: string
  runtime: {
    node: string
    platform: string
    arch: string
    cpuCount: number
  }
}

export interface ResearchCampaignRunRecord<T = unknown> {
  schemaVersion: typeof RESEARCH_CAMPAIGN_SCHEMA_VERSION
  manifestHash: string
  runId: string
  cell: ResearchCampaignCell
  status: ResearchCampaignRunStatus
  startedAtIso?: string
  completedAtIso: string
  result?: T
  error?: string
  skipReason?: string
}

export interface ResearchCampaignObservedRecord<T = unknown> extends ResearchCampaignRunRecord<T> {
  reused: boolean
}

export interface ResearchCampaignCellFilter {
  caseId?: string | readonly string[]
  experimentFamily?: string | readonly string[]
  resourceEnvelope?: string | number | readonly (string | number)[]
}

export interface ResearchCampaignRunnerOptions<T> {
  outputDir: string
  manifest: ResearchCampaignManifest
  cells: readonly ResearchCampaignCell[]
  filter?: ResearchCampaignCellFilter
  rerunFailed?: boolean
  rerunSkipped?: boolean
  skip?: (cell: ResearchCampaignCell) => string | undefined
  execute: (
    cell: ResearchCampaignCell,
    context: { runId: string; manifest: ResearchCampaignManifest },
  ) => T | Promise<T>
}

export interface ResearchCampaignExecution<T = unknown> {
  manifest: ResearchCampaignManifest
  records: ResearchCampaignObservedRecord<T>[]
  statuses: ResearchCampaignObservedRecord<T>[]
  aggregate: ResearchCampaignAggregate
  outputDir: string
}

export interface ResearchCampaignAggregate {
  total: number
  completed: number
  failed: number
  skipped: number
  reused: number
  byExperimentFamily: Record<string, {
    total: number
    completed: number
    failed: number
    skipped: number
  }>
}

interface RuntimeInfo {
  node: string
  platform: string
  arch: string
  cpuCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Stable JSON is used only for identity, never for timing or search order. */
export function stableResearchJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableResearchJson(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableResearchJson(record[key])}`)
    .join(',')}}`
}

function hashResearchIdentity(value: unknown): string {
  return createHash('sha256').update(stableResearchJson(value)).digest('hex')
}

function runtimeInfo(): RuntimeInfo {
  // Runtime details are provenance only and deliberately excluded from IDs.
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpus().length,
  }
}

export function createResearchCampaignManifest(
  input: ResearchCampaignManifestInput,
): ResearchCampaignManifest {
  const identity = {
    ...input,
    schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
    harnessVersion: input.harnessVersion ?? RESEARCH_CAMPAIGN_HARNESS_VERSION,
  }
  return {
    ...identity,
    identityHash: hashResearchIdentity(identity),
    createdAtIso: new Date().toISOString(),
    runtime: runtimeInfo(),
  }
}

export function deterministicResearchRunId(
  manifest: ResearchCampaignManifest,
  cell: ResearchCampaignCell,
): string {
  return hashResearchIdentity({ manifest: manifest.identityHash, cell }).slice(0, 16)
}

export function filterResearchCampaignCells(
  cells: readonly ResearchCampaignCell[],
  filter: ResearchCampaignCellFilter = {},
): ResearchCampaignCell[] {
  const matches = <T extends string | number>(value: T | undefined, expected: T | readonly T[] | undefined): boolean => {
    if (expected === undefined) return true
    return Array.isArray(expected) ? expected.includes(value as T) : value === expected
  }
  return cells.filter((cell) =>
    matches(cell.caseId, filter.caseId) &&
    matches(cell.experimentFamily, filter.experimentFamily) &&
    matches(cell.resourceEnvelope, filter.resourceEnvelope),
  )
}

function paths(outputDir: string): { manifest: string; runs: string } {
  return { manifest: join(outputDir, 'manifest.json'), runs: join(outputDir, 'runs.jsonl') }
}

export function readResearchCampaignManifest(path: string): ResearchCampaignManifest | undefined {
  if (!existsSync(path)) return undefined
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value) || value.schemaVersion !== RESEARCH_CAMPAIGN_SCHEMA_VERSION || typeof value.identityHash !== 'string') {
    throw new Error(`Invalid research campaign manifest: ${path}`)
  }
  return value as unknown as ResearchCampaignManifest
}

export function readResearchCampaignRecords<T = unknown>(path: string): ResearchCampaignRunRecord<T>[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, 'utf8')
  const records: ResearchCampaignRunRecord<T>[] = []
  for (const [lineIndex, line] of content.split('\n').entries()) {
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`Invalid research campaign JSONL at ${path}:${lineIndex + 1}`)
    }
    if (
      !isRecord(value) ||
      value.schemaVersion !== RESEARCH_CAMPAIGN_SCHEMA_VERSION ||
      typeof value.manifestHash !== 'string' ||
      typeof value.runId !== 'string' ||
      !isRecord(value.cell) ||
      typeof value.cell.cellId !== 'string' ||
      (value.status !== 'completed' && value.status !== 'failed' && value.status !== 'skipped')
    ) throw new Error(`Invalid research campaign record at ${path}:${lineIndex + 1}`)
    records.push(value as unknown as ResearchCampaignRunRecord<T>)
  }
  return records
}

function appendRecord<T>(path: string, record: ResearchCampaignRunRecord<T>): void {
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
}

function latestByRunId<T>(records: readonly ResearchCampaignRunRecord<T>[]): Map<string, ResearchCampaignRunRecord<T>> {
  const latest = new Map<string, ResearchCampaignRunRecord<T>>()
  for (const record of records) latest.set(record.runId, record)
  return latest
}

function observed<T>(record: ResearchCampaignRunRecord<T>, reused: boolean): ResearchCampaignObservedRecord<T> {
  return { ...record, reused }
}

export function aggregateResearchCampaignRecords(
  records: readonly Pick<ResearchCampaignRunRecord, 'status' | 'cell'>[] & { readonly reused?: boolean }[],
): ResearchCampaignAggregate {
  const aggregate: ResearchCampaignAggregate = {
    total: records.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    reused: 0,
    byExperimentFamily: {},
  }
  for (const record of records) {
    aggregate[record.status] += 1
    if ('reused' in record && record.reused === true) aggregate.reused += 1
    const family = record.cell.experimentFamily ?? 'unclassified'
    const familyAggregate = aggregate.byExperimentFamily[family] ??= {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    }
    familyAggregate.total += 1
    familyAggregate[record.status] += 1
  }
  return aggregate
}

export async function executeResumableResearchCampaign<T>(
  options: ResearchCampaignRunnerOptions<T>,
): Promise<ResearchCampaignExecution<T>> {
  if (new Set(options.cells.map((cell) => cell.cellId)).size !== options.cells.length) {
    throw new Error('Research campaign cells require unique cellId values')
  }
  mkdirSync(options.outputDir, { recursive: true })
  const filePaths = paths(options.outputDir)
  const previousManifest = readResearchCampaignManifest(filePaths.manifest)
  if (previousManifest !== undefined && previousManifest.identityHash !== options.manifest.identityHash) {
    throw new Error('Research campaign manifest identity does not match existing output')
  }
  if (previousManifest === undefined) writeFileSync(filePaths.manifest, `${JSON.stringify(options.manifest, null, 2)}\n`, 'utf8')

  const priorRecords = readResearchCampaignRecords<T>(filePaths.runs)
  const priorByRunId = latestByRunId(priorRecords)
  const selected = new Set(filterResearchCampaignCells(options.cells, options.filter).map((cell) => cell.cellId))
  const records: ResearchCampaignObservedRecord<T>[] = []
  const statuses: ResearchCampaignObservedRecord<T>[] = []

  for (const cell of options.cells) {
    const runId = deterministicResearchRunId(options.manifest, cell)
    const previous = priorByRunId.get(runId)
    if (!selected.has(cell.cellId)) {
      statuses.push(observed({
        schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
        manifestHash: options.manifest.identityHash,
        runId,
        cell,
        status: 'skipped',
        completedAtIso: new Date().toISOString(),
        skipReason: 'filtered-out',
      }, true))
      continue
    }
    if (previous !== undefined && (
      previous.status === 'completed' ||
      (previous.status === 'failed' && !options.rerunFailed) ||
      (previous.status === 'skipped' && !options.rerunSkipped)
    )) {
      const reusedRecord = observed(previous, true)
      records.push(reusedRecord)
      statuses.push(reusedRecord)
      continue
    }

    const skipReason = options.skip?.(cell)
    if (skipReason !== undefined) {
      const skipped: ResearchCampaignRunRecord<T> = {
        schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
        manifestHash: options.manifest.identityHash,
        runId,
        cell,
        status: 'skipped',
        completedAtIso: new Date().toISOString(),
        skipReason,
      }
      appendRecord(filePaths.runs, skipped)
      const result = observed(skipped, false)
      records.push(result)
      statuses.push(result)
      continue
    }

    const startedAtIso = new Date().toISOString()
    try {
      const resultValue = await options.execute(cell, { runId, manifest: options.manifest })
      const completed: ResearchCampaignRunRecord<T> = {
        schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
        manifestHash: options.manifest.identityHash,
        runId,
        cell,
        status: 'completed',
        startedAtIso,
        completedAtIso: new Date().toISOString(),
        result: resultValue,
      }
      appendRecord(filePaths.runs, completed)
      const result = observed(completed, false)
      records.push(result)
      statuses.push(result)
    } catch (error: unknown) {
      const failed: ResearchCampaignRunRecord<T> = {
        schemaVersion: RESEARCH_CAMPAIGN_SCHEMA_VERSION,
        manifestHash: options.manifest.identityHash,
        runId,
        cell,
        status: 'failed',
        startedAtIso,
        completedAtIso: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }
      appendRecord(filePaths.runs, failed)
      const result = observed(failed, false)
      records.push(result)
      statuses.push(result)
    }
  }

  return {
    manifest: options.manifest,
    records,
    statuses,
    aggregate: aggregateResearchCampaignRecords(statuses),
    outputDir: options.outputDir,
  }
}
