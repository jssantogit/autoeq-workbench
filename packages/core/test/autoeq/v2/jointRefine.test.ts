import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  JOINT_REFINEMENT_SCALES,
  compareV2Solutions,
  evaluateV2Solution,
  jointRefineV2,
  resolveStandardAutoEqV2Config,
  type Filter,
  type StandardV2Deadline,
} from '../../../src/index.js'

const frequencies = [100, 200, 400, 800, 1_000, 1_200, 1_600, 3_200, 6_400]
const desiredFilter: Filter = {
  id: 'desired', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 2,
}
const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)

describe('Standard v2 joint refinement', () => {
  it('uses the approved scales and never worsens a solution', () => {
    expect(JOINT_REFINEMENT_SCALES).toEqual([
      { fcOctaveStep: 1 / 6, gainStepDb: 1, qOctaveStep: 1 / 2 },
      { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
      { fcOctaveStep: 1 / 96, gainStepDb: 0.1, qOctaveStep: 1 / 32 },
    ])
    const desiredDb = evaluateV2Solution([desiredFilter], [], frequencies, config.sampleRateHz)
      .cascadeDb
    const startFilter: Filter = {
      ...desiredFilter, id: 'start', frequencyHz: 900, gainDb: 2.5, q: 1.4,
    }
    const start = evaluateV2Solution([startFilter], desiredDb, frequencies, config.sampleRateHz)
    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
    })

    expect(compareV2Solutions(result.solution, start)).toBeLessThanOrEqual(0)
    expect(result.completedCycles).toBeLessThanOrEqual(6)
  })

  it('keeps shelves at Q 0.7', () => {
    const shelf: Filter = {
      id: 'shelf', enabled: true, type: 'LS', frequencyHz: 200, gainDb: 3, q: 0.7,
    }
    const start = evaluateV2Solution([shelf], frequencies.map(() => 0), frequencies, 48_000)
    const result = jointRefineV2({
      solution: start,
      desiredDb: frequencies.map(() => 0),
      frequencies,
      config,
      deadline: { isExpired: () => false },
    })
    expect(result.solution.filters[0]!.q).toBe(0.7)
  })

  it('does not start a coordinate trial after the deadline expires', () => {
    let checks = 0
    const deadline: StandardV2Deadline = { isExpired: () => ++checks >= 2 }
    const start = evaluateV2Solution(
      [{ ...desiredFilter, frequencyHz: 900 }],
      frequencies.map(() => 0),
      frequencies,
      config.sampleRateHz,
    )
    const result = jointRefineV2({
      solution: start,
      desiredDb: frequencies.map(() => 0),
      frequencies,
      config,
      deadline,
    })

    expect(result.expired).toBe(true)
    expect(result.coordinateTrials).toBe(0)
  })
})
