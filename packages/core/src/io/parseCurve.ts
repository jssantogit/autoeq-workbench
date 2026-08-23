import { CoreError } from '../types/error.js'
import type { Curve, CurveKind, CurvePoint } from '../types/curve.js'

export interface ParseCurveOptions {
  name: string
  kind: CurveKind
}

type Delimiter = {
  name: string
  split: (line: string) => string[]
}

const delimiters: Delimiter[] = [
  { name: 'tab', split: (line) => line.split('\t') },
  { name: 'semicolon', split: (line) => line.split(';') },
  { name: 'comma', split: (line) => line.split(',') },
  { name: 'whitespace', split: (line) => line.trim().split(/[ \f\v]+/) },
]

const numericToken = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|Infinity|NaN)$/i

let nextCurveId = 1

function cleanLines(text: string): string[] {
  return text
    .replace(/^\ufeff/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(
      (line) =>
        line.trim().length > 0 &&
        !line.trimStart().startsWith('#') &&
        !line.trimStart().startsWith('//') &&
        !line.trimStart().startsWith('; '),
    )
    .map((line) => line.trim())
}

function splitColumns(delimiter: Delimiter, line: string): string[] {
  return delimiter.split(line).map((column) => column.trim())
}

function isHeader(columns: string[]): boolean {
  return (
    columns.length === 2 &&
    columns.every((column) => column.length > 0 && !numericToken.test(column))
  )
}

function matchesDelimiter(delimiter: Delimiter, lines: string[]): boolean {
  const rows = lines.map((line) => splitColumns(delimiter, line))
  const dataStart = isHeader(rows[0] ?? []) ? 1 : 0

  return rows.slice(dataStart).every(
    (columns) => columns.length === 2 && columns.every((column) => numericToken.test(column)),
  )
}

function parseRows(delimiter: Delimiter, lines: string[]): CurvePoint[] {
  const rows = lines.map((line) => splitColumns(delimiter, line))
  const dataRows = isHeader(rows[0] ?? []) ? rows.slice(1) : rows

  return dataRows.map(([frequencyToken, dbToken], index) => {
    const frequencyHz = Number(frequencyToken)
    const db = Number(dbToken)

    if (!Number.isFinite(frequencyHz) || !Number.isFinite(db)) {
      throw new CoreError('validation', `Row ${index + 1} must contain finite numbers`)
    }
    if (frequencyHz <= 0) {
      throw new CoreError('validation', `Row ${index + 1} frequency must be positive`)
    }

    return { frequencyHz, db }
  })
}

function collapseDuplicates(points: CurvePoint[]): CurvePoint[] {
  const pointsByFrequency = new Map<number, CurvePoint>()

  for (const point of points) {
    const existing = pointsByFrequency.get(point.frequencyHz)
    if (existing !== undefined && existing.db !== point.db) {
      throw new CoreError(
        'validation',
        `Duplicate frequency ${point.frequencyHz} Hz has conflicting dB values`,
      )
    }
    if (existing === undefined) {
      pointsByFrequency.set(point.frequencyHz, point)
    }
  }

  const uniquePoints = [...pointsByFrequency.values()]
  const isIncreasing = uniquePoints.every(
    (point, index) => index === 0 || uniquePoints[index - 1]!.frequencyHz < point.frequencyHz,
  )

  return isIncreasing
    ? uniquePoints
    : uniquePoints.toSorted((left, right) => left.frequencyHz - right.frequencyHz)
}

export function parseCurveText(text: string, options: ParseCurveOptions): Curve {
  const lines = cleanLines(text)
  if (lines.length === 0) {
    throw new CoreError('validation', 'Curve input is empty or contains no numeric data')
  }

  const matches = delimiters.filter((delimiter) => matchesDelimiter(delimiter, lines))
  if (matches.length !== 1) {
    const reason = matches.length > 1 ? 'ambiguous delimiter' : 'malformed rows or columns'
    throw new CoreError('parse', `Curve input has ${reason}`)
  }

  const rawPoints = collapseDuplicates(parseRows(matches[0]!, lines))
  if (rawPoints.length < 2) {
    throw new CoreError('validation', 'Curve input must contain at least two unique points')
  }

  return {
    id: `curve-${nextCurveId++}`,
    name: options.name,
    kind: options.kind,
    rawPoints,
    metadata: {},
  }
}
