import { createLogGrid } from './grid.js'
import { interpolateLogFrequency } from './interpolate.js'
import { calculateSquiglinkLoudnessOffset } from './loudnessNormalize.js'
import { MVP_NUMERIC_POLICY } from '../config/numericPolicy.js'
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

  // Validate points coverage and requested anchor frequency using interpolateLogFrequency
  interpolateLogFrequency(points, [normalization.frequencyHz])

  const gridFrequencies = createLogGrid(
    MVP_NUMERIC_POLICY.minFrequencyHz,
    MVP_NUMERIC_POLICY.maxFrequencyHz,
    48,
  )
  const gridDb = interpolateLogFrequency(points, gridFrequencies)
  const gridPoints: CurvePoint[] = gridFrequencies.map((frequencyHz, index) => ({
    frequencyHz,
    db: gridDb[index]!,
  }))

  const absoluteOffset = calculateSquiglinkLoudnessOffset(gridPoints, normalization.levelDb)
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
