import { describe, expect, it } from 'vitest'

import {
  runResumableScheduler,
  type ResumableSchedulerInput,
  type ScheduledResearchState,
} from '../../../../benchmarks/research/resumableScheduler.js'
import type { JointRefineContinuationV2 } from '../../../../src/autoeq/v2/jointRefineContinuation.js'

type FakeContinuation = JointRefineContinuationV2 & {
  score: number
  scoresAfterResume: number[]
}

function state(key: string, score: number, origin: ScheduledResearchState['origin'] = 'fresh'): ScheduledResearchState {
  return {
    key,
    origin,
    slicesReceived: 0,
    continuation: {
      solution: {
        filters: [],
        metrics: { maeDb: score, rmseDb: score, maxAbsDb: score, maxAbsFrequencyHz: 1_000 },
        cancellationAudit: { pairs: [], totalScore: 0 },
      },
      completedCycles: 0,
      coordinateTrials: 0,
      nextCycleIndex: 1,
      done: false,
      expired: false,
      score,
      scoresAfterResume: [],
    } as unknown as FakeContinuation,
  }
}

function fakeAdvance(current: ScheduledResearchState): ScheduledResearchState {
  const continuation = current.continuation as FakeContinuation
  const nextScore = continuation.scoresAfterResume[current.slicesReceived] ?? continuation.score
  const nextContinuation = {
    ...continuation,
    score: nextScore,
    solution: {
      ...continuation.solution,
      metrics: {
        ...continuation.solution.metrics,
        maeDb: nextScore,
        rmseDb: nextScore,
        maxAbsDb: nextScore,
      },
    },
  }
  return { ...current, continuation: nextContinuation }
}

function completingAdvance(current: ScheduledResearchState): ScheduledResearchState {
  const next = fakeAdvance(current)
  return {
    ...next,
    continuation: {
      ...next.continuation,
      done: true,
    },
  }
}

describe('resumable research scheduler', () => {
  it('preserves and resumes a state whose later slice becomes best', () => {
    const lateWinner = state('late-winner', 3)
    ;(lateWinner.continuation as FakeContinuation).scoresAfterResume = [3, 0.1]
    const input: ResumableSchedulerInput = {
      policy: 'resumable-beam-v1',
      maxSlices: 6,
      freshStates: [state('first', 1), state('second', 2), lateWinner],
      advance: fakeAdvance,
    }

    const result = runResumableScheduler(input)

    expect(result.sliceOrder.slice(0, 3)).toEqual(['first', 'second', 'late-winner'])
    expect(result.sliceOrder).toContain('late-winner')
    expect(result.freshStates.find((item) => item.key === 'late-winner')?.slicesReceived).toBe(2)
    expect((result.freshStates.find((item) => item.key === 'late-winner')?.continuation as FakeContinuation).score)
      .toBe(0.1)
  })

  it('keeps bank insertion from displacing the fresh queue', () => {
    const input: ResumableSchedulerInput = {
      policy: 'state-bank-v1',
      maxSlices: 6,
      freshStates: [state('fresh-a', 1), state('fresh-b', 2)],
      proposalBankStates: [
        state('bank-a', 0.01, 'known-good'),
        state('bank-b', 0.02, 'transferred'),
        state('bank-c', 0.03, 'v1-seeded'),
      ],
      advance: fakeAdvance,
    }

    const result = runResumableScheduler(input)

    expect(result.sliceOrder.slice(0, 2)).toEqual(['fresh-a', 'fresh-b'])
    expect(result.freshStates.map((item) => item.key)).toEqual(['fresh-a', 'fresh-b'])
    expect(result.proposalBankStates.map((item) => item.key)).toEqual(['bank-a', 'bank-b', 'bank-c'])
    expect(result.sliceOrder.indexOf('bank-a')).toBeGreaterThanOrEqual(2)
  })

  it('generates another admissible state instead of stopping on an empty local queue', () => {
    let replenishments = 0
    const result = runResumableScheduler({
      policy: 'resumable-beam-v1',
      maxSlices: 2,
      freshStates: [state('first', 1)],
      advance: completingAdvance,
      replenish: () => {
        replenishments += 1
        return replenishments === 1 ? { freshStates: [state('residual-growth', 0.5)] } : {}
      },
    })

    expect(result.sliceOrder).toEqual(['first', 'residual-growth'])
    expect(result.generatedStateCount).toBe(1)
    expect(result.stopReason).toBe('slice-budget')
  })

  it('reports no admissible proposals after one empty replenishment without a busy loop', () => {
    let replenishments = 0
    const result = runResumableScheduler({
      policy: 'resumable-beam-v1',
      maxSlices: 10,
      freshStates: [state('first', 1)],
      advance: completingAdvance,
      replenish: () => {
        replenishments += 1
        return {}
      },
    })

    expect(replenishments).toBe(1)
    expect(result.sliceOrder).toEqual(['first'])
    expect(result.stopReason).toBe('no-admissible-proposals')
    expect(result.runnableStateCount).toBe(0)
  })

  it('keeps deadline and cancellation checks lazy at work-unit boundaries', () => {
    let advances = 0
    const deadline = runResumableScheduler({
      policy: 'resumable-beam-v1',
      maxSlices: 10,
      freshStates: [state('first', 1)],
      isExpired: () => true,
      advance: (current) => {
        advances += 1
        return fakeAdvance(current)
      },
    })
    const cancelled = runResumableScheduler({
      policy: 'resumable-beam-v1',
      maxSlices: 10,
      freshStates: [state('first', 1)],
      isCancelled: () => true,
      advance: (current) => {
        advances += 1
        return fakeAdvance(current)
      },
    })

    expect(advances).toBe(0)
    expect(deadline.stopReason).toBe('deadline')
    expect(cancelled.stopReason).toBe('cancelled')
  })

  it('resumes deterministically with the same ordering and work units as a continuous run', () => {
    const makeInput = (): ResumableSchedulerInput => ({
      policy: 'state-bank-v1',
      maxSlices: 4,
      freshStates: [state('fresh-a', 1), state('fresh-b', 2)],
      proposalBankStates: [state('bank-a', 0.5, 'transferred')],
      advance: fakeAdvance,
    })
    const continuous = runResumableScheduler(makeInput())
    const first = runResumableScheduler({ ...makeInput(), maxSlices: 2 })
    const resumed = runResumableScheduler({
      ...makeInput(),
      maxSlices: 2,
      freshStates: first.freshStates,
      proposalBankStates: first.proposalBankStates,
      continuation: first.continuation,
    })

    expect([...first.sliceOrder, ...resumed.sliceOrder]).toEqual(continuous.sliceOrder)
    expect(resumed.freshStates).toEqual(continuous.freshStates)
    expect(resumed.proposalBankStates).toEqual(continuous.proposalBankStates)
    expect(resumed.continuation.totalSlices).toBe(continuous.continuation.totalSlices)
  })
})
