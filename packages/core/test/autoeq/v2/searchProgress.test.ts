import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  compareV2Solutions,
  createEvaluationGrid,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  searchStandardV2WorkingSolutions,
  type Filter,
  type StandardAutoEqV2Config,
  type V2EvaluatedSolution,
} from '../../../src/index.js'

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

describe('Standard v2 progressive search checkpoints', () => {
  it('emits a new global best before starting work that can consume the remaining deadline', () => {
    const frequencies = createEvaluationGrid()
    const desiredDb = evaluateV2Solution(
      [pk('target', 1_000, 6, 2)],
      [],
      frequencies,
      48_000,
    ).cascadeDb
    const resolved = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 1,
    })
    const config = {
      ...resolved,
      workingMaxFilters: 1,
      algorithm: { ...resolved.algorithm, maxJointRefinementCycles: 1 },
    } as unknown as StandardAutoEqV2Config
    const zero = evaluateV2Solution([], desiredDb, frequencies, config.sampleRateHz)
    const emitted: V2EvaluatedSolution[] = []
    let expired = false

    const result = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => expired },
      boundaryMode: 'half-height',
      onBestWorkingSolution: (working: V2EvaluatedSolution) => {
        emitted.push(working)
        expired = true
      },
    })

    expect(emitted.length).toBeGreaterThan(0)
    expect(compareV2Solutions(emitted[0]!, zero)).toBeLessThan(0)
    expect(result.termination).toBe('time-limit')
  })
})
