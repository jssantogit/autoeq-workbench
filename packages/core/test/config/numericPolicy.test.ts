import { describe, expect, it } from 'vitest'
import { MVP_NUMERIC_POLICY, createEvaluationGrid } from '../../src/index.js'

describe('MVP numeric policy', () => {
  it('locks the shared 48 kHz 20 Hz-20 kHz 96 ppo evaluation policy', () => {
    expect(MVP_NUMERIC_POLICY).toEqual({
      sampleRateHz: 48_000,
      minFrequencyHz: 20,
      maxFrequencyHz: 20_000,
      evaluationPointsPerOctave: 96,
    })
    expect(Object.isFrozen(MVP_NUMERIC_POLICY)).toBe(true)
  })

  it('creates a deterministic, strictly increasing canonical evaluation grid', () => {
    const grid = createEvaluationGrid()

    expect(grid).toEqual(createEvaluationGrid())
    expect(grid[0]).toBe(20)
    expect(grid.at(-1)).toBe(20_000)
    expect(grid).toHaveLength(958)
    expect(grid[96]).toBe(40)
    expect(grid.every((value, index) => index === 0 || value > grid[index - 1]!)).toBe(true)
  })
})
