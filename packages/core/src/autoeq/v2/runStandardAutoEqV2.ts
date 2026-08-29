import { createEvaluationGrid } from '../../config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../curves/derive.js'
import { CoreError } from '../../types/error.js'
import type { AutoEqResultV2, RunManifestV2, StandardAutoEqInputV2 } from '../types.js'
import { resolveStandardAutoEqV2Config } from './config.js'
import { buildDeliverableV2, compressDeliverableV2, type V2Deliverable } from './deliverable.js'
import { compareV2Solutions, isV2TargetAchieved, type V2Solution } from './ranking.js'
import { createStandardV2Deadline, type StandardV2Runtime } from './runtime.js'
import { searchStandardV2WorkingSolutions } from './search.js'

export function runStandardAutoEqV2(
  input: StandardAutoEqInputV2,
  runtime: StandardV2Runtime = { nowMs: () => performance.now() },
): AutoEqResultV2 {
  if (
    input === null || typeof input !== 'object' ||
    input.source === null || typeof input.source !== 'object' ||
    input.target === null || typeof input.target !== 'object' ||
    input.normalization === null || typeof input.normalization !== 'object' ||
    input.settings === null || typeof input.settings !== 'object'
  ) {
    throw new CoreError('validation', 'AutoEQ run input is incomplete')
  }
  const config = resolveStandardAutoEqV2Config(input.settings)
  if (input.source.kind !== 'fr' || input.target.kind !== 'target') {
    throw new CoreError('validation', 'AutoEQ requires an FR source and Target curve')
  }
  const deadline = createStandardV2Deadline(runtime, input.settings.timeLimitSeconds)
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

  let bestDeliverable = buildDeliverableV2({
    filters: [], desiredDb, frequencies, config, deadline,
  })
  let terminationReason: RunManifestV2['terminationReason']
  if (deadline.isExpired()) {
    terminationReason = 'time-limit'
  } else if (isV2TargetAchieved(bestDeliverable.metrics)) {
    const compressed = compressDeliverableV2({
      deliverable: bestDeliverable, desiredDb, frequencies, config, deadline,
    })
    bestDeliverable = compressed.deliverable
    terminationReason = compressed.completed ? 'target-reached' : 'time-limit'
  } else {
    let bestWorking: V2Solution | null = null
    const search = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config,
      deadline,
      onWorkingSolution: (solution) => {
        if (bestWorking !== null && compareV2Solutions(solution, bestWorking) >= 0) return
        bestWorking = solution
        const deliverable = buildDeliverableV2({
          filters: solution.filters, desiredDb, frequencies, config, deadline,
        })
        if (compareV2Solutions(deliverable, bestDeliverable) < 0) bestDeliverable = deliverable
      },
      isTargetCapable: () => isV2TargetAchieved(bestDeliverable.metrics),
    })
    if (isV2TargetAchieved(bestDeliverable.metrics) && !deadline.isExpired()) {
      const compressed = compressDeliverableV2({
        deliverable: bestDeliverable, desiredDb, frequencies, config, deadline,
      })
      bestDeliverable = compressed.deliverable
      terminationReason = compressed.completed ? 'target-reached' : 'time-limit'
    } else {
      terminationReason = search.termination === 'time-limit' || deadline.isExpired()
        ? 'time-limit'
        : 'converged'
    }
  }

  const targetAchieved = isV2TargetAchieved(bestDeliverable.metrics)
  const manifest: RunManifestV2 = {
    schemaVersion: 3,
    algorithmVersion: 'standard-v2',
    profile: 'Standard',
    sampleRateHz: config.sampleRateHz,
    fitPointsPerOctave: config.fitPointsPerOctave,
    autoeqSettings: { ...input.settings },
    normalization: { ...input.normalization },
    sourceName: input.source.name,
    targetName: input.target.name,
    algorithmParameters: { ...config.algorithm },
    finalFilters: bestDeliverable.filters.map((filter) => ({ ...filter })),
    metrics: { ...bestDeliverable.metrics },
    preampDb: bestDeliverable.preampDb,
    cancellationAudit: {
      pairs: bestDeliverable.cancellationAudit.pairs.map((pair) => ({ ...pair })),
      totalScore: bestDeliverable.cancellationAudit.totalScore,
    },
    terminationReason,
    targetAchieved,
  }
  return {
    filters: bestDeliverable.filters,
    metrics: bestDeliverable.metrics,
    preampDb: bestDeliverable.preampDb,
    cancellationAudit: bestDeliverable.cancellationAudit,
    manifest,
  }
}
