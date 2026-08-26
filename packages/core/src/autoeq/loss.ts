import { CoreError } from '../types/error.js'
import type { Filter } from '../types/filter.js'
import type { AutoEqConfig, CancellationAudit } from './types.js'

export interface ObjectiveInput {
  residualDb: readonly number[]
  filters: readonly Filter[]
  cancellationAudit: CancellationAudit
  config: AutoEqConfig
}

export function evaluateObjective({
  residualDb,
  filters,
  cancellationAudit,
  config,
}: ObjectiveInput): number {
  if (!Array.isArray(residualDb) || residualDb.length === 0) {
    throw new CoreError('validation', 'Residual values must be a non-empty array')
  }
  if (residualDb.some((value) => !Number.isFinite(value))) {
    throw new CoreError('validation', 'Residual values must be finite')
  }
  if (!Number.isFinite(cancellationAudit.totalScore) || cancellationAudit.totalScore < 0) {
    throw new CoreError('validation', 'Cancellation score must be a finite non-negative value')
  }

  const { algorithm } = config
  let fitSum = 0
  for (const errorDb of residualDb) {
    const magnitude = Math.max(0, Math.abs(errorDb) - algorithm.deadbandDb)
    fitSum += magnitude <= algorithm.huberDeltaDb
      ? 0.5 * magnitude * magnitude
      : algorithm.huberDeltaDb * (magnitude - 0.5 * algorithm.huberDeltaDb)
  }

  let highQPenalty = 0
  let gainPenalty = 0
  for (const filter of filters) {
    const highQ = Math.max(0, Math.log2(filter.q / 2))
    const excessGain = Math.max(0, Math.abs(filter.gainDb) - 6)
    highQPenalty += highQ * highQ * algorithm.highQWeight
    gainPenalty += excessGain * excessGain * algorithm.gainWeight
  }

  const objective =
    fitSum / residualDb.length +
    filters.length * algorithm.filterCountWeight +
    highQPenalty +
    gainPenalty +
    cancellationAudit.totalScore * algorithm.cancellationWeight

  if (!Number.isFinite(objective)) {
    throw new CoreError('numeric', 'AutoEQ objective must be finite')
  }
  return objective
}
