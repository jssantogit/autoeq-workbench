import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../../src/index.js'
import { prepareResearchDesired } from './corpus.js'

const prepared = prepareResearchDesired('titan-to-storm')
const runs = []

for (let repeatIndex = 0; repeatIndex < 10; repeatIndex += 1) {
  const config = {
    ...resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }),
    maxFilters: 10,
  }
  const startedAt = performance.now()
  const deadlineAt = startedAt + 5_000
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline: { isExpired: () => performance.now() >= deadlineAt },
  })
  const elapsedMs = performance.now() - startedAt
  const responseDb = cascadeMagnitudeDb(
    result.filters,
    prepared.frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = prepared.desiredDb.map(
    (desired, index) => desired - responseDb[index]!,
  )
  const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)
  const signature = createHash('sha256')
    .update(JSON.stringify({
      filters: result.filters,
      rmseDb: metrics.rmseDb,
      maxAbsDb: metrics.maxAbsDb,
    }))
    .digest('hex')

  runs.push({
    repeatIndex,
    elapsedMs,
    expired: performance.now() >= deadlineAt,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    violation: Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75),
    filterCount: result.filters.length,
    signature,
    filters: result.filters,
  })
}

console.log(JSON.stringify({
  uniqueSignatureCount: new Set(runs.map((run) => run.signature)).size,
  violationSpread:
    Math.max(...runs.map((run) => run.violation)) -
    Math.min(...runs.map((run) => run.violation)),
  runs,
}, null, 2))
