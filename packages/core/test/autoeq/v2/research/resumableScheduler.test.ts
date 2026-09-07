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
})
