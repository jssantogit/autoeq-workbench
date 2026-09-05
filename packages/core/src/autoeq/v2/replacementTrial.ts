import { biquadCoefficients } from '../../dsp/biquad.js'
import { validateResponseInput } from '../../dsp/response.js'
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

  const maeDb = absoluteSum / frequencies.length
  const rmseDb = Math.sqrt(squaredSum / frequencies.length)
  if (![maeDb, rmseDb, maxAbsDb].every(Number.isFinite)) {
    throw new CoreError('numeric', 'Error metrics must be finite')
  }

  return {
    filterIndex,
    replacement,
    responseDb,
    metrics: {
      maeDb,
      rmseDb,
      maxAbsDb,
      maxAbsFrequencyHz: frequencies[maxAbsIndex]!,
    },
  }
}

export function evaluateV2ReplacementTrialSinglePass(
  solution: V2EvaluatedSolution,
  filterIndex: number,
  replacement: Filter,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  responseBuffer?: number[],
): V2ReplacementTrial {
  const responseGrid = solution.responseCache.responseGrid
  if (
    sampleRateHz !== responseGrid.sampleRateHz ||
    frequencies !== responseGrid.sourceFrequencies
  ) {
    validateResponseInput(frequencies, sampleRateHz)
    if (
      sampleRateHz !== responseGrid.sampleRateHz ||
      frequencies.length !== responseGrid.frequencies.length ||
      frequencies.some((frequencyHz, index) => frequencyHz !== responseGrid.frequencies[index])
    ) {
      throw new CoreError('validation', 'Response cache grid does not match response input')
    }
  }
  if (
    replacement === null ||
    typeof replacement !== 'object' ||
    typeof replacement.enabled !== 'boolean'
  ) {
    throw new CoreError('validation', 'Each filter must have a boolean enabled value')
  }

  const responseDb = responseBuffer ?? new Array<number>(responseGrid.frequencies.length)
  if (responseDb.length !== responseGrid.frequencies.length) {
    throw new CoreError('validation', 'Response output buffer length must match the grid')
  }

  let numeratorConstant = 0
  let numeratorCosW = 0
  let numeratorCos2W = 0
  let denominatorConstant = 0
  let denominatorCosW = 0
  let denominatorCos2W = 0
  if (replacement.enabled) {
    const { b0, b1, b2, a0, a1, a2 } = biquadCoefficients(replacement, sampleRateHz)
    numeratorConstant = b0 * b0 + b1 * b1 + b2 * b2
    numeratorCosW = 2 * (b0 * b1 + b1 * b2)
    numeratorCos2W = 2 * b0 * b2
    denominatorConstant = a0 * a0 + a1 * a1 + a2 * a2
    denominatorCosW = 2 * (a0 * a1 + a1 * a2)
    denominatorCos2W = 2 * a0 * a2
  }

  const oldResponse = solution.responseCache.filterResponsesDb[filterIndex]!
  let absoluteSum = 0
  let squaredSum = 0
  let maxAbsDb = -1
  let maxAbsIndex = 0

  for (let index = 0; index < frequencies.length; index += 1) {
    let magnitudeDb = 0
    if (replacement.enabled) {
      const cosW = responseGrid.cosW[index]!
      const cos2W = responseGrid.cos2W[index]!
      const numeratorSquared =
        numeratorConstant + numeratorCosW * cosW + numeratorCos2W * cos2W
      const denominatorSquared =
        denominatorConstant + denominatorCosW * cosW + denominatorCos2W * cos2W
      const magnitudeSquared = numeratorSquared / denominatorSquared
      magnitudeDb = magnitudeSquared > 0
        ? 10 * Math.log10(magnitudeSquared)
        : -6_000
      if (!Number.isFinite(magnitudeDb)) {
        throw new CoreError('numeric', 'Biquad magnitude must be finite')
      }
    }
    responseDb[index] = magnitudeDb

    const cascadeDb = solution.responseCache.cascadeDb[index]! -
      oldResponse[index]! + magnitudeDb
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

  const maeDb = absoluteSum / frequencies.length
  const rmseDb = Math.sqrt(squaredSum / frequencies.length)
  if (![maeDb, rmseDb, maxAbsDb].every(Number.isFinite)) {
    throw new CoreError('numeric', 'Error metrics must be finite')
  }

  return {
    filterIndex,
    replacement,
    responseDb,
    metrics: {
      maeDb,
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
    metrics: trial.metrics,
    cancellationAudit: solution.cancellationAudit,
  }
}
