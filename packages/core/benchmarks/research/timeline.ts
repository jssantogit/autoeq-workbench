import type {
  ResearchCheckpoint,
  ResearchTimeToQuality,
} from './types.js'

export const RESEARCH_FINE_CHECKPOINTS_SECONDS = [
  0.5, 1, 2, 3, 5, 10, 15, 30, 60,
] as const

export const RESEARCH_FINE_CHECKPOINTS_MS: readonly number[] = Object.freeze(
  RESEARCH_FINE_CHECKPOINTS_SECONDS.map((seconds) => seconds * 1_000),
)

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
    sourceSolutionKey: checkpoint.sourceSolutionKey,
  }
}

function chronologicalCheckpoints(
  checkpoints: readonly ResearchCheckpoint[],
): ResearchCheckpoint[] {
  return checkpoints
    .map((checkpoint, index) => ({ checkpoint, index }))
    .sort((left, right) =>
      left.checkpoint.elapsedMs - right.checkpoint.elapsedMs || left.index - right.index,
    )
    .map(({ checkpoint }) => checkpoint)
}

export function projectTimeline(
  checkpoints: readonly ResearchCheckpoint[],
  marksMs: readonly number[] = RESEARCH_TIMELINE_MARKS_MS,
  maxElapsedMs = Math.max(0, ...checkpoints.map((checkpoint) => checkpoint.elapsedMs)),
): ResearchCheckpoint[] {
  const ordered = chronologicalCheckpoints(checkpoints)
  const projected: ResearchCheckpoint[] = []
  let checkpointIndex = 0
  let latest: ResearchCheckpoint | undefined

  for (const markMs of marksMs) {
    if (markMs > maxElapsedMs) break
    while (checkpointIndex < ordered.length && ordered[checkpointIndex]!.elapsedMs <= markMs) {
      latest = ordered[checkpointIndex]!
      checkpointIndex += 1
    }
    if (latest !== undefined) projected.push(copyCheckpoint(latest, markMs))
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
  const history = chronologicalCheckpoints(checkpoints)
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
