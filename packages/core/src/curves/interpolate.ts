import { CoreError } from '../types/error.js'
import type { CurvePoint } from '../types/curve.js'

function validatePoints(points: readonly CurvePoint[]): void {
  if (points.length < 2) {
    throw new CoreError('validation', 'Interpolation requires at least two curve points')
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    if (!Number.isFinite(point.frequencyHz) || point.frequencyHz <= 0) {
      throw new CoreError('validation', 'Curve point frequencies must be finite and positive')
    }
    if (!Number.isFinite(point.db)) {
      throw new CoreError('validation', 'Curve point dB values must be finite')
    }
    if (index > 0 && points[index - 1]!.frequencyHz >= point.frequencyHz) {
      throw new CoreError('validation', 'Curve point frequencies must be strictly increasing')
    }
  }
}

function interpolateOne(points: readonly CurvePoint[], frequencyHz: number): number {
  const first = points[0]!
  const last = points[points.length - 1]!
  if (frequencyHz < first.frequencyHz || frequencyHz > last.frequencyHz) {
    throw new CoreError(
      'validation',
      `Frequency ${frequencyHz} Hz is outside curve coverage; extrapolation is not supported`,
    )
  }
  if (frequencyHz === first.frequencyHz) return first.db
  if (frequencyHz === last.frequencyHz) return last.db

  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle]!.frequencyHz <= frequencyHz) low = middle
    else high = middle
  }

  const left = points[low]!
  const right = points[high]!
  const ratio =
    Math.log(frequencyHz / left.frequencyHz) / Math.log(right.frequencyHz / left.frequencyHz)
  const db = left.db + ratio * (right.db - left.db)
  if (!Number.isFinite(db)) {
    throw new CoreError('numeric', 'Log-frequency interpolation produced a non-finite value')
  }
  return db
}

export function interpolateLogFrequency(
  points: readonly CurvePoint[],
  frequencies: readonly number[],
): number[] {
  validatePoints(points)
  for (const frequencyHz of frequencies) {
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
      throw new CoreError('validation', 'Requested frequencies must be finite and positive')
    }
  }
  return frequencies.map((frequencyHz) => interpolateOne(points, frequencyHz))
}
