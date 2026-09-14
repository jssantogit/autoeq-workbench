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
import { auditCancellations } from '../cancellation.js'
import { generateV2Candidates, rankV2CandidateShortlist } from './candidates.js'

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
  workProfile: 'short-5s' | 'full'
}

export function resolveStructuralSearchConfig(options?: {
  preset?: StructuralSearchPreset | undefined
  timeLimitSeconds?: number | undefined
}): ResolvedStructuralSearchConfig {
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
      admission: 'q31-b4-p8',
      workProfile: options.timeLimitSeconds === 5 ? 'short-5s' : 'full',
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
    workProfile: options?.timeLimitSeconds === 5 ? 'short-5s' : 'full',
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

export interface StructuralCandidateMetadata {
  mutationFamily: StructuralMutation
  residualRegion: number
  sign: -1 | 0 | 1
  filterType: Filter['type']
  structuralRegion: number
}

export interface StructuralCandidatePoolEntry {
  proposal: StructuralProposal
  /** Present only when the structural diff proves one additive candidate. */
  metadata?: StructuralCandidateMetadata
  /** The same proven additive element used to construct a replacement. */
  candidateFilter?: Filter
  signature: string
}

interface M2StructuralChallenger {
  proposal: StructuralProposal
  source: 'residual-extremum' | 'shelf-evidence'
  residualRegion: number
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

function splitDepth(id: string): number {
  return id.split('-split-').length - 1
}

export interface ResidualFeature {
  frequencyHz: number
  residual: number
}

/**
 * Raw residual evidence that may indicate useful structural work remains.
 *
 * This is telemetry only.  It deliberately reports the number of local
 * residual extrema above the existing target max-absolute-error and the raw
 * maximum residual; it is not a scheduler score or acceptance criterion.
 */
export interface ResidualExpansionOpportunity {
  unresolvedResidualExtremaCount: number
  residualMaxAbsDb: number
}

export function measureResidualExpansionOpportunity(
  frequenciesHz: readonly number[],
  residualDb: readonly number[],
  bounds: StandardAutoEqV2Config,
): ResidualExpansionOpportunity {
  const metrics = calculateErrorMetrics(residualDb, frequenciesHz)
  let unresolvedResidualExtremaCount = 0
  const threshold = bounds.algorithm.targetMaxAbsDb

  for (let index = 0; index < residualDb.length; index += 1) {
    const magnitude = Math.abs(residualDb[index]!)
    const left = index === 0 || magnitude >= Math.abs(residualDb[index - 1]!)
    const right = index === residualDb.length - 1 || magnitude >= Math.abs(residualDb[index + 1]!)
    if (left && right && magnitude > threshold) {
      unresolvedResidualExtremaCount += 1
    }
  }

  return {
    unresolvedResidualExtremaCount,
    residualMaxAbsDb: metrics.maxAbsDb,
  }
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

function featureFrequency(
  frequenciesHz: readonly number[],
  residualDb: readonly number[],
  bounds: StandardAutoEqV2Config
): { frequencyHz: number; residual: number } {
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
  }, extrema[0] ?? 0)
  return {
    frequencyHz: clamp(
      frequenciesHz[index]!,
      bounds.minFrequencyHz,
      bounds.maxFrequencyHz,
    ),
    residual: residualDb[index]!,
  }
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

function generateStructuralMutationsCurrent(
  filters: readonly Filter[],
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bounds: StandardAutoEqV2Config
): StructuralProposal[] {
  const current = filters.map((filter) => projectFilter(filter, bounds))
  const { frequencyHz, residual } = featureFrequency(frequenciesHz, residualDb, bounds)
  const proposals: StructuralProposal[] = []
  if (current.length < bounds.maxFilters) {
    proposals.push(addProposal(current, 'add-pk', 'PK', frequencyHz, residual, bounds))
    const currentMetrics = calculateErrorMetrics(residualDb, frequenciesHz)
    const currentViolation = Math.max(
      currentMetrics.rmseDb / 0.25,
      currentMetrics.maxAbsDb / 0.75,
    )
    if (current.length >= bounds.maxFilters - 2 && currentViolation > 1) {
      const latePkCandidates = rankV2CandidateShortlist(
        generateV2Candidates({
          frequencies: frequenciesHz,
          residualDb,
          config: bounds,
          boundaryMode: 'mixed',
        }).filter((candidate) => candidate.type === 'PK')
      ).slice(0, 2)
      for (const candidate of latePkCandidates) {
        const lateFilter = projectFilter({
          id: uniqueId(current, 'struct-late-pk'),
          enabled: true,
          type: 'PK',
          frequencyHz: candidate.frequencyHz,
          gainDb: candidate.gainDb,
          q: candidate.q,
        }, bounds)
        proposals.push({
          mutation: 'add-pk',
          filters: canonical([...current, lateFilter]),
        })
      }
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
  }
  current.forEach((filter, index) => {
    proposals.push({
      mutation: 'remove',
      filters: canonical(current.filter((_, candidateIndex) => candidateIndex !== index)),
    })
    if (filter.type !== 'PK') {
      proposals.push({
        mutation: 'type-mutation',
        filters: canonical([
          ...current.slice(0, index),
          projectFilter({ ...filter, type: 'PK' }, bounds),
          ...current.slice(index + 1),
        ]),
      })
    }
    if (
      current.length < bounds.maxFilters &&
      (filter.type !== 'PK' || splitDepth(filter.id) < 2)
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
      if (left.type !== right.type || Math.abs(Math.log2(left.frequencyHz / right.frequencyHz)) > 1 / 12) {
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

function generateStructuralMutationsCompatibility(
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

export function generateStructuralMutations(
  filters: readonly Filter[],
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bounds: StandardAutoEqV2Config,
  featureRegionCount?: number,
  minFeatureSeparationOctaves?: number,
  candidatePolicy?: 'legacy' | 'semantic',
  mergeProximityOctaves?: number,
): StructuralProposal[] {
  if (
    featureRegionCount !== undefined ||
    minFeatureSeparationOctaves !== undefined ||
    candidatePolicy !== undefined ||
    mergeProximityOctaves !== undefined
  ) {
    return generateStructuralMutationsCompatibility(
      filters,
      residualDb,
      frequenciesHz,
      bounds,
      featureRegionCount ?? 1,
      minFeatureSeparationOctaves ?? 0,
      candidatePolicy ?? 'legacy',
      mergeProximityOctaves ?? (1 / 12),
    )
  }
  return generateStructuralMutationsCurrent(filters, residualDb, frequenciesHz, bounds)
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

export function referenceSelectorKey(point: SearchState): readonly (number | string)[] {
  const achieved = point.rmseDb <= 0.25 && point.maxAbsDb <= 0.75
  return achieved
    ? [0, point.filters.length, point.rmseDb, point.maxAbsDb, point.cancellationScore, point.candidateId]
    : [1, Math.max(point.rmseDb / 0.25, point.maxAbsDb / 0.75), point.rmseDb, point.maxAbsDb, point.cancellationScore, point.filters.length, point.candidateId]
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

/**
 * Compare only the existing reference quality ordering, not candidate identity
 * or structural tie-breakers.  The success bit is taken from
 * referenceSelectorKey, so M3 does not introduce a new target threshold.
 */
function referenceNumericKey(point: SearchState): readonly number[] {
  const selector = referenceSelectorKey(point)
  return [
    selector[0] as number,
    Math.max(point.rmseDb / 0.25, point.maxAbsDb / 0.75),
    point.rmseDb,
    point.maxAbsDb,
  ]
}

function sameStructuralSignatureSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

function sortedStructuralSignatures(values: ReadonlySet<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

export type StructuralImprovementPhase = 'beam' | 'rescue' | 'pair-add' | 'cap-swap' | 'vnext-replacement' | 'm2-challenger'

export interface StructuralIncumbentProvenance {
  state: SearchState
  phase: StructuralImprovementPhase
}

/** Keep phase attribution causal: a later phase owns provenance only on gain. */
export function updateStructuralIncumbentProvenance(
  incumbent: StructuralIncumbentProvenance,
  candidate: SearchState,
  phase: StructuralImprovementPhase,
): StructuralIncumbentProvenance {
  return compareKeys(referenceSelectorKey(candidate), referenceSelectorKey(incumbent.state)) < 0
    ? { state: candidate, phase }
    : incumbent
}

export function selectReferencePoint(points: readonly SearchState[]): SearchState {
  return points.reduce((best, point) =>
    compareKeys(referenceSelectorKey(point), referenceSelectorKey(best)) < 0 ? point : best)
}

export function retainParetoBeam(
  states: readonly SearchState[],
  beamWidth: number,
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
    const chosen = selectReferencePoint(remaining).candidateId
    selected.add(chosen)
    remaining = remaining.filter((point) => point.candidateId !== chosen)
  }
  return states.filter((state) => selected.has(state.candidateId))
}

/**
 * A deliberately coarse, ID-independent description of topology for the
 * research-only VNext explorer.  Its buckets derive from the active fit span
 * and existing feature-region budget; it is not a quality metric.
 */
export function structuralSignature(
  filters: readonly Filter[],
  bounds: StandardAutoEqV2Config,
  regionCount: number,
): string {
  const regions = Math.max(1, regionCount)
  const minLog = Math.log2(bounds.minFrequencyHz)
  const span = Math.max(Number.EPSILON, Math.log2(bounds.maxFrequencyHz) - minLog)
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return filters
    .map((filter) => {
      const position = (Math.log2(clamp(filter.frequencyHz, bounds.minFrequencyHz, bounds.maxFrequencyHz)) - minLog) / span
      const region = Math.min(regions - 1, Math.max(0, Math.floor(position * regions)))
      return `${filter.type}:${region}`
    })
    .sort((left, right) => {
      const [leftType, leftRegion] = left.split(':')
      const [rightType, rightRegion] = right.split(':')
      return order[leftType as Filter['type']] - order[rightType as Filter['type']] ||
        Number(leftRegion) - Number(rightRegion)
    })
    .join('|')
}

/** ID/order-independent multiset diff used by all VNext candidate identity. */
export function structuralFilterDifference(
  before: readonly Filter[], after: readonly Filter[],
): { added: Filter[]; removed: Filter[] } {
  const key = (filter: Filter) => JSON.stringify({ enabled: filter.enabled, type: filter.type, frequencyHz: filter.frequencyHz, gainDb: filter.gainDb, q: filter.q })
  const consume = (source: readonly Filter[], against: readonly Filter[]): Filter[] => {
    const counts = new Map<string, number>()
    for (const filter of against) counts.set(key(filter), (counts.get(key(filter)) ?? 0) + 1)
    return source.filter(filter => {
      const filterKey = key(filter); const count = counts.get(filterKey) ?? 0
      if (count === 0) return true
      counts.set(filterKey, count - 1); return false
    }).sort((left, right) => key(left).localeCompare(key(right)) || left.id.localeCompare(right.id))
  }
  return { added: consume(after, before), removed: consume(before, after) }
}

/**
 * Preserve one best representative for every useful topology before filling
 * remaining slots by the frozen reference ordering.  This is only used by
 * the explicit experimental path; retainParetoBeam remains the baseline.
 */
export function retainDiverseStructuralBeam(
  states: readonly SearchState[],
  beamWidth: number,
  bounds: StandardAutoEqV2Config,
  regionCount: number,
): SearchState[] {
  if (beamWidth <= 0 || states.length === 0) return []
  const ordered = [...states].sort((left, right) =>
    compareKeys(referenceSelectorKey(left), referenceSelectorKey(right)))
  const selected: SearchState[] = []
  const signatures = new Set<string>()
  for (const state of ordered) {
    const signature = structuralSignature(state.filters, bounds, regionCount)
    if (!signatures.has(signature)) {
      selected.push(state)
      signatures.add(signature)
      if (selected.length === beamWidth) return selected
    }
  }
  for (const state of ordered) {
    if (!selected.some((selectedState) => selectedState.candidateId === state.candidateId)) {
      selected.push(state)
      if (selected.length === beamWidth) break
    }
  }
  return selected
}

/** Build bounded, annotated VNext evidence from the existing mutation path. */
export function createRegionAwareCandidatePool(
  filters: readonly Filter[],
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bounds: StandardAutoEqV2Config,
  regionCount: number,
  maxEntries: number,
  generated?: readonly StructuralProposal[],
): StructuralCandidatePoolEntry[] {
  const regions = Math.max(1, regionCount)
  const minLog = Math.log2(bounds.minFrequencyHz)
  const span = Math.max(Number.EPSILON, Math.log2(bounds.maxFrequencyHz) - minLog)
  const regionFor = (frequencyHz: number): number => Math.min(regions - 1, Math.max(0,
    Math.floor(((Math.log2(frequencyHz) - minLog) / span) * regions)))
  const proposals = generated ?? generateStructuralMutations(filters, residualDb, frequenciesHz, bounds, regions,
    Math.log2(bounds.maxFrequencyHz / bounds.minFrequencyHz) / regions, 'semantic')
  return orderStructuralProposals(proposals).slice(0, maxEntries).map((proposal) => {
    const diff = structuralFilterDifference(filters, proposal.filters)
    // Additive metadata is valid only for an exact, one-element addition.
    // Removals, type changes, splits, and merges remain searchable, but do
    // not borrow identity from an arbitrary canonical array position.
    const candidateFilter = proposal.mutation.startsWith('add-') &&
      diff.added.length === 1 && diff.removed.length === 0
      ? diff.added[0]
      : undefined
    if (candidateFilter === undefined) return {
      proposal,
      signature: structuralSignature(proposal.filters, bounds, regions),
    }
    const frequencyHz = candidateFilter.frequencyHz
    const nearest = frequenciesHz.reduce((best, frequency, index) =>
      Math.abs(Math.log2(frequency / frequencyHz)) < Math.abs(Math.log2(frequenciesHz[best]! / frequencyHz)) ? index : best, 0)
    const residual = residualDb[nearest] ?? 0
    return {
      proposal,
      candidateFilter,
      metadata: {
        mutationFamily: proposal.mutation,
        residualRegion: regionFor(frequencyHz),
        sign: residual === 0 ? 0 : residual > 0 ? 1 : -1,
        filterType: candidateFilter.type,
        structuralRegion: regionFor(frequencyHz),
      },
      signature: structuralSignature(proposal.filters, bounds, regions),
    }
  })
}

/** Diversity first; callers fill no more than their existing proposal budget. */
export function admitDiverseStructuralCandidates(
  entries: readonly StructuralCandidatePoolEntry[],
  maxEntries: number,
): StructuralCandidatePoolEntry[] {
  const selected: StructuralCandidatePoolEntry[] = []
  const regions = new Set<number>()
  const families = new Set<StructuralMutation>()
  const signatures = new Set<string>()
  for (const entry of entries) {
    if (selected.length === maxEntries) return selected
    const region = entry.metadata?.residualRegion
    if ((region !== undefined && !regions.has(region)) || !families.has(entry.proposal.mutation) || !signatures.has(entry.signature)) {
      selected.push(entry)
      if (region !== undefined) regions.add(region)
      families.add(entry.proposal.mutation)
      signatures.add(entry.signature)
    }
  }
  for (const entry of entries) {
    if (selected.length === maxEntries) break
    if (!selected.includes(entry)) selected.push(entry)
  }
  return selected
}

export interface CapacityPressureDelta {
  /** Additive proposals actually constructed by the existing beam mutation path. */
  additiveProposalsGenerated: number
  /** Existing beam mutation gates reached with no filter slot; no candidate was built. */
  additiveMutationGatesBlockedByCapacity: number
  /** Existing rescue gate reached while unsolved but with no free filter slot. */
  rescueAddGatesBlockedByCapacity: number
  /** Existing pair-add gate reached while unsolved but fewer than two slots remained. */
  pairAddGatesBlockedByCapacity: number
}

export function createCapacityPressureDelta(): CapacityPressureDelta {
  return {
    additiveProposalsGenerated: 0,
    additiveMutationGatesBlockedByCapacity: 0,
    rescueAddGatesBlockedByCapacity: 0,
    pairAddGatesBlockedByCapacity: 0,
  }
}

export function addCapacityPressureDelta(
  left: CapacityPressureDelta,
  right: CapacityPressureDelta,
): CapacityPressureDelta {
  return {
    additiveProposalsGenerated: left.additiveProposalsGenerated + right.additiveProposalsGenerated,
    additiveMutationGatesBlockedByCapacity: left.additiveMutationGatesBlockedByCapacity + right.additiveMutationGatesBlockedByCapacity,
    rescueAddGatesBlockedByCapacity: left.rescueAddGatesBlockedByCapacity + right.rescueAddGatesBlockedByCapacity,
    pairAddGatesBlockedByCapacity: left.pairAddGatesBlockedByCapacity + right.pairAddGatesBlockedByCapacity,
  }
}

export interface FrontierUtilizationDelta {
  parentStatesObserved: number
  parentFilterCountMax: number
  generatedCandidateFilterCountMax: number
  admittedCandidateFilterCountMax: number
  polishedCandidateFilterCountMax: number
  parentsAtCapacity: number
  generatedCandidatesAtCapacity: number
  admittedCandidatesAtCapacity: number
  polishedCandidatesAtCapacity: number
  candidatesWithinOneSlotOfCapacity: number
}

export function createFrontierUtilizationDelta(): FrontierUtilizationDelta {
  return { parentStatesObserved: 0, parentFilterCountMax: 0, generatedCandidateFilterCountMax: 0, admittedCandidateFilterCountMax: 0, polishedCandidateFilterCountMax: 0, parentsAtCapacity: 0, generatedCandidatesAtCapacity: 0, admittedCandidatesAtCapacity: 0, polishedCandidatesAtCapacity: 0, candidatesWithinOneSlotOfCapacity: 0 }
}

export function addFrontierUtilizationDelta(left: FrontierUtilizationDelta, right: FrontierUtilizationDelta): FrontierUtilizationDelta {
  return {
    parentStatesObserved: left.parentStatesObserved + right.parentStatesObserved,
    parentFilterCountMax: Math.max(left.parentFilterCountMax, right.parentFilterCountMax),
    generatedCandidateFilterCountMax: Math.max(left.generatedCandidateFilterCountMax, right.generatedCandidateFilterCountMax),
    admittedCandidateFilterCountMax: Math.max(left.admittedCandidateFilterCountMax, right.admittedCandidateFilterCountMax),
    polishedCandidateFilterCountMax: Math.max(left.polishedCandidateFilterCountMax, right.polishedCandidateFilterCountMax),
    parentsAtCapacity: left.parentsAtCapacity + right.parentsAtCapacity,
    generatedCandidatesAtCapacity: left.generatedCandidatesAtCapacity + right.generatedCandidatesAtCapacity,
    admittedCandidatesAtCapacity: left.admittedCandidatesAtCapacity + right.admittedCandidatesAtCapacity,
    polishedCandidatesAtCapacity: left.polishedCandidatesAtCapacity + right.polishedCandidatesAtCapacity,
    candidatesWithinOneSlotOfCapacity: left.candidatesWithinOneSlotOfCapacity + right.candidatesWithinOneSlotOfCapacity,
  }
}

export interface StructuralSearchTraceEvent {
  type: 'start' | 'beam-generation' | 'beam-stop' | 'phase' | 'end'
  phase?: 'beam' | 'rescue' | 'pair-add' | 'cap-swap' | 'vnext-replacement' | 'm2-challenger'
  status?: 'start' | 'end'
  generation?: number
  reason?: 'deadline' | 'no-next-states' | 'completed'
  beamSize?: number
  generatedProposals?: number
  admittedProposals?: number
  polishedProposals?: number
  candidateSourceCounts?: Partial<Record<StructuralMutation, number>>
  residualRegionsGenerated?: number
  residualRegionsAdmitted?: number
  structuralSignaturesGenerated?: number
  structuralSignaturesAdmitted?: number
  structuralSignaturesRetained?: number
  stallDiversifications?: number
  replacementAttempts?: number
  replacementPolished?: number
  replacementAccepted?: number
  acceptedReplacementGain?: number
  bestImprovementPhase?: StructuralImprovementPhase
  finalImprovementPhase?: StructuralImprovementPhase
  duplicateStates?: number
  nextStates?: number
  /** Raw capacity-gate accounting for this trace event; never a quality estimate. */
  capacityPressure?: CapacityPressureDelta
  frontierUtilization?: FrontierUtilizationDelta
  acceptedSteps?: number
  /** Number of candidate polish calls attempted by a phase. */
  attempts?: number
  /** M2-only split accounting: ordinary work is never folded into challenger work. */
  ordinaryBeamGenerations?: number
  ordinaryProposalsGenerated?: number
  ordinaryProposalsAdmitted?: number
  ordinaryProposalsPolished?: number
  stallEvents?: number
  challengerCandidatesConstructed?: number
  challengerPolishAttempts?: number
  challengerAcceptedIntoBeam?: number
  challengerIncumbentImprovements?: number
  challengerSource?: 'residual-extremum' | 'shelf-evidence'
  challengerResidualRegion?: number
  finalIncumbentPhase?: StructuralImprovementPhase
  /** Largest retained beam observed by the M2 trace. */
  frontierMax?: number
  /** Alias for the delivered state filter count used by M2 reports. */
  deliveredFilterCount?: number
  filterCount: number
  rmseDb: number
  maxAbsDb: number
  violation: number
}

/** Predeclared diagnostic signals for the M3 structural-stagnation census. */
export type StructuralSearchM3Signal = 'S0' | 'S1' | 'S2' | 'S3' | 'S4'

export type StructuralSearchM3Signals = Record<StructuralSearchM3Signal, boolean>

/**
 * Shadow-only observation emitted after one ordinary baseline generation has
 * completed.  This callback is intentionally separate from search tracing so
 * the M3 census cannot be mistaken for a search policy or admission result.
 */
export interface StructuralSearchM3TelemetryEvent {
  type: 'ordinary-baseline-generation'
  generation: number
  referenceRmseDb: number
  referenceMaxAbsDb: number
  referenceViolation: number
  /** The filter count of the selected reference/deliverable state. */
  deliveredFilterCount: number
  referenceFilterCount: number
  referenceSignature: string
  retainedBeamSignatures: string[]
  retainedBeamSignatureCount: number
  generatedStructuralSignatures: string[]
  admittedStructuralSignatures: string[]
  survivingStructuralSignatures: string[]
  referenceSignatureChanged: boolean
  retainedBeamSignatureSetChanged: boolean
  newlyGeneratedStructuralSignatureSurvived: boolean
  /** Quality ordering uses the existing reference comparator semantics. */
  numericReferenceImprovement: boolean
  /** Existing target-success semantics; no fitted threshold is introduced. */
  unresolved: boolean
  signals: StructuralSearchM3Signals
  frontierMaxFilterCount: number
  capacityPressure: CapacityPressureDelta
  ordinaryWorkCounters: SearchWorkDelta
  frontierUtilization: FrontierUtilizationDelta
}

/**
 * Observer-only state checkpoint used by bounded research fidelity fixtures.
 *
 * This deliberately contains semantic search state rather than candidate IDs,
 * and is emitted only for the frozen baseline policy.  The callback receives
 * defensive filter copies so an observer cannot mutate the search state.
 */
export interface StructuralSearchBaselineStateEvent {
  type: 'ordinary-baseline-generation'
  generation: number
  reference: {
    filters: Filter[]
    rmseDb: number
    maxAbsDb: number
  }
  retainedBeam: Array<{
    filters: Filter[]
    rmseDb: number
    maxAbsDb: number
  }>
}

/**
 * Raw deterministic work observed while running one structural-search stage.
 *
 * These counters intentionally remain unweighted.  They describe work that is
 * already visible at the structural trace boundary; wall-clock timing and
 * lower-level evaluator calls are separate concerns.
 */
export interface SearchWorkDelta {
  structuralSearchInvocations: number
  beamGenerations: number
  proposalsGenerated: number
  proposalsAdmitted: number
  proposalsPolished: number
  duplicateStates: number
  rescueAttempts: number
  pairAddAttempts: number
  capSwapAttempts: number
  reseedAttempts: number
}

export type SearchWorkTotals = SearchWorkDelta

export function createSearchWorkDelta(): SearchWorkDelta {
  return {
    structuralSearchInvocations: 0,
    beamGenerations: 0,
    proposalsGenerated: 0,
    proposalsAdmitted: 0,
    proposalsPolished: 0,
    duplicateStates: 0,
    rescueAttempts: 0,
    pairAddAttempts: 0,
    capSwapAttempts: 0,
    reseedAttempts: 0,
  }
}

export function addSearchWorkDelta(
  left: SearchWorkDelta,
  right: SearchWorkDelta,
): SearchWorkDelta {
  return {
    structuralSearchInvocations: left.structuralSearchInvocations + right.structuralSearchInvocations,
    beamGenerations: left.beamGenerations + right.beamGenerations,
    proposalsGenerated: left.proposalsGenerated + right.proposalsGenerated,
    proposalsAdmitted: left.proposalsAdmitted + right.proposalsAdmitted,
    proposalsPolished: left.proposalsPolished + right.proposalsPolished,
    duplicateStates: left.duplicateStates + right.duplicateStates,
    rescueAttempts: left.rescueAttempts + right.rescueAttempts,
    pairAddAttempts: left.pairAddAttempts + right.pairAddAttempts,
    capSwapAttempts: left.capSwapAttempts + right.capSwapAttempts,
    reseedAttempts: left.reseedAttempts + right.reseedAttempts,
  }
}

/** Convert one existing structural trace event into raw work counters. */
export function capacityPressureDeltaFromTrace(
  event: StructuralSearchTraceEvent,
): CapacityPressureDelta {
  return event.capacityPressure === undefined
    ? createCapacityPressureDelta()
    : { ...event.capacityPressure }
}

export function searchWorkDeltaFromTrace(
  event: StructuralSearchTraceEvent,
): SearchWorkDelta {
  const delta = createSearchWorkDelta()
  if (event.type === 'beam-generation') {
    delta.beamGenerations = 1
    delta.proposalsGenerated = event.generatedProposals ?? 0
    delta.proposalsAdmitted = event.admittedProposals ?? 0
    delta.proposalsPolished = event.polishedProposals ?? 0
    delta.duplicateStates = event.duplicateStates ?? 0
  }
  if (
    event.type === 'phase' &&
    (event.attempts !== undefined || event.acceptedSteps !== undefined)
  ) {
    const attempts = event.attempts ?? event.acceptedSteps ?? 0
    if (event.phase === 'rescue') delta.rescueAttempts = attempts
    if (event.phase === 'pair-add') delta.pairAddAttempts = attempts
    if (event.phase === 'cap-swap') delta.capSwapAttempts = attempts
  }
  return delta
}

export interface StructuralSearchInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  sampleRateHz: number
  config: ResolvedStructuralSearchConfig
  deadline: StandardV2Deadline
  seedFilters?: readonly Filter[]
  isExpired?: () => boolean
  onTrace?: (event: StructuralSearchTraceEvent) => void
  /** M3-only shadow callback; ignored by every non-baseline policy. */
  onBaselineTelemetry?: (event: StructuralSearchM3TelemetryEvent) => void
  /** M3b-only state observer; ignored by every non-baseline policy. */
  onBaselineState?: (event: StructuralSearchBaselineStateEvent) => void
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

/**
 * Select the single bounded M2 challenger after a natural ordinary-search
 * stall.  Unlike M1, this helper is called for one reference parent only and
 * never constructs a standing mutation pool or reserves beam capacity.
 */
function constructM2StructuralChallenger(
  filters: readonly Filter[],
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bounds: StandardAutoEqV2Config,
  featureRegionCount: number,
  minFeatureSeparationOctaves: number,
  visited: ReadonlySet<string>,
): M2StructuralChallenger | undefined {
  if (filters.length >= bounds.maxFilters) return undefined

  const regions = Math.max(1, featureRegionCount)
  const minLog = Math.log2(bounds.minFrequencyHz)
  const span = Math.max(Number.EPSILON, Math.log2(bounds.maxFrequencyHz) - minLog)
  const residualRegion = (frequencyHz: number): number => Math.min(
    regions - 1,
    Math.max(0, Math.floor(((Math.log2(frequencyHz) - minLog) / span) * regions)),
  )

  // Interior extrema are preferred so an isolated edge spike cannot turn
  // into a shelf merely because a generation stalled.
  const features = selectResidualFeatures(
    frequenciesHz,
    residualDb,
    bounds,
    regions,
    Math.max(0, minFeatureSeparationOctaves),
    false,
  )
  for (const feature of features) {
    const proposal = addProposal(filters, 'add-pk', 'PK', feature.frequencyHz, feature.residual, bounds)
    if (structuralFilterDifference(filters, proposal.filters).added.length === 0) continue
    if (visited.has(semanticFilterKey(proposal.filters))) continue
    return {
      proposal,
      source: 'residual-extremum',
      residualRegion: residualRegion(feature.frequencyHz),
    }
  }

  // A sustained edge residual is the only fallback to a shelf.  This keeps
  // the challenger tied to existing evidence while retaining one-candidate
  // boundedness.
  for (const shelf of selectShelfEvidence(frequenciesHz, residualDb, bounds)) {
    const proposal = addProposal(
      filters,
      shelf.type === 'LS' ? 'add-ls' : 'add-hs',
      shelf.type,
      shelf.frequencyHz,
      shelf.residual,
      bounds,
    )
    if (structuralFilterDifference(filters, proposal.filters).added.length === 0) continue
    if (visited.has(semanticFilterKey(proposal.filters))) continue
    return {
      proposal,
      source: 'shelf-evidence',
      residualRegion: residualRegion(shelf.frequencyHz),
    }
  }

  return undefined
}

export function runStructuralSearch(input: StructuralSearchInput): StructuralSearchResult {
  return runStructuralSearchInternal(input, 'baseline')
}

export function runStructuralSearchVNext(input: StructuralSearchInput): StructuralSearchResult {
  return runStructuralSearchInternal(input, 'vnext')
}

/** Explicit research-only M2 selector; baseline and M1 selectors are controls. */
export function runStructuralSearchVNextM2(input: StructuralSearchInput): StructuralSearchResult {
  return runStructuralSearchInternal(input, 'm2')
}

/** Short alias for callers that identify the experiment by milestone. */
export function runStructuralSearchM2(input: StructuralSearchInput): StructuralSearchResult {
  return runStructuralSearchVNextM2(input)
}

function runStructuralSearchInternal(input: StructuralSearchInput, policy: 'baseline' | 'vnext' | 'm2'): StructuralSearchResult {
  const { desiredDb, frequencies, sampleRateHz, config, deadline } = input
  const trace = (event: StructuralSearchTraceEvent): void => input.onTrace?.(event)
  const stateTrace = (
    type: StructuralSearchTraceEvent['type'],
    state: Pick<SearchState, 'filters' | 'rmseDb' | 'maxAbsDb'>,
    extra: Omit<StructuralSearchTraceEvent, 'type' | 'filterCount' | 'rmseDb' | 'maxAbsDb' | 'violation'> = {},
  ): void => {
    trace({
      type,
      ...extra,
      filterCount: state.filters.length,
      rmseDb: state.rmseDb,
      maxAbsDb: state.maxAbsDb,
      violation: Math.max(state.rmseDb / 0.25, state.maxAbsDb / 0.75),
    })
  }
  const onBaselineTelemetry = policy === 'baseline' ? input.onBaselineTelemetry : undefined
  const onBaselineState = policy === 'baseline' ? input.onBaselineState : undefined

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
  const stateProvenance = new Map<string, StructuralImprovementPhase>([[initialPolished.candidateId, 'beam']])
  let beamGeneration = 0
  let incumbentProvenance: StructuralIncumbentProvenance = { state: initialPolished, phase: 'beam' }
  let m2StallEpisodeActive = false
  let m2FrontierMax = beam.length
  const telemetryRegionCount = Math.max(1, config.featureRegionCount ?? 1)
  let previousTelemetryReference = initialPolished
  let previousTelemetryBeamSignatures = new Set([
    structuralSignature(initialPolished.filters, bounds, telemetryRegionCount),
  ])
  stateTrace('start', initialPolished, { phase: 'beam', status: 'start' })

  while (beam.length > 0 && !deadline.isExpired()) {
    const ordinaryReferenceBefore = policy === 'm2' ? selectReferencePoint(beam) : undefined
    const nextStates: SearchState[] = []
    let generatedProposals = 0
    let admittedProposals = 0
    let polishedProposals = 0
    let duplicateStates = 0
    let vnextRegions = new Set<number>()
    let vnextAdmittedRegions = new Set<number>()
    let vnextGeneratedSignatures = new Set<string>()
    let vnextAdmittedSignatures = new Set<string>()
    const baselineGeneratedStructuralSignatures = new Set<string>()
    const baselineAdmittedStructuralSignatures = new Set<string>()
    const candidateSourceCounts: Partial<Record<StructuralMutation, number>> = {}
    const vnextPoolsByParent = new Map<string, StructuralCandidatePoolEntry[]>()
    let capacityPressure = createCapacityPressureDelta()
    let frontierUtilization = createFrontierUtilizationDelta()

    for (const parent of beam) {
      if (deadline.isExpired()) break

      frontierUtilization.parentStatesObserved += 1
      frontierUtilization.parentFilterCountMax = Math.max(frontierUtilization.parentFilterCountMax, parent.filters.length)
      if (parent.filters.length === config.maxFilters) frontierUtilization.parentsAtCapacity += 1
      const solution = evaluateV2Solution(parent.filters, desiredDb, frequencies, sampleRateHz)
      const proposals = policy === 'vnext'
        ? generateStructuralMutations(parent.filters, solution.residualDb, frequencies, bounds,
          config.featureRegionCount, config.minFeatureSeparationOctaves, config.candidatePolicy, config.mergeProximityOctaves)
        : generateStructuralMutations(parent.filters, solution.residualDb, frequencies, bounds)
      generatedProposals += proposals.length
      if (onBaselineTelemetry !== undefined) for (const proposal of proposals) {
        baselineGeneratedStructuralSignatures.add(
          structuralSignature(proposal.filters, bounds, telemetryRegionCount),
        )
      }
      if (policy === 'vnext') for (const proposal of proposals) {
        candidateSourceCounts[proposal.mutation] = (candidateSourceCounts[proposal.mutation] ?? 0) + 1
      }
      for (const proposal of proposals) {
        frontierUtilization.generatedCandidateFilterCountMax = Math.max(frontierUtilization.generatedCandidateFilterCountMax, proposal.filters.length)
        if (proposal.filters.length === config.maxFilters) frontierUtilization.generatedCandidatesAtCapacity += 1
        if (proposal.filters.length >= config.maxFilters - 1) frontierUtilization.candidatesWithinOneSlotOfCapacity += 1
      }
      capacityPressure.additiveProposalsGenerated += proposals.filter(
        (proposal) => proposal.filters.length > parent.filters.length,
      ).length
      if (parent.filters.length >= config.maxFilters) {
        // The generator's additive branches are skipped at this existing gate.
        // Count the gate, not hypothetical candidates or their quality.
        capacityPressure.additiveMutationGatesBlockedByCapacity += 1
      }
      const ordered = orderStructuralProposals(proposals)
      const vnextPool = policy === 'vnext'
        ? createRegionAwareCandidatePool(parent.filters, solution.residualDb, frequencies, bounds,
          config.featureRegionCount ?? 1, proposals.length, proposals)
        : []
      if (policy === 'vnext') vnextPoolsByParent.set(parent.candidateId, vnextPool)
      for (const entry of vnextPool) {
        if (entry.metadata !== undefined) vnextRegions.add(entry.metadata.residualRegion)
        vnextGeneratedSignatures.add(entry.signature)
      }

      let admitted: StructuralProposal[] = []

      if (config.admission === 'q31-b4-p8') {
        type PrePolishScore = {
          key: string; proposal: StructuralProposal; lexicalRank: number; quantized: Filter[]
          rmseDb: number; maxAbsDb: number; filterCount: number; cancellationScore: number; semanticKey: string
        }
        const scoreProposal = (proposal: StructuralProposal, lexicalRank: number): PrePolishScore => {
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
            rmseDb: metrics.rmseDb,
            maxAbsDb: metrics.maxAbsDb,
            filterCount: quantized.length,
            cancellationScore,
            semanticKey: proposalKey(proposal)
          }
        }
        // The frozen baseline scored its complete ordered proposal set without
        // cooperative checks at this boundary.  Keep that path byte-for-byte in
        // behavior; only VNext may stop its additional admission work early.
        const prePolishScored: PrePolishScore[] = policy !== 'vnext'
          ? ordered.map(scoreProposal)
          : []
        if (policy === 'vnext') for (const [lexicalRank, proposal] of ordered.entries()) {
          if (deadline.isExpired()) break
          prePolishScored.push(scoreProposal(proposal, lexicalRank))
        }

        const rmseRanked = [...prePolishScored].sort((a, b) =>
          a.rmseDb - b.rmseDb ||
          a.maxAbsDb - b.maxAbsDb ||
          a.filterCount - b.filterCount ||
          a.cancellationScore - b.cancellationScore ||
          a.lexicalRank - b.lexicalRank
        )
        const selected = selectQuotaProposals(prePolishScored, rmseRanked, 6, 2, config.proposalsPerParent)
        if (policy === 'vnext') {
          // Diversity selects first, but q31 remains the quality ordering for
          // representatives and every remaining fill slot.
          const q31Order = new Map<string, number>()
          for (const item of [...selected, ...rmseRanked, ...prePolishScored]) {
            if (!q31Order.has(item.key)) q31Order.set(item.key, q31Order.size)
          }
          const rankedPool = [...vnextPool].sort((left, right) =>
            (q31Order.get(proposalKey(left.proposal)) ?? Number.MAX_SAFE_INTEGER) -
            (q31Order.get(proposalKey(right.proposal)) ?? Number.MAX_SAFE_INTEGER))
          const diverse = admitDiverseStructuralCandidates(rankedPool, config.proposalsPerParent).map(entry => entry.proposal)
          const seen = new Set(diverse.map(proposalKey))
          for (const item of [...selected, ...rmseRanked, ...prePolishScored]) if (diverse.length < config.proposalsPerParent && !seen.has(proposalKey(item.proposal))) {
            diverse.push(item.proposal); seen.add(proposalKey(item.proposal))
          }
          admitted = diverse
        } else admitted = selected.map(s => s.proposal)
      } else {
        if (policy === 'vnext') {
          admitted = admitDiverseStructuralCandidates(vnextPool, config.proposalsPerParent).map(entry => entry.proposal)
          const seen = new Set(admitted.map(proposalKey))
          for (const proposal of ordered) if (admitted.length < config.proposalsPerParent && !seen.has(proposalKey(proposal))) {
            admitted.push(proposal); seen.add(proposalKey(proposal))
          }
        } else admitted = ordered.slice(0, config.proposalsPerParent)
      }
      admittedProposals += admitted.length
      if (onBaselineTelemetry !== undefined) for (const proposal of admitted) {
        baselineAdmittedStructuralSignatures.add(
          structuralSignature(proposal.filters, bounds, telemetryRegionCount),
        )
      }
      if (policy === 'vnext') for (const proposal of admitted) {
        const entry = vnextPool.find(candidate => proposalKey(candidate.proposal) === proposalKey(proposal))
        if (entry?.metadata !== undefined) vnextAdmittedRegions.add(entry.metadata.residualRegion)
        vnextAdmittedSignatures.add(structuralSignature(proposal.filters, bounds, config.featureRegionCount ?? 1))
      }
      for (const proposal of admitted) {
        frontierUtilization.admittedCandidateFilterCountMax = Math.max(frontierUtilization.admittedCandidateFilterCountMax, proposal.filters.length)
        if (proposal.filters.length === config.maxFilters) frontierUtilization.admittedCandidatesAtCapacity += 1
      }

      for (const proposal of admitted) {
        if (deadline.isExpired()) break
        if (proposal.filters.length > config.maxFilters) continue

        const polished = polishFilters(
          proposal.filters,
          Math.max(config.localPolishEvaluations, proposal.filters.length * 8),
          bounds,
          desiredDb,
          frequencies,
          deadline,
          sampleRateHz,
        )
        polishedProposals += 1
        frontierUtilization.polishedCandidateFilterCountMax = Math.max(frontierUtilization.polishedCandidateFilterCountMax, polished.filters.length)
        if (polished.filters.length === config.maxFilters) frontierUtilization.polishedCandidatesAtCapacity += 1
        const key = semanticFilterKey(polished.filters)
        if (visited.has(key)) {
          duplicateStates += 1
          continue
        }
        visited.add(key)

        polished.candidateId = String(candidateCounter++).padStart(4, '0')
        stateProvenance.set(polished.candidateId, 'beam')
        nextStates.push(polished)
      }
    }

    const ordinaryReferenceAfter = nextStates.length > 0
      ? selectReferencePoint([...beam, ...nextStates])
      : selectReferencePoint(beam)
    const ordinaryImproved = ordinaryReferenceBefore !== undefined &&
      compareKeys(referenceSelectorKey(ordinaryReferenceAfter), referenceSelectorKey(ordinaryReferenceBefore)) < 0
    const m2Stall = policy === 'm2' &&
      !deadline.isExpired() &&
      (nextStates.length === 0 || !ordinaryImproved)
    const m2Intervention = m2Stall && !m2StallEpisodeActive
    if (policy === 'm2') {
      if (!m2Stall) m2StallEpisodeActive = false
      else if (m2Intervention) m2StallEpisodeActive = true
    }

    let m2ChallengerCandidateId: string | undefined
    let m2ChallengerSource: M2StructuralChallenger['source'] | undefined
    let m2ChallengerResidualRegion: number | undefined
    let m2ChallengerCandidatesConstructed = 0
    let m2ChallengerPolishAttempts = 0
    let m2ChallengerAcceptedIntoBeam = 0
    let m2ChallengerIncumbentImprovements = 0

    const traceState = nextStates.length > 0
      ? selectReferencePoint([...beam, ...nextStates])
      : selectReferencePoint(beam)

    const emitBaselineGeneration = (retainedBeam: readonly SearchState[]): void => {
      if (retainedBeam.length === 0 || (onBaselineState === undefined && onBaselineTelemetry === undefined)) return

      const reference = selectReferencePoint(retainedBeam)
      onBaselineState?.({
        type: 'ordinary-baseline-generation',
        generation: beamGeneration,
        reference: {
          filters: reference.filters.map((filter) => ({ ...filter })),
          rmseDb: reference.rmseDb,
          maxAbsDb: reference.maxAbsDb,
        },
        retainedBeam: retainedBeam.map((state) => ({
          filters: state.filters.map((filter) => ({ ...filter })),
          rmseDb: state.rmseDb,
          maxAbsDb: state.maxAbsDb,
        })),
      })

      if (onBaselineTelemetry === undefined) return

      const referenceSignature = structuralSignature(
        reference.filters,
        bounds,
        telemetryRegionCount,
      )
      const retainedSignatures = new Set(
        retainedBeam.map((state) => structuralSignature(state.filters, bounds, telemetryRegionCount)),
      )
      const survivingSignatures = new Set(
        [...baselineGeneratedStructuralSignatures].filter((signature) => retainedSignatures.has(signature)),
      )
      const referenceSignatureChanged = referenceSignature !== structuralSignature(
        previousTelemetryReference.filters,
        bounds,
        telemetryRegionCount,
      )
      const retainedBeamSignatureSetChanged = !sameStructuralSignatureSet(
        retainedSignatures,
        previousTelemetryBeamSignatures,
      )
      const numericReferenceImprovement = compareKeys(
        referenceNumericKey(reference),
        referenceNumericKey(previousTelemetryReference),
      ) < 0
      const unresolved = referenceSelectorKey(reference)[0] !== 0
      const newlyGeneratedStructuralSignatureSurvived = [...survivingSignatures].some(
        (signature) => !previousTelemetryBeamSignatures.has(signature),
      )
      const signals: StructuralSearchM3Signals = {
        S0: unresolved && !numericReferenceImprovement,
        S1: unresolved && !referenceSignatureChanged,
        S2: unresolved && !retainedBeamSignatureSetChanged,
        S3: unresolved && !newlyGeneratedStructuralSignatureSurvived,
        S4: unresolved && !referenceSignatureChanged && !newlyGeneratedStructuralSignatureSurvived,
      }
      const ordinaryWorkCounters = createSearchWorkDelta()
      ordinaryWorkCounters.beamGenerations = 1
      ordinaryWorkCounters.proposalsGenerated = generatedProposals
      ordinaryWorkCounters.proposalsAdmitted = admittedProposals
      ordinaryWorkCounters.proposalsPolished = polishedProposals
      ordinaryWorkCounters.duplicateStates = duplicateStates
      const frontierMaxFilterCount = Math.max(
        reference.filters.length,
        ...retainedBeam.map((state) => state.filters.length),
        frontierUtilization.parentFilterCountMax,
        frontierUtilization.generatedCandidateFilterCountMax,
        frontierUtilization.admittedCandidateFilterCountMax,
        frontierUtilization.polishedCandidateFilterCountMax,
      )

      onBaselineTelemetry({
        type: 'ordinary-baseline-generation',
        generation: beamGeneration,
        referenceRmseDb: reference.rmseDb,
        referenceMaxAbsDb: reference.maxAbsDb,
        referenceViolation: Math.max(reference.rmseDb / 0.25, reference.maxAbsDb / 0.75),
        deliveredFilterCount: reference.filters.length,
        referenceFilterCount: reference.filters.length,
        referenceSignature,
        retainedBeamSignatures: sortedStructuralSignatures(retainedSignatures),
        retainedBeamSignatureCount: retainedSignatures.size,
        generatedStructuralSignatures: sortedStructuralSignatures(baselineGeneratedStructuralSignatures),
        admittedStructuralSignatures: sortedStructuralSignatures(baselineAdmittedStructuralSignatures),
        survivingStructuralSignatures: sortedStructuralSignatures(survivingSignatures),
        referenceSignatureChanged,
        retainedBeamSignatureSetChanged,
        newlyGeneratedStructuralSignatureSurvived,
        numericReferenceImprovement,
        unresolved,
        signals,
        frontierMaxFilterCount,
        capacityPressure: { ...capacityPressure },
        ordinaryWorkCounters,
        frontierUtilization: {
          ...frontierUtilization,
        },
      })

      previousTelemetryReference = reference
      previousTelemetryBeamSignatures = retainedSignatures
    }
    stateTrace('beam-generation', traceState, {
      phase: 'beam',
      generation: beamGeneration,
      beamSize: beam.length,
      generatedProposals,
      admittedProposals,
      polishedProposals,
      duplicateStates,
      ...(policy === 'vnext' ? { residualRegionsGenerated: vnextRegions.size, structuralSignaturesGenerated: vnextGeneratedSignatures.size, structuralSignaturesAdmitted: vnextAdmittedSignatures.size, structuralSignaturesRetained: new Set(beam.map(state => structuralSignature(state.filters, bounds, config.featureRegionCount ?? 1))).size } : {}),
      ...(policy === 'vnext' ? { candidateSourceCounts, residualRegionsAdmitted: vnextAdmittedRegions.size, bestImprovementPhase: incumbentProvenance.phase, finalImprovementPhase: incumbentProvenance.phase } : {}),
      ...(policy === 'm2' ? {
        ordinaryBeamGenerations: 1,
        ordinaryProposalsGenerated: generatedProposals,
        ordinaryProposalsAdmitted: admittedProposals,
        ordinaryProposalsPolished: polishedProposals,
        stallEvents: m2Intervention ? 1 : 0,
        frontierMax: beam.length,
        finalIncumbentPhase: incumbentProvenance.phase,
      } : {}),
      nextStates: nextStates.length,
      capacityPressure,
      frontierUtilization,
    })

    // M2 gets at most one challenger after a completed natural stall.  It is
    // deliberately not a replacement and never changes normal admission or
    // the fixed Pareto beam width.
    if (m2Intervention && !deadline.isExpired()) {
      const parent = selectReferencePoint(beam)
      const solution = evaluateV2Solution(parent.filters, desiredDb, frequencies, sampleRateHz)
      const challenger = constructM2StructuralChallenger(
        parent.filters,
        solution.residualDb,
        frequencies,
        bounds,
        config.featureRegionCount ?? 1,
        config.minFeatureSeparationOctaves ?? 0,
        visited,
      )
      if (challenger !== undefined) {
        m2ChallengerCandidatesConstructed = 1
        m2ChallengerSource = challenger.source
        m2ChallengerResidualRegion = challenger.residualRegion
        if (!deadline.isExpired()) {
          m2ChallengerPolishAttempts = 1
          const polished = polishFilters(
            challenger.proposal.filters,
            localPolishEvaluationBudget(config.localPolishEvaluations, challenger.proposal.filters.length),
            bounds,
            desiredDb,
            frequencies,
            deadline,
            sampleRateHz,
          )
          // A challenger whose polish crossed the external deadline is not
          // admitted; no work may be credited after deadline expiry.
          if (!deadline.isExpired()) {
            const key = semanticFilterKey(polished.filters)
            if (!visited.has(key)) {
              visited.add(key)
              polished.candidateId = String(candidateCounter++).padStart(4, '0')
              stateProvenance.set(polished.candidateId, 'm2-challenger')
              nextStates.push(polished)
              m2ChallengerCandidateId = polished.candidateId
            }
          }
        }
      }
    }

    // A stalled VNext generation spends ordinary proposal budget on a bounded
    // one-for-one basin escape before the unchanged late rescue phases.
    if (nextStates.length === 0 && policy === 'vnext' && !deadline.isExpired()) {
      const parent = selectReferencePoint(beam)
      const candidates = admitDiverseStructuralCandidates((vnextPoolsByParent.get(parent.candidateId) ?? [])
        .filter(entry => entry.proposal.mutation === 'add-pk' && entry.candidateFilter !== undefined), config.proposalsPerParent)
      const victims = parent.filters.map((_, index) => ({ index, state: evaluateStructuralFilters(
        parent.filters.filter((__, candidateIndex) => candidateIndex !== index), `vnext-victim-${index}`,
        bounds, desiredDb, frequencies, sampleRateHz,
      ) })).sort((left, right) => compareKeys(referenceSelectorKey(left.state), referenceSelectorKey(right.state)) || left.index - right.index)
        .slice(0, config.proposalsPerParent)
      let attempts = 0
      let replacementPolished = 0
      let replacementAccepted = 0
      let acceptedReplacementGain = 0
      for (const victim of victims) for (const candidate of candidates) {
        if (deadline.isExpired() || attempts >= config.proposalsPerParent) break
        // Proposals are canonicalized, so position is not candidate identity.
        // Find the structurally added filter without IDs or ordering.
        const replacementDiff = structuralFilterDifference(parent.filters, candidate.proposal.filters)
        if (replacementDiff.added.length !== 1 || replacementDiff.removed.length !== 0) continue
        const replacement = replacementDiff.added[0]!
        const kept = parent.filters.filter((_, index) => index !== victim.index)
        const polished = polishFilters(canonical([...kept, { ...replacement, id: uniqueId(kept, `vnext-replace-${attempts}`) }]),
          localPolishEvaluationBudget(config.localPolishEvaluations, parent.filters.length), bounds, desiredDb, frequencies, deadline, sampleRateHz)
        attempts += 1
        replacementPolished += 1
        const key = semanticFilterKey(polished.filters)
        if (visited.has(key)) continue
        visited.add(key)
        if (compareKeys(referenceSelectorKey(polished), referenceSelectorKey(parent)) < 0) {
          const gain = Math.max(parent.rmseDb / 0.25, parent.maxAbsDb / 0.75) -
            Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75)
          acceptedReplacementGain += gain
          replacementAccepted += 1
          polished.candidateId = String(candidateCounter++).padStart(4, '0')
          stateProvenance.set(polished.candidateId, 'vnext-replacement')
          nextStates.push(polished)
        }
      }
      if (attempts > 0) stateTrace('phase', nextStates[0] ?? parent, {
        phase: 'vnext-replacement', status: 'end', attempts, acceptedSteps: nextStates.length,
        stallDiversifications: 1, replacementAttempts: attempts,
        replacementPolished, replacementAccepted, acceptedReplacementGain,
        bestImprovementPhase: replacementAccepted > 0 ? 'vnext-replacement' : incumbentProvenance.phase,
        finalImprovementPhase: replacementAccepted > 0 ? 'vnext-replacement' : incumbentProvenance.phase,
      })
      if (replacementAccepted > 0) {
        incumbentProvenance = updateStructuralIncumbentProvenance(
          incumbentProvenance,
          selectReferencePoint(nextStates),
          'vnext-replacement',
        )
      }
    }
    if (nextStates.length === 0) {
      emitBaselineGeneration(beam)
      if (policy === 'm2' && m2Intervention) {
        stateTrace('phase', traceState, {
          phase: 'm2-challenger', status: 'end',
          stallEvents: 1,
          challengerCandidatesConstructed: m2ChallengerCandidatesConstructed,
          challengerPolishAttempts: m2ChallengerPolishAttempts,
          challengerAcceptedIntoBeam: 0,
          challengerIncumbentImprovements: 0,
          ...(m2ChallengerSource === undefined ? {} : {
            challengerSource: m2ChallengerSource,
            challengerResidualRegion: m2ChallengerResidualRegion,
          }),
          frontierMax: beam.length,
          finalIncumbentPhase: incumbentProvenance.phase,
        })
      }
      stateTrace('beam-stop', traceState, {
        phase: 'beam',
        generation: beamGeneration,
        reason: deadline.isExpired() ? 'deadline' : 'no-next-states',
      })
      break
    }
    const combined = [...beam, ...nextStates]
    beam = policy === 'vnext'
      ? retainDiverseStructuralBeam(combined, config.beamWidth, bounds, config.featureRegionCount ?? 1)
      : retainParetoBeam(combined, config.beamWidth)
    emitBaselineGeneration(beam)
    if (policy === 'm2') m2FrontierMax = Math.max(m2FrontierMax, beam.length)
    if (policy === 'vnext') {
      for (const state of beam) {
        const phase = stateProvenance.get(state.candidateId) ?? 'beam'
        incumbentProvenance = updateStructuralIncumbentProvenance(incumbentProvenance, state, phase)
      }
    }
    if (policy === 'm2') {
      if (m2ChallengerCandidateId !== undefined && beam.some((state) => state.candidateId === m2ChallengerCandidateId)) {
        m2ChallengerAcceptedIntoBeam = 1
        const challengerState = beam.find((state) => state.candidateId === m2ChallengerCandidateId)!
        if (ordinaryReferenceBefore !== undefined &&
          compareKeys(referenceSelectorKey(challengerState), referenceSelectorKey(ordinaryReferenceBefore)) < 0) {
          m2ChallengerIncumbentImprovements = 1
          incumbentProvenance = updateStructuralIncumbentProvenance(
            incumbentProvenance,
            challengerState,
            'm2-challenger',
          )
        }
      }
      for (const state of beam) {
        const phase = stateProvenance.get(state.candidateId) ?? 'beam'
        incumbentProvenance = updateStructuralIncumbentProvenance(incumbentProvenance, state, phase)
      }
      if (m2Intervention) {
        const interventionState = m2ChallengerCandidateId === undefined
          ? traceState
          : (beam.find((state) => state.candidateId === m2ChallengerCandidateId) ?? traceState)
        stateTrace('phase', interventionState, {
          phase: 'm2-challenger', status: 'end',
          stallEvents: 1,
          challengerCandidatesConstructed: m2ChallengerCandidatesConstructed,
          challengerPolishAttempts: m2ChallengerPolishAttempts,
          challengerAcceptedIntoBeam: m2ChallengerAcceptedIntoBeam,
          challengerIncumbentImprovements: m2ChallengerIncumbentImprovements,
          ...(m2ChallengerSource === undefined ? {} : {
            challengerSource: m2ChallengerSource,
            challengerResidualRegion: m2ChallengerResidualRegion,
          }),
          frontierMax: beam.length,
          finalIncumbentPhase: incumbentProvenance.phase,
        })
      }
    }
    beamGeneration += 1
  }

  if (beam.length === 0) {
    return {
      filters: initialPolished.filters,
      rmseDb: initialPolished.rmseDb,
      maxAbsDb: initialPolished.maxAbsDb
    }
  }

  const best = selectReferencePoint(beam)
  let rescued = best
  let rescueSteps = 0
  let rescueAttempts = 0
  const rescueBlockedByCapacity =
    rescueSteps < 5 &&
    rescued.filters.length >= config.maxFilters &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75)
  const epsilon = 1e-12
  stateTrace('phase', rescued, { phase: 'rescue', status: 'start' })

  while (
    rescueSteps < 5 &&
    rescued.filters.length < config.maxFilters &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75) &&
    !deadline.isExpired()
  ) {
    const currentSolution = evaluateV2Solution(
      rescued.filters,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const shortlist = rankV2CandidateShortlist(
      generateV2Candidates({
        frequencies,
        residualDb: currentSolution.residualDb,
        config: bounds,
        boundaryMode: 'mixed',
      }).filter((candidate) => candidate.type === 'PK')
    ).slice(0, 8)

    const improving: Array<{ state: SearchState; rank: number }> = []
    for (let rank = 0; rank < shortlist.length; rank += 1) {
      if (deadline.isExpired()) break
      const candidate = shortlist[rank]!
      const seeded = canonical([
        ...rescued.filters,
        projectFilter({
          id: uniqueId(rescued.filters, `stagnation-rescue-${rescueSteps}-${rank}`),
          enabled: true,
          type: 'PK',
          frequencyHz: candidate.frequencyHz,
          gainDb: candidate.gainDb,
          q: candidate.q,
        }, bounds),
      ])
      rescueAttempts += 1
      const polished = polishFilters(
        seeded,
        Math.max(config.localPolishEvaluations, seeded.length * 8),
        bounds,
        desiredDb,
        frequencies,
        deadline,
        sampleRateHz,
      )
      const paretoImproves =
        polished.rmseDb <= rescued.rmseDb + epsilon &&
        polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
        (
          polished.rmseDb < rescued.rmseDb - epsilon ||
          polished.maxAbsDb < rescued.maxAbsDb - epsilon
        )
      if (paretoImproves) improving.push({ state: polished, rank })
    }

    if (improving.length === 0) break
    improving.sort((left, right) => {
      const leftViolation = Math.max(left.state.rmseDb / 0.25, left.state.maxAbsDb / 0.75)
      const rightViolation = Math.max(right.state.rmseDb / 0.25, right.state.maxAbsDb / 0.75)
      return leftViolation - rightViolation ||
        left.state.rmseDb - right.state.rmseDb ||
        left.state.maxAbsDb - right.state.maxAbsDb ||
        left.rank - right.rank
    })
    rescued = improving[0]!.state
    if (policy === 'vnext' || policy === 'm2') incumbentProvenance = updateStructuralIncumbentProvenance(incumbentProvenance, rescued, 'rescue')
    rescueSteps += 1
  }

  stateTrace('phase', rescued, {
    phase: 'rescue',
    status: 'end',
    acceptedSteps: rescueSteps,
    attempts: rescueAttempts,
    capacityPressure: {
      ...createCapacityPressureDelta(),
      rescueAddGatesBlockedByCapacity: rescueBlockedByCapacity ? 1 : 0,
    },
    reason: deadline.isExpired() ? 'deadline' : 'completed',
  })

  let pairAddSteps = 0
  let pairAddAttempts = 0
  const pairAddBlockedByCapacity =
    rescued.filters.length > config.maxFilters - 2 &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75)
  stateTrace('phase', rescued, { phase: 'pair-add', status: 'start' })
  while (
    rescued.filters.length <= config.maxFilters - 2 &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75) &&
    !deadline.isExpired()
  ) {
    const currentSolution = evaluateV2Solution(
      rescued.filters,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const shortlist = rankV2CandidateShortlist(
      generateV2Candidates({
        frequencies,
        residualDb: currentSolution.residualDb,
        config: bounds,
        boundaryMode: 'mixed',
      }).filter((candidate) => candidate.type === 'PK')
    ).slice(0, 8)

    const improving: Array<{
      state: SearchState
      leftRank: number
      rightRank: number
      seedOrder: number
    }> = []

    for (let leftRank = 0; leftRank < shortlist.length; leftRank += 1) {
      const leftCandidate = shortlist[leftRank]!
      for (let rightRank = leftRank + 1; rightRank < shortlist.length; rightRank += 1) {
        if (deadline.isExpired()) break
        const rightCandidate = shortlist[rightRank]!
        const first = projectFilter({
          id: uniqueId(rescued.filters, `stagnation-pair-add-${pairAddSteps}-${leftRank}-a`),
          enabled: true,
          type: 'PK',
          frequencyHz: leftCandidate.frequencyHz,
          gainDb: leftCandidate.gainDb,
          q: leftCandidate.q,
        }, bounds)
        const second = projectFilter({
          id: uniqueId(
            [...rescued.filters, first],
            `stagnation-pair-add-${pairAddSteps}-${rightRank}-b`,
          ),
          enabled: true,
          type: 'PK',
          frequencyHz: rightCandidate.frequencyHz,
          gainDb: rightCandidate.gainDb,
          q: rightCandidate.q,
        }, bounds)
        const mutationOrdered = [...rescued.filters, first, second]
        const seedVariants = [
          canonical(mutationOrdered),
          mutationOrdered,
        ]
        for (let seedOrder = 0; seedOrder < seedVariants.length; seedOrder += 1) {
          if (deadline.isExpired()) break
          const seeded = seedVariants[seedOrder]!
          pairAddAttempts += 1
          const polished = polishFilters(
            seeded,
            Math.max(config.localPolishEvaluations, seeded.length * 24),
            bounds,
            desiredDb,
            frequencies,
            deadline,
            sampleRateHz,
          )
          const paretoImproves =
            polished.rmseDb <= rescued.rmseDb + epsilon &&
            polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
            (
              polished.rmseDb < rescued.rmseDb - epsilon ||
              polished.maxAbsDb < rescued.maxAbsDb - epsilon
            )
          if (paretoImproves) {
            improving.push({ state: polished, leftRank, rightRank, seedOrder })
          }
        }
      }
    }

    if (improving.length === 0) break
    improving.sort((left, right) => {
      const leftViolation = Math.max(
        left.state.rmseDb / 0.25,
        left.state.maxAbsDb / 0.75,
      )
      const rightViolation = Math.max(
        right.state.rmseDb / 0.25,
        right.state.maxAbsDb / 0.75,
      )
      return leftViolation - rightViolation ||
        left.state.rmseDb - right.state.rmseDb ||
        left.state.maxAbsDb - right.state.maxAbsDb ||
        left.leftRank - right.leftRank ||
        left.rightRank - right.rightRank ||
        left.seedOrder - right.seedOrder
    })
    rescued = improving[0]!.state
    if (policy === 'vnext' || policy === 'm2') incumbentProvenance = updateStructuralIncumbentProvenance(incumbentProvenance, rescued, 'pair-add')
    pairAddSteps += 1
  }
  stateTrace('phase', rescued, {
    phase: 'pair-add',
    status: 'end',
    acceptedSteps: pairAddSteps,
    attempts: pairAddAttempts,
    capacityPressure: {
      ...createCapacityPressureDelta(),
      pairAddGatesBlockedByCapacity: pairAddBlockedByCapacity ? 1 : 0,
    },
    reason: deadline.isExpired() ? 'deadline' : 'completed',
  })

  let capSwapSteps = 0
  let capSwapAttempts = 0
  stateTrace('phase', rescued, { phase: 'cap-swap', status: 'start' })
  while (
    capSwapSteps < (config.workProfile === 'short-5s' ? 2 : 4) &&
    rescued.filters.length === config.maxFilters &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75) &&
    !deadline.isExpired()
  ) {
    const currentSolution = evaluateV2Solution(
      rescued.filters,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const shortlist = rankV2CandidateShortlist(
      generateV2Candidates({
        frequencies,
        residualDb: currentSolution.residualDb,
        config: bounds,
        boundaryMode: 'mixed',
      }).filter((candidate) => candidate.type === 'PK')
    ).slice(0, 8)

    const improving: Array<{ state: SearchState; rank: number; replacementIndex: number }> = []
    for (let rank = 0; rank < shortlist.length; rank += 1) {
      if (deadline.isExpired()) break
      const candidate = shortlist[rank]!
      for (let replacementIndex = 0; replacementIndex < rescued.filters.length; replacementIndex += 1) {
        if (deadline.isExpired()) break
        const retained = rescued.filters.filter((_, index) => index !== replacementIndex)
        const seeded = canonical([
          ...retained,
          projectFilter({
            id: uniqueId(retained, `stagnation-cap-swap-${capSwapSteps}-${rank}-${replacementIndex}`),
            enabled: true,
            type: 'PK',
            frequencyHz: candidate.frequencyHz,
            gainDb: candidate.gainDb,
            q: candidate.q,
          }, bounds),
        ])
        capSwapAttempts += 1
        const polished = polishFilters(
          seeded,
          Math.max(config.localPolishEvaluations, seeded.length * 8),
          bounds,
          desiredDb,
          frequencies,
          deadline,
          sampleRateHz,
        )
        const paretoImproves =
          polished.rmseDb <= rescued.rmseDb + epsilon &&
          polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
          (
            polished.rmseDb < rescued.rmseDb - epsilon ||
            polished.maxAbsDb < rescued.maxAbsDb - epsilon
          )
        if (paretoImproves) improving.push({ state: polished, rank, replacementIndex })
      }
    }

    if (improving.length === 0) break
    improving.sort((left, right) => {
      const leftViolation = Math.max(left.state.rmseDb / 0.25, left.state.maxAbsDb / 0.75)
      const rightViolation = Math.max(right.state.rmseDb / 0.25, right.state.maxAbsDb / 0.75)
      return leftViolation - rightViolation ||
        left.state.rmseDb - right.state.rmseDb ||
        left.state.maxAbsDb - right.state.maxAbsDb ||
        left.rank - right.rank ||
        left.replacementIndex - right.replacementIndex
    })
    rescued = improving[0]!.state
    if (policy === 'vnext' || policy === 'm2') incumbentProvenance = updateStructuralIncumbentProvenance(incumbentProvenance, rescued, 'cap-swap')
    capSwapSteps += 1
  }

  stateTrace('phase', rescued, {
    phase: 'cap-swap',
    status: 'end',
    acceptedSteps: capSwapSteps,
    attempts: capSwapAttempts,
    reason: deadline.isExpired() ? 'deadline' : 'completed',
  })

  const postSwapViolation = Math.max(
    rescued.rmseDb / 0.25,
    rescued.maxAbsDb / 0.75,
  )
  if (config.workProfile === 'short-5s' && postSwapViolation > 1.6) {
    if (policy === 'vnext' || policy === 'm2') stateTrace('end', rescued, {
      reason: deadline.isExpired() ? 'deadline' : 'completed',
      ...(policy === 'vnext' ? {
        bestImprovementPhase: incumbentProvenance.phase,
        finalImprovementPhase: incumbentProvenance.phase,
      } : {
        finalIncumbentPhase: incumbentProvenance.phase,
        frontierMax: m2FrontierMax,
        deliveredFilterCount: rescued.filters.length,
      }),
    })
    return {
      filters: rescued.filters,
      rmseDb: rescued.rmseDb,
      maxAbsDb: rescued.maxAbsDb,
    }
  }

  if (
    rescued.filters.length === config.maxFilters &&
    (rescued.rmseDb > 0.25 || rescued.maxAbsDb > 0.75) &&
    !deadline.isExpired()
  ) {
    const currentSolution = evaluateV2Solution(
      rescued.filters,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const shortlist = rankV2CandidateShortlist(
      generateV2Candidates({
        frequencies,
        residualDb: currentSolution.residualDb,
        config: bounds,
        boundaryMode: 'mixed',
      }).filter((candidate) => candidate.type === 'PK')
    ).slice(0, 8)

    const improving: Array<{
      state: SearchState
      rank: number
      shelfIndex: number
      pkIndex: number
    }> = []

    for (let shelfIndex = 0; shelfIndex < rescued.filters.length; shelfIndex += 1) {
      const shelf = rescued.filters[shelfIndex]!
      if (shelf.type !== 'LS' && shelf.type !== 'HS') continue

      for (let pkIndex = 0; pkIndex < rescued.filters.length; pkIndex += 1) {
        if (pkIndex === shelfIndex) continue
        const pk = rescued.filters[pkIndex]!
        if (pk.type !== 'PK') continue

        const sameEdge = shelf.type === 'LS'
          ? pk.frequencyHz <= shelf.frequencyHz
          : pk.frequencyHz >= shelf.frequencyHz
        const distance = Math.abs(Math.log2(pk.frequencyHz / shelf.frequencyHz))
        if (!sameEdge || distance > 1) continue

        for (let rank = 0; rank < shortlist.length; rank += 1) {
          if (deadline.isExpired()) break
          const candidate = shortlist[rank]!
          const retained = rescued.filters.filter(
            (_, index) => index !== shelfIndex && index !== pkIndex,
          )
          const compressed = projectFilter({
            id: uniqueId(retained, `stagnation-edge-compress-${shelfIndex}-${pkIndex}`),
            enabled: true,
            type: 'PK',
            frequencyHz: pk.frequencyHz,
            gainDb: pk.gainDb + shelf.gainDb * 0.75,
            q: shelf.q * (2 / 3),
          }, bounds)
          const added = projectFilter({
            id: uniqueId(
              [...retained, compressed],
              `stagnation-edge-recycle-${rank}`,
            ),
            enabled: true,
            type: 'PK',
            frequencyHz: candidate.frequencyHz,
            gainDb: candidate.gainDb,
            q: candidate.q,
          }, bounds)
          const seeded = canonical([...retained, compressed, added])
          const polished = polishFilters(
            seeded,
            Math.max(config.localPolishEvaluations, seeded.length * 32),
            bounds,
            desiredDb,
            frequencies,
            deadline,
            sampleRateHz,
          )
          const paretoImproves =
            polished.rmseDb <= rescued.rmseDb + epsilon &&
            polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
            (
              polished.rmseDb < rescued.rmseDb - epsilon ||
              polished.maxAbsDb < rescued.maxAbsDb - epsilon
            )
          if (paretoImproves) {
            improving.push({ state: polished, rank, shelfIndex, pkIndex })
          }
        }
      }
    }

    if (improving.length > 0) {
      improving.sort((left, right) => {
        const leftViolation = Math.max(
          left.state.rmseDb / 0.25,
          left.state.maxAbsDb / 0.75,
        )
        const rightViolation = Math.max(
          right.state.rmseDb / 0.25,
          right.state.maxAbsDb / 0.75,
        )
        return leftViolation - rightViolation ||
          left.state.rmseDb - right.state.rmseDb ||
          left.state.maxAbsDb - right.state.maxAbsDb ||
          left.rank - right.rank ||
          left.shelfIndex - right.shelfIndex ||
          left.pkIndex - right.pkIndex
      })
      rescued = improving[0]!.state
    }
  }

  if (config.workProfile === 'short-5s' && postSwapViolation > 1) {
    if (policy === 'vnext' || policy === 'm2') stateTrace('end', rescued, {
      reason: deadline.isExpired() ? 'deadline' : 'completed',
      ...(policy === 'vnext' ? {
        bestImprovementPhase: incumbentProvenance.phase,
        finalImprovementPhase: incumbentProvenance.phase,
      } : {
        finalIncumbentPhase: incumbentProvenance.phase,
        frontierMax: m2FrontierMax,
        deliveredFilterCount: rescued.filters.length,
      }),
    })
    return {
      filters: rescued.filters,
      rmseDb: rescued.rmseDb,
      maxAbsDb: rescued.maxAbsDb,
    }
  }

  let interiorRecycled = false
  if (
    rescued.filters.length === config.maxFilters &&
    Math.max(rescued.rmseDb / 0.25, rescued.maxAbsDb / 0.75) > 1 &&
    !deadline.isExpired()
  ) {
    const currentSolution = evaluateV2Solution(
      rescued.filters,
      desiredDb,
      frequencies,
      sampleRateHz,
    )
    const shortlist = rankV2CandidateShortlist(
      generateV2Candidates({
        frequencies,
        residualDb: currentSolution.residualDb,
        config: bounds,
        boundaryMode: 'mixed',
      }).filter((candidate) => candidate.type === 'PK')
    ).slice(0, 8)

    const improving: Array<{
      state: SearchState
      rank: number
      leftIndex: number
      rightIndex: number
      seedOrder: number
    }> = []

    for (let leftIndex = 0; leftIndex < rescued.filters.length; leftIndex += 1) {
      const left = rescued.filters[leftIndex]!
      for (let rightIndex = leftIndex + 1; rightIndex < rescued.filters.length; rightIndex += 1) {
        if (deadline.isExpired()) break
        const right = rescued.filters[rightIndex]!
        if (left.type !== right.type) continue

        const distance = Math.abs(Math.log2(left.frequencyHz / right.frequencyHz))
        if (distance > 0.5) continue

        const leftWeight = Math.abs(left.gainDb)
        const rightWeight = Math.abs(right.gainDb)
        const totalWeight = leftWeight + rightWeight
        const centerOctave = totalWeight > 0
          ? (
            leftWeight * Math.log2(left.frequencyHz) +
            rightWeight * Math.log2(right.frequencyHz)
          ) / totalWeight
          : (Math.log2(left.frequencyHz) + Math.log2(right.frequencyHz)) / 2

        const retained = rescued.filters.filter(
          (_, index) => index !== leftIndex && index !== rightIndex,
        )
        const merged = projectFilter({
          id: uniqueId(retained, `stagnation-interior-merge-${leftIndex}-${rightIndex}`),
          enabled: left.enabled || right.enabled,
          type: left.type,
          frequencyHz: 2 ** centerOctave,
          gainDb: left.gainDb + right.gainDb,
          q: (left.q + right.q) / 2,
        }, bounds)

        for (let rank = 0; rank < shortlist.length; rank += 1) {
          if (deadline.isExpired()) break
          const candidate = shortlist[rank]!
          const added = projectFilter({
            id: uniqueId(
              [...retained, merged],
              `stagnation-interior-recycle-${rank}`,
            ),
            enabled: true,
            type: 'PK',
            frequencyHz: candidate.frequencyHz,
            gainDb: candidate.gainDb,
            q: candidate.q,
          }, bounds)
          const mutationOrdered = [...retained, merged, added]
          const seedVariants = [
            canonical(mutationOrdered),
            mutationOrdered,
          ]

          for (let seedOrder = 0; seedOrder < seedVariants.length; seedOrder += 1) {
            if (deadline.isExpired()) break
            const seeded = seedVariants[seedOrder]!
            const polished = polishFilters(
              seeded,
              Math.max(config.localPolishEvaluations, seeded.length * 32),
              bounds,
              desiredDb,
              frequencies,
              deadline,
              sampleRateHz,
            )
            const paretoImproves =
              polished.rmseDb <= rescued.rmseDb + epsilon &&
              polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
              (
                polished.rmseDb < rescued.rmseDb - epsilon ||
                polished.maxAbsDb < rescued.maxAbsDb - epsilon
              )
            if (paretoImproves) {
              improving.push({
                state: polished,
                rank,
                leftIndex,
                rightIndex,
                seedOrder,
              })
            }
          }
        }
      }
    }

    if (improving.length > 0) {
      improving.sort((left, right) => {
        const leftViolation = Math.max(
          left.state.rmseDb / 0.25,
          left.state.maxAbsDb / 0.75,
        )
        const rightViolation = Math.max(
          right.state.rmseDb / 0.25,
          right.state.maxAbsDb / 0.75,
        )
        return leftViolation - rightViolation ||
          left.state.rmseDb - right.state.rmseDb ||
          left.state.maxAbsDb - right.state.maxAbsDb ||
          left.rank - right.rank ||
          left.leftIndex - right.leftIndex ||
          left.rightIndex - right.rightIndex ||
          left.seedOrder - right.seedOrder
      })
      rescued = improving[0]!.state
      interiorRecycled = true
    }
  }

  if (interiorRecycled && !deadline.isExpired()) {
    const deepPolished = polishFilters(
      rescued.filters,
      Math.max(config.localPolishEvaluations, rescued.filters.length * 64),
      bounds,
      desiredDb,
      frequencies,
      deadline,
      sampleRateHz,
    )
    const rescuedViolation = Math.max(
      rescued.rmseDb / 0.25,
      rescued.maxAbsDb / 0.75,
    )
    const deepViolation = Math.max(
      deepPolished.rmseDb / 0.25,
      deepPolished.maxAbsDb / 0.75,
    )
    if (deepViolation < rescuedViolation - epsilon) {
      rescued = deepPolished
    }

    if (
      rescued.filters.length === config.maxFilters &&
      Math.max(rescued.rmseDb / 0.25, rescued.maxAbsDb / 0.75) > 1 &&
      !deadline.isExpired()
    ) {
      const currentSolution = evaluateV2Solution(
        rescued.filters,
        desiredDb,
        frequencies,
        sampleRateHz,
      )
      const shortlist = rankV2CandidateShortlist(
        generateV2Candidates({
          frequencies,
          residualDb: currentSolution.residualDb,
          config: bounds,
          boundaryMode: 'mixed',
        }).filter((candidate) => candidate.type === 'PK')
      ).slice(0, 8)

      const improving: Array<{
        state: SearchState
        rank: number
        replacementIndex: number
      }> = []

      for (let rank = 0; rank < shortlist.length; rank += 1) {
        const candidate = shortlist[rank]!
        for (
          let replacementIndex = 0;
          replacementIndex < rescued.filters.length;
          replacementIndex += 1
        ) {
          if (deadline.isExpired()) break
          const retained = rescued.filters.filter(
            (_, index) => index !== replacementIndex,
          )
          const added = projectFilter({
            id: uniqueId(
              retained,
              `stagnation-post-interior-swap-${rank}-${replacementIndex}`,
            ),
            enabled: true,
            type: 'PK',
            frequencyHz: candidate.frequencyHz,
            gainDb: candidate.gainDb,
            q: candidate.q,
          }, bounds)
          const seeded = canonical([...retained, added])
          const polished = polishFilters(
            seeded,
            Math.max(config.localPolishEvaluations, seeded.length * 32),
            bounds,
            desiredDb,
            frequencies,
            deadline,
            sampleRateHz,
          )
          const paretoImproves =
            polished.rmseDb <= rescued.rmseDb + epsilon &&
            polished.maxAbsDb <= rescued.maxAbsDb + epsilon &&
            (
              polished.rmseDb < rescued.rmseDb - epsilon ||
              polished.maxAbsDb < rescued.maxAbsDb - epsilon
            )
          if (paretoImproves) {
            improving.push({ state: polished, rank, replacementIndex })
          }
        }
      }

      if (improving.length > 0) {
        improving.sort((left, right) => {
          const leftViolation = Math.max(
            left.state.rmseDb / 0.25,
            left.state.maxAbsDb / 0.75,
          )
          const rightViolation = Math.max(
            right.state.rmseDb / 0.25,
            right.state.maxAbsDb / 0.75,
          )
          return leftViolation - rightViolation ||
            left.state.rmseDb - right.state.rmseDb ||
            left.state.maxAbsDb - right.state.maxAbsDb ||
            left.rank - right.rank ||
            left.replacementIndex - right.replacementIndex
        })
        rescued = improving[0]!.state
      }
    }
  }

  if (
    rescued.rmseDb <= 0.25 &&
    rescued.maxAbsDb <= 0.75 &&
    !deadline.isExpired()
  ) {
    const deepPolished = polishFilters(
      rescued.filters,
      Math.max(config.localPolishEvaluations, rescued.filters.length * 64),
      bounds,
      desiredDb,
      frequencies,
      deadline,
      sampleRateHz,
    )
    const rescuedViolation = Math.max(
      rescued.rmseDb / 0.25,
      rescued.maxAbsDb / 0.75,
    )
    const deepViolation = Math.max(
      deepPolished.rmseDb / 0.25,
      deepPolished.maxAbsDb / 0.75,
    )
    if (deepViolation < rescuedViolation - epsilon) {
      rescued = deepPolished
    }

    let simplifyBeam: Array<{ state: SearchState; pathKey: string }> = [
      { state: rescued, pathKey: '' },
    ]
    let simplifyBest = rescued

    for (
      let depth = 0;
      depth < 2 && simplifyBeam.length > 0 && !deadline.isExpired();
      depth += 1
    ) {
      const next: Array<{ state: SearchState; pathKey: string }> = []

      for (const node of simplifyBeam) {
        const filters = node.state.filters
        for (let leftIndex = 0; leftIndex < filters.length; leftIndex += 1) {
          const left = filters[leftIndex]!
          for (let rightIndex = leftIndex + 1; rightIndex < filters.length; rightIndex += 1) {
            if (deadline.isExpired()) break
            const right = filters[rightIndex]!
            if (left.type !== right.type) continue

            const distance = Math.abs(Math.log2(left.frequencyHz / right.frequencyHz))
            if (distance > 0.5) continue

            const leftWeight = Math.abs(left.gainDb)
            const rightWeight = Math.abs(right.gainDb)
            const totalWeight = leftWeight + rightWeight
            const centerOctave = totalWeight > 0
              ? (
                leftWeight * Math.log2(left.frequencyHz) +
                rightWeight * Math.log2(right.frequencyHz)
              ) / totalWeight
              : (Math.log2(left.frequencyHz) + Math.log2(right.frequencyHz)) / 2

            const retained = filters.filter(
              (_, index) => index !== leftIndex && index !== rightIndex,
            )
            const merged = projectFilter({
              id: uniqueId(
                retained,
                `postsolve-beam-merge-${depth}-${leftIndex}-${rightIndex}`,
              ),
              enabled: left.enabled || right.enabled,
              type: left.type,
              frequencyHz: 2 ** centerOctave,
              gainDb: left.gainDb + right.gainDb,
              q: (left.q + right.q) / 2,
            }, bounds)
            const seeded = canonical([...retained, merged])
            const polished = polishFilters(
              seeded,
              Math.max(config.localPolishEvaluations, seeded.length * 64),
              bounds,
              desiredDb,
              frequencies,
              deadline,
              sampleRateHz,
            )
            const paretoImproves =
              polished.rmseDb <= node.state.rmseDb + epsilon &&
              polished.maxAbsDb <= node.state.maxAbsDb + epsilon &&
              (
                polished.rmseDb < node.state.rmseDb - epsilon ||
                polished.maxAbsDb < node.state.maxAbsDb - epsilon
              )
            if (!paretoImproves) continue

            next.push({
              state: polished,
              pathKey: `${node.pathKey}|${leftIndex}:${rightIndex}`,
            })
          }
        }
      }

      if (next.length === 0) break
      next.sort((left, right) => {
        const leftViolation = Math.max(
          left.state.rmseDb / 0.25,
          left.state.maxAbsDb / 0.75,
        )
        const rightViolation = Math.max(
          right.state.rmseDb / 0.25,
          right.state.maxAbsDb / 0.75,
        )
        return leftViolation - rightViolation ||
          left.state.filters.length - right.state.filters.length ||
          left.state.rmseDb - right.state.rmseDb ||
          left.state.maxAbsDb - right.state.maxAbsDb ||
          left.pathKey.localeCompare(right.pathKey)
      })
      simplifyBeam = next.slice(0, 2)

      for (const node of simplifyBeam) {
        const nodeViolation = Math.max(
          node.state.rmseDb / 0.25,
          node.state.maxAbsDb / 0.75,
        )
        const bestViolation = Math.max(
          simplifyBest.rmseDb / 0.25,
          simplifyBest.maxAbsDb / 0.75,
        )
        if (nodeViolation < bestViolation - epsilon) {
          simplifyBest = node.state
        }
      }
    }

    rescued = simplifyBest
  }

  stateTrace('end', rescued, {
    reason: deadline.isExpired() ? 'deadline' : 'completed',
    ...(policy === 'vnext' ? {
      bestImprovementPhase: incumbentProvenance.phase,
      finalImprovementPhase: incumbentProvenance.phase,
    } : policy === 'm2' ? {
      finalIncumbentPhase: incumbentProvenance.phase,
      frontierMax: m2FrontierMax,
      deliveredFilterCount: rescued.filters.length,
    } : {}),
  })
  return {
    filters: rescued.filters,
    rmseDb: rescued.rmseDb,
    maxAbsDb: rescued.maxAbsDb,
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
    const quantized = quantizeV2Filters(refinedFilters, bounds).filter((filter) => filter.gainDb !== 0)
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
    .filter((filter) => filter.gainDb !== 0)
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
