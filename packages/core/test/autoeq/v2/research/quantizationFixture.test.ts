import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  canonicalQuantizationFixturePath,
  createCanonicalQuantizationFixture,
  serializeCanonicalQuantizationFixture,
} from '../../../../benchmarks/research/quantizationFixture.js'

describe('solver lab quantization parity fixture', () => {
  it('generates deterministic boundary, tie, sign, and shelf cases', () => {
    const first = createCanonicalQuantizationFixture()
    const second = createCanonicalQuantizationFixture()

    expect(serializeCanonicalQuantizationFixture(first)).toBe(
      serializeCanonicalQuantizationFixture(second),
    )
    expect(readFileSync(canonicalQuantizationFixturePath(), 'utf8')).toBe(
      serializeCanonicalQuantizationFixture(first),
    )
    expect(first).toMatchObject({ version: 1, sampleRateHz: 48_000 })
    expect(first.cases.map((entry) => entry.id)).toEqual([
      'half-step-ties',
      'signed-grid-values',
      'product-boundaries',
      'decimal-envelope',
      'shelf-q-fixed',
    ])
    expect(first.cases.flatMap((entry) => entry.quantizedFilters).every((filter) =>
      Number.isFinite(filter.frequencyHz) &&
      Number.isFinite(filter.gainDb) &&
      Number.isFinite(filter.q),
    )).toBe(true)
    expect(first.cases.find((entry) => entry.id === 'half-step-ties')!.quantizedFilters[0]).toMatchObject({
      frequencyHz: 1_000,
      gainDb: 0,
      q: 1,
    })
    expect(first.cases.find((entry) => entry.id === 'shelf-q-fixed')!.quantizedFilters.map((filter) => filter.q)).toEqual([
      0.7,
      0.7,
    ])
  })
})
