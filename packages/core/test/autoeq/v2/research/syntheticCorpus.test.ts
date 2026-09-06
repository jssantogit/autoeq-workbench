import { describe, expect, it } from 'vitest'

import { createEvaluationGrid, desiredCorrection, prepareCurve } from '../../../../src/index.js'
import { RESEARCH_NORMALIZATION, loadLayeredResearchCases } from '../../../../benchmarks/research/corpus.js'

function desiredByFrequency(id: string): ReadonlyMap<number, number> {
  const entry = loadLayeredResearchCases('adversarial').find((candidate) => candidate.id === id)
  if (entry === undefined) {
    throw new Error(`Missing synthetic case: ${id}`)
  }

  const frequenciesHz = createEvaluationGrid()
  const source = prepareCurve(entry.source, RESEARCH_NORMALIZATION, frequenciesHz)
  const target = prepareCurve(entry.target, RESEARCH_NORMALIZATION, frequenciesHz)
  return new Map(frequenciesHz.map((frequencyHz, index) => [
    frequencyHz,
    desiredCorrection(source.db, target.db)[index]!,
  ]))
}

function valueNear(values: ReadonlyMap<number, number>, frequencyHz: number): number {
  const entry = [...values.entries()].reduce((closest, candidate) => (
    Math.abs(candidate[0] - frequencyHz) < Math.abs(closest[0] - frequencyHz)
      ? candidate
      : closest
  ))
  return entry[1]
}

function absoluteEnergy(values: ReadonlyMap<number, number>, predicate: (frequencyHz: number) => boolean): number {
  return [...values.entries()]
    .filter(([frequencyHz]) => predicate(frequencyHz))
    .reduce((sum, [, value]) => sum + Math.abs(value), 0)
}

describe('synthetic research corpus', () => {
  it('provides finite samples on the canonical 20 Hz–20 kHz evaluation grid', () => {
    const frequenciesHz = createEvaluationGrid()
    const synthetic = loadLayeredResearchCases('adversarial').filter((entry) => entry.kind === 'synthetic')

    expect(synthetic.map((entry) => entry.id)).toEqual([
      'synthetic-narrow-peak',
      'synthetic-strong-shelf',
      'synthetic-resonance-cluster',
      'synthetic-alternating-sign',
      'synthetic-irregular-hf',
      'synthetic-boundary-pressure',
      'synthetic-filter-saturation',
      'synthetic-quantization-sensitive',
    ])
    for (const entry of synthetic) {
      expect(entry.source.rawPoints.map((point) => point.frequencyHz)).toEqual(frequenciesHz)
      expect(entry.target.rawPoints.map((point) => point.frequencyHz)).toEqual(frequenciesHz)
      expect(entry.source.rawPoints.every((point) => Number.isFinite(point.db))).toBe(true)
      expect(entry.target.rawPoints.every((point) => Number.isFinite(point.db))).toBe(true)
    }
  })

  it('retains the intended case-specific stress structure after canonical preparation', () => {
    const narrowPeak = desiredByFrequency('synthetic-narrow-peak')
    const narrowPeakMaximum = [...narrowPeak.entries()].reduce((maximum, candidate) => (
      candidate[1] > maximum[1] ? candidate : maximum
    ))
    expect(narrowPeakMaximum[0]).toBeGreaterThan(900)
    expect(narrowPeakMaximum[0]).toBeLessThan(1_100)

    const strongShelf = desiredByFrequency('synthetic-strong-shelf')
    expect(valueNear(strongShelf, 10_000) - valueNear(strongShelf, 100)).toBeGreaterThan(8)

    const cluster = desiredByFrequency('synthetic-resonance-cluster')
    expect(valueNear(cluster, 1_000)).toBeGreaterThan(3)
    expect(valueNear(cluster, 1_400)).toBeLessThan(-2)
    expect(valueNear(cluster, 2_000)).toBeGreaterThan(2)

    const alternating = desiredByFrequency('synthetic-alternating-sign')
    const alternatingSigns = [200, 350, 700, 1_400, 2_800].map((frequencyHz) => Math.sign(valueNear(alternating, frequencyHz)))
    expect(alternatingSigns).toEqual([1, -1, 1, -1, 1])

    const irregularHf = desiredByFrequency('synthetic-irregular-hf')
    expect(absoluteEnergy(irregularHf, (frequencyHz) => frequencyHz > 4_000)).toBeGreaterThan(
      absoluteEnergy(irregularHf, (frequencyHz) => frequencyHz <= 4_000) * 4,
    )

    const boundary = desiredByFrequency('synthetic-boundary-pressure')
    expect(Math.abs(valueNear(boundary, 20))).toBeGreaterThan(4)
    expect(Math.abs(valueNear(boundary, 20_000))).toBeGreaterThan(4)
    expect(Math.abs(valueNear(boundary, 1_000))).toBeLessThan(1)

    const saturation = desiredByFrequency('synthetic-filter-saturation')
    expect([100, 200, 400, 800, 1_600, 3_200, 6_400, 12_800].filter((frequencyHz) => Math.abs(valueNear(saturation, frequencyHz)) > 2)).toHaveLength(8)

    const quantization = desiredByFrequency('synthetic-quantization-sensitive')
    expect(Math.abs(valueNear(quantization, 1_000))).toBeGreaterThan(0.2)
    expect(Math.abs(valueNear(quantization, 1_100))).toBeLessThan(0.2)
    expect(Math.abs(valueNear(quantization, 1_200))).toBeGreaterThan(0.2)
  })
})
