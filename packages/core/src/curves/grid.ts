import { CoreError } from '../types/error.js'

export function createLogGrid(minHz: number, maxHz: number, pointsPerOctave: number): number[] {
  if (!Number.isFinite(minHz) || minHz <= 0) {
    throw new CoreError('validation', 'Minimum frequency must be finite and positive')
  }
  if (!Number.isFinite(maxHz)) {
    throw new CoreError('validation', 'Maximum frequency must be finite')
  }
  if (maxHz <= minHz) {
    throw new CoreError('validation', 'Maximum frequency must be greater than minimum frequency')
  }
  if (!Number.isFinite(pointsPerOctave) || pointsPerOctave <= 0) {
    throw new CoreError('validation', 'Points per octave must be finite and positive')
  }

  const octaves = Math.log2(maxHz / minHz)
  const count = Math.ceil(octaves * pointsPerOctave)
  if (!Number.isSafeInteger(count) || count < 1 || count >= 0xffff_ffff) {
    throw new CoreError('validation', 'Frequency grid size must be finite and supported')
  }

  const frequencies = Array.from(
    { length: count + 1 },
    (_, index) => minHz * 2 ** (index / pointsPerOctave),
  )
  frequencies[0] = minHz
  frequencies[count] = maxHz
  return frequencies
}
