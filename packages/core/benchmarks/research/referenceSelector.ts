export const REFERENCE_SELECTOR_VERSION = 1 as const
export const REFERENCE_TARGET_RMSE_DB = 0.25
export const REFERENCE_TARGET_MAX_ABS_DB = 0.75

export interface SelectorPoint {
  candidateId: string
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

function validatePoint(point: SelectorPoint, label: string): void {
  if (typeof point.candidateId !== 'string' || point.candidateId.length === 0) {
    throw new Error(label + '.candidateId is required')
  }
  if (!Number.isFinite(point.rmseDb) || !Number.isFinite(point.maxAbsDb)) {
    throw new Error(label + ' metrics must be finite')
  }
  if (!Number.isSafeInteger(point.filterCount) || point.filterCount < 0) {
    throw new Error(label + '.filterCount must be a non-negative integer')
  }
  if (!Number.isFinite(point.cancellationScore) || point.cancellationScore < 0) {
    throw new Error(label + '.cancellationScore must be finite and non-negative')
  }
}

export function referenceSelectorKey(point: SelectorPoint): readonly (number | string)[] {
  validatePoint(point, 'selector point')
  const achieved = point.rmseDb <= REFERENCE_TARGET_RMSE_DB &&
    point.maxAbsDb <= REFERENCE_TARGET_MAX_ABS_DB
  return achieved
    ? [
        0,
        point.filterCount,
        point.rmseDb,
        point.maxAbsDb,
        point.cancellationScore,
        point.candidateId,
      ]
    : [
        1,
        Math.hypot(
          point.rmseDb / REFERENCE_TARGET_RMSE_DB,
          point.maxAbsDb / REFERENCE_TARGET_MAX_ABS_DB,
        ),
        point.rmseDb,
        point.maxAbsDb,
        point.cancellationScore,
        point.filterCount,
        point.candidateId,
      ]
}

function compareKeys(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]!
    const rightValue = right[index]!
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

export function selectReferencePoint(points: readonly SelectorPoint[]): SelectorPoint {
  if (points.length === 0) throw new Error('selector requires at least one point')
  points.forEach((point, index) => validatePoint(point, 'selector point[' + index + ']'))
  return points.reduce((best, point) =>
    compareKeys(referenceSelectorKey(point), referenceSelectorKey(best)) < 0 ? point : best)
}
