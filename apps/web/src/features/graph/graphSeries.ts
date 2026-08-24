import type { CurveKind } from '@autoeq-workbench/core'
import type {
  DerivedCurve,
  WorkspaceDerived,
} from '../../state/workspaceStore'
import {
  evaluateNaturalSpline,
  evaluateNaturalSplineSegments,
  type NaturalSplineSegment,
} from './graphGeometry'

interface GraphSeriesBase {
  id: string
  name: string
  data: readonly [number, number][]
  defaultVisible: boolean
}

export interface MeasurementGraphSeries extends GraphSeriesBase {
  kind: 'measurement'
  curveId: string
  measurementKind: CurveKind
  active: boolean
}

export interface EqualizedFrGraphSeries extends GraphSeriesBase {
  kind: 'equalized-fr'
  sourceCurveId: string
  curveId?: never
  measurementKind?: never
  active?: never
}

export type GraphSeries = MeasurementGraphSeries | EqualizedFrGraphSeries

export interface GraphInspector {
  frequencyHz: number
  frequencyLabel: string
  values: { id: string; name: string; db: number }[]
}

export function formatGraphInspector(
  frequencyHz: number,
  series: readonly GraphSeries[],
  preparedSegments?: ReadonlyMap<string, readonly NaturalSplineSegment[]>,
): GraphInspector {
  const frequency =
    frequencyHz >= 1_000 ? `${(frequencyHz / 1_000).toFixed(2)} kHz` : `${frequencyHz.toFixed(0)} Hz`
  const values = series.flatMap((item) => {
    if (item.data.length < 2) return []
    const segments = preparedSegments?.get(item.id)
    const db = segments === undefined
      ? evaluateNaturalSpline(item.data, frequencyHz)
      : evaluateNaturalSplineSegments(segments, frequencyHz)
    if (db === null) return []
    return [{ id: item.id, name: item.name, db }]
  })

  return { frequencyHz, frequencyLabel: frequency, values }
}

export function formatEqualizedFrName(name: string): string {
  return `${name.replace(/\.(txt|csv)$/i, '')} EQ`
}

function equalizedFrSeries(
  source: WorkspaceDerived['measurementCurves'][number],
  curve: DerivedCurve,
): EqualizedFrGraphSeries {
  return {
    id: 'fr-eq',
    name: formatEqualizedFrName(source.name),
    kind: 'equalized-fr',
    data: curve.frequencies.map((frequency, index) => [frequency, curve.db[index]!] as const),
    defaultVisible: true,
    sourceCurveId: source.id,
  }
}

export function buildGraphSeries(workspaceDerived: WorkspaceDerived): GraphSeries[] {
  const series: GraphSeries[] = []
  for (const curve of workspaceDerived.measurementCurves) {
    series.push({
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
    })
    if (
      curve.id === workspaceDerived.activeFrId &&
      workspaceDerived.hasFilters &&
      workspaceDerived.frEq !== null
    ) {
      series.push(equalizedFrSeries(curve, workspaceDerived.frEq))
    }
  }
  return series
}
