import { interpolateLogFrequency } from './interpolate.js'
import { applyOffset, normalizationOffset } from './normalize.js'
import { CoreError } from '../types/error.js'
import type { Curve, Normalization, PreparedCurve } from '../types/curve.js'

export function prepareCurve(
  curve: Curve,
  normalization: Normalization,
  frequencies: readonly number[],
): PreparedCurve {
  const offsetDb = normalizationOffset(curve.rawPoints, normalization)
  const interpolatedDb = interpolateLogFrequency(curve.rawPoints, frequencies)

  return {
    curveId: curve.id,
    name: curve.name,
    role: curve.role,
    frequencies: [...frequencies],
    db: applyOffset(interpolatedDb, offsetDb),
    normalization: { ...normalization },
    offsetDb,
  }
}

export function desiredCorrection(
  sourceDb: readonly number[],
  targetDb: readonly number[],
): number[] {
  if (sourceDb.length !== targetDb.length) {
    throw new CoreError('validation', 'Source and target arrays must have equal length')
  }
  if ([...sourceDb, ...targetDb].some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Source and target dB values must be finite')
  }

  return sourceDb.map((source, index) => {
    const correction = targetDb[index]! - source
    if (!Number.isFinite(correction)) {
      throw new CoreError('numeric', 'Desired correction produced a non-finite value')
    }
    return correction
  })
}

export function applyEqToSource(
  sourceDb: readonly number[],
  peqDb: readonly number[],
): number[] {
  return combineDbArrays(sourceDb, peqDb, 'Source and PEQ', (source, peq) => source + peq)
}

export function residualError(
  targetDb: readonly number[],
  sourceEqDb: readonly number[],
): number[] {
  return combineDbArrays(
    targetDb,
    sourceEqDb,
    'Target and Source + EQ',
    (target, sourceEq) => target - sourceEq,
  )
}

function combineDbArrays(
  left: readonly number[],
  right: readonly number[],
  names: string,
  operation: (leftValue: number, rightValue: number) => number,
): number[] {
  if (left.length !== right.length) {
    throw new CoreError('validation', `${names} arrays must have equal length`)
  }
  if ([...left, ...right].some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', `${names} dB values must be finite`)
  }

  return left.map((leftValue, index) => {
    const result = operation(leftValue, right[index]!)
    if (!Number.isFinite(result)) {
      throw new CoreError('numeric', `${names} operation produced a non-finite value`)
    }
    return result
  })
}
