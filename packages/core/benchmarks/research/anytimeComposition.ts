export interface AnytimeFeedbackScheduleInput<T> {
  isExpired: () => boolean
  mpDone: () => boolean
  advanceMpSlice: () => number
  takeFeedback: () => T | undefined
  processFeedback: (seed: T) => number
}

export interface AnytimeFeedbackScheduleResult {
  rounds: number
  mpSlices: number
  handoffs: number
  workUnits: number
  stopReason: 'deadline' | 'exhausted' | 'no-progress'
}

export function runAnytimeFeedbackSchedule<T>(
  input: AnytimeFeedbackScheduleInput<T>,
): AnytimeFeedbackScheduleResult {
  let rounds = 0
  let mpSlices = 0
  let handoffs = 0
  let workUnits = 0
  while (true) {
    rounds += 1
    if (input.isExpired()) {
      return { rounds, mpSlices, handoffs, workUnits, stopReason: 'deadline' }
    }
    let roundWork = 0
    if (!input.mpDone()) {
      const mpWork = input.advanceMpSlice()
      if (!Number.isSafeInteger(mpWork) || mpWork < 0) {
        throw new Error('anytime MP slice work must be a non-negative integer')
      }
      mpSlices += 1
      roundWork += mpWork
      workUnits += mpWork
    }
    if (input.isExpired()) {
      return { rounds, mpSlices, handoffs, workUnits, stopReason: 'deadline' }
    }
    const feedback = input.takeFeedback()
    let consumedFeedback = false
    if (feedback !== undefined) {
      consumedFeedback = true
      const feedbackWork = input.processFeedback(feedback)
      if (!Number.isSafeInteger(feedbackWork) || feedbackWork < 0) {
        throw new Error('anytime feedback work must be a non-negative integer')
      }
      handoffs += 1
      roundWork += feedbackWork
      workUnits += feedbackWork
    } else if (input.mpDone()) {
      return { rounds, mpSlices, handoffs, workUnits, stopReason: 'exhausted' }
    }
    if (roundWork === 0 && !consumedFeedback) {
      return { rounds, mpSlices, handoffs, workUnits, stopReason: 'no-progress' }
    }
  }
}
