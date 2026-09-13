import type { SearchWorkTotals } from './structuralSearch.js'

/** The two scheduler continuations being compared by the experiment. */
export type AdaptiveSchedulerAction =
  | 'deepen-current-regime'
  | 'expand-capacity'

/** A compact explanation for each adaptive decision. */
export type AdaptiveSchedulerDecisionReason =
  | 'productive-current-regime'
  | 'insufficient-work-to-judge'
  | 'stagnated-with-headroom'
  | 'no-capacity-headroom'
  | 'insufficient-time-reserve'

export interface AdaptiveSchedulerState {
  currentCapacity: number
  maximumCapacity: number
  effortLevel: number
  recentGain: number
  stagesSinceMeaningfulImprovement: number
  workSinceMeaningfulImprovement: SearchWorkTotals
  /** Remaining deadline budget, when the caller can expose it. */
  remainingWallClockMs?: number
}

export interface AdaptiveSchedulerPolicyParameters {
  /** Minimum structural-search invocations before expansion can be judged. */
  minimumInvocationsBeforeExpansion: number
  /** Normalized-violation gain that counts as meaningful current-regime work. */
  meaningfulGainThreshold: number
  /** Duration of one scheduler quantum. */
  stageQuantumMs: number
  /** Additional quanta reserved after an expansion quantum. */
  followUpQuanta: number
}

/**
 * Predeclared research parameters.  These are intentionally generic and are
 * not tuned for a named capacity, fixture, or product profile.
 */
export const ADAPTIVE_RESOURCE_POLICY: Readonly<AdaptiveSchedulerPolicyParameters> =
  Object.freeze({
    minimumInvocationsBeforeExpansion: 2,
    meaningfulGainThreshold: 0.05,
    stageQuantumMs: 5_000,
    followUpQuanta: 1,
  })

export interface AdaptiveSchedulerDecision {
  action: AdaptiveSchedulerAction
  reason: AdaptiveSchedulerDecisionReason
}

function validateParameters(parameters: AdaptiveSchedulerPolicyParameters): void {
  if (
    !Number.isSafeInteger(parameters.minimumInvocationsBeforeExpansion) ||
    parameters.minimumInvocationsBeforeExpansion <= 0
  ) {
    throw new Error('minimumInvocationsBeforeExpansion must be a positive integer')
  }
  if (
    !Number.isFinite(parameters.meaningfulGainThreshold) ||
    parameters.meaningfulGainThreshold < 0
  ) {
    throw new Error('meaningfulGainThreshold must be non-negative')
  }
  if (!Number.isFinite(parameters.stageQuantumMs) || parameters.stageQuantumMs <= 0) {
    throw new Error('stageQuantumMs must be positive')
  }
  if (!Number.isSafeInteger(parameters.followUpQuanta) || parameters.followUpQuanta < 0) {
    throw new Error('followUpQuanta must be a non-negative integer')
  }
}

function validateState(state: AdaptiveSchedulerState): void {
  if (
    !Number.isSafeInteger(state.currentCapacity) ||
    state.currentCapacity <= 0 ||
    !Number.isSafeInteger(state.maximumCapacity) ||
    state.maximumCapacity <= 0 ||
    state.currentCapacity > state.maximumCapacity
  ) {
    throw new Error('adaptive scheduler capacity state is invalid')
  }
  if (!Number.isFinite(state.recentGain) || state.recentGain < 0) {
    throw new Error('recentGain must be a non-negative number')
  }
  if (
    !Number.isSafeInteger(state.stagesSinceMeaningfulImprovement) ||
    state.stagesSinceMeaningfulImprovement < 0
  ) {
    throw new Error('stagesSinceMeaningfulImprovement must be a non-negative integer')
  }
  if (
    !Number.isSafeInteger(state.workSinceMeaningfulImprovement.structuralSearchInvocations) ||
    state.workSinceMeaningfulImprovement.structuralSearchInvocations < 0
  ) {
    throw new Error('workSinceMeaningfulImprovement must contain a valid invocation count')
  }
  if (
    state.remainingWallClockMs !== undefined &&
    (!Number.isFinite(state.remainingWallClockMs) || state.remainingWallClockMs < 0)
  ) {
    throw new Error('remainingWallClockMs must be a non-negative number')
  }
}

/**
 * Choose the next generic scheduler action from explicit resource state.
 *
 * This pure decision function is research-only.  It does not run search or
 * mutate controller state, which keeps the policy deterministic and easy to
 * compare with the unchanged legacy progression.
 */
export function decideAdaptiveSchedulerAction(
  state: AdaptiveSchedulerState,
  parameters: AdaptiveSchedulerPolicyParameters = ADAPTIVE_RESOURCE_POLICY,
): AdaptiveSchedulerDecision {
  validateState(state)
  validateParameters(parameters)

  if (state.currentCapacity >= state.maximumCapacity) {
    return { action: 'deepen-current-regime', reason: 'no-capacity-headroom' }
  }

  const requiredReserveMs = parameters.stageQuantumMs * (1 + parameters.followUpQuanta)
  if (
    state.remainingWallClockMs !== undefined &&
    state.remainingWallClockMs < requiredReserveMs
  ) {
    return { action: 'deepen-current-regime', reason: 'insufficient-time-reserve' }
  }

  if (state.recentGain >= parameters.meaningfulGainThreshold) {
    return { action: 'deepen-current-regime', reason: 'productive-current-regime' }
  }

  const workInvocations = state.workSinceMeaningfulImprovement.structuralSearchInvocations
  if (
    workInvocations < parameters.minimumInvocationsBeforeExpansion ||
    state.stagesSinceMeaningfulImprovement < parameters.minimumInvocationsBeforeExpansion
  ) {
    return { action: 'deepen-current-regime', reason: 'insufficient-work-to-judge' }
  }

  return { action: 'expand-capacity', reason: 'stagnated-with-headroom' }
}
