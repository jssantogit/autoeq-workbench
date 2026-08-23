import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CoreError,
  parseCurveText,
  type Curve,
  type CurveKind,
  type CurvePoint,
  type Filter,
  type FilterType,
  type Normalization,
  type ParseCurveOptions,
} from '../src/index.js'
import {
  commentFixture,
  delimiterFixtures,
  expectedThreePointCurve,
} from './fixtures/curves.js'

const frOptions = { name: 'Source', kind: 'fr' as const }

function expectCoreError(
  operation: () => unknown,
  category: 'parse' | 'validation',
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

describe('core domain types', () => {
  it('exports the curve, normalization, filter, and error contracts', () => {
    expectTypeOf<CurvePoint>().toEqualTypeOf<{
      frequencyHz: number
      db: number
    }>()
    expectTypeOf<CurveKind>().toEqualTypeOf<'fr' | 'target'>()
    expectTypeOf<ParseCurveOptions>().toEqualTypeOf<{
      name: string
      kind: CurveKind
    }>()
    expectTypeOf<Normalization>().toEqualTypeOf<{
      anchorHz: number
      targetDb: number
    }>()
    expectTypeOf<FilterType>().toEqualTypeOf<'PK' | 'LS' | 'HS'>()
    expectTypeOf<Filter>().toMatchTypeOf<{
      id: string
      enabled: boolean
      type: FilterType
      frequencyHz: number
      gainDb: number
      q: number
    }>()
    expectTypeOf<Curve>().toMatchTypeOf<{
      id: string
      name: string
      kind: CurveKind
      rawPoints: CurvePoint[]
    }>()

    const error = new CoreError('parse', 'Bad curve')
    expect(error).toMatchObject({
      name: 'CoreError',
      category: 'parse',
      message: 'Bad curve',
    })
  })
})

describe('parseCurveText', () => {
  it('classifies an imported frequency-response curve by kind', () => {
    const curve = parseCurveText('20 1\n20000 2', { name: 'Overlay', kind: 'fr' })

    expect(curve).toMatchObject({ name: 'Overlay', kind: 'fr' })
  })

  it.each(delimiterFixtures)('parses $name-delimited data with a header', ({ text }) => {
    const curve = parseCurveText(text, frOptions)

    expect(curve).toMatchObject({ name: 'Source', kind: 'fr' })
    expect(curve.id).toEqual(expect.any(String))
    expect(curve.id).not.toHaveLength(0)
    expect(curve.rawPoints).toEqual(expectedThreePointCurve)
  })

  it('normalizes a BOM and CRLF newlines and removes every supported comment prefix', () => {
    expect(parseCurveText(commentFixture, frOptions).rawPoints).toEqual(
      expectedThreePointCurve,
    )
  })

  it('normalizes bare carriage-return newlines and accepts files without a header', () => {
    const curve = parseCurveText('20 81.2\r1000 90\r20000 82.1', frOptions)

    expect(curve.rawPoints).toEqual(expectedThreePointCurve)
  })

  it('only treats semicolon followed by whitespace as a comment prefix', () => {
    expectCoreError(
      () => parseCurveText(';not a comment\n20;81.2\n1000;90', frOptions),
      'parse',
      /header|malformed|columns/i,
    )
  })

  it('allows comments and blank lines between data rows', () => {
    const text = '20 81.2\n# note\n\n// note\n; note\n1000 90\n20000 82.1'

    expect(parseCurveText(text, frOptions).rawPoints).toEqual(expectedThreePointCurve)
  })

  it('allows exactly one fully non-numeric leading header', () => {
    expect(parseCurveText('Hz dB\n20 1\n1000 2', frOptions).rawPoints).toEqual([
      { frequencyHz: 20, db: 1 },
      { frequencyHz: 1000, db: 2 },
    ])
  })

  it('rejects a header that matches more than one delimiter strategy', () => {
    expectCoreError(
      () => parseCurveText('Frequency\tLevel;SPL', frOptions),
      'parse',
      /ambiguous.*delimiter/i,
    )
  })

  it.each([
    ['missing column', '20,1\n1000'],
    ['extra or ambiguous columns', '20,1,2\n1000,3,4'],
    ['mixed delimiters', '20,1\n1000;2'],
    ['empty column', '20,\n1000,2'],
    ['trailing delimiter', '20,1,\n1000,2,'],
    ['header after data', '20 1\nFrequency SPL\n1000 2'],
    ['second header', 'Frequency SPL\nHz dB\n20 1\n1000 2'],
    ['partially numeric header', '20 SPL\n1000 1\n20000 2'],
  ])('rejects malformed or ambiguous input: %s', (_name, text) => {
    expectCoreError(
      () => parseCurveText(text, frOptions),
      'parse',
      /ambiguous|column|delimiter|header|malformed/i,
    )
  })

  it.each([
    ['zero', '20 1\n0 2'],
    ['negative', '20 1\n-1000 2'],
  ])('rejects %s frequencies', (_name, text) => {
    expectCoreError(
      () => parseCurveText(text, frOptions),
      'validation',
      /frequency.*positive/i,
    )
  })

  it.each([
    ['infinite frequency', '20 1\nInfinity 2'],
    ['NaN frequency', '20 1\nNaN 2'],
    ['infinite magnitude', '20 1\n1000 -Infinity'],
    ['NaN magnitude', '20 1\n1000 NaN'],
  ])('rejects a non-finite number: %s', (_name, text) => {
    expectCoreError(
      () => parseCurveText(text, frOptions),
      'validation',
      /finite/i,
    )
  })

  it('rejects duplicate frequencies with conflicting dB values', () => {
    expectCoreError(
      () => parseCurveText('20 1\n1000 2\n20 1.1', frOptions),
      'validation',
      /duplicate.*conflict/i,
    )
  })

  it('collapses exact duplicate points', () => {
    expect(parseCurveText('20 1\n20 1\n1000 2\n1000 2', frOptions).rawPoints).toEqual([
      { frequencyHz: 20, db: 1 },
      { frequencyHz: 1000, db: 2 },
    ])
  })

  it('sorts non-increasing input by frequency', () => {
    expect(parseCurveText('1000 2\n20 1\n20000 3', frOptions).rawPoints).toEqual([
      { frequencyHz: 20, db: 1 },
      { frequencyHz: 1000, db: 2 },
      { frequencyHz: 20000, db: 3 },
    ])
  })

  it('preserves raw numeric values without normalization, interpolation, or rounding', () => {
    const curve = parseCurveText(
      '2.0123456789e1 -81.23456789\n1e3 +9.0000000001e1',
      { name: 'Target', kind: 'target' },
    )

    expect(curve).toMatchObject({ name: 'Target', kind: 'target' })
    expect(curve.rawPoints).toEqual([
      { frequencyHz: 20.123456789, db: -81.23456789 },
      { frequencyHz: 1000, db: 90.000000001 },
    ])
  })

  it.each([
    ['empty text', ''],
    ['comments only', '# comment\n// comment\n; comment'],
    ['header only', 'Frequency SPL'],
    ['one point', '20 1'],
    ['one unique point', '20 1\n20 1'],
  ])('requires at least two unique points: %s', (_name, text) => {
    expectCoreError(
      () => parseCurveText(text, frOptions),
      'validation',
      /at least two unique points|empty|numeric data/i,
    )
  })
})
