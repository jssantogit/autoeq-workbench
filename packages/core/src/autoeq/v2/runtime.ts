import type { AutoEqTimeLimitSeconds } from '../../config/autoeqSettings.js'
import type { V2CandidateBoundaryMode } from './candidates.js'
import type { StandardV2ResearchTrace } from './researchTrace.js'

export interface StandardV2Runtime {
  nowMs(): number
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  researchTrace?: StandardV2ResearchTrace
  geometryWarmStart?: boolean
}

export interface StandardV2Deadline {
  isExpired(): boolean
}

export interface StandardV2DeadlineWindow {
  explorationDeadline: StandardV2Deadline
  hardDeadline: StandardV2Deadline
}

export function createStandardV2DeadlineWindow(
  runtime: StandardV2Runtime,
  timeLimitSeconds: AutoEqTimeLimitSeconds,
  finalizationReserveMs: number,
): StandardV2DeadlineWindow {
  if (!Number.isFinite(finalizationReserveMs) || finalizationReserveMs < 0) {
    throw new RangeError('Finalization reserve must be finite and non-negative')
  }
  const startMs = runtime.nowMs()
  const hardDeadlineMs = startMs + timeLimitSeconds * 1_000
  const explorationDeadlineMs = Math.max(
    startMs,
    hardDeadlineMs - finalizationReserveMs,
  )
  return {
    explorationDeadline: {
      isExpired: () => runtime.nowMs() >= explorationDeadlineMs,
    },
    hardDeadline: {
      isExpired: () => runtime.nowMs() >= hardDeadlineMs,
    },
  }
}

export function createStandardV2Deadline(
  runtime: StandardV2Runtime,
  timeLimitSeconds: AutoEqTimeLimitSeconds,
): StandardV2Deadline {
  return createStandardV2DeadlineWindow(runtime, timeLimitSeconds, 0).hardDeadline
}
