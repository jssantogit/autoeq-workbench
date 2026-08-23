import type { Curve, Filter } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'

const mocks = vi.hoisted(() => ({
  chart: {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    dispatchAction: vi.fn(),
    getOption: vi.fn(),
  },
  init: vi.fn(),
  use: vi.fn(),
}))

vi.mock('echarts/core', () => ({ init: mocks.init, use: mocks.use }))
vi.mock('echarts/charts', () => ({ LineChart: {} }))
vi.mock('echarts/components', () => ({
  DataZoomComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkLineComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import {
  FrequencyResponseGraph,
  type FrequencyResponseGraphHandle,
} from './FrequencyResponseGraph'
import { GraphToolbar } from './GraphToolbar'

const curve = (role: 'source' | 'target'): Curve => ({
  id: role,
  name: role,
  role,
  rawPoints: [
    { frequencyHz: 20, db: role === 'source' ? -1 : 0 },
    { frequencyHz: 500, db: 0 },
    { frequencyHz: 20_000, db: role === 'source' ? 1 : 0 },
  ],
  metadata: {},
})

const filter: Filter = {
  id: 'filter',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 3,
  q: 1,
}

describe('FrequencyResponseGraph', () => {
  beforeEach(() => {
    mocks.chart.setOption.mockClear()
    mocks.chart.resize.mockClear()
    mocks.chart.dispose.mockClear()
    mocks.chart.dispatchAction.mockClear()
    mocks.chart.getOption.mockReset()
    mocks.init.mockClear()
    mocks.init.mockReturnValue(mocks.chart)
    mocks.chart.getOption.mockReturnValue({})
    uiStore.setState({
      theme: 'light',
      curveAppearance: {
        source: { color: '#1565c0', visible: true },
        target: { color: '#c62828', visible: true },
      },
    })
  })

  it('initializes ECharts once and disposes it on unmount', () => {
    const store = createWorkspaceStore()
    const { rerender, unmount } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />,
    )

    rerender(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    expect(mocks.init).toHaveBeenCalledOnce()

    unmount()
    expect(mocks.chart.dispose).toHaveBeenCalledOnce()
  })

  it('configures a newly initialized chart before ECharts has an option', () => {
    mocks.chart.getOption.mockReturnValue(undefined)
    const store = createWorkspaceStore()

    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(mocks.chart.setOption).toHaveBeenCalledOnce()
  })

  it('configures the FR inspector and wires toolbar Reset View through the graph ref', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source'))
    store.getState().addCurve(curve('target'))
    const graphRef = createRef<FrequencyResponseGraphHandle>()

    render(
      <>
        <GraphToolbar onResetView={() => graphRef.current?.resetView()} />
        <FrequencyResponseGraph ref={graphRef} derived={deriveWorkspace(store.getState())} />
      </>,
    )

    expect(mocks.use).toHaveBeenCalled()
    expect(mocks.chart.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxis: expect.objectContaining({ type: 'log', min: 20, max: 20_000 }),
        yAxis: expect.objectContaining({ type: 'value', name: 'dB' }),
        tooltip: expect.objectContaining({
          trigger: 'axis',
          axisPointer: expect.objectContaining({ snap: false }),
          formatter: expect.any(Function),
        }),
        legend: expect.objectContaining({
          data: ['Source', 'Target', 'Source + EQ', 'PEQ', 'Desired', 'Selected Filter'],
        }),
        dataZoom: [expect.objectContaining({ type: 'inside' }), expect.objectContaining({ type: 'slider' })],
      }),
      { notMerge: true },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset View' }))
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({ type: 'restore' })
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({
      type: 'dataZoom',
      start: 0,
      end: 100,
    })
  })

  it('updates theme and assigned colors without changing graph data or interaction state', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source'))
    store.getState().addCurve(curve('target'))
    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const initialOption = mocks.chart.setOption.mock.calls.at(-1)?.[0]
    const initialData = initialOption.series.map(
      (series: { name: string; data: [number, number][] }) => [series.name, series.data],
    )

    mocks.chart.getOption.mockReturnValue({
      legend: [{ selected: { Source: false, Target: true } }],
      dataZoom: [{ start: 12, end: 82 }, { start: 12, end: 82 }],
    })
    act(() => {
      uiStore.setState({
        theme: 'dark',
        curveAppearance: {
          source: { color: '#00796b', visible: true },
          target: { color: '#ad1457', visible: true },
        },
      })
    })

    const option = mocks.chart.setOption.mock.calls.at(-1)?.[0]
    const source = option.series.find((series: { name: string }) => series.name === 'Source')
    const target = option.series.find((series: { name: string }) => series.name === 'Target')
    expect(option.backgroundColor).toBe('#0b1012')
    expect(option.xAxis.axisLabel.color).toBe('#96918c')
    expect(source.itemStyle.color).toBe('#00796b')
    expect(target.itemStyle.color).toBe('#ad1457')
    expect(option.series.map((series: { name: string; data: [number, number][] }) => [series.name, series.data])).toEqual(
      initialData,
    )
    expect(option.legend.selected).toMatchObject({ Source: false, Target: true })
    expect(option.dataZoom).toEqual([
      expect.objectContaining({ start: 12, end: 82 }),
      expect.objectContaining({ start: 12, end: 82 }),
    ])
    expect(mocks.init).toHaveBeenCalledOnce()
  })

  it('applies explicit UI visibility changes but preserves legend toggles on unrelated edits', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source'))
    store.getState().addCurve(curve('target'))
    uiStore.setState({
      curveAppearance: {
        source: { color: '#1565c0', visible: false },
        target: { color: '#c62828', visible: true },
      },
    })
    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(mocks.chart.setOption.mock.calls.at(-1)?.[0].legend.selected).toMatchObject({
      Source: false,
      Target: true,
    })

    mocks.chart.getOption.mockReturnValue({
      legend: [{ selected: { Source: false, Target: false } }],
      dataZoom: [],
    })
    act(() => uiStore.setState({ theme: 'dark' }))
    expect(mocks.chart.setOption.mock.calls.at(-1)?.[0].legend.selected).toMatchObject({
      Source: false,
      Target: false,
    })

    act(() => uiStore.getState().setCurveVisible('source', true))
    expect(mocks.chart.setOption.mock.calls.at(-1)?.[0].legend.selected).toMatchObject({
      Source: true,
      Target: false,
    })
  })

  it('preserves user legend visibility and x zoom across derived workspace updates', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source'))
    store.getState().addCurve(curve('target'))
    store.getState().setFilters([filter], 'manual')
    const { rerender } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />,
    )

    mocks.chart.getOption.mockReturnValue({
      legend: [{ selected: { Source: false, Target: true, 'Source + EQ': false, PEQ: true } }],
      dataZoom: [
        { start: 18, end: 73, startValue: 70, endValue: 8_000 },
        { start: 18, end: 73, startValue: 70, endValue: 8_000 },
      ],
    })
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    rerender(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    const updatedOption = mocks.chart.setOption.mock.calls.at(-1)?.[0]
    expect(updatedOption.legend.selected).toMatchObject({
      Source: false,
      Target: true,
      'Source + EQ': false,
      PEQ: true,
      Desired: false,
    })
    expect(updatedOption.dataZoom).toEqual([
      expect.objectContaining({ start: 18, end: 73, startValue: 70, endValue: 8_000 }),
      expect.objectContaining({ start: 18, end: 73, startValue: 70, endValue: 8_000 }),
    ])
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()
  })
})
