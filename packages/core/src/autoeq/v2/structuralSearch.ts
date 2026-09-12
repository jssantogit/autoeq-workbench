import {
  cascadeMagnitudeDb,
  evaluateV2Solution,
  quantizeV2Filters,
  resolveStandardAutoEqV2Config,
  DEFAULT_AUTOEQ_SETTINGS,
  calculateErrorMetrics
} from '../../index.js'
import type { Filter } from '../../types/filter.js'
import {
  advanceJointRefineContinuationV2,
  createJointRefineContinuationV2,
} from './jointRefineContinuation.js'
import type { StandardAutoEqV2Config } from './config.js'
import type { StandardV2Deadline } from './runtime.js'
import { calculateV2NormalizedViolation } from './ranking.js'
import { auditCancellations } from '../cancellation.js'

export const MAX10_BASELINE_PRESET = 'max10-baseline' as const
export const MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET = 'max10-q31-b4-p8-experimental' as const

export type StructuralSearchPreset = typeof MAX10_BASELINE_PRESET | typeof MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET

export interface ResolvedStructuralSearchConfig {
  preset: StructuralSearchPreset
  beamWidth: number
  proposalsPerParent: number
  localPolishEvaluations: number
  maxFilters: number
  featureRegionCount?: number
  minFeatureSeparationOctaves?: number
  candidatePolicy?: 'legacy' | 'semantic'
  selectionMetric?: 'hypot' | 'violation'
  mergeProximityOctaves?: number
  marginalPruneTolerance?: number
  structuralCleanupMinFilters?: number
  structuralCleanupMaxSteps?: number
  admission: 'lexical' | 'q31-b4-p8' | 'metric'
}

export function resolveStructuralSearchConfig(options?: { preset?: StructuralSearchPreset | undefined }): ResolvedStructuralSearchConfig {
  if (options?.preset === MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET) {
    return {
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      beamWidth: 4,
      proposalsPerParent: 8,
      localPolishEvaluations: 24,
      maxFilters: 10,
      featureRegionCount: 6,
      minFeatureSeparationOctaves: 0.5,
      candidatePolicy: 'semantic',
      selectionMetric: 'violation',
      mergeProximityOctaves: 1 / 12 + 0.002,
      marginalPruneTolerance: 0.01,
      structuralCleanupMinFilters: 8,
      structuralCleanupMaxSteps: 3,
      admission: 'metric',
    }
  }
  return {
    preset: MAX10_BASELINE_PRESET,
    beamWidth: 2,
    proposalsPerParent: 4,
    localPolishEvaluations: 24,
    maxFilters: 10,
    featureRegionCount: 1,
    minFeatureSeparationOctaves: 0,
    candidatePolicy: 'legacy',
    selectionMetric: 'hypot',
    mergeProximityOctaves: 1 / 12,
    marginalPruneTolerance: 0,
    structuralCleanupMinFilters: 10,
    structuralCleanupMaxSteps: 0,
    admission: 'lexical',
  }
}

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function projectFilter(filter: Filter, bounds: StandardAutoEqV2Config): Filter {
  return {
    ...filter,
    frequencyHz: clamp(
      filter.frequencyHz,
      bounds.minFrequencyHz,
      bounds.maxFrequencyHz,
    ),
    gainDb: clamp(filter.gainDb, bounds.minGainDb, bounds.maxGainDb),
    q: filter.type === 'PK'
      ? clamp(filter.q, bounds.minPkQ, bounds.maxPkQ)
      : bounds.shelfQ ?? (Math.sqrt(bounds.minPkQ * bounds.maxPkQ)),
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

export interface ResidualFeature {
  frequencyHz: number
  residual: number
}

export function selectResidualFeatures(
  frequenciesHz: readonly number[],
  residualDb: readonly number[],
  bounds: StandardAutoEqV2Config,
  maxFeatures: number,
  minSeparationOctaves: number,
  includeEndpoints = true,
): ResidualFeature[] {
  if (
    frequenciesHz.length === 0 ||
    frequenciesHz.length !== residualDb.length ||
    maxFeatures <= 0
  ) return []

  const extrema: number[] = []
  const startIndex = includeEndpoints ? 0 : 1
  const endIndex = includeEndpoints ? residualDb.length : residualDb.length - 1
  for (let index = startIndex; index < endIndex; index += 1) {
    const magnitude = Math.abs(residualDb[index]!)
    const left = index === 0 || magnitude >= Math.abs(residualDb[index - 1]!)
    const right = index === residualDb.length - 1 || magnitude >= Math.abs(residualDb[index + 1]!)
    if (
      left &&
      right &&
      magnitude >= bounds.algorithm.candidateResidualFloorDb
    ) {
      extrema.push(index)
    }
  }

  extrema.sort((leftIndex, rightIndex) =>
    Math.abs(residualDb[rightIndex]!) - Math.abs(residualDb[leftIndex]!) ||
    frequenciesHz[leftIndex]! - frequenciesHz[rightIndex]!
  )

  const selected: ResidualFeature[] = []
  for (const index of extrema) {
    const frequencyHz = clamp(
      frequenciesHz[index]!,
      bounds.minFrequencyHz,
      bounds.maxFrequencyHz,
    )
    const separated = selected.every((feature) =>
      Math.abs(Math.log2(frequencyHz / feature.frequencyHz)) >= minSeparationOctaves
    )
    if (!separated) continue

    selected.push({ frequencyHz, residual: residualDb[index]! })
    if (selected.length >= maxFeatures) break
  }
  return selected
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

export interface ShelfEvidence {
  type: 'LS' | 'HS'
  frequencyHz: number
  residual: number
}

export function selectShelfEvidence(
  frequenciesHz: readonly number[],
  residualDb: readonly number[],
  bounds: StandardAutoEqV2Config,
): ShelfEvidence[] {
  if (frequenciesHz.length < 3 || frequenciesHz.length !== residualDb.length) return []

  const result: ShelfEvidence[] = []
  const evidenceCount = Math.max(3, Math.ceil(frequenciesHz.length / 4))

  for (const type of ['LS', 'HS'] as const) {
    const edgeIndex = type === 'LS' ? 0 : frequenciesHz.length - 1
    const direction = type === 'LS' ? 1 : -1
    const fixedStart = type === 'LS' ? 0 : frequenciesHz.length - evidenceCount
    let evidence = residualDb.slice(fixedStart, fixedStart + evidenceCount)
    let evidenceFrequencies = frequenciesHz.slice(fixedStart, fixedStart + evidenceCount)
    let signedMedian = median(evidence)
    const matching = evidence.filter((value) => Math.sign(value) === Math.sign(signedMedian)).length
    const fixedEvidenceUsable =
      Math.abs(signedMedian) >= bounds.algorithm.candidateResidualFloorDb &&
      matching / evidence.length >= 0.75 &&
      evidenceFrequencies.at(-1)! / evidenceFrequencies[0]! >= 1.4

    if (!fixedEvidenceUsable) {
      const edgeSign = Math.sign(residualDb[edgeIndex]!)
      const contiguousIndices: number[] = []
      for (
        let index = edgeIndex;
        index >= 0 && index < frequenciesHz.length;
        index += direction
      ) {
        const value = residualDb[index]!
        if (
          Math.abs(value) < bounds.algorithm.candidateResidualFloorDb ||
          Math.sign(value) !== edgeSign
        ) break
        contiguousIndices.push(index)
      }
      contiguousIndices.sort((left, right) => left - right)
      if (contiguousIndices.length < 3) continue
      evidence = contiguousIndices.map((index) => residualDb[index]!)
      evidenceFrequencies = contiguousIndices.map((index) => frequenciesHz[index]!)
      if (evidenceFrequencies.at(-1)! / evidenceFrequencies[0]! < 1.4) continue
      signedMedian = median(evidence)
    }

    const halfHeight = Math.abs(signedMedian) / 2
    const searchIndices = type === 'LS'
      ? Array.from({ length: frequenciesHz.length }, (_, index) => index)
      : Array.from({ length: frequenciesHz.length }, (_, index) => frequenciesHz.length - 1 - index)
    const transitionIndex = searchIndices.find((index) => Math.abs(residualDb[index]!) <= halfHeight) ??
      (type === 'LS' ? evidenceCount - 1 : frequenciesHz.length - evidenceCount)

    result.push({
      type,
      frequencyHz: clamp(
        frequenciesHz[transitionIndex]!,
        bounds.minFrequencyHz,
        bounds.maxFrequencyHz,
      ),
      residual: clamp(signedMedian, bounds.minGainDb, bounds.maxGainDb),
    })
  }
  return result
}

export function localPolishEvaluationBudget(
  baseEvaluations: number,
  filterCount: number,
): number {
  return Math.max(baseEvaluations, Math.max(0, filterCount) * 8)
}

function addProposal(
  filters: readonly Filter[],
  mutation: Extract<StructuralMutation, 'add-pk' | 'add-ls' | 'add-hs'>,
  type: Filter['type'],
  frequencyHz: number,
  residual: number,
  bounds: StandardAutoEqV2Config
): StructuralProposal {
  const gainDb = clamp(residual, bounds.minGainDb, bounds.maxGainDb)
  const q = type === 'PK'
    ? Math.sqrt(bounds.minPkQ * bounds.maxPkQ)
    : (bounds.shelfQ ?? Math.sqrt(bounds.minPkQ * bounds.maxPkQ))
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
  filters: readonly Filter[],
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bounds: StandardAutoEqV2Config,
  featureRegionCount = 1,
  minFeatureSeparationOctaves = 0,
  candidatePolicy: 'legacy' | 'semantic' = 'legacy',
  mergeProximityOctaves = 1 / 12,
): StructuralProposal[] {
  const current = filters.map((filter) => projectFilter(filter, bounds))
  const features = selectResidualFeatures(
    frequenciesHz,
    residualDb,
    bounds,
    featureRegionCount,
    minFeatureSeparationOctaves,
    candidatePolicy === 'legacy',
  )
  const proposals: StructuralProposal[] = []
  if (current.length < bounds.maxFilters) {
    if (candidatePolicy === 'semantic') {
      for (const { frequencyHz, residual } of features) {
        proposals.push(addProposal(current, 'add-pk', 'PK', frequencyHz, residual, bounds))
      }
      for (const shelf of selectShelfEvidence(frequenciesHz, residualDb, bounds)) {
        proposals.push(addProposal(
          current,
          shelf.type === 'LS' ? 'add-ls' : 'add-hs',
          shelf.type,
          shelf.frequencyHz,
          shelf.residual,
          bounds,
        ))
      }
    } else {
      for (const { frequencyHz, residual } of features) {
        proposals.push(
          addProposal(current, 'add-pk', 'PK', frequencyHz, residual, bounds),
          addProposal(current, 'add-ls', 'LS', frequencyHz, residual, bounds),
          addProposal(current, 'add-hs', 'HS', frequencyHz, residual, bounds),
        )
      }
    }
  }
  current.forEach((filter, index) => {
    proposals.push({
      mutation: 'remove',
      filters: canonical(current.filter((_, candidateIndex) => candidateIndex !== index)),
    })
    if (candidatePolicy === 'legacy' || filter.type !== 'PK') {
      const nextType: Filter['type'] = candidatePolicy === 'semantic'
        ? 'PK'
        : ({ PK: 'LS', LS: 'HS', HS: 'PK' } as const)[filter.type]
      proposals.push({
        mutation: 'type-mutation',
        filters: canonical([
          ...current.slice(0, index),
          projectFilter({ ...filter, type: nextType }, bounds),
          ...current.slice(index + 1),
        ]),
      })
    }
    if (
      current.length < bounds.maxFilters &&
      (candidatePolicy === 'legacy' || filter.type === 'PK')
    ) {
      const ratio = 2 ** (1 / 24)
      const first = projectFilter({
        ...filter,
        id: uniqueId(current, `${filter.id}-split-low`),
        frequencyHz: filter.frequencyHz / ratio,
        gainDb: filter.gainDb / 2,
      }, bounds)
      const second = projectFilter({
        ...filter,
        id: uniqueId([...current, first], `${filter.id}-split-high`),
        frequencyHz: filter.frequencyHz * ratio,
        gainDb: filter.gainDb / 2,
      }, bounds)
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
      if (
        left.type !== right.type ||
        Math.abs(Math.log2(left.frequencyHz / right.frequencyHz)) > mergeProximityOctaves
      ) {
        continue
      }
      const leftWeight = Math.abs(left.gainDb)
      const rightWeight = Math.abs(right.gainDb)
      const totalWeight = leftWeight + rightWeight
      const centerOctave = totalWeight > 0
        ? (leftWeight * Math.log2(left.frequencyHz) + rightWeight * Math.log2(right.frequencyHz)) / totalWeight
        : (Math.log2(left.frequencyHz) + Math.log2(right.frequencyHz)) / 2
      const merged = projectFilter({
        id: uniqueId(current, `merge-${left.id}-${right.id}`),
        enabled: left.enabled || right.enabled,
        type: left.type,
        frequencyHz: 2 ** centerOctave,
        gainDb: left.gainDb + right.gainDb,
        q: (left.q + right.q) / 2,
      }, bounds)
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

export function semanticFilterKey(filters: readonly Filter[]): string {
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

export interface SearchState {
  candidateId: string
  filters: Filter[]
  rmseDb: number
  maxAbsDb: number
  cancellationScore: number
}

function dominates(left: SearchState, right: SearchState): boolean {
  const epsilon = 1e-12
  return left.rmseDb <= right.rmseDb + epsilon &&
    left.maxAbsDb <= right.maxAbsDb + epsilon &&
    (left.rmseDb < right.rmseDb - epsilon || left.maxAbsDb < right.maxAbsDb - epsilon)
}

export function referenceSelectorKey(
  point: SearchState,
  metric: 'hypot' | 'violation' = 'hypot',
): readonly (number | string)[] {
  if (metric === 'violation') {
    return [
      Math.max(point.rmseDb / 0.25, point.maxAbsDb / 0.75),
      point.rmseDb,
      point.maxAbsDb,
      point.cancellationScore,
      point.filters.length,
      point.candidateId,
    ]
  }
  const achieved = point.rmseDb <= 0.25 && point.maxAbsDb <= 0.75
  return achieved
    ? [0, point.filters.length, point.rmseDb, point.maxAbsDb, point.cancellationScore, point.candidateId]
    : [1, Math.hypot(point.rmseDb / 0.25, point.maxAbsDb / 0.75), point.rmseDb, point.maxAbsDb, point.cancellationScore, point.filters.length, point.candidateId]
}

function compareKeys(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]!
    const rightValue = right[index]!
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

export function selectReferencePoint(
  points: readonly SearchState[],
  metric: 'hypot' | 'violation' = 'hypot',
): SearchState {
  return points.reduce((best, point) =>
    compareKeys(referenceSelectorKey(point, metric), referenceSelectorKey(best, metric)) < 0 ? point : best)
}

export function retainParetoBeam(
  states: readonly SearchState[],
  beamWidth: number,
  metric: 'hypot' | 'violation' = 'hypot',
): SearchState[] {
  if (states.length === 0) return []
  const frontier = states.filter((point, index) =>
    !states.some((other, otherIndex) => otherIndex !== index && dominates(other, point)))
  if (frontier.length <= beamWidth) {
    const ids = new Set(frontier.map((point) => point.candidateId))
    return states.filter((state) => ids.has(state.candidateId))
  }
  let remaining = [...frontier]
  const selected = new Set<string>()
  while (remaining.length > 0 && selected.size < beamWidth) {
    const chosen = selectReferencePoint(remaining, metric).candidateId
    selected.add(chosen)
    remaining = remaining.filter((point) => point.candidateId !== chosen)
  }
  return states.filter((state) => selected.has(state.candidateId))
}

export interface StructuralSearchInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  sampleRateHz: number
  config: ResolvedStructuralSearchConfig
  deadline: StandardV2Deadline
  seedFilters?: readonly Filter[]
  isExpired?: () => boolean
}

export interface StructuralSearchResult {
  filters: Filter[]
  rmseDb: number
  maxAbsDb: number
}

function evaluateStructuralFilters(
  filters: readonly Filter[],
  candidateId: string,
  bounds: StandardAutoEqV2Config,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): SearchState {
  const quantized = canonical(quantizeV2Filters(filters, bounds))
  const solution = evaluateV2Solution(quantized, desiredDb, frequencies, sampleRateHz)
  return {
    candidateId,
    filters: canonical(solution.filters),
    rmseDb: solution.metrics.rmseDb,
    maxAbsDb: solution.metrics.maxAbsDb,
    cancellationScore: solution.cancellationAudit.totalScore,
  }
}

function mergeStructuralPair(
  filters: readonly Filter[],
  leftIndex: number,
  rightIndex: number,
  bounds: StandardAutoEqV2Config,
): Filter[] {
  const left = filters[leftIndex]!
  const right = filters[rightIndex]!
  const leftWeight = Math.abs(left.gainDb)
  const rightWeight = Math.abs(right.gainDb)
  const totalWeight = leftWeight + rightWeight
  const centerOctave = totalWeight > 0
    ? (
        leftWeight * Math.log2(left.frequencyHz) +
        rightWeight * Math.log2(right.frequencyHz)
      ) / totalWeight
    : (Math.log2(left.frequencyHz) + Math.log2(right.frequencyHz)) / 2
  const merged = projectFilter({
    id: uniqueId(filters, `cleanup-merge-${left.id}-${right.id}`),
    enabled: left.enabled || right.enabled,
    type: left.type,
    frequencyHz: 2 ** centerOctave,
    gainDb: left.gainDb + right.gainDb,
    q: (left.q + right.q) / 2,
  }, bounds)

  return canonical([
    ...filters.filter((_, index) => index !== leftIndex && index !== rightIndex),
    merged,
  ])
}

function isCleanupWithinTolerance(
  anchor: SearchState,
  candidate: SearchState,
  tolerance: number,
): boolean {
  const anchorViolation = Math.max(anchor.rmseDb / 0.25, anchor.maxAbsDb / 0.75)
  const candidateViolation = Math.max(candidate.rmseDb / 0.25, candidate.maxAbsDb / 0.75)
  return candidateViolation - anchorViolation <= tolerance + 1e-12 &&
    (candidate.rmseDb - anchor.rmseDb) / 0.25 <= tolerance + 1e-12 &&
    (candidate.maxAbsDb - anchor.maxAbsDb) / 0.75 <= tolerance + 1e-12
}

export function simplifyStructuralState(
  state: SearchState,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  bounds: StandardAutoEqV2Config,
  mergeProximityOctaves: number,
  tolerance: number,
  maxSteps: number,
): SearchState {
  if (tolerance <= 0 || maxSteps <= 0 || state.filters.length === 0) return state

  const anchor = state
  let current = state

  for (let step = 0; step < maxSteps && current.filters.length > 0; step += 1) {
    const candidates: SearchState[] = []

    for (let index = 0; index < current.filters.length; index += 1) {
      const candidate = evaluateStructuralFilters(
        current.filters.filter((_, filterIndex) => filterIndex !== index),
        current.candidateId,
        bounds,
        desiredDb,
        frequencies,
        sampleRateHz,
      )
      if (isCleanupWithinTolerance(anchor, candidate, tolerance)) {
        candidates.push(candidate)
      }
    }

    for (let leftIndex = 0; leftIndex < current.filters.length; leftIndex += 1) {
      const left = current.filters[leftIndex]!
      for (let rightIndex = leftIndex + 1; rightIndex < current.filters.length; rightIndex += 1) {
        const right = current.filters[rightIndex]!
        if (
          left.type !== right.type ||
          Math.abs(Math.log2(left.frequencyHz / right.frequencyHz)) > mergeProximityOctaves
        ) continue

        const candidate = evaluateStructuralFilters(
          mergeStructuralPair(current.filters, leftIndex, rightIndex, bounds),
          current.candidateId,
          bounds,
          desiredDb,
          frequencies,
          sampleRateHz,
        )
        if (isCleanupWithinTolerance(anchor, candidate, tolerance)) {
          candidates.push(candidate)
        }
      }
    }

    if (candidates.length === 0) break

    candidates.sort((left, right) =>
      Math.max(left.rmseDb / 0.25, left.maxAbsDb / 0.75) -
        Math.max(right.rmseDb / 0.25, right.maxAbsDb / 0.75) ||
      left.rmseDb - right.rmseDb ||
      left.maxAbsDb - right.maxAbsDb ||
      left.cancellationScore - right.cancellationScore ||
      left.filters.length - right.filters.length ||
      semanticFilterKey(left.filters).localeCompare(semanticFilterKey(right.filters))
    )

    const next = candidates[0]!
    if (next.filters.length >= current.filters.length) break
    current = next
  }

  return current
}

export function pruneMarginalFilter(
  state: SearchState,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  tolerance: number,
): SearchState {
  const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
  return simplifyStructuralState(
    state,
    desiredDb,
    frequencies,
    sampleRateHz,
    bounds,
    0,
    tolerance,
    1,
  )
}

export function runStructuralSearch(input: StructuralSearchInput): StructuralSearchResult {
  const { desiredDb, frequencies, sampleRateHz, config, deadline } = input

  const bounds = resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    maxFilters: config.maxFilters,
  })

  const visited = new Set<string>()
  let initialFilters = input.seedFilters ?? []
  const quantized = quantizeV2Filters(initialFilters, bounds)
  visited.add(semanticFilterKey(quantized))

  const magnitude = cascadeMagnitudeDb(quantized, frequencies, sampleRateHz)
  const residualDb = desiredDb.map((desired, index) => desired - magnitude[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  const cancellationScore = auditCancellations(quantized, frequencies, sampleRateHz).totalScore

  let candidateCounter = 0
  const initialPolished: SearchState = {
    candidateId: String(candidateCounter++).padStart(4, '0'),
    filters: quantized,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    cancellationScore
  }
  let beam: SearchState[] = [initialPolished]

  while (beam.length > 0 && !deadline.isExpired()) {
    const nextStates: SearchState[] = []
    for (const parent of beam) {
      if (deadline.isExpired()) break

      const solution = evaluateV2Solution(parent.filters, desiredDb, frequencies, sampleRateHz)
      const proposals = generateStructuralMutations(
        parent.filters,
        solution.residualDb,
        frequencies,
        bounds,
        config.featureRegionCount ?? 1,
        config.minFeatureSeparationOctaves ?? 0,
        config.candidatePolicy ?? 'legacy',
        config.mergeProximityOctaves ?? 1 / 12,
      )
      const ordered = orderStructuralProposals(proposals)

      let admitted: StructuralProposal[] = []

      if (config.admission === 'q31-b4-p8' || config.admission === 'metric') {
        const prePolishScored = ordered.map((proposal, lexicalRank) => {
          const quantized = quantizeV2Filters(proposal.filters, bounds)
          const magnitude = cascadeMagnitudeDb(quantized, frequencies, sampleRateHz)
          const residualDb = desiredDb.map((desired, index) => desired - magnitude[index]!)
          const metrics = calculateErrorMetrics(residualDb, frequencies)
          const cancellationScore = auditCancellations(quantized, frequencies, sampleRateHz ?? 48000).totalScore

          return {
            key: proposalKey(proposal),
            proposal,
            lexicalRank,
            quantized,
            violation: calculateV2NormalizedViolation(metrics),
            rmseDb: metrics.rmseDb,
            maxAbsDb: metrics.maxAbsDb,
            filterCount: quantized.length,
            cancellationScore,
            semanticKey: proposalKey(proposal)
          }
        })

        const metricRanked = [...prePolishScored].sort((a, b) =>
          a.violation - b.violation ||
          a.rmseDb - b.rmseDb ||
          a.maxAbsDb - b.maxAbsDb ||
          a.cancellationScore - b.cancellationScore ||
          a.filterCount - b.filterCount ||
          a.lexicalRank - b.lexicalRank
        )
        admitted = config.admission === 'metric'
          ? metricRanked.slice(0, config.proposalsPerParent).map((item) => item.proposal)
          : selectQuotaProposals(
              prePolishScored,
              metricRanked,
              2,
              6,
              config.proposalsPerParent,
            ).map((item) => item.proposal)
      } else {
        admitted = ordered.slice(0, config.proposalsPerParent)
      }

      for (const proposal of admitted) {
        if (deadline.isExpired()) break
        if (proposal.filters.length > config.maxFilters) continue

        const polishEvaluations = localPolishEvaluationBudget(
          config.localPolishEvaluations,
          proposal.filters.length,
        )
        let polished = polishFilters(
          proposal.filters,
          polishEvaluations,
          bounds,
          desiredDb,
          frequencies,
          deadline,
          sampleRateHz,
        )
        if (
          (config.marginalPruneTolerance ?? 0) > 0 &&
          polished.filters.length >= (config.structuralCleanupMinFilters ?? config.maxFilters)
        ) {
          polished = simplifyStructuralState(
            polished,
            desiredDb,
            frequencies,
            sampleRateHz,
            bounds,
            config.mergeProximityOctaves ?? 1 / 12,
            config.marginalPruneTolerance ?? 0,
            config.structuralCleanupMaxSteps ?? 1,
          )
        }
        const key = semanticFilterKey(polished.filters)
        if (visited.has(key)) continue
        visited.add(key)

        polished.candidateId = String(candidateCounter++).padStart(4, '0')
        nextStates.push(polished)
      }
    }

    if (nextStates.length === 0) break
    const combined = [...beam, ...nextStates]
    beam = retainParetoBeam(
      combined,
      config.beamWidth,
      config.selectionMetric ?? 'hypot',
    )
  }

  if (beam.length === 0) {
    return {
      filters: initialPolished.filters,
      rmseDb: initialPolished.rmseDb,
      maxAbsDb: initialPolished.maxAbsDb
    }
  }

  const best = selectReferencePoint(beam, config.selectionMetric ?? 'hypot')
  const delivered = (config.marginalPruneTolerance ?? 0) > 0
    ? simplifyStructuralState(
        best,
        desiredDb,
        frequencies,
        sampleRateHz,
        bounds,
        config.mergeProximityOctaves ?? 1 / 12,
        config.marginalPruneTolerance ?? 0,
        config.structuralCleanupMaxSteps ?? 1,
      )
    : best
  return {
    filters: delivered.filters,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
  }
}

export function polishFilters(
  filters: readonly Filter[],
  evaluations: number,
  bounds: StandardAutoEqV2Config,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  deadline: StandardV2Deadline,
  sampleRateHz: number
): SearchState {
  if (evaluations <= 0 || filters.length === 0) {
    const refinedFilters = canonical(filters)
    const quantized = quantizeV2Filters(refinedFilters, bounds)
    const magnitude = cascadeMagnitudeDb(quantized, frequencies, sampleRateHz ?? 48000)
          const residualDb = desiredDb.map((desired, index) => desired - magnitude[index]!)
          const metrics = calculateErrorMetrics(residualDb, frequencies)
const cancellationScore = auditCancellations(quantized, frequencies, sampleRateHz ?? 48000).totalScore

    return {
      candidateId: 'initial',
      filters: quantized,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
      cancellationScore
    }
  }
  let continuation = createJointRefineContinuationV2({
    solution: evaluateV2Solution(filters, desiredDb, frequencies, sampleRateHz ?? 48000),
    desiredDb,
    frequencies,
    config: bounds,
    deadline: { isExpired: () => continuation.coordinateTrials >= evaluations || deadline.isExpired() },
  })
  while (!continuation.done) continuation = advanceJointRefineContinuationV2(continuation)
  const refinedFilters = canonical(continuation.solution.filters)
  const deliveredFilters = canonical(quantizeV2Filters(refinedFilters, bounds))
  const solution = evaluateV2Solution(deliveredFilters, desiredDb, frequencies, sampleRateHz ?? 48000)
  return {
    candidateId: 'initial',
    filters: deliveredFilters,
    rmseDb: solution.metrics.rmseDb,
    maxAbsDb: solution.metrics.maxAbsDb,
    cancellationScore: solution.cancellationAudit.totalScore
  }
}

export function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

export function selectQuotaProposals<T extends { proposal: any; key?: string; semanticKey?: string }>(
  scoredProposals: readonly T[],
  rmseRankedProposals: readonly T[],
  lexicalQuota = 6,
  rmseQuota = 2,
  targetCount = 8,
): T[] {
  const selected: T[] = []
  const seenKeys = new Set<string>()
  const getKey = (item: T) => item.key ?? item.semanticKey ?? ''

  for (const item of scoredProposals) {
    if (selected.length >= lexicalQuota) break
    const k = getKey(item)
    if (!seenKeys.has(k)) {
      seenKeys.add(k)
      selected.push(item)
    }
  }

  let addedRmse = 0
  for (const item of rmseRankedProposals) {
    if (addedRmse >= rmseQuota || selected.length >= targetCount) break
    const k = getKey(item)
    if (!seenKeys.has(k)) {
      seenKeys.add(k)
      selected.push(item)
      addedRmse += 1
    }
  }

  if (selected.length < targetCount) {
    for (const item of scoredProposals) {
      if (selected.length >= targetCount) break
      const k = getKey(item)
      if (!seenKeys.has(k)) {
        seenKeys.add(k)
        selected.push(item)
      }
    }
  }
  if (selected.length < targetCount) {
    for (const item of rmseRankedProposals) {
      if (selected.length >= targetCount) break
      const k = getKey(item)
      if (!seenKeys.has(k)) {
        seenKeys.add(k)
        selected.push(item)
      }
    }
  }

  return selected
}
