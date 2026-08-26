import { createEvaluationGrid } from '../config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../curves/derive.js'
import { cascadeMagnitudeDb } from '../dsp/cascade.js'
import { calculateErrorMetrics } from '../metrics/errorMetrics.js'
import { calculatePreampDb } from '../metrics/preamp.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import { auditCancellations } from './cancellation.js'
import { resolveStandardAutoEqConfig } from './config.js'
import { discreteRefine } from './discreteRefine.js'
import { optimizeGreedy } from './optimize.js'
import { pruneFilters } from './prune.js'
import { quantizeFilters } from './quantize.js'
import type { AutoEqResult, RunManifest, StandardAutoEqInput } from './types.js'

const TYPE_ORDER = { LS: 0, PK: 1, HS: 2 } as const

function sortDeliveredFilters(filters: readonly Filter[]): Filter[] {
  return [...filters].sort((left, right) =>
    left.frequencyHz - right.frequencyHz ||
    TYPE_ORDER[left.type] - TYPE_ORDER[right.type] ||
    left.gainDb - right.gainDb ||
    left.q - right.q ||
    left.id.localeCompare(right.id)
  )
}

export function runStandardAutoEq(input: StandardAutoEqInput): AutoEqResult {
  if (
    input === null ||
    typeof input !== 'object' ||
    input.source === null ||
    typeof input.source !== 'object' ||
    input.target === null ||
    typeof input.target !== 'object' ||
    input.normalization === null ||
    typeof input.normalization !== 'object' ||
    input.settings === null ||
    typeof input.settings !== 'object'
  ) {
    throw new CoreError('validation', 'AutoEQ run input is incomplete')
  }
  const config = resolveStandardAutoEqConfig(input.settings)
  if (input.source.kind !== 'fr' || input.target.kind !== 'target') {
    throw new CoreError('validation', 'AutoEQ requires an FR source and Target curve')
  }

  const canonicalFrequencies = createEvaluationGrid()
  const source = prepareCurve(input.source, input.normalization, canonicalFrequencies)
  const target = prepareCurve(input.target, input.normalization, canonicalFrequencies)
  const canonicalDesiredDb = desiredCorrection(source.db, target.db)
  const frequencies: number[] = []
  const desiredDb: number[] = []
  for (let index = 0; index < canonicalFrequencies.length; index += 1) {
    const frequencyHz = canonicalFrequencies[index]!
    if (frequencyHz >= config.minFrequencyHz && frequencyHz <= config.maxFrequencyHz) {
      frequencies.push(frequencyHz)
      desiredDb.push(canonicalDesiredDb[index]!)
    }
  }

  const optimized = optimizeGreedy({ desiredDb, frequencies, config })
  const pruned = pruneFilters({ filters: optimized.filters, desiredDb, frequencies, config })
  const quantized = quantizeFilters(pruned, config)
  const discrete = discreteRefine({ filters: quantized, desiredDb, frequencies, config })
  const delivered = sortDeliveredFilters(
    discrete.filter((filter) => filter.gainDb !== 0),
  ).map((filter, index): Filter => ({
    id: `autoeq-${index + 1}`,
    enabled: filter.enabled,
    type: filter.type,
    frequencyHz: filter.frequencyHz,
    gainDb: filter.gainDb,
    q: filter.q,
  }))

  const deliveredDb = cascadeMagnitudeDb(delivered, frequencies, config.sampleRateHz)
  const residualDb = desiredDb.map((value, index) => value - deliveredDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  const preampDb = calculatePreampDb(delivered, config.sampleRateHz).preampDb
  const cancellationAudit = auditCancellations(delivered, frequencies, config.sampleRateHz)
  const manifest: RunManifest = {
    schemaVersion: 1,
    algorithmVersion: config.algorithmVersion,
    profile: 'Standard',
    sampleRateHz: config.sampleRateHz,
    fitPointsPerOctave: config.fitPointsPerOctave,
    autoeqSettings: { ...input.settings },
    normalization: { ...input.normalization },
    sourceName: input.source.name,
    targetName: input.target.name,
    algorithmParameters: { ...config.algorithm },
    finalFilters: delivered.map((filter) => ({ ...filter })),
    metrics: { ...metrics },
    preampDb,
    cancellationAudit: {
      pairs: cancellationAudit.pairs.map((pair) => ({ ...pair })),
      totalScore: cancellationAudit.totalScore,
    },
  }

  return {
    filters: delivered,
    metrics,
    preampDb,
    cancellationAudit,
    manifest,
  }
}
