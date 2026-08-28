import { describe, expect, it } from 'vitest'

import {
  calculateBandMetrics,
  calculateErrorMetrics,
  CoreError,
  type MetricBand,
} from '../src/index.js'

const frequenciesHz = [20, 100, 1000, 5000, 20_000]
const residualDb = [1, -2, 3, -4, 5]

function expectValidation(operation: () => unknown) {
  expect(operation).toThrowError(CoreError)
  expect(operation).toThrowError(expect.objectContaining({ category: 'validation' }))
}

describe('calculateBandMetrics', () => {
  it('includes samples exactly on both band boundaries and delegates metric calculation', () => {
    const band: MetricBand = { id: 'mid', minHz: 100, maxHz: 5000 }

    expect(calculateBandMetrics(residualDb, frequenciesHz, [band])).toEqual([
      {
        ...band,
        ...calculateErrorMetrics([-2, 3, -4], [100, 1000, 5000]),
      },
    ])
  })

  it('rejects empty bands', () => {
    expectValidation(() => calculateBandMetrics(residualDb, frequenciesHz, []))
  })

  it('rejects inverted band bounds', () => {
    expectValidation(() =>
      calculateBandMetrics(residualDb, frequenciesHz, [
        { id: 'inverted', minHz: 5000, maxHz: 100 },
      ]),
    )
  })

  it('rejects unequal residual and frequency arrays', () => {
    expectValidation(() =>
      calculateBandMetrics([1], frequenciesHz, [{ id: 'all', minHz: 20, maxHz: 20_000 }]),
    )
  })

  it('rejects a band containing no samples', () => {
    expectValidation(() =>
      calculateBandMetrics(residualDb, frequenciesHz, [{ id: 'gap', minHz: 30, maxHz: 40 }]),
    )
  })
})
