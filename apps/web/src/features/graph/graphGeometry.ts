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

function firstControlPoints(values: readonly number[]): number[] {
  const segmentCount = values.length - 1
  if (segmentCount === 1) return [(2 * values[0]! + values[1]!) / 3]

  const diagonal = new Array<number>(segmentCount)
  const rhs = new Array<number>(segmentCount)
  diagonal[0] = 2
  rhs[0] = values[0]! + 2 * values[1]!
  for (let index = 1; index < segmentCount - 1; index += 1) {
    diagonal[index] = 4 - 1 / diagonal[index - 1]!
    rhs[index] = 4 * values[index]! + 2 * values[index + 1]! - rhs[index - 1]! / diagonal[index - 1]!
  }
  diagonal[segmentCount - 1] = 3.5 - 1 / diagonal[segmentCount - 2]!
  rhs[segmentCount - 1] = (
    8 * values[segmentCount - 1]! + values[segmentCount]! -
    2 * rhs[segmentCount - 2]! / diagonal[segmentCount - 2]!
  ) / 2

  const controls = new Array<number>(segmentCount)
  controls[segmentCount - 1] = rhs[segmentCount - 1]! / diagonal[segmentCount - 1]!
  for (let index = segmentCount - 2; index >= 0; index -= 1) {
    controls[index] = (rhs[index]! - controls[index + 1]!) / diagonal[index]!
  }
  return controls
}

export function createNaturalSplinePath(data: readonly (readonly [number, number])[]): string {
  const points = data
    .filter(([frequencyHz, db]) =>
      Number.isFinite(frequencyHz) && Number.isFinite(db) &&
      frequencyHz >= X_MIN_HZ && frequencyHz <= X_MAX_HZ,
    )
    .map(([frequencyHz, db]) => ({ x: frequencyToX(frequencyHz), y: yDbToY(db) }))
  if (points.length === 0) return ''
  if (points.length === 1) return `M${formatCoordinate(points[0]!.x)},${formatCoordinate(points[0]!.y)}`

  const firstX = firstControlPoints(points.map(({ x }) => x))
  const firstY = firstControlPoints(points.map(({ y }) => y))
  const lastSegment = points.length - 2
  const commands = points.slice(0, -1).map((_, index) => {
    const next = points[index + 1]!
    const secondX = index === lastSegment
      ? (next.x + firstX[index]!) / 2
      : 2 * next.x - firstX[index + 1]!
    const secondY = index === lastSegment
      ? (next.y + firstY[index]!) / 2
      : 2 * next.y - firstY[index + 1]!
    return `C${formatCoordinate(firstX[index]!)},${formatCoordinate(firstY[index]!)}` +
      ` ${formatCoordinate(secondX)},${formatCoordinate(secondY)}` +
      ` ${formatCoordinate(next.x)},${formatCoordinate(next.y)}`
  })
  return `M${formatCoordinate(points[0]!.x)},${formatCoordinate(points[0]!.y)} ${commands.join(' ')}`
}
