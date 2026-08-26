import { cascadeMagnitudeDb } from '../dsp/cascade.js'
import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import { generateCandidates } from './candidates.js'
import { evaluateCascadeObjective, refineFilters } from './refine.js'
import type { AutoEqConfig } from './types.js'

interface OptimizeInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}

export interface OptimizationState {
  filters: Filter[]
  objective: number
  acceptedObjectives: number[]
}

function winsCandidateTie(candidate: readonly Filter[], current: readonly Filter[]): boolean {
  const candidateFilter = candidate[candidate.length - 1]!
  const currentFilter = current[current.length - 1]!
  return Math.abs(candidateFilter.gainDb) < Math.abs(currentFilter.gainDb) ||
    (
      Math.abs(candidateFilter.gainDb) === Math.abs(currentFilter.gainDb) &&
      candidateFilter.q < currentFilter.q
    ) ||
    (
      Math.abs(candidateFilter.gainDb) === Math.abs(currentFilter.gainDb) &&
      candidateFilter.q === currentFilter.q &&
      candidateFilter.frequencyHz < currentFilter.frequencyHz
    )
}

export function optimizeGreedy({
  desiredDb,
  frequencies,
  config,
}: OptimizeInput): OptimizationState {
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
  if (desiredDb.some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Desired response values must be finite')
  }

  let filters: Filter[] = []
  let objective = evaluateCascadeObjective(filters, desiredDb, frequencies, config)
  const acceptedObjectives: number[] = []

  while (filters.length < config.maxFilters) {
    const actualDb = cascadeMagnitudeDb(filters, frequencies, config.sampleRateHz)
    const residualDb = desiredDb.map((value, index) => value - actualDb[index]!)
    const candidates = generateCandidates({ frequencies, residualDb, config })
    if (candidates.length === 0) break

    let bestFilters: Filter[] | null = null
    let bestObjective = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      const optimizerCandidate = {
        ...candidate,
        id: `candidate-${filters.length + 1}`,
      }
      const refined = refineFilters({
        filters: [...filters, optimizerCandidate],
        desiredDb,
        frequencies,
        config,
      })
      const candidateObjective = evaluateCascadeObjective(
        refined,
        desiredDb,
        frequencies,
        config,
      )
      if (
        candidateObjective < bestObjective ||
        (
          candidateObjective === bestObjective &&
          bestFilters !== null &&
          winsCandidateTie(refined, bestFilters)
        )
      ) {
        bestFilters = refined
        bestObjective = candidateObjective
      }
    }

    if (
      bestFilters === null ||
      objective - bestObjective < config.algorithm.minObjectiveImprovement
    ) break

    filters = bestFilters
    objective = bestObjective
    acceptedObjectives.push(objective)
  }

  return { filters, objective, acceptedObjectives }
}
