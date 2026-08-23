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
import { useEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { buildGraphSeries, formatGraphInspector, type GraphSeriesName } from './graphSeries'

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

const legendNames: GraphSeriesName[] = [
  'Source',
  'Target',
  'Source + EQ',
  'PEQ',
  'Desired',
  'Selected Filter',
]

const seriesColors: Record<GraphSeriesName, string> = {
  Source: '#50d5b7',
  Target: '#f3b95f',
  'Source + EQ': '#78a9ff',
  PEQ: '#c69cff',
  Desired: '#ef769f',
  'Selected Filter': '#ffffff',
}

interface EChartsInteractionOption {
  legend?: { selected?: Partial<Record<GraphSeriesName, boolean>> }[]
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

export function FrequencyResponseGraph({ derived }: FrequencyResponseGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const renderedSeriesRef = useRef<Set<GraphSeriesName>>(new Set())

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
    const interactionOption = (chart.getOption() ?? {}) as EChartsInteractionOption
    const previousSelected = interactionOption.legend?.[0]?.selected ?? {}
    const selected = Object.fromEntries(
      legendNames.map((name) => [
        name,
        renderedSeriesRef.current.has(name) && previousSelected[name] !== undefined
          ? previousSelected[name]
          : (graphSeries.find((series) => series.name === name)?.defaultVisible ?? false),
      ]),
    ) as Record<GraphSeriesName, boolean>
    const insideZoom = dataZoomInteraction(interactionOption, 0)
    const sliderZoom = dataZoomInteraction(interactionOption, 1)

    chart.setOption(
      {
        animation: false,
        backgroundColor: 'transparent',
        grid: { left: 58, right: 22, top: 48, bottom: 58 },
        legend: {
          data: legendNames,
          selected,
          top: 10,
          textStyle: { color: '#aab7c4', fontSize: 11 },
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
          minorTick: { show: true },
          minorSplitLine: { show: true },
          axisLabel: { color: '#82909f' },
          splitLine: { lineStyle: { color: '#26333e' } },
        },
        yAxis: {
          type: 'value',
          name: 'dB',
          scale: true,
          axisLabel: { color: '#82909f', formatter: '{value} dB' },
          splitLine: { lineStyle: { color: '#26333e' } },
        },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', ...insideZoom },
          {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
            height: 16,
            bottom: 12,
            borderColor: '#344450',
            fillerColor: 'rgba(80, 213, 183, 0.12)',
            ...sliderZoom,
          },
        ],
        series: graphSeries.map((series) => ({
          name: series.name,
          type: 'line',
          data: series.data,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: series.name === 'PEQ' || series.name === 'Desired' ? 1.4 : 2 },
          itemStyle: { color: seriesColors[series.name] },
          emphasis: { focus: 'series' },
          markLine:
            series.markerFrequencyHz === undefined
              ? undefined
              : {
                  symbol: 'none',
                  label: { formatter: `${series.markerFrequencyHz} Hz`, color: '#dce6ed' },
                  lineStyle: { color: seriesColors[series.name], type: 'dashed', width: 1 },
                  data: [{ xAxis: series.markerFrequencyHz }],
                },
        })),
      },
      { notMerge: true },
    )
    renderedSeriesRef.current = new Set(graphSeries.map(({ name }) => name))
  }, [derived])

  function resetView() {
    chartRef.current?.dispatchAction({ type: 'restore' })
    chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
  }

  return (
    <section className="graph-panel" aria-labelledby="fr-graph-heading">
      <div className="graph-panel__header">
        <div>
          <h2 id="fr-graph-heading">Frequency Response</h2>
          <p className={`graph-status graph-status--${derived.status}`} role="status">
            {derived.message}
          </p>
        </div>
        <Button onClick={resetView}>Reset View</Button>
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
