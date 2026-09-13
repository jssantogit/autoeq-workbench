import { calculatePreampDb } from '../../metrics/preamp.js'
import type { BiquadResponseGrid } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import { finalizeDeliveredFilters } from '../runStandardAutoEq.js'
import type { StandardAutoEqV2Config } from './config.js'
import { cyclicDiscreteRefineV2 } from './discreteRefine.js'
import { evaluateV2Solution, jointRefineV2, type V2EvaluatedSolution } from './jointRefine.js'
import { compareV2Solutions, isV2TargetAchieved } from './ranking.js'
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

function withPreamp(solution: V2EvaluatedSolution, sampleRateHz: number): V2Deliverable {
  return {
    ...solution,
    preampDb: calculatePreampDb(solution.filters, sampleRateHz).preampDb,
  }
}

function constrainToCap(input: BuildDeliverableV2Input): Filter[] {
  let filters = input.filters.map((filter) => ({ ...filter }))
  while (filters.length > input.config.maxFilters) {
    let best: V2EvaluatedSolution | null = null
    for (let index = 0; index < filters.length; index += 1) {
      if (input.deadline.isExpired()) break
      const candidate = evaluateV2Solution(
        filters.filter((_, candidateIndex) => candidateIndex !== index),
        input.desiredDb,
        input.frequencies,
        input.config.sampleRateHz,
        input.responseGrid,
      )
      if (best === null || compareV2Solutions(candidate, best) < 0) best = candidate
    }
    filters = best?.filters ?? filters.slice(0, input.config.maxFilters)
  }
  return filters
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
  const delivered = finalizeDeliveredFilters(
    discrete.filters.filter((filter) => filter.gainDb !== 0),
  )
  const evaluated = evaluateV2Solution(
    delivered,
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
    discrete.solution.responseCache.responseGrid,
  )
  if (input.fallbackOnExpiration && input.deadline.isExpired()) {
    return input.fallbackOnExpiration
  }
  const deliverable = withPreamp(evaluated, input.config.sampleRateHz)
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
        solution: evaluateV2Solution(
          deliverable.filters.filter((_, filterIndex) => filterIndex !== index),
          input.desiredDb,
          input.frequencies,
          input.config.sampleRateHz,
          deliverable.responseCache.responseGrid,
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
