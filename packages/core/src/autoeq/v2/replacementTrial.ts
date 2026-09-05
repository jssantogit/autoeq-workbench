import type { ErrorMetrics } from '../../metrics/errorMetrics.js'
import { CoreError } from '../../types/error.js'
import type { Filter } from '../../types/filter.js'
import type { V2EvaluatedSolution } from './jointRefine.js'
import {
  computeV2ResponseCacheFilterResponse,
  replaceV2ResponseCacheFilterWithResponse,
} from './responseCache.js'

export interface V2ReplacementTrial {
  filterIndex: number
  replacement: Filter
  responseDb: number[]
  metrics: ErrorMetrics
}

interface ReplacementMetricAccumulator {
  absoluteSum: number
  squaredSum: number
  maxAbsDb: number
  maxAbsIndex: number
}

function finishReplacementTrial(
  filterIndex: number,
  replacement: Filter,
  responseDb: number[],
  frequencies: readonly number[],
  accumulator: ReplacementMetricAccumulator,
): V2ReplacementTrial {
  const maeDb = accumulator.absoluteSum / frequencies.length
  const rmseDb = Math.sqrt(accumulator.squaredSum / frequencies.length)
  if (![maeDb, rmseDb, accumulator.maxAbsDb].every(Number.isFinite)) {
    throw new CoreError('numeric', 'Error metrics must be finite')
  }

  return {
    filterIndex,
    replacement,
    responseDb,
    metrics: {
      maeDb,
      rmseDb,
      maxAbsDb: accumulator.maxAbsDb,
      maxAbsFrequencyHz: frequencies[accumulator.maxAbsIndex]!,
    },
  }
}

export function evaluateV2ReplacementTrial(
  solution: V2EvaluatedSolution,
  filterIndex: number,
  replacement: Filter,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  responseBuffer?: number[],
): V2ReplacementTrial {
  const responseDb = computeV2ResponseCacheFilterResponse(
    solution.responseCache,
    replacement,
    frequencies,
    sampleRateHz,
    responseBuffer,
  )
  const oldResponse = solution.responseCache.filterResponsesDb[filterIndex]!
  let absoluteSum = 0
  let squaredSum = 0
  let maxAbsDb = -1
  let maxAbsIndex = 0

  for (let index = 0; index < frequencies.length; index += 1) {
    const cascadeDb = solution.responseCache.cascadeDb[index]! -
      oldResponse[index]! + responseDb[index]!
    const residualDb = desiredDb[index]! - cascadeDb
    if (!Number.isFinite(residualDb) || !Number.isFinite(frequencies[index]!)) {
      throw new CoreError('validation', 'Residual and frequency values must be finite')
    }
    const absolute = Math.abs(residualDb)
    absoluteSum += absolute
    squaredSum += residualDb ** 2
    if (absolute > maxAbsDb) {
      maxAbsDb = absolute
      maxAbsIndex = index
    }
  }

  return finishReplacementTrial(filterIndex, replacement, responseDb, frequencies, {
    absoluteSum,
    squaredSum,
    maxAbsDb,
    maxAbsIndex,
  })
}

/**
 * Fast replacement-trial evaluator for Standard v2's validated search grid.
 * The caller must guarantee finite desired dB and frequency values.
 */
export function evaluateV2ReplacementTrialTrusted(
  solution: V2EvaluatedSolution,
  filterIndex: number,
  replacement: Filter,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  responseBuffer?: number[],
): V2ReplacementTrial {
  const responseDb = computeV2ResponseCacheFilterResponse(
    solution.responseCache,
    replacement,
    frequencies,
    sampleRateHz,
    responseBuffer,
  )
  const oldResponse = solution.responseCache.filterResponsesDb[filterIndex]!
  let absoluteSum = 0
  let squaredSum = 0
  let maxAbsDb = -1
  let maxAbsIndex = 0

  for (let index = 0; index < frequencies.length; index += 1) {
    const cascadeDb = solution.responseCache.cascadeDb[index]! -
      oldResponse[index]! + responseDb[index]!
    const residualDb = desiredDb[index]! - cascadeDb
    const absolute = Math.abs(residualDb)
    absoluteSum += absolute
    squaredSum += residualDb ** 2
    if (absolute > maxAbsDb) {
      maxAbsDb = absolute
      maxAbsIndex = index
    }
  }

  return finishReplacementTrial(filterIndex, replacement, responseDb, frequencies, {
    absoluteSum,
    squaredSum,
    maxAbsDb,
    maxAbsIndex,
  })
}

export function materializeV2ReplacementTrial(
  solution: V2EvaluatedSolution,
  trial: V2ReplacementTrial,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2EvaluatedSolution {
  const filters = solution.filters.map((filter, index) =>
    index === trial.filterIndex ? trial.replacement : filter)
  const ownedResponse = [...trial.responseDb]
  const responseCache = replaceV2ResponseCacheFilterWithResponse(
    solution.responseCache,
    trial.filterIndex,
    ownedResponse,
    frequencies,
    sampleRateHz,
  )
  const residualDb = desiredDb.map((desired, index) =>
    desired - responseCache.cascadeDb[index]!)
  return {
    filters,
    responseCache,
    cascadeDb: responseCache.cascadeDb,
    residualDb,
    metrics: trial.metrics,
    cancellationAudit: solution.cancellationAudit,
  }
}
