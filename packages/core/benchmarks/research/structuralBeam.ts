import {
  cascadeMagnitudeDb,
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateV2Solution,
  quantizeV2Filters,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../src/index.js'
import {
  advanceJointRefineContinuationV2,
  createJointRefineContinuationV2,
} from '../../src/autoeq/v2/jointRefineContinuation.js'

import {
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import {
  computeQualityTimeFrontier,
  type QualityTimePoint,
} from './qualityTime.js'
import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'
import type { SolverTrajectoryPointV1 } from './solverRunArtifact.js'

export type StructuralBeamProblem = Pick<
  SolverLabProblemV1,
  'problemId' | 'inputSha256' | 'frequenciesHz' | 'sampleRateHz' | 'bounds'
>

export type StructuralBeamRunProblem = StructuralBeamProblem & Pick<SolverLabProblemV1, 'desiredDb'>

export type StructuralMutation =
  | 'add-pk'
  | 'add-ls'
  | 'add-hs'
  | 'remove'
  | 'type-mutation'
  | 'split'
  | 'merge'

export interface StructuralProposal {
  mutation: StructuralMutation
  filters: Filter[]
}

export interface StructuralBeamConfig {
  beamWidth: number
  proposalsPerParent: number
  localPolishEvaluations: number
  maxFilters: number
}

export const STRUCTURAL_BEAM_VARIANTS: Readonly<Record<string, StructuralBeamConfig>> = Object.freeze({
  'beam-4': Object.freeze({
    beamWidth: 4,
    proposalsPerParent: 8,
    localPolishEvaluations: 120,
    maxFilters: 10,
  }),
  'beam-12': Object.freeze({
    beamWidth: 12,
    proposalsPerParent: 8,
    localPolishEvaluations: 120,
    maxFilters: 10,
  }),
})

export type StructuralBeamOrigin = 'zero' | 'matching-pursuit' | 'teacher-compression'

export interface StructuralBeamSeed {
  seedId: string
  origin: StructuralBeamOrigin
  filters: Filter[]
}

export const STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION = 1 as const

export type StructuralBeamDiagnosticStage = 'seed-validation' | 'descendant'
export type StructuralBeamDiagnosticDominance =
  | 'candidate-dominates'
  | 'baseline-dominates'
  | 'tradeoff'
  | 'equivalent'

export interface StructuralBeamDiagnosticMetrics {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

export interface StructuralBeamDiagnosticDelta {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  referenceRegret: number
}

export interface StructuralBeamBoundSaturation {
  filterIndex: number
  filterId: string
  fields: string[]
}

export interface StructuralBeamDiagnosticEntry {
  schemaVersion: typeof STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION
  stage: StructuralBeamDiagnosticStage
  evaluationIndex: number
  candidateId: string
  parentCandidateId: string | null
  parentCanonical: StructuralBeamDiagnosticMetrics | null
  residualPeak: { index: number; frequencyHz: number; residualDb: number } | null
  mutation: StructuralMutation | 'seed-validation'
  proposalRank: number | null
  proposalOrdinal: number | null
  proposalSource: 'structural-mutation-library-v1' | 'seed-validation'
  filtersBeforePolish: Filter[]
  prePolish: {
    filters: Filter[]
    metrics: StructuralBeamDiagnosticMetrics
  }
  boundedContinuous: {
    filters: Filter[]
    metrics: StructuralBeamDiagnosticMetrics
    boundedLinearSolver: 'not-applicable'
    coordinateTrials: number
  }
  canonical: {
    filters: Filter[]
    metrics: StructuralBeamDiagnosticMetrics
    referenceRegret: number
    referenceImproved: boolean
  }
  bounds: {
    prePolish: StructuralBeamBoundSaturation[]
    boundedContinuous: StructuralBeamBoundSaturation[]
    canonical: StructuralBeamBoundSaturation[]
  }
  deltas: {
    prePolishToBoundedContinuous: StructuralBeamDiagnosticDelta
    boundedContinuousToCanonical: StructuralBeamDiagnosticDelta
    parentToCanonical: StructuralBeamDiagnosticDelta | null
    primaryToCanonical: StructuralBeamDiagnosticDelta | null
  }
  dominance: {
    againstParent: StructuralBeamDiagnosticDominance | null
    againstPrimary: StructuralBeamDiagnosticDominance | null
  }
  selector: {
    frozenSelector: 'reference-selector-v1'
    againstParent: { selectedCandidateId: string; winner: 'candidate' | 'parent' } | null
    againstPrimary: { selectedCandidateId: string; winner: 'candidate' | 'primary' } | null
  }
  dictionary: {
    status: 'unknown'
    atomRank: null
  }
}

export interface StructuralBeamDiagnosticTrace {
  enabled: boolean
  entries: StructuralBeamDiagnosticEntry[]
}

export function createStructuralBeamDiagnosticTrace(enabled = true): StructuralBeamDiagnosticTrace {
  return { enabled, entries: [] }
}

export interface StructuralBeamState {
  candidate: SolverLabCandidateV1
  evaluation: SolverLabEvaluationV1
  origin: StructuralBeamOrigin | string
}

/**
 * Diagnostic-only admission context. The default structural beam never
 * constructs or invokes this hook; callers must explicitly opt in.
 */
export interface StructuralBeamAdmissionContext {
  layerIndex: number
  parentIndex: number
  parent: StructuralBeamState
  orderedProposals: readonly StructuralProposal[]
  admittedProposals: readonly StructuralProposal[]
}

export interface StructuralBeamAdmissionDecision {
  proposals: readonly StructuralProposal[]
  intervention: 'rescue' | 'custom'
}

export interface StructuralBeamAdmissionOverride {
  apply: (
    context: StructuralBeamAdmissionContext,
  ) => StructuralBeamAdmissionDecision | null
}

export interface StructuralBeamRunInput {
  problem: StructuralBeamRunProblem
  seed: number
  evaluationBudget: number
  referenceFrontier: readonly ReferenceRegretPoint[]
  referenceSnapshotSha256: string
  config?: StructuralBeamConfig
  seeds?: readonly StructuralBeamSeed[]
  includeZeroSeed?: boolean
  evaluate?: (candidate: SolverLabCandidateV1) => SolverLabEvaluationV1
  isExpired?: () => boolean
  nowMs?: () => number
  elapsedMs?: () => number
  onPoint?: (point: SolverTrajectoryPointV1, filters: readonly Filter[]) => void
  onWorkUnitStart?: () => void
  diagnosticTrace?: StructuralBeamDiagnosticTrace
  admissionOverride?: StructuralBeamAdmissionOverride
}

export interface StructuralBeamRunResult {
  algorithmId: 'structural-beam-v1'
  variantId: 'structural-beam-v1'
  seed: number
  evaluationBudget: number
  trajectory: SolverTrajectoryPointV1[]
  qualityTimeFrontierV1: number
  candidates: SolverLabCandidateV1[]
  evaluations: SolverLabEvaluationV1[]
  states: StructuralBeamState[]
  proposalsConsidered: number
  paretoRetained: number
  stopReason: 'deadline' | 'evaluation-budget' | 'no-admissible-proposals'
  structuralOperationCounts: Record<StructuralMutation, number>
  metadata: Record<string, string | number | boolean>
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function canonical(filters: readonly Filter[]): Filter[] {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return filters
    .map((filter) => ({ ...filter }))
    .sort((left, right) =>
      order[left.type] - order[right.type] ||
      left.frequencyHz - right.frequencyHz ||
      left.id.localeCompare(right.id))
}

function uniqueId(filters: readonly Filter[], prefix: string): string {
  const existing = new Set(filters.map((filter) => filter.id))
  let candidate = prefix
  let suffix = 1
  while (existing.has(candidate)) {
    candidate = `${prefix}-${suffix}`
    suffix += 1
  }
  return candidate
}

function projectFilter(problem: StructuralBeamProblem, filter: Filter): Filter {
  return {
    ...filter,
    frequencyHz: clamp(
      filter.frequencyHz,
      problem.bounds.minFrequencyHz,
      problem.bounds.maxFrequencyHz,
    ),
    gainDb: clamp(filter.gainDb, problem.bounds.minGainDb, problem.bounds.maxGainDb),
    q: filter.type === 'PK'
      ? clamp(filter.q, problem.bounds.minPkQ, problem.bounds.maxPkQ)
      : problem.bounds.shelfQ,
  }
}

function featureFrequency(
  problem: StructuralBeamProblem,
  residualDb: readonly number[],
): { frequencyHz: number; residual: number } {
  if (
    residualDb.length === 0 ||
    residualDb.length !== problem.frequenciesHz.length ||
    residualDb.some((value) => !Number.isFinite(value)) ||
    problem.frequenciesHz.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('residualDb and frequenciesHz must be non-empty finite arrays of equal length')
  }
  const extrema: number[] = []
  for (let index = 0; index < residualDb.length; index += 1) {
    const magnitude = Math.abs(residualDb[index]!)
    const left = index === 0 || magnitude >= Math.abs(residualDb[index - 1]!)
    const right = index === residualDb.length - 1 || magnitude >= Math.abs(residualDb[index + 1]!)
    if (left && right) extrema.push(index)
  }
  const index = extrema.reduce((best, candidate) => {
    const bestMagnitude = Math.abs(residualDb[best]!)
    const candidateMagnitude = Math.abs(residualDb[candidate]!)
    return candidateMagnitude > bestMagnitude ? candidate : best
  }, extrema[0]!)
  return {
    frequencyHz: clamp(
      problem.frequenciesHz[index]!,
      problem.bounds.minFrequencyHz,
      problem.bounds.maxFrequencyHz,
    ),
    residual: residualDb[index]!,
  }
}

function addProposal(
  problem: StructuralBeamProblem,
  filters: readonly Filter[],
  mutation: Extract<StructuralMutation, 'add-pk' | 'add-ls' | 'add-hs'>,
  type: Filter['type'],
  frequencyHz: number,
  residual: number,
): StructuralProposal {
  const gainDb = clamp(residual, problem.bounds.minGainDb, problem.bounds.maxGainDb)
  const q = type === 'PK'
    ? Math.sqrt(problem.bounds.minPkQ * problem.bounds.maxPkQ)
    : problem.bounds.shelfQ
  const newFilter: Filter = {
    id: uniqueId(filters, `struct-${mutation}`),
    enabled: true,
    type,
    frequencyHz,
    gainDb,
    q,
  }
  return { mutation, filters: canonical([...filters, newFilter]) }
}

export function generateStructuralMutations(
  problem: StructuralBeamProblem,
  filters: readonly Filter[],
  residualDb: readonly number[],
): StructuralProposal[] {
  const current = filters.map((filter) => projectFilter(problem, filter))
  const { frequencyHz, residual } = featureFrequency(problem, residualDb)
  const proposals: StructuralProposal[] = []
  if (current.length < problem.bounds.maxFilters) {
    proposals.push(
      addProposal(problem, current, 'add-pk', 'PK', frequencyHz, residual),
      addProposal(problem, current, 'add-ls', 'LS', frequencyHz, residual),
      addProposal(problem, current, 'add-hs', 'HS', frequencyHz, residual),
    )
  }
  current.forEach((filter, index) => {
    proposals.push({
      mutation: 'remove',
      filters: canonical(current.filter((_, candidateIndex) => candidateIndex !== index)),
    })
    const nextType: Record<Filter['type'], Filter['type']> = { PK: 'LS', LS: 'HS', HS: 'PK' }
    proposals.push({
      mutation: 'type-mutation',
      filters: canonical([
        ...current.slice(0, index),
        projectFilter(problem, { ...filter, type: nextType[filter.type] }),
        ...current.slice(index + 1),
      ]),
    })
    if (current.length < problem.bounds.maxFilters) {
      const ratio = 2 ** (1 / 24)
      const first = projectFilter(problem, {
        ...filter,
        id: uniqueId(current, `${filter.id}-split-low`),
        frequencyHz: filter.frequencyHz / ratio,
        gainDb: filter.gainDb / 2,
      })
      const second = projectFilter(problem, {
        ...filter,
        id: uniqueId([...current, first], `${filter.id}-split-high`),
        frequencyHz: filter.frequencyHz * ratio,
        gainDb: filter.gainDb / 2,
      })
      proposals.push({
        mutation: 'split',
        filters: canonical([
          ...current.slice(0, index),
          first,
          second,
          ...current.slice(index + 1),
        ]),
      })
    }
  })
  for (let leftIndex = 0; leftIndex < current.length; leftIndex += 1) {
    const left = current[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < current.length; rightIndex += 1) {
      const right = current[rightIndex]!
      if (left.type !== right.type || Math.abs(Math.log2(left.frequencyHz / right.frequencyHz)) > 1 / 12) {
        continue
      }
      const leftWeight = Math.abs(left.gainDb)
      const rightWeight = Math.abs(right.gainDb)
      const totalWeight = leftWeight + rightWeight
      const centerOctave = totalWeight > 0
        ? (leftWeight * Math.log2(left.frequencyHz) + rightWeight * Math.log2(right.frequencyHz)) / totalWeight
        : (Math.log2(left.frequencyHz) + Math.log2(right.frequencyHz)) / 2
      const merged = projectFilter(problem, {
        id: uniqueId(current, `merge-${left.id}-${right.id}`),
        enabled: left.enabled || right.enabled,
        type: left.type,
        frequencyHz: 2 ** centerOctave,
        gainDb: left.gainDb + right.gainDb,
        q: (left.q + right.q) / 2,
      })
      proposals.push({
        mutation: 'merge',
        filters: canonical([
          ...current.filter((_, index) => index !== leftIndex && index !== rightIndex),
          merged,
        ]),
      })
    }
  }
  return proposals
}

function filterKey(filters: readonly Filter[]): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return JSON.stringify(filters
    .map((filter) => ({ ...filter }))
    .sort((left, right) =>
      order[left.type] - order[right.type] ||
      left.frequencyHz - right.frequencyHz ||
      left.gainDb - right.gainDb ||
      left.q - right.q ||
      Number(left.enabled) - Number(right.enabled) ||
      left.id.localeCompare(right.id)))
}

function semanticFilterKey(filters: readonly Filter[]): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return JSON.stringify(filters
    .map(({ id: _id, ...filter }) => filter)
    .sort((left, right) =>
      order[left.type] - order[right.type] ||
      left.frequencyHz - right.frequencyHz ||
      left.gainDb - right.gainDb ||
      left.q - right.q ||
      Number(left.enabled) - Number(right.enabled)))
}

export function orderStructuralProposals(
  proposals: readonly StructuralProposal[],
): StructuralProposal[] {
  return [...proposals].sort((left, right) =>
    left.mutation.localeCompare(right.mutation) || filterKey(left.filters).localeCompare(filterKey(right.filters)))
}

function statePoint(state: StructuralBeamState): SelectorPoint {
  const delivered = state.evaluation.deliverable
  if (delivered === null) throw new Error('structural beam state requires delivered metrics')
  return {
    candidateId: state.candidate.candidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
    cancellationScore: delivered.cancellationTotalScore,
  }
}

function dominates(left: SelectorPoint, right: SelectorPoint): boolean {
  const epsilon = 1e-12
  return left.rmseDb <= right.rmseDb + epsilon &&
    left.maxAbsDb <= right.maxAbsDb + epsilon &&
    (left.rmseDb < right.rmseDb - epsilon || left.maxAbsDb < right.maxAbsDb - epsilon)
}

export function retainParetoBeam(
  states: readonly StructuralBeamState[],
  beamWidth: number,
): StructuralBeamState[] {
  positiveInteger(beamWidth, 'beamWidth')
  if (states.length === 0) return []
  const points = states.map(statePoint)
  const frontier = points.filter((point, index) =>
    !points.some((other, otherIndex) => otherIndex !== index && dominates(other, point)))
  if (frontier.length <= beamWidth) {
    const ids = new Set(frontier.map((point) => point.candidateId))
    return states.filter((state) => ids.has(state.candidate.candidateId))
  }
  let remaining = [...frontier]
  const selected = new Set<string>()
  while (remaining.length > 0 && selected.size < beamWidth) {
    const chosen = selectReferencePoint(remaining).candidateId
    selected.add(chosen)
    remaining = remaining.filter((point) => point.candidateId !== chosen)
  }
  return states.filter((state) => selected.has(state.candidate.candidateId))
}

function quantizationConfig(problem: StructuralBeamProblem) {
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

export interface StructuralProposalPolishResult {
  refinedFilters: Filter[]
  deliveredFilters: Filter[]
  coordinateTrials: number
}

export function quantizeStructuralBeamFilters(
  problem: StructuralBeamProblem,
  filters: readonly Filter[],
): Filter[] {
  return quantizeV2Filters(filters, quantizationConfig(problem))
}

export function polishStructuralProposal(
  problem: StructuralBeamRunProblem,
  filters: readonly Filter[],
  evaluations: number,
  isExpired: () => boolean,
): StructuralProposalPolishResult {
  if (evaluations <= 0 || filters.length === 0) {
    const refinedFilters = canonical(filters)
    return { refinedFilters, deliveredFilters: refinedFilters, coordinateTrials: 0 }
  }
  const config = quantizationConfig(problem)
  let continuation = createJointRefineContinuationV2({
    solution: evaluateV2Solution(filters, problem.desiredDb, problem.frequenciesHz, problem.sampleRateHz),
    desiredDb: problem.desiredDb,
    frequencies: problem.frequenciesHz,
    config,
    deadline: { isExpired: () => continuation.coordinateTrials >= evaluations || isExpired() },
  })
  while (!continuation.done) continuation = advanceJointRefineContinuationV2(continuation)
  const refinedFilters = canonical(continuation.solution.filters)
  return {
    refinedFilters,
    deliveredFilters: canonical(quantizeV2Filters(refinedFilters, config)),
    coordinateTrials: continuation.coordinateTrials,
  }
}

function candidatePoint(
  candidate: SolverLabCandidateV1,
  evaluation: SolverLabEvaluationV1,
  evaluationCount: number,
  elapsedMs: number,
  references: readonly ReferenceRegretPoint[],
): SolverTrajectoryPointV1 {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`structural beam candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const delivered = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId: candidate.candidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
  }, references)
  return {
    evaluationCount,
    elapsedMs,
    candidateId: candidate.candidateId,
    actualDeliveredFilterCount: delivered.filters.length,
    canonicalRmseDb: delivered.rmseDb,
    canonicalMaxAbsDb: delivered.maxAbsDb,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function diagnosticMetrics(
  filters: readonly Filter[],
  problem: StructuralBeamRunProblem,
): StructuralBeamDiagnosticMetrics {
  const solution = evaluateV2Solution(
    filters,
    problem.desiredDb,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )
  return {
    rmseDb: solution.metrics.rmseDb,
    maxAbsDb: solution.metrics.maxAbsDb,
    filterCount: filters.length,
    cancellationScore: 0,
  }
}

function diagnosticDelta(
  from: StructuralBeamDiagnosticMetrics,
  to: StructuralBeamDiagnosticMetrics,
  references: readonly ReferenceRegretPoint[],
): StructuralBeamDiagnosticDelta {
  const regret = (metrics: StructuralBeamDiagnosticMetrics): number =>
    directedReferenceRegret({
      candidateId: 'structural-beam-diagnostic-stage',
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      filterCount: metrics.filterCount,
    }, references).regret
  return {
    rmseDb: to.rmseDb - from.rmseDb,
    maxAbsDb: to.maxAbsDb - from.maxAbsDb,
    filterCount: to.filterCount - from.filterCount,
    referenceRegret: regret(to) - regret(from),
  }
}

function diagnosticPoint(
  candidateId: string,
  metrics: StructuralBeamDiagnosticMetrics,
  cancellationScore = metrics.cancellationScore,
): SelectorPoint {
  return {
    candidateId,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    filterCount: metrics.filterCount,
    cancellationScore,
  }
}

function diagnosticDominance(
  candidate: StructuralBeamDiagnosticMetrics,
  baseline: StructuralBeamDiagnosticMetrics,
): StructuralBeamDiagnosticDominance {
  const candidatePointValue = diagnosticPoint('candidate', candidate)
  const baselinePointValue = diagnosticPoint('baseline', baseline)
  if (dominates(candidatePointValue, baselinePointValue)) return 'candidate-dominates'
  if (dominates(baselinePointValue, candidatePointValue)) return 'baseline-dominates'
  if (Math.abs(candidate.rmseDb - baseline.rmseDb) <= 1e-12 &&
    Math.abs(candidate.maxAbsDb - baseline.maxAbsDb) <= 1e-12) return 'equivalent'
  return 'tradeoff'
}

function selectorOutcome<T extends 'parent' | 'primary'>(
  candidateId: string,
  candidate: StructuralBeamDiagnosticMetrics,
  baselineId: string,
  baseline: StructuralBeamDiagnosticMetrics,
  baselineKind: T,
): { selectedCandidateId: string; winner: 'candidate' | T } {
  const selectedCandidateId = selectReferencePoint([
    diagnosticPoint(baselineId, baseline),
    diagnosticPoint(candidateId, candidate),
  ]).candidateId
  return {
    selectedCandidateId,
    winner: selectedCandidateId === candidateId ? 'candidate' :
      baselineKind,
  }
}

function residualPeak(
  problem: StructuralBeamRunProblem,
  residualDb: readonly number[],
): { index: number; frequencyHz: number; residualDb: number } | null {
  if (residualDb.length === 0) return null
  let bestIndex = 0
  for (let index = 1; index < residualDb.length; index += 1) {
    if (Math.abs(residualDb[index]!) > Math.abs(residualDb[bestIndex]!)) bestIndex = index
  }
  return {
    index: bestIndex,
    frequencyHz: problem.frequenciesHz[bestIndex]!,
    residualDb: residualDb[bestIndex]!,
  }
}

export function structuralBoundSaturation(
  filters: readonly Filter[],
  problem: StructuralBeamProblem,
): StructuralBeamBoundSaturation[] {
  const epsilon = 1e-12
  return filters.flatMap((filter, filterIndex) => {
    const fields: string[] = []
    if (Math.abs(filter.frequencyHz - problem.bounds.minFrequencyHz) <= epsilon) fields.push('frequency-min')
    if (Math.abs(filter.frequencyHz - problem.bounds.maxFrequencyHz) <= epsilon) fields.push('frequency-max')
    if (Math.abs(filter.gainDb - problem.bounds.minGainDb) <= epsilon) fields.push('gain-min')
    if (Math.abs(filter.gainDb - problem.bounds.maxGainDb) <= epsilon) fields.push('gain-max')
    if (filter.type === 'PK' && Math.abs(filter.q - problem.bounds.minPkQ) <= epsilon) fields.push('q-min')
    if (filter.type === 'PK' && Math.abs(filter.q - problem.bounds.maxPkQ) <= epsilon) fields.push('q-max')
    return fields.length === 0 ? [] : [{ filterIndex, filterId: filter.id, fields }]
  })
}

interface StructuralBeamDiagnosticContext {
  parent: StructuralBeamState | null
  residualPeak: { index: number; frequencyHz: number; residualDb: number } | null
  mutation: StructuralMutation | 'seed-validation'
  proposalRank: number | null
  proposalOrdinal: number | null
  filtersBeforePolish: Filter[]
  boundedContinuousFilters: Filter[]
  coordinateTrials: number
}

function appendDiagnosticEntry(
  trace: StructuralBeamDiagnosticTrace | undefined,
  context: StructuralBeamDiagnosticContext,
  state: StructuralBeamState,
  point: SolverTrajectoryPointV1,
  primary: StructuralBeamState | undefined,
  problem: StructuralBeamRunProblem,
  references: readonly ReferenceRegretPoint[],
): void {
  if (trace?.enabled !== true) return
  const delivered = state.evaluation.deliverable
  if (delivered === null) throw new Error('diagnostic state requires delivered metrics')
  const prePolishMetrics = diagnosticMetrics(context.filtersBeforePolish, problem)
  const boundedContinuousMetrics = diagnosticMetrics(context.boundedContinuousFilters, problem)
  const canonicalMetrics: StructuralBeamDiagnosticMetrics = {
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
    cancellationScore: delivered.cancellationTotalScore,
  }
  const parentCanonical = context.parent === null ? null : statePoint(context.parent)
  const primaryCanonical = primary === undefined ? null : statePoint(primary)
  const entry: StructuralBeamDiagnosticEntry = {
    schemaVersion: STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION,
    stage: context.mutation === 'seed-validation' ? 'seed-validation' : 'descendant',
    evaluationIndex: point.evaluationCount,
    candidateId: state.candidate.candidateId,
    parentCandidateId: context.parent?.candidate.candidateId ?? null,
    parentCanonical: parentCanonical === null ? null : {
      rmseDb: parentCanonical.rmseDb,
      maxAbsDb: parentCanonical.maxAbsDb,
      filterCount: parentCanonical.filterCount,
      cancellationScore: parentCanonical.cancellationScore,
    },
    residualPeak: context.residualPeak,
    mutation: context.mutation,
    proposalRank: context.proposalRank,
    proposalOrdinal: context.proposalOrdinal,
    proposalSource: context.mutation === 'seed-validation'
      ? 'seed-validation' : 'structural-mutation-library-v1',
    filtersBeforePolish: cloneFilters(context.filtersBeforePolish),
    prePolish: {
      filters: cloneFilters(context.filtersBeforePolish),
      metrics: prePolishMetrics,
    },
    boundedContinuous: {
      filters: cloneFilters(context.boundedContinuousFilters),
      metrics: boundedContinuousMetrics,
      boundedLinearSolver: 'not-applicable',
      coordinateTrials: context.coordinateTrials,
    },
    canonical: {
      filters: cloneFilters(delivered.filters),
      metrics: canonicalMetrics,
      referenceRegret: point.referenceRegret,
      referenceImproved: point.referenceImproved,
    },
    bounds: {
      prePolish: structuralBoundSaturation(context.filtersBeforePolish, problem),
      boundedContinuous: structuralBoundSaturation(context.boundedContinuousFilters, problem),
      canonical: structuralBoundSaturation(delivered.filters, problem),
    },
    deltas: {
      prePolishToBoundedContinuous: diagnosticDelta(prePolishMetrics, boundedContinuousMetrics, references),
      boundedContinuousToCanonical: diagnosticDelta(boundedContinuousMetrics, canonicalMetrics, references),
      parentToCanonical: parentCanonical === null ? null : diagnosticDelta(
        {
          rmseDb: parentCanonical.rmseDb,
          maxAbsDb: parentCanonical.maxAbsDb,
          filterCount: parentCanonical.filterCount,
          cancellationScore: parentCanonical.cancellationScore,
        },
        canonicalMetrics,
        references,
      ),
      primaryToCanonical: primaryCanonical === null ? null : diagnosticDelta(
        {
          rmseDb: primaryCanonical.rmseDb,
          maxAbsDb: primaryCanonical.maxAbsDb,
          filterCount: primaryCanonical.filterCount,
          cancellationScore: primaryCanonical.cancellationScore,
        },
        canonicalMetrics,
        references,
      ),
    },
    dominance: {
      againstParent: parentCanonical === null ? null : diagnosticDominance(canonicalMetrics, {
        rmseDb: parentCanonical.rmseDb,
        maxAbsDb: parentCanonical.maxAbsDb,
        filterCount: parentCanonical.filterCount,
        cancellationScore: parentCanonical.cancellationScore,
      }),
      againstPrimary: primaryCanonical === null ? null : diagnosticDominance(canonicalMetrics, {
        rmseDb: primaryCanonical.rmseDb,
        maxAbsDb: primaryCanonical.maxAbsDb,
        filterCount: primaryCanonical.filterCount,
        cancellationScore: primaryCanonical.cancellationScore,
      }),
    },
    selector: {
      frozenSelector: 'reference-selector-v1',
      againstParent: parentCanonical === null ? null : selectorOutcome(
        state.candidate.candidateId,
        canonicalMetrics,
        context.parent!.candidate.candidateId,
        {
          rmseDb: parentCanonical.rmseDb,
          maxAbsDb: parentCanonical.maxAbsDb,
          filterCount: parentCanonical.filterCount,
          cancellationScore: parentCanonical.cancellationScore,
        },
        'parent',
      ),
      againstPrimary: primaryCanonical === null ? null : selectorOutcome(
        state.candidate.candidateId,
        canonicalMetrics,
        primary!.candidate.candidateId,
        {
          rmseDb: primaryCanonical.rmseDb,
          maxAbsDb: primaryCanonical.maxAbsDb,
          filterCount: primaryCanonical.filterCount,
          cancellationScore: primaryCanonical.cancellationScore,
        },
        'primary',
      ),
    },
    dictionary: { status: 'unknown', atomRank: null },
  }
  trace.entries.push(entry)
}

function dominatesTrajectory(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  return dominates(
    {
      candidateId: left.candidateId,
      rmseDb: left.canonicalRmseDb,
      maxAbsDb: left.canonicalMaxAbsDb,
      filterCount: left.actualDeliveredFilterCount,
      cancellationScore: 0,
    },
    {
      candidateId: right.candidateId,
      rmseDb: right.canonicalRmseDb,
      maxAbsDb: right.canonicalMaxAbsDb,
      filterCount: right.actualDeliveredFilterCount,
      cancellationScore: 0,
    },
  )
}

function appendBest(trajectory: SolverTrajectoryPointV1[], point: SolverTrajectoryPointV1): void {
  const previous = trajectory.at(-1)
  if (previous === undefined || dominatesTrajectory(point, previous)) {
    trajectory.push(point)
    return
  }
  if (dominatesTrajectory(previous, point)) return
  const chosen = selectReferencePoint([
    {
      candidateId: previous.candidateId,
      rmseDb: previous.canonicalRmseDb,
      maxAbsDb: previous.canonicalMaxAbsDb,
      filterCount: previous.actualDeliveredFilterCount,
      cancellationScore: 0,
    },
    {
      candidateId: point.candidateId,
      rmseDb: point.canonicalRmseDb,
      maxAbsDb: point.canonicalMaxAbsDb,
      filterCount: point.actualDeliveredFilterCount,
      cancellationScore: 0,
    },
  ])
  if (chosen.candidateId === point.candidateId) trajectory.push(point)
}

function originIsValid(origin: string): origin is StructuralBeamOrigin {
  return origin === 'zero' || origin === 'matching-pursuit' || origin === 'teacher-compression'
}

export function runStructuralBeam(input: StructuralBeamRunInput): StructuralBeamRunResult {
  if (!Number.isSafeInteger(input.seed) || input.seed < 0) throw new Error('structural beam seed must be an integer')
  positiveInteger(input.evaluationBudget, 'structural beam evaluationBudget')
  if (!/^[a-f0-9]{64}$/.test(input.referenceSnapshotSha256)) {
    throw new Error('reference snapshot hash is invalid')
  }
  if (input.referenceFrontier.length === 0) throw new Error('structural beam reference frontier is required')
  const config = input.config ?? STRUCTURAL_BEAM_VARIANTS['beam-4']!
  positiveInteger(config.beamWidth, 'beamWidth')
  positiveInteger(config.proposalsPerParent, 'proposalsPerParent')
  if (!Number.isSafeInteger(config.localPolishEvaluations) || config.localPolishEvaluations < 0) {
    throw new Error('localPolishEvaluations must be a non-negative integer')
  }
  positiveInteger(config.maxFilters, 'maxFilters')
  if (config.maxFilters > input.problem.bounds.maxFilters) {
    throw new Error('structural beam maxFilters exceeds problem maxFilters')
  }
  if (input.seeds?.some((seed) => !originIsValid(seed.origin))) {
    throw new Error('structural beam seed origin is unsupported')
  }
  const evaluate = input.evaluate ?? ((candidate) =>
    evaluateSolverLabCandidate(input.problem as SolverLabProblemV1, candidate))
  const nowMs = input.nowMs ?? (() => 0)
  const startedAt = nowMs()
  const candidates: SolverLabCandidateV1[] = []
  const evaluations: SolverLabEvaluationV1[] = []
  const trajectory: SolverTrajectoryPointV1[] = []
  const states: StructuralBeamState[] = []
  let evaluationsUsed = 0
  let proposalsConsidered = 0
  let layersExecuted = 0
  let deduplicatedProposals = 0
  let maxObservedFilterCount = 0
  let stopReason: StructuralBeamRunResult['stopReason'] = 'no-admissible-proposals'
  const visited = new Set<string>()
  const structuralOperationCounts: Record<StructuralMutation, number> = {
    'add-pk': 0,
    'add-ls': 0,
    'add-hs': 0,
    remove: 0,
    'type-mutation': 0,
    split: 0,
    merge: 0,
  }
  let primaryState: StructuralBeamState | undefined
  const record = (
    filters: readonly Filter[],
    origin: string,
    seedId: string,
    diagnosticContext?: StructuralBeamDiagnosticContext,
  ): StructuralBeamState => {
    const canonicalFilters = canonical(filters)
    const candidate: SolverLabCandidateV1 = {
      protocolVersion: 1,
      problemId: input.problem.problemId,
      inputSha256: input.problem.inputSha256,
      candidateId: `structural-beam-v1:${input.problem.problemId}:${input.seed}:${origin}:${seedId}:${String(candidates.length).padStart(4, '0')}`,
      algorithmId: 'structural-beam-v1',
      seed: input.seed,
      filters: canonicalFilters,
    }
    const evaluation = evaluate(candidate)
    const point = candidatePoint(
      candidate,
      evaluation,
      evaluationsUsed,
      Math.min(60_000, Math.max(0, input.elapsedMs?.() ?? nowMs() - startedAt)),
      input.referenceFrontier,
    )
    candidates.push(candidate)
    evaluations.push(evaluation)
    states.push({ candidate, evaluation, origin })
    appendBest(trajectory, point)
    input.onPoint?.(point, evaluation.deliverable?.filters ?? [])
    evaluationsUsed += 1
    maxObservedFilterCount = Math.max(maxObservedFilterCount, canonicalFilters.length)
    const state = states.at(-1)!
    if (diagnosticContext !== undefined) {
      appendDiagnosticEntry(
        input.diagnosticTrace,
        diagnosticContext,
        state,
        point,
        primaryState,
        input.problem,
        input.referenceFrontier,
      )
    }
    return state
  }

  const initialSeeds: StructuralBeamSeed[] = [
    ...(input.includeZeroSeed === false ? [] : [{ seedId: 'zero', origin: 'zero' as const, filters: [] }]),
    ...(input.seeds ?? []).map((seed) => ({ ...seed, filters: seed.filters.map((filter) => ({ ...filter })) })),
  ]
  for (const seed of initialSeeds) {
    if (seed.filters.length > config.maxFilters) throw new Error('structural beam seed exceeds maxFilters')
    if (input.isExpired?.()) break
    if (evaluationsUsed >= input.evaluationBudget) break
    const filters = quantizeV2Filters(seed.filters, quantizationConfig(input.problem))
    const key = semanticFilterKey(filters)
    if (visited.has(key)) {
      deduplicatedProposals += 1
      continue
    }
    visited.add(key)
    input.onWorkUnitStart?.()
    const initialState = record(
      filters,
      seed.origin,
      seed.seedId,
      input.diagnosticTrace?.enabled === true
        ? {
            parent: null,
            residualPeak: null,
            mutation: 'seed-validation',
            proposalRank: null,
            proposalOrdinal: null,
            filtersBeforePolish: filters,
            boundedContinuousFilters: filters,
            coordinateTrials: 0,
          }
        : undefined,
    )
    if (primaryState === undefined) primaryState = initialState
  }
  let beam = retainParetoBeam(states, config.beamWidth)
  while (evaluationsUsed < input.evaluationBudget) {
    if (input.isExpired?.()) {
      stopReason = 'deadline'
      break
    }
    layersExecuted += 1
    const generated: StructuralBeamState[] = []
    for (const [parentIndex, parent] of beam.entries()) {
      if (input.isExpired?.()) break
      if (evaluationsUsed >= input.evaluationBudget) break
      const delivered = parent.evaluation.deliverable
      if (delivered === null) throw new Error('structural beam parent has no deliverable')
      const actual = cascadeMagnitudeDb(
        parent.candidate.filters,
        input.problem.frequenciesHz,
        input.problem.sampleRateHz,
      )
      const residual = input.problem.desiredDb.map((desired, index) => desired - actual[index]!)
      const orderedProposals = orderStructuralProposals(
        generateStructuralMutations(input.problem, parent.candidate.filters, residual),
      )
      const admittedProposals = orderedProposals.slice(0, config.proposalsPerParent)
      const admissionDecision = input.admissionOverride?.apply({
        layerIndex: layersExecuted,
        parentIndex,
        parent,
        orderedProposals,
        admittedProposals,
      })
      const proposals = admissionDecision?.proposals ?? admittedProposals
      if (proposals.length > config.proposalsPerParent) {
        throw new Error('structural beam admission override exceeds proposalsPerParent')
      }
      for (const [proposalIndex, proposal] of proposals.entries()) {
        proposalsConsidered += 1
        structuralOperationCounts[proposal.mutation] += 1
        if (input.isExpired?.()) break
        if (evaluationsUsed >= input.evaluationBudget) break
        if (proposal.filters.length > config.maxFilters) continue
        input.onWorkUnitStart?.()
        const polished = polishStructuralProposal(
          input.problem,
          proposal.filters,
          config.localPolishEvaluations,
          input.isExpired ?? (() => false),
        )
        const quantized = quantizeStructuralBeamFilters(input.problem, polished.deliveredFilters)
        const key = semanticFilterKey(quantized)
        if (visited.has(key)) {
          deduplicatedProposals += 1
          continue
        }
        visited.add(key)
        generated.push(record(
          quantized,
          parent.origin,
          `proposal-${proposalsConsidered}-${proposal.mutation}`,
          input.diagnosticTrace?.enabled === true
            ? {
                parent,
                residualPeak: residualPeak(input.problem, residual),
                mutation: proposal.mutation,
                proposalRank: proposalIndex + 1,
                proposalOrdinal: proposalsConsidered,
                filtersBeforePolish: proposal.filters,
                boundedContinuousFilters: polished.refinedFilters,
                coordinateTrials: polished.coordinateTrials,
              }
            : undefined,
        ))
      }
    }
    if (input.isExpired?.()) {
      stopReason = 'deadline'
      break
    }
    if (generated.length === 0) {
      stopReason = 'no-admissible-proposals'
      break
    }
    beam = retainParetoBeam([...beam, ...generated], config.beamWidth)
    if (evaluationsUsed >= input.evaluationBudget) {
      stopReason = 'evaluation-budget'
      break
    }
  }
  const qualityTimePoints: QualityTimePoint[] = trajectory.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  }))
  return {
    algorithmId: 'structural-beam-v1',
    variantId: 'structural-beam-v1',
    seed: input.seed,
    evaluationBudget: input.evaluationBudget,
    trajectory,
    qualityTimeFrontierV1: computeQualityTimeFrontier(qualityTimePoints),
    candidates,
    evaluations,
    states: beam,
    proposalsConsidered,
    paretoRetained: beam.length,
    stopReason,
    structuralOperationCounts,
    metadata: {
      beamWidth: config.beamWidth,
      proposalsPerParent: config.proposalsPerParent,
      localPolishEvaluations: config.localPolishEvaluations,
      maxFilters: config.maxFilters,
      initialStateCount: initialSeeds.length,
      evaluatedStateCount: evaluationsUsed,
      layersExecuted,
      deduplicatedProposals,
      maxObservedFilterCount,
      capacityUnused: Math.max(0, config.maxFilters - maxObservedFilterCount),
      timingBasis: input.nowMs === undefined ? 'synthetic-evaluation-count' : 'injected-clock',
      ...(input.diagnosticTrace?.enabled === true
        ? { diagnosticTraceSchemaVersion: STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION }
        : {}),
    },
  }
}
