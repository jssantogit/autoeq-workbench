import type { Curve } from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'

const mocks = vi.hoisted(() => ({
  chart: {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    dispatchAction: vi.fn(),
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

describe('FrequencyResponseGraph', () => {
  it('configures the FR inspector and resets visual zoom through ECharts', () => {
    mocks.init.mockReturnValue(mocks.chart)
    const store = createWorkspaceStore()
    store.getState().setSource(curve('source'))
    store.getState().setTarget(curve('target'))

    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(mocks.use).toHaveBeenCalled()
    expect(mocks.chart.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        xAxis: expect.objectContaining({ type: 'log', min: 20, max: 20_000 }),
        yAxis: expect.objectContaining({ type: 'value', name: 'dB' }),
        tooltip: expect.objectContaining({ trigger: 'axis' }),
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
})
