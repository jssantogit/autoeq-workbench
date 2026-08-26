import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  MVP_NUMERIC_POLICY,
  POWERAMP_MANUAL_ENTRY_POLICY,
  auditCancellations,
  calculateErrorMetrics,
  calculatePreampDb,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  prepareCurve,
  runStandardAutoEq,
  type AutoEqSettings,
  type Curve,
  type Filter,
  type Normalization,
  type StandardAutoEqInput,
} from '../../src/index.js'
import { finalizeDeliveredFilters } from '../../src/autoeq/runStandardAutoEq.js'

const normalization: Normalization = { mode: 'hz', frequencyHz: 20, levelDb: 0 }

function syntheticInput(settings: AutoEqSettings = { ...DEFAULT_AUTOEQ_SETTINGS }): StandardAutoEqInput {
  const frequencies = createEvaluationGrid()
  const knownFilter: Filter = {
    id: 'known-pk',
    enabled: true,
    type: 'PK',
    frequencyHz: 1_000,
    gainDb: 6,
    q: 2,
  }
  const responseDb = cascadeMagnitudeDb(
    [knownFilter],
    frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const source: Curve = {
    id: 'source',
    name: 'Synthetic inverse PK',
    kind: 'fr',
    rawPoints: frequencies.map((frequencyHz, index) => ({
      frequencyHz,
      db: -responseDb[index]!,
    })),
    metadata: { synthetic: true },
  }
  const target: Curve = {
    id: 'target',
    name: 'Synthetic flat target',
    kind: 'target',
    rawPoints: frequencies.map((frequencyHz) => ({ frequencyHz, db: 0 })),
    metadata: { synthetic: true },
  }
  return { source, target, normalization, settings }
}

function fitData(input: StandardAutoEqInput) {
  const frequencies = createEvaluationGrid()
  const preparedSource = prepareCurve(input.source, input.normalization, frequencies)
  const preparedTarget = prepareCurve(input.target, input.normalization, frequencies)
  const desiredDb = desiredCorrection(preparedSource.db, preparedTarget.db)
  const fitFrequencies: number[] = []
  const fitDesiredDb: number[] = []
  for (let index = 0; index < frequencies.length; index += 1) {
    if (
      frequencies[index]! >= input.settings.minFrequencyHz &&
      frequencies[index]! <= input.settings.maxFrequencyHz
    ) {
      fitFrequencies.push(frequencies[index]!)
      fitDesiredDb.push(desiredDb[index]!)
    }
  }
  return { fitFrequencies, fitDesiredDb }
}

describe('runStandardAutoEq', () => {
  it('uses absolute gain and stable input order for final same-frequency/type ties', () => {
    const tied: Filter[] = [
      { id: 'temporary-z', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -3, q: 1 },
      { id: 'temporary-a', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 2, q: 2 },
      { id: 'stable-first', enabled: false, type: 'PK', frequencyHz: 2_000, gainDb: 2, q: 1 },
      { id: 'stable-second', enabled: true, type: 'PK', frequencyHz: 2_000, gainDb: -2, q: 1 },
    ]

    expect(finalizeDeliveredFilters(tied).map(({ id, gainDb, enabled }) => ({
      id,
      gainDb,
      enabled,
    }))).toEqual([
      { id: 'autoeq-1', gainDb: 2, enabled: true },
      { id: 'autoeq-2', gainDb: -3, enabled: true },
      { id: 'autoeq-3', gainDb: 2, enabled: false },
      { id: 'autoeq-4', gainDb: -2, enabled: true },
    ])
  })

  it.each([
    undefined,
    { ...syntheticInput(), source: undefined },
    { ...syntheticInput(), target: undefined },
    { ...syntheticInput(), settings: undefined },
  ])('rejects missing run inputs with a structured validation error', (invalidInput) => {
    try {
      runStandardAutoEq(invalidInput as unknown as StandardAutoEqInput)
      throw new Error('Expected runStandardAutoEq to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError)
      expect((error as CoreError).category).toBe('validation')
    }
  })

  it('recovers a known inverse PK below 0.25 dB MAE with at most five filters', () => {
    const input = syntheticInput({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 5 })

    const result = runStandardAutoEq(input)

    expect(result.filters.length).toBeLessThanOrEqual(5)
    expect(result.metrics.maeDb).toBeLessThan(0.25)
  })

  it('returns deeply identical results for identical inputs', () => {
    const input = syntheticInput({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 5 })

    expect(runStandardAutoEq(input)).toEqual(runStandardAutoEq(input))
  })

  it('treats maxFilters zero and 64 as ceilings rather than fill targets', () => {
    const zero = runStandardAutoEq(syntheticInput({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 0,
    }))
    const maximum = runStandardAutoEq(syntheticInput({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 64,
    }))

    expect(zero.filters).toEqual([])
    expect(maximum.filters.length).toBeGreaterThan(0)
    expect(maximum.filters.length).toBeLessThan(64)
  })

  it('honors the exact narrower effective envelope', () => {
    const settings: AutoEqSettings = {
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 500,
      maxFrequencyHz: 2_000,
      minGainDb: -3,
      maxGainDb: 3,
      minQ: 1,
      maxQ: 3,
      maxFilters: 3,
    }
    const result = runStandardAutoEq(syntheticInput(settings))

    expect(result.manifest.autoeqSettings).toEqual(settings)
    for (const filter of result.filters) {
      expect(filter.frequencyHz).toBeGreaterThanOrEqual(settings.minFrequencyHz)
      expect(filter.frequencyHz).toBeLessThanOrEqual(settings.maxFrequencyHz)
      expect(filter.gainDb).toBeGreaterThanOrEqual(settings.minGainDb)
      expect(filter.gainDb).toBeLessThanOrEqual(settings.maxGainDb)
      if (filter.type === 'PK') {
        expect(filter.q).toBeGreaterThanOrEqual(settings.minQ)
        expect(filter.q).toBeLessThanOrEqual(settings.maxQ)
      }
    }
  })

  it('succeeds with an empty delivered list when all generated PKs are unrepresentable', () => {
    const result = runStandardAutoEq(syntheticInput({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 500,
      maxFrequencyHz: 2_000,
      minQ: 0.101,
      maxQ: 0.109,
      maxFilters: 3,
    }))

    expect(result.filters).toEqual([])
    expect(result.preampDb).toBe(0)
    expect(result.cancellationAudit).toEqual({ pairs: [], totalScore: 0 })
    expect(result.manifest.finalFilters).toEqual([])
    expect(Number.isFinite(result.metrics.maeDb)).toBe(true)
  })

  it('keeps every final coordinate on-grid and inside decimal effective bounds', () => {
    const settings: AutoEqSettings = {
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 900.2,
      maxFrequencyHz: 1_100.8,
      minGainDb: 0.04,
      maxGainDb: 6.04,
      minQ: 1.004,
      maxQ: 3.006,
      maxFilters: 3,
    }
    const result = runStandardAutoEq(syntheticInput(settings))

    expect(result.filters.length).toBeGreaterThan(0)
    for (const filter of result.filters) {
      expect(filter.frequencyHz).toBeGreaterThanOrEqual(settings.minFrequencyHz)
      expect(filter.frequencyHz).toBeLessThanOrEqual(settings.maxFrequencyHz)
      expect(filter.frequencyHz % POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz).toBe(0)
      expect(filter.gainDb).toBeGreaterThanOrEqual(settings.minGainDb)
      expect(filter.gainDb).toBeLessThanOrEqual(settings.maxGainDb)
      expect(Math.abs(filter.gainDb * 10 - Math.round(filter.gainDb * 10))).toBeLessThan(1e-9)
      if (filter.type === 'PK') {
        expect(filter.q).toBeGreaterThanOrEqual(settings.minQ)
        expect(filter.q).toBeLessThanOrEqual(settings.maxQ)
        expect(Math.abs(filter.q * 100 - Math.round(filter.q * 100))).toBeLessThan(1e-9)
      } else {
        expect(filter.q).toBe(0.7)
      }
    }
  })

  it('delivers sorted quantized non-zero filters with final deterministic IDs', () => {
    const result = runStandardAutoEq(syntheticInput({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 5,
    }))

    for (const filters of [result.filters, result.manifest.finalFilters]) {
      for (const filter of filters) {
        expect(Object.keys(filter).sort()).toEqual([
          'enabled',
          'frequencyHz',
          'gainDb',
          'id',
          'q',
          'type',
        ])
        expect(filter).not.toHaveProperty('regionOctaves')
      }
    }

    expect(result.filters.map(({ id }) => id)).toEqual(
      result.filters.map((_, index) => `autoeq-${index + 1}`),
    )
    expect(result.filters.map(({ frequencyHz }) => frequencyHz)).toEqual(
      result.filters.map(({ frequencyHz }) => frequencyHz).sort((left, right) => left - right),
    )
    for (const filter of result.filters) {
      expect(filter.gainDb).not.toBe(0)
      expect(filter.frequencyHz % POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz).toBe(0)
      expect(Math.abs(filter.gainDb * 10 - Math.round(filter.gainDb * 10))).toBeLessThan(1e-9)
      if (filter.type === 'PK') {
        expect(Math.abs(filter.q * 100 - Math.round(filter.q * 100))).toBeLessThan(1e-9)
      } else {
        expect(filter.q).toBe(0.7)
      }
    }
  })

  it('derives final diagnostics and manifest from the exact delivered filters', () => {
    const input = syntheticInput({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 5 })
    const result = runStandardAutoEq(input)
    const { fitFrequencies, fitDesiredDb } = fitData(input)
    const deliveredDb = cascadeMagnitudeDb(
      result.filters,
      fitFrequencies,
      MVP_NUMERIC_POLICY.sampleRateHz,
    )
    const residualDb = fitDesiredDb.map((value, index) => value - deliveredDb[index]!)
    const metrics = calculateErrorMetrics(residualDb, fitFrequencies)
    const preampDb = calculatePreampDb(
      result.filters,
      MVP_NUMERIC_POLICY.sampleRateHz,
    ).preampDb
    const cancellationAudit = auditCancellations(
      result.filters,
      fitFrequencies,
      MVP_NUMERIC_POLICY.sampleRateHz,
    )

    expect(result.metrics).toEqual(metrics)
    expect(result.preampDb).toBe(preampDb)
    expect(result.cancellationAudit).toEqual(cancellationAudit)
    expect(result.manifest.finalFilters).toEqual(result.filters)
    expect(result.manifest.metrics).toEqual(metrics)
    expect(result.manifest.preampDb).toBe(preampDb)
    expect(result.manifest.cancellationAudit).toEqual(cancellationAudit)
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      algorithmVersion: 'standard-v1',
      profile: 'Standard',
      sampleRateHz: 48_000,
      fitPointsPerOctave: 96,
      normalization,
      sourceName: input.source.name,
      targetName: input.target.name,
    })
    expect(JSON.stringify(result.manifest)).not.toMatch(/timestamp|uuid|runId/i)
  })
})
