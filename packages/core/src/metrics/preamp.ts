import { cascadeMagnitudeDb } from '../dsp/cascade.js'
import type { Filter } from '../types/filter.js'

const DENSE_GRID_SAMPLE_COUNT = 16_384
const MIN_FREQUENCY_HZ = 20
const MAX_FREQUENCY_HZ = 20_000

export interface PreampResult {
  preampDb: number
  maxBoostDb: number
  maxBoostFrequencyHz: number
}

export function calculatePreampDb(
  filters: readonly Filter[],
  sampleRateHz: number,
): PreampResult {
  const frequencies = Array.from({ length: DENSE_GRID_SAMPLE_COUNT }, (_, index) =>
    MIN_FREQUENCY_HZ *
    (MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) ** (index / (DENSE_GRID_SAMPLE_COUNT - 1)),
  )
  frequencies[0] = MIN_FREQUENCY_HZ
  frequencies[DENSE_GRID_SAMPLE_COUNT - 1] = MAX_FREQUENCY_HZ

  const cascadeDb = cascadeMagnitudeDb(filters, frequencies, sampleRateHz)
  let maxBoostDb = 0
  let maxBoostIndex = 0
  for (let index = 0; index < cascadeDb.length; index += 1) {
    if (cascadeDb[index]! > maxBoostDb) {
      maxBoostDb = cascadeDb[index]!
      maxBoostIndex = index
    }
  }

  const required = Math.max(0, maxBoostDb)
  const preampDb = -Math.ceil(required * 10 - 1e-10) / 10

  return {
    preampDb,
    maxBoostDb,
    maxBoostFrequencyHz: frequencies[maxBoostIndex]!,
  }
}
