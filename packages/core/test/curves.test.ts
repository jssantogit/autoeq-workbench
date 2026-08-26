import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CoreError,
  applyOffset,
  createLogGrid,
  desiredCorrection,
  interpolateLogFrequency,
  normalizationOffset,
  prepareCurve,
  type Curve,
  type Normalization,
  type PreparedCurve,
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

describe('createLogGrid', () => {
  it('creates deterministic geometric spacing with exact endpoints', () => {
    expect(createLogGrid(100, 400, 1)).toEqual([100, 200, 400])
    expect(createLogGrid(100, 300, 1)).toEqual([100, 200, 300])
    expect(createLogGrid(100, 300, 1)).toEqual(createLogGrid(100, 300, 1))
  })

  it.each([
    ['non-positive minimum', 0, 100, 1],
    ['non-finite minimum', Number.NaN, 100, 1],
    ['non-increasing range', 100, 100, 1],
    ['non-finite maximum', 100, Number.POSITIVE_INFINITY, 1],
    ['non-positive density', 100, 200, 0],
    ['non-finite density', 100, 200, Number.NaN],
  ])('rejects %s', (_name, minHz, maxHz, pointsPerOctave) => {
    expectCoreError(
      () => createLogGrid(minHz, maxHz, pointsPerOctave),
      'validation',
      /finite|positive|greater/i,
    )
  })
})

describe('interpolateLogFrequency', () => {
  const points = [
    { frequencyHz: 100, db: 0 },
    { frequencyHz: 10_000, db: 20 },
  ]

  it('interpolates linearly in log frequency and preserves exact endpoints', () => {
    expect(interpolateLogFrequency(points, [100, 1000, 10_000])).toEqual([0, 10, 20])
  })

  it('does not mutate points or requested frequencies', () => {
    const inputPoints = structuredClone(points)
    const frequencies = [1000]
    const inputFrequencies = [...frequencies]

    interpolateLogFrequency(points, frequencies)

    expect(points).toEqual(inputPoints)
    expect(frequencies).toEqual(inputFrequencies)
  })

  it.each([[[99]], [[10_001]], [[100, 20_000]]])(
    'rejects extrapolation at %j Hz',
    (frequencies) => {
      expectCoreError(
        () => interpolateLogFrequency(points, frequencies),
        'validation',
        /outside|coverage|extrapolat/i,
      )
    },
  )

  it.each([
    ['fewer than two points', [points[0]!], [100]],
    ['non-positive point frequency', [{ frequencyHz: 0, db: 0 }, points[1]!], [100]],
    ['non-finite point dB', [{ frequencyHz: 100, db: Number.NaN }, points[1]!], [100]],
    ['non-increasing points', [points[1]!, points[0]!], [1000]],
    ['duplicate point frequencies', [points[0]!, points[0]!], [100]],
    ['non-positive requested frequency', points, [0]],
    ['non-finite requested frequency', points, [Number.NaN]],
  ])('rejects %s', (_name, invalidPoints, frequencies) => {
    expectCoreError(
      () => interpolateLogFrequency(invalidPoints, frequencies),
      'validation',
      /point|frequency|finite|positive|increasing/i,
    )
  })
})

describe('normalization', () => {
  const raw = [
    { frequencyHz: 100, db: 80 },
    { frequencyHz: 10_000, db: 100 },
  ]

  it('finds the anchor level by log-frequency interpolation without mutating raw points', () => {
    const copy = structuredClone(raw)

    expect(
      normalizationOffset(raw, {
        mode: 'hz',
        frequencyHz: 1000,
        levelDb: 60,
      }),
    ).toBe(-90)
    expect(raw).toEqual(copy)

    const flat = [
      { frequencyHz: 20, db: 7 },
      { frequencyHz: 500, db: 10 },
      { frequencyHz: 20_000, db: 4 },
    ]

    expect(
      normalizationOffset(flat, {
        mode: 'hz',
        frequencyHz: 500,
        levelDb: 60,
      }),
    ).toBe(-10)
  })

  it('rejects invalid normalization values and anchors outside curve coverage', () => {
    expectCoreError(
      () =>
        normalizationOffset(raw, {
          mode: 'hz',
          frequencyHz: 10,
          levelDb: 60,
        }),
      'validation',
      /outside|coverage|extrapolat/i,
    )
    expectCoreError(
      () =>
        normalizationOffset(raw, {
          mode: 'hz',
          frequencyHz: 0,
          levelDb: 60,
        }),
      'validation',
      /positive/i,
    )
    expectCoreError(
      () =>
        normalizationOffset(raw, {
          mode: 'hz',
          frequencyHz: 100,
          levelDb: Number.NaN,
        }),
      'validation',
      /finite/i,
    )
    expectCoreError(
      () =>
        normalizationOffset(raw, {
          mode: 'unknown' as unknown as 'hz',
          frequencyHz: 500,
          levelDb: 60,
        }),
      'validation',
      /mode/i,
    )
  })

  it('applies an offset into a new array', () => {
    const values = [1, -2, 3]

    expect(applyOffset(values, -1)).toEqual([0, -3, 2])
    expect(values).toEqual([1, -2, 3])
  })

  it('rejects non-finite offset inputs and results', () => {
    expectCoreError(() => applyOffset([1, Number.NaN], 1), 'validation', /value.*finite/i)
    expectCoreError(() => applyOffset([1], Number.POSITIVE_INFINITY), 'validation', /offset.*finite/i)
    expectCoreError(() => applyOffset([Number.MAX_VALUE], Number.MAX_VALUE), 'numeric', /finite/i)
  })
})

describe('prepareCurve', () => {
  const curve: Curve = {
    id: 'source-1',
    name: 'Synthetic source',
    kind: 'fr',
    rawPoints: [
      { frequencyHz: 100, db: 80 },
      { frequencyHz: 1000, db: 90 },
      { frequencyHz: 10_000, db: 100 },
    ],
    metadata: { fixture: true },
  }

  it('exports a minimal serializable prepared-curve contract', () => {
    expectTypeOf<PreparedCurve>().toEqualTypeOf<{
      curveId: string
      name: string
      kind: 'fr' | 'target'
      frequencies: number[]
      db: number[]
      normalization: { mode: 'hz' | 'db'; frequencyHz: number; levelDb: number }
      offsetDb: number
    }>()
  })

  it('interpolates and normalizes onto a copied grid without changing the curve', () => {
    const original = structuredClone(curve)
    const frequencies = [100, 1000, 10_000]
    const normalization: Normalization = { mode: 'hz', frequencyHz: 1000, levelDb: 60 }
    const prepared = prepareCurve(curve, normalization, frequencies)

    expect(prepared).toEqual({
      curveId: 'source-1',
      name: 'Synthetic source',
      kind: 'fr',
      frequencies: [100, 1000, 10_000],
      db: [-10, 0, 10],
      normalization: { mode: 'hz', frequencyHz: 1000, levelDb: 60 },
      offsetDb: -90,
    })
    expect(prepared.frequencies).not.toBe(frequencies)
    expect(prepared.normalization).not.toBe(normalization)
    expect(curve).toEqual(original)

    const flatFixture: Curve = {
      id: 'flat-1',
      name: 'Flat Fixture',
      kind: 'fr',
      rawPoints: [
        { frequencyHz: 20, db: 7 },
        { frequencyHz: 500, db: 10 },
        { frequencyHz: 20_000, db: 4 },
      ],
      metadata: {},
    }
    const preparedFlat = prepareCurve(
      flatFixture,
      { mode: 'hz', frequencyHz: 500, levelDb: 60 },
      [500],
    )
    expect(preparedFlat.db[0]).toBeCloseTo(0, 12)
  })
})

describe('desiredCorrection', () => {
  it('returns exact target minus source values', () => {
    expect(desiredCorrection([0, 1, 2], [1, 0, 4])).toEqual([1, -1, 2])
  })

  it('requires equal lengths and finite values', () => {
    expectCoreError(() => desiredCorrection([0], [1, 2]), 'validation', /equal length/i)
    expectCoreError(() => desiredCorrection([Number.NaN], [1]), 'validation', /finite/i)
    expectCoreError(() => desiredCorrection([1], [Number.POSITIVE_INFINITY]), 'validation', /finite/i)
  })

  it('reports a non-finite subtraction as a numeric error', () => {
    expectCoreError(
      () => desiredCorrection([-Number.MAX_VALUE], [Number.MAX_VALUE]),
      'numeric',
      /finite/i,
    )
  })
})
