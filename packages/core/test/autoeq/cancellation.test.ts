import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  auditCancellations,
  biquadMagnitudeDb,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  evaluateObjective,
  pruneFilters,
  resolveStandardAutoEqConfig,
  type Filter,
} from '../../src/index.js'
import { evaluateCascadeObjective } from '../../src/autoeq/refine.js'

const frequencies = createEvaluationGrid()
const sampleRateHz = 48_000

function pk(id: string, frequencyHz: number, gainDb: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q: 2 }
}

describe('auditCancellations', () => {
  it('scores nearby opposite filters higher than farther filters', () => {
    const nearby = auditCancellations(
      [pk('positive', 1_000, 15), pk('negative', 1_200, -15)],
      frequencies,
      sampleRateHz,
    )
    const farther = auditCancellations(
      [pk('positive', 1_000, 15), pk('negative', 1_400, -15)],
      frequencies,
      sampleRateHz,
    )

    expect(nearby.pairs).toHaveLength(1)
    expect(farther.pairs).toHaveLength(1)
    expect(nearby.totalScore).toBeGreaterThan(farther.totalScore)
  })

  it('uses the documented cosine, distance, and gain score formula', () => {
    const positive = pk('positive', 1_000, 15)
    const negative = pk('negative', 1_400, -15)
    const positiveResponse = biquadMagnitudeDb(positive, frequencies, sampleRateHz).map(Math.abs)
    const negativeResponse = biquadMagnitudeDb(negative, frequencies, sampleRateHz).map(Math.abs)
    const dot = positiveResponse.reduce(
      (sum, value, index) => sum + value * negativeResponse[index]!,
      0,
    )
    const positiveNorm = Math.sqrt(positiveResponse.reduce((sum, value) => sum + value ** 2, 0))
    const negativeNorm = Math.sqrt(negativeResponse.reduce((sum, value) => sum + value ** 2, 0))
    const expected = dot / (positiveNorm * negativeNorm) *
      (1 - Math.abs(Math.log2(positive.frequencyHz / negative.frequencyHz))) *
      Math.min(Math.abs(positive.gainDb), Math.abs(negative.gainDb)) / 15

    const audit = auditCancellations([positive, negative], frequencies, sampleRateHz)

    expect(audit.pairs[0]!.score).toBeCloseTo(expected)
  })

  it('omits opposite filters farther than one octave', () => {
    const audit = auditCancellations(
      [pk('positive', 1_000, 15), pk('negative', 2_100, -15)],
      frequencies,
      sampleRateHz,
    )

    expect(audit).toEqual({ pairs: [], totalScore: 0 })
  })

  it('labels moderate and strong pairs at the documented thresholds', () => {
    const moderate = auditCancellations(
      [pk('positive', 1_000, 15), pk('negative', 1_400, -15)],
      frequencies,
      sampleRateHz,
    )
    const strong = auditCancellations(
      [pk('positive', 1_000, 15), pk('negative', 1_000, -15)],
      frequencies,
      sampleRateHz,
    )

    expect(moderate.pairs[0]).toMatchObject({ severity: 'moderate' })
    expect(moderate.pairs[0]!.score).toBeGreaterThanOrEqual(0.35)
    expect(moderate.pairs[0]!.score).toBeLessThan(0.65)
    expect(strong.pairs[0]).toMatchObject({ severity: 'strong' })
    expect(strong.pairs[0]!.score).toBeCloseTo(1)
  })

  it('returns stable pair IDs and order with total score from qualifying pairs', () => {
    const audit = auditCancellations(
      [
        pk('positive-a', 1_000, 15),
        pk('negative', 1_000, -15),
        pk('positive-b', 1_000, 15),
      ],
      frequencies,
      sampleRateHz,
    )

    expect(audit.pairs.map(({ filterAId, filterBId }) => [filterAId, filterBId])).toEqual([
      ['positive-a', 'negative'],
      ['negative', 'positive-b'],
    ])
    expect(audit.totalScore).toBeCloseTo(
      audit.pairs.reduce((sum, pair) => sum + pair.score, 0),
    )
  })

  it('returns zero for same-sign, zero-gain, or disabled filters', () => {
    const disabled = { ...pk('disabled', 1_000, -15), enabled: false }
    const audit = auditCancellations(
      [pk('positive-a', 1_000, 15), pk('positive-b', 1_000, 15), pk('zero', 1_000, 0), disabled],
      frequencies,
      sampleRateHz,
    )

    expect(audit).toEqual({ pairs: [], totalScore: 0 })
  })
})

describe('cancellation objective integration', () => {
  it('uses the exact audit total in complete-cascade evaluation', () => {
    const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
    const filters = [pk('positive', 1_000, 15), pk('negative', 1_000, -15)]
    const desiredDb = frequencies.map(() => 0)
    const actualDb = cascadeMagnitudeDb(filters, frequencies, config.sampleRateHz)
    const residualDb = desiredDb.map((value, index) => value - actualDb[index]!)
    const cancellationAudit = auditCancellations(filters, frequencies, config.sampleRateHz)
    const expected = evaluateObjective({ residualDb, filters, cancellationAudit, config })

    expect(evaluateCascadeObjective(filters, desiredDb, frequencies, config)).toBeCloseTo(expected)
  })
})

describe('pruneFilters', () => {
  const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
  const desiredDb = frequencies.map(() => 0)

  it('removes filters below 0.05 dB before pruning', () => {
    const result = pruneFilters({
      filters: [pk('tiny', 1_000, 0.03)],
      desiredDb,
      frequencies,
      config,
    })

    expect(result).toEqual([])
  })

  it('removes an objective-neutral filter', () => {
    const neutral = { ...pk('neutral', 1_000, 6), enabled: false }
    const result = pruneFilters({ filters: [neutral], desiredDb, frequencies, config })

    expect(result).toEqual([])
  })

  it('retains a required PK matching a synthetic target', () => {
    const required = pk('required', 1_000, 6)
    const targetDb = cascadeMagnitudeDb([required], frequencies, config.sampleRateHz)
    const result = pruneFilters({
      filters: [required],
      desiredDb: targetDb,
      frequencies,
      config,
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('required')
  })

  it('restarts from the first filter after every removal', () => {
    const result = pruneFilters({
      filters: [pk('first', 1_000, 0.5), pk('second', 1_000, -1)],
      desiredDb,
      frequencies,
      config,
    })

    expect(result).toEqual([])
  })

  it('removes a filter when degradation is inside prune tolerance', () => {
    const required = pk('required', 1_000, 6)
    const targetDb = cascadeMagnitudeDb([required], frequencies, config.sampleRateHz)
    const tolerantConfig = {
      ...config,
      algorithm: { ...config.algorithm, pruneTolerance: 100 },
    }

    const result = pruneFilters({
      filters: [required],
      desiredDb: targetDb,
      frequencies,
      config: tolerantConfig,
    })

    expect(result).toEqual([])
  })

  it('runs a final continuous refinement pass', () => {
    const target = pk('target', 1_000, 6)
    const targetDb = cascadeMagnitudeDb([target], frequencies, config.sampleRateHz)
    const initial = { ...pk('candidate-1', 900, 5), q: 1.5 }
    const initialResponse = cascadeMagnitudeDb([initial], frequencies, config.sampleRateHz)
    const initialMae = calculateErrorMetrics(
      targetDb.map((value, index) => value - initialResponse[index]!),
      frequencies,
    ).maeDb

    const result = pruneFilters({ filters: [initial], desiredDb: targetDb, frequencies, config })
    const finalResponse = cascadeMagnitudeDb(result, frequencies, config.sampleRateHz)
    const finalMae = calculateErrorMetrics(
      targetDb.map((value, index) => value - finalResponse[index]!),
      frequencies,
    ).maeDb

    expect(result).toHaveLength(1)
    expect(finalMae).toBeLessThan(initialMae)
  })
})
