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
  admission: 'lexical' | 'q31-b4-p8'
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

interface ShelfEvidence {
  type: 'LS' | 'HS'
  frequencyHz: number
  residual: number
}

function selectShelfEvidence(
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
      const proposals = generateStructuralMutations(parent.filters, solution.residualDb, frequencies, bounds)
      const ordered = orderStructuralProposals(proposals)

      let admitted: StructuralProposal[] = []

      if (config.admission === 'q31-b4-p8') {
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
            rmseDb: metrics.rmseDb,
            maxAbsDb: metrics.maxAbsDb,
            filterCount: quantized.length,
            cancellationScore,
            semanticKey: proposalKey(proposal)
          }
        })

        const rmseRanked = [...prePolishScored].sort((a, b) =>
          a.rmseDb - b.rmseDb ||
          a.maxAbsDb - b.maxAbsDb ||
          a.filterCount - b.filterCount ||
          a.cancellationScore - b.cancellationScore ||
          a.lexicalRank - b.lexicalRank
        )
        const selected = selectQuotaProposals(prePolishScored, rmseRanked, 6, 2, config.proposalsPerParent)
        admitted = selected.map(s => s.proposal)
      } else {
        admitted = ordered.slice(0, config.proposalsPerParent)
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
        const key = semanticFilterKey(polished.filters)
        if (visited.has(key)) continue
        visited.add(key)

        polished.candidateId = String(candidateCounter++).padStart(4, '0')
        nextStates.push(polished)
      }
    }

    if (nextStates.length === 0) break
    const combined = [...beam, ...nextStates]
    beam = retainParetoBeam(combined, config.beamWidth)
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
  const epsilon = 1e-12

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
    rescueSteps += 1
  }

  let capSwapSteps = 0
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
    capSwapSteps += 1
  }

  const postSwapViolation = Math.max(
    rescued.rmseDb / 0.25,
    rescued.maxAbsDb / 0.75,
  )
  if (config.workProfile === 'short-5s' && postSwapViolation > 1.6) {
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
