import { useEffect, useMemo, useRef, useState } from 'react'
import { buildDisplaySeries } from '../../squiglink/graph/displayTransform'
import { createSquiglinkGraph } from '../../squiglink/graph/createSquiglinkGraph'
import type {
  SquiglinkGraphController,
  SquiglinkGraphState,
  SquiglinkInspectorReading,
} from '../../squiglink/graph/types'
import { useUiStore } from '../../state/uiStore'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { graphTheme, seriesAppearance } from './graphAppearance'
import { buildGraphSeries, EQUALIZED_FR_APPEARANCE_ID } from './graphSeries'

interface FrequencyResponseGraphProps {
  derived: WorkspaceDerived
}

const COMPACT_GRAPH_QUERY = '(max-width: 430px)'

function useCompactGraphPresentation(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(COMPACT_GRAPH_QUERY).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(COMPACT_GRAPH_QUERY)
    const update = () => setCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return compact
}

function formatInspectorAnnouncement(reading: SquiglinkInspectorReading | null): string {
  if (reading === null) return ''
  const frequency = reading.frequencyHz >= 1_000
    ? `${(reading.frequencyHz / 1_000).toFixed(2)} kHz`
    : `${reading.frequencyHz.toFixed(0)} Hz`
  return [
    frequency,
    ...reading.values.map(({ name, db }) => `${name}: ${db.toFixed(2)} dB`),
  ].join('. ')
}

export function FrequencyResponseGraph({ derived }: FrequencyResponseGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const controllerRef = useRef<SquiglinkGraphController | null>(null)
  const [inspectorReading, setInspectorReading] = useState<SquiglinkInspectorReading | null>(null)
  const compact = useCompactGraphPresentation()
  const theme = useUiStore((state) => state.theme)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const graphZoomPreset = useUiStore((state) => state.graphZoomPreset)
  const smoothingLevel = useUiStore((state) => state.smoothingLevel)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const labelsEnabled = useUiStore((state) => state.labelsEnabled)
  const baselineCurveId = useUiStore((state) => state.baselineCurveId)

  const graphState = useMemo<SquiglinkGraphState>(() => {
    const semantic = buildGraphSeries(derived)
    const display = buildDisplaySeries(semantic, curveAppearance, baselineCurveId)
    const colors = graphTheme(theme)
    return {
      series: display.map((item) => {
        const appearance = seriesAppearance(item, { theme, curveAppearance })
        const appearanceId = item.kind === 'equalized-fr' ? EQUALIZED_FR_APPEARANCE_ID : item.curveId
        return {
          id: item.id,
          name: item.name,
          data: item.displayData,
          color: appearance.color,
          dashed: appearance.lineType === 'dashed',
          visible: item.defaultVisible && (curveAppearance[appearanceId]?.visible ?? true),
          lineWidth: appearance.lineWidth,
          opacity: appearance.opacity,
        }
      }),
      view: {
        zoom: graphZoomPreset,
        smoothingLevel,
        inspectorEnabled,
        labelsEnabled,
        presentation: compact ? 'compact' : 'desktop',
      },
      palette: {
        background: colors.background,
        axis: colors.axis,
        majorGrid: colors.majorGrid,
        minorGrid: colors.minorGrid,
        marker: colors.marker,
      },
    }
  }, [
    baselineCurveId,
    compact,
    curveAppearance,
    derived,
    graphZoomPreset,
    inspectorEnabled,
    labelsEnabled,
    smoothingLevel,
    theme,
  ])
  const initialGraphStateRef = useRef(graphState)

  useEffect(() => {
    if (svgRef.current === null) return
    const controller = createSquiglinkGraph(svgRef.current, initialGraphStateRef.current, {
      onInspector: setInspectorReading,
    })
    controllerRef.current = controller
    return () => {
      controller.destroy()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.update(graphState)
  }, [graphState])

  return (
    <section className="graph-panel" aria-label="Frequency response graph">
      <svg
        ref={svgRef}
        className="fr-graph"
        data-fr-graph
        data-graph-presentation={compact ? 'compact' : 'desktop'}
        viewBox="0 0 800 346"
        style={{ aspectRatio: '800 / 346', width: '100%', height: 'auto' }}
      />
      <p
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="graph-inspector-status"
      >
        {inspectorEnabled ? formatInspectorAnnouncement(inspectorReading) : ''}
      </p>
    </section>
  )
}
