import { biquadCoefficients } from './biquad.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'

export function validateResponseInput(
  frequencies: readonly number[],
  sampleRateHz: number,
): void {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new CoreError('validation', 'Sample rate must be finite and positive')
  }
  if (!Array.isArray(frequencies)) {
    throw new CoreError('validation', 'Frequencies must be an array')
  }
  if (
    frequencies.some(
      (frequencyHz) =>
        !Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz >= sampleRateHz / 2,
    )
  ) {
    throw new CoreError(
      'validation',
      'Response frequencies must be finite, positive, and below Nyquist',
    )
  }
}

export function biquadMagnitudeDb(
  filter: Filter,
  frequencies: readonly number[],
  sampleRateHz: number,
): number[] {
  validateResponseInput(frequencies, sampleRateHz)
  const { b0, b1, b2, a0, a1, a2 } = biquadCoefficients(filter, sampleRateHz)

  return frequencies.map((frequencyHz) => {
    const w = (2 * Math.PI * frequencyHz) / sampleRateHz
    const cosW = Math.cos(w)
    const sinW = Math.sin(w)
    const cos2W = Math.cos(2 * w)
    const sin2W = Math.sin(2 * w)
    const numeratorRe = b0 + b1 * cosW + b2 * cos2W
    const numeratorIm = -b1 * sinW - b2 * sin2W
    const denominatorRe = a0 + a1 * cosW + a2 * cos2W
    const denominatorIm = -a1 * sinW - a2 * sin2W
    const magnitudeSquared =
      (numeratorRe ** 2 + numeratorIm ** 2) /
      (denominatorRe ** 2 + denominatorIm ** 2)
    const magnitude = Math.sqrt(magnitudeSquared)
    const magnitudeDb = 20 * Math.log10(Math.max(magnitude, 1e-300))

    if (!Number.isFinite(magnitudeDb)) {
      throw new CoreError('numeric', 'Biquad magnitude must be finite')
    }
    return magnitudeDb
  })
}
