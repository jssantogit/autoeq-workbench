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
  configuredPolishAllowance: number
  /** Present only when measured by the structural component. */
  observedPolishWork?: number
  descendantsProduced?: number
  seedImprovements?: number
  globalSelectedBestImprovements?: number
  referenceImprovements?: number
}

export interface AnytimeFeedbackScheduleResult {
  rounds: number
  mpSlices: number
  feedbackSeedsConsumed: number
  structuralHandoffsExecuted: number
  handoffsProducingDescendants: number
  workUnits: number
  structuralCandidateEvaluations: number
  configuredStructuralBudget: number
  configuredPolishAllowance: number
  observedPolishWork: number | null
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
  let feedbackSeedsConsumed = 0
  let structuralHandoffsExecuted = 0
  let handoffsProducingDescendants = 0
  let workUnits = 0
  let structuralCandidateEvaluations = 0
  let configuredStructuralBudget = 0
  let configuredPolishAllowance = 0
  let observedPolishWork: number | null = null
  let observedPolishMeasurementIncomplete = false
  let descendantsProduced = 0
  let seedImprovements = 0
  let globalSelectedBestImprovements = 0
  let referenceImprovements = 0
  let usefulHandoffs = 0
  const result = (stopReason: AnytimeFeedbackScheduleResult['stopReason']): AnytimeFeedbackScheduleResult => ({
    rounds, mpSlices, feedbackSeedsConsumed, structuralHandoffsExecuted, handoffsProducingDescendants,
    workUnits, structuralCandidateEvaluations, configuredStructuralBudget, configuredPolishAllowance,
    observedPolishWork, descendantsProduced, seedImprovements, globalSelectedBestImprovements,
    referenceImprovements, usefulHandoffs, stopReason,
  })
  while (true) {
    rounds += 1
    if (input.isExpired()) {
      return result('deadline')
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
      return result('deadline')
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
      feedbackSeedsConsumed += 1
      roundWork += feedbackWork
      workUnits += feedbackWork
      if (typeof feedbackResult !== 'number') {
        structuralCandidateEvaluations += feedbackResult.structuralCandidateEvaluations
        configuredStructuralBudget += feedbackResult.configuredStructuralBudget
        configuredPolishAllowance += feedbackResult.configuredPolishAllowance
        if (feedbackResult.observedPolishWork === undefined) {
          observedPolishMeasurementIncomplete = true
          observedPolishWork = null
        } else if (!observedPolishMeasurementIncomplete) {
          observedPolishWork = (observedPolishWork ?? 0) + feedbackResult.observedPolishWork
        }
        descendantsProduced += feedbackResult.descendantsProduced ?? 0
        seedImprovements += feedbackResult.seedImprovements ?? 0
        globalSelectedBestImprovements += feedbackResult.globalSelectedBestImprovements ?? 0
        referenceImprovements += feedbackResult.referenceImprovements ?? 0
        if (feedbackResult.structuralCandidateEvaluations > 0) structuralHandoffsExecuted += 1
        if ((feedbackResult.descendantsProduced ?? 0) > 0) handoffsProducingDescendants += 1
        if ((feedbackResult.seedImprovements ?? 0) > 0) usefulHandoffs += 1
      }
    } else if (input.mpDone()) {
      return result('exhausted')
    }
    if (roundWork === 0 && !consumedFeedback) {
      return result('no-progress')
    }
  }
}
