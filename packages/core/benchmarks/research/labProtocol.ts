import {
  calculateBandMetrics,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  DEFAULT_AUTOEQ_SETTINGS,
  desiredCorrection,
  evaluateV2Solution,
  AUTOEQ_PRODUCT_LIMITS,
  MVP_NUMERIC_POLICY,
  POWERAMP_MANUAL_ENTRY_POLICY,
  prepareCurve,
  quantizeV2Filters,
  resolveStandardAutoEqV2Config,
  type Filter,
  type StandardAutoEqV2Config,
} from '../../src/index.js'
import { finalizeDeliveredFilters } from '../../src/autoeq/runStandardAutoEq.js'

import { RESEARCH_BANDS } from './telemetry.js'
import { RESEARCH_NORMALIZATION } from './corpus.js'
import type { ResearchCaseDescriptor } from './types.js'

export const SOLVER_LAB_PROTOCOL_VERSION = 1 as const

export interface SolverLabProblemV1 {
  protocolVersion: 1
  problemId: string
  inputSha256: string
  sampleRateHz: 48000
  frequenciesHz: number[]
  desiredDb: number[]
  allowedFilterTypes: ['PK', 'LS', 'HS']
  bounds: {
    minFrequencyHz: number
    maxFrequencyHz: number
    minGainDb: number
    maxGainDb: number
    minPkQ: number
    maxPkQ: number
    shelfQ: number
    maxFilters: number
  }
  quantization: {
    frequencyStepHz: 1
    gainStepDb: 0.1
    qStep: 0.01
  }
}

export interface SolverLabCandidateV1 {
  protocolVersion: 1
  problemId: string
  inputSha256: string
  candidateId: string
  algorithmId: string
  seed: number | null
  filters: Filter[]
}

export interface SolverLabEvaluationV1 {
  protocolVersion: 1
  candidateId: string
  valid: boolean
  rejectionReason: string | null
  continuous: {
    rmseDb: number
    maxAbsDb: number
    bandRmseDb: Record<string, number>
  } | null
  deliverable: {
    filters: Filter[]
    rmseDb: number
    maxAbsDb: number
    bandRmseDb: Record<string, number>
    cancellationTotalScore: number
  } | null
}

const ALLOWED_FILTER_TYPES: SolverLabProblemV1['allowedFilterTypes'] = ['PK', 'LS', 'HS']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isSafeInteger(value)
}

function isFilterType(value: unknown): value is Filter['type'] {
  return value === 'PK' || value === 'LS' || value === 'HS'
}

function isFilter(value: unknown): value is Filter {
  return isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.enabled === 'boolean' &&
    isFilterType(value.type) &&
    isFiniteNumber(value.frequencyHz) &&
    isFiniteNumber(value.gainDb) &&
    isFiniteNumber(value.q)
}

function assertFiniteArray(value: unknown, field: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !isFiniteNumber(entry))) {
    throw new Error(`Invalid solver lab problem: ${field} must be a non-empty finite number array`)
  }
}

export function assertSolverLabProblem(value: unknown): asserts value is SolverLabProblemV1 {
  if (!isRecord(value) || value.protocolVersion !== SOLVER_LAB_PROTOCOL_VERSION) {
    throw new Error('Invalid solver lab problem: unsupported protocol version')
  }
  if (typeof value.problemId !== 'string' || value.problemId.length === 0) {
    throw new Error('Invalid solver lab problem: problemId is required')
  }
  const inputSha256 = value.inputSha256
  if (typeof inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(inputSha256)) {
    throw new Error('Invalid solver lab problem: inputSha256 must be a SHA-256 hex digest')
  }
  if (value.sampleRateHz !== MVP_NUMERIC_POLICY.sampleRateHz) {
    throw new Error('Invalid solver lab problem: sampleRateHz must be 48000')
  }
  assertFiniteArray(value.frequenciesHz, 'frequenciesHz')
  assertFiniteArray(value.desiredDb, 'desiredDb')
  if (value.frequenciesHz.length !== value.desiredDb.length) {
    throw new Error('Invalid solver lab problem: frequenciesHz and desiredDb must have equal length')
  }
  if (JSON.stringify(value.allowedFilterTypes) !== JSON.stringify(ALLOWED_FILTER_TYPES)) {
    throw new Error('Invalid solver lab problem: allowedFilterTypes is not canonical')
  }
  const bounds = value.bounds
  if (!isRecord(bounds)) {
    throw new Error('Invalid solver lab problem: bounds are required')
  }
  const boundFields = [
    'minFrequencyHz', 'maxFrequencyHz', 'minGainDb', 'maxGainDb',
    'minPkQ', 'maxPkQ', 'shelfQ', 'maxFilters',
  ] as const
  if (boundFields.some((field) => !isFiniteNumber(bounds[field]))) {
    throw new Error('Invalid solver lab problem: bounds must be finite')
  }
  const minFrequencyHz = bounds.minFrequencyHz as number
  const maxFrequencyHz = bounds.maxFrequencyHz as number
  const minGainDb = bounds.minGainDb as number
  const maxGainDb = bounds.maxGainDb as number
  const minPkQ = bounds.minPkQ as number
  const maxPkQ = bounds.maxPkQ as number
  const maxFilters = bounds.maxFilters as number
  if (
    minFrequencyHz >= maxFrequencyHz ||
    minFrequencyHz < AUTOEQ_PRODUCT_LIMITS.minFrequencyHz ||
    maxFrequencyHz > AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz ||
    minGainDb >= maxGainDb ||
    minGainDb < AUTOEQ_PRODUCT_LIMITS.minGainDb ||
    maxGainDb > AUTOEQ_PRODUCT_LIMITS.maxGainDb ||
    minPkQ >= maxPkQ ||
    minPkQ < AUTOEQ_PRODUCT_LIMITS.minQ ||
    maxPkQ > AUTOEQ_PRODUCT_LIMITS.maxQ ||
    !isInteger(maxFilters) ||
    maxFilters < 0 ||
    maxFilters > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters
  ) {
    throw new Error('Invalid solver lab problem: bounds are inconsistent')
  }
  const quantization = value.quantization
  if (!isRecord(quantization)) {
    throw new Error('Invalid solver lab problem: quantization is required')
  }
  if (
    quantization.frequencyStepHz !== POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz ||
    quantization.gainStepDb !== POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb ||
    quantization.qStep !== POWERAMP_MANUAL_ENTRY_POLICY.qStep
  ) {
    throw new Error('Invalid solver lab problem: quantization is not canonical')
  }
}

export function assertSolverLabCandidate(value: unknown): asserts value is SolverLabCandidateV1 {
  if (!isRecord(value) || value.protocolVersion !== SOLVER_LAB_PROTOCOL_VERSION) {
    throw new Error('Invalid solver lab candidate: unsupported protocol version')
  }
  for (const field of ['problemId', 'inputSha256', 'candidateId', 'algorithmId'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new Error(`Invalid solver lab candidate: ${field} is required`)
    }
  }
  const inputSha256 = value.inputSha256
  if (typeof inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(inputSha256)) {
    throw new Error('Invalid solver lab candidate: inputSha256 must be a SHA-256 hex digest')
  }
  if (value.seed !== null && !isInteger(value.seed)) {
    throw new Error('Invalid solver lab candidate: seed must be an integer or null')
  }
  if (!Array.isArray(value.filters) || value.filters.some((filter) => !isFilter(filter))) {
    throw new Error('Invalid solver lab candidate: filters must be valid filter objects')
  }
}

function configForProblem(problem: SolverLabProblemV1): StandardAutoEqV2Config {
  return resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    minFrequencyHz: problem.bounds.minFrequencyHz,
    maxFrequencyHz: problem.bounds.maxFrequencyHz,
    minGainDb: problem.bounds.minGainDb,
    maxGainDb: problem.bounds.maxGainDb,
    minQ: problem.bounds.minPkQ,
    maxQ: problem.bounds.maxPkQ,
    maxFilters: problem.bounds.maxFilters,
  })
}

function createProblemSettings(maxFilters: number) {
  if (!isInteger(maxFilters) || maxFilters < 0) {
    throw new Error('Solver lab maxFilters must be a non-negative safe integer')
  }
  const settings = {
    ...DEFAULT_AUTOEQ_SETTINGS,
    maxFilters,
  }
  return resolveStandardAutoEqV2Config(settings)
}

export function createSolverLabProblem(
  researchCase: ResearchCaseDescriptor,
  maxFilters: number,
): SolverLabProblemV1 {
  if (
    researchCase.layer === 'holdout' ||
    typeof researchCase.id !== 'string' ||
    researchCase.id.length === 0 ||
    researchCase.source.kind !== 'fr' ||
    researchCase.target.kind !== 'target'
  ) {
    throw new Error('Solver lab problems require an approved development or adversarial FR/Target case')
  }
  const config = createProblemSettings(maxFilters)
  const frequenciesHz = createEvaluationGrid().filter((frequencyHz) =>
    frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz,
  )
  const source = prepareCurve(researchCase.source, RESEARCH_NORMALIZATION, frequenciesHz)
  const target = prepareCurve(researchCase.target, RESEARCH_NORMALIZATION, frequenciesHz)
  const desiredDb = desiredCorrection(source.db, target.db)

  return {
    protocolVersion: SOLVER_LAB_PROTOCOL_VERSION,
    problemId: researchCase.id,
    inputSha256: researchCase.inputSha256,
    sampleRateHz: config.sampleRateHz as SolverLabProblemV1['sampleRateHz'],
    frequenciesHz,
    desiredDb,
    allowedFilterTypes: [...ALLOWED_FILTER_TYPES] as SolverLabProblemV1['allowedFilterTypes'],
    bounds: {
      minFrequencyHz: config.minFrequencyHz,
      maxFrequencyHz: config.maxFrequencyHz,
      minGainDb: config.minGainDb,
      maxGainDb: config.maxGainDb,
      minPkQ: config.minPkQ,
      maxPkQ: config.maxPkQ,
      shelfQ: config.shelfQ,
      maxFilters: config.maxFilters,
    },
    quantization: {
      frequencyStepHz: POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz,
      gainStepDb: POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb,
      qStep: POWERAMP_MANUAL_ENTRY_POLICY.qStep,
    },
  }
}

function candidateIdOf(value: unknown): string {
  return isRecord(value) && typeof value.candidateId === 'string' ? value.candidateId : ''
}

function invalidEvaluation(candidate: unknown, rejectionReason: string): SolverLabEvaluationV1 {
  return {
    protocolVersion: SOLVER_LAB_PROTOCOL_VERSION,
    candidateId: candidateIdOf(candidate),
    valid: false,
    rejectionReason,
    continuous: null,
    deliverable: null,
  }
}

function validateCandidateForProblem(
  problem: SolverLabProblemV1,
  candidate: unknown,
): string | null {
  if (!isRecord(candidate)) return 'invalid-candidate'
  if (candidate.protocolVersion !== SOLVER_LAB_PROTOCOL_VERSION) return 'unsupported-protocol-version'
  if (candidate.problemId !== problem.problemId) return 'problem-id-mismatch'
  if (candidate.inputSha256 !== problem.inputSha256) return 'input-hash-mismatch'
  if (typeof candidate.candidateId !== 'string' || candidate.candidateId.length === 0) {
    return 'candidate-id-required'
  }
  if (typeof candidate.algorithmId !== 'string' || candidate.algorithmId.length === 0) {
    return 'algorithm-id-required'
  }
  if (candidate.seed !== null && !isInteger(candidate.seed)) return 'invalid-seed'
  if (!Array.isArray(candidate.filters)) return 'invalid-filters'
  if (candidate.filters.length > problem.bounds.maxFilters) return 'filter-count-exceeds-maxFilters'

  const filterIds = new Set<string>()
  for (const filter of candidate.filters) {
    if (isRecord(filter) && 'type' in filter && !isFilterType(filter.type)) {
      return 'unsupported-filter-type'
    }
    if (!isFilter(filter)) return 'invalid-filter'
    if (filterIds.has(filter.id)) return 'duplicate-filter-id'
    filterIds.add(filter.id)
    if (!problem.allowedFilterTypes.includes(filter.type)) return 'unsupported-filter-type'
    if (
      filter.frequencyHz < problem.bounds.minFrequencyHz ||
      filter.frequencyHz > problem.bounds.maxFrequencyHz ||
      filter.gainDb < problem.bounds.minGainDb ||
      filter.gainDb > problem.bounds.maxGainDb
    ) {
      return 'filter-out-of-bounds'
    }
    if (filter.type === 'PK') {
      if (filter.q < problem.bounds.minPkQ || filter.q > problem.bounds.maxPkQ) {
        return 'filter-out-of-bounds'
      }
    } else if (filter.q !== problem.bounds.shelfQ) {
      return 'filter-out-of-bounds'
    }
  }
  return null
}

function scoreFilters(
  filters: readonly Filter[],
  problem: SolverLabProblemV1,
): {
  rmseDb: number
  maxAbsDb: number
  bandRmseDb: Record<string, number>
  residualDb: number[]
} {
  const cascadeDb = cascadeMagnitudeDb(filters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - cascadeDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, problem.frequenciesHz)
  const bandRmseDb = Object.fromEntries(
    calculateBandMetrics(residualDb, problem.frequenciesHz, RESEARCH_BANDS)
      .map((band) => [band.id, band.rmseDb]),
  )
  return {
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    bandRmseDb,
    residualDb,
  }
}

export function evaluateSolverLabCandidate(
  problem: SolverLabProblemV1,
  candidate: SolverLabCandidateV1,
): SolverLabEvaluationV1 {
  assertSolverLabProblem(problem)
  const rejectionReason = validateCandidateForProblem(problem, candidate)
  if (rejectionReason !== null) return invalidEvaluation(candidate, rejectionReason)

  assertSolverLabCandidate(candidate)
  const continuous = scoreFilters(candidate.filters, problem)
  const config = configForProblem(problem)
  const quantized = quantizeV2Filters(candidate.filters, config)
  const deliveredFilters = finalizeDeliveredFilters(
    quantized.filter((filter) => filter.gainDb !== 0),
  )
  const deliverable = scoreFilters(deliveredFilters, problem)
  const deliveredSolution = evaluateV2Solution(
    deliveredFilters,
    problem.desiredDb,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )

  return {
    protocolVersion: SOLVER_LAB_PROTOCOL_VERSION,
    candidateId: candidate.candidateId,
    valid: true,
    rejectionReason: null,
    continuous: {
      rmseDb: continuous.rmseDb,
      maxAbsDb: continuous.maxAbsDb,
      bandRmseDb: continuous.bandRmseDb,
    },
    deliverable: {
      filters: deliveredFilters,
      rmseDb: deliverable.rmseDb,
      maxAbsDb: deliverable.maxAbsDb,
      bandRmseDb: deliverable.bandRmseDb,
      cancellationTotalScore: deliveredSolution.cancellationAudit.totalScore,
    },
  }
}
