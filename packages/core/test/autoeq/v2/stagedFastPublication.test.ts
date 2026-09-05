import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  searchStandardV2WorkingSolutions,
  type Filter,
} from '../../../src/index.js'

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

function setup() {
  const frequencies = createEvaluationGrid()
  const desiredDb = evaluateV2Solution([
    pk('a', 90, 2, 1.2),
    pk('b', 220, -2.4, 1.5),
    pk('c', 520, 2.8, 1.8),
    pk('d', 1_200, -3, 2),
    pk('e', 2_600, 3.2, 2.4),
    pk('f', 5_200, -3, 2.8),
    pk('g', 9_000, 2.5, 3),
    pk('h', 15_000, -2, 2.5),
  ], [], frequencies, 48_000).cascadeDb
  const config = resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    maxFilters: 1,
  })
  return { frequencies, desiredDb, config: { ...config, workingMaxFilters: 1 } }
}

describe('Standard v2 staged fast-pass publication', () => {
  it('does not publish a fast-pass best before continuation refinement starts', () => {
    const { frequencies, desiredDb, config } = setup()
    const events: string[] = []

    searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
      boundaryMode: 'sign-crossing',
      researchTrace: {
        onJointRefineCompleted: () => events.push('refine'),
      },
      onBestWorkingSolution: () => events.push('best'),
    })

    const firstBest = events.indexOf('best')
    expect(firstBest).toBeGreaterThanOrEqual(4)
    expect(events.slice(0, firstBest).filter((event) => event === 'refine')).toHaveLength(4)
  })

  it('publishes the best fast-pass checkpoint before returning on pre-continuation timeout', () => {
    const { frequencies, desiredDb, config } = setup()
    let refinementCompletions = 0
    let expired = false
    let bestCallbacks = 0

    const result = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => expired },
      boundaryMode: 'sign-crossing',
      researchTrace: {
        onJointRefineCompleted: () => {
          refinementCompletions += 1
          if (refinementCompletions === 3) expired = true
        },
      },
      onBestWorkingSolution: () => { bestCallbacks += 1 },
    })

    expect(result.termination).toBe('time-limit')
    expect(refinementCompletions).toBe(3)
    expect(bestCallbacks).toBeGreaterThan(0)
  })
})
