import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  type Filter,
} from '../../src/index.js'

export interface CanonicalResponseFixtureCaseV1 {
  id: string
  filters: Filter[]
  responseDb: number[]
}

export interface CanonicalMetricFixtureCaseV1 {
  id: string
  desiredDb: number[]
  actualDb: number[]
  rmseDb: number
  maxAbsDb: number
}

export interface CanonicalResponseFixtureV1 {
  version: 1
  sampleRateHz: 48_000
  frequenciesHz: number[]
  cases: CanonicalResponseFixtureCaseV1[]
  metricCases: CanonicalMetricFixtureCaseV1[]
}

const FIXTURE_FREQUENCIES_HZ = [
  20, 20.5, 31.25, 63, 100, 250, 500, 1_000, 2_000, 4_000,
  8_000, 12_000, 16_000, 20_000,
]

function filter(
  id: string,
  type: Filter['type'],
  frequencyHz: number,
  gainDb: number,
  q: number,
): Filter {
  return { id, enabled: true, type, frequencyHz, gainDb, q }
}

function fixtureFilters(): Array<{ id: string; filters: Filter[] }> {
  return [
    {
      id: 'pk-boundary',
      filters: [filter('pk-boundary-filter', 'PK', 20, -15, 0.1)],
    },
    {
      id: 'ls-boundary',
      filters: [filter('ls-boundary-filter', 'LS', 20_000, 15, 0.7)],
    },
    {
      id: 'hs-mid',
      filters: [filter('hs-mid-filter', 'HS', 1_000, -3, 0.7)],
    },
    {
      id: 'mixed-cascade',
      filters: [
        filter('mixed-ls', 'LS', 250, -6, 0.7),
        filter('mixed-pk', 'PK', 2_000, 5, 12),
        filter('mixed-hs', 'HS', 8_000, 3, 0.7),
      ],
    },
  ]
}

export function createCanonicalResponseFixture(): CanonicalResponseFixtureV1 {
  const cases = fixtureFilters().map(({ id, filters }) => ({
    id,
    filters: filters.map((entry) => ({ ...entry })),
    responseDb: cascadeMagnitudeDb(filters, FIXTURE_FREQUENCIES_HZ, 48_000),
  }))
  const metricCases = cases.map((entry, caseIndex) => {
    const desiredDb = FIXTURE_FREQUENCIES_HZ.map((frequencyHz, frequencyIndex) =>
      0.25 * Math.sin(Math.log(frequencyHz) * (caseIndex + 1)) +
      0.05 * Math.cos(frequencyIndex / 3),
    )
    const metrics = calculateErrorMetrics(
      desiredDb.map((desired, index) => desired - entry.responseDb[index]!),
      FIXTURE_FREQUENCIES_HZ,
    )
    return {
      id: `metrics-${entry.id}`,
      desiredDb,
      actualDb: [...entry.responseDb],
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
    }
  })
  return {
    version: 1,
    sampleRateHz: 48_000,
    frequenciesHz: [...FIXTURE_FREQUENCIES_HZ],
    cases,
    metricCases,
  }
}

export function serializeCanonicalResponseFixture(
  fixture: CanonicalResponseFixtureV1,
): string {
  return `${JSON.stringify(fixture, null, 2)}\n`
}

export function canonicalResponseFixturePath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../research/solver-lab/tests/fixtures/canonical-response-v1.json',
  )
}

export function writeCanonicalResponseFixture(path = canonicalResponseFixturePath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeCanonicalResponseFixture(createCanonicalResponseFixture()))
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) writeCanonicalResponseFixture()
