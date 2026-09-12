import { compareV2PrimaryMetrics } from '../../src/autoeq/v2/ranking.js'

import type {
  ResearchCheckpoint,
  ResearchTimeToQuality,
} from './types.js'

export const RESEARCH_TIMELINE_MARKS_MS: readonly number[] = Object.freeze([
  500, 1_000, 2_000, 3_000, 5_000, 10_000,
  15_000, 20_000, 30_000, 45_000, 60_000,
])

function copyCheckpoint(
  checkpoint: ResearchCheckpoint,
  elapsedMs = checkpoint.elapsedMs,
): ResearchCheckpoint {
  return {
    elapsedMs,
    metrics: { ...checkpoint.metrics },
    filterCount: checkpoint.filterCount,
  }
}

function bestCheckpointHistory(
  checkpoints: readonly ResearchCheckpoint[],
): ResearchCheckpoint[] {
  const ordered = [...checkpoints].sort((left, right) => left.elapsedMs - right.elapsedMs)
  const best: ResearchCheckpoint[] = []
  let current: ResearchCheckpoint | undefined

  for (const checkpoint of ordered) {
    if (
      current === undefined ||
      compareV2PrimaryMetrics(checkpoint.metrics, current.metrics) < 0
    ) {
      current = checkpoint
      best.push(copyCheckpoint(checkpoint))
    }
  }

  return best
}

export function projectTimeline(
  checkpoints: readonly ResearchCheckpoint[],
  marksMs: readonly number[] = RESEARCH_TIMELINE_MARKS_MS,
  maxElapsedMs = Math.max(0, ...checkpoints.map((checkpoint) => checkpoint.elapsedMs)),
): ResearchCheckpoint[] {
  const ordered = [...checkpoints].sort((left, right) => left.elapsedMs - right.elapsedMs)
  const projected: ResearchCheckpoint[] = []
  let checkpointIndex = 0
  let best: ResearchCheckpoint | undefined

  for (const markMs of marksMs) {
    if (markMs > maxElapsedMs) break
    while (checkpointIndex < ordered.length && ordered[checkpointIndex]!.elapsedMs <= markMs) {
      const candidate = ordered[checkpointIndex]!
      if (
        best === undefined ||
        compareV2PrimaryMetrics(candidate.metrics, best.metrics) < 0
      ) {
        best = candidate
      }
      checkpointIndex += 1
    }
    if (best !== undefined) projected.push(copyCheckpoint(best, markMs))
  }

  return projected
}

function firstCrossing(
  checkpoints: readonly ResearchCheckpoint[],
  predicate: (checkpoint: ResearchCheckpoint) => boolean,
): number | null {
  return checkpoints.find(predicate)?.elapsedMs ?? null
}

export function calculateTimeToQuality(
  checkpoints: readonly ResearchCheckpoint[],
): ResearchTimeToQuality {
  const history = bestCheckpointHistory(checkpoints)
  return {
    rmse100Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.rmseDb <= 1.00),
    rmse075Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.rmseDb <= 0.75),
    rmse050Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.rmseDb <= 0.50),
    rmse035Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.rmseDb <= 0.35),
    rmse025Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.rmseDb <= 0.25),
    maxAbs200Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.maxAbsDb <= 2.00),
    maxAbs150Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.maxAbsDb <= 1.50),
    maxAbs100Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.maxAbsDb <= 1.00),
    maxAbs075Ms: firstCrossing(history, (checkpoint) => checkpoint.metrics.maxAbsDb <= 0.75),
    jointTargetMs: firstCrossing(
      history,
      (checkpoint) => checkpoint.metrics.rmseDb <= 0.25 && checkpoint.metrics.maxAbsDb <= 0.75,
    ),
  }
}
