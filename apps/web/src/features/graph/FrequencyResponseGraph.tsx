import { useEffect, useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
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
  X_MAX_HZ,
  X_MIN_HZ,
  frequencyToX,
  generateXTicks,
  generateYTicks,
  prepareNaturalSpline,
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
const COMPACT_INSPECTOR_NAME_LENGTH = 11
const COMPACT_GRAPH_QUERY = '(max-width: 430px)'
const CURVE_LABEL_BASE_X = PLOT_LEFT + 52

const DESKTOP_PRESENTATION = {
  xAxisFontSize: 10,
  yAxisFontSize: 9,
  markerFontSize: 9,
  curveFontSize: 10,
  curveOverflowFontSize: 9,
  curveLineHeight: 15,
  curveBottomPadding: 20,
  tooltipWidth: 170,
  tooltipBaseHeight: 30,
  tooltipLineHeight: 13,
  tooltipTitleFontSize: 10,
  tooltipValueFontSize: 9,
  tooltipTitleY: 13,
  tooltipValueY: 27,
} as const

const COMPACT_PRESENTATION = {
  xAxisFontSize: 13,
  yAxisFontSize: 12,
  markerFontSize: 13,
  curveFontSize: 19,
  curveOverflowFontSize: 18,
  curveLineHeight: 21,
  curveBottomPadding: 24,
  tooltipWidth: 240,
  tooltipBaseHeight: 48,
  tooltipLineHeight: 22,
  tooltipTitleFontSize: 19,
  tooltipValueFontSize: 18,
  tooltipTitleY: 20,
  tooltipValueY: 43,
} as const

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

function dashArray(lineType: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (lineType === 'dashed') return '7 5'
  if (lineType === 'dotted') return '2 4'
  return undefined
}

function truncateByCharacters(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return '.'.repeat(Math.max(0, maxLength))
  return `${value.slice(0, maxLength - 3)}...`
}

export function FrequencyResponseGraph({ derived }: FrequencyResponseGraphProps) {
  const clipId = `graph-clip-${useId().replaceAll(':', '')}`
  const [inspector, setInspector] = useState<PointerInspector | null>(null)
  const compact = useCompactGraphPresentation()
  const presentation = compact ? COMPACT_PRESENTATION : DESKTOP_PRESENTATION
  const theme = useUiStore((state) => state.theme)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const visibleSeries = useMemo(() => buildGraphSeries(derived).filter((series) =>
    series.kind === 'measurement'
      ? (curveAppearance[series.curveId]?.visible ?? true)
      : series.defaultVisible,
  ), [curveAppearance, derived])
  const presentedSeries = useMemo(() => {
    const appearanceInput = { theme, curveAppearance }
    return visibleSeries.map((series) => ({
      series,
      appearance: seriesAppearance(series, appearanceInput),
      spline: prepareNaturalSpline(series.data),
    }))
  }, [curveAppearance, theme, visibleSeries])
  const preparedSegments = useMemo(() => new Map(
    presentedSeries.map(({ series, spline }) => [series.id, spline.segments] as const),
  ), [presentedSeries])
  const colors = graphTheme(theme)
  const xTicks = generateXTicks()
  const yTicks = generateYTicks()
  const internalLabels = presentedSeries.slice(0, MAX_INTERNAL_LABELS)
  const overflowCount = presentedSeries.length - internalLabels.length

  function inspectAtX(nextX: number): void {
    const x = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, nextX))
    setInspector({ x, details: formatGraphInspector(xToFrequency(x), visibleSeries, preparedSegments) })
  }

  function inspectAtFrequency(frequencyHz: number): void {
    setInspector({
      x: frequencyToX(frequencyHz),
      details: formatGraphInspector(frequencyHz, visibleSeries, preparedSegments),
    })
  }

  function inspectPointer(event: PointerEvent<SVGRectElement>): void {
    if (!inspectorEnabled) return
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (bounds === undefined || bounds.width <= 0) return
    const viewBoxX = (event.clientX - bounds.left) / bounds.width * GRAPH_WIDTH
    inspectAtX(viewBoxX)
  }

  function inspectKeyboard(event: KeyboardEvent<SVGRectElement>): void {
    if (!inspectorEnabled) return
    const step = (PLOT_RIGHT - PLOT_LEFT) / 100
    const currentX = inspector?.x ?? frequencyToX(1_000)
    let nextX: number | null = null
    if (event.key === 'ArrowLeft') nextX = currentX - step
    if (event.key === 'ArrowRight') nextX = currentX + step
    if (event.key === 'Home') nextX = PLOT_LEFT
    if (event.key === 'End') nextX = PLOT_RIGHT
    if (nextX === null) return
    event.preventDefault()
    inspectAtX(nextX)
  }

  const tooltipWidth = presentation.tooltipWidth
  const tooltipValues = inspector?.details.values.slice(0, MAX_INSPECTOR_VALUES) ?? []
  const tooltipHeight = presentation.tooltipBaseHeight +
    tooltipValues.length * presentation.tooltipLineHeight +
    ((inspector?.details.values.length ?? 0) > MAX_INSPECTOR_VALUES
      ? presentation.tooltipLineHeight
      : 0)
  const tooltipX = inspector === null
    ? PLOT_LEFT
    : Math.min(PLOT_RIGHT - tooltipWidth - 4, Math.max(PLOT_LEFT + 4, inspector.x + 8))
  const inspectorAnnouncement = !inspectorEnabled || inspector === null
    ? ''
    : [
        inspector.details.frequencyLabel,
        ...inspector.details.values.map(({ name, db }) => `${name}: ${db.toFixed(2)} dB`),
      ].join('. ')

  return (
    <section className="graph-panel" aria-label="Frequency response graph">
      <svg
        className="fr-graph"
        data-fr-graph
        data-graph-presentation={compact ? 'compact' : 'desktop'}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
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
                    className="graph-axis-label graph-axis-label--x"
                    x={x} y={339} fill={colors.axis} fontSize={presentation.xAxisFontSize}
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
                <text
                  className="graph-axis-label graph-axis-label--y"
                  data-y-label={tick.db}
                  x={PLOT_LEFT + 24} y={y} fill={colors.axis} fontSize={presentation.yAxisFontSize}
                  dominantBaseline={tick.db === 25 ? 'hanging' : tick.db === -30 ? 'auto' : 'middle'}
                >{tick.db}</text>
              </g>
            )
          })}
          <text
            className="graph-axis-label graph-db-label"
            data-db-label
            x={PLOT_LEFT + 4}
            y={PLOT_TOP + 4}
            fill={colors.axis}
            fontSize={presentation.yAxisFontSize}
            dominantBaseline="hanging"
          >dB</text>
        </g>
        <g clipPath={`url(#${clipId})`}>
          {presentedSeries.map(({ series, appearance, spline }) => (
            <path
              key={series.id}
              data-series-name={series.name}
              d={spline.path}
              fill="none"
              stroke={appearance.color}
              strokeWidth={appearance.lineWidth}
              strokeDasharray={dashArray(appearance.lineType)}
              strokeOpacity={appearance.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g aria-label="Visible graph series" pointerEvents="none">
          {internalLabels.map(({ series, appearance }, index) => {
            const y = PLOT_BOTTOM - presentation.curveBottomPadding -
              index * presentation.curveLineHeight
            const target = series.kind === 'measurement' && series.measurementKind === 'target'
            return (
              <g key={series.id}>
                {target && (
                  <line
                    data-target-label-sample={series.curveId}
                    x1={CURVE_LABEL_BASE_X} x2={CURVE_LABEL_BASE_X + 30} y1={y - 3} y2={y - 3}
                    stroke={appearance.color} strokeWidth={appearance.lineWidth}
                    strokeDasharray={dashArray(appearance.lineType)}
                    strokeOpacity={appearance.opacity}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <text
                  className="graph-curve-label"
                  data-curve-label={series.id}
                  x={target ? CURVE_LABEL_BASE_X + 35 : CURVE_LABEL_BASE_X} y={y}
                  fill={appearance.color} fontSize={presentation.curveFontSize} fontWeight={650}
                >{series.name}</text>
              </g>
            )
          })}
          {overflowCount > 0 && (
            <text
              className="graph-curve-label graph-curve-label--overflow"
              x={CURVE_LABEL_BASE_X}
              y={PLOT_BOTTOM - presentation.curveBottomPadding -
                internalLabels.length * presentation.curveLineHeight}
              fill={colors.axis} fontSize={presentation.curveOverflowFontSize}
            >
              +{overflowCount} more
            </text>
          )}
        </g>
        {inspectorEnabled && inspector !== null && (
          <g pointerEvents="none">
            <line
              data-inspector-crosshair
              x1={inspector.x} x2={inspector.x} y1={PLOT_TOP} y2={PLOT_BOTTOM}
              stroke={colors.marker} strokeWidth={0.8} strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <g data-inspector-tooltip transform={`translate(${tooltipX} ${PLOT_TOP + 18})`}>
              <rect data-inspector-tooltip-box width={tooltipWidth} height={tooltipHeight} rx={3} fill={colors.background} fillOpacity={0.94} stroke={colors.majorGrid} />
              <text className="graph-tooltip-label" x={7} y={presentation.tooltipTitleY} fill={colors.marker} fontSize={presentation.tooltipTitleFontSize} fontWeight={700}>
                {inspector.details.frequencyLabel}
              </text>
              {tooltipValues.map((value, index) => {
                const appearance = presentedSeries.find(({ series }) => series.id === value.id)?.appearance
                const y = presentation.tooltipValueY + index * presentation.tooltipLineHeight
                if (compact) {
                  return (
                    <g
                      className="graph-tooltip-value"
                      data-inspector-value-row
                      key={value.id}
                      fill={appearance?.color ?? colors.axis}
                      fontSize={presentation.tooltipValueFontSize}
                    >
                      <text data-inspector-value-name x={7} y={y}>
                        <title>{value.name}</title>
                        {truncateByCharacters(value.name, COMPACT_INSPECTOR_NAME_LENGTH)}
                      </text>
                      <text
                        data-inspector-value-number
                        x={tooltipWidth - 7}
                        y={y}
                        textAnchor="end"
                      >
                        {value.db.toFixed(2)} dB
                      </text>
                    </g>
                  )
                }
                return (
                  <text className="graph-tooltip-value" key={value.id} x={7} y={y} fill={appearance?.color ?? colors.axis} fontSize={presentation.tooltipValueFontSize}>
                    {value.name}: {value.db.toFixed(2)} dB
                  </text>
                )
              })}
              {inspector.details.values.length > MAX_INSPECTOR_VALUES && (
                <text className="graph-tooltip-value" x={7} y={presentation.tooltipValueY + tooltipValues.length * presentation.tooltipLineHeight} fill={colors.axis} fontSize={presentation.tooltipValueFontSize}>
                  +{inspector.details.values.length - MAX_INSPECTOR_VALUES} more
                </text>
              )}
            </g>
          </g>
        )}
        <rect
          data-inspector-hit-area
          role="slider"
          aria-label="Inspect graph frequency"
          aria-valuemin={X_MIN_HZ}
          aria-valuemax={X_MAX_HZ}
          aria-valuenow={Math.round(inspector?.details.frequencyHz ?? 1_000)}
          aria-valuetext={inspector?.details.frequencyLabel ?? '1.00 kHz'}
          aria-disabled={!inspectorEnabled}
          tabIndex={inspectorEnabled ? 0 : -1}
          x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP}
          fill="transparent"
          onPointerMove={inspectPointer}
          onPointerLeave={() => setInspector(null)}
          onFocus={() => inspectorEnabled && inspector === null && inspectAtFrequency(1_000)}
          onKeyDown={inspectKeyboard}
        />
      </svg>
      <p
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="graph-inspector-status"
      >
        {inspectorAnnouncement}
      </p>
    </section>
  )
}
