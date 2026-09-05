import type { ErrorMetrics } from '../../metrics/errorMetrics.js'
import type { Filter } from '../../types/filter.js'
import type { CancellationAudit } from '../types.js'

const TYPE_ORDER = { LS: 0, PK: 1, HS: 2 } as const

export interface V2Solution {
  filters: Filter[]
  metrics: ErrorMetrics
  cancellationAudit: CancellationAudit
}

export function isV2TargetAchieved(metrics: ErrorMetrics): boolean {
  return metrics.rmseDb <= 0.25 && metrics.maxAbsDb <= 0.75
}

export function calculateV2NormalizedViolation(metrics: ErrorMetrics): number {
  return Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75)
}

function normalizedDeliveredDistance(metrics: ErrorMetrics): number {
  return Math.hypot(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75)
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareV2PrimaryMetrics(left: ErrorMetrics, right: ErrorMetrics): number {
  return compareNumber(calculateV2NormalizedViolation(left), calculateV2NormalizedViolation(right)) ||
    compareNumber(left.rmseDb, right.rmseDb) ||
    compareNumber(left.maxAbsDb, right.maxAbsDb)
}

export function compareV2Solutions(left: V2Solution, right: V2Solution): number {
  const leftMaxQ = Math.max(0, ...left.filters.map((filter) => filter.q))
  const rightMaxQ = Math.max(0, ...right.filters.map((filter) => filter.q))
  const leftMaxGain = Math.max(0, ...left.filters.map((filter) => Math.abs(filter.gainDb)))
  const rightMaxGain = Math.max(0, ...right.filters.map((filter) => Math.abs(filter.gainDb)))
  const leftGainSum = left.filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0)
  const rightGainSum = right.filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0)
  const scalarComparison =
    compareV2PrimaryMetrics(left.metrics, right.metrics) ||
    compareNumber(left.cancellationAudit.totalScore, right.cancellationAudit.totalScore) ||
    compareNumber(leftMaxQ, rightMaxQ) ||
    compareNumber(leftMaxGain, rightMaxGain) ||
    compareNumber(leftGainSum, rightGainSum) ||
    compareNumber(left.filters.length, right.filters.length)
  if (scalarComparison !== 0) return scalarComparison

  for (let index = 0; index < left.filters.length; index += 1) {
    const leftFilter = left.filters[index]!
    const rightFilter = right.filters[index]!
    const filterComparison =
      compareNumber(leftFilter.frequencyHz, rightFilter.frequencyHz) ||
      compareNumber(TYPE_ORDER[leftFilter.type], TYPE_ORDER[rightFilter.type]) ||
      compareNumber(leftFilter.gainDb, rightFilter.gainDb) ||
      compareNumber(leftFilter.q, rightFilter.q)
    if (filterComparison !== 0) return filterComparison
  }
  return 0
}

export function compareV2DeliverableQuality(left: V2Solution, right: V2Solution): number {
  const leftAchieved = isV2TargetAchieved(left.metrics)
  const rightAchieved = isV2TargetAchieved(right.metrics)
  if (leftAchieved !== rightAchieved) return leftAchieved ? -1 : 1
  return compareNumber(
    normalizedDeliveredDistance(left.metrics),
    normalizedDeliveredDistance(right.metrics),
  ) || compareV2Solutions(left, right)
}
