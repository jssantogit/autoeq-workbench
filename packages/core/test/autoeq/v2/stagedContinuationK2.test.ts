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

describe('Standard v2 staged continuation experiment K=2', () => {
  it('continues the two best staged candidates after the fast pass', () => {
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

    const result = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config: { ...config, workingMaxFilters: 1 },
      deadline: { isExpired: () => false },
      boundaryMode: 'sign-crossing',
    })

    // Three staged candidates receive the one-cycle fast pass, then the
    // best two receive continuation refinement. No fallback is needed.
    expect(result.jointRefinementCount).toBe(5)
  })
})
