import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import { calculatePreampDb } from '../../metrics/preamp.js'
import type { BiquadResponseGrid } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellations } from '../cancellation.js'
import { finalizeDeliveredFilters } from '../runStandardAutoEq.js'
import type { StandardAutoEqV2Config } from './config.js'
import { cyclicDiscreteRefineV2, quantizeV2Filters } from './discreteRefine.js'
import { evaluateV2Solution, jointRefineV2, type V2EvaluatedSolution } from './jointRefine.js'
import {
  compareV2PrimaryMetrics,
  compareV2Solutions,
  isV2TargetAchieved,
} from './ranking.js'
import {
  createV2ResponseCache,
  removeV2ResponseCacheFilter,
  type V2ResponseCache,
} from './responseCache.js'
import {
  withResearchTracePhase,
  type StandardV2ResearchTrace,
} from './researchTrace.js'
import type { StandardV2Deadline } from './runtime.js'

export interface V2Deliverable extends V2EvaluatedSolution {
  preampDb: number
}

export interface BuildDeliverableV2Input {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
  responseGrid?: BiquadResponseGrid
  fallbackOnExpiration?: V2Deliverable
  researchTrace?: StandardV2ResearchTrace
}

export interface CompressDeliverableV2Input extends Omit<BuildDeliverableV2Input, 'filters'> {
  deliverable: V2Deliverable
}

export interface CompressDeliverableV2Result {
  deliverable: V2Deliverable
  completed: boolean
  expired: boolean
}

type V2RemovalCandidate = Omit<V2EvaluatedSolution, 'cancellationAudit'> & {
  cancellationAudit?: V2EvaluatedSolution['cancellationAudit']
}

function withPreamp(solution: V2EvaluatedSolution, sampleRateHz: number): V2Deliverable {
  return {
    ...solution,
    preampDb: calculatePreampDb(solution.filters, sampleRateHz).preampDb,
  }
}

function evaluateCachedRemovalPrimary(
  filters: readonly Filter[],
  responseCache: V2ResponseCache,
  filterIndex: number,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2RemovalCandidate {
  const candidateFilters = filters.filter((_, index) => index !== filterIndex)
  const candidateCache = removeV2ResponseCacheFilter(
    responseCache,
    filterIndex,
    frequencies,
    sampleRateHz,
  )
  const residualDb = desiredDb.map((value, index) => value - candidateCache.cascadeDb[index]!)
  return {
    filters: candidateFilters,
    responseCache: candidateCache,
    cascadeDb: candidateCache.cascadeDb,
    residualDb,
    metrics: calculateErrorMetrics(residualDb, frequencies),
  }
}

function withRemovalCancellationAudit(
  candidate: V2RemovalCandidate,
  frequencies: readonly number[],
  sampleRateHz: number,
): V2EvaluatedSolution {
  candidate.cancellationAudit ??= auditCancellations(
    candidate.filters,
    frequencies,
    sampleRateHz,
  )
  return candidate as V2EvaluatedSolution
}

function evaluateCachedRemoval(
  filters: readonly Filter[],
  responseCache: V2ResponseCache,
  filterIndex: number,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2EvaluatedSolution {
  return withRemovalCancellationAudit(
    evaluateCachedRemovalPrimary(
      filters,
      responseCache,
      filterIndex,
      desiredDb,
      frequencies,
      sampleRateHz,
    ),
    frequencies,
    sampleRateHz,
  )
}

function constrainToCap(input: BuildDeliverableV2Input): Filter[] {
  let filters = input.filters.map((filter) => ({ ...filter }))
  let responseCache: V2ResponseCache | undefined
  while (filters.length > input.config.maxFilters) {
    let best: V2RemovalCandidate | null = null
    for (let index = 0; index < filters.length; index += 1) {
      if (input.deadline.isExpired()) break
      responseCache ??= createV2ResponseCache(
        filters,
        input.frequencies,
        input.config.sampleRateHz,
        input.responseGrid,
      )
      const candidate = evaluateCachedRemovalPrimary(
        filters,
        responseCache,
        index,
        input.desiredDb,
        input.frequencies,
        input.config.sampleRateHz,
      )
      if (best === null) {
        best = candidate
        continue
      }
      const primaryComparison = compareV2PrimaryMetrics(candidate.metrics, best.metrics)
      if (primaryComparison < 0) {
        best = candidate
      } else if (primaryComparison === 0) {
        const auditedCandidate = withRemovalCancellationAudit(
          candidate,
          input.frequencies,
          input.config.sampleRateHz,
        )
        const auditedBest = withRemovalCancellationAudit(
          best,
          input.frequencies,
          input.config.sampleRateHz,
        )
        if (compareV2Solutions(auditedCandidate, auditedBest) < 0) best = candidate
      }
    }
    if (best === null) {
      filters = filters.slice(0, input.config.maxFilters)
      responseCache = undefined
    } else {
      filters = best.filters
      responseCache = best.responseCache
    }
  }
  return filters
}

function finishDeliveredFilters(
  filters: readonly Filter[],
  input: BuildDeliverableV2Input,
  responseGrid?: BiquadResponseGrid,
): V2Deliverable {
  const delivered = finalizeDeliveredFilters(filters.filter((filter) => filter.gainDb !== 0))
  const evaluated = evaluateV2Solution(
    delivered,
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
    responseGrid ?? input.responseGrid,
  )
  return withPreamp(evaluated, input.config.sampleRateHz)
}

export function buildCheckpointDeliverableV2(input: BuildDeliverableV2Input): V2Deliverable {
  return withResearchTracePhase(input.researchTrace, 'deliverable', () => {
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    const constrained = constrainToCap(input)
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    const quantized = quantizeV2Filters(constrained, input.config)
    const deliverable = finishDeliveredFilters(quantized, input, input.responseGrid)
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    input.researchTrace?.onDeliverableBuilt?.()
    return deliverable
  })
}

export function buildDeliverableV2(input: BuildDeliverableV2Input): V2Deliverable {
  return withResearchTracePhase(input.researchTrace, 'deliverable', () => {
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    const constrained = constrainToCap(input)
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    const discrete = cyclicDiscreteRefineV2({
      ...input,
      filters: constrained,
    })
    if (
      input.fallbackOnExpiration &&
      (discrete.expired || input.deadline.isExpired())
    ) {
      return input.fallbackOnExpiration
    }
    const deliverable = finishDeliveredFilters(
      discrete.filters,
      input,
      discrete.solution.responseCache.responseGrid,
    )
    if (input.fallbackOnExpiration && input.deadline.isExpired()) {
      return input.fallbackOnExpiration
    }
    input.researchTrace?.onDeliverableBuilt?.()
    return deliverable
  })
}

export function compressDeliverableV2(
  input: CompressDeliverableV2Input,
): CompressDeliverableV2Result {
  return withResearchTracePhase(input.researchTrace, 'compression', () => {
    let deliverable = input.deliverable
    if (!isV2TargetAchieved(deliverable.metrics)) {
      return { deliverable, completed: true, expired: false }
    }

    while (deliverable.filters.length > 0) {
      const removals: Array<{ index: number; solution: V2EvaluatedSolution }> = []
      for (let index = 0; index < deliverable.filters.length; index += 1) {
        if (input.deadline.isExpired()) {
          return { deliverable, completed: false, expired: true }
        }
        input.researchTrace?.onCompressionRemovalTrial?.()
        removals.push({
          index,
          solution: evaluateCachedRemoval(
            deliverable.filters,
            deliverable.responseCache,
            index,
            input.desiredDb,
            input.frequencies,
            input.config.sampleRateHz,
          ),
        })
      }
      removals.sort((left, right) => compareV2Solutions(left.solution, right.solution))
      let accepted: V2Deliverable | null = null
      for (const removal of removals) {
        if (input.deadline.isExpired()) {
          return { deliverable, completed: false, expired: true }
        }
        const refined = jointRefineV2({
          solution: removal.solution,
          desiredDb: input.desiredDb,
          frequencies: input.frequencies,
          config: input.config,
          deadline: input.deadline,
          researchTrace: input.researchTrace,
        })
        if (refined.expired) return { deliverable, completed: false, expired: true }
        const candidate = buildDeliverableV2({
          filters: refined.solution.filters,
          desiredDb: input.desiredDb,
          frequencies: input.frequencies,
          config: input.config,
          deadline: input.deadline,
          responseGrid: refined.solution.responseCache.responseGrid,
          fallbackOnExpiration: deliverable,
        })
        if (input.deadline.isExpired()) {
          return { deliverable, completed: false, expired: true }
        }
        if (isV2TargetAchieved(candidate.metrics)) {
          accepted = candidate
          break
        }
      }
      if (accepted === null) return { deliverable, completed: true, expired: false }
      deliverable = accepted
    }
    return { deliverable, completed: true, expired: false }
  })
}
