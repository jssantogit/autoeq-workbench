import { describe, expect, it } from 'vitest'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  resolveStructuralSearchConfig,
  type Filter,
  type SchedulerDecisionSnapshot,
  type StructuralSearchResult,
} from '../../../../src/index.js'
import {
  deriveScalableCapacityLadder,
  runFixedCapacityTrajectory,
} from '../../../../benchmarks/research/fixedCapacity.js'

function snapshot(): SchedulerDecisionSnapshot {
  return {
    desiredDb: [0, 0, 0],
    frequencies: [100, 1_000, 10_000],
    sampleRateHz: 48_000,
    baseConfig: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 5 }),
    incumbent: {
      filters: [{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 }],
      rmseDb: 1,
      maxAbsDb: 1,
    },
    currentCapacity: 2,
    maximumCapacity: 64,
    effortLevel: 1,
  }
}

describe('fixed-capacity resource probes', () => {
  it('derives a generic capacity ladder without named capacity modes', () => {
    expect(deriveScalableCapacityLadder(64)).toEqual([10, 15, 23, 35, 53, 64])
    expect(deriveScalableCapacityLadder(12, 4)).toEqual([4, 6, 9, 12])
  })

  it('continues one fixed-capacity trajectory through requested time checkpoints', () => {
    const calls: Array<{ maxFilters: number; effort: number; seedLength: number }> = []
    let clock = 0
    const run = ({ config, seedFilters }: {
      config: SchedulerDecisionSnapshot['baseConfig']
      seedFilters?: readonly Filter[]
    }): StructuralSearchResult => {
      const seed = seedFilters ?? []
      calls.push({ maxFilters: config.maxFilters, effort: config.beamWidth, seedLength: seed.length })
      clock += 5_000
      const filters = seed.length < config.maxFilters
        ? [...seed, { id: `added-${calls.length}`, enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 1, q: 1 }]
        : [...seed]
      return { filters, rmseDb: 1 / filters.length, maxAbsDb: 1 / filters.length }
    }
    const result = runFixedCapacityTrajectory(snapshot(), {
      capacity: 2,
      checkpointSeconds: [5, 15],
      stageQuantumMs: 5_000,
      nowMs: () => clock,
      run,
    })

    expect(result.checkpoints.map((checkpoint) => checkpoint.requestedSeconds)).toEqual([5, 15])
    expect(result.checkpoints.map((checkpoint) => checkpoint.capacity)).toEqual([2, 2])
    expect(result.checkpoints.map((checkpoint) => checkpoint.effortLevel)).toEqual([1, 3])
    expect(calls.map(({ maxFilters }) => maxFilters)).toEqual([2, 2, 2])
    expect(calls.map(({ seedLength }) => seedLength)).toEqual([1, 2, 2])
    expect(result.checkpoints.at(-1)!.cumulativeWork.structuralSearchInvocations).toBe(3)
  })
})
