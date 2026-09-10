import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import type { Filter } from '../../src/types/filter.js'

import { loadLayeredResearchCases } from './corpus.js'
import { createSolverLabProblem, type SolverLabCandidateV1, type SolverLabEvaluationV1 } from './labProtocol.js'
import {
  aggregateGlobalSeedAllocationMetrics,
  freezeSeedPool,
  runEqualizedSeedAllocation,
  selectPrimarySeed,
  type EqualizedSeedAllocationResult,
  type GlobalSeedAllocationMetrics,
  type SeedAllocationOutcome,
  type SeedAllocationPerSeedResult,
  type SeedAllocationPoint,
  type SeedAllocationSeed,
} from './seedAllocation.js'
import { directedReferenceRegret, type ReferenceRegretPoint } from './referenceRegret.js'
import {
  getReferenceCell,
  assertOracleReferenceSnapshotV1,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import { runStructuralBeam, type StructuralBeamRunResult } from './structuralBeam.js'

export const STORM_SEED_ALLOCATION_EXPERIMENT_VERSION = 'storm-seed-allocation-causal-v2' as const
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
export const DEFAULT_SOURCE_REPORT = '.worktrees/capacity-aware-traversal-20260909/packages/core/.research-artifacts/mp-reallocation-corrective-20260909/storm-rerun1/tournament-report.json'
export const DEFAULT_SNAPSHOT = '/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json'
export const DEFAULT_OUTPUT = 'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8'
export const STORM_SEED_ALLOCATION_TARGET_DESCENDANTS = 8
export const STORM_SEED_ALLOCATION_DISTRIBUTED_SEEDS = 3
export const STORM_SEED_ALLOCATION_DEADLINE_MS = 60_000
export const STORM_SEED_ALLOCATION_CONFIG = Object.freeze({
  beamWidth: 2,
  proposalsPerParent: 4,
  localPolishEvaluations: 24,
  maxFilters: 10,
})
export const STORM_DIVERSITY_POLICY = Object.freeze({
  id: 'greedy-max-min-jaccard-v1',
  distance: 'semantic-key-token-set-jaccard',
})

export interface StormSeed extends SeedAllocationSeed {
  sourceCandidateId: string
  filters: Filter[]
}

interface DeadlineObservation {
  mode: 'cooperative'
  deadlineMs: number
  observedElapsedMs: number
  deadlineRespected: boolean
  cancelled: boolean
}

interface StormSeedPerSeedResult extends SeedAllocationPerSeedResult {
  sourceCandidateId: string
  origin: string
  semanticKey: string
  selectionKey: string
  canonicalEntryRmseDb: number
  canonicalEntryMaxAbsDb: number
  canonicalEntryFilterCount: number
  localParetoNovelDescendants: number
  localSelectedBestChanges: number
  localReferenceImprovements: number
  firstUsefulDescendantEvaluation: number | null
  descendantEvaluationsToBestResult: number | null
  stopReason: StructuralBeamRunResult['stopReason']
  deadline: DeadlineObservation
}

interface StormArm {
  primarySeedId: string
  frozenSeedPoolSha256: string
  seedIds: string[]
  allocations: Array<{ seedId: string; descendantWorkTarget: number }>
  seedValidationEvaluations: number
  descendantProposalEvaluations: number
  totalStructuralCandidateEvaluations: number
  perSeed: StormSeedPerSeedResult[]
  global: GlobalSeedAllocationMetrics
  globalParetoNovelDescendants: number
  globalParetoNovelAgainstSeedBaselines: number
  globalParetoNovelDescendantsOnly: number
  globalSelectedBestChanges: number
  globalReferenceImprovements: number
}

export interface StormSeedAllocationArtifact {
  schemaVersion: 2
  experimentVersion: typeof STORM_SEED_ALLOCATION_EXPERIMENT_VERSION
  /** Producer commit embedded in the source report, or null when unproven. */
  sourceCommit: string | null
  sourceReportPath: string
  sourceReportSha256: string
  referenceSnapshotPath: string
  referenceSnapshotSha256: string
  problemId: 'titan-to-storm'
  frozenSeedPoolSha256: string
  frozenSeedPool: StormSeed[]
  primarySeedId: string
  alternateSeedIds: string[]
  diversityPolicy: typeof STORM_DIVERSITY_POLICY & { alternateCount: number }
  structuralConfig: typeof STORM_SEED_ALLOCATION_CONFIG
  targetDescendantEvaluations: number
  seedValidationOverhead: {
    concentrated: number
    distributed: number
    distributedMinusConcentrated: number
  }
  controls: {
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    frozenReferenceSnapshotSha256: string
    frozenSelector: 'reference-selector-v1'
    deadlineMode: 'cooperative'
    deadlineMs: number
  }
  concentrated: StormArm & { concentratedSeedId: string }
  distributed: StormArm
  equalization: {
    status: 'equalized' | 'not-equalized'
    causalClaimAllowed: boolean
    reason: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`)
  return value
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('cannot serialize undefined')
  return serialized
}

function sha256Pool(pool: readonly StormSeed[]): string {
  return createHash('sha256').update(canonicalJson(pool)).digest('hex')
}

export function resolveResearchPath(path: string): string {
  requiredString(path, 'research path')
  return isAbsolute(path) ? resolve(path) : resolve(PROJECT_ROOT, path)
}

function semanticKey(filters: readonly Filter[]): string {
  return JSON.stringify(filters
    .map(({ id: _id, ...filter }) => filter)
    .sort((left, right) => left.type.localeCompare(right.type) ||
      left.frequencyHz - right.frequencyHz || left.gainDb - right.gainDb ||
      left.q - right.q || Number(left.enabled) - Number(right.enabled)))
}

function references(snapshot: OracleReferenceSnapshotV1, problemId: string, inputSha256: string): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problemId, inputSha256, 10)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error(`reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function cloneFilter(value: unknown, label: string): Filter {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const type = value.type
  if (type !== 'LS' && type !== 'PK' && type !== 'HS') throw new Error(`${label}.type is invalid`)
  const id = requiredString(value.id, `${label}.id`)
  const enabled = value.enabled
  const frequencyHz = value.frequencyHz
  const gainDb = value.gainDb
  const q = value.q
  if (typeof enabled !== 'boolean' || typeof frequencyHz !== 'number' || !Number.isFinite(frequencyHz) ||
    typeof gainDb !== 'number' || !Number.isFinite(gainDb) || typeof q !== 'number' || !Number.isFinite(q)) {
    throw new Error(`${label} contains invalid filter values`)
  }
  return { id, enabled, type, frequencyHz, gainDb, q }
}

function sourceRuns(source: unknown): Record<string, unknown>[] {
  if (!isRecord(source) || !Array.isArray(source.runs)) throw new Error('source report must contain runs')
  return source.runs.filter(isRecord)
}

export function freezeStormSeeds(source: unknown): StormSeed[] {
  const run = sourceRuns(source).find((entry) => entry.variantId === 'matching-pursuit-selection-beam-v2')
  if (run === undefined) throw new Error('source report lacks selection-beam Storm provenance')
  if (!Array.isArray(run.researchTrace) || !Array.isArray(run.progressTrace)) {
    throw new Error('selection-beam source report lacks telemetry and progress traces')
  }
  const progressByCandidateId = new Map<string, Record<string, unknown>>()
  for (const value of run.progressTrace) {
    if (!isRecord(value) || typeof value.candidateId !== 'string' || progressByCandidateId.has(value.candidateId)) continue
    progressByCandidateId.set(value.candidateId, value)
  }
  const seen = new Set<string>()
  const candidates: StormSeed[] = []
  for (const value of run.researchTrace) {
    if (!isRecord(value) || value.component !== 'matching-pursuit-v1' || value.phase === 'baseline' ||
      value.selectedChange !== true || value.paretoNovel !== true || typeof value.candidateId !== 'string' ||
      seen.has(value.candidateId)) continue
    seen.add(value.candidateId)
    const point = progressByCandidateId.get(value.candidateId)
    if (point === undefined) throw new Error(`selection-beam seed lacks progress point: ${value.candidateId}`)
    if (!Array.isArray(point.filters) || point.filters.length === 0) continue
    const selectionKey = requiredString(value.selectionKey, `selection key for ${value.candidateId}`)
    const filters = point.filters.map((filter, index) => cloneFilter(filter, `filters[${index}]`))
    const rmse = point.canonicalRmseDb
    const maxAbs = point.canonicalMaxAbsDb
    if (typeof rmse !== 'number' || !Number.isFinite(rmse) || typeof maxAbs !== 'number' || !Number.isFinite(maxAbs)) {
      throw new Error(`selection-beam seed has invalid entry metrics: ${value.candidateId}`)
    }
    candidates.push({
      seedId: value.candidateId,
      sourceCandidateId: value.candidateId,
      origin: 'matching-pursuit-selection-beam-v2',
      semanticKey: semanticKey(filters),
      selectionKey,
      canonicalRmseDb: rmse,
      canonicalMaxAbsDb: maxAbs,
      canonicalFilterCount: typeof point.actualDeliveredFilterCount === 'number'
        ? point.actualDeliveredFilterCount : filters.length,
      canonicalCandidateId: value.candidateId,
      filters,
    })
  }
  if (candidates.length === 0) throw new Error('selection-beam source report has no eligible Storm seeds')
  return freezeSeedPool(candidates)
}

function pointFromEvaluation(
  candidate: SolverLabCandidateV1,
  evaluation: SolverLabEvaluationV1,
  referencesForRun: readonly ReferenceRegretPoint[],
  phase: SeedAllocationPoint['phase'],
  pointCandidateId = candidate.candidateId,
): SeedAllocationPoint {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`structural beam candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const delivered = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId: pointCandidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
  }, referencesForRun)
  return {
    candidateId: pointCandidateId,
    canonicalRmseDb: delivered.rmseDb,
    canonicalMaxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
    directedReferenceRegretV1: regret.regret,
    referenceImproved: regret.referenceImproved,
    phase,
  }
}

interface SeedRunDetail {
  outcome: SeedAllocationOutcome
  detail: StormSeedPerSeedResult
}

function runStormSeed(
  seed: StormSeed,
  descendantWorkTarget: number,
  problem: ReturnType<typeof createSolverLabProblem>,
  referencesForRun: readonly ReferenceRegretPoint[],
  snapshot: OracleReferenceSnapshotV1,
): SeedRunDetail {
  const startedAt = performance.now()
  const nowMs = () => performance.now()
  const deadline = () => nowMs() - startedAt >= STORM_SEED_ALLOCATION_DEADLINE_MS
  const structural = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: descendantWorkTarget + 1,
    referenceSnapshotSha256: snapshot.contentSha256,
    referenceFrontier: referencesForRun,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{ seedId: seed.seedId, origin: 'matching-pursuit', filters: seed.filters }],
    nowMs,
    elapsedMs: () => nowMs() - startedAt,
    isExpired: deadline,
  })
  if (structural.candidates.length === 0 || structural.evaluations.length === 0) {
    throw new Error(`structural beam did not validate seed ${seed.seedId}`)
  }
  const seedValidationPoints = [pointFromEvaluation(
    structural.candidates[0]!, structural.evaluations[0]!, referencesForRun, 'seed-validation',
    `${seed.seedId}:${structural.candidates[0]!.candidateId}`,
  )]
  const descendantPoints = structural.candidates.slice(1).map((candidate, index) =>
    pointFromEvaluation(
      candidate,
      structural.evaluations[index + 1]!,
      referencesForRun,
      'descendant',
      `${seed.seedId}:${candidate.candidateId}`,
    ))
  const local = aggregateGlobalSeedAllocationMetrics(seedValidationPoints, descendantPoints)
  const observedElapsedMs = Math.max(0, nowMs() - startedAt)
  const deadlineObservation: DeadlineObservation = {
    mode: 'cooperative',
    deadlineMs: STORM_SEED_ALLOCATION_DEADLINE_MS,
    observedElapsedMs,
    deadlineRespected: observedElapsedMs <= STORM_SEED_ALLOCATION_DEADLINE_MS,
    cancelled: false,
  }
  const outcome: SeedAllocationOutcome = {
    seedId: seed.seedId,
    seedValidationEvaluations: 1,
    descendantProposalEvaluations: descendantPoints.length,
    totalStructuralCandidateEvaluations: structural.candidates.length,
    descendantsProduced: descendantPoints.length,
    seedValidationPoints,
    descendantPoints,
  }
  const detail: StormSeedPerSeedResult = {
    ...outcome,
    seedId: seed.seedId,
    descendantWorkTarget,
    sourceCandidateId: seed.sourceCandidateId,
    origin: seed.origin,
    semanticKey: seed.semanticKey,
    selectionKey: seed.selectionKey,
    canonicalEntryRmseDb: seed.canonicalRmseDb,
    canonicalEntryMaxAbsDb: seed.canonicalMaxAbsDb,
    canonicalEntryFilterCount: seed.canonicalFilterCount ?? seed.filters.length,
    localParetoNovelDescendants: local.paretoNovelDescendants,
    localSelectedBestChanges: local.selectedBestChanges,
    localReferenceImprovements: local.referenceImprovements,
    firstUsefulDescendantEvaluation: local.firstUsefulDescendantEvaluation,
    descendantEvaluationsToBestResult: local.descendantEvaluationsToBestResult,
    stopReason: structural.stopReason,
    deadline: deadlineObservation,
  }
  return { outcome, detail }
}

function detailForArm(
  result: EqualizedSeedAllocationResult<StormSeed>['concentrated'] | EqualizedSeedAllocationResult<StormSeed>['distributed'],
  details: Map<string, SeedRunDetail[]>,
  poolHash: string,
  primarySeedId: string,
): StormArm {
  const perSeed = result.perSeed.map((entry) => {
    const key = `${entry.seedId}:${entry.descendantWorkTarget}`
    const queued = details.get(key)
    if (queued === undefined || queued.length === 0) throw new Error(`missing Storm seed detail for ${key}`)
    return queued.shift()!.detail
  })
  return {
    primarySeedId,
    frozenSeedPoolSha256: poolHash,
    seedIds: perSeed.map((entry) => entry.seedId),
    allocations: result.allocations.map((allocation) => ({ ...allocation })),
    seedValidationEvaluations: result.seedValidationEvaluations,
    descendantProposalEvaluations: result.descendantProposalEvaluations,
    totalStructuralCandidateEvaluations: result.totalStructuralCandidateEvaluations,
    perSeed,
    global: result.global,
    globalParetoNovelDescendants: result.globalParetoNovelDescendants,
    globalParetoNovelAgainstSeedBaselines: result.globalParetoNovelAgainstSeedBaselines,
    globalParetoNovelDescendantsOnly: result.globalParetoNovelDescendantsOnly,
    globalSelectedBestChanges: result.globalSelectedBestChanges,
    globalReferenceImprovements: result.globalReferenceImprovements,
  }
}

function equalizationFromResult(
  result: EqualizedSeedAllocationResult<StormSeed>,
): StormSeedAllocationArtifact['equalization'] {
  return result.equalization
}

function validateHash(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 hex digest`)
}

function validateArm(value: unknown, label: string, primarySeedId: string, poolHash: string, target: number): asserts value is StormArm {
  if (!isRecord(value)) throw new Error(`${label} arm must be an object`)
  if (value.primarySeedId !== primarySeedId) throw new Error(`${label} arm primary seed does not match canonical primary`)
  if (value.frozenSeedPoolSha256 !== poolHash) throw new Error(`${label} arm frozen pool provenance does not match`)
  if (!Array.isArray(value.seedIds) || !Array.isArray(value.allocations) || !Array.isArray(value.perSeed)) {
    throw new Error(`${label} arm must include seed IDs, allocations, and per-seed results`)
  }
  for (const [key, minimum] of [
    ['seedValidationEvaluations', 0], ['descendantProposalEvaluations', 0], ['totalStructuralCandidateEvaluations', 0],
  ] as const) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < minimum) throw new Error(`${label}.${key} is invalid`)
  }
  if (Number(value.totalStructuralCandidateEvaluations) !==
    Number(value.seedValidationEvaluations) + Number(value.descendantProposalEvaluations)) {
    throw new Error(`${label} total structural candidate evaluations do not reconcile`)
  }
  if (value.seedIds.length !== value.allocations.length || value.seedIds.length !== value.perSeed.length) {
    throw new Error(`${label} per-seed allocation cardinality does not reconcile`)
  }
  const seen = new Set<string>()
  for (const entry of value.perSeed) {
    if (!isRecord(entry) || typeof entry.seedId !== 'string' || seen.has(entry.seedId)) throw new Error(`${label} per-seed IDs are invalid`)
    seen.add(entry.seedId)
    if (!Number.isSafeInteger(entry.descendantWorkTarget) || Number(entry.descendantWorkTarget) <= 0) {
      throw new Error(`${label} per-seed descendant work target is invalid`)
    }
    if (!Number.isSafeInteger(entry.seedValidationEvaluations) || Number(entry.seedValidationEvaluations) <= 0 ||
      !Number.isSafeInteger(entry.descendantProposalEvaluations) || Number(entry.descendantProposalEvaluations) < 0 ||
      !Number.isSafeInteger(entry.descendantsProduced) || Number(entry.descendantsProduced) < 0) {
      throw new Error(`${label} per-seed counters are invalid`)
    }
    if (Number(entry.totalStructuralCandidateEvaluations) !== Number(entry.seedValidationEvaluations) + Number(entry.descendantProposalEvaluations)) {
      throw new Error(`${label} per-seed counters do not reconcile`)
    }
    if (Number(entry.descendantsProduced) > Number(entry.descendantProposalEvaluations)) {
      throw new Error(`${label} descendants produced exceeds descendant evaluations`)
    }
  }
  if (Number(value.descendantProposalEvaluations) !== target && label === 'concentrated') {
    // The distributed arm is checked together with the concentrated arm below.
    return
  }
  if (!isRecord(value.global) || !Array.isArray(value.global.globalParetoFrontier)) {
    throw new Error(`${label} global metrics are missing`)
  }
}

export function assertStormSeedAllocationArtifact(value: unknown): asserts value is StormSeedAllocationArtifact {
  if (!isRecord(value)) throw new Error('Storm seed-allocation artifact must be an object')
  if (value.schemaVersion !== 2) throw new Error('Storm seed-allocation artifact schemaVersion must be 2')
  if (value.experimentVersion !== STORM_SEED_ALLOCATION_EXPERIMENT_VERSION) throw new Error('Storm seed-allocation experiment version is invalid')
  if (value.problemId !== 'titan-to-storm') throw new Error('Storm seed-allocation artifact must be Storm-only')
  if (value.sourceCommit !== null && (typeof value.sourceCommit !== 'string' || value.sourceCommit.length === 0)) {
    throw new Error('sourceCommit must be a non-empty string or null')
  }
  requiredString(value.sourceReportPath, 'sourceReportPath')
  requiredString(value.referenceSnapshotPath, 'referenceSnapshotPath')
  validateHash(value.sourceReportSha256, 'sourceReportSha256')
  validateHash(value.referenceSnapshotSha256, 'referenceSnapshotSha256')
  validateHash(value.frozenSeedPoolSha256, 'frozenSeedPoolSha256')
  if (!Array.isArray(value.frozenSeedPool) || value.frozenSeedPool.length === 0) throw new Error('frozen pool is required')
  const primarySeedId = requiredString(value.primarySeedId, 'primary seed')
  if (!Array.isArray(value.alternateSeedIds) || value.alternateSeedIds.some((seedId) => typeof seedId !== 'string') || value.alternateSeedIds.includes(primarySeedId)) throw new Error('alternate seeds must exclude primary')
  const alternateSeedIds = value.alternateSeedIds as string[]
  if (!Number.isSafeInteger(value.targetDescendantEvaluations) || Number(value.targetDescendantEvaluations) <= 0) throw new Error('target descendant evaluations must be positive')
  if (!isRecord(value.controls) || value.controls.frozenReferenceSnapshotSha256 !== value.referenceSnapshotSha256 ||
    value.controls.frozenSelector !== 'reference-selector-v1' || value.controls.deadlineMode !== 'cooperative') {
    throw new Error('controlled reference/selector/deadline configuration is invalid')
  }
  if (!isRecord(value.diversityPolicy) || value.diversityPolicy.id !== STORM_DIVERSITY_POLICY.id) throw new Error('diversity policy is invalid')
  const poolHash = value.frozenSeedPoolSha256 as string
  validateArm(value.concentrated, 'concentrated', primarySeedId, poolHash, Number(value.targetDescendantEvaluations))
  validateArm(value.distributed, 'distributed', primarySeedId, poolHash, Number(value.targetDescendantEvaluations))
  const concentrated = value.concentrated as StormArm
  const distributed = value.distributed as StormArm
  if (!concentrated.seedIds.includes(primarySeedId)) throw new Error('concentrated arm must include primary')
  if (!distributed.seedIds.includes(primarySeedId)) throw new Error('distributed arm must include primary')
  if (distributed.seedIds.some((seedId) => !alternateSeedIds.includes(seedId) && seedId !== primarySeedId)) {
    throw new Error('distributed arm contains a seed outside the frozen diversity selection')
  }
  const equalized = value.equalization
  if (!isRecord(equalized) || (equalized.status !== 'equalized' && equalized.status !== 'not-equalized') || typeof equalized.causalClaimAllowed !== 'boolean') {
    throw new Error('equalization classification is invalid')
  }
  const exact = concentrated.descendantProposalEvaluations === Number(value.targetDescendantEvaluations) &&
    distributed.descendantProposalEvaluations === Number(value.targetDescendantEvaluations) &&
    concentrated.perSeed.every((entry) => entry.descendantProposalEvaluations === entry.descendantWorkTarget) &&
    distributed.perSeed.every((entry) => entry.descendantProposalEvaluations === entry.descendantWorkTarget)
  const exercised = distributed.perSeed.every((entry) => entry.descendantWorkTarget >= 1 && entry.descendantsProduced >= 1)
  if (equalized.status === 'equalized' && !exact) throw new Error('equalized artifact has unequal descendant work')
  if (equalized.status === 'not-equalized' && equalized.causalClaimAllowed) throw new Error('not-equalized artifact must forbid a causal claim')
  if (equalized.causalClaimAllowed && (!exact || !exercised)) throw new Error('causal claim requires exact and exercised descendant work')
}

export function runStormSeedAllocation(
  sourceReportPath = DEFAULT_SOURCE_REPORT,
  snapshotPath = DEFAULT_SNAPSHOT,
): StormSeedAllocationArtifact {
  const resolvedSource = resolveResearchPath(sourceReportPath)
  const resolvedSnapshot = resolveResearchPath(snapshotPath)
  const source: unknown = JSON.parse(readFileSync(resolvedSource, 'utf8'))
  const snapshot: unknown = JSON.parse(readFileSync(resolvedSnapshot, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshot)
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm research case is unavailable')
  const problem = createSolverLabProblem(researchCase, 10)
  const referencesForRun = references(snapshot, problem.problemId, problem.inputSha256)
  const pool = freezeStormSeeds(source)
  const frozenPool = freezeSeedPool(pool)
  const primary = selectPrimarySeed(frozenPool)
  const poolHash = sha256Pool(frozenPool)
  const details = new Map<string, SeedRunDetail[]>()
  const allocation = runEqualizedSeedAllocation({
    pool: frozenPool,
    targetDescendantEvaluations: STORM_SEED_ALLOCATION_TARGET_DESCENDANTS,
    distributedSeedCount: STORM_SEED_ALLOCATION_DISTRIBUTED_SEEDS,
    runSeed: ({ seed, descendantWorkTarget }) => {
      const run = runStormSeed(seed, descendantWorkTarget, problem, referencesForRun, snapshot)
      const key = `${seed.seedId}:${descendantWorkTarget}`
      const queue = details.get(key) ?? []
      queue.push(run)
      details.set(key, queue)
      return run.outcome
    },
  })
  const concentrated = detailForArm(allocation.concentrated, details, poolHash, primary.seedId)
  const distributed = detailForArm(allocation.distributed, details, poolHash, primary.seedId)
  const artifact: StormSeedAllocationArtifact = {
    schemaVersion: 2,
    experimentVersion: STORM_SEED_ALLOCATION_EXPERIMENT_VERSION,
    sourceCommit: isRecord(source) && typeof source.sourceCommit === 'string'
      ? source.sourceCommit : null,
    sourceReportPath: resolvedSource,
    sourceReportSha256: sha256File(resolvedSource),
    referenceSnapshotPath: resolvedSnapshot,
    referenceSnapshotSha256: snapshot.contentSha256,
    problemId: 'titan-to-storm',
    frozenSeedPoolSha256: poolHash,
    frozenSeedPool: frozenPool,
    primarySeedId: allocation.primarySeedId,
    alternateSeedIds: allocation.alternateSeedIds,
    diversityPolicy: { ...STORM_DIVERSITY_POLICY, alternateCount: allocation.alternateSeedIds.length },
    structuralConfig: STORM_SEED_ALLOCATION_CONFIG,
    targetDescendantEvaluations: STORM_SEED_ALLOCATION_TARGET_DESCENDANTS,
    seedValidationOverhead: {
      concentrated: concentrated.seedValidationEvaluations,
      distributed: distributed.seedValidationEvaluations,
      distributedMinusConcentrated: distributed.seedValidationEvaluations - concentrated.seedValidationEvaluations,
    },
    controls: {
      canonicalDeliveredEvaluation: 'canonical-delivered-v1',
      quantization: 'standard-v2-quantized',
      frozenReferenceSnapshotSha256: snapshot.contentSha256,
      frozenSelector: 'reference-selector-v1',
      deadlineMode: 'cooperative',
      deadlineMs: STORM_SEED_ALLOCATION_DEADLINE_MS,
    },
    concentrated: { ...concentrated, concentratedSeedId: allocation.primarySeedId },
    distributed,
    equalization: equalizationFromResult(allocation),
  }
  assertStormSeedAllocationArtifact(artifact)
  return artifact
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [output = DEFAULT_OUTPUT, source = DEFAULT_SOURCE_REPORT, snapshot = DEFAULT_SNAPSHOT] = args
  const artifact = runStormSeedAllocation(source, snapshot)
  const resolvedOutput = resolveResearchPath(output)
  mkdirSync(resolvedOutput, { recursive: true })
  writeFileSync(resolve(resolvedOutput, 'tournament-report.json'), `${JSON.stringify(artifact, null, 2)}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
