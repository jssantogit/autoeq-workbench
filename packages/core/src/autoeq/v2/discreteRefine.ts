import type { Filter } from '../../types/filter.js'
import { POWERAMP_MANUAL_ENTRY_POLICY } from '../quantize.js'
import type { StandardAutoEqV2Config } from './config.js'
import { compareV2Solutions } from './ranking.js'
import { evaluateV2Solution, type V2EvaluatedSolution } from './jointRefine.js'
import type { StandardV2Deadline } from './runtime.js'

export interface DiscreteRefineV2Input {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
}

export interface DiscreteRefineV2Result {
  filters: Filter[]
  solution: V2EvaluatedSolution
  completedCycles: number
  expired: boolean
}

function decimals(step: number): number {
  return String(step).split('.')[1]?.length ?? 0
}

function normalize(value: number, step: number): number {
  const normalized = Number(value.toFixed(decimals(step)))
  return Object.is(normalized, -0) ? 0 : normalized
}

function project(value: number, step: number, minimum: number, maximum: number): number | null {
  const minIndex = Math.ceil((minimum - 1e-10) / step)
  const maxIndex = Math.floor((maximum + 1e-10) / step)
  if (minIndex > maxIndex) return null
  return normalize(
    Math.min(maxIndex, Math.max(minIndex, Math.round(value / step))) * step,
    step,
  )
}

export function quantizeV2Filters(
  filters: readonly Filter[],
  config: StandardAutoEqV2Config,
): Filter[] {
  const result: Filter[] = []
  for (const filter of filters) {
    const frequencyHz = project(filter.frequencyHz, 1, config.minFrequencyHz, config.maxFrequencyHz)
    const gainDb = project(filter.gainDb, 0.1, config.minGainDb, config.maxGainDb)
    const q = filter.type === 'PK'
      ? project(filter.q, 0.01, config.minPkQ, config.maxPkQ)
      : 0.7
    if (frequencyHz !== null && gainDb !== null && q !== null) {
      result.push({ ...filter, frequencyHz, gainDb, q })
    }
  }
  return result
}

export function cyclicDiscreteRefineV2(
  input: DiscreteRefineV2Input,
): DiscreteRefineV2Result {
  let solution = evaluateV2Solution(
    quantizeV2Filters(input.filters, input.config),
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
  )
  let completedCycles = 0
  while (true) {
    if (input.deadline.isExpired()) {
      return { filters: solution.filters, solution, completedCycles, expired: true }
    }
    const cycleStart = solution
    for (let filterIndex = 0; filterIndex < solution.filters.length; filterIndex += 1) {
      for (const [coordinate, step, minimum, maximum] of [
        ['frequencyHz', POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz, input.config.minFrequencyHz, input.config.maxFrequencyHz],
        ['gainDb', POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb, input.config.minGainDb, input.config.maxGainDb],
        ...(solution.filters[filterIndex]!.type === 'PK'
          ? [['q', POWERAMP_MANUAL_ENTRY_POLICY.qStep, input.config.minPkQ, input.config.maxPkQ]]
          : []),
      ] as Array<[keyof Pick<Filter, 'frequencyHz' | 'gainDb' | 'q'>, number, number, number]>) {
        let best = solution
        const current = solution.filters[filterIndex]!
        for (const direction of [-1, 1]) {
          const value = project(current[coordinate] + direction * step, step, minimum, maximum)
          if (value === null || value === current[coordinate]) continue
          if (input.deadline.isExpired()) {
            return { filters: solution.filters, solution, completedCycles, expired: true }
          }
          const filters = solution.filters.map((filter, index) =>
            index === filterIndex ? { ...filter, [coordinate]: value } : filter)
          const candidate = evaluateV2Solution(
            filters,
            input.desiredDb,
            input.frequencies,
            input.config.sampleRateHz,
          )
          if (compareV2Solutions(candidate, best) < 0) best = candidate
        }
        solution = best
      }
    }
    completedCycles += 1
    if (compareV2Solutions(solution, cycleStart) >= 0) {
      return { filters: solution.filters, solution, completedCycles, expired: false }
    }
  }
}
