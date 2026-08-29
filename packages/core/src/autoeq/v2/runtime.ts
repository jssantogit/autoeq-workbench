import type { AutoEqTimeLimitSeconds } from '../../config/autoeqSettings.js'

export interface StandardV2Runtime {
  nowMs(): number
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
