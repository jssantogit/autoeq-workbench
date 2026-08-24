export const GRAPH_WIDTH = 800
export const GRAPH_HEIGHT = 346
export const PLOT_LEFT = 15
export const PLOT_RIGHT = 785
export const PLOT_TOP = 12
export const PLOT_BOTTOM = 322
export const X_MIN_HZ = 20
export const X_MAX_HZ = 20_000
export const Y_MIN_DB = -30
export const Y_MAX_DB = 25

const X_VALUES = [2, 3, 4, 5, 6, 8, 10, 15] as const
const TICK_PATTERN = [3, 0, 0, 1, 0, 0, 2, 0] as const
const TICK_THICKNESS = [0.2, 0.4, 0.4, 0.9, 1.5] as const

export interface XTick {
  frequencyHz: number
  importance: number
  strokeWidth: number
  label: string | null
}

export interface YTick {
  db: number
  emphasis: 'zero' | 'normal'
}

export interface GraphPoint {
  x: number
  y: number
}

export interface NaturalSplineSegment {
  start: GraphPoint
  control1: GraphPoint
  control2: GraphPoint
  end: GraphPoint
}

export interface PreparedNaturalSpline {
  segments: NaturalSplineSegment[]
  path: string
}

export function frequencyToX(frequencyHz: number): number {
  const position = Math.log10(frequencyHz / X_MIN_HZ) / Math.log10(X_MAX_HZ / X_MIN_HZ)
  return PLOT_LEFT + position * (PLOT_RIGHT - PLOT_LEFT)
}

export function xToFrequency(x: number): number {
  const position = (x - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)
  return X_MIN_HZ * (X_MAX_HZ / X_MIN_HZ) ** position
}

export function yDbToY(db: number): number {
  return PLOT_TOP + (Y_MAX_DB - db) / (Y_MAX_DB - Y_MIN_DB) * (PLOT_BOTTOM - PLOT_TOP)
}

function yToDb(y: number): number {
  return Y_MAX_DB - (y - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP) * (Y_MAX_DB - Y_MIN_DB)
}

function formatXTick(frequencyHz: number, importance: number): string | null {
  if (importance === 0) return null
  if (frequencyHz === X_MIN_HZ) return '20Hz'
  if (frequencyHz === X_MAX_HZ) return '20kHz'
  return frequencyHz >= 1_000 ? `${frequencyHz / 1_000}k` : String(frequencyHz)
}

export function generateXTicks(): XTick[] {
  const frequencies = [1, 2, 3].flatMap((decade) =>
    X_VALUES.map((value) => value * 10 ** decade),
  ).concat(X_MAX_HZ)
  return frequencies.map((frequencyHz, index) => {
    const importance = index === 0 || index === frequencies.length - 1
      ? 4
      : TICK_PATTERN[index % TICK_PATTERN.length]!
    return {
      frequencyHz,
      importance,
      strokeWidth: TICK_THICKNESS[importance]!,
      label: formatXTick(frequencyHz, importance),
    }
  })
}

export function generateYTicks(): YTick[] {
  return Array.from({ length: 12 }, (_, index) => {
    const db = Y_MAX_DB - index * 5
    return { db, emphasis: db === 0 ? 'zero' : 'normal' }
  })
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function graphPoints(data: readonly (readonly [number, number])[]): GraphPoint[] {
  const sorted = data
    .map(([frequencyHz, db], index) => ({ frequencyHz, db, index }))
    .filter(({ frequencyHz, db }) =>
      Number.isFinite(frequencyHz) && frequencyHz > 0 && Number.isFinite(db),
    )
    .sort((left, right) => left.frequencyHz - right.frequencyHz || left.index - right.index)
  const unique: GraphPoint[] = []
  for (const { frequencyHz, db } of sorted) {
    const point = { x: frequencyToX(frequencyHz), y: yDbToY(db) }
    if (unique.at(-1)?.x === point.x) unique[unique.length - 1] = point
    else unique.push(point)
  }
  return unique
}

function splineSecondDerivatives(points: readonly GraphPoint[]): number[] {
  const last = points.length - 1
  const second = new Array<number>(points.length).fill(0)
  if (last < 2) return second

  const diagonal = new Array<number>(last - 1)
  const rhs = new Array<number>(last - 1)
  for (let index = 1; index < last; index += 1) {
    const previousWidth = points[index]!.x - points[index - 1]!.x
    const nextWidth = points[index + 1]!.x - points[index]!.x
    const lower = index === 1 ? 0 : previousWidth
    const previousDiagonal = diagonal[index - 2]
    const factor = previousDiagonal === undefined ? 0 : lower / previousDiagonal
    diagonal[index - 1] = 2 * (previousWidth + nextWidth) - factor * previousWidth
    rhs[index - 1] = 6 * (
      (points[index + 1]!.y - points[index]!.y) / nextWidth -
      (points[index]!.y - points[index - 1]!.y) / previousWidth
    ) - factor * (rhs[index - 2] ?? 0)
  }
  for (let index = last - 1; index >= 1; index -= 1) {
    second[index] = (rhs[index - 1]! - (index === last - 1 ? 0 :
      (points[index + 1]!.x - points[index]!.x) * second[index + 1]!)) / diagonal[index - 1]!
  }
  return second
}

function naturalSplineSegments(points: readonly GraphPoint[]): NaturalSplineSegment[] {
  if (points.length < 2) return []
  const second = splineSecondDerivatives(points)
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]!
    const width = end.x - start.x
    const slope = (end.y - start.y) / width
    const startSlope = slope - width * (2 * second[index]! + second[index + 1]!) / 6
    const endSlope = slope + width * (second[index]! + 2 * second[index + 1]!) / 6
    return {
      start,
      control1: { x: start.x + width / 3, y: start.y + startSlope * width / 3 },
      control2: { x: start.x + 2 * width / 3, y: end.y - endSlope * width / 3 },
      end,
    }
  })
}

export function createNaturalSplineSegments(
  data: readonly (readonly [number, number])[],
): NaturalSplineSegment[] {
  return naturalSplineSegments(graphPoints(data))
}

function cubic(start: number, control1: number, control2: number, end: number, t: number): number {
  return (1 - t) ** 3 * start + 3 * (1 - t) ** 2 * t * control1 +
    3 * (1 - t) * t ** 2 * control2 + t ** 3 * end
}

export function evaluateNaturalSpline(
  data: readonly (readonly [number, number])[],
  frequencyHz: number,
): number | null {
  return evaluateNaturalSplineSegments(createNaturalSplineSegments(data), frequencyHz)
}

export function evaluateNaturalSplineSegments(
  segments: readonly NaturalSplineSegment[],
  frequencyHz: number,
): number | null {
  if (!Number.isFinite(frequencyHz)) return null
  const x = frequencyToX(frequencyHz)
  const segment = segments.find(({ start, end }) => x >= start.x && x <= end.x)
  if (segment === undefined) return null
  if (x === segment.start.x) return yToDb(segment.start.y)
  if (x === segment.end.x) return yToDb(segment.end.y)
  const t = (x - segment.start.x) / (segment.end.x - segment.start.x)
  return yToDb(cubic(
    segment.start.y, segment.control1.y, segment.control2.y, segment.end.y, t,
  ))
}

export function createNaturalSplinePath(data: readonly (readonly [number, number])[]): string {
  return prepareNaturalSpline(data).path
}

export function prepareNaturalSpline(
  data: readonly (readonly [number, number])[],
): PreparedNaturalSpline {
  const points = graphPoints(data)
  const segments = naturalSplineSegments(points)
  if (points.length === 0) return { segments, path: '' }
  if (points.length === 1) {
    return { segments, path: `M${formatCoordinate(points[0]!.x)},${formatCoordinate(points[0]!.y)}` }
  }
  const commands = segments.map(({ control1, control2, end }) =>
    `C${formatCoordinate(control1.x)},${formatCoordinate(control1.y)}` +
    ` ${formatCoordinate(control2.x)},${formatCoordinate(control2.y)}` +
    ` ${formatCoordinate(end.x)},${formatCoordinate(end.y)}`,
  )
  return { segments, path: `M${formatCoordinate(points[0]!.x)},${formatCoordinate(points[0]!.y)} ${commands.join(' ')}` }
}
