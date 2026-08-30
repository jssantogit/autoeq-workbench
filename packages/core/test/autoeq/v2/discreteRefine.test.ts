import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  cyclicDiscreteRefineV2,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  type AcceptedDiscreteMove,
  type DiscreteTrial,
  type Filter,
} from '../../../src/index.js'

const frequencies = createEvaluationGrid()

function pk(id: string, frequencyHz: number, gainDb = 2, q = 2): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

function desiredResponse(filters: readonly Filter[]): number[] {
  return evaluateV2Solution(filters, [], frequencies, 48_000).cascadeDb
}

function scriptedDeadline(maxChecks: number) {
  let checks = 0
  return {
    deadline: { isExpired: () => ++checks > maxChecks },
    checks: () => checks,
  }
}

describe('Standard v2 cyclic discrete refinement', () => {
  it('finishes consecutive 1 Hz Frequency descent before visiting Gain or Q', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const trials: DiscreteTrial[] = []
    const moves: AcceptedDiscreteMove[] = []
    const result = cyclicDiscreteRefineV2({
      filters: [pk('start', 1_230)],
      desiredDb: desiredResponse([pk('desired', 1_235)]),
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }, {
      onTrial: (trial) => trials.push(trial),
      onAcceptedMove: (move) => moves.push(move),
    })

    const firstNonFrequencyTrial = trials.findIndex(({ coordinate }) => coordinate !== 'frequencyHz')
    const firstFrequencyRun = trials.slice(0, firstNonFrequencyTrial)
    const firstFrequencyMoves = moves.slice(0, moves.findIndex(({ coordinate }) => coordinate !== 'frequencyHz'))

    expect(firstNonFrequencyTrial).toBeGreaterThan(0)
    expect(firstFrequencyRun.every(({ coordinate }) => coordinate === 'frequencyHz')).toBe(true)
    expect(firstFrequencyMoves.length).toBeGreaterThan(1)
    expect(firstFrequencyMoves.every(({ from, to }) => Math.abs(to - from) === 1)).toBe(true)
    expect(firstFrequencyMoves.every((move, index) =>
      index === 0 || move.from === firstFrequencyMoves[index - 1]!.to
    )).toBe(true)
    expect(result.filters[0]!.frequencyHz).toBe(1_235)
  })

  it('reuses the evaluated response when Frequency revisits the prior accepted value', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    let inFirstFrequencyRun = true
    let firstRunResponseComputations = 0
    const trace = {
      onTrial: ({ coordinate }: DiscreteTrial) => {
        if (coordinate !== 'frequencyHz') inFirstFrequencyRun = false
      },
      onResponseComputed: () => {
        if (inFirstFrequencyRun) firstRunResponseComputations += 1
      },
    } as DiscreteRefineTraceWithResponseComputations

    const result = cyclicDiscreteRefineV2({
      filters: [pk('start', 1_230)],
      desiredDb: desiredResponse([pk('desired', 1_235)]),
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }, trace)

    expect(result.filters[0]!.frequencyHz).toBe(1_235)
    expect(firstRunResponseComputations).toBe(7)
  })

  it('materializes cancellation audit only for the final non-tied solution', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const fixed = pk('fixed', 1_500, -2, 2)
    const desiredDb = desiredResponse([pk('desired', 1_235), fixed])
    let cancellationAuditComputations = 0
    const result = cyclicDiscreteRefineV2({
      filters: [pk('start', 1_230), fixed],
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }, {
      onCancellationAuditComputed: () => {
        cancellationAuditComputations += 1
      },
    } as DiscreteRefineTraceWithResponseComputations)

    expect(result.filters[0]!.frequencyHz).toBe(1_235)
    expect(cancellationAuditComputations).toBe(1)
    expect(result.solution.cancellationAudit).toEqual(evaluateV2Solution(
      result.filters,
      desiredDb,
      frequencies,
      config.sampleRateHz,
    ).cancellationAudit)
  })

  it('stops Frequency at its local ±1 Hz optimum inside the effective envelope', () => {
    const config = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 1_200,
      maxFrequencyHz: 1_202,
    })
    const trials: DiscreteTrial[] = []
    const result = cyclicDiscreteRefineV2({
      filters: [pk('start', 1_201)],
      desiredDb: desiredResponse([pk('desired', 1_210)]),
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }, { onTrial: (trial) => trials.push(trial) })

    expect(result.filters[0]!.frequencyHz).toBe(1_202)
    expect(trials.filter(({ coordinate }) => coordinate === 'frequencyHz')
      .every(({ to }) => to >= 1_200 && to <= 1_202)).toBe(true)
  })

  it('uses deterministic ranking and ties across repeated runs', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const input = {
      filters: [pk('start', 2_497, 1.7, 2.04)],
      desiredDb: desiredResponse([pk('desired', 2_500, 2, 2)]),
      frequencies,
      config,
      deadline: { isExpired: () => false },
    }
    const firstTrials: DiscreteTrial[] = []
    const firstMoves: AcceptedDiscreteMove[] = []
    const secondTrials: DiscreteTrial[] = []
    const secondMoves: AcceptedDiscreteMove[] = []
    const first = cyclicDiscreteRefineV2(input, {
      onTrial: (trial) => firstTrials.push(trial),
      onAcceptedMove: (move) => firstMoves.push(move),
    })
    const second = cyclicDiscreteRefineV2(input, {
      onTrial: (trial) => secondTrials.push(trial),
      onAcceptedMove: (move) => secondMoves.push(move),
    })

    expect(second).toEqual(first)
    expect(secondTrials).toEqual(firstTrials)
    expect(secondMoves).toEqual(firstMoves)
  })

  it('does not start the next local Frequency trial after deadline', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const clock = scriptedDeadline(5)
    const trials: DiscreteTrial[] = []
    const moves: AcceptedDiscreteMove[] = []
    const input = {
      filters: [pk('start', 995)],
      desiredDb: desiredResponse([pk('desired', 1_000)]),
      frequencies,
      config,
      deadline: clock.deadline,
    }
    const result = cyclicDiscreteRefineV2(input, {
      onTrial: (trial) => trials.push(trial),
      onAcceptedMove: (move) => moves.push(move),
    })

    expect(result.expired).toBe(true)
    expect(trials).toHaveLength(2)
    expect(moves).toHaveLength(1)
    expect(result.filters[0]!.frequencyHz).toBe(moves[0]!.to)
    expect(result.solution).toEqual(evaluateV2Solution(
      result.filters,
      input.desiredDb,
      frequencies,
      config.sampleRateHz,
    ))
    expect(clock.checks()).toBe(6)
  })
})

interface DiscreteRefineTraceWithResponseComputations {
  onTrial?(trial: DiscreteTrial): void
  onResponseComputed?(): void
  onCancellationAuditComputed?(): void
}
