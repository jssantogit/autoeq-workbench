import { interpolateLogFrequency } from './interpolate.js'
import { calculateSquiglinkLoudnessOffset } from './loudnessNormalize.js'
import { CoreError } from '../types/error.js'
import type { CurvePoint, Normalization } from '../types/curve.js'

export function normalizationOffset(
  points: readonly CurvePoint[],
  normalization: Normalization,
): number {
  if (normalization.mode !== 'hz' && normalization.mode !== 'db') {
    throw new CoreError('validation', `Invalid normalization mode: ${String(normalization.mode)}`)
  }
  if (!Number.isFinite(normalization.frequencyHz) || normalization.frequencyHz <= 0) {
    throw new CoreError('validation', 'Normalization frequency must be finite and positive')
  }
  if (!Number.isFinite(normalization.levelDb)) {
    throw new CoreError('validation', 'Normalization level dB must be finite')
  }

  if (normalization.mode === 'hz') {
    const anchorDb = interpolateLogFrequency(points, [normalization.frequencyHz])[0]!
    const offsetDb = -anchorDb
    if (!Number.isFinite(offsetDb)) {
      throw new CoreError('numeric', 'Normalization produced a non-finite offset')
    }
    return offsetDb
  }

  const absoluteOffset = calculateSquiglinkLoudnessOffset(points, normalization.levelDb)
  const first = points[0]!
  const last = points[points.length - 1]!
  if (normalization.frequencyHz < first.frequencyHz || normalization.frequencyHz > last.frequencyHz) {
    throw new CoreError(
      'validation',
      `Frequency ${normalization.frequencyHz} Hz is outside curve coverage; extrapolation is not supported`,
    )
  }
  const offsetDb = absoluteOffset - normalization.levelDb
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
