import type { CurveKind } from '@autoeq-workbench/core'
import type {
  DerivedCurve,
  WorkspaceDerived,
} from '../../state/workspaceStore'
import { evaluateNaturalSpline } from './graphGeometry'

interface GraphSeriesBase {
  id: string
  name: string
  data: [number, number][]
  defaultVisible: boolean
  markerFrequencyHz?: number
}

export interface MeasurementGraphSeries extends GraphSeriesBase {
  kind: 'measurement'
  curveId: string
  measurementKind: CurveKind
  active: boolean
}

export interface DerivedGraphSeries extends GraphSeriesBase {
  kind: 'derived'
  curveId?: never
  measurementKind?: never
  active?: never
}

export type GraphSeries = MeasurementGraphSeries | DerivedGraphSeries

export interface GraphInspector {
  frequencyHz: number
  frequencyLabel: string
  values: { id: string; name: string; db: number }[]
}

export function formatGraphInspector(
  frequencyHz: number,
  series: readonly GraphSeries[],
): GraphInspector {
  const frequency =
    frequencyHz >= 1_000 ? `${(frequencyHz / 1_000).toFixed(2)} kHz` : `${frequencyHz.toFixed(0)} Hz`
  const values = series.flatMap((item) => {
    if (item.data.length < 2) return []
    const firstFrequency = item.data[0]![0]
    const lastFrequency = item.data[item.data.length - 1]![0]
    if (frequencyHz < firstFrequency || frequencyHz > lastFrequency) return []
    const db = evaluateNaturalSpline(item.data, frequencyHz)
    if (db === null) return []
    return [{ id: item.id, name: item.name, db }]
  })

  return { frequencyHz, frequencyLabel: frequency, values }
}

function graphSeries(
  id: string,
  name: string,
  curve: DerivedCurve | null,
  defaultVisible: boolean,
): DerivedGraphSeries | null {
  if (curve === null) return null
  return {
    id,
    name,
    kind: 'derived',
    data: curve.frequencies.map((frequency, index) => [frequency, curve.db[index]!] as const),
    defaultVisible,
  }
}

export function buildGraphSeries(workspaceDerived: WorkspaceDerived): GraphSeries[] {
  return [
    ...workspaceDerived.measurementCurves.map((curve) => ({
      id: curve.id,
      name: curve.name,
      kind: 'measurement' as const,
      data: curve.frequencies.map((frequency, index) => [frequency, curve.db[index]!] as [number, number]),
      defaultVisible: true,
      curveId: curve.id,
      measurementKind: curve.kind,
      active:
        curve.kind === 'fr'
          ? curve.id === workspaceDerived.activeFrId
          : curve.id === workspaceDerived.activeTargetId,
    })),
    graphSeries(
      'fr-eq',
      'FR + EQ',
      workspaceDerived.hasFilters ? workspaceDerived.frEq : null,
      true,
    ),
    graphSeries('peq', 'PEQ', workspaceDerived.peq, false),
    graphSeries('desired', 'Desired', workspaceDerived.desired, false),
    workspaceDerived.selectedFilter === null
      ? null
      : {
          ...graphSeries('selected-filter', 'Selected Filter', workspaceDerived.selectedFilter, true)!,
          markerFrequencyHz: workspaceDerived.selectedFilter.frequencyHz,
        },
  ].filter((series): series is GraphSeries => series !== null)
}
