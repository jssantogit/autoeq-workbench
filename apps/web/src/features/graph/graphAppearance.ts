import type { CurveAppearance, ThemeMode } from '../../state/uiStore'
import type { GraphSeries } from './graphSeries'

export interface GraphAppearanceInput {
  theme: ThemeMode
  curveAppearance: Record<string, CurveAppearance>
  sourceCurveId?: string
}

const GRAPH_THEMES = {
  light: {
    background: '#fffefa',
    axis: '#7b7b76',
    majorGrid: '#d8d8d3',
    minorGrid: '#ecece7',
    legend: '#756e67',
    zoomBorder: '#b9afa2',
    zoomFill: 'rgba(152, 152, 148, 0.12)',
    marker: '#2f3437',
    referenceTarget: '#989894',
  },
  dark: {
    background: '#0b1012',
    axis: '#96918c',
    majorGrid: '#2a3032',
    minorGrid: '#1b2123',
    legend: '#aaa29a',
    zoomBorder: '#465055',
    zoomFill: 'rgba(143, 142, 138, 0.12)',
    marker: '#f3efe8',
    referenceTarget: '#8f8e8a',
  },
} as const

const DERIVED_COLORS = {
  light: { peq: '#7257a6', desired: '#b54f67', selectedFilter: '#2f3437' },
  dark: { peq: '#aa8ddd', desired: '#e07a91', selectedFilter: '#f3efe8' },
} as const

export function graphTheme(theme: ThemeMode) {
  return GRAPH_THEMES[theme]
}

export function seriesAppearance(
  name: string,
  input: GraphAppearanceInput,
  series?: Pick<GraphSeries, 'curveId' | 'measurementRole'>,
) {
  const derived = DERIVED_COLORS[input.theme]
  const base = { lineType: 'solid' as const, lineWidth: 2, opacity: 1 }
  const measurementColor = series?.curveId === undefined
    ? undefined
    : input.curveAppearance[series.curveId]?.color

  if (series?.measurementRole !== undefined) {
    return series.measurementRole === 'reference'
      ? {
          color: graphTheme(input.theme).referenceTarget,
          lineType: 'dashed' as const,
          lineWidth: 1.6,
          opacity: 0.82,
        }
      : { ...base, color: measurementColor ?? '#1565c0' }
  }

  switch (name) {
    case 'Source + EQ':
      return {
        color: input.sourceCurveId === undefined
          ? '#1565c0'
          : (input.curveAppearance[input.sourceCurveId]?.color ?? '#1565c0'),
        lineType: 'solid' as const,
        lineWidth: 2.5,
        opacity: 0.72,
      }
    case 'PEQ':
      return { color: derived.peq, lineType: 'dashed' as const, lineWidth: 1.4, opacity: 0.9 }
    case 'Desired':
      return { color: derived.desired, lineType: 'dotted' as const, lineWidth: 1.4, opacity: 0.9 }
    case 'Selected Filter':
      return { ...base, color: derived.selectedFilter, lineWidth: 1.6 }
    default:
      return { ...base, color: measurementColor ?? '#1565c0' }
  }
}
