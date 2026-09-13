import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { calculateBandMetrics, type BandMetric } from '../../src/metrics/bandMetrics.js'
import { calculateErrorMetrics, type ErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { calculatePreampDb, type PreampResult } from '../../src/metrics/preamp.js'
import { quantizeV2Filters } from '../../src/autoeq/v2/discreteRefine.js'
import type { StandardAutoEqV2Config } from '../../src/autoeq/v2/config.js'
import type { Filter } from '../../src/types/filter.js'

export const RESEARCH_DELIVERED_BANDS = Object.freeze([
  { id: '20-5k', minHz: 20, maxHz: 5_000 },
  { id: '20-8k', minHz: 20, maxHz: 8_000 },
  { id: '20-10k', minHz: 20, maxHz: 10_000 },
  { id: '20-14k', minHz: 20, maxHz: 14_000 },
  { id: 'main-band', minHz: 20, maxHz: 14_000 },
] as const)

export interface ResearchOpposingPair {
  filterAId: string
  filterBId: string
  logFrequencyDistanceOctaves: number
}

export interface ResearchComplexityMetrics {
  filterCount: number
  qMedian: number | null
  qP90: number | null
  qMax: number | null
  maxAbsGainDb: number
  sumAbsGainDb: number
  maximumCombinedBoostDb: number
  maximumCombinedBoostFrequencyHz: number
  countQAbove4: number
  nearbyOpposingPairs: ResearchOpposingPair[]
}

export interface ResearchDeliveredMetrics {
  metrics: ErrorMetrics
  bands: BandMetric[]
  weightedMaeDb: number | null
  weightedMaeAvailable: false
  complexity: ResearchComplexityMetrics
  preamp: PreampResult
}

export interface ResearchQuantizationStress {
  floatFilters: Filter[]
  quantizedFilters: Filter[]
  floatMetrics: ResearchDeliveredMetrics
  quantizedMetrics: ResearchDeliveredMetrics
  deltaMaeDb: number
  deltaRmseDb: number
  deltaMaxAbsDb: number
  largestResponseChangeFilterId: string | null
  largestResponseChangeDb: number
}

export interface ResearchSampleRateReplay {
  sampleRateHz: number
  metrics: ResearchDeliveredMetrics
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function denseGrid(): number[] {
  const count = 4_096
  return Array.from({ length: count }, (_, index) =>
    20 * (20_000 / 20) ** (index / (count - 1)),
  )
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

function complexityMetrics(filters: readonly Filter[], sampleRateHz: number): ResearchComplexityMetrics {
  const enabled = filters.filter((filter) => filter.enabled)
  const qValues = enabled.map((filter) => filter.q)
  const gains = enabled.map((filter) => Math.abs(filter.gainDb))
  const frequencies = denseGrid()
  const responseDb = cascadeMagnitudeDb(enabled, frequencies, sampleRateHz)
  let maximumCombinedBoostDb = 0
  let maximumCombinedBoostFrequencyHz = frequencies[0]!
  for (let index = 0; index < responseDb.length; index += 1) {
    if (responseDb[index]! > maximumCombinedBoostDb) {
      maximumCombinedBoostDb = responseDb[index]!
      maximumCombinedBoostFrequencyHz = frequencies[index]!
    }
  }
  const nearbyOpposingPairs: ResearchOpposingPair[] = []
  for (let left = 0; left < enabled.length; left += 1) {
    for (let right = left + 1; right < enabled.length; right += 1) {
      const first = enabled[left]!
      const second = enabled[right]!
      const distance = Math.abs(Math.log2(first.frequencyHz / second.frequencyHz))
      if (distance <= 1 / 12 && first.gainDb * second.gainDb < 0) {
        nearbyOpposingPairs.push({
          filterAId: first.id,
          filterBId: second.id,
          logFrequencyDistanceOctaves: distance,
        })
      }
    }
  }
  return {
    filterCount: enabled.length,
    qMedian: percentile(qValues, 0.5),
    qP90: percentile(qValues, 0.9),
    qMax: qValues.length === 0 ? null : Math.max(...qValues),
    maxAbsGainDb: gains.length === 0 ? 0 : Math.max(...gains),
    sumAbsGainDb: gains.reduce((sum, value) => sum + value, 0),
    maximumCombinedBoostDb,
    maximumCombinedBoostFrequencyHz,
    countQAbove4: qValues.filter((value) => value > 4).length,
    nearbyOpposingPairs,
  }
}

export function calculateResearchDeliveredMetrics(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequenciesHz: readonly number[],
  sampleRateHz: number,
): ResearchDeliveredMetrics {
  const responseDb = cascadeMagnitudeDb(filters, frequenciesHz, sampleRateHz)
  const residualDb = desiredDb.map((desired, index) => desired - responseDb[index]!)
  return {
    metrics: calculateErrorMetrics(residualDb, frequenciesHz),
    bands: calculateBandMetrics(residualDb, frequenciesHz, RESEARCH_DELIVERED_BANDS),
    // No project weighting definition currently exists.  Keep this explicit
    // instead of introducing a campaign-only mega-score.
    weightedMaeDb: null,
    weightedMaeAvailable: false,
    complexity: complexityMetrics(filters, sampleRateHz),
    preamp: calculatePreampDb(filters, sampleRateHz),
  }
}

export function evaluateQuantizationStress(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequenciesHz: readonly number[],
  config: StandardAutoEqV2Config,
): ResearchQuantizationStress {
  const floatFilters = cloneFilters(filters)
  const quantizedFilters = quantizeV2Filters(floatFilters, config)
  const floatMetrics = calculateResearchDeliveredMetrics(floatFilters, desiredDb, frequenciesHz, config.sampleRateHz)
  const quantizedMetrics = calculateResearchDeliveredMetrics(quantizedFilters, desiredDb, frequenciesHz, config.sampleRateHz)
  const responseFrequencies = denseGrid()
  let largestResponseChangeFilterId: string | null = null
  let largestResponseChangeDb = 0
  for (let index = 0; index < Math.min(floatFilters.length, quantizedFilters.length); index += 1) {
    const before = cascadeMagnitudeDb([floatFilters[index]!], responseFrequencies, config.sampleRateHz)
    const after = cascadeMagnitudeDb([quantizedFilters[index]!], responseFrequencies, config.sampleRateHz)
    let change = 0
    for (let point = 0; point < responseFrequencies.length; point += 1) {
      change = Math.max(change, Math.abs(before[point]! - after[point]!))
    }
    if (change > largestResponseChangeDb) {
      largestResponseChangeDb = change
      largestResponseChangeFilterId = floatFilters[index]!.id
    }
  }
  return {
    floatFilters,
    quantizedFilters,
    floatMetrics,
    quantizedMetrics,
    deltaMaeDb: quantizedMetrics.metrics.maeDb - floatMetrics.metrics.maeDb,
    deltaRmseDb: quantizedMetrics.metrics.rmseDb - floatMetrics.metrics.rmseDb,
    deltaMaxAbsDb: quantizedMetrics.metrics.maxAbsDb - floatMetrics.metrics.maxAbsDb,
    largestResponseChangeFilterId,
    largestResponseChangeDb,
  }
}

export function evaluateSampleRateReplay(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequenciesHz: readonly number[],
  sampleRatesHz: readonly number[],
): ResearchSampleRateReplay[] {
  if (sampleRatesHz.length === 0 || new Set(sampleRatesHz).size !== sampleRatesHz.length) {
    throw new Error('sampleRatesHz must contain unique values')
  }
  return sampleRatesHz.map((sampleRateHz) => ({
    sampleRateHz,
    metrics: calculateResearchDeliveredMetrics(filters, desiredDb, frequenciesHz, sampleRateHz),
  }))
}

export function verifyResearchPreamp(
  filters: readonly Filter[],
  sampleRateHz: number,
): PreampResult {
  return calculatePreampDb(filters, sampleRateHz)
}
