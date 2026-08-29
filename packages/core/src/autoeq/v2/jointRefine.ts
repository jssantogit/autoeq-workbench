import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellations } from '../cancellation.js'
import type { StandardAutoEqV2Config } from './config.js'
import { compareV2Solutions, type V2Solution } from './ranking.js'
import {
  createV2ResponseCache,
  replaceV2ResponseCacheFilter,
  type V2ResponseCache,
} from './responseCache.js'
import type { StandardV2Deadline } from './runtime.js'

export const JOINT_REFINEMENT_SCALES = Object.freeze([
  { fcOctaveStep: 1 / 6, gainStepDb: 1, qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1, qOctaveStep: 1 / 32 },
])

export interface V2EvaluatedSolution extends V2Solution {
  responseCache: V2ResponseCache
  cascadeDb: number[]
  residualDb: number[]
}

export interface JointRefineInput {
  solution: V2Solution
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
}

export interface JointRefineResult {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  expired: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function evaluateV2Solution(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): V2EvaluatedSolution {
  const copiedFilters = filters.map((filter) => ({ ...filter }))
  const responseCache = createV2ResponseCache(copiedFilters, frequencies, sampleRateHz)
  const residualDb = desiredDb.length === frequencies.length
    ? desiredDb.map((value, index) => value - responseCache.cascadeDb[index]!)
    : frequencies.map(() => 0)
  return {
    filters: copiedFilters,
    responseCache,
    cascadeDb: responseCache.cascadeDb,
    residualDb,
    metrics: calculateErrorMetrics(residualDb, frequencies),
    cancellationAudit: auditCancellations(copiedFilters, frequencies, sampleRateHz),
  }
}

function evaluatedReplacement(
  solution: V2EvaluatedSolution,
  filterIndex: number,
  replacement: Filter,
  desiredDb: readonly number[],
  frequencies: readonly number[],
  config: StandardAutoEqV2Config,
): V2EvaluatedSolution {
  const filters = solution.filters.map((filter, index) =>
    index === filterIndex ? replacement : filter)
  const responseCache = replaceV2ResponseCacheFilter(
    solution.responseCache,
    filterIndex,
    replacement,
    frequencies,
    config.sampleRateHz,
  )
  const residualDb = desiredDb.map((value, index) => value - responseCache.cascadeDb[index]!)
  return {
    filters,
    responseCache,
    cascadeDb: responseCache.cascadeDb,
    residualDb,
    metrics: calculateErrorMetrics(residualDb, frequencies),
    cancellationAudit: auditCancellations(filters, frequencies, config.sampleRateHz),
  }
}

function uniqueTrials(filters: readonly Filter[]): Filter[] {
  const seen = new Set<string>()
  return filters.filter((filter) => {
    const key = `${filter.frequencyHz}|${filter.gainDb}|${filter.q}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function jointRefineV2(input: JointRefineInput): JointRefineResult {
  let solution = evaluateV2Solution(
    input.solution.filters,
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
  )
  let completedCycles = 0
  let coordinateTrials = 0

  for (let cycle = 0; cycle < input.config.algorithm.maxJointRefinementCycles; cycle += 1) {
    if (input.deadline.isExpired()) {
      return { solution, completedCycles, coordinateTrials, expired: true }
    }
    const cycleStart = solution
    for (const scale of JOINT_REFINEMENT_SCALES) {
      for (let filterIndex = 0; filterIndex < solution.filters.length; filterIndex += 1) {
        const startingFilter = solution.filters[filterIndex]!
        const coordinates: Filter[][] = [
          uniqueTrials([
            { ...startingFilter, frequencyHz: clamp(startingFilter.frequencyHz * 2 ** -scale.fcOctaveStep, input.config.minFrequencyHz, input.config.maxFrequencyHz) },
            { ...startingFilter, frequencyHz: clamp(startingFilter.frequencyHz * 2 ** scale.fcOctaveStep, input.config.minFrequencyHz, input.config.maxFrequencyHz) },
          ]),
          uniqueTrials([
            { ...startingFilter, gainDb: clamp(startingFilter.gainDb - scale.gainStepDb, input.config.minGainDb, input.config.maxGainDb) },
            { ...startingFilter, gainDb: clamp(startingFilter.gainDb + scale.gainStepDb, input.config.minGainDb, input.config.maxGainDb) },
          ]),
        ]
        if (startingFilter.type === 'PK') {
          coordinates.push(uniqueTrials([
            { ...startingFilter, q: clamp(startingFilter.q * 2 ** -scale.qOctaveStep, input.config.minPkQ, input.config.maxPkQ) },
            { ...startingFilter, q: clamp(startingFilter.q * 2 ** scale.qOctaveStep, input.config.minPkQ, input.config.maxPkQ) },
          ]))
        }

        for (const trials of coordinates) {
          let best = solution
          for (const trial of trials) {
            if (input.deadline.isExpired()) {
              return { solution, completedCycles, coordinateTrials, expired: true }
            }
            coordinateTrials += 1
            const candidate = evaluatedReplacement(
              solution,
              filterIndex,
              trial,
              input.desiredDb,
              input.frequencies,
              input.config,
            )
            if (compareV2Solutions(candidate, best) < 0) best = candidate
          }
          solution = best
        }
      }
    }
    completedCycles += 1
    if (compareV2Solutions(solution, cycleStart) >= 0) break
  }
  return { solution, completedCycles, coordinateTrials, expired: false }
}
