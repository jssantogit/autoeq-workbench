import { interpolateLogFrequency } from '@autoeq-workbench/core'
import type {
  DerivedCurve,
  WorkspaceCurveRole,
  WorkspaceDerived,
} from '../../state/workspaceStore'

export const GRAPH_SERIES_NAMES = [
  'Source',
  'Target',
  'Source + EQ',
  'PEQ',
  'Desired',
  'Selected Filter',
] as const

export type GraphSeriesName = (typeof GRAPH_SERIES_NAMES)[number]

export interface GraphSeries {
  name: string
  data: [number, number][]
  defaultVisible: boolean
  curveId?: string
  measurementRole?: WorkspaceCurveRole
  markerFrequencyHz?: number
}

export function formatGraphInspector(
  frequencyHz: number,
  series: readonly GraphSeries[],
  selected: Readonly<Record<string, boolean | undefined>>,
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
  name: string,
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
  const source = workspaceDerived.measurementCurves.find(({ role }) => role === 'source')
  const target = workspaceDerived.measurementCurves.find(({ role }) => role === 'target')

  return [
    workspaceDerived.source === null
      ? null
      : {
          ...graphSeries('Source', workspaceDerived.source, true)!,
          curveId: source?.id,
          measurementRole: 'source' as const,
        },
    workspaceDerived.target === null
      ? null
      : {
          ...graphSeries('Target', workspaceDerived.target, true)!,
          curveId: target?.id,
          measurementRole: 'target' as const,
        },
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
