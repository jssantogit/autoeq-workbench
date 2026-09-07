import {
  advanceJointRefineContinuationV2,
  type JointRefineContinuationV2,
} from '../../src/autoeq/v2/jointRefineContinuation.js'

import {
  referenceSelectorKey,
  type SelectorPoint,
} from './referenceSelector.js'

export const RESUMABLE_BEAM_POLICY = 'resumable-beam-v1' as const
export const STATE_BANK_POLICY = 'state-bank-v1' as const

export type ResumableSchedulerPolicy =
  | typeof RESUMABLE_BEAM_POLICY
  | typeof STATE_BANK_POLICY

export type ResearchStateOrigin =
  | 'fresh'
  | 'resumed'
  | 'transferred'
  | 'known-good'
  | 'v1-seeded'

export interface ScheduledResearchState {
  key: string
  origin: ResearchStateOrigin
  continuation: JointRefineContinuationV2
  slicesReceived: number
}

export interface ResumableSchedulerInput {
  policy: ResumableSchedulerPolicy
  freshStates: readonly ScheduledResearchState[]
  proposalBankStates?: readonly ScheduledResearchState[]
  maxSlices?: number
  sliceBudget?: number
  advance?: (state: ScheduledResearchState) => ScheduledResearchState
}

export interface SchedulerSliceRecord {
  key: string
  origin: ResearchStateOrigin
  source: 'fresh' | 'proposal-bank'
  slicesReceived: number
}

export interface ResumableSchedulerResult {
  freshStates: ScheduledResearchState[]
  proposalBankStates: ScheduledResearchState[]
  slices: SchedulerSliceRecord[]
  sliceOrder: string[]
  exhaustedBudget: boolean
}

function compareKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]!
    const rightValue = right[index]!
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function selectorPoint(state: ScheduledResearchState): SelectorPoint {
  const solution = state.continuation.solution
  return {
    candidateId: state.key,
    rmseDb: solution.metrics.rmseDb,
    maxAbsDb: solution.metrics.maxAbsDb,
    filterCount: solution.filters.length,
    cancellationScore: solution.cancellationAudit.totalScore,
  }
}

function dominates(left: ScheduledResearchState, right: ScheduledResearchState): boolean {
  const leftMetrics = left.continuation.solution.metrics
  const rightMetrics = right.continuation.solution.metrics
  const epsilon = 1e-12
  return leftMetrics.rmseDb <= rightMetrics.rmseDb + epsilon &&
    leftMetrics.maxAbsDb <= rightMetrics.maxAbsDb + epsilon &&
    (
      leftMetrics.rmseDb < rightMetrics.rmseDb - epsilon ||
      leftMetrics.maxAbsDb < rightMetrics.maxAbsDb - epsilon
    )
}

function compareStates(
  states: readonly ScheduledResearchState[],
  left: ScheduledResearchState,
  right: ScheduledResearchState,
): number {
  const leftDominated = states.some((other) => other.key !== left.key && dominates(other, left))
  const rightDominated = states.some((other) => other.key !== right.key && dominates(other, right))
  if (leftDominated !== rightDominated) return leftDominated ? 1 : -1
  return compareKeys(referenceSelectorKey(selectorPoint(left)), referenceSelectorKey(selectorPoint(right))) ||
    left.key.localeCompare(right.key)
}

function orderedRunnableStates(states: readonly ScheduledResearchState[]): ScheduledResearchState[] {
  const runnable = states.filter((state) => !state.continuation.done)
  return [...runnable].sort((left, right) => compareStates(runnable, left, right))
}

function validateState(state: ScheduledResearchState, label: string): void {
  if (typeof state.key !== 'string' || state.key.length === 0) {
    throw new Error(`${label}.key is required`)
  }
  if (state.continuation === undefined || typeof state.continuation !== 'object') {
    throw new Error(`${label}.continuation is required`)
  }
  if (!Number.isSafeInteger(state.slicesReceived) || state.slicesReceived < 0) {
    throw new Error(`${label}.slicesReceived must be a non-negative integer`)
  }
}

function budgetOf(input: ResumableSchedulerInput): number {
  const budget = input.maxSlices ?? input.sliceBudget
  if (budget === undefined || !Number.isSafeInteger(budget) || budget <= 0) {
    throw new Error('resumable scheduler requires a positive maxSlices')
  }
  return budget
}

function replaceState(
  states: ScheduledResearchState[],
  next: ScheduledResearchState,
): void {
  const index = states.findIndex((state) => state.key === next.key)
  if (index < 0) throw new Error(`unknown scheduled state: ${next.key}`)
  states[index] = next
}

function advanceState(
  input: ResumableSchedulerInput,
  state: ScheduledResearchState,
): ScheduledResearchState {
  const advanced = input.advance === undefined
    ? {
        ...state,
        continuation: advanceJointRefineContinuationV2(state.continuation),
      }
    : input.advance(state)
  if (advanced.key !== state.key || advanced.origin !== state.origin) {
    throw new Error('scheduler advance must preserve state identity and origin')
  }
  return {
    ...advanced,
    slicesReceived: state.slicesReceived + 1,
  }
}

function validateUniqueKeys(
  freshStates: readonly ScheduledResearchState[],
  proposalBankStates: readonly ScheduledResearchState[],
): void {
  const keys = new Set<string>()
  for (const [label, states] of [['freshStates', freshStates], ['proposalBankStates', proposalBankStates]] as const) {
    states.forEach((state, index) => {
      validateState(state, `${label}[${index}]`)
      if (keys.has(state.key)) throw new Error(`duplicate scheduled state key: ${state.key}`)
      keys.add(state.key)
    })
  }
}

export function runResumableScheduler(input: ResumableSchedulerInput): ResumableSchedulerResult {
  const budget = budgetOf(input)
  if (input.policy !== RESUMABLE_BEAM_POLICY && input.policy !== STATE_BANK_POLICY) {
    throw new Error('unsupported resumable scheduler policy')
  }
  const freshStates = input.freshStates.map((state) => ({ ...state }))
  const proposalBankStates = (input.proposalBankStates ?? []).map((state) => ({ ...state }))
  validateUniqueKeys(freshStates, proposalBankStates)

  const slices: SchedulerSliceRecord[] = []
  let freshBootstrapIndex = 0
  let freshSinceBank = 0
  let freshRoundKeys: string[] = []
  let bankRoundKeys: string[] = []

  const stateForKey = (key: string, source: 'fresh' | 'proposal-bank'): ScheduledResearchState | undefined =>
    (source === 'fresh' ? freshStates : proposalBankStates).find((state) => state.key === key)
  const runnableFresh = (): ScheduledResearchState[] => orderedRunnableStates(freshStates)
  const runnableBank = (): ScheduledResearchState[] => orderedRunnableStates(proposalBankStates)

  const scheduleOne = (source: 'fresh' | 'proposal-bank', key: string): void => {
    const states = source === 'fresh' ? freshStates : proposalBankStates
    const current = stateForKey(key, source)
    if (current === undefined || current.continuation.done) return
    const next = advanceState(input, current)
    replaceState(states, next)
    slices.push({
      key: next.key,
      origin: next.origin,
      source,
      slicesReceived: next.slicesReceived,
    })
    if (source === 'fresh') freshSinceBank += 1
  }

  while (slices.length < budget) {
    if (freshBootstrapIndex < freshStates.length) {
      const state = freshStates[freshBootstrapIndex++]!
      if (!state.continuation.done) scheduleOne('fresh', state.key)
      continue
    }

    const freshRunnable = runnableFresh()
    const bankRunnable = runnableBank()
    if (freshRunnable.length === 0 && bankRunnable.length === 0) break

    const bankMayRun = input.policy === STATE_BANK_POLICY &&
      freshRunnable.length > 0 &&
      bankRunnable.length > 0 &&
      freshSinceBank >= 2
    if (bankMayRun) {
      bankRoundKeys = orderedRunnableStates(proposalBankStates).map((state) => state.key)
      const key = bankRoundKeys.shift()
      if (key !== undefined) {
        scheduleOne('proposal-bank', key)
        freshSinceBank = 0
        continue
      }
    }

    if (freshRunnable.length > 0) {
      if (freshRoundKeys.length === 0) {
        freshRoundKeys = freshRunnable.map((state) => state.key)
      }
      const key = freshRoundKeys.shift()
      if (key !== undefined) {
        scheduleOne('fresh', key)
        continue
      }
    }

    if (bankRunnable.length > 0) {
      if (bankRoundKeys.length === 0) {
        bankRoundKeys = bankRunnable.map((state) => state.key)
      }
      const key = bankRoundKeys.shift()
      if (key !== undefined) {
        scheduleOne('proposal-bank', key)
        continue
      }
    }
  }

  return {
    freshStates,
    proposalBankStates,
    slices,
    sliceOrder: slices.map((slice) => slice.key),
    exhaustedBudget: slices.length >= budget,
  }
}

export const scheduleResearchStates = runResumableScheduler
