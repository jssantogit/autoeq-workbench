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

type StructuralBeamRunProblem = StructuralBeamProblem & Pick<SolverLabProblemV1, 'desiredDb'>

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

export interface StructuralBeamState {
  candidate: SolverLabCandidateV1
  evaluation: SolverLabEvaluationV1
  origin: StructuralBeamOrigin | string
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

function polish(
  problem: StructuralBeamRunProblem,
  filters: readonly Filter[],
  evaluations: number,
  isExpired: () => boolean,
): Filter[] {
  if (evaluations <= 0 || filters.length === 0) return canonical(filters)
  const config = quantizationConfig(problem)
  let continuation = createJointRefineContinuationV2({
    solution: evaluateV2Solution(filters, problem.desiredDb, problem.frequenciesHz, problem.sampleRateHz),
    desiredDb: problem.desiredDb,
    frequencies: problem.frequenciesHz,
    config,
    deadline: { isExpired: () => continuation.coordinateTrials >= evaluations || isExpired() },
  })
  while (!continuation.done) continuation = advanceJointRefineContinuationV2(continuation)
  return canonical(quantizeV2Filters(continuation.solution.filters, config))
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
  const record = (filters: readonly Filter[], origin: string, seedId: string): StructuralBeamState => {
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
    return states.at(-1)!
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
    record(filters, seed.origin, seed.seedId)
  }
  let beam = retainParetoBeam(states, config.beamWidth)
  while (evaluationsUsed < input.evaluationBudget) {
    if (input.isExpired?.()) {
      stopReason = 'deadline'
      break
    }
    layersExecuted += 1
    const generated: StructuralBeamState[] = []
    for (const parent of beam) {
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
      const proposals = orderStructuralProposals(
        generateStructuralMutations(input.problem, parent.candidate.filters, residual),
      ).slice(0, config.proposalsPerParent)
      for (const proposal of proposals) {
        proposalsConsidered += 1
        structuralOperationCounts[proposal.mutation] += 1
        if (input.isExpired?.()) break
        if (evaluationsUsed >= input.evaluationBudget) break
        if (proposal.filters.length > config.maxFilters) continue
        input.onWorkUnitStart?.()
        const polished = polish(
          input.problem,
          proposal.filters,
          config.localPolishEvaluations,
          input.isExpired ?? (() => false),
        )
        const quantized = quantizeV2Filters(polished, quantizationConfig(input.problem))
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
    },
  }
}
