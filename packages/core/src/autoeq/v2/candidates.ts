import { biquadMagnitudeDb } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import type { StandardAutoEqV2Config } from './config.js'

const TYPE_ORDER = { LS: 0, PK: 1, HS: 2 } as const

export interface V2FilterCandidate {
  type: Filter['type']
  frequencyHz: number
  gainDb: number
  q: number
  featureIndex: number
  qScale: 0.5 | 1 | 2 | null
  cheapScore: number
}

export interface CandidateInput {
  frequencies: readonly number[]
  residualDb: readonly number[]
  config: StandardAutoEqV2Config
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
  frequencies: readonly number[],
  residualDb: readonly number[],
  sampleRateHz: number,
): number {
  const response = biquadMagnitudeDb(
    { id: '', enabled: true, ...candidate },
    frequencies,
    sampleRateHz,
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
      return index
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
  const evidence = residualDb.slice(start, start + evidenceCount)
  const signedMedian = median(evidence)
  if (Math.abs(signedMedian) < config.algorithm.candidateResidualFloorDb) return null
  const matching = evidence.filter((value) => Math.sign(value) === Math.sign(signedMedian)).length
  if (matching / evidence.length < 0.75) return null
  const evidenceFrequencies = frequencies.slice(start, start + evidenceCount)
  if (evidenceFrequencies.at(-1)! / evidenceFrequencies[0]! < 1.4) return null

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
}: CandidateInput): V2FilterCandidate[] {
  if (frequencies.length === 0 || frequencies.length !== residualDb.length) return []
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
  if (effectiveFrequencies.length === 0) return []

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
    const leftIndex = boundaryIndex(effectiveResidualDb, index, -1)
    const rightIndex = boundaryIndex(effectiveResidualDb, index, 1)
    const centerHz = effectiveFrequencies[index]!
    const baseQ = centerHz / Math.max(
      Number.EPSILON,
      effectiveFrequencies[rightIndex]! - effectiveFrequencies[leftIndex]!,
    )
    for (const qScale of config.algorithm.pkQScaleMultipliers) {
      candidates.push({
        type: 'PK',
        frequencyHz: centerHz,
        gainDb: clamp(value, config.minGainDb, config.maxGainDb),
        q: clamp(baseQ * qScale, config.minPkQ, config.maxPkQ),
        featureIndex: originalIndices[index]!,
        qScale,
      })
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
  return [...deduplicated.values()].map((candidate) => ({
    ...candidate,
    cheapScore: candidateCheapScore(
      candidate,
      effectiveFrequencies,
      effectiveResidualDb,
      config.sampleRateHz,
    ),
  }))
}

export function rankV2CandidateShortlist(
  candidates: readonly V2FilterCandidate[],
): V2FilterCandidate[] {
  return [...candidates].sort((left, right) =>
    right.cheapScore - left.cheapScore ||
    left.frequencyHz - right.frequencyHz ||
    TYPE_ORDER[left.type] - TYPE_ORDER[right.type] ||
    left.gainDb - right.gainDb ||
    left.q - right.q
  ).slice(0, 8)
}
