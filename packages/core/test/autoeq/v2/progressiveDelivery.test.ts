import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  evaluateV2Solution,
  runStandardAutoEqV2,
  type Curve,
  type Filter,
  type StandardAutoEqInputV2,
} from '../../../src/index.js'

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

describe('Standard v2 progressive delivery', () => {
  it('does not run deep discrete refinement for every working checkpoint', () => {
    const frequencies = createEvaluationGrid()
    const desiredDb = evaluateV2Solution(
      [
        pk('a', 400, 4, 2),
        pk('b', 1_500, -5, 3),
        pk('c', 4_500, 5, 4),
        pk('d', 9_000, -4, 3),
      ],
      [],
      frequencies,
      48_000,
    ).cascadeDb
    const curve = (kind: Curve['kind'], db: readonly number[]): Curve => ({
      id: kind,
      name: kind,
      kind,
      rawPoints: frequencies.map((frequencyHz, index) => ({
        frequencyHz,
        db: db[index]!,
      })),
      metadata: { synthetic: true },
    })
    const runInput: StandardAutoEqInputV2 = {
      source: curve('fr', desiredDb.map((value) => -value)),
      target: curve('target', frequencies.map(() => 0)),
      normalization: { mode: 'hz', frequencyHz: 500, levelDb: 0 },
      settings: { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 1, timeLimitSeconds: 5 },
    }
    let workingCheckpoints = 0
    let discreteRefineStarts = 0

    const result = runStandardAutoEqV2(runInput, {
      nowMs: () => 0,
      researchTrace: {
        onWorkingCheckpoint: () => { workingCheckpoints += 1 },
        onPhaseStart: (phase) => {
          if (phase === 'discreteRefine') discreteRefineStarts += 1
        },
      },
    })

    expect(result.filters.length).toBeLessThanOrEqual(1)
    expect(workingCheckpoints).toBeGreaterThan(1)
    expect(discreteRefineStarts).toBeLessThan(workingCheckpoints)
  }, 20_000)
})
