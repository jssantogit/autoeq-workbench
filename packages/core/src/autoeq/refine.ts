import { cascadeMagnitudeDb } from '../dsp/cascade.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import { evaluateObjective } from './loss.js'
import type { AutoEqConfig, CancellationAudit } from './types.js'

interface RefineInput {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}

interface CoordinatePass {
  fcOctaveStep: number
  gainStepDb: number
  qOctaveStep: number
}

const COORDINATE_PASSES: readonly CoordinatePass[] = [
  { fcOctaveStep: 1 / 6, gainStepDb: 1, qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1, qOctaveStep: 1 / 32 },
]

const NO_CANCELLATION: CancellationAudit = { pairs: [], totalScore: 0 }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function validateInput({ desiredDb, frequencies }: RefineInput): void {
  if (
    !Array.isArray(desiredDb) ||
    !Array.isArray(frequencies) ||
    desiredDb.length === 0 ||
    desiredDb.length !== frequencies.length
  ) {
    throw new CoreError(
      'validation',
      'Desired response and frequency arrays must be non-empty and equal length',
    )
  }
  if ([...desiredDb, ...frequencies].some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Desired response and frequency values must be finite')
  }
}

function normalizedFilter(filter: Filter, config: AutoEqConfig): Filter {
  return {
    ...filter,
    frequencyHz: clamp(filter.frequencyHz, config.minFrequencyHz, config.maxFrequencyHz),
    gainDb: clamp(filter.gainDb, config.minGainDb, config.maxGainDb),
    q: filter.type === 'PK'
      ? clamp(filter.q, config.minPkQ, config.maxPkQ)
      : config.shelfQ,
  }
}

export function evaluateCascadeObjective(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  config: AutoEqConfig,
): number {
  const actualDb = cascadeMagnitudeDb(filters, frequencies, config.sampleRateHz)
  const residualDb = desiredDb.map((value, index) => value - actualDb[index]!)
  return evaluateObjective({
    residualDb,
    filters,
    cancellationAudit: NO_CANCELLATION,
    config,
  })
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
  desiredDb: readonly number[],
  frequencies: readonly number[],
  config: AutoEqConfig,
): Filter {
  let best = candidates[0]!
  filters[filterIndex] = best
  let bestObjective = evaluateCascadeObjective(filters, desiredDb, frequencies, config)

  for (const candidate of candidates.slice(1)) {
    filters[filterIndex] = candidate
    const objective = evaluateCascadeObjective(filters, desiredDb, frequencies, config)
    if (objective < bestObjective || (objective === bestObjective && winsTie(candidate, best))) {
      best = candidate
      bestObjective = objective
    }
  }

  filters[filterIndex] = best
  return best
}

export function refineFilters(input: RefineInput): Filter[] {
  validateInput(input)
  const { desiredDb, frequencies, config } = input
  const filters = input.filters.map((filter) => normalizedFilter(filter, config))

  for (const pass of COORDINATE_PASSES) {
    for (let index = 0; index < filters.length; index += 1) {
      let filter = filters[index]!
      filter = chooseCoordinate(
        filters,
        index,
        [
          filter,
          {
            ...filter,
            frequencyHz: clamp(
              filter.frequencyHz * 2 ** -pass.fcOctaveStep,
              config.minFrequencyHz,
              config.maxFrequencyHz,
            ),
          },
          {
            ...filter,
            frequencyHz: clamp(
              filter.frequencyHz * 2 ** pass.fcOctaveStep,
              config.minFrequencyHz,
              config.maxFrequencyHz,
            ),
          },
        ],
        desiredDb,
        frequencies,
        config,
      )
      filter = chooseCoordinate(
        filters,
        index,
        [
          filter,
          {
            ...filter,
            gainDb: clamp(filter.gainDb - pass.gainStepDb, config.minGainDb, config.maxGainDb),
          },
          {
            ...filter,
            gainDb: clamp(filter.gainDb + pass.gainStepDb, config.minGainDb, config.maxGainDb),
          },
        ],
        desiredDb,
        frequencies,
        config,
      )
      if (filter.type === 'PK') {
        filter = chooseCoordinate(
          filters,
          index,
          [
            filter,
            {
              ...filter,
              q: clamp(filter.q * 2 ** -pass.qOctaveStep, config.minPkQ, config.maxPkQ),
            },
            {
              ...filter,
              q: clamp(filter.q * 2 ** pass.qOctaveStep, config.minPkQ, config.maxPkQ),
            },
          ],
          desiredDb,
          frequencies,
          config,
        )
      }
      filters[index] = filter
    }
  }

  return filters
}
