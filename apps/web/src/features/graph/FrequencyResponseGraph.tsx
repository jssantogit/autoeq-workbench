import { useId, useState, type PointerEvent } from 'react'
import { useUiStore } from '../../state/uiStore'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { graphTheme, seriesAppearance } from './graphAppearance'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  PLOT_BOTTOM,
  PLOT_LEFT,
  PLOT_RIGHT,
  PLOT_TOP,
  createNaturalSplinePath,
  frequencyToX,
  generateXTicks,
  generateYTicks,
  xToFrequency,
  yDbToY,
} from './graphGeometry'
import { buildGraphSeries, formatGraphInspector, type GraphInspector } from './graphSeries'

interface FrequencyResponseGraphProps {
  derived: WorkspaceDerived
}

interface PointerInspector {
  x: number
  details: GraphInspector
}

const MAX_INTERNAL_LABELS = 8
const MAX_INSPECTOR_VALUES = 6

function dashArray(lineType: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (lineType === 'dashed') return '7 5'
  if (lineType === 'dotted') return '2 4'
  return undefined
}

function markerLabel(frequencyHz: number): string {
  return frequencyHz >= 1_000 ? `${frequencyHz / 1_000}kHz` : `${frequencyHz}Hz`
}

export function FrequencyResponseGraph({ derived }: FrequencyResponseGraphProps) {
  const clipId = `graph-clip-${useId().replaceAll(':', '')}`
  const [inspector, setInspector] = useState<PointerInspector | null>(null)
  const theme = useUiStore((state) => state.theme)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const appearanceInput = { theme, curveAppearance, frCurveId: derived.activeFrId ?? undefined }
  const visibleSeries = buildGraphSeries(derived).filter((series) =>
    series.kind === 'measurement'
      ? (curveAppearance[series.curveId]?.visible ?? true)
      : series.defaultVisible,
  )
  const presentedSeries = visibleSeries.map((series) => ({
    series,
    appearance: seriesAppearance(series.name, appearanceInput, series),
  }))
  const colors = graphTheme(theme)
  const xTicks = generateXTicks()
  const yTicks = generateYTicks()
  const selectedFrequency = visibleSeries.find(({ markerFrequencyHz }) => markerFrequencyHz !== undefined)
    ?.markerFrequencyHz
  const internalLabels = presentedSeries.slice(0, MAX_INTERNAL_LABELS)
  const overflowCount = presentedSeries.length - internalLabels.length

  function inspectPointer(event: PointerEvent<SVGRectElement>): void {
    if (!inspectorEnabled) return
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (bounds === undefined || bounds.width <= 0) return
    const viewBoxX = (event.clientX - bounds.left) / bounds.width * GRAPH_WIDTH
    const x = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, viewBoxX))
    setInspector({ x, details: formatGraphInspector(xToFrequency(x), visibleSeries) })
  }

  const tooltipWidth = 170
  const tooltipValues = inspector?.details.values.slice(0, MAX_INSPECTOR_VALUES) ?? []
  const tooltipHeight = 30 + tooltipValues.length * 13 +
    ((inspector?.details.values.length ?? 0) > MAX_INSPECTOR_VALUES ? 13 : 0)
  const tooltipX = inspector === null
    ? PLOT_LEFT
    : Math.min(PLOT_RIGHT - tooltipWidth - 4, Math.max(PLOT_LEFT + 4, inspector.x + 8))

  return (
    <section className="graph-panel" aria-label="Frequency response graph">
      <svg
        className="fr-graph"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        role="img"
        aria-label="Frequency response graph from 20 Hz to 20 kHz"
        style={{ aspectRatio: `${GRAPH_WIDTH} / ${GRAPH_HEIGHT}`, width: '100%', height: 'auto' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} />
          </clipPath>
        </defs>
        <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill={colors.background} />
        <g aria-hidden="true">
          {xTicks.map((tick) => {
            const x = frequencyToX(tick.frequencyHz)
            return (
              <g key={tick.frequencyHz}>
                <line
                  data-x-grid={tick.frequencyHz}
                  x1={x} x2={x} y1={PLOT_TOP} y2={PLOT_BOTTOM}
                  stroke={tick.importance >= 2 ? colors.majorGrid : colors.minorGrid}
                  strokeWidth={tick.strokeWidth}
                />
                {tick.label !== null && (
                  <text
                    x={x} y={339} fill={colors.axis} fontSize={10}
                    textAnchor={tick.frequencyHz === 20 ? 'start' : tick.frequencyHz === 20_000 ? 'end' : 'middle'}
                  >{tick.label}</text>
                )}
              </g>
            )
          })}
          {yTicks.map((tick) => {
            const y = yDbToY(tick.db)
            return (
              <g key={tick.db}>
                <line
                  data-y-grid={tick.db}
                  data-emphasis={tick.emphasis}
                  x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y}
                  stroke={tick.emphasis === 'zero' ? colors.axis : colors.majorGrid}
                  strokeWidth={tick.emphasis === 'zero' ? 1.2 : 0.55}
                />
                <text x={PLOT_LEFT + 4} y={y - 3} fill={colors.axis} fontSize={9}>{tick.db}</text>
              </g>
            )
          })}
        </g>
        <g clipPath={`url(#${clipId})`}>
          {presentedSeries.map(({ series, appearance }) => (
            <path
              key={series.id}
              data-series-name={series.name}
              d={createNaturalSplinePath(series.data)}
              fill="none"
              stroke={appearance.color}
              strokeWidth={appearance.lineWidth}
              strokeDasharray={dashArray(appearance.lineType)}
              strokeOpacity={appearance.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {selectedFrequency !== undefined && (
            <line
              data-selected-frequency={selectedFrequency}
              x1={frequencyToX(selectedFrequency)} x2={frequencyToX(selectedFrequency)}
              y1={PLOT_TOP} y2={PLOT_BOTTOM}
              stroke={colors.marker} strokeWidth={1} strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
        {selectedFrequency !== undefined && (
          <text
            x={frequencyToX(selectedFrequency) + 4} y={PLOT_TOP + 12}
            fill={colors.marker} fontSize={9}
          >{markerLabel(selectedFrequency)}</text>
        )}
        <g aria-label="Visible graph series" pointerEvents="none">
          {internalLabels.map(({ series, appearance }, index) => (
            <text
              key={series.id} x={PLOT_LEFT + 7} y={PLOT_BOTTOM - 8 - index * 12}
              fill={appearance.color} fontSize={10} fontWeight={650}
            >{series.name}</text>
          ))}
          {overflowCount > 0 && (
            <text x={PLOT_LEFT + 7} y={PLOT_BOTTOM - 8 - internalLabels.length * 12} fill={colors.axis} fontSize={9}>
              +{overflowCount} more
            </text>
          )}
        </g>
        <text
          data-graph-status
          role="status"
          x={PLOT_LEFT + 7} y={PLOT_TOP + 12}
          fill={derived.status === 'coverage-error' ? '#b42318' : colors.axis}
          fontSize={9}
        >{derived.message}</text>
        {inspectorEnabled && inspector !== null && (
          <g pointerEvents="none">
            <line
              data-inspector-crosshair
              x1={inspector.x} x2={inspector.x} y1={PLOT_TOP} y2={PLOT_BOTTOM}
              stroke={colors.marker} strokeWidth={0.8} strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <g data-inspector-tooltip transform={`translate(${tooltipX} ${PLOT_TOP + 18})`}>
              <rect width={tooltipWidth} height={tooltipHeight} rx={3} fill={colors.background} fillOpacity={0.94} stroke={colors.majorGrid} />
              <text x={7} y={13} fill={colors.marker} fontSize={10} fontWeight={700}>
                {inspector.details.frequencyLabel}
              </text>
              {tooltipValues.map((value, index) => {
                const appearance = presentedSeries.find(({ series }) => series.id === value.id)?.appearance
                return (
                  <text key={value.id} x={7} y={27 + index * 13} fill={appearance?.color ?? colors.axis} fontSize={9}>
                    {value.name}: {value.db.toFixed(2)} dB
                  </text>
                )
              })}
              {inspector.details.values.length > MAX_INSPECTOR_VALUES && (
                <text x={7} y={27 + tooltipValues.length * 13} fill={colors.axis} fontSize={9}>
                  +{inspector.details.values.length - MAX_INSPECTOR_VALUES} more
                </text>
              )}
            </g>
          </g>
        )}
        <rect
          data-inspector-hit-area
          x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP}
          fill="transparent"
          onPointerMove={inspectPointer}
          onPointerLeave={() => setInspector(null)}
        />
      </svg>
    </section>
  )
}
