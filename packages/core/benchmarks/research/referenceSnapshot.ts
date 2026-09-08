import { createHash } from 'node:crypto'

import type { Filter } from '../../src/types/filter.js'

export type ReferenceState = 'stable-under-current-search' | 'still-moving'

export interface ReferenceObjectivePointV1 {
  candidateId: string
  rmseDb: number
  maxAbsDb: number
  filterCount: number
}

export interface ReferenceCandidateV1 {
  candidateId: string
  problemId: string
  inputSha256: string
  maxFilters: number
  actualDeliveredFilterCount: number
  filters: Filter[]
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  algorithmId: string
  seed: number | null
  provenance: string
}

export interface ReferenceCellV1 {
  problemId: string
  inputSha256: string
  maxFilters: number
  referenceState: ReferenceState
  controlCandidateId: string
  candidates: ReferenceCandidateV1[]
  deliverableFrontierCandidateIds: string[]
  continuousDiagnosticFrontier: ReferenceObjectivePointV1[]
}

export interface OracleReferenceSnapshotV1 {
  version: 1
  createdFromRepositorySha: string
  corpusVersion: string
  canonicalEvaluatorVersion: string
  cells: ReferenceCellV1[]
  contentSha256: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strictKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const expectedSet = new Set(expected)
  const missing = expected.filter((key) => !(key in value))
  const unknown = Object.keys(value).filter((key) => !expectedSet.has(key))
  if (missing.length > 0) throw new Error(label + ' missing required field(s): ' + missing.join(', '))
  if (unknown.length > 0) throw new Error(label + ' contains unknown field(s): ' + unknown.join(', '))
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label + ' is required')
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + ' must be finite')
  return value
}

function integerValue(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(label + ' must be an integer >= ' + minimum)
  }
  return value as number
}

function sha256(value: unknown, label: string): string {
  const text = stringValue(value, label)
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(label + ' must be a SHA-256 hex digest')
  return text
}

function filterValue(value: unknown, label: string): Filter {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  strictKeys(value, ['id', 'enabled', 'type', 'frequencyHz', 'gainDb', 'q'], label)
  if (typeof value.enabled !== 'boolean') throw new Error(label + '.enabled must be boolean')
  if (value.type !== 'PK' && value.type !== 'LS' && value.type !== 'HS') {
    throw new Error(label + '.type is unsupported')
  }
  return {
    id: stringValue(value.id, label + '.id'),
    enabled: value.enabled,
    type: value.type,
    frequencyHz: finiteNumber(value.frequencyHz, label + '.frequencyHz'),
    gainDb: finiteNumber(value.gainDb, label + '.gainDb'),
    q: finiteNumber(value.q, label + '.q'),
  }
}

function candidateValue(value: unknown, label: string): ReferenceCandidateV1 {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  strictKeys(value, [
    'candidateId',
    'problemId',
    'inputSha256',
    'maxFilters',
    'actualDeliveredFilterCount',
    'filters',
    'canonicalRmseDb',
    'canonicalMaxAbsDb',
    'algorithmId',
    'seed',
    'provenance',
  ], label)
  if (!Array.isArray(value.filters)) throw new Error(label + '.filters must be an array')
  const maxFilters = integerValue(value.maxFilters, label + '.maxFilters', 1)
  const deliveredCount = integerValue(value.actualDeliveredFilterCount, label + '.actualDeliveredFilterCount')
  if (deliveredCount > maxFilters) throw new Error(label + '.actualDeliveredFilterCount exceeds maxFilters')
  const filters = value.filters.map((filter, index) => filterValue(filter, label + '.filters[' + index + ']'))
  if (filters.length !== deliveredCount) throw new Error(label + '.filters does not match delivered count')
  if (value.seed !== null && !Number.isSafeInteger(value.seed)) {
    throw new Error(label + '.seed must be an integer or null')
  }
  return {
    candidateId: stringValue(value.candidateId, label + '.candidateId'),
    problemId: stringValue(value.problemId, label + '.problemId'),
    inputSha256: sha256(value.inputSha256, label + '.inputSha256'),
    maxFilters,
    actualDeliveredFilterCount: deliveredCount,
    filters,
    canonicalRmseDb: finiteNumber(value.canonicalRmseDb, label + '.canonicalRmseDb'),
    canonicalMaxAbsDb: finiteNumber(value.canonicalMaxAbsDb, label + '.canonicalMaxAbsDb'),
    algorithmId: stringValue(value.algorithmId, label + '.algorithmId'),
    seed: value.seed as number | null,
    provenance: stringValue(value.provenance, label + '.provenance'),
  }
}

function objectivePointValue(value: unknown, label: string): ReferenceObjectivePointV1 {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  strictKeys(value, ['candidateId', 'rmseDb', 'maxAbsDb', 'filterCount'], label)
  return {
    candidateId: stringValue(value.candidateId, label + '.candidateId'),
    rmseDb: finiteNumber(value.rmseDb, label + '.rmseDb'),
    maxAbsDb: finiteNumber(value.maxAbsDb, label + '.maxAbsDb'),
    filterCount: integerValue(value.filterCount, label + '.filterCount'),
  }
}

function canonicalNumber(value: number, key: string): string {
  const integerKeys = new Set(['version', 'maxFilters', 'actualDeliveredFilterCount', 'filterCount', 'seed'])
  if (integerKeys.has(key)) return String(value)
  if (Number.isInteger(value)) return String(value) + '.0'
  return JSON.stringify(value)
}

function canonicalJsonValue(value: unknown, key = ''): string {
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalJsonValue(item, key)).join(',') + ']'
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((childKey) =>
      JSON.stringify(childKey) + ':' + canonicalJsonValue(value[childKey], childKey)).join(',') + '}'
  }
  if (typeof value === 'number') return canonicalNumber(value, key)
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('Cannot serialize undefined in snapshot payload')
  return serialized
}

export function canonicalSnapshotPayload(value: Record<string, unknown>): string {
  return canonicalJsonValue(value)
}

function contentHash(value: Record<string, unknown>): string {
  const withoutHash = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'contentSha256'),
  )
  return createHash('sha256').update(canonicalSnapshotPayload(withoutHash)).digest('hex')
}

export function assertOracleReferenceSnapshotV1(
  value: unknown,
): asserts value is OracleReferenceSnapshotV1 {
  if (!isRecord(value)) throw new Error('Oracle reference snapshot must be an object')
  strictKeys(value, [
    'version',
    'createdFromRepositorySha',
    'corpusVersion',
    'canonicalEvaluatorVersion',
    'cells',
    'contentSha256',
  ], 'snapshot')
  if (value.version !== 1) throw new Error('snapshot version must be 1')
  const repositorySha = stringValue(value.createdFromRepositorySha, 'snapshot.createdFromRepositorySha')
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(repositorySha) || /^0+$/.test(repositorySha)) {
    throw new Error('snapshot createdFromRepositorySha must be a non-zero Git or SHA-256 hex digest')
  }
  stringValue(value.corpusVersion, 'snapshot.corpusVersion')
  stringValue(value.canonicalEvaluatorVersion, 'snapshot.canonicalEvaluatorVersion')
  if (!Array.isArray(value.cells) || value.cells.length === 0) {
    throw new Error('snapshot cells must be a non-empty array')
  }
  const cellKeys = new Set<string>()
  value.cells.forEach((rawCell, cellIndex) => {
    const label = 'snapshot.cells[' + cellIndex + ']'
    if (!isRecord(rawCell)) throw new Error(label + ' must be an object')
    strictKeys(rawCell, [
      'problemId',
      'inputSha256',
      'maxFilters',
      'referenceState',
      'controlCandidateId',
      'candidates',
      'deliverableFrontierCandidateIds',
      'continuousDiagnosticFrontier',
    ], label)
    const problemId = stringValue(rawCell.problemId, label + '.problemId')
    const inputSha = sha256(rawCell.inputSha256, label + '.inputSha256')
    const maxFilters = integerValue(rawCell.maxFilters, label + '.maxFilters', 1)
    const key = problemId + '|' + inputSha + '|' + maxFilters
    if (cellKeys.has(key)) throw new Error('duplicate reference cell ' + key)
    cellKeys.add(key)
    if (rawCell.referenceState !== 'stable-under-current-search' &&
        rawCell.referenceState !== 'still-moving') {
      throw new Error(label + '.referenceState is invalid')
    }
    if (!Array.isArray(rawCell.candidates)) throw new Error(label + '.candidates must be an array')
    const cellCandidateIds = new Set<string>()
    rawCell.candidates.forEach((rawCandidate, candidateIndex) => {
      const candidate = candidateValue(rawCandidate, label + '.candidates[' + candidateIndex + ']')
      if (cellCandidateIds.has(candidate.candidateId)) throw new Error('duplicate candidate ID ' + candidate.candidateId)
      cellCandidateIds.add(candidate.candidateId)
      if (candidate.problemId !== problemId) throw new Error('candidate problemId does not match cell')
      if (candidate.inputSha256 !== inputSha) throw new Error('candidate inputSha256 does not match cell')
      if (candidate.maxFilters !== maxFilters) throw new Error('candidate maxFilters does not match cell')
    })
    const controlId = stringValue(rawCell.controlCandidateId, label + '.controlCandidateId')
    if (!cellCandidateIds.has(controlId)) throw new Error(label + '.controlCandidateId is absent from candidates')
    if (!Array.isArray(rawCell.deliverableFrontierCandidateIds)) {
      throw new Error(label + '.deliverableFrontierCandidateIds must be an array')
    }
    rawCell.deliverableFrontierCandidateIds.forEach((id, frontierIndex) => {
      const frontierId = stringValue(id, label + '.deliverableFrontierCandidateIds[' + frontierIndex + ']')
      if (!cellCandidateIds.has(frontierId)) throw new Error('frontier candidate ID ' + frontierId + ' is absent from candidates')
    })
    if (!Array.isArray(rawCell.continuousDiagnosticFrontier)) {
      throw new Error(label + '.continuousDiagnosticFrontier must be an array')
    }
    const diagnosticIds = new Set<string>()
    rawCell.continuousDiagnosticFrontier.forEach((point, pointIndex) => {
      const parsed = objectivePointValue(point, label + '.continuousDiagnosticFrontier[' + pointIndex + ']')
      if (diagnosticIds.has(parsed.candidateId)) throw new Error('duplicate diagnostic candidate ID ' + parsed.candidateId)
      diagnosticIds.add(parsed.candidateId)
    })
  })
  const suppliedHash = sha256(value.contentSha256, 'snapshot.contentSha256')
  if (contentHash(value) !== suppliedHash) throw new Error('snapshot contentSha256 does not match canonical content')
}

export function serializeOracleReferenceSnapshotV1(snapshot: OracleReferenceSnapshotV1): string {
  assertOracleReferenceSnapshotV1(snapshot)
  return canonicalSnapshotPayload(snapshot as unknown as Record<string, unknown>)
}

export function getReferenceCell(
  snapshot: OracleReferenceSnapshotV1,
  problemId: string,
  inputSha256: string,
  maxFilters: number,
): ReferenceCellV1 {
  assertOracleReferenceSnapshotV1(snapshot)
  const cell = snapshot.cells.find((candidate) =>
    candidate.problemId === problemId &&
    candidate.inputSha256 === inputSha256 &&
    candidate.maxFilters === maxFilters)
  if (cell === undefined) throw new Error('reference cell not found for ' + problemId + '/' + inputSha256 + '/' + maxFilters)
  return cell
}
