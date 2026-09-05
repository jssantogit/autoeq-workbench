import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'

export interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a0: number
  a1: number
  a2: number
}

function validateBiquadInput(filter: Filter, sampleRateHz: number): void {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new CoreError('validation', 'Sample rate must be finite and positive')
  }
  if (filter === null || typeof filter !== 'object') {
    throw new CoreError('validation', 'Filter must be an object')
  }
  if (filter.type !== 'PK' && filter.type !== 'LS' && filter.type !== 'HS') {
    throw new CoreError('validation', 'Filter type must be PK, LS, or HS')
  }
  if (
    !Number.isFinite(filter.frequencyHz) ||
    filter.frequencyHz <= 0 ||
    filter.frequencyHz >= sampleRateHz / 2
  ) {
    throw new CoreError(
      'validation',
      'Filter frequency must be finite, positive, and below Nyquist',
    )
  }
  if (!Number.isFinite(filter.gainDb)) {
    throw new CoreError('validation', 'Filter gain must be finite')
  }
  if (!Number.isFinite(filter.q) || filter.q <= 0) {
    throw new CoreError('validation', 'Filter Q must be finite and positive')
  }
}

function coefficientsWithGainFactor(
  filter: Filter,
  sampleRateHz: number,
  A: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * filter.frequencyHz) / sampleRateHz
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * filter.q)

  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  switch (filter.type) {
    case 'PK':
      b0 = 1 + alpha * A
      b1 = -2 * cosW0
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cosW0
      a2 = 1 - alpha / A
      break
    case 'LS': {
      const shelfAlpha = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) - (A - 1) * cosW0 + shelfAlpha)
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0)
      b2 = A * ((A + 1) - (A - 1) * cosW0 - shelfAlpha)
      a0 = A + 1 + (A - 1) * cosW0 + shelfAlpha
      a1 = -2 * ((A - 1) + (A + 1) * cosW0)
      a2 = A + 1 + (A - 1) * cosW0 - shelfAlpha
      break
    }
    case 'HS': {
      const shelfAlpha = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) + (A - 1) * cosW0 + shelfAlpha)
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0)
      b2 = A * ((A + 1) + (A - 1) * cosW0 - shelfAlpha)
      a0 = A + 1 - (A - 1) * cosW0 + shelfAlpha
      a1 = 2 * ((A - 1) - (A + 1) * cosW0)
      a2 = A + 1 - (A - 1) * cosW0 - shelfAlpha
      break
    }
  }

  const coefficients = {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a0: 1,
    a1: a1 / a0,
    a2: a2 / a0,
  }
  if (!Object.values(coefficients).every(Number.isFinite)) {
    throw new CoreError('numeric', 'Biquad coefficients must be finite')
  }
  return coefficients
}

export function biquadCoefficients(
  filter: Filter,
  sampleRateHz: number,
): BiquadCoefficients {
  validateBiquadInput(filter, sampleRateHz)
  return coefficientsWithGainFactor(
    filter,
    sampleRateHz,
    10 ** (filter.gainDb / 40),
  )
}

export function biquadCoefficientsWithGainFactor(
  filter: Filter,
  sampleRateHz: number,
  gainFactorA: number,
): BiquadCoefficients {
  validateBiquadInput(filter, sampleRateHz)
  if (!Number.isFinite(gainFactorA) || gainFactorA <= 0) {
    throw new CoreError('validation', 'Biquad gain factor must be finite and positive')
  }
  return coefficientsWithGainFactor(filter, sampleRateHz, gainFactorA)
}
