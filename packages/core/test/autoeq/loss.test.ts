import { describe, expect, it } from 'vitest'

import {
  CoreError,
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateObjective,
  resolveStandardAutoEqConfig,
  type CancellationAudit,
  type Filter,
} from '../../src/index.js'

const config = resolveStandardAutoEqConfig(DEFAULT_AUTOEQ_SETTINGS)
const noCancellation: CancellationAudit = { pairs: [], totalScore: 0 }

function filter(update: Partial<Filter> = {}): Filter {
  return {
    id: 'filter-1',
    enabled: true,
    type: 'PK',
    frequencyHz: 1_000,
    gainDb: 0,
    q: 2,
    ...update,
  }
}

function objective(
  residualDb: readonly number[],
  filters: readonly Filter[] = [],
  cancellationAudit: CancellationAudit = noCancellation,
) {
  return evaluateObjective({ residualDb, filters, cancellationAudit, config })
}

describe('evaluateObjective', () => {
  it('uses mean deadbanded Huber loss and ignores errors inside the deadband', () => {
    expect(objective([0.1, -0.1, 0])).toBe(0)
    expect(objective([0.6, 2.1])).toBeCloseTo((0.125 + 1.5) / 2)
    expect(objective([0.6])).toBeCloseTo(0.125)
  })

  it('adds the approved filter-count cost', () => {
    expect(objective([0], [filter()])).toBeCloseTo(0.01)
    expect(objective([0], [filter(), filter({ id: 'filter-2' })])).toBeCloseTo(0.02)
  })

  it('penalizes Q only above two', () => {
    expect(objective([0], [filter({ q: 2 })])).toBeCloseTo(0.01)
    expect(objective([0], [filter({ q: 4 })])).toBeCloseTo(0.012)
  })

  it('penalizes absolute gain only above 6 dB', () => {
    expect(objective([0], [filter({ gainDb: -6 })])).toBeCloseTo(0.01)
    expect(objective([0], [filter({ gainDb: -8 })])).toBeCloseTo(0.012)
  })

  it('adds cancellation cost from the supplied audit', () => {
    expect(objective([0], [], { pairs: [], totalScore: 1.25 })).toBeCloseTo(0.0125)
  })

  it.each([
    ['empty residual', []],
    ['non-finite residual', [Number.NaN]],
  ])('rejects %s', (_label, residualDb) => {
    expect(() => objective(residualDb)).toThrow(CoreError)
  })

  it('rejects non-finite objective output as numeric failure', () => {
    try {
      objective([0], [filter({ gainDb: Number.MAX_VALUE })])
      throw new Error('Expected objective evaluation to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError)
      expect(error).toMatchObject({ category: 'numeric' })
    }
  })
})
