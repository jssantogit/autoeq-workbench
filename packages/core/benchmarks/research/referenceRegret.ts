export const DIRECTED_REFERENCE_REGRET_VERSION = 1 as const
export const DEFAULT_RMSE_SCALE_DB = 0.25
export const DEFAULT_MAX_ABS_SCALE_DB = 0.75
const DOMINANCE_EPSILON = 1e-12

export interface ReferenceRegretPoint {
  candidateId: string
  rmseDb: number
  maxAbsDb: number
  filterCount: number
}

export interface ReferenceRegretResult {
  regret: number
  referenceImproved: boolean
}

function validatePoint(point: ReferenceRegretPoint, label: string): void {
  if (typeof point.candidateId !== 'string' || point.candidateId.length === 0) {
    throw new Error(`${label}.candidateId is required`)
  }
  if (!Number.isFinite(point.rmseDb) || !Number.isFinite(point.maxAbsDb)) {
    throw new Error(`${label} metrics must be finite`)
  }
  if (!Number.isSafeInteger(point.filterCount) || point.filterCount < 0) {
    throw new Error(`${label}.filterCount must be a non-negative integer`)
  }
}

function dominates(left: ReferenceRegretPoint, right: ReferenceRegretPoint): boolean {
  return left.rmseDb <= right.rmseDb + DOMINANCE_EPSILON &&
    left.maxAbsDb <= right.maxAbsDb + DOMINANCE_EPSILON &&
    (
      left.rmseDb < right.rmseDb - DOMINANCE_EPSILON ||
      left.maxAbsDb < right.maxAbsDb - DOMINANCE_EPSILON
    )
}

export function directedReferenceRegret(
  point: ReferenceRegretPoint,
  frontier: readonly ReferenceRegretPoint[],
  rmseScale = DEFAULT_RMSE_SCALE_DB,
  maxAbsScale = DEFAULT_MAX_ABS_SCALE_DB,
): ReferenceRegretResult {
  validatePoint(point, 'reference point')
  if (frontier.length === 0) throw new Error('reference frontier must contain at least one point')
  if (!Number.isFinite(rmseScale) || rmseScale <= 0 ||
      !Number.isFinite(maxAbsScale) || maxAbsScale <= 0) {
    throw new Error('reference regret scales must be finite and positive')
  }
  let regret = Number.POSITIVE_INFINITY
  let referenceImproved = false
  frontier.forEach((reference, index) => {
    validatePoint(reference, `reference frontier[${index}]`)
    regret = Math.min(
      regret,
      Math.hypot(
        Math.max(0, point.rmseDb - reference.rmseDb) / rmseScale,
        Math.max(0, point.maxAbsDb - reference.maxAbsDb) / maxAbsScale,
      ),
    )
    referenceImproved ||= dominates(point, reference)
  })
  return { regret, referenceImproved }
}
