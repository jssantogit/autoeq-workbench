import {
  biquadMagnitudeDbOnGrid,
  createBiquadResponseGrid,
  validateResponseInput,
  type BiquadResponseGrid,
} from '../../dsp/response.js'
import { CoreError } from '../../types/error.js'
import type { Filter } from '../../types/filter.js'

export interface V2ResponseCache {
  filterResponsesDb: number[][]
  cascadeDb: number[]
  responseGrid: BiquadResponseGrid
}

function responseForFilter(
  filter: Filter,
  responseGrid: BiquadResponseGrid,
): number[] {
  if (
    filter === null ||
    typeof filter !== 'object' ||
    typeof filter.enabled !== 'boolean'
  ) {
    throw new CoreError('validation', 'Each filter must have a boolean enabled value')
  }
  return filter.enabled
    ? biquadMagnitudeDbOnGrid(filter, responseGrid)
    : responseGrid.frequencies.map(() => 0)
}

function assertMatchingGrid(
  responseGrid: BiquadResponseGrid,
  frequencies: readonly number[],
  sampleRateHz: number,
) {
  if (
    sampleRateHz === responseGrid.sampleRateHz &&
    frequencies === responseGrid.sourceFrequencies
  ) return
  validateResponseInput(frequencies, sampleRateHz)
  if (
    sampleRateHz !== responseGrid.sampleRateHz ||
    frequencies.length !== responseGrid.frequencies.length ||
    frequencies.some((frequencyHz, index) => frequencyHz !== responseGrid.frequencies[index])
  ) {
    throw new CoreError('validation', 'Response cache grid does not match response input')
  }
}

function sumCachedResponses(
  filterResponsesDb: readonly number[][],
  frequencies: readonly number[],
): number[] {
  return frequencies.map((_, sampleIndex) =>
    filterResponsesDb.reduce((sum, response) => sum + response[sampleIndex]!, 0))
}

export function createV2ResponseCache(
  filters: readonly Filter[],
  frequencies: readonly number[],
  sampleRateHz: number,
  existingResponseGrid?: BiquadResponseGrid,
): V2ResponseCache {
  const responseGrid = existingResponseGrid ?? createBiquadResponseGrid(frequencies, sampleRateHz)
  if (existingResponseGrid) {
    assertMatchingGrid(responseGrid, frequencies, sampleRateHz)
  }
  const filterResponsesDb = filters.map((filter) =>
    responseForFilter(filter, responseGrid))
  const cascadeDb = sumCachedResponses(filterResponsesDb, frequencies)
  return { filterResponsesDb, cascadeDb, responseGrid }
}

export function computeV2ResponseCacheFilterResponse(
  cache: V2ResponseCache,
  replacement: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): number[] {
  assertMatchingGrid(cache.responseGrid, frequencies, sampleRateHz)
  return responseForFilter(replacement, cache.responseGrid)
}

export function replaceV2ResponseCacheFilterWithResponse(
  cache: V2ResponseCache,
  filterIndex: number,
  newResponse: number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  assertMatchingGrid(cache.responseGrid, frequencies, sampleRateHz)
  const oldResponse = cache.filterResponsesDb[filterIndex]!
  const filterResponsesDb = cache.filterResponsesDb.map((response, index) =>
    index === filterIndex ? newResponse : response)
  return {
    filterResponsesDb,
    cascadeDb: cache.cascadeDb.map((value, sampleIndex) =>
      value - oldResponse[sampleIndex]! + newResponse[sampleIndex]!),
    responseGrid: cache.responseGrid,
  }
}

export function replaceV2ResponseCacheFilter(
  cache: V2ResponseCache,
  filterIndex: number,
  replacement: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  const newResponse = computeV2ResponseCacheFilterResponse(
    cache,
    replacement,
    frequencies,
    sampleRateHz,
  )
  return replaceV2ResponseCacheFilterWithResponse(
    cache,
    filterIndex,
    newResponse,
    frequencies,
    sampleRateHz,
  )
}

export function removeV2ResponseCacheFilter(
  cache: V2ResponseCache,
  filterIndex: number,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  assertMatchingGrid(cache.responseGrid, frequencies, sampleRateHz)
  const filterResponsesDb = cache.filterResponsesDb.filter((_, index) => index !== filterIndex)
  return {
    filterResponsesDb,
    cascadeDb: sumCachedResponses(filterResponsesDb, frequencies),
    responseGrid: cache.responseGrid,
  }
}

export function appendV2ResponseCacheFilter(
  cache: V2ResponseCache,
  filter: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2ResponseCache {
  assertMatchingGrid(cache.responseGrid, frequencies, sampleRateHz)
  const response = responseForFilter(filter, cache.responseGrid)
  return {
    filterResponsesDb: [...cache.filterResponsesDb, response],
    cascadeDb: cache.cascadeDb.map((value, index) => value + response[index]!),
    responseGrid: cache.responseGrid,
  }
}
