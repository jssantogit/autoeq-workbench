import type { AutoEqTimeLimitSeconds } from '../../config/autoeqSettings.js'
import type { V2CandidateBoundaryMode } from './candidates.js'
import type { StandardV2ResearchTrace } from './researchTrace.js'

export interface StandardV2Runtime {
  nowMs(): number
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  researchTrace?: StandardV2ResearchTrace
}

export interface StandardV2Deadline {
  isExpired(): boolean
}

export function createStandardV2Deadline(
  runtime: StandardV2Runtime,
  timeLimitSeconds: AutoEqTimeLimitSeconds,
): StandardV2Deadline {
  const deadlineMs = runtime.nowMs() + timeLimitSeconds * 1_000
  return { isExpired: () => runtime.nowMs() >= deadlineMs }
}
