import type { Curve, Filter } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
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

describe('FrequencyResponseGraph SVG renderer', () => {
  beforeEach(() => {
    uiStore.setState({ theme: 'light', curveAppearance: {}, inspectorEnabled: true })
  })

  it('renders a responsive fixed-viewBox SVG with explicit grids and no external graph chrome', () => {
    const { container } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(createWorkspaceStore().getState())} />,
    )
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 800 346')
    expect(svg).toHaveAttribute('data-fr-graph')
    expect(svg).toHaveClass('fr-graph')
    expect(svg).not.toHaveAttribute('role', 'img')
    expect(svg).toHaveStyle({ aspectRatio: '800 / 346', width: '100%', height: 'auto' })
    expect(container.querySelectorAll('[data-x-grid]')).toHaveLength(25)
    expect(container.querySelectorAll('[data-y-grid]')).toHaveLength(12)
    expect(container.querySelector('[data-y-grid="0"]')).toHaveAttribute('data-emphasis', 'zero')
    expect(container.querySelector('.graph-meta')).not.toBeInTheDocument()
    expect(container.querySelector('[class*="legend"]')).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/sampling|dataZoom|toolbox|Reset View/)
  })

  it('renders visible series and internal names with effective styles while omitting hidden curves', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Studio left', 'fr'))
    store.getState().addCurve(curve('target', 'Harman target', 'target', 1))
    store.getState().addCurve(curve('reference', 'Archive target', 'target', 2))
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

    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const paths = [...container.querySelectorAll<SVGPathElement>('[data-series-name]')]
    expect(paths.map((path) => path.dataset.seriesName)).toEqual([
      'Studio left', 'Harman target', 'Archive target', 'Room comparison', 'FR + EQ',
    ])
    for (const name of ['Harman target', 'Archive target']) {
      const target = container.querySelector(`[data-series-name="${name}"]`)
      expect(target).toHaveAttribute('stroke', '#989894')
      expect(target).toHaveAttribute('stroke-dasharray')
    }
    expect(container.querySelector('[data-series-name="FR + EQ"]')).toHaveAttribute('stroke', '#1565c0')
    expect(container.querySelector('[data-series-name="Hidden comparison"]')).not.toBeInTheDocument()
    expect(screen.getByText('Studio left')).toHaveAttribute('fill', '#1565c0')
    expect(screen.getByText('Harman target')).toHaveAttribute('fill', '#989894')
    expect(screen.queryByText('Hidden comparison')).not.toBeInTheDocument()
  })

  it('keeps path data stable through theme changes and updates theme-neutral colors', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    store.getState().addCurve(curve('target', 'Target', 'target'))
    uiStore.setState({ curveAppearance: {
      source: { color: '#00796b', visible: true }, target: { color: '#ff0000', visible: true },
    } })
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const initialPath = container.querySelector('[data-series-name="Source"]')?.getAttribute('d')
    act(() => uiStore.setState({ theme: 'dark' }))
    expect(container.querySelector('[data-series-name="Source"]')).toHaveAttribute('d', initialPath)
    expect(container.querySelector('[data-series-name="Source"]')).toHaveAttribute('stroke', '#00796b')
    expect(container.querySelector('[data-series-name="Target"]')).toHaveAttribute('stroke', '#8f8e8a')
  })

  it('shows a clamped structured pointer inspector and crosshair, then hides on leave or disable', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const svg = container.querySelector('svg')!
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 0, width: 400, height: 173, right: 500, bottom: 173, x: 100, y: 0, toJSON: () => ({}) }),
    })
    fireEvent.pointerMove(container.querySelector('[data-inspector-hit-area]')!, { clientX: 300 })
    expect(container.querySelector('[data-inspector-crosshair]')).toBeInTheDocument()
    expect(screen.getByText('632 Hz')).toBeInTheDocument()
    expect(container.querySelector('[data-inspector-tooltip]')).toHaveTextContent(/Source:/)
    fireEvent.pointerMove(container.querySelector('[data-inspector-hit-area]')!, { clientX: 499 })
    expect(container.querySelector('[data-inspector-tooltip]')).toHaveAttribute('transform', 'translate(611 30)')
    fireEvent.pointerLeave(container.querySelector('[data-inspector-hit-area]')!)
    expect(container.querySelector('[data-inspector-crosshair]')).not.toBeInTheDocument()
    act(() => uiStore.getState().toggleInspector())
    fireEvent.pointerMove(container.querySelector('[data-inspector-hit-area]')!, { clientX: 300 })
    expect(container.querySelector('[data-inspector-crosshair]')).not.toBeInTheDocument()
  })

  it('operates the inspector by keyboard and announces status and details outside the SVG', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const control = screen.getByRole('slider', { name: 'Inspect graph frequency' })

    expect(control).toHaveAttribute('tabindex', '0')
    fireEvent.focus(control)
    expect(container.querySelector('[data-inspector-crosshair]')).toBeInTheDocument()
    expect(screen.getByTestId('graph-inspector-status')).toHaveTextContent(/1\.00 kHz.*Source:.*dB/i)
    expect(screen.getByTestId('graph-derived-status')).toHaveTextContent(/target/i)
    expect(screen.getByTestId('graph-inspector-status').closest('svg')).toBeNull()

    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(control).toHaveAttribute('aria-valuenow', '1072')
    fireEvent.keyDown(control, { key: 'ArrowLeft' })
    expect(control).toHaveAttribute('aria-valuenow', '1000')
    fireEvent.keyDown(control, { key: 'Home' })
    expect(control).toHaveAttribute('aria-valuenow', '20')
    fireEvent.keyDown(control, { key: 'End' })
    expect(control).toHaveAttribute('aria-valuenow', '20000')
  })

  it('caps internal labels and reports overflow beyond eight visible series', () => {
    const store = createWorkspaceStore()
    for (let index = 0; index < 10; index += 1) {
      store.getState().addCurve(curve(`curve-${index}`, `Curve ${index}`, 'fr', index))
    }
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)

    expect(container.querySelectorAll('[aria-label="Visible graph series"] > text')).toHaveLength(9)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('keeps the status message and selected-filter Fc marker inside the graph', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter('filter')
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    expect(container.querySelector('[data-graph-status]')).toHaveTextContent(/target/i)
    expect(container.querySelector('[data-selected-frequency="1000"]')).toBeInTheDocument()
    expect(screen.getByText('1kHz')).toBeInTheDocument()
  })
})
