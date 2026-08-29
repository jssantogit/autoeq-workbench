import { cascadeMagnitudeDb } from '../../dsp/cascade.js'
import type { Filter } from '../../types/filter.js'

export interface V2ResponseCache {
  filterResponsesDb: number[][]
  cascadeDb: number[]
}

function responseForFilter(
  filter: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): number[] {
  return cascadeMagnitudeDb([filter], frequencies, sampleRateHz)
}

export function createV2ResponseCache(
  filters: readonly Filter[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  const filterResponsesDb = filters.map((filter) =>
    responseForFilter(filter, frequencies, sampleRateHz))
  const cascadeDb = frequencies.map((_, sampleIndex) =>
    filterResponsesDb.reduce((sum, response) => sum + response[sampleIndex]!, 0))
  return { filterResponsesDb, cascadeDb }
}

export function replaceV2ResponseCacheFilter(
  cache: V2ResponseCache,
  filterIndex: number,
  replacement: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  const oldResponse = cache.filterResponsesDb[filterIndex]!
  const newResponse = responseForFilter(replacement, frequencies, sampleRateHz)
  const filterResponsesDb = cache.filterResponsesDb.map((response, index) =>
    index === filterIndex ? newResponse : response)
  return {
    filterResponsesDb,
    cascadeDb: cache.cascadeDb.map((value, sampleIndex) =>
      value - oldResponse[sampleIndex]! + newResponse[sampleIndex]!),
  }
}

export function appendV2ResponseCacheFilter(
  cache: V2ResponseCache,
  filter: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  const response = responseForFilter(filter, frequencies, sampleRateHz)
  return {
    filterResponsesDb: [...cache.filterResponsesDb, response],
    cascadeDb: cache.cascadeDb.map((value, index) => value + response[index]!),
  }
}
