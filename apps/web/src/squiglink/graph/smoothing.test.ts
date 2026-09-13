import { describe, expect, it } from 'vitest'
import { smoothGraphSeries } from './smoothing'

describe('smoothGraphSeries', () => {
  const points: [number, number][] = [
    [100, 0], [200, 3], [500, -2], [1_000, 4], [5_000, 0], [10_000, 1],
  ]

  it('returns an independent unchanged copy at level zero', () => {
    const result = smoothGraphSeries(points, 0)
    expect(result).toEqual(points)
    expect(result).not.toBe(points)
    expect(result[0]).not.toBe(points[0])
  })

  it('preserves frequencies, length, constant data, and source arrays', () => {
    const constant: [number, number][] = [[100, 2], [1_000, 2], [10_000, 2]]
    const snapshot = structuredClone(points)
    const result = smoothGraphSeries(points, 5)

    expect(result).toHaveLength(points.length)
    expect(result.map(([frequencyHz]) => frequencyHz)).toEqual(points.map(([frequencyHz]) => frequencyHz))
    expect(points).toEqual(snapshot)
    for (const [, db] of smoothGraphSeries(constant, 5)) expect(db).toBeCloseTo(2, 10)
  })

  it('matches the pinned Squiglink algebra for nonconstant data', () => {
    expect(smoothGraphSeries(points, 5).map(([, db]) => Number(db.toFixed(10)))).toEqual([
      0.0991931852,
      2.7817225693,
      -1.8466625615,
      3.9679777951,
      0.0022189363,
      0.9998875365,
    ])
  })
})
