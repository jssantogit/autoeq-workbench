import { range, sum } from 'd3'

const pair = <T, R>(values: readonly T[], fn: (right: T, left: T) => R): R[] =>
  values.slice(1).map((value, index) => fn(value, values[index]!))

interface SmoothParameters {
  G: number[][]
  md: number[]
  ml: number[][]
  d2: number[]
}

function smoothPrep(h: number[], d: (index: number) => number): SmoothParameters {
  const rh = h.map((value) => 1 / value)
  const G = [
    rh.slice(0, rh.length - 1),
    pair(rh, (right, left) => -(right + left)),
    rh.slice(1),
  ]
  const dv = range(rh.length + 1).map((index) => d(index))
  const dG = G.map((row, rowIndex) => row.map((value, index) => value * dv[index + rowIndex]!))
  const d2 = dv.map((value) => value * value)
  const h6 = h.map((value) => value / 6)
  const M = [
    pair(h6, (right, left) => 2 * (right + left)),
    h6.slice(1, h6.length - 1),
    h6.slice(3).map(() => 0),
  ]

  dG.forEach((_row, diagonal) => {
    dG.slice(diagonal).forEach((g, rowIndex) => {
      dG[rowIndex]!.slice(diagonal).forEach((value, columnIndex) => {
        M[diagonal]![columnIndex]! += value * g[columnIndex]!
      })
    })
  })

  const md = [M[0]![0]!]
  const ml = M.slice(1).map((row) => [row[0]! / md[0]!])
  range(1, M[0]!.length).forEach((column) => {
    const diagonalCount = ml.length
    const products = md.slice(-diagonalCount).reverse().map((value, index) =>
      value * ml[index]![column - 1 - index]!,
    )
    const values = M.map((row, rowIndex) => row[column]! - sum(
      products.slice(0, diagonalCount - rowIndex),
      (value, index) => value * ml[rowIndex + index]![column - 1 - index]!,
    ))
    md.push(values[0]!)
    ml.forEach((row, rowIndex) => row.push(values[rowIndex + 1]! / values[0]!))
  })

  return { G, md, ml, d2 }
}

function smoothEval(parameters: SmoothParameters, gains: number[]): number[] {
  const Gy = parameters.G[0]!.map(() => 0)
  const length = Gy.length
  parameters.G.forEach((row, rowIndex) => row.forEach((value, index) => {
    Gy[index]! += value * gains[index + rowIndex]!
  }))
  for (let index = 0; index < length; index += 1) {
    const value = Gy[index]!
    parameters.ml.forEach((row, rowIndex) => {
      const target = index + rowIndex + 1
      if (target < length) Gy[target]! -= row[index]! * value
    })
    Gy[index]! /= parameters.md[index]!
  }
  for (let index = length - 1; index >= 0; index -= 1) {
    const value = Gy[index]!
    parameters.ml.forEach((row, rowIndex) => {
      const target = index - rowIndex - 1
      if (target >= 0) Gy[target]! -= row[target]! * value
    })
  }
  const output = gains.slice()
  parameters.G.forEach((row, rowIndex) => row.forEach((value, index) => {
    output[index + rowIndex]! -= value * parameters.d2[index + rowIndex]! * Gy[index]!
  }))
  return output
}

export function smoothGraphSeries(
  data: readonly [number, number][],
  level: number,
  scale = 0.01,
): [number, number][] {
  if (level === 0 || data.length < 3) return data.map(([frequencyHz, db]) => [frequencyHz, db])
  const frequencies = data.map(([frequencyHz]) => frequencyHz)
  const gains = data.map(([, db]) => db)
  const x = frequencies.map(Math.log)
  const h = pair(x, (right, left) => right - left)
  const strength = level * scale
  const d = (index: number) => strength * Math.pow(1 / 80, Math.pow(index / x.length, 2))
  const prepared = smoothPrep(h, d)
  const smoothed = smoothEval(prepared, gains)
  return frequencies.map((frequencyHz, index) => [frequencyHz, smoothed[index]!])
}
