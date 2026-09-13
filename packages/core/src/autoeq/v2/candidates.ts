import {
  biquadMagnitudeDbOnGrid,
  createBiquadResponseGrid,
  type BiquadResponseGrid,
} from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import type { StandardAutoEqV2Config } from './config.js'
import type { StandardV2ResearchTrace } from './researchTrace.js'

const TYPE_ORDER = { LS: 0, PK: 1, HS: 2 } as const

export type V2CandidateBoundaryMode = 'sign-crossing' | 'half-height' | 'mixed'

export interface V2FilterCandidate {
  type: Filter['type']
  frequencyHz: number
  gainDb: number
  q: number
  featureIndex: number
  qScale: 0.5 | 1 | 2 | null
  boundaryMode?: V2CandidateBoundaryMode
  cheapScore: number
}

export interface CandidateInput {
  frequencies: readonly number[]
  residualDb: readonly number[]
  config: StandardAutoEqV2Config
  boundaryMode: V2CandidateBoundaryMode
  researchTrace?: StandardV2ResearchTrace
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function candidateCheapScore(
  candidate: Omit<V2FilterCandidate, 'cheapScore'>,
  residualDb: readonly number[],
  responseGrid: BiquadResponseGrid,
): number {
  const response = biquadMagnitudeDbOnGrid(
    { id: '', enabled: true, ...candidate },
    responseGrid,
  )
  let decrease = 0
  for (let index = 0; index < residualDb.length; index += 1) {
    const before = residualDb[index]!
    const after = before - response[index]!
    decrease += before * before - after * after
  }
  return decrease
}

function boundaryIndex(
  residualDb: readonly number[],
  centerIndex: number,
  direction: -1 | 1,
  preferHalfHeight = false,
): number {
  const center = residualDb[centerIndex]!
  const halfHeight = Math.abs(center) / 2
  let halfHeightIndex: number | null = null
  for (
    let index = centerIndex + direction;
    index >= 0 && index < residualDb.length;
    index += direction
  ) {
    if (Math.sign(residualDb[index]!) !== Math.sign(center) || residualDb[index] === 0) {
      return preferHalfHeight ? halfHeightIndex ?? index : index
    }
    if (halfHeightIndex === null && Math.abs(residualDb[index]!) <= halfHeight) {
      halfHeightIndex = index
    }
  }
  return halfHeightIndex ?? (direction < 0 ? 0 : residualDb.length - 1)
}

function createShelf(
  type: 'LS' | 'HS',
  frequencies: readonly number[],
  residualDb: readonly number[],
  originalIndices: readonly number[],
  config: StandardAutoEqV2Config,
): Omit<V2FilterCandidate, 'cheapScore'> | null {
  const evidenceCount = Math.max(3, Math.ceil(frequencies.length / 4))
  if (frequencies.length < evidenceCount) return null
  const start = type === 'LS' ? 0 : frequencies.length - evidenceCount
  let evidence = residualDb.slice(start, start + evidenceCount)
  let evidenceFrequencies = frequencies.slice(start, start + evidenceCount)
  let signedMedian = median(evidence)
  const matching = evidence.filter((value) => Math.sign(value) === Math.sign(signedMedian)).length
  const fixedEvidenceIsUsable =
    Math.abs(signedMedian) >= config.algorithm.candidateResidualFloorDb &&
    matching / evidence.length >= 0.75 &&
    evidenceFrequencies.at(-1)! / evidenceFrequencies[0]! >= 1.4

  if (!fixedEvidenceIsUsable) {
    const edgeIndex = type === 'LS' ? 0 : frequencies.length - 1
    const direction = type === 'LS' ? 1 : -1
    const edgeSign = Math.sign(residualDb[edgeIndex]!)
    const contiguousIndices: number[] = []
    for (
      let index = edgeIndex;
      index >= 0 && index < frequencies.length;
      index += direction
    ) {
      const value = residualDb[index]!
      if (
        Math.abs(value) < config.algorithm.candidateResidualFloorDb ||
        Math.sign(value) !== edgeSign
      ) break
      contiguousIndices.push(index)
    }
    contiguousIndices.sort((left, right) => left - right)
    if (contiguousIndices.length < 3) return null
    evidence = contiguousIndices.map((index) => residualDb[index]!)
    evidenceFrequencies = contiguousIndices.map((index) => frequencies[index]!)
    if (evidenceFrequencies.at(-1)! / evidenceFrequencies[0]! < 1.4) return null
    signedMedian = median(evidence)
  }

  const halfHeight = Math.abs(signedMedian) / 2
  const searchIndices = type === 'LS'
    ? Array.from({ length: frequencies.length }, (_, index) => index)
    : Array.from({ length: frequencies.length }, (_, index) => frequencies.length - 1 - index)
  const transitionIndex = searchIndices.find((index) => Math.abs(residualDb[index]!) <= halfHeight) ??
    (type === 'LS' ? evidenceCount - 1 : frequencies.length - evidenceCount)
  return {
    type,
    frequencyHz: clamp(
      frequencies[transitionIndex]!,
      config.minFrequencyHz,
      config.maxFrequencyHz,
    ),
    gainDb: clamp(signedMedian, config.minGainDb, config.maxGainDb),
    q: 0.7,
    featureIndex: originalIndices[transitionIndex]!,
    qScale: null,
  }
}

export function generateV2Candidates({
  frequencies,
  residualDb,
  config,
  boundaryMode,
  researchTrace,
}: CandidateInput): V2FilterCandidate[] {
  if (frequencies.length === 0 || frequencies.length !== residualDb.length) {
    researchTrace?.onCandidatesGenerated?.(0)
    return []
  }
  const effectiveFrequencies: number[] = []
  const effectiveResidualDb: number[] = []
  const originalIndices: number[] = []
  for (let index = 0; index < frequencies.length; index += 1) {
    const frequencyHz = frequencies[index]!
    if (frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz) {
      effectiveFrequencies.push(frequencyHz)
      effectiveResidualDb.push(residualDb[index]!)
      originalIndices.push(index)
    }
  }
  if (effectiveFrequencies.length === 0) {
    researchTrace?.onCandidatesGenerated?.(0)
    return []
  }

  const candidates: Array<Omit<V2FilterCandidate, 'cheapScore'>> = []
  for (let index = 1; index < effectiveResidualDb.length - 1; index += 1) {
    const value = effectiveResidualDb[index]!
    if (Math.abs(value) < config.algorithm.candidateResidualFloorDb) continue
    const previous = effectiveResidualDb[index - 1]!
    const next = effectiveResidualDb[index + 1]!
    const isExtremum = value > 0
      ? value >= previous && value > next
      : value <= previous && value < next
    if (!isExtremum) continue
    const centerHz = effectiveFrequencies[index]!
    const selectedModes = boundaryMode === 'mixed'
      ? ['sign-crossing', 'half-height'] as const
      : [boundaryMode]
    for (const selectedMode of selectedModes) {
      const preferHalfHeight = selectedMode === 'half-height'
      const leftIndex = boundaryIndex(effectiveResidualDb, index, -1, preferHalfHeight)
      const rightIndex = boundaryIndex(effectiveResidualDb, index, 1, preferHalfHeight)
      const baseQ = centerHz / Math.max(
        Number.EPSILON,
        effectiveFrequencies[rightIndex]! - effectiveFrequencies[leftIndex]!,
      )
      candidates.push(...config.algorithm.pkQScaleMultipliers.map((qScale):
        Omit<V2FilterCandidate, 'cheapScore'> => ({
        type: 'PK',
        frequencyHz: centerHz,
        gainDb: clamp(value, config.minGainDb, config.maxGainDb),
        q: clamp(baseQ * qScale, config.minPkQ, config.maxPkQ),
        featureIndex: originalIndices[index]!,
        qScale,
        boundaryMode: selectedMode,
      })))
    }
  }

  for (const type of ['LS', 'HS'] as const) {
    const shelf = createShelf(
      type,
      effectiveFrequencies,
      effectiveResidualDb,
      originalIndices,
      config,
    )
    if (shelf) candidates.push(shelf)
  }

  const deduplicated = new Map<string, Omit<V2FilterCandidate, 'cheapScore'>>()
  for (const candidate of candidates) {
    const key = [
      candidate.type,
      candidate.featureIndex,
      candidate.frequencyHz,
      candidate.gainDb,
      candidate.q,
    ].join('|')
    if (!deduplicated.has(key)) deduplicated.set(key, candidate)
  }
  const responseGrid = createBiquadResponseGrid(effectiveFrequencies, config.sampleRateHz)
  const generated = [...deduplicated.values()].map((candidate) => ({
    ...candidate,
    cheapScore: candidateCheapScore(
      candidate,
      effectiveResidualDb,
      responseGrid,
    ),
  }))
  researchTrace?.onCandidatesGenerated?.(generated.length)
  return generated
}

export function rankV2CandidateShortlist(
  candidates: readonly V2FilterCandidate[],
  researchTrace?: StandardV2ResearchTrace,
): V2FilterCandidate[] {
  const ranked = [...candidates].sort((left, right) =>
    right.cheapScore - left.cheapScore ||
    left.frequencyHz - right.frequencyHz ||
    TYPE_ORDER[left.type] - TYPE_ORDER[right.type] ||
    left.gainDb - right.gainDb ||
    left.q - right.q
  )
  const deduplicated: V2FilterCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of ranked) {
    const key = [
      candidate.featureIndex,
      candidate.type,
      candidate.frequencyHz,
      candidate.gainDb,
      candidate.q,
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    deduplicated.push(candidate)
  }

  const representatives = new Map<string, V2FilterCandidate>()
  for (const candidate of deduplicated) {
    const key = `${candidate.featureIndex}|${candidate.boundaryMode ?? candidate.type}`
    if (!representatives.has(key)) {
      representatives.set(key, candidate)
    }
  }
  const shortlist = [...representatives.values()].slice(0, 8)
  if (shortlist.length === 8) {
    researchTrace?.onCandidatesShortlisted?.(shortlist.length)
    return shortlist
  }

  const admitted = new Set(shortlist)
  for (const candidate of deduplicated) {
    if (admitted.has(candidate)) continue
    shortlist.push(candidate)
    if (shortlist.length === 8) break
  }
  researchTrace?.onCandidatesShortlisted?.(shortlist.length)
  return shortlist
}
