import { LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { init, use as registerEChartsModules, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { graphTheme, seriesAppearance } from './graphAppearance'
import { buildGraphSeries, formatGraphInspector } from './graphSeries'

registerEChartsModules([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

interface FrequencyResponseGraphProps {
  derived: WorkspaceDerived
}

function tooltipFrequency(params: unknown): number | null {
  const first = Array.isArray(params) ? params[0] : params
  if (typeof first !== 'object' || first === null || !('axisValue' in first)) return null
  const frequencyHz = Number(first.axisValue)
  return Number.isFinite(frequencyHz) && frequencyHz > 0 ? frequencyHz : null
}

export function FrequencyResponseGraph({ derived }: FrequencyResponseGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const theme = useUiStore((state) => state.theme)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const sourceCurveId = derived.measurementCurves.find(({ role }) => role === 'source')?.id
  const appearanceInput = { theme, curveAppearance, sourceCurveId }
  const visibleSeries = buildGraphSeries(derived).filter((series) =>
    series.kind === 'measurement'
      ? (curveAppearance[series.curveId]?.visible ?? true)
      : series.defaultVisible,
  )
  const presentedSeries = visibleSeries.map((series) => ({
    series,
    appearance: seriesAppearance(series.name, appearanceInput, series),
  }))

  useEffect(() => {
    if (containerRef.current === null) return
    const chart = init(containerRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) return
    const colors = graphTheme(theme)

    chart.setOption(
      {
        animation: false,
        backgroundColor: colors.background,
        grid: { left: 54, right: 18, top: 18, bottom: 38 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross', snap: false },
          formatter: (params: unknown) => {
            const frequencyHz = tooltipFrequency(params)
            return frequencyHz === null ? '' : formatGraphInspector(frequencyHz, visibleSeries)
          },
        },
        xAxis: {
          type: 'log',
          min: 20,
          max: 20_000,
          name: 'Hz',
          nameTextStyle: { color: colors.axis },
          minorTick: { show: true },
          minorSplitLine: { show: true, lineStyle: { color: colors.minorGrid } },
          axisLine: { lineStyle: { color: colors.axis } },
          axisLabel: { color: colors.axis },
          splitLine: { lineStyle: { color: colors.majorGrid } },
        },
        yAxis: {
          type: 'value',
          name: 'dB',
          scale: true,
          nameTextStyle: { color: colors.axis },
          axisLine: { lineStyle: { color: colors.axis } },
          axisLabel: { color: colors.axis, formatter: '{value} dB' },
          splitLine: { lineStyle: { color: colors.majorGrid } },
        },
        series: presentedSeries.map(({ series, appearance }) => ({
          id: series.id,
          name: series.name,
          type: 'line',
          data: series.data,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: {
            color: appearance.color,
            width: appearance.lineWidth,
            type: appearance.lineType,
            opacity: appearance.opacity,
          },
          itemStyle: { color: appearance.color, opacity: appearance.opacity },
          emphasis: { focus: 'series' },
          markLine: series.markerFrequencyHz === undefined
            ? undefined
            : {
                symbol: 'none',
                label: { formatter: `${series.markerFrequencyHz} Hz`, color: colors.marker },
                lineStyle: { color: colors.marker, type: 'dashed', width: 1 },
                data: [{ xAxis: series.markerFrequencyHz }],
              },
        })),
      },
      { notMerge: true },
    )
  }, [presentedSeries, theme, visibleSeries])

  return (
    <section className="graph-panel" aria-label="Frequency response graph">
      <div className="graph-meta">
        <p className={`graph-status graph-status--${derived.status}`} role="status">
          {derived.message}
        </p>
        <ul className="graph-labels" aria-label="Visible graph series">
          {presentedSeries.map(({ series, appearance }) => (
            <li key={series.id} style={{ color: appearance.color }}>{series.name}</li>
          ))}
        </ul>
      </div>
      <div
        ref={containerRef}
        className="fr-graph"
        role="img"
        aria-label="Frequency response graph from 20 Hz to 20 kHz"
      />
    </section>
  )
}
