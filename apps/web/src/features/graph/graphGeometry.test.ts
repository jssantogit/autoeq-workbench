import { describe, expect, it } from 'vitest'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  PLOT_BOTTOM,
  PLOT_LEFT,
  PLOT_RIGHT,
  PLOT_TOP,
  X_MAX_HZ,
  X_MIN_HZ,
  Y_MAX_DB,
  Y_MIN_DB,
  createNaturalSplinePath,
  createNaturalSplineSegments,
  evaluateNaturalSpline,
  evaluateNaturalSplineSegments,
  frequencyToX,
  generateXTicks,
  generateYTicks,
  xToFrequency,
  yDbToY,
} from './graphGeometry'

describe('graph geometry', () => {
  it('uses the fixed viewBox, near-edge plot, and fixed domains', () => {
    expect([GRAPH_WIDTH, GRAPH_HEIGHT]).toEqual([800, 346])
    expect([PLOT_LEFT, PLOT_RIGHT, PLOT_TOP, PLOT_BOTTOM]).toEqual([15, 785, 12, 322])
    expect([X_MIN_HZ, X_MAX_HZ, Y_MIN_DB, Y_MAX_DB]).toEqual([20, 20_000, -30, 25])
  })

  it('generates the explicit x frequencies, importance, and deliberate labels', () => {
    const ticks = generateXTicks()
    expect(ticks.map(({ frequencyHz }) => frequencyHz)).toEqual([
      20, 30, 40, 50, 60, 80, 100, 150,
      200, 300, 400, 500, 600, 800, 1_000, 1_500,
      2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 15_000, 20_000,
    ])
    expect(ticks.map(({ importance }) => importance)).toEqual([
      4, 0, 0, 1, 0, 0, 2, 0,
      3, 0, 0, 1, 0, 0, 2, 0,
      3, 0, 0, 1, 0, 0, 2, 0, 4,
    ])
    expect(ticks.map(({ label }) => label).filter(Boolean)).toEqual([
      '20Hz', '50', '100', '200', '500', '1k', '2k', '5k', '10k', '20kHz',
    ])
    expect(new Set(ticks.map(({ strokeWidth }) => strokeWidth)).size).toBeGreaterThan(3)
  })

  it('maps logarithmic x monotonically to exact endpoints and inverts it', () => {
    const frequencies = [20, 50, 100, 1_000, 10_000, 20_000]
    const xs = frequencies.map(frequencyToX)
    expect(xs[0]).toBe(PLOT_LEFT)
    expect(xs.at(-1)).toBe(PLOT_RIGHT)
    expect(xs.every((x, index) => index === 0 || x > xs[index - 1]!)).toBe(true)
    expect(xToFrequency(frequencyToX(1_000))).toBeCloseTo(1_000, 10)
  })

  it('generates the fixed y window and maps endpoints and 0 dB deterministically', () => {
    const ticks = generateYTicks()
    expect(ticks.map(({ db }) => db)).toEqual([25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30])
    expect(ticks.find(({ db }) => db === 0)?.emphasis).toBe('zero')
    expect(yDbToY(25)).toBe(PLOT_TOP)
    expect(yDbToY(-30)).toBe(PLOT_BOTTOM)
    expect(yDbToY(0)).toBeCloseTo(152.909090909, 9)
  })
})

describe('natural spline path', () => {
  it('is deterministic, uses every point and control segment, and produces finite output', () => {
    const points: [number, number][] = [[20, 0], [200, 5], [2_000, -2], [20_000, 1]]
    const first = createNaturalSplinePath(points)
    expect(first).toBe(createNaturalSplinePath(points))
    expect(first.startsWith(`M${PLOT_LEFT},`)).toBe(true)
    expect(first.match(/C/g)).toHaveLength(points.length - 1)
    expect(first).not.toMatch(/NaN|Infinity/)
  })

  it('retains finite positive bracketing points for the SVG clip path', () => {
    const path = createNaturalSplinePath([
      [10, 0], [20, 0], [200, Number.NaN], [2_000, 2], [20_000, 0], [30_000, 0],
    ])
    expect(path.match(/C/g)).toHaveLength(4)
    expect(path.startsWith('M-')).toBe(true)
    expect(path).not.toMatch(/NaN|Infinity/)
  })

  it('sorts unsorted points and resolves duplicate frequencies deterministically', () => {
    const segments = createNaturalSplineSegments([
      [2_000, 2], [20, 0], [200, 1], [200, 3], [20_000, 4],
    ])

    expect(segments.map(({ start }) => start.x)).toEqual(
      [...segments.map(({ start }) => start.x)].sort((left, right) => left - right),
    )
    expect(segments).toHaveLength(3)
    expect(evaluateNaturalSplineSegments(segments, 200)).toBe(3)
  })

  it('uses log frequency as the monotonic independent coordinate on irregular spacing', () => {
    const segments = createNaturalSplineSegments([
      [10, -2], [23, 4], [900, -7], [1_100, 8], [30_000, 1],
    ])

    for (const segment of segments) {
      expect(segment.control1.x).toBeGreaterThan(segment.start.x)
      expect(segment.control1.x).toBeLessThan(segment.control2.x)
      expect(segment.control2.x).toBeLessThan(segment.end.x)
      expect([
        segment.start.x, segment.control1.x, segment.control2.x, segment.end.x,
        segment.start.y, segment.control1.y, segment.control2.y, segment.end.y,
      ].every(Number.isFinite)).toBe(true)
    }
  })

  it('crosses the visible domain from bracketing points and evaluates both plot edges', () => {
    const points: [number, number][] = [[10, -3], [100, 5], [10_000, -2], [30_000, 4]]
    const segments = createNaturalSplineSegments(points)
    const path = createNaturalSplinePath(points)

    expect(segments[0]!.start.x).toBeLessThan(PLOT_LEFT)
    expect(segments.at(-1)!.end.x).toBeGreaterThan(PLOT_RIGHT)
    expect(evaluateNaturalSplineSegments(segments, 20)).toSatisfy(Number.isFinite)
    expect(evaluateNaturalSplineSegments(segments, 20_000)).toSatisfy(Number.isFinite)
    expect(path).not.toMatch(/NaN|Infinity/)
  })

  it('evaluates the same cubic controls used by the rendered path', () => {
    const points: [number, number][] = [[20, 0], [200, 8], [2_000, -4], [20_000, 2]]
    const segment = createNaturalSplineSegments(points)[1]!
    const cubic = (start: number, first: number, second: number, end: number, t: number) =>
      (1 - t) ** 3 * start + 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3 * end
    const midpointX = cubic(segment.start.x, segment.control1.x, segment.control2.x, segment.end.x, 0.5)
    const midpointY = cubic(segment.start.y, segment.control1.y, segment.control2.y, segment.end.y, 0.5)
    const midpointFrequency = xToFrequency(midpointX)

    expect(createNaturalSplinePath(points)).toContain(
      `C${Number(segment.control1.x.toFixed(3))},${Number(segment.control1.y.toFixed(3))}`,
    )
    expect(yDbToY(evaluateNaturalSpline(points, midpointFrequency)!)).toBeCloseTo(midpointY, 8)
    expect(evaluateNaturalSplineSegments(createNaturalSplineSegments(points), midpointFrequency))
      .toBeCloseTo(evaluateNaturalSpline(points, midpointFrequency)!, 10)
    expect(evaluateNaturalSpline(points, 20)).toBe(0)
    expect(evaluateNaturalSpline(points, 20_000)).toBe(2)
    expect(evaluateNaturalSpline(points, 10)).toBeNull()
    expect(createNaturalSplineSegments([[20, 0], [200, Number.NaN]])).toEqual([])
    expect(evaluateNaturalSpline(points, 632)).toSatisfy(Number.isFinite)
  })
})
