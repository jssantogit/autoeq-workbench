import type { GraphZoomPreset } from '../../state/uiStore'

export interface SquiglinkGraphSeries {
  id: string
  name: string
  data: readonly [number, number][]
  color: string
  dashed: boolean
  visible: boolean
  lineWidth?: number
  opacity?: number
}

export interface SquiglinkGraphView {
  zoom: GraphZoomPreset
  smoothingLevel: number
  inspectorEnabled: boolean
  labelsEnabled: boolean
  presentation?: 'desktop' | 'compact'
}

export interface SquiglinkGraphPalette {
  background: string
  axis: string
  majorGrid: string
  minorGrid: string
  marker: string
}

export interface SquiglinkInspectorReading {
  frequencyHz: number
  values: readonly { id: string; name: string; db: number }[]
}

export interface SquiglinkGraphState {
  series: readonly SquiglinkGraphSeries[]
  view: SquiglinkGraphView
  palette?: SquiglinkGraphPalette
}

export interface SquiglinkGraphController {
  update(next: SquiglinkGraphState): void
  destroy(): void
}
