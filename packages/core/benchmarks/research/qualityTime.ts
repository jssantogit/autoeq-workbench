import { createHash } from 'node:crypto'

export const QUALITY_TIME_FORMULA_VERSION = 1 as const
export const QUALITY_TIME_T_MIN_SECONDS = 0.5
export const QUALITY_TIME_T_MAX_SECONDS = 60
export const QUALITY_TIME_FORMULA_DESCRIPTOR =
  '{"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","reference":"oracle-reference-snapshot-v1:deliverable-frontier","regret":"directed-reference-regret-v1","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}'

export interface QualityTimePoint {
  elapsedSeconds: number
  regret: number
}

export function qualityFromRegret(regret: number): number {
  if (!Number.isFinite(regret) || regret < 0) {
    throw new Error('regret must be finite and non-negative')
  }
  return Math.exp(-regret)
}

export function qualityTimeFormulaSha256(): string {
  return createHash('sha256').update(QUALITY_TIME_FORMULA_DESCRIPTOR).digest('hex')
}

function validatePoint(point: QualityTimePoint, label: string): void {
  if (!Number.isFinite(point.elapsedSeconds) ||
      point.elapsedSeconds < 0 ||
      point.elapsedSeconds > QUALITY_TIME_T_MAX_SECONDS) {
    throw new Error(label + '.elapsedSeconds must be finite and within the QTF window')
  }
  qualityFromRegret(point.regret)
}

export function computeQualityTimeFrontier(points: readonly QualityTimePoint[]): number {
  if (points.length === 0) throw new Error('quality-time trajectory must contain at least one point')
  points.forEach((point, index) => validatePoint(point, 'trajectory[' + index + ']'))
  const ordered = points
    .map((point, index) => ({ point: { ...point }, index }))
    .sort((left, right) => left.point.elapsedSeconds - right.point.elapsedSeconds || left.index - right.index)
  const collapsed: QualityTimePoint[] = []
  for (const { point } of ordered) {
    if (collapsed.at(-1)?.elapsedSeconds === point.elapsedSeconds) {
      collapsed[collapsed.length - 1] = point
    } else {
      collapsed.push(point)
    }
  }
  const baseline = collapsed.filter((point) => point.elapsedSeconds <= QUALITY_TIME_T_MIN_SECONDS)
  if (baseline.length === 0) {
    throw new Error('quality-time trajectory requires a point at or before the QTF baseline')
  }
  let activeQuality = qualityFromRegret(baseline.at(-1)!.regret)
  let left = QUALITY_TIME_T_MIN_SECONDS
  let area = 0
  for (const point of collapsed) {
    if (point.elapsedSeconds <= QUALITY_TIME_T_MIN_SECONDS) continue
    if (point.elapsedSeconds >= QUALITY_TIME_T_MAX_SECONDS) break
    area += activeQuality * Math.log(point.elapsedSeconds / left)
    left = point.elapsedSeconds
    activeQuality = qualityFromRegret(point.regret)
  }
  area += activeQuality * Math.log(QUALITY_TIME_T_MAX_SECONDS / left)
  return area / Math.log(QUALITY_TIME_T_MAX_SECONDS / QUALITY_TIME_T_MIN_SECONDS)
}
