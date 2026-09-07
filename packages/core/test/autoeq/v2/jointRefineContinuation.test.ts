import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateV2Solution,
  jointRefineV2,
  resolveStandardAutoEqV2Config,
  type Filter,
  type JointRefineInput,
  type StandardAutoEqV2Config,
} from '../../../src/index.js'
import {
  advanceJointRefineContinuationV2,
  createJointRefineContinuationV2,
} from '../../../src/autoeq/v2/jointRefineContinuation.js'

const frequencies = [100, 200, 400, 800, 1_000, 1_600, 3_200, 6_400]
const baseConfig = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)

function inputFor(filters: Filter[], cycles: number): JointRefineInput {
  const desiredDb = evaluateV2Solution(
    filters,
    [],
    frequencies,
    baseConfig.sampleRateHz,
  ).cascadeDb
  const startFilters = filters.map((filter, index) => ({
    ...filter,
    id: `start-${index}`,
    frequencyHz: Math.max(baseConfig.minFrequencyHz, filter.frequencyHz / 2),
    gainDb: filter.gainDb / 2,
  }))
  return {
    solution: evaluateV2Solution(
      startFilters,
      desiredDb,
      frequencies,
      baseConfig.sampleRateHz,
    ),
    desiredDb,
    frequencies,
    config: {
      ...baseConfig,
      algorithm: {
        ...baseConfig.algorithm,
        maxJointRefinementCycles: cycles,
      },
    } as unknown as StandardAutoEqV2Config,
    deadline: { isExpired: () => false },
  }
}

function runContinuation(input: JointRefineInput) {
  const continuation = createJointRefineContinuationV2(input)
  while (!continuation.done) advanceJointRefineContinuationV2(continuation)
  return continuation
}

describe('resumable v2 joint refinement', () => {
  it.each([
    ['pk-only', [{ id: 'pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 2 }]],
    ['shelf-only', [{ id: 'shelf', enabled: true, type: 'LS', frequencyHz: 200, gainDb: 3, q: 0.7 }]],
    ['mixed', [
      { id: 'ls', enabled: true, type: 'LS', frequencyHz: 200, gainDb: 3, q: 0.7 },
      { id: 'pk', enabled: true, type: 'PK', frequencyHz: 2_000, gainDb: -4, q: 1.5 },
    ]],
  ])('matches the compatibility wrapper for %s at 1, 2, and 6 cycles', (_label, filters) => {
    for (const cycles of [1, 2, 6]) {
      const input = inputFor(filters as Filter[], cycles)
      const expected = jointRefineV2(input)
      const actual = runContinuation(input)

      expect(actual.solution).toEqual(expected.solution)
      expect(actual.completedCycles).toBe(expected.completedCycles)
      expect(actual.coordinateTrials).toBe(expected.coordinateTrials)
      expect(actual.expired).toBe(expected.expired)
      expect(actual.done).toBe(true)
      expect(actual.nextCycleIndex).toBe(expected.completedCycles + 1)
    }
  })

  it('does not spend a coordinate trial after the deadline expires', () => {
    let checks = 0
    const input = inputFor([
      { id: 'pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 2 },
    ], 6)
    const deadlineInput = {
      ...input,
      deadline: { isExpired: () => ++checks >= 2 },
    }
    const continuation = createJointRefineContinuationV2(deadlineInput)
    advanceJointRefineContinuationV2(continuation)

    expect(continuation.done).toBe(true)
    expect(continuation.expired).toBe(true)
    expect(continuation.coordinateTrials).toBe(0)
  })

  it('can pause after a completed cycle and resume the same state', () => {
    const input = inputFor([
      { id: 'pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 2 },
    ], 2)
    const continuation = createJointRefineContinuationV2(input)

    advanceJointRefineContinuationV2(continuation)
    expect(continuation.completedCycles).toBe(1)
    expect(continuation.done).toBe(false)

    advanceJointRefineContinuationV2(continuation)
    expect(continuation.done).toBe(true)
    expect(continuation.completedCycles).toBeLessThanOrEqual(2)
  })
})
