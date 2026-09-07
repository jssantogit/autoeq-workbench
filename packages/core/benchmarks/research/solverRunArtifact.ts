import { createHash } from 'node:crypto'

import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'

export const SOLVER_RUN_ARTIFACT_SCHEMA_VERSION = 1 as const

export interface SolverTrajectoryPointV1 {
  evaluationCount: number
  elapsedMs: number
  candidateId: string
  actualDeliveredFilterCount: number
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  referenceRegret: number
  referenceImproved: boolean
}

export interface SolverRunArtifactV1 {
  schemaVersion: 1
  algorithmId: string
  variantId: string
  problemId: string
  inputSha256: string
  maxFilters: number
  referenceSnapshotSha256: string
  seed: number | null
  evaluationBudget: number
  trajectory: SolverTrajectoryPointV1[]
  qualityTimeFrontierV1: number | null
  metadata: Record<string, string | number | boolean>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label + ' is required')
  return value
}

function sha256(value: unknown, label: string): string {
  const text = requiredString(value, label)
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(label + ' must be a SHA-256 hex digest')
  return text
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + ' must be finite')
  return value
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(label + ' must be an integer >= ' + minimum)
  }
  return value as number
}

function pointSelectorValue(point: SolverTrajectoryPointV1): SelectorPoint {
  return {
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    cancellationScore: 0,
  }
}

function dominates(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  const epsilon = 1e-12
  return left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (
      left.canonicalRmseDb < right.canonicalRmseDb - epsilon ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon
    )
}

function canReplace(current: SolverTrajectoryPointV1, candidate: SolverTrajectoryPointV1): boolean {
  if (dominates(candidate, current)) return true
  const currentPoint = pointSelectorValue(current)
  const candidatePoint = pointSelectorValue(candidate)
  const nondominated = dominates(current, candidate)
    ? [currentPoint]
    : dominates(candidate, current)
      ? [candidatePoint]
      : [currentPoint, candidatePoint]
  return selectReferencePoint(nondominated).candidateId === candidate.candidateId
}

function validateTrajectoryPoint(
  value: unknown,
  label: string,
  maxFilters: number,
): SolverTrajectoryPointV1 {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  const expected = [
    'evaluationCount',
    'elapsedMs',
    'candidateId',
    'actualDeliveredFilterCount',
    'canonicalRmseDb',
    'canonicalMaxAbsDb',
    'referenceRegret',
    'referenceImproved',
  ]
  const keys = Object.keys(value)
  if (expected.some((key) => !(key in value))) throw new Error(label + ' is missing a required field')
  if (keys.some((key) => !expected.includes(key))) throw new Error(label + ' contains an unknown field')
  const point = {
    evaluationCount: integer(value.evaluationCount, label + '.evaluationCount'),
    elapsedMs: finiteNumber(value.elapsedMs, label + '.elapsedMs'),
    candidateId: requiredString(value.candidateId, label + '.candidateId'),
    actualDeliveredFilterCount: integer(value.actualDeliveredFilterCount, label + '.actualDeliveredFilterCount'),
    canonicalRmseDb: finiteNumber(value.canonicalRmseDb, label + '.canonicalRmseDb'),
    canonicalMaxAbsDb: finiteNumber(value.canonicalMaxAbsDb, label + '.canonicalMaxAbsDb'),
    referenceRegret: finiteNumber(value.referenceRegret, label + '.referenceRegret'),
    referenceImproved: value.referenceImproved,
  }
  if (point.elapsedMs < 0) throw new Error(label + '.elapsedMs must be non-negative')
  if (point.actualDeliveredFilterCount > maxFilters) throw new Error(label + '.actualDeliveredFilterCount exceeds maxFilters')
  if (point.referenceRegret < 0) throw new Error(label + '.referenceRegret must be non-negative')
  if (typeof point.referenceImproved !== 'boolean') throw new Error(label + '.referenceImproved must be boolean')
  return point as SolverTrajectoryPointV1
}

export function assertSolverRunArtifactV1(
  value: unknown,
): asserts value is SolverRunArtifactV1 {
  if (!isRecord(value)) throw new Error('solver run artifact must be an object')
  const expected = [
    'schemaVersion',
    'algorithmId',
    'variantId',
    'problemId',
    'inputSha256',
    'maxFilters',
    'referenceSnapshotSha256',
    'seed',
    'evaluationBudget',
    'trajectory',
    'qualityTimeFrontierV1',
    'metadata',
  ]
  if (value.schemaVersion !== 1) throw new Error('solver run artifact schemaVersion must be 1')
  if (expected.some((key) => !(key in value))) throw new Error('solver run artifact is missing a required field')
  if (Object.keys(value).some((key) => !expected.includes(key))) throw new Error('solver run artifact contains an unknown field')
  requiredString(value.algorithmId, 'algorithmId')
  requiredString(value.variantId, 'variantId')
  requiredString(value.problemId, 'problemId')
  sha256(value.inputSha256, 'inputSha256')
  sha256(value.referenceSnapshotSha256, 'referenceSnapshotSha256')
  const maxFilters = integer(value.maxFilters, 'maxFilters', 1)
  if (value.seed !== null && !Number.isSafeInteger(value.seed)) throw new Error('seed must be an integer or null')
  integer(value.evaluationBudget, 'evaluationBudget', 1)
  if (!Array.isArray(value.trajectory) || value.trajectory.length === 0) {
    throw new Error('trajectory must be a non-empty array')
  }
  let previous: SolverTrajectoryPointV1 | undefined
  value.trajectory.forEach((rawPoint, index) => {
    const point = validateTrajectoryPoint(rawPoint, 'trajectory[' + index + ']', maxFilters)
    if (previous !== undefined) {
      if (point.evaluationCount < previous.evaluationCount) {
        throw new Error('trajectory evaluation count must be nondecreasing')
      }
      if (point.elapsedMs < previous.elapsedMs) {
        throw new Error('trajectory elapsed time must be nondecreasing')
      }
      if (!canReplace(previous, point)) throw new Error('trajectory best-so-far point regresses')
    }
    previous = point
  })
  if (value.qualityTimeFrontierV1 !== null) {
    const score = finiteNumber(value.qualityTimeFrontierV1, 'qualityTimeFrontierV1')
    if (score < 0 || score > 1) throw new Error('qualityTimeFrontierV1 must be between 0 and 1')
  }
  if (!isRecord(value.metadata)) throw new Error('metadata must be an object')
  Object.entries(value.metadata).forEach(([key, metadataValue]) => {
    if (key.length === 0 || (
      typeof metadataValue !== 'string' &&
      typeof metadataValue !== 'number' &&
      typeof metadataValue !== 'boolean'
    ) || (typeof metadataValue === 'number' && !Number.isFinite(metadataValue))) {
      throw new Error('metadata values must be finite scalar values')
    }
  })
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('cannot serialize undefined')
  return serialized
}

export function serializeSolverRunArtifactV1(artifact: SolverRunArtifactV1): string {
  assertSolverRunArtifactV1(artifact)
  return canonicalJson(artifact)
}

export function solverRunArtifactSha256(artifact: SolverRunArtifactV1): string {
  return createHash('sha256').update(serializeSolverRunArtifactV1(artifact)).digest('hex')
}
