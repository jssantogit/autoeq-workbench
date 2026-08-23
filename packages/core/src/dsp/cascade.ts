import { biquadMagnitudeDb, validateResponseInput } from './response.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'

export function cascadeMagnitudeDb(
  filters: readonly Filter[],
  frequencies: readonly number[],
  sampleRateHz: number,
): number[] {
  if (!Array.isArray(filters)) {
    throw new CoreError('validation', 'Filters must be an array')
  }
  validateResponseInput(frequencies, sampleRateHz)

  const magnitudeDb = frequencies.map(() => 0)
  for (const filter of filters) {
    if (
      filter === null ||
      typeof filter !== 'object' ||
      typeof filter.enabled !== 'boolean'
    ) {
      throw new CoreError('validation', 'Each filter must have a boolean enabled value')
    }
    if (!filter.enabled) continue

    const filterMagnitudeDb = biquadMagnitudeDb(filter, frequencies, sampleRateHz)
    for (let index = 0; index < magnitudeDb.length; index += 1) {
      magnitudeDb[index]! += filterMagnitudeDb[index]!
    }
  }
  return magnitudeDb
}
