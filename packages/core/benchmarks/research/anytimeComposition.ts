export interface AnytimeFeedbackScheduleInput<T> {
  isExpired: () => boolean
  mpDone: () => boolean
  advanceMpSlice: () => number
  takeFeedback: () => T | undefined
  processFeedback: (seed: T) => number | AnytimeFeedbackWork
}

export interface AnytimeFeedbackWork {
  workUnits: number
  structuralCandidateEvaluations: number
  configuredStructuralBudget: number
  polishWork: number
  observedPolishWork?: number
  descendantsProduced?: number
  seedImprovements?: number
  globalSelectedBestImprovements?: number
  referenceImprovements?: number
  /** @deprecated Useful handoffs are derived from seedImprovements. */
  useful: boolean
}

export interface AnytimeFeedbackScheduleResult {
  rounds: number
  mpSlices: number
  handoffs: number
  workUnits: number
  structuralCandidateEvaluations: number
  configuredStructuralBudget: number
  polishWork: number
  observedPolishWork: number
  descendantsProduced: number
  seedImprovements: number
  globalSelectedBestImprovements: number
  referenceImprovements: number
  usefulHandoffs: number
  stopReason: 'deadline' | 'exhausted' | 'no-progress'
}

export function runAnytimeFeedbackSchedule<T>(
  input: AnytimeFeedbackScheduleInput<T>,
): AnytimeFeedbackScheduleResult {
  let rounds = 0
  let mpSlices = 0
  let handoffs = 0
  let workUnits = 0
  let structuralCandidateEvaluations = 0
  let configuredStructuralBudget = 0
  let polishWork = 0
  let observedPolishWork = 0
  let descendantsProduced = 0
  let seedImprovements = 0
  let globalSelectedBestImprovements = 0
  let referenceImprovements = 0
  let usefulHandoffs = 0
  while (true) {
    rounds += 1
    if (input.isExpired()) {
      return { rounds, mpSlices, handoffs, workUnits, structuralCandidateEvaluations, configuredStructuralBudget, polishWork, observedPolishWork, descendantsProduced, seedImprovements, globalSelectedBestImprovements, referenceImprovements, usefulHandoffs, stopReason: 'deadline' }
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
      return { rounds, mpSlices, handoffs, workUnits, structuralCandidateEvaluations, configuredStructuralBudget, polishWork, observedPolishWork, descendantsProduced, seedImprovements, globalSelectedBestImprovements, referenceImprovements, usefulHandoffs, stopReason: 'deadline' }
    }
    const feedback = input.takeFeedback()
    let consumedFeedback = false
    if (feedback !== undefined) {
      consumedFeedback = true
      const feedbackResult = input.processFeedback(feedback)
      const feedbackWork = typeof feedbackResult === 'number' ? feedbackResult : feedbackResult.workUnits
      if (!Number.isSafeInteger(feedbackWork) || feedbackWork < 0) {
        throw new Error('anytime feedback work must be a non-negative integer')
      }
      handoffs += 1
      roundWork += feedbackWork
      workUnits += feedbackWork
      if (typeof feedbackResult !== 'number') {
        structuralCandidateEvaluations += feedbackResult.structuralCandidateEvaluations
        configuredStructuralBudget += feedbackResult.configuredStructuralBudget
        polishWork += feedbackResult.polishWork
        observedPolishWork += feedbackResult.observedPolishWork ?? 0
        descendantsProduced += feedbackResult.descendantsProduced ?? 0
        seedImprovements += feedbackResult.seedImprovements ?? 0
        globalSelectedBestImprovements += feedbackResult.globalSelectedBestImprovements ?? 0
        referenceImprovements += feedbackResult.referenceImprovements ?? 0
        if ((feedbackResult.seedImprovements ?? 0) > 0) usefulHandoffs += 1
      }
    } else if (input.mpDone()) {
      return { rounds, mpSlices, handoffs, workUnits, structuralCandidateEvaluations, configuredStructuralBudget, polishWork, observedPolishWork, descendantsProduced, seedImprovements, globalSelectedBestImprovements, referenceImprovements, usefulHandoffs, stopReason: 'exhausted' }
    }
    if (roundWork === 0 && !consumedFeedback) {
      return { rounds, mpSlices, handoffs, workUnits, structuralCandidateEvaluations, configuredStructuralBudget, polishWork, observedPolishWork, descendantsProduced, seedImprovements, globalSelectedBestImprovements, referenceImprovements, usefulHandoffs, stopReason: 'no-progress' }
    }
  }
}
