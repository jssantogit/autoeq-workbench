import type { GraphSeries } from '../../features/graph/graphSeries'
import type { CurveAppearance } from '../../state/uiStore'

export type DisplaySeries = GraphSeries & {
  displayData: readonly [number, number][]
}

function appearanceId(series: GraphSeries): string {
  return series.kind === 'equalized-fr' ? series.sourceCurveId : series.curveId
}

function offsetData(
  series: GraphSeries,
  appearance: Readonly<Record<string, CurveAppearance>>,
): [number, number][] {
  const offsetDb = appearance[appearanceId(series)]?.offsetDb ?? 0
  return series.data.map(([frequencyHz, db]) => [frequencyHz, db + offsetDb])
}

function interpolateLogFrequency(
  data: readonly [number, number][],
  frequencyHz: number,
): number | null {
  if (data.length === 0 || !Number.isFinite(frequencyHz) || frequencyHz <= 0) return null
  const first = data[0]!
  const last = data[data.length - 1]!
  if (frequencyHz === first[0]) return first[1]
  if (frequencyHz === last[0]) return last[1]
  if (frequencyHz < first[0] || frequencyHz > last[0]) return null

  for (let index = 1; index < data.length; index += 1) {
    const left = data[index - 1]!
    const right = data[index]!
    if (frequencyHz > right[0]) continue
    const x = Math.log10(frequencyHz)
    const x0 = Math.log10(left[0])
    const x1 = Math.log10(right[0])
    const ratio = (x - x0) / (x1 - x0)
    return left[1] + ratio * (right[1] - left[1])
  }
  return null
}

export function buildDisplaySeries(
  series: readonly GraphSeries[],
  appearance: Readonly<Record<string, CurveAppearance>>,
  baselineCurveId: string | null,
): DisplaySeries[] {
  const offsetSeries = series.map((item) => ({ item, data: offsetData(item, appearance) }))
  const baseline = baselineCurveId === null
    ? undefined
    : offsetSeries.find(({ item }) => item.id === baselineCurveId)?.data

  return offsetSeries.map(({ item, data }) => ({
    ...item,
    displayData: baseline === undefined
      ? data
      : data.flatMap(([frequencyHz, db]) => {
          const baselineDb = interpolateLogFrequency(baseline, frequencyHz)
          return baselineDb === null ? [] : [[frequencyHz, db - baselineDb] as [number, number]]
        }),
  }))
}
