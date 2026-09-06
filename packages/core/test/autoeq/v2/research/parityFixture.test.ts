import { describe, expect, it } from 'vitest'

import {
  canonicalResponseFixturePath,
  createCanonicalResponseFixture,
  serializeCanonicalResponseFixture,
} from '../../../../benchmarks/research/parityFixture.js'
import { readFileSync } from 'node:fs'

describe('solver lab DSP parity fixture', () => {
  it('generates deterministic mixed-filter responses across the product frequency range', () => {
    const first = createCanonicalResponseFixture()
    const second = createCanonicalResponseFixture()

    expect(serializeCanonicalResponseFixture(first)).toBe(
      serializeCanonicalResponseFixture(second),
    )
    expect(first).toMatchObject({ version: 1, sampleRateHz: 48_000 })
    expect(first.frequenciesHz[0]).toBe(20)
    expect(first.frequenciesHz.at(-1)).toBe(20_000)
    expect(first.cases.length).toBeGreaterThanOrEqual(4)
    expect(new Set(first.cases.flatMap((entry) => entry.filters.map((filter) => filter.type)))).toEqual(
      new Set(['PK', 'LS', 'HS']),
    )
    expect(first.cases.some((entry) => entry.filters.length > 1)).toBe(true)
    expect(first.cases.every((entry) =>
      entry.responseDb.length === first.frequenciesHz.length &&
      entry.responseDb.every(Number.isFinite),
    )).toBe(true)
    expect(first.cases.flatMap((entry) => entry.filters).some((filter) =>
      filter.frequencyHz === 20 && filter.gainDb === -15 && filter.q === 0.1,
    )).toBe(true)
    expect(first.cases.flatMap((entry) => entry.filters).some((filter) =>
      filter.frequencyHz === 20_000 && filter.gainDb === 15,
    )).toBe(true)
    expect(readFileSync(canonicalResponseFixturePath(), 'utf8')).toBe(
      serializeCanonicalResponseFixture(first),
    )
  })
})
