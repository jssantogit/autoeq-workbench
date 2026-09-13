import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CoreError,
  formatPowerampText,
  type Filter,
  type PowerampTextInput,
} from '../../src/index.js'

function expectCoreExportError(operation: () => unknown, message: RegExp) {
  try {
    operation()
    throw new Error('Expected operation to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(CoreError)
    expect(error).toMatchObject({ category: 'export', name: 'CoreError' })
    expect(error).toHaveProperty('message', expect.stringMatching(message))
  }
}

describe('formatPowerampText', () => {
  it('conforms to PowerampTextInput interface', () => {
    expectTypeOf<PowerampTextInput>().toEqualTypeOf<{
      name: string
      preampDb: number
      filters: readonly Filter[]
    }>()
  })

  it('formats exact golden preset from plan brief', () => {
    const output = formatPowerampText({
      name: 'Demo',
      preampDb: -6.1,
      filters: [
        { id: 'a', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 6, q: 1.41 },
        { id: 'b', enabled: false, type: 'HS', frequencyHz: 10000, gainDb: -1.2, q: 0.7 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Demo',
        '# Poweramp-style manual-entry preset',
        'Preamp: -6.1 dB',
        'Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.41',
      ].join('\n'),
    )
  })

  it('formats LS and HS filters using standard type labels and fixed precisions', () => {
    const output = formatPowerampText({
      name: 'Shelf Test',
      preampDb: -3.5,
      filters: [
        { id: 'ls', enabled: true, type: 'LS', frequencyHz: 105, gainDb: 4.5, q: 0.7 },
        { id: 'pk', enabled: true, type: 'PK', frequencyHz: 2500, gainDb: -2.3, q: 2.0 },
        { id: 'hs', enabled: true, type: 'HS', frequencyHz: 10000, gainDb: 1.8, q: 0.7 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Shelf Test',
        '# Poweramp-style manual-entry preset',
        'Preamp: -3.5 dB',
        'Filter 1: ON LS Fc 105 Hz Gain 4.5 dB Q 0.70',
        'Filter 2: ON PK Fc 2500 Hz Gain -2.3 dB Q 2.00',
        'Filter 3: ON HS Fc 10000 Hz Gain 1.8 dB Q 0.70',
      ].join('\n'),
    )
  })

  it('densely renumbers enabled filters preserving relative order', () => {
    const output = formatPowerampText({
      name: 'Dense Renumber',
      preampDb: 0.0,
      filters: [
        { id: '1', enabled: false, type: 'PK', frequencyHz: 100, gainDb: 1, q: 1 },
        { id: '2', enabled: true, type: 'PK', frequencyHz: 500, gainDb: 2, q: 1 },
        { id: '3', enabled: false, type: 'PK', frequencyHz: 1000, gainDb: 3, q: 1 },
        { id: '4', enabled: true, type: 'PK', frequencyHz: 2000, gainDb: 4, q: 1 },
        { id: '5', enabled: false, type: 'PK', frequencyHz: 4000, gainDb: 5, q: 1 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Dense Renumber',
        '# Poweramp-style manual-entry preset',
        'Preamp: 0.0 dB',
        'Filter 1: ON PK Fc 500 Hz Gain 2.0 dB Q 1.00',
        'Filter 2: ON PK Fc 2000 Hz Gain 4.0 dB Q 1.00',
      ].join('\n'),
    )
  })

  it('formats disabled-only filters by outputting header and preamp with no filter lines', () => {
    const output = formatPowerampText({
      name: 'Disabled Only',
      preampDb: 0.0,
      filters: [
        { id: '1', enabled: false, type: 'PK', frequencyHz: 1000, gainDb: 1, q: 1 },
        { id: '2', enabled: false, type: 'LS', frequencyHz: 100, gainDb: 2, q: 0.7 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Disabled Only',
        '# Poweramp-style manual-entry preset',
        'Preamp: 0.0 dB',
      ].join('\n'),
    )
  })

  it('normalizes -0 values for preamp and gain', () => {
    const output = formatPowerampText({
      name: 'Zero Test',
      preampDb: -0,
      filters: [
        { id: '1', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: -0, q: 1.0 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Zero Test',
        '# Poweramp-style manual-entry preset',
        'Preamp: 0.0 dB',
        'Filter 1: ON PK Fc 1000 Hz Gain 0.0 dB Q 1.00',
      ].join('\n'),
    )
  })

  it.each([
    ['non-finite preamp NaN', { name: 'Demo', preampDb: Number.NaN, filters: [] }, /preamp.*finite/i],
    ['non-finite preamp Infinity', { name: 'Demo', preampDb: Number.POSITIVE_INFINITY, filters: [] }, /preamp.*finite/i],
    ['non-string name', { name: 123 as unknown as string, preampDb: 0, filters: [] }, /name.*string/i],
    ['name with newline \\n', { name: 'Demo\nPreamp: 10.0 dB', preampDb: 0, filters: [] }, /name.*newline/i],
    ['name with carriage return \\r', { name: 'Demo\rPreamp: 10.0 dB', preampDb: 0, filters: [] }, /name.*newline/i],
    ['name with CRLF \\r\\n', { name: 'Demo\r\nFilter 1: ON PK Fc 1000 Hz Gain 10 dB Q 1', preampDb: 0, filters: [] }, /name.*newline/i],
    ['invalid filters array', { name: 'Demo', preampDb: 0, filters: null as unknown as Filter[] }, /filter.*array/i],
  ])('rejects invalid top-level input: %s', (_name, input, message) => {
    expectCoreExportError(() => formatPowerampText(input), message)
  })

  it.each([
    [
      'non-finite frequency',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: Number.NaN, gainDb: 0, q: 1 }],
      /frequency.*finite/i,
    ],
    [
      'frequency below minimum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 19, gainDb: 0, q: 1 }],
      /frequency.*between 20 and 20000/i,
    ],
    [
      'frequency above maximum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 20001, gainDb: 0, q: 1 }],
      /frequency.*between 20 and 20000/i,
    ],
    [
      'frequency off grid',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000.5, gainDb: 0, q: 1 }],
      /frequency.*grid/i,
    ],
    [
      'non-finite gain',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: Number.POSITIVE_INFINITY, q: 1 }],
      /gain.*finite/i,
    ],
    [
      'gain below minimum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: -15.1, q: 1 }],
      /gain.*between -15 and 15/i,
    ],
    [
      'gain above maximum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 15.1, q: 1 }],
      /gain.*between -15 and 15/i,
    ],
    [
      'gain off grid',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 1.25, q: 1 }],
      /gain.*grid/i,
    ],
    [
      'non-finite Q',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 0, q: Number.NaN }],
      /Q.*finite/i,
    ],
    [
      'Q below minimum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 0, q: 0.09 }],
      /Q.*between 0.1 and 12/i,
    ],
    [
      'Q above maximum',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 0, q: 12.1 }],
      /Q.*between 0.1 and 12/i,
    ],
    [
      'Q off grid',
      [{ id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 0, q: 1.414 }],
      /Q.*grid/i,
    ],
    [
      'unsupported filter type',
      [{ id: '1', enabled: true, type: 'LP' as unknown as 'PK', frequencyHz: 1000, gainDb: 0, q: 1 }],
      /unsupported.*type/i,
    ],
  ])('rejects invalid enabled filter: %s', (_name, filters, message) => {
    expectCoreExportError(
      () => formatPowerampText({ name: 'Demo', preampDb: 0, filters }),
      message,
    )
  })

  it('rejects more than 64 enabled filters', () => {
    const filters = Array.from({ length: 65 }, (_, index) => ({
      id: `f-${index}`,
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 1000,
      gainDb: 0,
      q: 1,
    }))

    expectCoreExportError(
      () => formatPowerampText({ name: 'Demo', preampDb: 0, filters }),
      /64.*filter/i,
    )
  })

  it('ignores invalid parameters on disabled filters without throwing', () => {
    const output = formatPowerampText({
      name: 'Demo',
      preampDb: -1.0,
      filters: [
        { id: '1', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 2.0, q: 1.41 },
        { id: '2', enabled: false, type: 'PK', frequencyHz: 99999, gainDb: 100, q: 999 },
      ],
    })

    expect(output).toBe(
      [
        '# AutoEQ Workbench — Demo',
        '# Poweramp-style manual-entry preset',
        'Preamp: -1.0 dB',
        'Filter 1: ON PK Fc 1000 Hz Gain 2.0 dB Q 1.41',
      ].join('\n'),
    )
  })

  it.each([
    ['frequency with 5e-7 offset', 1000.0000005, 0, 1, /frequency.*grid/i],
    ['gain with 5e-8 offset', 1000, 1.20000005, 1, /gain.*grid/i],
    ['Q with 5e-9 offset', 1000, 0, 1.410000005, /Q.*grid/i],
  ])('rejects off-grid numbers close to boundary: %s', (_desc, frequencyHz, gainDb, q, message) => {
    expectCoreExportError(
      () =>
        formatPowerampText({
          name: 'Boundary Test',
          preampDb: 0,
          filters: [{ id: '1', enabled: true, type: 'PK', frequencyHz, gainDb, q }],
        }),
      message,
    )
  })

  it('accepts float numbers with standard representational noise on grid', () => {
    const output = formatPowerampText({
      name: 'Float Noise Test',
      preampDb: 0.3,
      filters: [
        { id: '1', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 0.3, q: 1.41 },
        { id: '2', enabled: true, type: 'LS', frequencyHz: 105, gainDb: 0.7, q: 0.7 },
        { id: '3', enabled: true, type: 'HS', frequencyHz: 10000, gainDb: -1.2, q: 0.8 },
      ],
    })

    expect(output).toContain('Preamp: 0.3 dB')
    expect(output).toContain('Filter 1: ON PK Fc 1000 Hz Gain 0.3 dB Q 1.41')
    expect(output).toContain('Filter 2: ON LS Fc 105 Hz Gain 0.7 dB Q 0.70')
    expect(output).toContain('Filter 3: ON HS Fc 10000 Hz Gain -1.2 dB Q 0.80')
  })
})
