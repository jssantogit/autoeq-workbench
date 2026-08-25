import type { Curve, Filter } from '@autoeq-workbench/core'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function installGraphMediaQuery(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() { return matches },
    media: '(max-width: 430px)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  } as unknown as MediaQueryList
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  })
  return {
    listeners,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
  }
}

describe('FrequencyResponseGraph SVG renderer', () => {
  beforeEach(() => {
    uiStore.setState({
      theme: 'light',
      curveAppearance: {},
      inspectorEnabled: true,
      labelsEnabled: true,
      graphZoomPreset: 'full',
      smoothingLevel: 5,
      baselineCurveId: null,
    })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
  })

  it('renders a responsive fixed-viewBox SVG with explicit grids and no external graph chrome', () => {
    const { container } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(createWorkspaceStore().getState())} />,
    )
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 800 346')
    expect(svg).toHaveAttribute('data-fr-graph')
    expect(svg).toHaveAttribute('data-graph-presentation', 'desktop')
    expect(svg).toHaveClass('fr-graph')
    expect(svg).not.toHaveAttribute('role', 'img')
    expect(svg).toHaveStyle({ aspectRatio: '800 / 346', width: '100%', height: 'auto' })
    expect(container.querySelectorAll('[data-squiglink-graph-root]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-x-grid]')).toHaveLength(25)
    expect(container.querySelectorAll('[data-y-grid]')).toHaveLength(12)
    const zeroGrid = container.querySelector('[data-y-grid="0"]')
    const adjacentGrid = container.querySelector('[data-y-grid="5"]')
    expect(zeroGrid).not.toHaveAttribute('data-emphasis')
    expect(zeroGrid).toHaveAttribute('stroke', adjacentGrid?.getAttribute('stroke'))
    expect(zeroGrid).toHaveAttribute('stroke-width', adjacentGrid?.getAttribute('stroke-width'))
    const dbLabel = container.querySelector('[data-db-label]')
    expect(dbLabel).toHaveTextContent('dB')
    expect(dbLabel).toHaveAttribute('x', '19')
    expect(dbLabel).toHaveAttribute('y', '16')
    expect(container.querySelectorAll('.graph-axis-label')).toHaveLength(23)
    expect([...container.querySelectorAll('[data-y-label]')].map((label) => label.textContent)).toEqual([
      '25', '20', '15', '10', '5', '0', '-5', '-10', '-15', '-20', '-25', '-30',
    ])
    expect(container.querySelector('[data-y-label="25"]')).toHaveAttribute('dominant-baseline', 'hanging')
    expect(container.querySelector('[data-y-label="-30"]')).toHaveAttribute('dominant-baseline', 'auto')
    expect(container.querySelector('.graph-meta')).not.toBeInTheDocument()
    expect(container.querySelector('[class*="legend"]')).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/sampling|dataZoom|toolbox|Reset View/)
  })

  it('renders visible series and internal names with effective styles while omitting hidden curves', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Studio left', 'fr'))
    store.getState().addCurve(curve('target', 'Harman  target', 'target', 1))
    store.getState().addCurve(curve('reference', 'Archive target', 'target', 2))
    store.getState().addCurve(curve('comparison', 'Room comparison', 'fr', 3))
    store.getState().addCurve(curve('hidden', 'Hidden comparison', 'fr', 4))
    store.getState().setFilters([filter], 'manual')
    uiStore.setState({
      curveAppearance: {
        source: { color: '#1565c0', visible: true, offsetDb: 0 },
        target: { color: '#c62828', visible: true, offsetDb: 0 },
        reference: { color: '#2e7d32', visible: true, offsetDb: 0 },
        comparison: { color: '#6a1b9a', visible: true, offsetDb: 0 },
        hidden: { color: '#00838f', visible: false, offsetDb: 0 },
      },
    })

    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const paths = [...container.querySelectorAll<SVGPathElement>('[data-series-name]')]
    expect(paths.map((path) => path.dataset.seriesName)).toEqual([
      'Studio left', 'Studio left EQ', 'Harman  target', 'Archive target', 'Room comparison',
    ])
    for (const name of ['Harman  target', 'Archive target']) {
      const target = container.querySelector(`[data-series-name="${name}"]`)
      expect(target).toHaveAttribute('stroke', '#989894')
      expect(target).toHaveAttribute('stroke-dasharray')
    }
    expect(container.querySelector('[data-series-name="Studio left EQ"]')).toHaveAttribute('stroke', '#c62828')
    expect(container.querySelector('[data-series-name="Hidden comparison"]')).not.toBeInTheDocument()
    expect(screen.getByText('Studio left')).toHaveAttribute('fill', '#1565c0')
    const targetLabel = container.querySelector('[data-curve-label="target"]')
    expect(targetLabel).toHaveTextContent('Harman target')
    expect(targetLabel?.textContent).toBe('Harman  target')
    expect(targetLabel).toHaveStyle({ whiteSpace: 'pre' })
    expect(targetLabel).toHaveAttribute('fill', '#989894')
    expect(container.querySelector('[data-target-label-sample]')).not.toBeInTheDocument()
    expect([...container.querySelectorAll('[data-curve-label]')]
      .every((label) => label.getAttribute('x') === '67')).toBe(true)
    expect(screen.queryByText('Hidden comparison')).not.toBeInTheDocument()

    const yLabelX = Number(container.querySelector('[data-y-label="-30"]')?.getAttribute('x'))
    const annotations = [
      ...container.querySelectorAll('[data-curve-label]'),
    ]
    const annotationXs = annotations
      .map((label) => Number(label.getAttribute('x')))
    expect(annotationXs.every((x) => x > yLabelX + 20)).toBe(true)
    expect(annotations.every((label) =>
      Number(label.getAttribute('y')) < 322,
    )).toBe(true)
  })

  it('uses compact SVG units without changing graph geometry and cleans up its media listener', () => {
    const media = installGraphMediaQuery(false)
    const store = createWorkspaceStore()
    for (let index = 0; index < 7; index += 1) {
      store.getState().addCurve(curve(`curve-${index}`, `Long curve name ${index}`, 'fr', index))
    }
    const { container, unmount } = render(
      <FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />,
    )
    const svg = container.querySelector('svg')!
    const initialPaths = [...container.querySelectorAll('[data-series-name]')]
      .map((path) => path.getAttribute('d'))

    expect(media.listeners.size).toBe(1)
    expect(svg).toHaveAttribute('data-graph-presentation', 'desktop')
    act(() => media.setMatches(true))

    expect(svg).toHaveAttribute('data-graph-presentation', 'compact')
    expect(svg).toHaveAttribute('viewBox', '0 0 800 346')
    expect(container.querySelectorAll('[data-x-grid]')).toHaveLength(25)
    expect(container.querySelectorAll('[data-y-grid]')).toHaveLength(12)
    expect([...container.querySelectorAll('[data-series-name]')].map((path) => path.getAttribute('d')))
      .toEqual(initialPaths)
    expect(container.querySelector('.graph-axis-label--x')).toHaveAttribute('font-size', '13')
    expect(container.querySelector('[data-y-label]')).toHaveAttribute('font-size', '12')

    const labels = [...container.querySelectorAll('[data-curve-label]')]
    expect(labels[0]).toHaveAttribute('font-size', '19')
    expect(Number(labels[0]!.getAttribute('y')) - Number(labels[1]!.getAttribute('y'))).toBe(21)
    expect(labels.every((label) => Number(label.getAttribute('y')) < 322)).toBe(true)

    fireEvent.focus(screen.getByRole('slider', { name: 'Inspect graph frequency' }))
    const tooltip = container.querySelector('[data-inspector-tooltip-box]')
    const tooltipRows = [...container.querySelectorAll('[data-inspector-value-row]')]
    expect(tooltip).toHaveAttribute('width', '240')
    expect(tooltip).toHaveAttribute('height', '202')
    expect(Number(tooltip?.getAttribute('width'))).toBeLessThan((785 - 15) / 3)
    expect(container.querySelector('.graph-tooltip-label')).toHaveAttribute('font-size', '19')
    expect(tooltipRows).toHaveLength(6)
    expect(tooltipRows.every((row) => row.getAttribute('font-size') === '18')).toBe(true)
    const tooltipRowYs = tooltipRows.map((row) =>
      Number(row.querySelector('[data-inspector-value-name]')?.getAttribute('y')))
    expect(tooltipRowYs[1]! - tooltipRowYs[0]!).toBe(22)
    expect(container.querySelector('.graph-tooltip-value:not([data-inspector-value-row])'))
      .toHaveTextContent('+1 more')

    const tooltipNames = [...container.querySelectorAll('[data-inspector-value-name]')]
    const tooltipNumbers = [...container.querySelectorAll('[data-inspector-value-number]')]
    expect(tooltipNames).toHaveLength(6)
    expect(tooltipNumbers).toHaveLength(6)
    expect(tooltipNames[0]?.lastChild).toHaveTextContent('Long cur...')
    expect(tooltipNames[0]?.querySelector('title')).toHaveTextContent('Long curve name 0')
    expect(tooltipNumbers[0]).toHaveTextContent('0.19 dB')
    expect(tooltipNumbers[0]).toHaveAttribute('text-anchor', 'end')
    expect(tooltipNumbers[0]).toHaveAttribute('x', '233')
    expect(Number(tooltipNumbers[0]!.getAttribute('x'))).toBeLessThan(240)
    expect(screen.getByTestId('graph-inspector-status')).toHaveTextContent(
      /Long curve name 0: 0\.19 dB/,
    )

    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('keeps path data stable through theme changes and updates theme-neutral colors', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    store.getState().addCurve(curve('target', 'Target', 'target'))
    uiStore.setState({ curveAppearance: {
      source: { color: '#00796b', visible: true, offsetDb: 0 },
      target: { color: '#ff0000', visible: true, offsetDb: 0 },
    } })
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const initialPath = container.querySelector('[data-series-name="Source"]')?.getAttribute('d')
    act(() => uiStore.setState({ theme: 'dark' }))
    expect(container.querySelector('[data-series-name="Source"]')).toHaveAttribute('d', initialPath)
    expect(container.querySelector('[data-series-name="Source"]')).toHaveAttribute('stroke', '#00796b')
    expect(container.querySelector('[data-series-name="Target"]')).toHaveAttribute('stroke', '#8f8e8a')
  })

  it('shares display offset but keeps source and equalized FR visibility independent', () => {
    const store = createWorkspaceStore()
    const source = curve('source', 'Source', 'fr')
    store.getState().addCurve(source)
    store.getState().setFilters([filter], 'manual')
    uiStore.setState({ curveAppearance: {
      source: { color: '#1565c0', visible: true, offsetDb: 0 },
      'derived:fr-eq': { color: '#c62828', visible: true, offsetDb: 0 },
    } })
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const sourcePath = container.querySelector('[data-series-name="Source"]')?.getAttribute('d')
    const equalizedPath = container.querySelector('[data-series-name="Source EQ"]')?.getAttribute('d')
    const rawSnapshot = structuredClone(source.rawPoints)

    act(() => uiStore.getState().setCurveOffset('source', 3))
    expect(container.querySelector('[data-series-name="Source"]')).not.toHaveAttribute('d', sourcePath)
    expect(container.querySelector('[data-series-name="Source EQ"]')).not.toHaveAttribute('d', equalizedPath)
    expect(source.rawPoints).toEqual(rawSnapshot)

    act(() => uiStore.getState().setCurveVisible('source', false))
    expect(container.querySelector('[data-series-name="Source"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-series-name="Source EQ"]')).toBeInTheDocument()
    act(() => uiStore.getState().setCurveVisible('derived:fr-eq', false))
    expect(container.querySelector('[data-series-name="Source EQ"]')).not.toBeInTheDocument()
    expect(source.rawPoints).toEqual(rawSnapshot)
  })

  it('keeps one owned D3 root through StrictMode updates and tears it down', () => {
    const store = createWorkspaceStore()
    const view = (derived: ReturnType<typeof deriveWorkspace>) => (
      <StrictMode><FrequencyResponseGraph derived={derived} /></StrictMode>
    )
    const { container, rerender, unmount } = render(view(deriveWorkspace(store.getState())))
    expect(container.querySelectorAll('[data-squiglink-graph-root]')).toHaveLength(1)

    store.getState().addCurve(curve('source', 'Strict source', 'fr'))
    rerender(view(deriveWorkspace(store.getState())))
    expect(container.querySelectorAll('[data-squiglink-graph-root]')).toHaveLength(1)
    expect(container.querySelector('[data-series-name="Strict source"]')).toBeInTheDocument()

    unmount()
    expect(container.querySelector('[data-squiglink-graph-root]')).toBeNull()
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

  it('operates the inspector by keyboard and announces details outside the SVG', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    const control = screen.getByRole('slider', { name: 'Inspect graph frequency' })

    expect(control).toHaveAttribute('tabindex', '0')
    fireEvent.focus(control)
    expect(container.querySelector('[data-inspector-crosshair]')).toBeInTheDocument()
    expect(screen.getByTestId('graph-inspector-status')).toHaveTextContent(/1\.00 kHz.*Source:.*dB/i)
    expect(screen.getByTestId('graph-inspector-status').closest('svg')).toBeNull()
    expect(screen.queryByTestId('graph-derived-status')).not.toBeInTheDocument()

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

    expect(container.querySelectorAll('[aria-label="Visible graph series"] text')).toHaveLength(9)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
    expect(screen.getByText('Curve 0')).toHaveAttribute('x', '67')
    expect(screen.getByText('Curve 0')).toHaveAttribute('y', '302')
    expect(screen.getByText('Curve 7')).toHaveAttribute('y', '197')
    expect(screen.getByText('+2 more')).toHaveAttribute('y', '182')
  })

  it('keeps graph narration and selected-filter overlays out of the SVG', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(curve('source', 'Source', 'fr'))
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter('filter')
    const { container } = render(<FrequencyResponseGraph derived={deriveWorkspace(store.getState())} />)
    expect(container.querySelector('[data-graph-status]')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).not.toHaveTextContent(/FR and Target ready|select active/i)
    expect(container.querySelector('[data-selected-frequency]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-series-name="Selected Filter"]')).not.toBeInTheDocument()
    expect(screen.queryByText('1kHz')).not.toBeInTheDocument()
  })
})
