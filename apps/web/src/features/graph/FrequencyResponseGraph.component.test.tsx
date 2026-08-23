import type { Curve, Filter } from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { FrequencyResponseGraph } from './FrequencyResponseGraph'

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
  })

  it('configures a newly initialized chart before ECharts has an option', () => {
    mocks.chart.getOption.mockReturnValue(undefined)
    const store = createWorkspaceStore()

    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(mocks.chart.setOption).toHaveBeenCalledOnce()
  })

  it('configures the FR inspector and resets visual zoom through ECharts', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(curve('source'))
    store.getState().setTarget(curve('target'))

    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

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

  it('preserves user legend visibility and x zoom across derived workspace updates', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(curve('source'))
    store.getState().setTarget(curve('target'))
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
