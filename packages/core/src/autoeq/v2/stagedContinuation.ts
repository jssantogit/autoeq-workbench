import { compareV2Solutions, type V2Solution } from './ranking.js'

export const V2_STAGED_THIRD_CONTINUATION_SPREAD = 0.001

function normalizedViolation(solution: V2Solution): number {
  return Math.max(solution.metrics.rmseDb / 0.25, solution.metrics.maxAbsDb / 0.75)
}

export function selectV2StagedContinuationCandidates<T extends V2Solution>(
  candidates: readonly T[],
): T[] {
  const sorted = [...candidates].sort(compareV2Solutions)
  if (sorted.length <= 2) return sorted

  const bestViolation = normalizedViolation(sorted[0]!)
  const secondViolation = normalizedViolation(sorted[1]!)
  const topTwoSpread = bestViolation > 0
    ? secondViolation / bestViolation - 1
    : 0

  return sorted.slice(
    0,
    topTwoSpread >= V2_STAGED_THIRD_CONTINUATION_SPREAD ? 3 : 2,
  )
}
