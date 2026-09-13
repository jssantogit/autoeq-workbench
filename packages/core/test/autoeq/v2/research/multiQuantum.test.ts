import { describe, expect, expectTypeOf, it } from 'vitest'

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

  it('matches ramp capacity against ramp effort, not against the hold control', () => {
    const run = ({ config, seedFilters, onTrace }: {
      config: SchedulerDecisionSnapshot['baseConfig']
      seedFilters?: readonly Filter[]
      onTrace?: (trace: StructuralSearchTraceEvent) => void
    }): StructuralSearchResult => {
      const filters = [...(seedFilters ?? [])]
      if (filters.length < config.maxFilters) {
        filters.push(filter(`generated-${filters.length}-${config.maxFilters}`))
      }
      // Quality is intentionally a function of effort only.  The expanded
      // capacity arm may reach an extra slot, but that slot has no causal
      // value in this runner.
      const effortOnlyQuality = 1 / config.proposalsPerParent
      return {
        filters,
        rmseDb: effortOnlyQuality,
        maxAbsDb: effortOnlyQuality,
      }
    }

    const result = runFactorizedMultiQuantumContinuation(snapshot(), {
      maximumCapacity: 8,
      stageQuantumMs: 1,
      nowMs: () => 0,
      run,
    })

    const ramp = result.byArm['C+-ramp']!
    const rampControl = result.byArm['C-ramp']!
    const holdControl = result.byArm['C-hold']!
    expect(ramp.checkpoints.map(({ finalQuality }) => finalQuality)).toEqual(
      rampControl.checkpoints.map(({ finalQuality }) => finalQuality),
    )
    expect(ramp.checkpoints[1]!.finalQuality[0]).toBeLessThan(holdControl.checkpoints[1]!.finalQuality[0])
    expect(ramp.checkpoints[1]!.frontierMaxFilterCount).toBeGreaterThan(ramp.initialCapacity)
    expect(ramp.checkpoints.every(({ productiveNewSlotComparedWithControl }) => productiveNewSlotComparedWithControl === false)).toBe(true)
    expect(ramp.firstProductiveNewSlotQuantum).toBeNull()
  })

  it('reports an above-capacity event at its exact quantum, separate from checkpoints', () => {
    const eventSnapshot = snapshot()
    eventSnapshot.incumbent = {
      filters: [filter('seed-a'), filter('seed-b')],
      rmseDb: 1,
      maxAbsDb: 1,
    }
    let call = 0
    const run = ({ config, seedFilters, onTrace }: {
      config: SchedulerDecisionSnapshot['baseConfig']
      seedFilters?: readonly Filter[]
      onTrace?: (trace: StructuralSearchTraceEvent) => void
    }): StructuralSearchResult => {
      const armIndex = Math.floor(call / 16)
      const quantum = (call % 16) + 1
      call += 1
      const filters = [...(seedFilters ?? [])]
      // The first expanded-arm candidate is deliberately held until quantum
      // 3, which is not itself a checkpoint observation.
      if (armIndex === 1 && quantum === 3 && filters.length < config.maxFilters) {
        filters.push(filter('generated-at-three'))
      }
      onTrace?.({
        type: 'beam-generation',
        filterCount: filters.length,
        rmseDb: filters.length > 2 ? 0.5 : 1,
        maxAbsDb: filters.length > 2 ? 0.5 : 1,
        violation: filters.length > 2 ? 0.5 : 1,
        frontierUtilization: {
          parentStatesObserved: 1,
          parentFilterCountMax: (seedFilters ?? []).length,
          generatedCandidateFilterCountMax: filters.length,
          admittedCandidateFilterCountMax: filters.length,
          polishedCandidateFilterCountMax: filters.length,
          parentsAtCapacity: 0,
          generatedCandidatesAtCapacity: 0,
          admittedCandidatesAtCapacity: 0,
          polishedCandidatesAtCapacity: 0,
          candidatesWithinOneSlotOfCapacity: 0,
        },
      })
      const quality = filters.length > 2 ? 0.5 : 1
      return { filters, rmseDb: quality, maxAbsDb: quality }
    }

    const result = runFactorizedMultiQuantumContinuation(eventSnapshot, {
      maximumCapacity: 8,
      stageQuantumMs: 1,
      nowMs: () => 0,
      run,
    })
    const expanded = result.byArm['C+-hold']!
    expect(result.checkpoints).toEqual([1, 2, 4, 8, 16])
    expect(expanded.checkpoints[0]!.firstGeneratedAboveInitialCapacity).toBeNull()
    expect(expanded.checkpoints[1]!.firstGeneratedAboveInitialCapacity).toBeNull()
    expect(expanded.checkpoints[2]!.firstGeneratedAboveInitialCapacity).toBe(3)
    expectTypeOf(expanded.checkpoints[2]!.firstGeneratedAboveInitialCapacity)
      .toEqualTypeOf<number | null | undefined>()
  })
})
