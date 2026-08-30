import { CoreError } from '../types/error.js'

export interface ErrorMetrics {
  maeDb: number
  rmseDb: number
  maxAbsDb: number
  maxAbsFrequencyHz: number
}

export function calculateErrorMetrics(
  residual: readonly number[],
  frequencies: readonly number[],
): ErrorMetrics {
  if (!Array.isArray(residual) || !Array.isArray(frequencies)) {
    throw new CoreError('validation', 'Residual and frequency values must be arrays')
  }
  if (residual.length === 0 || frequencies.length === 0) {
    throw new CoreError('validation', 'Residual and frequency arrays must be non-empty')
  }
  if (residual.length !== frequencies.length) {
    throw new CoreError('validation', 'Residual and frequency arrays must have equal length')
  }
  let absoluteSum = 0
  let squaredSum = 0
  let maxAbsDb = -1
  let maxAbsIndex = 0

  for (let index = 0; index < residual.length; index += 1) {
    const value = residual[index]!
    if (!Number.isFinite(value) || !Number.isFinite(frequencies[index]!)) {
      throw new CoreError('validation', 'Residual and frequency values must be finite')
    }
    const absolute = Math.abs(value)
    absoluteSum += absolute
    squaredSum += value ** 2
    if (absolute > maxAbsDb) {
      maxAbsDb = absolute
      maxAbsIndex = index
    }
  }

  const maeDb = absoluteSum / residual.length
  const rmseDb = Math.sqrt(squaredSum / residual.length)
  if (![maeDb, rmseDb, maxAbsDb].every(Number.isFinite)) {
    throw new CoreError('numeric', 'Error metrics must be finite')
  }

  return {
    maeDb,
    rmseDb,
    maxAbsDb,
    maxAbsFrequencyHz: frequencies[maxAbsIndex]!,
  }
}
