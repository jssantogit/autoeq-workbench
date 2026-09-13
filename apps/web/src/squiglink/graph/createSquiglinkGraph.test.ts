import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSquiglinkGraph } from './createSquiglinkGraph'
import type { SquiglinkGraphState } from './types'

const initialState: SquiglinkGraphState = {
  series: [
    {
      id: 'fr', name: 'FR', data: [[20, -1], [500, 0], [20_000, 1]],
      color: '#1565c0', dashed: false, visible: true,
    },
    {
      id: 'target', name: 'Target', data: [[20, 0], [500, 0], [20_000, 0]],
      color: '#989894', dashed: true, visible: true,
    },
  ],
  view: { zoom: 'full', smoothingLevel: 5, inspectorEnabled: true, labelsEnabled: true },
}

describe('createSquiglinkGraph', () => {
  it('mounts one owned graph and updates keyed axes and series without duplication', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const onInspector = vi.fn()
    const controller = createSquiglinkGraph(svg, initialState, { onInspector })

    expect(svg).toHaveAttribute('viewBox', '0 0 800 346')
    expect(svg.querySelectorAll('[data-squiglink-graph-root]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-graph-axis="x"]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-graph-axis="y"]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-x-grid]')).toHaveLength(25)
    expect(svg.querySelectorAll('[data-y-grid]')).toHaveLength(12)
    expect(svg.querySelector('[data-x-grid="20"]')).toHaveAttribute('y1', '10')
    expect(svg.querySelector('[data-x-grid="20"]')).toHaveAttribute('y2', '312')
    expect(svg.querySelector('[data-x-tick="40"] text')).toHaveAttribute('font-size', '8.6')
    expect(svg.querySelector('[data-y-label="25"]')).toHaveAttribute('x', '18')
    expect(svg.querySelector('[data-y-label="25"]')).toHaveAttribute('dy', '-2')
    expect([...svg.querySelectorAll('[data-series-name]')].map((path) =>
      path.getAttribute('data-series-name'))).toEqual(['FR', 'Target'])

    const next: SquiglinkGraphState = {
      ...initialState,
      series: [
        { ...initialState.series[0]!, color: '#c62828' },
        { ...initialState.series[1]!, visible: false },
      ],
    }
    controller.update(next)
    controller.update(next)

    expect(svg.querySelectorAll('[data-squiglink-graph-root]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-graph-axis="x"]')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-series-id]')).toHaveLength(1)
    expect(svg.querySelector('[data-series-id="fr"]')).toHaveAttribute('stroke', '#c62828')
  })

  it('resamples only the smoothed display path and cleans up interaction state', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const onInspector = vi.fn()
    const sourceSnapshot = structuredClone(initialState.series[0]!.data)
    const controller = createSquiglinkGraph(svg, initialState, { onInspector })
    const path = svg.querySelector('[data-series-id="fr"]')?.getAttribute('d') ?? ''
    expect(path.match(/C/g)?.length ?? 0).toBeGreaterThan(initialState.series[0]!.data.length)

    const hitArea = svg.querySelector('[data-inspector-hit-area]')!
    fireEvent.focus(hitArea)
    expect(onInspector).toHaveBeenLastCalledWith(expect.objectContaining({ frequencyHz: 1_000 }))
    expect(svg).toContainElement(svg.querySelector('[data-inspector-crosshair]'))
    fireEvent.keyDown(hitArea, { key: 'Home' })
    expect(onInspector).toHaveBeenLastCalledWith(expect.objectContaining({
      frequencyHz: 20,
      values: expect.arrayContaining([expect.objectContaining({ id: 'fr' })]),
    }))
    fireEvent.keyDown(hitArea, { key: 'End' })
    expect(onInspector).toHaveBeenLastCalledWith(expect.objectContaining({
      frequencyHz: 20_000,
      values: expect.arrayContaining([expect.objectContaining({ id: 'fr' })]),
    }))
    expect(initialState.series[0]!.data).toEqual(sourceSnapshot)
    fireEvent.pointerLeave(hitArea)
    expect(onInspector).toHaveBeenLastCalledWith(null)

    controller.destroy()
    expect(svg.querySelector('[data-squiglink-graph-root]')).toBeNull()
    controller.update(initialState)
    expect(svg.querySelector('[data-squiglink-graph-root]')).toBeNull()
  })
})
