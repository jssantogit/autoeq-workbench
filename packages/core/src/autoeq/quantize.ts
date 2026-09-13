import type { Filter } from '../types/filter.js'
import type { AutoEqConfig } from './types.js'

export const POWERAMP_MANUAL_ENTRY_POLICY = {
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1,
} as const

function decimalPlaces(step: number): number {
  const text = String(step)
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

function normalize(value: number, step: number): number {
  const normalized = Number(value.toFixed(decimalPlaces(step)))
  return Object.is(normalized, -0) ? 0 : normalized
}

function projectToGrid(
  value: number,
  step: number,
  minimum: number,
  maximum: number,
  preferLowerMagnitude: boolean,
): number | null {
  const epsilon = 1e-10
  const minimumIndex = Math.ceil(minimum / step - epsilon)
  const maximumIndex = Math.floor(maximum / step + epsilon)
  if (minimumIndex > maximumIndex) return null

  const scaled = value / step
  const indexes = [
    Math.min(maximumIndex, Math.max(minimumIndex, Math.floor(scaled))),
    Math.min(maximumIndex, Math.max(minimumIndex, Math.ceil(scaled))),
  ]
  let bestIndex = indexes[0]!
  let bestDistance = Math.abs(value - bestIndex * step)
  for (const index of indexes.slice(1)) {
    const distance = Math.abs(value - index * step)
    if (
      distance < bestDistance - epsilon ||
      (
        Math.abs(distance - bestDistance) <= epsilon &&
        (
          preferLowerMagnitude
            ? Math.abs(index) < Math.abs(bestIndex) ||
              (Math.abs(index) === Math.abs(bestIndex) && index < bestIndex)
            : index < bestIndex
        )
      )
    ) {
      bestIndex = index
      bestDistance = distance
    }
  }
  return normalize(bestIndex * step, step)
}

export function quantizeFilters(
  filters: readonly Filter[],
  config: AutoEqConfig,
): Filter[] {
  const projected: Filter[] = []
  for (const filter of filters) {
    const frequencyHz = projectToGrid(
      filter.frequencyHz,
      POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz,
      config.minFrequencyHz,
      config.maxFrequencyHz,
      false,
    )
    const gainDb = projectToGrid(
      filter.gainDb,
      POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb,
      config.minGainDb,
      config.maxGainDb,
      true,
    )
    const q = filter.type === 'PK'
      ? projectToGrid(
        filter.q,
        POWERAMP_MANUAL_ENTRY_POLICY.qStep,
        config.minPkQ,
        config.maxPkQ,
        false,
      )
      : config.shelfQ
    if (frequencyHz === null || gainDb === null || q === null) continue
    projected.push({ ...filter, frequencyHz, gainDb, q })
  }
  return projected
}
