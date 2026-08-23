import type { Curve, Filter } from '@autoeq-workbench/core'
import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'

const modules = vi.hoisted(() => ({
  GridComponent: { name: 'grid' },
  MarkLineComponent: { name: 'mark-line' },
  TooltipComponent: { name: 'tooltip' },
}))
const mocks = vi.hoisted(() => ({
  chart: { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), getOption: vi.fn() },
  init: vi.fn(),
  use: vi.fn(),
}))

vi.mock('echarts/core', () => ({ init: mocks.init, use: mocks.use }))
vi.mock('echarts/charts', () => ({ LineChart: { name: 'line' } }))
vi.mock('echarts/components', () => modules)
vi.mock('echarts/renderers', () => ({ CanvasRenderer: { name: 'canvas' } }))

import { FrequencyResponseGraph } from './FrequencyResponseGraph'

function curve(id: string, name: string, kind: Curve['kind'], offset = 0): Curve {
  return {
    id,
    name,
    kind,
    rawPoints: [
      { frequencyHz: 20, db: offset - 1 },
      { frequencyHz: 500, db: offset },
      { frequencyHz: 20_000, db: offset + 1 },
    ],
    metadata: {},
  }
}

const filter: Filter = {
  id: 'filter', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 3, q: 1,
}

describe('FrequencyResponseGraph', () => {
  beforeEach(() => {
    for (const mock of [mocks.chart.setOption, mocks.chart.resize, mocks.chart.dispose, mocks.init]) {
      mock.mockClear()
    }
    mocks.chart.getOption.mockReset()
    mocks.chart.getOption.mockReturnValue({})
    mocks.init.mockReturnValue(mocks.chart)
    uiStore.setState({ theme: 'light', curveAppearance: {} })
  })

  it('initializes once, safely handles an absent initial option, resizes, and disposes', () => {
    mocks.chart.getOption.mockReturnValue(undefined)
    const store = createWorkspaceStore()
    const { rerender, unmount } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />,
    )
    rerender(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(mocks.init).toHaveBeenCalledOnce()
    expect(mocks.chart.setOption).toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event('resize')))
    expect(mocks.chart.resize).toHaveBeenCalledOnce()
    unmount()
    expect(mocks.chart.dispose).toHaveBeenCalledOnce()
  })

  it('registers and configures no zoom, toolbox, or standard legend', () => {
    render(<FrequencyResponseGraph derived={deriveWorkspace(createWorkspaceStore().getState())} />)
    const registered = mocks.use.mock.calls[0]?.[0] as { name: string }[]
    const option = mocks.chart.setOption.mock.calls.at(-1)?.[0]

    expect(registered.map(({ name }) => name)).toEqual(['line', 'grid', 'mark-line', 'tooltip', 'canvas'])
    expect(option).not.toHaveProperty('dataZoom')
    expect(option).not.toHaveProperty('legend')
    expect(option).not.toHaveProperty('toolbox')
    expect(screen.queryByText('Reset View')).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: /graph/i })).not.toBeInTheDocument()
  })

  it('plots every visible measurement by actual name and labels it with its effective color', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Studio left', 'fr'))
    store.getState().addCurve(curve('target', 'Harman target', 'target', 1))
    store.getState().addCurve(curve('reference', 'Archive reference', 'target', 2))
    store.getState().setCurveRole('reference', 'reference')
    store.getState().addCurve(curve('comparison', 'Room comparison', 'fr', 3))
    store.getState().addCurve(curve('hidden', 'Hidden comparison', 'fr', 4))
    store.getState().setFilters([filter], 'manual')
    uiStore.setState({
      curveAppearance: {
        source: { color: '#1565c0', visible: true },
        target: { color: '#c62828', visible: true },
        reference: { color: '#2e7d32', visible: true },
        comparison: { color: '#6a1b9a', visible: true },
        hidden: { color: '#00838f', visible: false },
      },
    })

    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const option = mocks.chart.setOption.mock.calls.at(-1)?.[0]
    expect(option.series.map(({ name }: { name: string }) => name)).toEqual([
      'Studio left', 'Harman target', 'Archive reference', 'Room comparison', 'Source + EQ',
    ])
    expect(option.series.find(({ name }: { name: string }) => name === 'Archive reference').lineStyle)
      .toMatchObject({ color: '#989894', type: 'dashed' })
    expect(option.series.some(({ name }: { name: string }) => name === 'Hidden comparison')).toBe(false)
    expect(option.series.some(({ name }: { name: string }) => name === 'PEQ')).toBe(false)
    expect(option.series.some(({ name }: { name: string }) => name === 'Desired')).toBe(false)

    const labels = screen.getByRole('list', { name: 'Visible graph series' })
    expect(within(labels).getByText('Studio left')).toHaveStyle({ color: '#1565c0' })
    expect(within(labels).getByText('Harman target')).toHaveStyle({ color: '#c62828' })
    expect(within(labels).getByText('Archive reference')).toHaveStyle({ color: '#989894' })
    expect(within(labels).getByText('Room comparison')).toHaveStyle({ color: '#6a1b9a' })
    expect(within(labels).queryByText('Hidden comparison')).not.toBeInTheDocument()
  })

  it('updates theme colors without changing canonical series data', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source measurement', 'fr'))
    uiStore.setState({ curveAppearance: { source: { color: '#00796b', visible: true } } })
    render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const initialData = mocks.chart.setOption.mock.calls.at(-1)?.[0].series[0].data

    act(() => uiStore.setState({ theme: 'dark' }))
    const option = mocks.chart.setOption.mock.calls.at(-1)?.[0]
    expect(option.backgroundColor).toBe('#0b1012')
    expect(option.series[0].data).toEqual(initialData)
    expect(option.series[0].itemStyle.color).toBe('#00796b')
  })
})
