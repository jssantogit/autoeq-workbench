import { interpolateLogFrequency } from '@autoeq-workbench/core'
import type { DerivedCurve, WorkspaceDerived } from '../../state/workspaceStore'

export type GraphSeriesName =
  | 'Source'
  | 'Target'
  | 'Source + EQ'
  | 'PEQ'
  | 'Desired'
  | 'Selected Filter'

export interface GraphSeries {
  name: GraphSeriesName
  data: [number, number][]
  defaultVisible: boolean
  markerFrequencyHz?: number
}

export function formatGraphInspector(
  frequencyHz: number,
  series: readonly GraphSeries[],
  selected: Readonly<Partial<Record<GraphSeriesName, boolean>>>,
): string {
  const frequency =
    frequencyHz >= 1_000 ? `${(frequencyHz / 1_000).toFixed(2)} kHz` : `${frequencyHz.toFixed(0)} Hz`
  const values = series.flatMap((item) => {
    if (selected[item.name] === false || item.data.length < 2) return []
    const firstFrequency = item.data[0]![0]
    const lastFrequency = item.data[item.data.length - 1]![0]
    if (frequencyHz < firstFrequency || frequencyHz > lastFrequency) return []
    const points = item.data.map(([pointFrequencyHz, db]) => ({
      frequencyHz: pointFrequencyHz,
      db,
    }))
    const db = interpolateLogFrequency(points, [frequencyHz])[0]!
    return [`${item.name}: ${db.toFixed(2)} dB`]
  })

  return [frequency, ...values].join('<br/>')
}

function graphSeries(
  name: GraphSeriesName,
  curve: DerivedCurve | null,
  defaultVisible: boolean,
): GraphSeries | null {
  if (curve === null) return null
  return {
    name,
    data: curve.frequencies.map((frequency, index) => [frequency, curve.db[index]!] as const),
    defaultVisible,
  }
}

export function buildGraphSeries(workspaceDerived: WorkspaceDerived): GraphSeries[] {
  return [
    graphSeries('Source', workspaceDerived.source, true),
    graphSeries('Target', workspaceDerived.target, true),
    graphSeries(
      'Source + EQ',
      workspaceDerived.hasFilters ? workspaceDerived.sourceEq : null,
      true,
    ),
    graphSeries('PEQ', workspaceDerived.peq, false),
    graphSeries('Desired', workspaceDerived.desired, false),
    workspaceDerived.selectedFilter === null
      ? null
      : {
          ...graphSeries('Selected Filter', workspaceDerived.selectedFilter, true)!,
          markerFrequencyHz: workspaceDerived.selectedFilter.frequencyHz,
        },
  ].filter((series): series is GraphSeries => series !== null)
}
