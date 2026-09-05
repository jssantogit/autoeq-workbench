import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  JOINT_REFINEMENT_SCALES,
  auditCancellations,
  compareV2Solutions,
  createEvaluationGrid,
  evaluateV2Solution,
  jointRefineV2,
  resolveStandardAutoEqV2Config,
  type Filter,
  type StandardAutoEqV2Config,
  type StandardV2Deadline,
  type StandardV2JointRefineRecord,
} from '../../../src/index.js'

const frequencies = [100, 200, 400, 800, 1_000, 1_200, 1_600, 3_200, 6_400]
const desiredFilter: Filter = {
  id: 'desired', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 2,
}
const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)

describe('Standard v2 joint refinement', () => {
  it('preserves an accepted Frequency update when Gain is accepted afterward', () => {
    const evaluationFrequencies = createEvaluationGrid()
    const targetFilters: Filter[] = [
      { id: '', enabled: true, type: 'PK', frequencyHz: 90, gainDb: 2, q: 1.2 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 220, gainDb: -2.4, q: 1.5 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 520, gainDb: 2.8, q: 1.8 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 1_200, gainDb: -3, q: 2 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 2_600, gainDb: 3.2, q: 2.4 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 5_200, gainDb: -3, q: 2.8 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 9_000, gainDb: 2.5, q: 3 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 15_000, gainDb: -2, q: 2.5 },
    ]
    const desiredDb = evaluateV2Solution(
      targetFilters,
      [],
      evaluationFrequencies,
      config.sampleRateHz,
    ).cascadeDb
    const start = evaluateV2Solution([
      {
        id: 'low', enabled: true, type: 'PK',
        frequencyHz: 553.9433990439313, gainDb: -2.5367754514278293, q: 0.1,
      },
      {
        id: 'high', enabled: true, type: 'PK',
        frequencyHz: 16138.043853904759, gainDb: -3.413619784726027, q: 0.559811357732104,
      },
    ], desiredDb, evaluationFrequencies, config.sampleRateHz)

    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies: evaluationFrequencies,
      config: {
        ...config,
        algorithm: { ...config.algorithm, maxJointRefinementCycles: 1 },
      } as unknown as StandardAutoEqV2Config,
      deadline: { isExpired: () => false },
    })

    expect(result.solution.filters[1]!.frequencyHz).not.toBe(16138.043853904759)
    expect(result.solution.filters[1]!.gainDb).not.toBe(-3.413619784726027)
  })

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

  it('reuses an already evaluated starting response grid', () => {
    const desiredDb = evaluateV2Solution([desiredFilter], [], frequencies, config.sampleRateHz)
      .cascadeDb
    const start = evaluateV2Solution([desiredFilter], desiredDb, frequencies, config.sampleRateHz)

    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
    })

    expect(result.solution.responseCache.responseGrid).toBe(start.responseCache.responseGrid)
  })

  it('defers cancellation audits until an accepted primary improvement must be returned', () => {
    const desiredDb = evaluateV2Solution([desiredFilter], [], frequencies, config.sampleRateHz)
      .cascadeDb
    const start = evaluateV2Solution([
      { ...desiredFilter, frequencyHz: 900, gainDb: 2.5 },
    ], desiredDb, frequencies, config.sampleRateHz)
    let auditComputations = 0

    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }, {
      onCancellationAuditComputed: () => { auditComputations += 1 },
    })

    expect(auditComputations).toBeGreaterThan(0)
    expect(auditComputations).toBeLessThan(result.coordinateTrials)
    expect(result.solution.cancellationAudit).toEqual(auditCancellations(
      result.solution.filters,
      frequencies,
      config.sampleRateHz,
    ))
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

  it('does not publish a coordinate evaluation that crosses the deadline', () => {
    let checks = 0
    const desiredFrequencyHz = config.minFrequencyHz * 2 ** (1 / 6)
    const desiredDb = evaluateV2Solution(
      [{ ...desiredFilter, frequencyHz: desiredFrequencyHz }],
      [],
      frequencies,
      config.sampleRateHz,
    ).cascadeDb
    const start = evaluateV2Solution(
      [{ ...desiredFilter, frequencyHz: config.minFrequencyHz }],
      desiredDb,
      frequencies,
      config.sampleRateHz,
    )

    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => ++checks > 4 },
    })

    expect(result.expired).toBe(true)
    expect(result.coordinateTrials).toBe(2)
    expect(result.solution.filters).toEqual(start.filters)
  })

  it('traces the parent, candidate, cycles, and final refinement state', () => {
    const desiredDb = evaluateV2Solution([desiredFilter], [], frequencies, config.sampleRateHz)
      .cascadeDb
    const start = evaluateV2Solution([
      { ...desiredFilter, frequencyHz: 900, gainDb: 2.5 },
    ], desiredDb, frequencies, config.sampleRateHz)
    const records: StandardV2JointRefineRecord[] = []

    const result = jointRefineV2({
      solution: start,
      desiredDb,
      frequencies,
      config: {
        ...config,
        algorithm: { ...config.algorithm, maxJointRefinementCycles: 1 },
      } as unknown as StandardAutoEqV2Config,
      deadline: { isExpired: () => false },
      researchContext: {
        traceId: 'search:1',
        origin: 'search',
        boundaryMode: 'sign-crossing',
        parentKey: 'parent',
        parentFilterCount: start.filters.length,
        parentMetrics: { ...start.metrics },
        candidateKey: 'candidate',
        candidate: {
          filter: { ...desiredFilter },
          featureIndex: 2,
          boundaryMode: 'sign-crossing',
          qScale: 1,
          cheapScore: 4,
        },
        refinementKey: 'state',
      },
      researchTrace: {
        onJointRefineTrace: (record) => { records.push(record) },
      },
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      traceId: 'search:1',
      origin: 'search',
      parentKey: 'parent',
      candidateKey: 'candidate',
      refinementKey: 'state',
      resultKey: expect.any(String),
      completedCycles: result.completedCycles,
      coordinateTrials: result.coordinateTrials,
      expired: false,
    })
    expect(records[0]!.cycles).toHaveLength(result.completedCycles)
    expect(records[0]!.cycles.reduce((sum, cycle) => sum + cycle.coordinateTrials, 0))
      .toBe(result.coordinateTrials)
    expect(records[0]!.cycles[0]!.normalizedViolationGain).toBeGreaterThanOrEqual(0)
  })
})
