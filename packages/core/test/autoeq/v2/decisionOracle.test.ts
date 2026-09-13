import { describe, expect, it } from 'vitest'

import {
  addSearchWorkDelta,
  evaluateSchedulerDecision,
  evaluateSchedulerDecisionPair,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  nextScalableCapacity,
  resolveStructuralSearchConfig,
  structuralViolation,
  type Filter,
  type SchedulerDecisionSearchRunner,
  type SchedulerDecisionSnapshot,
  type SearchWorkDelta,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from '../../../src/index.js'

const frequencies = [100, 1_000, 10_000]
const desiredDb = [0, 0, 0]

function filter(id: string): Filter {
  return {
    id,
    enabled: true,
    type: 'PK',
    frequencyHz: 1_000,
    gainDb: 1,
    q: 1,
  }
}

function result(
  filters: readonly Filter[],
  rmseDb = 1,
  maxAbsDb = 1,
): StructuralSearchResult {
  return {
    filters: filters.map((entry) => ({ ...entry })),
    rmseDb,
    maxAbsDb,
  }
}

function snapshot(
  overrides: Partial<SchedulerDecisionSnapshot> = {},
): SchedulerDecisionSnapshot {
  return {
    desiredDb,
    frequencies,
    sampleRateHz: 48_000,
    baseConfig: resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 5,
    }),
    incumbent: result([filter('seed')]),
    currentCapacity: 10,
    maximumCapacity: 43,
    effortLevel: 1,
    consecutiveNoImprovement: 2,
    recentGains: [0.2, 0.01],
    cumulativeWork: {
      structuralSearchInvocations: 4,
      beamGenerations: 4,
      proposalsGenerated: 12,
      proposalsAdmitted: 8,
      proposalsPolished: 8,
      duplicateStates: 1,
      rescueAttempts: 0,
      pairAddAttempts: 0,
      capSwapAttempts: 0,
      reseedAttempts: 0,
    },
    remainingWallClockMs: 1_000,
    ...overrides,
  }
}

function event(
  type: StructuralSearchTraceEvent['type'],
  extra: Partial<StructuralSearchTraceEvent> = {},
): StructuralSearchTraceEvent {
  return {
    type,
    filterCount: 1,
    rmseDb: 1,
    maxAbsDb: 1,
    violation: 4,
    ...extra,
  }
}

const emptyWork: SearchWorkDelta = {
  structuralSearchInvocations: 1,
  beamGenerations: 0,
  proposalsGenerated: 0,
  proposalsAdmitted: 0,
  proposalsPolished: 0,
  duplicateStates: 0,
  rescueAttempts: 0,
  pairAddAttempts: 0,
  capSwapAttempts: 0,
  reseedAttempts: 0,
}

describe('generic scheduler decision oracle', () => {
  it('branches both arms from the same incumbent and never accepts a regression', () => {
    const calls: Array<{ maxFilters: number; effort: number; seed: Filter[] }> = []
    const run: SchedulerDecisionSearchRunner = ({ config, seedFilters }) => {
      calls.push({
        maxFilters: config.maxFilters,
        effort: config.beamWidth,
        seed: (seedFilters ?? []).map((entry) => ({ ...entry })),
      })
      return result([], 99, 99)
    }

    const pair = evaluateSchedulerDecisionPair(
      snapshot(),
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      { run, nowMs: () => 0 },
    )

    expect(calls).toHaveLength(2)
    expect(calls[0]?.seed).toEqual(calls[1]?.seed)
    expect(pair.arms.map((arm) => arm.startingIncumbent)).toEqual([
      snapshot().incumbent,
      snapshot().incumbent,
    ])
    expect(pair.arms.map((arm) => arm.finalIncumbent)).toEqual([
      snapshot().incumbent,
      snapshot().incumbent,
    ])
    expect(pair.arms.map((arm) => arm.absoluteGain)).toEqual([0, 0])
  })

  it('deepens effort without changing capacity while expansion follows generic progression', () => {
    const calls: Array<{ maxFilters: number; beamWidth: number }> = []
    const run = ({ config }: { config: SchedulerDecisionSnapshot['baseConfig'] }) => {
      calls.push({ maxFilters: config.maxFilters, beamWidth: config.beamWidth })
      return result([])
    }
    const state = snapshot({ currentCapacity: 10, maximumCapacity: 43, effortLevel: 1 })

    const deepen = evaluateSchedulerDecision(
      state,
      'deepen-current-regime',
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      { run, nowMs: () => 0 },
    )
    const expand = evaluateSchedulerDecision(
      state,
      'expand-capacity',
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      { run, nowMs: () => 0 },
    )

    expect(deepen.capacityBefore).toBe(10)
    expect(deepen.capacityAfter).toBe(10)
    expect(expand.capacityBefore).toBe(10)
    expect(expand.capacityAfter).toBe(nextScalableCapacity(10, 43))
    expect(calls[0]?.maxFilters).toBe(10)
    expect(calls[1]?.maxFilters).toBe(15)
    expect(calls[0]?.beamWidth).toBeGreaterThan(state.baseConfig.beamWidth)
    expect(calls[1]?.beamWidth).toBe(state.baseConfig.beamWidth)
  })

  it.each([17, 37, 43])('expands toward arbitrary ceiling %s without a named path', (maximumCapacity) => {
    let observedCapacity = 0
    const run = ({ config }: { config: SchedulerDecisionSnapshot['baseConfig'] }) => {
      observedCapacity = config.maxFilters
      return result([])
    }

    evaluateSchedulerDecision(
      snapshot({ currentCapacity: 10, maximumCapacity }),
      'expand-capacity',
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      { run, nowMs: () => 0 },
    )

    expect(observedCapacity).toBe(nextScalableCapacity(10, maximumCapacity))
    expect(observedCapacity).toBeLessThanOrEqual(maximumCapacity)
  })

  it('accumulates raw trace work and reports dimension mismatches rather than scoring work', () => {
    const run = ({ config, onTrace }: {
      config: SchedulerDecisionSnapshot['baseConfig']
      onTrace?: (trace: StructuralSearchTraceEvent) => void
    }) => {
      onTrace?.(event('beam-generation', {
        generatedProposals: config.maxFilters,
        admittedProposals: 3,
        polishedProposals: 2,
        duplicateStates: 1,
      }))
      onTrace?.(event('phase', {
        phase: 'rescue',
        attempts: config.maxFilters === 10 ? 2 : 4,
      }))
      return result([])
    }
    const pair = evaluateSchedulerDecisionPair(
      snapshot(),
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      { run, nowMs: () => 0 },
    )

    expect(pair.arms[0]?.workDelta).toEqual({
      ...emptyWork,
      beamGenerations: 1,
      proposalsGenerated: 10,
      proposalsAdmitted: 3,
      proposalsPolished: 2,
      duplicateStates: 1,
      rescueAttempts: 2,
    })
    expect(pair.arms[1]?.workDelta).toEqual({
      ...emptyWork,
      beamGenerations: 1,
      proposalsGenerated: 15,
      proposalsAdmitted: 3,
      proposalsPolished: 2,
      duplicateStates: 1,
      rescueAttempts: 4,
    })
    expect(pair.arms[0]?.cumulativeWork).toEqual(addSearchWorkDelta(
      snapshot().cumulativeWork!,
      pair.arms[0]!.workDelta,
    ))
    expect(pair.workComparison.equalDimensions).toContain('structuralSearchInvocations')
    expect(pair.workComparison.mismatchedDimensions).toContain('proposalsGenerated')
    expect(pair.workComparison.mismatchedDimensions).toContain('rescueAttempts')
  })

  it('repeats controlled oracle runs with identical evidence', () => {
    const run = ({ onTrace }: { onTrace?: (trace: StructuralSearchTraceEvent) => void }) => {
      onTrace?.(event('beam-generation', {
        generatedProposals: 2,
        admittedProposals: 1,
        polishedProposals: 1,
      }))
      return result([filter('better')], 0.5, 0.5)
    }
    const options = { run, nowMs: () => 0 }
    const first = evaluateSchedulerDecisionPair(
      snapshot({ cumulativeWork: undefined }),
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      options,
    )
    const second = evaluateSchedulerDecisionPair(
      snapshot({ cumulativeWork: undefined }),
      { structuralSearchInvocations: 1, stageQuantumMs: 1 },
      options,
    )

    expect(second).toEqual(first)
    expect(first.arms[0]?.absoluteGain).toBeGreaterThan(0)
    expect(first.arms[0]?.relativeGain).toBeCloseTo(
      first.arms[0]!.absoluteGain / structuralViolation(snapshot().incumbent),
      12,
    )
  })
})
