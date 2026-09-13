import { describe, expect, it, vi } from 'vitest'

import {
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  DEFAULT_AUTOEQ_SETTINGS,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  nextScalableCapacity,
  resolveStandardAutoEqV2Config,
  resolveScalableEffortConfig,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  SCALABLE_BASE_CAPACITY,
  SCALABLE_STAGE_QUANTUM_MS,
  structuralViolation,
  type Filter,
  type SearchWorkDelta,
  type ScalableSearchStage,
  type ScalableStructuralSearchInput,
  type StructuralSearchTraceEvent,
} from '../../../src/index.js'

import * as structuralSearch from '../../../src/autoeq/v2/structuralSearch.js'

vi.mock('../../../src/autoeq/v2/structuralSearch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/autoeq/v2/structuralSearch.js')>()
  return {
    ...actual,
    runStructuralSearch: vi.fn(),
  }
})

const mockedRunStructuralSearch = vi.mocked(structuralSearch.runStructuralSearch)

const testFrequencies = [100, 1_000, 10_000]
const testDesiredDb = [0, 0, 0]

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

function inputFor(
  overrides: Partial<ScalableStructuralSearchInput> = {},
): ScalableStructuralSearchInput {
  return {
    desiredDb: testDesiredDb,
    frequencies: testFrequencies,
    sampleRateHz: 48_000,
    maxFilters: 10,
    baseConfig: resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 5,
    }),
    deadline: { isExpired: () => false },
    nowMs: () => 0,
    ...overrides,
  }
}

function deadlineAfterStages(stageCount: number): ScalableStructuralSearchInput['deadline'] {
  let checks = 0
  return {
    isExpired: () => checks++ >= stageCount,
  }
}

function expectedMetrics(filters: readonly Filter[]) {
  const responseDb = cascadeMagnitudeDb(filters, testFrequencies, 48_000)
  return calculateErrorMetrics(
    testDesiredDb.map((desired, index) => desired - responseDb[index]!),
    testFrequencies,
  )
}

function resetMockRunner(): void {
  mockedRunStructuralSearch.mockReset()
}

function traceEvent(
  type: StructuralSearchTraceEvent['type'],
  extra: Partial<StructuralSearchTraceEvent> = {},
): StructuralSearchTraceEvent {
  return {
    type,
    filterCount: 0,
    rmseDb: 0,
    maxAbsDb: 0,
    violation: 0,
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

describe('scalable structural search policy', () => {
  it('measures unresolved residual extrema and raw residual magnitude', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const opportunity = structuralSearch.measureResidualExpansionOpportunity(
      [100, 200, 400, 800, 1_600],
      [0.8, 0.2, -0.8, -1, -0.2],
      bounds,
    )

    expect(opportunity.unresolvedResidualExtremaCount).toBe(2)
    expect(opportunity.residualMaxAbsDb).toBeCloseTo(
      calculateErrorMetrics(
        [0.8, 0.2, -0.8, -1, -0.2],
        [100, 200, 400, 800, 1_600],
      ).maxAbsDb,
      12,
    )
    expect(opportunity.residualMaxAbsDb).toBe(1)
  })

  it('grows capacity geometrically without Max20/Max30-specific presets', () => {
    expect(nextScalableCapacity(10, 64)).toBe(15)
    expect(nextScalableCapacity(15, 64)).toBe(23)
    expect(nextScalableCapacity(23, 64)).toBe(35)
    expect(nextScalableCapacity(35, 64)).toBe(53)
    expect(nextScalableCapacity(53, 64)).toBe(64)
    expect(nextScalableCapacity(64, 64)).toBe(64)
  })

  it('supports generated arbitrary capacity ceilings with bounded strict progression', () => {
    const maxima = Array.from({ length: 64 }, (_, index) => index + 1)

    for (const maximum of maxima) {
      let current = Math.min(10, maximum)
      const progression = [current]

      for (let stage = 0; current < maximum && stage < 256; stage += 1) {
        const next = nextScalableCapacity(current, maximum)
        expect(next).toBeGreaterThan(current)
        expect(next).toBeLessThanOrEqual(maximum)
        progression.push(next)
        current = next
      }

      expect(current).toBe(maximum)
      expect(progression.length).toBeLessThan(256)
    }
  })

  it('runs the same bounded controller for generated ceilings without capacity modes', () => {
    const maxima = Array.from({ length: 64 }, (_, index) => index + 1)
    const run = (maximum: number) => {
      resetMockRunner()
      mockedRunStructuralSearch.mockImplementation(() => ({
        filters: [],
        rmseDb: 99,
        maxAbsDb: 99,
      }))
      const stages: ScalableSearchStage[] = []
      const result = runScalableStructuralSearch(inputFor({
        maxFilters: maximum,
        deadline: deadlineAfterStages(8),
        onStage: (stage) => stages.push(stage),
      }))
      return {
        result: {
          filters: result.filters,
          rmseDb: result.rmseDb,
          maxAbsDb: result.maxAbsDb,
          stagesCompleted: result.stagesCompleted,
        },
        stages,
      }
    }

    for (const maximum of maxima) {
      const first = run(maximum)
      const second = run(maximum)
      const capacities = first.stages.map((stage) => stage.capacity)
      const firstMaximumIndex = capacities.findIndex((capacity) => capacity === maximum)

      expect(first).toEqual(second)
      expect(first.result.stagesCompleted).toBe(8)
      expect(capacities.every((capacity) => capacity <= maximum)).toBe(true)
      expect(firstMaximumIndex).toBeGreaterThanOrEqual(0)
      expect(capacities.slice(0, firstMaximumIndex).every((capacity, index, values) =>
        index === 0 || capacity > values[index - 1]!,
      )).toBe(true)
      expect(capacities[firstMaximumIndex]).toBe(maximum)
      expect(capacities[0]).toBe(Math.min(SCALABLE_BASE_CAPACITY, maximum))
    }
  })

  it('deepens search effort monotonically while keeping the requested capacity', () => {
    const base = resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 60,
    })
    const low = resolveScalableEffortConfig(base, 30, 0)
    const medium = resolveScalableEffortConfig(base, 30, 3)
    const high = resolveScalableEffortConfig(base, 30, 99)

    expect(low.maxFilters).toBe(30)
    expect(medium.maxFilters).toBe(30)
    expect(high.maxFilters).toBe(30)
    expect(medium.beamWidth).toBeGreaterThan(low.beamWidth)
    expect(medium.proposalsPerParent).toBeGreaterThan(low.proposalsPerParent)
    expect(medium.localPolishEvaluations).toBeGreaterThan(low.localPolishEvaluations)
    expect(high.beamWidth).toBeGreaterThanOrEqual(medium.beamWidth)
    expect(high.proposalsPerParent).toBeGreaterThanOrEqual(medium.proposalsPerParent)
    expect(high.localPolishEvaluations).toBeGreaterThanOrEqual(medium.localPolishEvaluations)
  })

  it('uses normalized violation as the monotonic quality objective', () => {
    expect(structuralViolation({ rmseDb: 0.25, maxAbsDb: 0.75 })).toBe(1)
    expect(structuralViolation({ rmseDb: 0.5, maxAbsDb: 0.3 })).toBe(2)
    expect(structuralViolation({ rmseDb: 0.1, maxAbsDb: 1.5 })).toBe(2)
  })

  it('never replaces a seeded incumbent with a worse stage result', () => {
    resetMockRunner()
    const seedFilters = [filter('seed')]
    mockedRunStructuralSearch.mockImplementation(() => ({
      filters: [],
      rmseDb: 99,
      maxAbsDb: 99,
    }))

    const result = runScalableStructuralSearch(inputFor({
      seedFilters,
      deadline: deadlineAfterStages(1),
    }))
    const expected = expectedMetrics(seedFilters)

    expect(mockedRunStructuralSearch).toHaveBeenCalledTimes(1)
    expect(result.filters).toEqual(seedFilters)
    expect(result.rmseDb).toBeCloseTo(expected.rmseDb, 12)
    expect(result.maxAbsDb).toBeCloseTo(expected.maxAbsDb, 12)
  })

  it('preserves the same incumbent for generated irregular capacity ceilings', () => {
    const maxima = [1, 7, 11, 17, 31, 37, 43, 47, 63, 64]
    const seedFilters = [filter('seed')]
    const expected = expectedMetrics(seedFilters)

    for (const maximum of maxima) {
      resetMockRunner()
      mockedRunStructuralSearch.mockImplementation(() => ({
        filters: [],
        rmseDb: 99,
        maxAbsDb: 99,
      }))

      const result = runScalableStructuralSearch(inputFor({
        maxFilters: maximum,
        seedFilters,
        deadline: deadlineAfterStages(1),
      }))

      expect(result.filters).toEqual(seedFilters)
      expect(result.rmseDb).toBeCloseTo(expected.rmseDb, 12)
      expect(result.maxAbsDb).toBeCloseTo(expected.maxAbsDb, 12)
      expect(mockedRunStructuralSearch.mock.calls[0]?.[0].config.maxFilters)
        .toBe(Math.min(10, maximum))
    }
  })

  it('progresses only through generic capacity bounds and continues work after maximum capacity', () => {
    resetMockRunner()
    const calls: Array<{ maxFilters: number; beamWidth: number }> = []
    mockedRunStructuralSearch.mockImplementation(({ config }) => {
      calls.push({
        maxFilters: config.maxFilters,
        beamWidth: config.beamWidth,
      })
      return {
        filters: [],
        rmseDb: 99,
        maxAbsDb: 99,
      }
    })
    const stages: ScalableSearchStage[] = []

    const result = runScalableStructuralSearch(inputFor({
      maxFilters: 64,
      deadline: deadlineAfterStages(7),
      onStage: (stage) => stages.push(stage),
    }))

    expect(result.stagesCompleted).toBe(7)
    expect(calls.map((call) => call.maxFilters)).toEqual([10, 15, 23, 35, 53, 64, 64])
    expect(calls.every((call) => call.maxFilters <= 64)).toBe(true)
    expect(stages.map((stage) => stage.capacity)).toEqual([10, 15, 23, 35, 53, 64, 64])
    expect(stages.map((stage) => stage.effortLevel)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(calls[6]?.beamWidth).toBeGreaterThan(calls[0]?.beamWidth ?? 0)
  })

  it('activates removal reseeds in deterministic rank order after maximum-capacity stagnation', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => ({
      filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const stages: ScalableSearchStage[] = []
    const seedFilters = [filter('a'), filter('b'), filter('c')]

    runScalableStructuralSearch(inputFor({
      maxFilters: 15,
      seedFilters,
      deadline: deadlineAfterStages(5),
      onStage: (stage) => stages.push(stage),
    }))

    expect(stages.map((stage) => stage.seedStrategy)).toEqual([
      'incumbent',
      'incumbent',
      'incumbent',
      'remove-one-reseed',
      'remove-one-reseed',
    ])
    expect(stages[3]).toMatchObject({ effortLevel: 2, removedFilterId: 'a' })
    expect(stages[4]).toMatchObject({ effortLevel: 3, removedFilterId: 'b' })
    expect(mockedRunStructuralSearch.mock.calls[3]?.[0].seedFilters?.map((entry) => entry.id))
      .toEqual(['b', 'c'])
    expect(mockedRunStructuralSearch.mock.calls[4]?.[0].seedFilters?.map((entry) => entry.id))
      .toEqual(['a', 'c'])
  })

  it('stops before starting a stage when the global deadline is expired', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(() => ({
      filters: [],
      rmseDb: 0,
      maxAbsDb: 0,
    }))
    const seedFilters = [filter('seed')]

    const result = runScalableStructuralSearch(inputFor({
      seedFilters,
      deadline: deadlineAfterStages(0),
    }))

    expect(mockedRunStructuralSearch).not.toHaveBeenCalled()
    expect(result.stagesCompleted).toBe(0)
    expect(result.filters).toEqual(seedFilters)
    expect(result.rmseDb).toBeCloseTo(expectedMetrics(seedFilters).rmseDb, 12)
  })

  it('produces deterministic effort and stage telemetry for the same controlled work budget', () => {
    const run = () => {
      resetMockRunner()
      mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => ({
        filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
        rmseDb: 99,
        maxAbsDb: 99,
      }))
      const stages: ScalableSearchStage[] = []
      const result = runScalableStructuralSearch(inputFor({
        maxFilters: 15,
        seedFilters: [filter('a')],
        deadline: deadlineAfterStages(5),
        onStage: (stage) => stages.push(stage),
      }))
      return {
        result: {
          filters: result.filters,
          rmseDb: result.rmseDb,
          maxAbsDb: result.maxAbsDb,
          stagesCompleted: result.stagesCompleted,
        },
        stages,
      }
    }

    expect(run()).toEqual(run())
  })

  it('records incumbent expansion opportunity without changing legacy actions or result', () => {
    const seedFilters = [filter('seed')]
    const run = (onStage?: (stage: ScalableSearchStage) => void) => {
      resetMockRunner()
      mockedRunStructuralSearch.mockImplementation(({ seedFilters: stageSeed }) => ({
        filters: (stageSeed ?? []).map((entry) => ({ ...entry })),
        ...expectedMetrics(stageSeed ?? []),
      }))
      const result = runScalableStructuralSearch(inputFor({
        maxFilters: 15,
        seedFilters,
        deadline: deadlineAfterStages(3),
        onStage,
      }))
      return {
        filters: result.filters,
        rmseDb: result.rmseDb,
        maxAbsDb: result.maxAbsDb,
        stagesCompleted: result.stagesCompleted,
      }
    }

    const baseline = run()
    const stages: ScalableSearchStage[] = []
    const instrumented = run((stage) => stages.push(stage))
    const responseDb = cascadeMagnitudeDb(seedFilters, testFrequencies, 48_000)
    const opportunity = structuralSearch.measureResidualExpansionOpportunity(
      testFrequencies,
      testDesiredDb.map((desired, index) => desired - responseDb[index]!),
      resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS),
    )

    expect(instrumented).toEqual(baseline)
    expect(stages.map((stage) => stage.action)).toEqual([
      'expand-capacity',
      'explore-current-capacity',
      'deepen',
    ])
    expect(stages.every((stage) => stage.expansionOpportunity !== undefined)).toBe(true)
    expect(stages[0]?.expansionOpportunity).toEqual(opportunity)
  })

  it('accounts for trace work and reports marginal incumbent gain without changing the controller decision', () => {
    resetMockRunner()
    const seedFilters = [filter('seed')]
    mockedRunStructuralSearch.mockImplementation(({ onTrace }) => {
      onTrace?.(traceEvent('beam-generation', {
        phase: 'beam',
        generation: 0,
        generatedProposals: 5,
        admittedProposals: 3,
        polishedProposals: 2,
        duplicateStates: 1,
      }))
      onTrace?.(traceEvent('phase', { phase: 'rescue', status: 'start' }))
      onTrace?.(traceEvent('phase', {
        phase: 'rescue',
        status: 'end',
        acceptedSteps: 2,
        attempts: 5,
      }))
      onTrace?.(traceEvent('phase', { phase: 'pair-add', status: 'start' }))
      onTrace?.(traceEvent('phase', {
        phase: 'pair-add',
        status: 'end',
        acceptedSteps: 1,
        attempts: 4,
      }))
      onTrace?.(traceEvent('phase', { phase: 'cap-swap', status: 'start' }))
      onTrace?.(traceEvent('phase', {
        phase: 'cap-swap',
        status: 'end',
        acceptedSteps: 3,
        attempts: 7,
      }))
      onTrace?.(traceEvent('end'))
      return { filters: [], rmseDb: 0, maxAbsDb: 0 }
    })
    const stages: ScalableSearchStage[] = []

    const result = runScalableStructuralSearch(inputFor({
      maxFilters: 15,
      seedFilters,
      deadline: deadlineAfterStages(1),
      onStage: (stage) => stages.push(stage),
    }))

    expect(result.stagesCompleted).toBe(1)
    expect(stages[0]?.action).toBe('expand-capacity')
    expect(stages[0]?.seedStrategy).toBe('incumbent')
    expect(stages[0]?.workDelta).toEqual({
      ...emptyWork,
      beamGenerations: 1,
      proposalsGenerated: 5,
      proposalsAdmitted: 3,
      proposalsPolished: 2,
      duplicateStates: 1,
      rescueAttempts: 5,
      pairAddAttempts: 4,
      capSwapAttempts: 7,
    })
    expect(stages[0]?.workDelta?.rescueAttempts).toBeGreaterThan(2)
    expect(stages[0]?.workDelta?.pairAddAttempts).toBeGreaterThan(1)
    expect(stages[0]?.workDelta?.capSwapAttempts).toBeGreaterThan(3)
    expect(stages[0]?.cumulativeWork).toEqual(stages[0]?.workDelta)
    expect(stages[0]?.improved).toBe(true)
    expect(stages[0]?.qualityDelta).toBeCloseTo(
      (stages[0]?.qualityBefore ?? 0) - (stages[0]?.qualityAfter ?? 0),
      12,
    )
    expect(stages[0]?.qualityBefore).toBeGreaterThan(0)
    expect(stages[0]?.candidateQuality).toBe(0)
    expect(stages[0]?.qualityAfter).toBe(0)
    expect(stages[0]?.qualityBeforeKey).toBeDefined()
    expect(stages[0]?.candidateQualityKey).toBeDefined()
    expect(stages[0]?.qualityAfterKey).toBeDefined()
  })

  it('reports zero incumbent gain for a non-improving stage and accumulates raw work monotonically', () => {
    resetMockRunner()
    const seedFilters = [filter('seed')]
    let invocation = 0
    mockedRunStructuralSearch.mockImplementation(({ onTrace }) => {
      invocation += 1
      onTrace?.(traceEvent('beam-generation', {
        phase: 'beam',
        generation: invocation - 1,
        generatedProposals: invocation,
      }))
      return { filters: [], rmseDb: 99, maxAbsDb: 99 }
    })
    const stages: ScalableSearchStage[] = []

    runScalableStructuralSearch(inputFor({
      maxFilters: 15,
      seedFilters,
      deadline: deadlineAfterStages(2),
      onStage: (stage) => stages.push(stage),
    }))

    expect(stages).toHaveLength(2)
    expect(stages[0]?.improved).toBe(false)
    expect(stages[0]?.qualityDelta).toBe(0)
    expect(stages[0]?.workDelta).toEqual({
      ...emptyWork,
      beamGenerations: 1,
      proposalsGenerated: 1,
    })
    expect(stages[1]?.qualityDelta).toBe(0)
    expect(stages[1]?.workDelta).toEqual({
      ...emptyWork,
      beamGenerations: 1,
      proposalsGenerated: 2,
    })
    expect(stages[1]?.cumulativeWork).toEqual({
      structuralSearchInvocations: 2,
      beamGenerations: 2,
      proposalsGenerated: 3,
      proposalsAdmitted: 0,
      proposalsPolished: 0,
      duplicateStates: 0,
      rescueAttempts: 0,
      pairAddAttempts: 0,
      capSwapAttempts: 0,
      reseedAttempts: 0,
    })
    expect(stages[1]?.cumulativeWork?.structuralSearchInvocations).toBeGreaterThan(
      stages[0]?.cumulativeWork?.structuralSearchInvocations ?? 0,
    )
  })

  it('labels removal reseeding as a generic action and counts the reseed work', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(({ seedFilters, onTrace }) => {
      onTrace?.(traceEvent('beam-generation', {
        phase: 'beam',
        generatedProposals: 1,
      }))
      return {
        filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
        rmseDb: 99,
        maxAbsDb: 99,
      }
    })
    const stages: ScalableSearchStage[] = []

    runScalableStructuralSearch(inputFor({
      maxFilters: 15,
      seedFilters: [filter('a'), filter('b'), filter('c')],
      deadline: deadlineAfterStages(5),
      onStage: (stage) => stages.push(stage),
    }))

    expect(stages.slice(0, 3).map((stage) => stage.action)).toEqual([
      'expand-capacity',
      'explore-current-capacity',
      'deepen',
    ])
    expect(stages.slice(3).map((stage) => stage.action)).toEqual(['reseed', 'reseed'])
    expect(stages[3]?.workDelta?.reseedAttempts).toBe(1)
    expect(stages[4]?.workDelta?.reseedAttempts).toBe(1)
  })

  it('keeps a productive current regime before adaptive expansion', () => {
    resetMockRunner()
    let invocation = 0
    mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => {
      invocation += 1
      return invocation === 1
        ? { filters: [], rmseDb: 0.1, maxAbsDb: 0.1 }
        : {
          filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
          rmseDb: 99,
          maxAbsDb: 99,
        }
    })
    const stages: ScalableSearchStage[] = []

    runScalableStructuralSearch(inputFor({
      maxFilters: 43,
      seedFilters: [filter('seed')],
      schedulerPolicy: 'adaptive-resource',
      remainingWallClockMs: () => SCALABLE_STAGE_QUANTUM_MS * 8,
      deadline: deadlineAfterStages(3),
      onStage: (stage) => stages.push(stage),
    }))

    expect(stages.map((stage) => stage.capacity)).toEqual([10, 10, 10])
    expect(stages[0]?.decisionReason).toBe('insufficient-work-to-judge')
    expect(stages[0]?.action).toBe('explore-current-capacity')
    expect(stages[1]?.decisionReason).toBe('productive-current-regime')
    expect(stages[2]?.action).toBe('deepen')
  })

  it('expands a stagnant adaptive regime only after deterministic work and keeps generic ceilings', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => ({
      filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const stages: ScalableSearchStage[] = []

    runScalableStructuralSearch(inputFor({
      maxFilters: 43,
      schedulerPolicy: 'adaptive-resource',
      remainingWallClockMs: () => SCALABLE_STAGE_QUANTUM_MS * 8,
      deadline: deadlineAfterStages(5),
      onStage: (stage) => stages.push(stage),
    }))

    expect(stages.map((stage) => stage.capacity)).toEqual([10, 10, 10, 15, 15])
    expect(stages.map((stage) => stage.decisionReason)).toEqual([
      'insufficient-work-to-judge',
      'insufficient-work-to-judge',
      'stagnated-with-headroom',
      'insufficient-work-to-judge',
      'insufficient-work-to-judge',
    ])
    expect(stages[2]?.action).toBe('expand-capacity')
    expect(stages[4]?.action).toBe('deepen')
    expect(stages.every((stage) => stage.capacity <= 43)).toBe(true)
  })

  it('keeps adaptive expansion disabled without headroom or follow-up reserve', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => ({
      filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const noHeadroom: ScalableSearchStage[] = []
    runScalableStructuralSearch(inputFor({
      maxFilters: 10,
      schedulerPolicy: 'adaptive-resource',
      remainingWallClockMs: () => SCALABLE_STAGE_QUANTUM_MS * 8,
      deadline: deadlineAfterStages(3),
      onStage: (stage) => noHeadroom.push(stage),
    }))
    expect(noHeadroom.map((stage) => stage.capacity)).toEqual([10, 10, 10])

    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(({ seedFilters }) => ({
      filters: (seedFilters ?? []).map((entry) => ({ ...entry })),
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const noReserve: ScalableSearchStage[] = []
    runScalableStructuralSearch(inputFor({
      maxFilters: 43,
      schedulerPolicy: 'adaptive-resource',
      remainingWallClockMs: () => SCALABLE_STAGE_QUANTUM_MS * 2 - 1,
      deadline: deadlineAfterStages(3),
      onStage: (stage) => noReserve.push(stage),
    }))
    expect(noReserve.map((stage) => stage.capacity)).toEqual([10, 10, 10])
    expect(noReserve.every((stage) => stage.decisionReason === 'insufficient-time-reserve')).toBe(true)
  })

  it('preserves the legacy progression when the baseline policy is selected', () => {
    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(() => ({
      filters: [],
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const omitted: ScalableSearchStage[] = []
    runScalableStructuralSearch(inputFor({
      maxFilters: 43,
      deadline: deadlineAfterStages(5),
      onStage: (stage) => omitted.push(stage),
    }))

    resetMockRunner()
    mockedRunStructuralSearch.mockImplementation(() => ({
      filters: [],
      rmseDb: 99,
      maxAbsDb: 99,
    }))
    const explicit: ScalableSearchStage[] = []
    runScalableStructuralSearch(inputFor({
      maxFilters: 43,
      schedulerPolicy: 'legacy',
      deadline: deadlineAfterStages(5),
      onStage: (stage) => explicit.push(stage),
    }))

    expect(explicit).toEqual(omitted)
  })
})
