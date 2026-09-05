import { calculateErrorMetrics, type ErrorMetrics } from '../../metrics/errorMetrics.js'
import { CoreError } from '../../types/error.js'
import type { Filter } from '../../types/filter.js'
import type { V2EvaluatedSolution } from './jointRefine.js'
import {
  computeV2ResponseCacheFilterResponse,
  replaceV2ResponseCacheFilterWithResponse,
} from './responseCache.js'

export type V2ReplacementTrialMetrics = Pick<
  ErrorMetrics,
  'rmseDb' | 'maxAbsDb' | 'maxAbsFrequencyHz'
>

export interface V2ReplacementTrial {
  filterIndex: number
  replacement: Filter
  responseDb: number[]
  metrics: V2ReplacementTrialMetrics
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
    squaredSum += residualDb ** 2
    if (absolute > maxAbsDb) {
      maxAbsDb = absolute
      maxAbsIndex = index
    }
  }

  const rmseDb = Math.sqrt(squaredSum / frequencies.length)
  if (![rmseDb, maxAbsDb].every(Number.isFinite)) {
    throw new CoreError('numeric', 'Error metrics must be finite')
  }

  return {
    filterIndex,
    replacement,
    responseDb,
    metrics: {
      rmseDb,
      maxAbsDb,
      maxAbsFrequencyHz: frequencies[maxAbsIndex]!,
    },
  }
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
    metrics: calculateErrorMetrics(residualDb, frequencies),
    cancellationAudit: solution.cancellationAudit,
  }
}
