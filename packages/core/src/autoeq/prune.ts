import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import { evaluateCascadeObjective, refineFilters } from './refine.js'
import type { AutoEqConfig } from './types.js'

interface PruneInput {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}

export function pruneFilters({
  filters: inputFilters,
  desiredDb,
  frequencies,
  config,
}: PruneInput): Filter[] {
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

  const filters = inputFilters
    .filter((filter) => Math.abs(filter.gainDb) >= 0.05)
    .map((filter) => ({ ...filter }))
  let currentObjective = evaluateCascadeObjective(filters, desiredDb, frequencies, config)
  let index = 0

  while (index < filters.length) {
    const without = filters.filter((_, candidateIndex) => candidateIndex !== index)
    const objectiveWithout = evaluateCascadeObjective(without, desiredDb, frequencies, config)
    if (objectiveWithout <= currentObjective + config.algorithm.pruneTolerance) {
      filters.splice(index, 1)
      currentObjective = objectiveWithout
      index = 0
    } else {
      index += 1
    }
  }

  return refineFilters({ filters, desiredDb, frequencies, config })
}
