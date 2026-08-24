import { describe, expect, it } from 'vitest'
import {
  graphTheme,
  pickEqualizedFrColor,
  seriesAppearance,
  type GraphAppearanceInput,
} from './graphAppearance'
import type { GraphSeries } from './graphSeries'
import { MEASUREMENT_CURVE_PALETTE } from '../../state/uiStore'

const input: GraphAppearanceInput = {
  theme: 'light',
  curveAppearance: {
    source: { color: '#1565c0', visible: true, offsetDb: 0 },
    target: { color: '#c62828', visible: true, offsetDb: 0 },
  },
}

describe('seriesAppearance', () => {
  it('renders every Target as theme neutral gray dashed instead of the UI accent', () => {
    const target: GraphSeries = {
      id: 'target', name: 'Target B', kind: 'measurement', data: [], defaultVisible: true,
      curveId: 'target',
      measurementKind: 'target',
      active: false,
    }
    const style = seriesAppearance(target, input)

    expect(style.color).toBe('#989894')
    expect(style.lineType).toBe('dashed')
    expect(style.lineWidth).toBe(1.1)
    expect(style.opacity).toBeLessThan(1)
    expect(seriesAppearance(target, { ...input, theme: 'dark' }).color).toBe('#8f8e8a')
    expect(seriesAppearance({ ...target, active: true }, input)).toMatchObject({
      color: '#989894', lineType: 'dashed',
    })
  })

  it('keeps FR independent from the amber UI accent', () => {
    const style = seriesAppearance({
      id: 'source', name: 'FR', kind: 'measurement', data: [], defaultVisible: true,
      curveId: 'source', measurementKind: 'fr', active: true,
    }, input)

    expect(style.color).toBe('#1565c0')
    expect(style.lineWidth).toBe(1.35)
    expect(style.color.toLowerCase()).not.toBe('#f39a3b')
  })

  it('gives the equalized FR a deterministic palette color distinct from its source', () => {
    const source: GraphSeries = {
      id: 'source', name: 'Juzear Nimbus', kind: 'measurement', data: [], defaultVisible: true,
      curveId: 'source', measurementKind: 'fr', active: true,
    }
    const equalized: GraphSeries = {
      id: 'fr-eq', name: 'Juzear Nimbus EQ', kind: 'equalized-fr', data: [],
      defaultVisible: true, sourceCurveId: 'source',
    }
    const sourceStyle = seriesAppearance(source, input)
    const frEq = seriesAppearance(equalized, input)

    expect(frEq.color).not.toBe(sourceStyle.color)
    expect(frEq.color).toBe(pickEqualizedFrColor(sourceStyle.color))
    expect(pickEqualizedFrColor(sourceStyle.color)).toBe(pickEqualizedFrColor(sourceStyle.color))
    expect(frEq.lineWidth).toBe(1.6)
    expect(frEq.opacity).toBeGreaterThanOrEqual(0.9)
    for (const color of MEASUREMENT_CURVE_PALETTE) {
      expect(pickEqualizedFrColor(color).toLowerCase()).not.toBe(color.toLowerCase())
    }
  })
})

describe('graphTheme', () => {
  it('centralizes only plotting and marker colors by theme', () => {
    expect(graphTheme('light')).toEqual({
      background: '#fffefa',
      axis: '#7b7b76',
      majorGrid: '#d8d8d3',
      minorGrid: '#ecece7',
      marker: '#2f3437',
      inactiveTarget: '#989894',
    })
    expect(graphTheme('dark')).toEqual({
      background: '#0b1012',
      axis: '#96918c',
      majorGrid: '#2a3032',
      minorGrid: '#1b2123',
      marker: '#f3efe8',
      inactiveTarget: '#8f8e8a',
    })
  })
})
