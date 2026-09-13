import { describe, expect, it, vi } from 'vitest'

import {
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  nextScalableCapacity,
  resolveScalableEffortConfig,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  SCALABLE_BASE_CAPACITY,
  structuralViolation,
  type Filter,
  type ScalableSearchStage,
  type ScalableStructuralSearchInput,
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

describe('scalable structural search policy', () => {
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
})
