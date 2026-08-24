import type { CurveKind } from '@autoeq-workbench/core'
import type {
  DerivedCurve,
  WorkspaceDerived,
} from '../../state/workspaceStore'
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
