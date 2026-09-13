import { validateResponseInput } from '../dsp/response.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import { POWERAMP_MANUAL_ENTRY_POLICY, quantizeFilters } from './quantize.js'
import { evaluateCascadeObjective } from './refine.js'
import type { AutoEqConfig } from './types.js'

interface DiscreteRefineInput {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}

function winsTie(candidate: Filter, current: Filter): boolean {
  return Math.abs(candidate.gainDb) < Math.abs(current.gainDb) ||
    (Math.abs(candidate.gainDb) === Math.abs(current.gainDb) && candidate.q < current.q) ||
    (
      Math.abs(candidate.gainDb) === Math.abs(current.gainDb) &&
      candidate.q === current.q &&
      candidate.frequencyHz < current.frequencyHz
    )
}

function chooseCoordinate(
  filters: Filter[],
  filterIndex: number,
  candidates: readonly Filter[],
  input: DiscreteRefineInput,
): Filter {
  let best = candidates[0]!
  filters[filterIndex] = best
  let bestObjective = evaluateCascadeObjective(
    filters,
    input.desiredDb,
    input.frequencies,
    input.config,
  )

  for (const candidate of candidates.slice(1)) {
    filters[filterIndex] = candidate
    const objective = evaluateCascadeObjective(
      filters,
      input.desiredDb,
      input.frequencies,
      input.config,
    )
    if (objective < bestObjective || (objective === bestObjective && winsTie(candidate, best))) {
      best = candidate
      bestObjective = objective
    }
  }

  filters[filterIndex] = best
  return best
}

function coordinateCandidates(
  filter: Filter,
  coordinate: 'frequencyHz' | 'gainDb' | 'q',
  step: number,
  minimum: number,
  maximum: number,
  config: AutoEqConfig,
): Filter[] {
  const candidates = [filter]
  for (const direction of [-1, 1]) {
    const value = filter[coordinate] + direction * step
    if (value < minimum - 1e-10 || value > maximum + 1e-10) continue
    const [candidate] = quantizeFilters([{ ...filter, [coordinate]: value }], config)
    if (candidate !== undefined) candidates.push(candidate)
  }
  return candidates
}

export function discreteRefine(input: DiscreteRefineInput): Filter[] {
  if (
    !Array.isArray(input.desiredDb) ||
    !Array.isArray(input.frequencies) ||
    input.desiredDb.length === 0 ||
    input.desiredDb.length !== input.frequencies.length
  ) {
    throw new CoreError(
      'validation',
      'Desired response and frequency arrays must be non-empty and equal length',
    )
  }
  if (input.desiredDb.some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Desired response values must be finite')
  }
  validateResponseInput(input.frequencies, input.config.sampleRateHz)

  const filters = quantizeFilters(input.filters, input.config)
  const policy = POWERAMP_MANUAL_ENTRY_POLICY

  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < filters.length; index += 1) {
      let filter = filters[index]!
      filter = chooseCoordinate(filters, index, coordinateCandidates(
        filter,
        'frequencyHz',
        policy.frequencyStepHz,
        input.config.minFrequencyHz,
        input.config.maxFrequencyHz,
        input.config,
      ), input)
      filter = chooseCoordinate(filters, index, coordinateCandidates(
        filter,
        'gainDb',
        policy.gainStepDb,
        input.config.minGainDb,
        input.config.maxGainDb,
        input.config,
      ), input)
      if (filter.type === 'PK') {
        filter = chooseCoordinate(filters, index, coordinateCandidates(
          filter,
          'q',
          policy.qStep,
          input.config.minPkQ,
          input.config.maxPkQ,
          input.config,
        ), input)
      }
      filters[index] = filter
    }
  }

  return filters
}
