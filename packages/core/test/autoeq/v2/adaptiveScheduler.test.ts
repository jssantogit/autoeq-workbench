import { describe, expect, it } from 'vitest'

import {
  ADAPTIVE_RESOURCE_POLICY,
  createSearchWorkDelta,
  decideAdaptiveSchedulerAction,
  type AdaptiveSchedulerState,
} from '../../../src/index.js'

function state(overrides: Partial<AdaptiveSchedulerState> = {}): AdaptiveSchedulerState {
  return {
    currentCapacity: 10,
    maximumCapacity: 43,
    effortLevel: 1,
    recentGain: 0,
    stagesSinceMeaningfulImprovement: 2,
    workSinceMeaningfulImprovement: {
      ...createSearchWorkDelta(),
      structuralSearchInvocations: 2,
    },
    remainingWallClockMs: ADAPTIVE_RESOURCE_POLICY.stageQuantumMs * 2,
    ...overrides,
  }
}

describe('adaptive resource scheduler policy', () => {
  it('deepens while the current regime is still productive', () => {
    expect(decideAdaptiveSchedulerAction(state({ recentGain: 0.2 }))).toEqual({
      action: 'deepen-current-regime',
      reason: 'productive-current-regime',
    })
  })

  it('deepens until enough deterministic work exists to judge a stagnant regime', () => {
    expect(decideAdaptiveSchedulerAction(state({
      stagesSinceMeaningfulImprovement: 1,
      workSinceMeaningfulImprovement: {
        ...createSearchWorkDelta(),
        structuralSearchInvocations: 1,
      },
    }))).toEqual({
      action: 'deepen-current-regime',
      reason: 'insufficient-work-to-judge',
    })
  })

  it('expands a stagnant regime when headroom and follow-up reserve exist', () => {
    expect(decideAdaptiveSchedulerAction(state())).toEqual({
      action: 'expand-capacity',
      reason: 'stagnated-with-headroom',
    })
  })

  it('does not expand without capacity headroom', () => {
    expect(decideAdaptiveSchedulerAction(state({
      currentCapacity: 43,
      maximumCapacity: 43,
    }))).toEqual({
      action: 'deepen-current-regime',
      reason: 'no-capacity-headroom',
    })
  })

  it('does not expand when the envelope cannot support a follow-up quantum', () => {
    expect(decideAdaptiveSchedulerAction(state({
      remainingWallClockMs: ADAPTIVE_RESOURCE_POLICY.stageQuantumMs * 2 - 1,
    }))).toEqual({
      action: 'deepen-current-regime',
      reason: 'insufficient-time-reserve',
    })
  })

  it('uses explicit parameters instead of capacity-specific branches', () => {
    expect(decideAdaptiveSchedulerAction(state({
      currentCapacity: 17,
      maximumCapacity: 37,
      stagesSinceMeaningfulImprovement: 3,
      workSinceMeaningfulImprovement: {
        ...createSearchWorkDelta(),
        structuralSearchInvocations: 3,
      },
    }), {
      ...ADAPTIVE_RESOURCE_POLICY,
      minimumInvocationsBeforeExpansion: 3,
    })).toEqual({
      action: 'expand-capacity',
      reason: 'stagnated-with-headroom',
    })
  })
})
