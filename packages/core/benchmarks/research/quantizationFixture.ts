import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  quantizeFilters,
  resolveStandardAutoEqConfig,
  type AutoEqSettingsV1,
  type Filter,
} from '../../src/index.js'

export interface QuantizationBoundsV1 {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  shelfQ: number
}

export interface CanonicalQuantizationFixtureCaseV1 {
  id: string
  bounds: QuantizationBoundsV1
  filters: Filter[]
  quantizedFilters: Filter[]
}

export interface CanonicalQuantizationFixtureV1 {
  version: 1
  sampleRateHz: 48_000
  policy: {
    frequencyStepHz: 1
    gainStepDb: 0.1
    qStep: 0.01
  }
  cases: CanonicalQuantizationFixtureCaseV1[]
}

function filter(
  id: string,
  type: Filter['type'],
  frequencyHz: number,
  gainDb: number,
  q: number,
): Filter {
  return { id, enabled: true, type, frequencyHz, gainDb, q }
}

function bounds(settings: Partial<AutoEqSettingsV1> = {}): QuantizationBoundsV1 {
  const resolved = resolveStandardAutoEqConfig({
    ...DEFAULT_AUTOEQ_SETTINGS,
    ...settings,
  })
  return {
    minFrequencyHz: resolved.minFrequencyHz,
    maxFrequencyHz: resolved.maxFrequencyHz,
    minGainDb: resolved.minGainDb,
    maxGainDb: resolved.maxGainDb,
    minQ: resolved.minPkQ,
    maxQ: resolved.maxPkQ,
    shelfQ: resolved.shelfQ,
  }
}

function quantizeCase(
  id: string,
  caseBounds: QuantizationBoundsV1,
  filters: Filter[],
): CanonicalQuantizationFixtureCaseV1 {
  const config = resolveStandardAutoEqConfig({
    ...DEFAULT_AUTOEQ_SETTINGS,
    minFrequencyHz: caseBounds.minFrequencyHz,
    maxFrequencyHz: caseBounds.maxFrequencyHz,
    minGainDb: caseBounds.minGainDb,
    maxGainDb: caseBounds.maxGainDb,
    minQ: caseBounds.minQ,
    maxQ: caseBounds.maxQ,
  })
  return {
    id,
    bounds: { ...caseBounds },
    filters: filters.map((entry) => ({ ...entry })),
    quantizedFilters: quantizeFilters(filters, config).map((entry) => ({ ...entry })),
  }
}

export function createCanonicalQuantizationFixture(): CanonicalQuantizationFixtureV1 {
  const defaultBounds = bounds()
  const decimalBounds = bounds({
    minFrequencyHz: 1_000.1,
    maxFrequencyHz: 1_001.1,
    minGainDb: 0.04,
    maxGainDb: 0.24,
    minQ: 0.104,
    maxQ: 0.126,
  })
  return {
    version: 1,
    sampleRateHz: 48_000,
    policy: { frequencyStepHz: 1, gainStepDb: 0.1, qStep: 0.01 },
    cases: [
      quantizeCase('half-step-ties', defaultBounds, [
        filter('tie', 'PK', 1_000.5, 0.05, 1.005),
      ]),
      quantizeCase('signed-grid-values', defaultBounds, [
        filter('negative', 'PK', 1_000.6, -2.26, 1.236),
        filter('positive', 'PK', 2_000.4, 2.24, 2.234),
      ]),
      quantizeCase('product-boundaries', defaultBounds, [
        filter('minimums', 'PK', 20, -15, 0.1),
        filter('maximums', 'PK', 20_000, 15, 12),
      ]),
      quantizeCase('decimal-envelope', decimalBounds, [
        filter('inside', 'PK', 1_000.2, 0.14, 0.106),
        filter('outside', 'PK', 1_002.2, 0.3, 0.2),
      ]),
      quantizeCase('shelf-q-fixed', defaultBounds, [
        filter('low-shelf', 'LS', 250.6, -2.26, 5),
        filter('high-shelf', 'HS', 8_000.4, 2.24, 5),
      ]),
    ],
  }
}

export function serializeCanonicalQuantizationFixture(
  fixture: CanonicalQuantizationFixtureV1,
): string {
  return `${JSON.stringify(fixture, null, 2)}\n`
}

export function canonicalQuantizationFixturePath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../research/solver-lab/tests/fixtures/canonical-quantization-v1.json',
  )
}

export function writeCanonicalQuantizationFixture(
  path = canonicalQuantizationFixturePath(),
): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeCanonicalQuantizationFixture(createCanonicalQuantizationFixture()))
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) writeCanonicalQuantizationFixture()
