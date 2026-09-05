import { describe, expect, it } from 'vitest'

import { auditCancellations, createEvaluationGrid, type Filter } from '../../../src/index.js'
import { auditCancellationsOnGrid } from '../../../src/autoeq/cancellation.js'
import { createBiquadResponseGrid } from '../../../src/dsp/response.js'

const frequencies = createEvaluationGrid()
const sampleRateHz = 48_000
const grid = createBiquadResponseGrid(frequencies, sampleRateHz)

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

describe('Standard v2 cached-grid cancellation audit', () => {
  it.each([
    [pk('a', 1_000, 15, 2), pk('b', 1_200, -15, 2)],
    [pk('a', 7_453, -14.6, 11.99), pk('b', 7_600, 9.3, 7.4)],
    [pk('a', 299, 9.5, 0.36), pk('b', 309, -6.7, 0.48), pk('c', 1_533, -1.8, 1.1)],
  ])('matches the public audit bit-for-bit', (...filters: Filter[]) => {
    expect(auditCancellationsOnGrid(filters, grid)).toEqual(
      auditCancellations(filters, frequencies, sampleRateHz),
    )
  })
})
