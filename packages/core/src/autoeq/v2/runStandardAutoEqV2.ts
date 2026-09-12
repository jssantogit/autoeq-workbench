import { createEvaluationGrid } from '../../config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../curves/derive.js'
import { cascadeMagnitudeDb } from '../../dsp/cascade.js'
import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import { CoreError } from '../../types/error.js'
import type { AutoEqResultV2, RunManifestV2, StandardAutoEqInputV2 } from '../types.js'
import { resolveStandardAutoEqV2Config } from './config.js'
import {
  buildCheckpointDeliverableV2,
  buildDeliverableV2,
  compressDeliverableV2,
  type V2Deliverable,
} from './deliverable.js'
import type { V2EvaluatedSolution } from './jointRefine.js'
import {
  compareV2DeliverableQuality,
  compareV2Solutions,
  isV2TargetAchieved,
} from './ranking.js'
import { createStandardV2DeadlineWindow, type StandardV2Runtime } from './runtime.js'
import { withResearchTracePhase } from './researchTrace.js'
import {
  searchStandardV2WorkingSolutions,
  type SearchResult,
} from './search.js'

function finalizationReserveMs(maxFilters: number): number {
  return Math.min(400, Math.max(100, maxFilters * 10))
}

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
  const { explorationDeadline, hardDeadline } = createStandardV2DeadlineWindow(
    runtime,
    input.settings.timeLimitSeconds,
    finalizationReserveMs(config.maxFilters),
  )
  const prepared = withResearchTracePhase(runtime.researchTrace, 'prepare', () => {
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
    return { frequencies, desiredDb }
  })
  const { frequencies, desiredDb } = prepared

  let bestDeliverable = buildDeliverableV2({
    filters: [], desiredDb, frequencies, config, deadline: hardDeadline,
    researchTrace: runtime.researchTrace,
  })
  const emitBestDeliverable = (): void => {
    runtime.researchTrace?.onBestDeliverableUpdated?.({
      metrics: { ...bestDeliverable.metrics },
      filters: bestDeliverable.filters.map((filter) => ({ ...filter })),
      preampDb: bestDeliverable.preampDb,
    })
  }
  const retainDeliverable = (candidate: V2Deliverable): void => {
    if (compareV2DeliverableQuality(candidate, bestDeliverable) < 0) {
      bestDeliverable = candidate
      emitBestDeliverable()
    }
  }
  emitBestDeliverable()
  let terminationReason: RunManifestV2['terminationReason']
  if (hardDeadline.isExpired()) {
    terminationReason = 'time-limit'
  } else if (isV2TargetAchieved(bestDeliverable.metrics)) {
    const compressed = compressDeliverableV2({
      deliverable: bestDeliverable, desiredDb, frequencies, config, deadline: hardDeadline,
      researchTrace: runtime.researchTrace,
    })
    const previous = bestDeliverable
    bestDeliverable = compressed.deliverable
    if (compareV2Solutions(bestDeliverable, previous) < 0) emitBestDeliverable()
    terminationReason = compressed.completed ? 'target-reached' : 'time-limit'
  } else {
    let searchTermination: SearchResult['termination'] = 'converged'
    for (const boundaryMode of ['half-height', 'sign-crossing', 'mixed'] as const) {
      if (explorationDeadline.isExpired()) {
        searchTermination = 'time-limit'
        break
      }
      runtime.onBoundaryModeAttempt?.(boundaryMode)
      runtime.researchTrace?.onBoundaryModeAttempt?.(boundaryMode)

      const modeBestCheckpoint: {
        deliverable: V2Deliverable | null
        source: V2EvaluatedSolution | null
      } = { deliverable: null, source: null }
      const checkpointedSources = new WeakSet<V2EvaluatedSolution>()
      const checkpointWorkingSolution = (solution: V2EvaluatedSolution): void => {
        if (checkpointedSources.has(solution)) return
        checkpointedSources.add(solution)
        const checkpoint = buildCheckpointDeliverableV2({
          filters: solution.filters,
          desiredDb,
          frequencies,
          config,
          deadline: hardDeadline,
          responseGrid: solution.responseCache.responseGrid,
          fallbackOnExpiration: bestDeliverable,
          researchTrace: runtime.researchTrace,
        })
        if (
          modeBestCheckpoint.deliverable === null ||
          compareV2DeliverableQuality(checkpoint, modeBestCheckpoint.deliverable) < 0
        ) {
          modeBestCheckpoint.deliverable = checkpoint
          modeBestCheckpoint.source = solution
        }
        retainDeliverable(checkpoint)
      }

      const search = searchStandardV2WorkingSolutions({
        desiredDb,
        frequencies,
        config,
        deadline: explorationDeadline,
        boundaryMode,
        researchTrace: runtime.researchTrace,
        onBestWorkingSolution: checkpointWorkingSolution,
        onWorkingSolution: checkpointWorkingSolution,
        isTargetCapable: () => isV2TargetAchieved(bestDeliverable.metrics),
      })
      searchTermination = search.termination

      if (
        search.termination !== 'time-limit' &&
        !hardDeadline.isExpired() &&
        !isV2TargetAchieved(bestDeliverable.metrics)
      ) {
        const deepSources: V2EvaluatedSolution[] = [search.bestSolution]
        if (
          modeBestCheckpoint.source !== null &&
          modeBestCheckpoint.source !== search.bestSolution
        ) {
          deepSources.push(modeBestCheckpoint.source)
        }
        for (const source of deepSources) {
          if (hardDeadline.isExpired()) break
          const deliverable = buildDeliverableV2({
            filters: source.filters,
            desiredDb,
            frequencies,
            config,
            deadline: hardDeadline,
            responseGrid: source.responseCache.responseGrid,
            fallbackOnExpiration: bestDeliverable,
            researchTrace: runtime.researchTrace,
          })
          retainDeliverable(deliverable)
          if (isV2TargetAchieved(bestDeliverable.metrics)) break
        }
      }

      if (
        isV2TargetAchieved(bestDeliverable.metrics) ||
        search.termination === 'time-limit' ||
        hardDeadline.isExpired()
      ) break
    }
    if (isV2TargetAchieved(bestDeliverable.metrics) && !hardDeadline.isExpired()) {
      const compressed = compressDeliverableV2({
        deliverable: bestDeliverable, desiredDb, frequencies, config, deadline: hardDeadline,
        researchTrace: runtime.researchTrace,
      })
      const previous = bestDeliverable
      bestDeliverable = compressed.deliverable
      if (compareV2Solutions(bestDeliverable, previous) < 0) emitBestDeliverable()
      terminationReason = compressed.completed ? 'target-reached' : 'time-limit'
    } else {
      terminationReason = searchTermination === 'time-limit' || hardDeadline.isExpired()
        ? 'time-limit'
        : 'converged'
    }
  }

  const canonicalCascadeDb = cascadeMagnitudeDb(
    bestDeliverable.filters,
    frequencies,
    config.sampleRateHz,
  )
  const canonicalResidualDb = desiredDb.map((desired, index) =>
    desired - canonicalCascadeDb[index]!)
  const canonicalMetrics = calculateErrorMetrics(canonicalResidualDb, frequencies)
  const targetAchieved = isV2TargetAchieved(canonicalMetrics)
  if (terminationReason === 'target-reached' && !targetAchieved) {
    terminationReason = 'converged'
  }

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
    metrics: { ...canonicalMetrics },
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
    metrics: canonicalMetrics,
    preampDb: bestDeliverable.preampDb,
    cancellationAudit: bestDeliverable.cancellationAudit,
    manifest,
  }
}
