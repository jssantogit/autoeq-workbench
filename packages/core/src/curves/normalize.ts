import { interpolateLogFrequency } from './interpolate.js'
import { CoreError } from '../types/error.js'
import type { CurvePoint, Normalization } from '../types/curve.js'

export function normalizationOffset(
  points: readonly CurvePoint[],
  normalization: Normalization,
): number {
  if (!Number.isFinite(normalization.anchorHz) || normalization.anchorHz <= 0) {
    throw new CoreError('validation', 'Normalization anchor frequency must be finite and positive')
  }
  if (!Number.isFinite(normalization.targetDb)) {
    throw new CoreError('validation', 'Normalization target dB must be finite')
  }

  const anchorDb = interpolateLogFrequency(points, [normalization.anchorHz])[0]!
  const offsetDb = normalization.targetDb - anchorDb
  if (!Number.isFinite(offsetDb)) {
    throw new CoreError('numeric', 'Normalization produced a non-finite offset')
  }
  return offsetDb
}

export function applyOffset(values: readonly number[], offsetDb: number): number[] {
  if (!Number.isFinite(offsetDb)) {
    throw new CoreError('validation', 'Offset dB must be finite')
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Every dB value must be finite')
  }

  return values.map((value) => {
    const adjusted = value + offsetDb
    if (!Number.isFinite(adjusted)) {
      throw new CoreError('numeric', 'Applying offset produced a non-finite value')
    }
    return adjusted
  })
}
