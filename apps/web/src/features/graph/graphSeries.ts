import type { DerivedCurve, WorkspaceDerived } from '../../state/workspaceStore'

export type GraphSeriesName = 'Source' | 'Target' | 'Source + EQ' | 'PEQ' | 'Desired'

export interface GraphSeries {
  name: GraphSeriesName
  data: [number, number][]
  defaultVisible: boolean
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
  ].filter((series): series is GraphSeries => series !== null)
}
