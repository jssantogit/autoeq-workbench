import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import type { AutoEqConfig } from './types.js'

export interface ResidualRegion {
  startIndex: number
  endIndex: number
  startHz: number
  endHz: number
  sign: -1 | 1
  regionOctaves: number
}

export interface FilterCandidate extends Filter {
  regionOctaves: number
}

interface CandidateInput {
  frequencies: readonly number[]
  residualDb: readonly number[]
  config: AutoEqConfig
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

function interpolateResidual(
  frequencies: readonly number[],
  residualDb: readonly number[],
  frequencyHz: number,
): number {
  const exactIndex = frequencies.indexOf(frequencyHz)
  if (exactIndex >= 0) return residualDb[exactIndex]!

  let rightIndex = 1
  while (frequencies[rightIndex]! < frequencyHz) rightIndex += 1
  const leftIndex = rightIndex - 1
  const ratio = Math.log(frequencyHz / frequencies[leftIndex]!) /
    Math.log(frequencies[rightIndex]! / frequencies[leftIndex]!)
  return residualDb[leftIndex]! + ratio * (residualDb[rightIndex]! - residualDb[leftIndex]!)
}

export function findResidualRegions(
  frequencies: readonly number[],
  residualDb: readonly number[],
  thresholdDb: number,
): ResidualRegion[] {
  if (!Array.isArray(frequencies) || !Array.isArray(residualDb)) {
    throw new CoreError('validation', 'Frequencies and residual values must be arrays')
  }
  if (frequencies.length === 0 || frequencies.length !== residualDb.length) {
    throw new CoreError('validation', 'Frequency and residual arrays must be non-empty and equal length')
  }
  if (!Number.isFinite(thresholdDb) || thresholdDb <= 0) {
    throw new CoreError('validation', 'Candidate threshold must be finite and positive')
  }
  for (let index = 0; index < frequencies.length; index += 1) {
    const frequencyHz = frequencies[index]!
    if (
      !Number.isFinite(frequencyHz) ||
      frequencyHz <= 0 ||
      (index > 0 && frequencies[index - 1]! >= frequencyHz) ||
      !Number.isFinite(residualDb[index]!)
    ) {
      throw new CoreError(
        'validation',
        'Frequencies must be finite, positive, strictly ascending, with finite residuals',
      )
    }
  }

  const regions: ResidualRegion[] = []
  let startIndex: number | null = null
  let sign: -1 | 1 | null = null

  const closeRegion = (endIndex: number) => {
    if (startIndex === null || sign === null) return
    const startHz = frequencies[startIndex]!
    const endHz = frequencies[endIndex]!
    regions.push({
      startIndex,
      endIndex,
      startHz,
      endHz,
      sign,
      regionOctaves: Math.log2(endHz / startHz),
    })
    startIndex = null
    sign = null
  }

  for (let index = 0; index < residualDb.length; index += 1) {
    const residual = residualDb[index]!
    const material = Math.abs(residual) >= thresholdDb
    const currentSign: -1 | 1 = residual < 0 ? -1 : 1
    if (!material) {
      closeRegion(index - 1)
    } else if (startIndex === null) {
      startIndex = index
      sign = currentSign
    } else if (currentSign !== sign) {
      closeRegion(index - 1)
      startIndex = index
      sign = currentSign
    }
  }
  closeRegion(residualDb.length - 1)
  return regions
}

function createShelfCandidate(
  type: 'LS' | 'HS',
  nominalFrequencyHz: number,
  regionMinimumHz: number,
  regionMaximumHz: number,
  frequencies: readonly number[],
  residualDb: readonly number[],
  config: AutoEqConfig,
): FilterCandidate | null {
  if (
    nominalFrequencyHz < config.minFrequencyHz ||
    nominalFrequencyHz > config.maxFrequencyHz
  ) return null

  const eligible = residualDb.filter((_, index) => {
    const frequencyHz = frequencies[index]!
    return frequencyHz >= regionMinimumHz && frequencyHz <= regionMaximumHz
  })
  if (eligible.length === 0) return null

  const positiveCount = eligible.filter((value) => value > 0).length
  const negativeCount = eligible.filter((value) => value < 0).length
  if (Math.max(positiveCount, negativeCount) / eligible.length < 0.7) return null
  if (median(eligible.map(Math.abs)) < config.algorithm.candidateThresholdDb) return null

  const firstIndex = frequencies.findIndex(
    (frequencyHz) => frequencyHz >= regionMinimumHz && frequencyHz <= regionMaximumHz,
  )
  let lastIndex = firstIndex
  for (let index = firstIndex + 1; index < frequencies.length; index += 1) {
    if (frequencies[index]! <= regionMaximumHz) lastIndex = index
  }

  return {
    id: '',
    enabled: true,
    type,
    frequencyHz: nominalFrequencyHz,
    gainDb: clamp(median(eligible), config.minGainDb, config.maxGainDb),
    q: config.shelfQ,
    regionOctaves: Math.log2(frequencies[lastIndex]! / frequencies[firstIndex]!),
  }
}

const TYPE_ORDER = { LS: 0, PK: 1, HS: 2 } as const

export function generateCandidates({
  frequencies,
  residualDb,
  config,
}: CandidateInput): FilterCandidate[] {
  findResidualRegions(frequencies, residualDb, config.algorithm.candidateThresholdDb)

  const effectiveFrequencies: number[] = []
  const effectiveResidualDb: number[] = []
  for (let index = 0; index < frequencies.length; index += 1) {
    const frequencyHz = frequencies[index]!
    if (frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz) {
      effectiveFrequencies.push(frequencyHz)
      effectiveResidualDb.push(residualDb[index]!)
    }
  }
  if (effectiveFrequencies.length === 0) return []

  const candidates: FilterCandidate[] = findResidualRegions(
    effectiveFrequencies,
    effectiveResidualDb,
    config.algorithm.candidateThresholdDb,
  ).map((region) => {
    const frequencyHz = clamp(
      Math.sqrt(region.startHz * region.endHz),
      config.minFrequencyHz,
      config.maxFrequencyHz,
    )
    return {
      id: '',
      enabled: true,
      type: 'PK',
      frequencyHz,
      gainDb: clamp(
        interpolateResidual(effectiveFrequencies, effectiveResidualDb, frequencyHz),
        config.minGainDb,
        config.maxGainDb,
      ),
      q: clamp(
        frequencyHz / Math.max(1e-9, region.endHz - region.startHz),
        config.minPkQ,
        config.maxPkQ,
      ),
      regionOctaves: region.regionOctaves,
    }
  })

  const lowShelf = createShelfCandidate(
    'LS', 105, 20, 200, effectiveFrequencies, effectiveResidualDb, config,
  )
  const highShelf = createShelfCandidate(
    'HS', 10_000, 8_000, 20_000, effectiveFrequencies, effectiveResidualDb, config,
  )
  if (lowShelf) candidates.push(lowShelf)
  if (highShelf) candidates.push(highShelf)

  candidates.sort((left, right) =>
    right.regionOctaves - left.regionOctaves ||
    Math.abs(right.gainDb) - Math.abs(left.gainDb) ||
    left.frequencyHz - right.frequencyHz ||
    TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
  )

  const deduplicated: FilterCandidate[] = []
  for (const candidate of candidates) {
    const duplicate = deduplicated.some((existing) =>
      existing.type === candidate.type &&
      Math.abs(Math.log2(existing.frequencyHz / candidate.frequencyHz)) <= 1 / 48
    )
    if (!duplicate) deduplicated.push(candidate)
  }

  return deduplicated.map((candidate, index) => ({
    ...candidate,
    id: `candidate-${index + 1}`,
  }))
}
