import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  cascadeMagnitudeDb,
  createGraphicEq,
  formatGraphicEq,
  type Filter,
  type GraphicEqPoint,
} from '../../src/index.js'
import { averageResponseBins } from '../../src/io/graphicEq.js'

const sampleRateHz = 48_000

function sourceRawFrequencies(): number[] {
  return new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0072)))
    .fill(null)
    .map((_, index) => 20 * Math.pow(1.0072, index))
}

function sourceGraphicFrequencies(): number[] {
  return Array.from(
    new Set(
      new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0563)))
        .fill(null)
        .map((_, index) => Math.floor(20 * Math.pow(1.0563, index))),
    ),
  ).sort((left, right) => left - right)
}

function expectedGraphicEq(filters: readonly Filter[]): GraphicEqPoint[] {
  const rawFrequencies = sourceRawFrequencies()
  const rawGains = cascadeMagnitudeDb(filters, rawFrequencies, sampleRateHz)
  const graphicFrequencies = sourceGraphicFrequencies()
  let rawIndex = 0

  const averagedGains = graphicFrequencies.map((frequencyHz, index) => {
    const nextFrequencyHz = graphicFrequencies[index + 1]
    const upperBoundary =
      nextFrequencyHz === undefined
        ? 20_000
        : Math.sqrt(frequencyHz * nextFrequencyHz)
    let sum = 0
    let count = 0

    while (rawIndex < rawFrequencies.length && rawFrequencies[rawIndex]! < upperBoundary) {
      sum += rawGains[rawIndex]!
      count += 1
      rawIndex += 1
    }

    if (count === 0) {
      const upperIndex = rawFrequencies.findIndex((rawFrequency) => rawFrequency >= frequencyHz)
      const rightIndex = upperIndex < 0 ? rawFrequencies.length - 1 : upperIndex
      const leftIndex = Math.max(0, rightIndex - 1)
      const leftFrequency = rawFrequencies[leftIndex]!
      const rightFrequency = rawFrequencies[rightIndex]!
      const amount =
        rightFrequency === leftFrequency
          ? 0
          : (Math.log(frequencyHz) - Math.log(leftFrequency)) /
            (Math.log(rightFrequency) - Math.log(leftFrequency))
      return rawGains[leftIndex]! + amount * (rawGains[rightIndex]! - rawGains[leftIndex]!)
    }

    return sum / count
  })
  const maximumGain = Math.max(...averagedGains)

  return graphicFrequencies.map((frequencyHz, index) => ({
    frequencyHz,
    gainDb: averagedGains[index]! - maximumGain,
  }))
}

describe('createGraphicEq', () => {
  it('exports its point contract and exactly follows the source output frequency grid', () => {
    expectTypeOf<GraphicEqPoint>().toEqualTypeOf<{
      frequencyHz: number
      gainDb: number
    }>()

    const frequencies = createGraphicEq([]).map(({ frequencyHz }) => frequencyHz)

    expect(frequencies).toEqual(sourceGraphicFrequencies())
    expect(frequencies.every((frequencyHz) => frequencyHz >= 20 && frequencyHz <= 20_000)).toBe(
      true,
    )
  })

  it('returns zero gain at every frequency for an empty cascade', () => {
    for (const point of createGraphicEq([])) {
      expect(point.gainDb).toBeCloseTo(0, 12)
    }
  })

  it('normalizes a positive peak cascade to a finite maximum of zero', () => {
    const points = createGraphicEq([
      { id: 'peak', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 6, q: 1 },
    ])
    const gains = points.map(({ gainDb }) => gainDb)

    expect(points).toHaveLength(sourceGraphicFrequencies().length)
    expect(Math.max(...gains)).toBeCloseTo(0, 9)
    expect(gains.some((gainDb) => gainDb < 0)).toBe(true)
    expect(gains.every(Number.isFinite)).toBe(true)
  })

  it('bins the Workbench cascade response for multiple enabled filters', () => {
    const filters: Filter[] = [
      { id: 'low', enabled: true, type: 'LS', frequencyHz: 120, gainDb: 3, q: 0.7 },
      { id: 'peak', enabled: true, type: 'PK', frequencyHz: 1450, gainDb: -5, q: 1.4 },
      { id: 'high', enabled: true, type: 'HS', frequencyHz: 8200, gainDb: 2, q: 0.8 },
      { id: 'off', enabled: false, type: 'PK', frequencyHz: 4000, gainDb: 12, q: 2 },
    ]

    const actual = createGraphicEq(filters, sampleRateHz)
    const expected = expectedGraphicEq(filters)

    expect(actual.map(({ frequencyHz }) => frequencyHz)).toEqual(
      expected.map(({ frequencyHz }) => frequencyHz),
    )
    actual.forEach((point, index) => {
      expect(point.gainDb).toBeCloseTo(expected[index]!.gainDb, 12)
      expect(Number.isFinite(point.gainDb)).toBe(true)
    })
  })

  it('interpolates the adjacent raw response when a bin has no raw samples', () => {
    const gains = averageResponseBins([20, 1000, 19_000], [0, 10, 20], [20, 100, 1000])
    const expected = (Math.log(100 / 20) / Math.log(1000 / 20)) * 10

    expect(gains[1]).toBeCloseTo(expected, 12)
    expect(gains.every(Number.isFinite)).toBe(true)
  })
})

describe('formatGraphicEq', () => {
  it('formats integer frequencies and one-decimal gains with source separators', () => {
    const formatted = formatGraphicEq([])
    const pairs = formatted.slice('GraphicEQ: '.length).split('; ')

    expect(formatted.startsWith('GraphicEQ: ')).toBe(true)
    expect(pairs).toHaveLength(sourceGraphicFrequencies().length)
    expect(pairs[0]).toBe('20 0.0')
    expect(pairs.every((pair) => /^\d+ -?\d+\.\d$/.test(pair))).toBe(true)
  })

  it('produces identical output whether disabled filters are present or omitted', () => {
    const enabledOnly: Filter[] = [
      { id: 'low', enabled: true, type: 'LS', frequencyHz: 120, gainDb: 3, q: 0.7 },
      { id: 'peak', enabled: true, type: 'PK', frequencyHz: 1450, gainDb: -5, q: 1.4 },
    ]
    const withDisabled: Filter[] = [
      ...enabledOnly,
      { id: 'off', enabled: false, type: 'PK', frequencyHz: 4000, gainDb: 12, q: 2 },
    ]

    expect(formatGraphicEq(withDisabled, sampleRateHz)).toBe(
      formatGraphicEq(enabledOnly, sampleRateHz),
    )
  })
})
