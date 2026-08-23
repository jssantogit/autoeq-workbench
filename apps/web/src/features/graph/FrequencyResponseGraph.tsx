import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerEChartsModules, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { graphTheme, seriesAppearance } from './graphAppearance'
import {
  buildGraphSeries,
  formatGraphInspector,
  GRAPH_SERIES_NAMES,
} from './graphSeries'

registerEChartsModules([
  LineChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  CanvasRenderer,
])

interface FrequencyResponseGraphProps {
  derived: WorkspaceDerived
}

export interface FrequencyResponseGraphHandle {
  resetView: () => void
}

interface EChartsInteractionOption {
  legend?: { selected?: Record<string, boolean> }[]
  dataZoom?: {
    start?: number
    end?: number
    startValue?: number
    endValue?: number
  }[]
}

function dataZoomInteraction(
  option: EChartsInteractionOption,
  index: number,
): NonNullable<EChartsInteractionOption['dataZoom']>[number] {
  const zoom = option.dataZoom?.[index]
  if (zoom === undefined) return {}
  return {
    ...(zoom.start === undefined ? {} : { start: zoom.start }),
    ...(zoom.end === undefined ? {} : { end: zoom.end }),
    ...(zoom.startValue === undefined ? {} : { startValue: zoom.startValue }),
    ...(zoom.endValue === undefined ? {} : { endValue: zoom.endValue }),
  }
}

function tooltipFrequency(params: unknown): number | null {
  const first = Array.isArray(params) ? params[0] : params
  if (typeof first !== 'object' || first === null || !('axisValue' in first)) return null
  const frequencyHz = Number(first.axisValue)
  return Number.isFinite(frequencyHz) && frequencyHz > 0 ? frequencyHz : null
}

export const FrequencyResponseGraph = forwardRef<
  FrequencyResponseGraphHandle,
  FrequencyResponseGraphProps
>(function FrequencyResponseGraph({ derived }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const renderedSeriesRef = useRef<Set<string>>(new Set())
  const theme = useUiStore((state) => state.theme)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const uiVisibilityRef = useRef<Record<string, boolean>>({})

  useImperativeHandle(ref, () => ({
    resetView: () => {
      chartRef.current?.dispatchAction({ type: 'restore' })
      chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
    },
  }), [])

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
    const graphSeries = buildGraphSeries(derived)
    const sourceCurveId = derived.measurementCurves.find(({ role }) => role === 'source')?.id
    const appearanceInput = { theme, curveAppearance, sourceCurveId }
    const colors = graphTheme(theme)
    const interactionOption = (chart.getOption() ?? {}) as EChartsInteractionOption
    const previousSelected = interactionOption.legend?.[0]?.selected ?? {}
    const previousUiVisibility = uiVisibilityRef.current
    const selected = Object.fromEntries(
      GRAPH_SERIES_NAMES.map((name) => {
        const series = graphSeries.find((item) => item.name === name)
        const curveId = series?.curveId
        const uiVisible = curveId === undefined ? undefined : curveAppearance[curveId]?.visible
        const uiVisibilityChanged = curveId !== undefined &&
          previousUiVisibility[curveId] !== undefined &&
          uiVisible !== previousUiVisibility[curveId]
        const visible =
          uiVisible !== undefined && uiVisibilityChanged
            ? uiVisible
            : renderedSeriesRef.current.has(name) && previousSelected[name] !== undefined
              ? previousSelected[name]
              : (uiVisible ?? graphSeries.find((series) => series.name === name)?.defaultVisible ?? false)
        return [name, visible]
      }),
    ) as Record<string, boolean>
    const insideZoom = dataZoomInteraction(interactionOption, 0)
    const sliderZoom = dataZoomInteraction(interactionOption, 1)

    chart.setOption(
      {
        animation: false,
        backgroundColor: colors.background,
        grid: { left: 58, right: 22, top: 48, bottom: 58 },
        legend: {
          data: GRAPH_SERIES_NAMES,
          selected,
          top: 10,
          textStyle: { color: colors.legend, fontSize: 11 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross', snap: false },
          formatter: (params: unknown) => {
            const frequencyHz = tooltipFrequency(params)
            if (frequencyHz === null) return ''
            const currentOption = (chart.getOption() ?? {}) as EChartsInteractionOption
            const currentSelected = currentOption.legend?.[0]?.selected ?? selected
            return formatGraphInspector(frequencyHz, graphSeries, currentSelected)
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
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', ...insideZoom },
          {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
            height: 16,
            bottom: 12,
            borderColor: colors.zoomBorder,
            fillerColor: colors.zoomFill,
            textStyle: { color: colors.axis },
            dataBackground: { lineStyle: { color: colors.axis, opacity: 0.25 } },
            ...sliderZoom,
          },
        ],
        series: graphSeries.map((series) => {
          const appearance = seriesAppearance(series.name, appearanceInput, series)
          return {
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
            markLine:
              series.markerFrequencyHz === undefined
                ? undefined
                : {
                    symbol: 'none',
                    label: { formatter: `${series.markerFrequencyHz} Hz`, color: colors.marker },
                    lineStyle: { color: colors.marker, type: 'dashed', width: 1 },
                    data: [{ xAxis: series.markerFrequencyHz }],
                  },
          }
        }),
      },
      { notMerge: true },
    )
    renderedSeriesRef.current = new Set(graphSeries.map(({ name }) => name))
    uiVisibilityRef.current = Object.fromEntries(
      Object.entries(curveAppearance).map(([id, { visible }]) => [id, visible]),
    )
  }, [curveAppearance, derived, theme])

  return (
    <section className="graph-panel" aria-labelledby="fr-graph-heading">
      <div className="graph-panel__header">
        <div>
          <h2 id="fr-graph-heading">Frequency Response</h2>
          <p className={`graph-status graph-status--${derived.status}`} role="status">
            {derived.message}
          </p>
        </div>
      </div>
      <div
        ref={containerRef}
        className="fr-graph"
        role="img"
        aria-label="Frequency response graph from 20 Hz to 20 kHz"
      />
    </section>
  )
})
