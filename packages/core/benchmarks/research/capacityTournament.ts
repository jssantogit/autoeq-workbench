import { performance } from 'node:perf_hooks'

import type { Filter } from '../../src/types/filter.js'

import {
  assertSolverRunArtifactV1,
  type SolverTrajectoryPointV1,
} from './solverRunArtifact.js'
import { computeQualityTimeFrontier } from './qualityTime.js'

export const CAPACITY_TOURNAMENT_CHECKPOINTS_MS = [5_000, 15_000, 30_000, 60_000] as const
export const CAPACITY_TOURNAMENT_CASES = [
  'titan-to-storm',
  'titan-to-u12t',
  'titan-to-trio',
] as const
export const CAPACITY_TOURNAMENT_MAX_FILTERS = 10 as const
export const CAPACITY_TOURNAMENT_APPROVED_VARIANT_IDS = [
  'resumable-beam-v1',
  'state-bank-v1',
  'matching-pursuit-v1',
  'structural-beam-v1',
] as const
export const CAPACITY_TOURNAMENT_SCHEMA_VERSION = 1 as const

export type CapacityTournamentCaseId = (typeof CAPACITY_TOURNAMENT_CASES)[number]
export type CapacityTournamentVariantId = (typeof CAPACITY_TOURNAMENT_APPROVED_VARIANT_IDS)[number]
export type CapacityTournamentTerminationReason = 'target-reached' | 'converged' | 'time-limit'

export interface CapacityTournamentCaseInput {
  problemId: CapacityTournamentCaseId
  inputSha256: string
  maxFilters: 10
  referenceSnapshotSha256: string
  seed: number | null
}

export interface CapacityTournamentProgressPointV1 extends SolverTrajectoryPointV1 {
  filters: Filter[]
  metricSource: 'canonical-delivered-v1'
}

export interface CapacityTournamentExecutionContext {
  problemId: CapacityTournamentCaseId
  inputSha256: string
  maxFilters: 10
  referenceSnapshotSha256: string
  seed: number | null
  checkpointsMs: readonly number[]
  deadlineMs: 60_000
  nowMs: () => number
  isExpired: () => boolean
  report: (point: CapacityTournamentProgressPointV1) => void
}

export interface CapacityTournamentExecutionResult {
  terminationReason: CapacityTournamentTerminationReason
  metadata: Record<string, string | number | boolean>
}

export interface CapacityTournamentVariant {
  algorithmId: string
  variantId: CapacityTournamentVariantId
  run: (context: CapacityTournamentExecutionContext) => CapacityTournamentExecutionResult
}

export interface CapacityTournamentCheckpointV1 extends SolverTrajectoryPointV1 {
  checkpointMs: number
  filters: Filter[]
  metricSource: 'canonical-delivered-v1'
}

export interface CapacityTournamentRunV1 {
  schemaVersion: 1
  algorithmId: string
  variantId: CapacityTournamentVariantId
  problemId: CapacityTournamentCaseId
  inputSha256: string
  maxFilters: 10
  referenceSnapshotSha256: string
  seed: number | null
  checkpoints: CapacityTournamentCheckpointV1[]
  qualityTimeFrontierV1: number
  termination: {
    reason: CapacityTournamentTerminationReason
    deadlineMs: 60_000
    observedElapsedMs: number
    deadlineRespected: true
  }
  metadata: Record<string, string | number | boolean>
}

export interface CapacityTournamentResultV1 {
  schemaVersion: 1
  program: 'autoeq-capacity-aware-solver'
  maxFilters: 10
  checkpointsMs: readonly [5_000, 15_000, 30_000, 60_000]
  runs: CapacityTournamentRunV1[]
}

export interface CapacityTournamentInput {
  cases: readonly CapacityTournamentCaseInput[]
  variants: readonly CapacityTournamentVariant[]
  shortlistedVariantIds: readonly CapacityTournamentVariantId[]
  checkpointsMs?: readonly number[]
  nowMs?: () => number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 hex digest`)
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function assertInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`)
  }
}

function assertCheckpoints(checkpoints: readonly number[]): asserts checkpoints is readonly [5_000, 15_000, 30_000, 60_000] {
  if (JSON.stringify([...checkpoints]) !== JSON.stringify([...CAPACITY_TOURNAMENT_CHECKPOINTS_MS])) {
    throw new Error('capacity tournament checkpoints must be exactly 5000,15000,30000,60000 ms')
  }
}

function assertCase(input: CapacityTournamentCaseInput): void {
  if (!CAPACITY_TOURNAMENT_CASES.includes(input.problemId)) {
    throw new Error(`capacity tournament case is not approved: ${input.problemId}`)
  }
  assertSha256(input.inputSha256, 'inputSha256')
  assertSha256(input.referenceSnapshotSha256, 'referenceSnapshotSha256')
  if (input.maxFilters !== CAPACITY_TOURNAMENT_MAX_FILTERS) {
    throw new Error('capacity tournament is fixed to Max10')
  }
  if (input.seed !== null) assertInteger(input.seed, 'seed')
}

function assertMetadata(metadata: unknown): asserts metadata is Record<string, string | number | boolean> {
  if (!isRecord(metadata)) throw new Error('capacity tournament metadata must be an object')
  for (const [key, value] of Object.entries(metadata)) {
    if (key.length === 0 || (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error('capacity tournament metadata values must be finite scalar values')
    }
  }
}

function assertFilter(filter: Filter, label: string): void {
  if (
    typeof filter.id !== 'string' || filter.id.length === 0 ||
    typeof filter.enabled !== 'boolean' ||
    (filter.type !== 'PK' && filter.type !== 'LS' && filter.type !== 'HS')
  ) {
    throw new Error(`${label} has an invalid identity or type`)
  }
  assertFinite(filter.frequencyHz, `${label}.frequencyHz`)
  assertFinite(filter.gainDb, `${label}.gainDb`)
  assertFinite(filter.q, `${label}.q`)
}

function assertProgressPoint(
  point: CapacityTournamentProgressPointV1,
  index: number,
): void {
  const label = `capacity tournament progress[${index}]`
  if (!isRecord(point)) throw new Error(`${label} must be an object`)
  if (point.metricSource !== 'canonical-delivered-v1') {
    throw new Error(`${label} must use canonical delivered metrics`)
  }
  if (typeof point.candidateId !== 'string' || point.candidateId.length === 0) {
    throw new Error(`${label}.candidateId is required`)
  }
  assertInteger(point.evaluationCount, `${label}.evaluationCount`)
  assertFinite(point.elapsedMs, `${label}.elapsedMs`)
  if (point.elapsedMs < 0 || point.elapsedMs > 60_000) {
    throw new Error(`${label}.elapsedMs exceeds the hard deadline`)
  }
  assertInteger(point.actualDeliveredFilterCount, `${label}.actualDeliveredFilterCount`)
  if (point.actualDeliveredFilterCount > CAPACITY_TOURNAMENT_MAX_FILTERS) {
    throw new Error(`${label}.actualDeliveredFilterCount exceeds Max10`)
  }
  assertFinite(point.canonicalRmseDb, `${label}.canonicalRmseDb`)
  assertFinite(point.canonicalMaxAbsDb, `${label}.canonicalMaxAbsDb`)
  assertFinite(point.referenceRegret, `${label}.referenceRegret`)
  if (point.referenceRegret < 0 || typeof point.referenceImproved !== 'boolean') {
    throw new Error(`${label} has invalid reference evidence`)
  }
  if (!Array.isArray(point.filters) || point.filters.length !== point.actualDeliveredFilterCount) {
    throw new Error(`${label}.filters must match the actual delivered filter count`)
  }
  point.filters.forEach((filter, filterIndex) => assertFilter(filter, `${label}.filters[${filterIndex}]`))
}

function validateBestSoFar(
  input: CapacityTournamentCaseInput,
  variant: CapacityTournamentVariant,
  progress: readonly CapacityTournamentProgressPointV1[],
): void {
  const trajectory: SolverTrajectoryPointV1[] = progress.map((point) => ({
    evaluationCount: point.evaluationCount,
    elapsedMs: point.elapsedMs,
    candidateId: point.candidateId,
    actualDeliveredFilterCount: point.actualDeliveredFilterCount,
    canonicalRmseDb: point.canonicalRmseDb,
    canonicalMaxAbsDb: point.canonicalMaxAbsDb,
    referenceRegret: point.referenceRegret,
    referenceImproved: point.referenceImproved,
  }))
  const finalEvaluationCount = Math.max(1, trajectory.at(-1)!.evaluationCount)
  assertSolverRunArtifactV1({
    schemaVersion: 1,
    algorithmId: variant.algorithmId,
    variantId: variant.variantId,
    problemId: input.problemId,
    inputSha256: input.inputSha256,
    maxFilters: input.maxFilters,
    referenceSnapshotSha256: input.referenceSnapshotSha256,
    seed: input.seed,
    evaluationBudget: finalEvaluationCount,
    trajectory,
    qualityTimeFrontierV1: null,
    metadata: {},
  })
}

function checkpointFromPoint(
  point: CapacityTournamentProgressPointV1,
  checkpointMs: number,
): CapacityTournamentCheckpointV1 {
  return {
    checkpointMs,
    evaluationCount: point.evaluationCount,
    elapsedMs: point.elapsedMs,
    candidateId: point.candidateId,
    actualDeliveredFilterCount: point.actualDeliveredFilterCount,
    canonicalRmseDb: point.canonicalRmseDb,
    canonicalMaxAbsDb: point.canonicalMaxAbsDb,
    referenceRegret: point.referenceRegret,
    referenceImproved: point.referenceImproved,
    filters: point.filters.map((filter) => ({ ...filter })),
    metricSource: point.metricSource,
  }
}

export function runCapacityTournamentVariant(
  input: CapacityTournamentCaseInput,
  variant: CapacityTournamentVariant,
  checkpointsMs: readonly number[] = CAPACITY_TOURNAMENT_CHECKPOINTS_MS,
  nowMs: () => number = () => performance.now(),
): CapacityTournamentRunV1 {
  assertCase(input)
  assertCheckpoints(checkpointsMs)
  if (!CAPACITY_TOURNAMENT_APPROVED_VARIANT_IDS.includes(variant.variantId)) {
    throw new Error(`variant is not an approved Task 12 survivor ID: ${variant.variantId}`)
  }
  if (variant.algorithmId.length === 0) throw new Error('capacity tournament algorithmId is required')

  const startedAt = nowMs()
  assertFinite(startedAt, 'tournament start time')
  const progress: CapacityTournamentProgressPointV1[] = []
  const context: CapacityTournamentExecutionContext = {
    ...input,
    checkpointsMs,
    deadlineMs: 60_000,
    nowMs,
    isExpired: () => nowMs() - startedAt >= 60_000,
    report: (point) => {
      assertProgressPoint(point, progress.length)
      const previous = progress.at(-1)
      if (previous !== undefined) {
        if (point.evaluationCount < previous.evaluationCount) {
          throw new Error('capacity tournament evaluation count must be nondecreasing')
        }
        if (point.elapsedMs < previous.elapsedMs) {
          throw new Error('capacity tournament elapsed time must be nondecreasing')
        }
      }
      progress.push({
        ...point,
        filters: point.filters.map((filter) => ({ ...filter })),
      })
    },
  }
  const execution = variant.run(context)
  assertMetadata(execution.metadata)
  if (
    execution.terminationReason !== 'target-reached' &&
    execution.terminationReason !== 'converged' &&
    execution.terminationReason !== 'time-limit'
  ) {
    throw new Error('capacity tournament termination reason is invalid')
  }
  const observedElapsedMs = nowMs() - startedAt
  assertFinite(observedElapsedMs, 'tournament elapsed time')
  if (observedElapsedMs < 0 || observedElapsedMs > 60_000) {
    throw new Error('capacity tournament variant exceeded the hard deadline')
  }
  if (progress.length === 0) throw new Error('capacity tournament variant must report an initial canonical point')
  validateBestSoFar(input, variant, progress)
  const checkpoints = checkpointsMs.map((checkpointMs) => {
    const point = progress.filter((candidate) => candidate.elapsedMs <= checkpointMs).at(-1)
    if (point === undefined) {
      throw new Error(`capacity tournament has no point at or before ${checkpointMs} ms checkpoint`)
    }
    return checkpointFromPoint(point, checkpointMs)
  })
  const qualityTimeFrontierV1 = computeQualityTimeFrontier(progress.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  })))
  return {
    schemaVersion: 1,
    algorithmId: variant.algorithmId,
    variantId: variant.variantId,
    problemId: input.problemId,
    inputSha256: input.inputSha256,
    maxFilters: input.maxFilters,
    referenceSnapshotSha256: input.referenceSnapshotSha256,
    seed: input.seed,
    checkpoints,
    qualityTimeFrontierV1,
    termination: {
      reason: execution.terminationReason,
      deadlineMs: 60_000,
      observedElapsedMs,
      deadlineRespected: true,
    },
    metadata: {
      ...execution.metadata,
      runner: 'node-ts-capacity-tournament-v1',
      metricSource: 'canonical-delivered-v1',
      checkpointCount: checkpoints.length,
    },
  }
}

export function runCapacityTournament(input: CapacityTournamentInput): CapacityTournamentResultV1 {
  const checkpointsMs = input.checkpointsMs ?? CAPACITY_TOURNAMENT_CHECKPOINTS_MS
  assertCheckpoints(checkpointsMs)
  if (input.cases.length === 0) throw new Error('capacity tournament requires at least one case')
  if (input.variants.length === 0) throw new Error('capacity tournament requires at least one variant')
  const shortlisted = new Set(input.shortlistedVariantIds)
  if (shortlisted.size !== input.shortlistedVariantIds.length) {
    throw new Error('capacity tournament shortlisted variant IDs must be unique')
  }
  const variantIds = new Set<string>()
  input.variants.forEach((variant) => {
    if (variantIds.has(variant.variantId)) throw new Error(`duplicate capacity tournament variant: ${variant.variantId}`)
    variantIds.add(variant.variantId)
    if (!shortlisted.has(variant.variantId)) {
      throw new Error(`variant is not an approved Task 12 survivor: ${variant.variantId}`)
    }
  })
  const caseIds = new Set<string>()
  input.cases.forEach((caseInput) => {
    if (caseIds.has(caseInput.problemId)) throw new Error(`duplicate capacity tournament case: ${caseInput.problemId}`)
    caseIds.add(caseInput.problemId)
    assertCase(caseInput)
  })
  const runs: CapacityTournamentRunV1[] = []
  for (const caseInput of input.cases) {
    for (const variant of input.variants) {
      runs.push(runCapacityTournamentVariant(caseInput, variant, checkpointsMs, input.nowMs))
    }
  }
  return {
    schemaVersion: CAPACITY_TOURNAMENT_SCHEMA_VERSION,
    program: 'autoeq-capacity-aware-solver',
    maxFilters: CAPACITY_TOURNAMENT_MAX_FILTERS,
    checkpointsMs: CAPACITY_TOURNAMENT_CHECKPOINTS_MS,
    runs,
  }
}
