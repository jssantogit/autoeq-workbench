import type { CurveAppearance, ThemeMode } from '../../state/uiStore'
import { MEASUREMENT_CURVE_PALETTE } from '../../state/uiStore'
import type { GraphSeries } from './graphSeries'

export interface GraphAppearanceInput {
  theme: ThemeMode
  curveAppearance: Record<string, CurveAppearance>
}

const GRAPH_THEMES = {
  light: {
    background: '#fffefa',
    axis: '#7b7b76',
    majorGrid: '#d8d8d3',
    minorGrid: '#ecece7',
    marker: '#2f3437',
    inactiveTarget: '#989894',
  },
  dark: {
    background: '#0b1012',
    axis: '#96918c',
    majorGrid: '#2a3032',
    minorGrid: '#1b2123',
    marker: '#f3efe8',
    inactiveTarget: '#8f8e8a',
  },
} as const

export function graphTheme(theme: ThemeMode) {
  return GRAPH_THEMES[theme]
}

export function pickEqualizedFrColor(sourceColor: string): string {
  const normalizedSource = sourceColor.toLowerCase()
  return MEASUREMENT_CURVE_PALETTE.find((color) => color.toLowerCase() !== normalizedSource)!
}

export function seriesAppearance(
  series: GraphSeries,
  input: GraphAppearanceInput,
) {
  const base = { lineType: 'solid' as const, lineWidth: 1.35, opacity: 1 }

  if (series.kind === 'measurement') {
    const measurementColor = input.curveAppearance[series.curveId]?.color
    return series.measurementKind === 'target'
      ? {
          color: graphTheme(input.theme).inactiveTarget,
          lineType: 'dashed' as const,
          lineWidth: 1.1,
          opacity: 0.82,
        }
      : { ...base, color: measurementColor ?? '#1565c0' }
  }

  const sourceColor = input.curveAppearance[series.sourceCurveId]?.color ?? '#1565c0'
  return {
    color: pickEqualizedFrColor(sourceColor),
    lineType: 'solid' as const,
    lineWidth: 1.6,
    opacity: 0.96,
  }
}
