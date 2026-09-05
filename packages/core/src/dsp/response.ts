import { biquadCoefficients } from './biquad.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'

export interface BiquadResponseGrid {
  sourceFrequencies: readonly number[]
  frequencies: number[]
  sampleRateHz: number
  cosW: number[]
  sinW: number[]
  cos2W: number[]
  sin2W: number[]
}

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

export function createBiquadResponseGrid(
  frequencies: readonly number[],
  sampleRateHz: number,
): BiquadResponseGrid {
  validateResponseInput(frequencies, sampleRateHz)
  const grid: BiquadResponseGrid = {
    sourceFrequencies: frequencies,
    frequencies: [...frequencies],
    sampleRateHz,
    cosW: [],
    sinW: [],
    cos2W: [],
    sin2W: [],
  }
  for (const frequencyHz of frequencies) {
    const w = (2 * Math.PI * frequencyHz) / sampleRateHz
    grid.cosW.push(Math.cos(w))
    grid.sinW.push(Math.sin(w))
    grid.cos2W.push(Math.cos(2 * w))
    grid.sin2W.push(Math.sin(2 * w))
  }
  return grid
}

export function biquadMagnitudeDbExactOnGrid(
  filter: Filter,
  grid: BiquadResponseGrid,
): number[] {
  const { b0, b1, b2, a0, a1, a2 } = biquadCoefficients(filter, grid.sampleRateHz)
  return grid.frequencies.map((_, index) => {
    const cosW = grid.cosW[index]!
    const sinW = grid.sinW[index]!
    const cos2W = grid.cos2W[index]!
    const sin2W = grid.sin2W[index]!
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

export function biquadMagnitudeDbOnGridInto(
  filter: Filter,
  grid: BiquadResponseGrid,
  output: number[],
): number[] {
  if (output.length !== grid.frequencies.length) {
    throw new CoreError('validation', 'Response output buffer length must match the grid')
  }
  const { b0, b1, b2, a0, a1, a2 } = biquadCoefficients(filter, grid.sampleRateHz)
  const numeratorConstant = b0 * b0 + b1 * b1 + b2 * b2
  const numeratorCosW = 2 * (b0 * b1 + b1 * b2)
  const numeratorCos2W = 2 * b0 * b2
  const denominatorConstant = a0 * a0 + a1 * a1 + a2 * a2
  const denominatorCosW = 2 * (a0 * a1 + a1 * a2)
  const denominatorCos2W = 2 * a0 * a2
  for (let index = 0; index < grid.frequencies.length; index += 1) {
    const cosW = grid.cosW[index]!
    const cos2W = grid.cos2W[index]!
    const numeratorSquared =
      numeratorConstant + numeratorCosW * cosW + numeratorCos2W * cos2W
    const denominatorSquared =
      denominatorConstant + denominatorCosW * cosW + denominatorCos2W * cos2W
    const magnitudeSquared = numeratorSquared / denominatorSquared
    const magnitudeDb = magnitudeSquared > 0
      ? 10 * Math.log10(magnitudeSquared)
      : -6_000

    if (!Number.isFinite(magnitudeDb)) {
      throw new CoreError('numeric', 'Biquad magnitude must be finite')
    }
    output[index] = magnitudeDb
  }
  return output
}

export function biquadMagnitudeDbOnGrid(
  filter: Filter,
  grid: BiquadResponseGrid,
): number[] {
  return biquadMagnitudeDbOnGridInto(
    filter,
    grid,
    new Array<number>(grid.frequencies.length),
  )
}
