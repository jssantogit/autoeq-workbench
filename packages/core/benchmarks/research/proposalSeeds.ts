import { readFileSync } from 'node:fs'

import type { Filter } from '../../src/types/filter.js'

import type { SolverLabProblemV1 } from './labProtocol.js'

export const PROPOSAL_SEED_SCHEMA_VERSION = 1 as const

export interface ProposalSeedV1 {
  version: 1
  problemId: string
  inputSha256: string
  sourceKind: 'transfer' | 'known-good' | 'v1'
  sourceId: string
  filters: Filter[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function cloneFilter(filter: Filter): Filter {
  return { ...filter }
}

function validateFilter(
  value: unknown,
  problem: SolverLabProblemV1,
  label: string,
): Filter {
  if (!isRecord(value) ||
    typeof value.id !== 'string' || value.id.length === 0 ||
    typeof value.enabled !== 'boolean' ||
    (value.type !== 'PK' && value.type !== 'LS' && value.type !== 'HS') ||
    !finite(value.frequencyHz) || !finite(value.gainDb) || !finite(value.q)) {
    throw new Error(`${label} is not a valid filter`)
  }
  const filter = value as unknown as Filter
  if (!problem.allowedFilterTypes.includes(filter.type)) {
    throw new Error(`${label} has an unsupported filter type`)
  }
  if (
    filter.frequencyHz < problem.bounds.minFrequencyHz ||
    filter.frequencyHz > problem.bounds.maxFrequencyHz ||
    filter.gainDb < problem.bounds.minGainDb ||
    filter.gainDb > problem.bounds.maxGainDb
  ) {
    throw new Error(`${label} is out of bounds`)
  }
  if (filter.type === 'PK') {
    if (filter.q < problem.bounds.minPkQ || filter.q > problem.bounds.maxPkQ) {
      throw new Error(`${label} Q is out of bounds`)
    }
  } else if (filter.q !== problem.bounds.shelfQ) {
    throw new Error(`${label} shelf Q must equal the canonical shelf Q`)
  }
  return cloneFilter(filter)
}

export function validateProposalSeed(
  value: unknown,
  problem: SolverLabProblemV1,
  activeMaxFilters = 10,
): ProposalSeedV1 {
  if (!isRecord(value) || value.version !== PROPOSAL_SEED_SCHEMA_VERSION) {
    throw new Error('proposal seed version must be 1')
  }
  if (typeof value.problemId !== 'string' || value.problemId !== problem.problemId) {
    throw new Error('proposal seed problemId does not match the active problem')
  }
  if (typeof value.inputSha256 !== 'string' || value.inputSha256 !== problem.inputSha256) {
    throw new Error('proposal seed inputSha256 does not match the active problem')
  }
  if (value.sourceKind !== 'transfer' && value.sourceKind !== 'known-good' && value.sourceKind !== 'v1') {
    throw new Error('proposal seed sourceKind is unsupported')
  }
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0) {
    throw new Error('proposal seed sourceId is required')
  }
  if (!Array.isArray(value.filters)) throw new Error('proposal seed filters must be an array')
  if (!Number.isSafeInteger(activeMaxFilters) || activeMaxFilters <= 0) {
    throw new Error('activeMaxFilters must be a positive integer')
  }
  const maximum = Math.min(activeMaxFilters, problem.bounds.maxFilters, 10)
  if (value.filters.length > maximum) {
    throw new Error('proposal seed exceeds the active Max10 filter cap')
  }
  const ids = new Set<string>()
  const filters = value.filters.map((filter, index) => {
    const validated = validateFilter(filter, problem, `filters[${index}]`)
    if (ids.has(validated.id)) throw new Error(`duplicate proposal seed filter id: ${validated.id}`)
    ids.add(validated.id)
    return validated
  })
  return {
    version: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    sourceKind: value.sourceKind,
    sourceId: value.sourceId,
    filters,
  }
}

export function parseProposalSeeds(
  value: unknown,
  problem: SolverLabProblemV1,
  activeMaxFilters = 10,
): ProposalSeedV1[] {
  const rawSeeds = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.seeds)
      ? value.seeds
      : undefined
  if (rawSeeds === undefined) throw new Error('proposal seeds must be an array or { seeds: [] }')
  return rawSeeds.map((seed) => validateProposalSeed(seed, problem, activeMaxFilters))
}

export function loadProposalSeeds(
  path: string,
  problem: SolverLabProblemV1,
  activeMaxFilters = 10,
): ProposalSeedV1[] {
  return parseProposalSeeds(
    JSON.parse(readFileSync(path, 'utf8')) as unknown,
    problem,
    activeMaxFilters,
  )
}
