import { describe, expect, it } from 'vitest'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  resolveStructuralSearchConfig,
  type Filter,
  type SchedulerDecisionSnapshot,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from '../../../../src/index.js'
import { runFactorizedMultiQuantumContinuation } from '../../../../benchmarks/research/multiQuantum.js'

function filter(id: string): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 }
}

function snapshot(): SchedulerDecisionSnapshot {
  return {
    desiredDb: [0, 0, 0],
    frequencies: [100, 1_000, 10_000],
    sampleRateHz: 48_000,
    baseConfig: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 5 }),
    incumbent: { filters: [filter('seed')], rmseDb: 1, maxAbsDb: 1 },
    currentCapacity: 2,
    maximumCapacity: 8,
    effortLevel: 1,
  }
}

describe('multi-quantum factorized research continuation', () => {
  it('keeps each arm incumbent alive and reports nested 1/2/4/8/16 checkpoints', () => {
    const seedLengths: number[] = []
    const run = ({ config, seedFilters, onTrace }: {
      config: SchedulerDecisionSnapshot['baseConfig']
      seedFilters?: readonly Filter[]
      onTrace?: (trace: StructuralSearchTraceEvent) => void
    }): StructuralSearchResult => {
      const seed = seedFilters ?? []
      seedLengths.push(seed.length)
      const next = [...seed, filter(`generated-${seedLengths.length}`)]
      onTrace?.({
        type: 'beam-generation',
        filterCount: next.length,
        rmseDb: Math.max(0.01, 1 / next.length),
        maxAbsDb: Math.max(0.01, 1 / next.length),
        violation: 1,
        capacityPressure: {
          additiveProposalsGenerated: 1,
          additiveMutationGatesBlockedByCapacity: next.length >= config.maxFilters ? 1 : 0,
          rescueAddGatesBlockedByCapacity: 0,
          pairAddGatesBlockedByCapacity: 0,
        },
        frontierUtilization: {
          parentStatesObserved: 1,
          parentFilterCountMax: seed.length,
          generatedCandidateFilterCountMax: Math.min(config.maxFilters, next.length),
          admittedCandidateFilterCountMax: Math.min(config.maxFilters, next.length),
          polishedCandidateFilterCountMax: Math.min(config.maxFilters, next.length),
          parentsAtCapacity: seed.length >= config.maxFilters ? 1 : 0,
          generatedCandidatesAtCapacity: next.length >= config.maxFilters ? 1 : 0,
          admittedCandidatesAtCapacity: next.length >= config.maxFilters ? 1 : 0,
          polishedCandidatesAtCapacity: next.length >= config.maxFilters ? 1 : 0,
          candidatesWithinOneSlotOfCapacity: next.length + 1 >= config.maxFilters ? 1 : 0,
        },
      })
      return { filters: next, rmseDb: 1 / next.length, maxAbsDb: 1 / next.length }
    }

    const result = runFactorizedMultiQuantumContinuation(snapshot(), {
      maximumCapacity: 8,
      stageQuantumMs: 1,
      nowMs: () => 0,
      run,
    })

    expect(result.checkpoints).toEqual([1, 2, 4, 8, 16])
    expect(Object.keys(result.byArm)).toEqual(['C-hold', 'C+-hold', 'C-ramp', 'C+-ramp'])
    for (const arm of result.arms) {
      expect(arm.checkpoints.map((checkpoint) => checkpoint.quantum)).toEqual([1, 2, 4, 8, 16])
      expect(arm.checkpoints.map((checkpoint) => checkpoint.cumulativeWork.structuralSearchInvocations)).toEqual([1, 2, 4, 8, 16])
    }
    // Calls for later quanta receive the prior arm's filters, not the original seed.
    expect(Math.max(...seedLengths)).toBeGreaterThan(snapshot().incumbent.filters.length)
    expect(result.byArm['C+-hold']!.checkpoints[0]!.capacity).toBe(3)
    expect(result.byArm['C-hold']!.checkpoints[0]!.capacityPressure.additiveProposalsGenerated).toBe(1)
    expect(result.byArm['C+-hold']!.checkpoints.at(-1)!.firstGeneratedAboveInitialCapacity).toBe(2)
    expect(result.byArm['C-hold']!.checkpoints[0]!.effortLevel).toBe(1)
    expect(result.byArm['C-ramp']!.checkpoints.map((checkpoint) => checkpoint.effortLevel)).toEqual([1, 2, 4, 6, 6])
  })
})
