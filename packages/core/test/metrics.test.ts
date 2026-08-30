import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CoreError,
  applyEqToSource,
  calculateErrorMetrics,
  calculatePreampDb,
  residualError,
  type ErrorMetrics,
  type Filter,
  type PreampResult,
} from '../src/index.js'

function expectCoreError(
  operation: () => unknown,
  category: 'validation' | 'numeric',
  message: RegExp,
) {
  try {
    operation()
    throw new Error('Expected operation to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(CoreError)
    expect(error).toMatchObject({ category, name: 'CoreError' })
    expect(error).toHaveProperty('message', expect.stringMatching(message))
  }
}

function peak(id: string, gainDb: number, enabled = true): Filter {
  return {
    id,
    enabled,
    type: 'PK',
    frequencyHz: 1000,
    gainDb,
    q: 1,
  }
}

describe('derived EQ arrays', () => {
  it('applies EQ and defines positive residual as target remaining above the result', () => {
    const source = [1, 2, 3]
    const peq = [0.5, -1, 2]
    const target = [2, 0, 7]

    const sourceEq = applyEqToSource(source, peq)
    const residual = residualError(target, sourceEq)

    expect(sourceEq).toEqual([1.5, 1, 5])
    expect(residual).toEqual([0.5, -1, 2])
    expect(source).toEqual([1, 2, 3])
    expect(peq).toEqual([0.5, -1, 2])
    expect(target).toEqual([2, 0, 7])
    expect(sourceEq).not.toBe(source)
    expect(residual).not.toBe(target)
  })

  it.each([
    ['applyEqToSource', () => applyEqToSource([0], [1, 2])],
    ['residualError', () => residualError([0], [1, 2])],
    ['non-finite source', () => applyEqToSource([Number.NaN], [0])],
    ['non-finite result', () => residualError([Number.POSITIVE_INFINITY], [0])],
  ])('rejects invalid arrays for %s', (_name, operation) => {
    expectCoreError(operation, 'validation', /equal length|finite/i)
  })

  it('reports arithmetic overflow as a numeric error', () => {
    expectCoreError(
      () => applyEqToSource([Number.MAX_VALUE], [Number.MAX_VALUE]),
      'numeric',
      /finite/i,
    )
    expectCoreError(
      () => residualError([Number.MAX_VALUE], [-Number.MAX_VALUE]),
      'numeric',
      /finite/i,
    )
  })
})

describe('calculateErrorMetrics', () => {
  it('exports the error metrics contract', () => {
    expectTypeOf<ErrorMetrics>().toEqualTypeOf<{
      maeDb: number
      rmseDb: number
      maxAbsDb: number
      maxAbsFrequencyHz: number
    }>()
  })

  it('reports MAE, RMSE and max residual', () => {
    const m = calculateErrorMetrics([1, -2, 3], [100, 1000, 10_000])

    expect(m.maeDb).toBeCloseTo(2)
    expect(m.rmseDb).toBeCloseTo(Math.sqrt(14 / 3))
    expect(m.maxAbsDb).toBe(3)
    expect(m.maxAbsFrequencyHz).toBe(10_000)
  })

  it('uses the first frequency when maximum residual magnitudes tie', () => {
    expect(calculateErrorMetrics([-2, 2, 1], [100, 1000, 10_000])).toMatchObject({
      maxAbsDb: 2,
      maxAbsFrequencyHz: 100,
    })
  })

  it('does not mutate residual or frequency arrays', () => {
    const residual = [1, -2]
    const frequencies = [100, 1000]

    calculateErrorMetrics(residual, frequencies)

    expect(residual).toEqual([1, -2])
    expect(frequencies).toEqual([100, 1000])
  })

  it('validates dense arrays without materializing iterable copies', () => {
    const residual = [1, -2, 3]
    const frequencies = [100, 1_000, 10_000]
    const rejectIteration = () => {
      throw new Error('unexpected array iteration')
    }
    Object.defineProperty(residual, Symbol.iterator, { value: rejectIteration })
    Object.defineProperty(frequencies, Symbol.iterator, { value: rejectIteration })

    expect(calculateErrorMetrics(residual, frequencies)).toMatchObject({
      maeDb: 2,
      maxAbsDb: 3,
      maxAbsFrequencyHz: 10_000,
    })
  })

  it.each([
    ['empty arrays', [], []],
    ['unequal arrays', [1], [100, 1000]],
    ['non-finite residual', [Number.NaN], [100]],
    ['non-finite frequency', [1], [Number.POSITIVE_INFINITY]],
  ])('rejects %s', (_name, residual, frequencies) => {
    expectCoreError(
      () => calculateErrorMetrics(residual, frequencies),
      'validation',
      /non-empty|equal length|finite/i,
    )
  })

  it('reports aggregate overflow as a numeric error', () => {
    expectCoreError(
      () => calculateErrorMetrics([Number.MAX_VALUE], [100]),
      'numeric',
      /finite/i,
    )
  })
})

describe('calculatePreampDb', () => {
  it('exports the preamp result contract', () => {
    expectTypeOf<PreampResult>().toEqualTypeOf<{
      preampDb: number
      maxBoostDb: number
      maxBoostFrequencyHz: number
    }>()
  })

  it('uses combined cascade boost rather than largest filter gain', () => {
    const result = calculatePreampDb([peak('1', 3), peak('2', 3)], 48_000)

    expect(result.maxBoostDb).toBeCloseTo(6, 2)
    expect(result.maxBoostFrequencyHz).toBeCloseTo(1000, 0)
    expect(result.preampDb).toBeLessThanOrEqual(-6)
  })

  it('rounds required attenuation outward to exactly 0.1 dB', () => {
    const result = calculatePreampDb([peak('1', 3.01)], 48_000)

    expect(result.maxBoostDb).toBeCloseTo(3.01, 2)
    expect(result.preampDb).toBe(-3.1)
  })

  it('excludes disabled filters and preserves the input', () => {
    const filters = [peak('enabled', 3), peak('disabled', 12, false)]
    const original = structuredClone(filters)

    expect(calculatePreampDb(filters, 48_000).maxBoostDb).toBeCloseTo(3, 2)
    expect(filters).toEqual(original)
  })

  it('returns zero boost at the first dense-grid frequency for no active filters', () => {
    expect(calculatePreampDb([], 48_000)).toEqual({
      preampDb: 0,
      maxBoostDb: 0,
      maxBoostFrequencyHz: 20,
    })
    expect(calculatePreampDb([peak('disabled', 12, false)], 48_000)).toEqual({
      preampDb: 0,
      maxBoostDb: 0,
      maxBoostFrequencyHz: 20,
    })
  })

  it('includes both 20 Hz and 20 kHz dense-grid endpoints', () => {
    const lowShelf: Filter = {
      id: 'low',
      enabled: true,
      type: 'LS',
      frequencyHz: 20,
      gainDb: 6,
      q: 0.7,
    }
    const highShelf: Filter = {
      id: 'high',
      enabled: true,
      type: 'HS',
      frequencyHz: 20_000,
      gainDb: 6,
      q: 0.7,
    }

    expect(calculatePreampDb([lowShelf], 48_000).maxBoostFrequencyHz).toBe(20)
    expect(calculatePreampDb([highShelf], 48_000).maxBoostFrequencyHz).toBe(20_000)
  })

  it('is deterministic', () => {
    const filters = [peak('1', 4)]

    expect(calculatePreampDb(filters, 48_000)).toEqual(calculatePreampDb(filters, 48_000))
  })

  it('propagates sample-rate and filter-frequency validation', () => {
    expectCoreError(() => calculatePreampDb([], 40_000), 'validation', /Nyquist/i)
    expectCoreError(
      () => calculatePreampDb([{ ...peak('bad', 3), frequencyHz: 24_000 }], 48_000),
      'validation',
      /filter frequency|Nyquist/i,
    )
  })

  it('propagates numeric overflow from the response engine', () => {
    expectCoreError(
      () => calculatePreampDb([peak('overflow', Number.MAX_VALUE)], 48_000),
      'numeric',
      /finite/i,
    )
  })
})
