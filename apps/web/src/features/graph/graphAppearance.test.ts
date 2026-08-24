import { describe, expect, it } from 'vitest'
import { graphTheme, seriesAppearance, type GraphAppearanceInput } from './graphAppearance'

const input: GraphAppearanceInput = {
  theme: 'light',
  curveAppearance: {
    source: { color: '#1565c0', visible: true },
    target: { color: '#c62828', visible: true },
  },
  frCurveId: 'source',
}

describe('seriesAppearance', () => {
  it('renders every Target as theme neutral gray dashed instead of the UI accent', () => {
    const style = seriesAppearance('Target B', input, {
      curveId: 'target',
      measurementKind: 'target',
      active: false,
    })

    expect(style.color).toBe('#989894')
    expect(style.lineType).toBe('dashed')
    expect(style.lineWidth).toBe(1.1)
    expect(style.opacity).toBeLessThan(1)
    expect(seriesAppearance('Target B', { ...input, theme: 'dark' }, {
      curveId: 'target',
      measurementKind: 'target',
      active: false,
    }).color).toBe('#8f8e8a')
    expect(seriesAppearance('Target', input, {
      curveId: 'target', measurementKind: 'target', active: true,
    })).toMatchObject({ color: '#989894', lineType: 'dashed' })
  })

  it('keeps FR independent from the amber UI accent', () => {
    const style = seriesAppearance('FR', input, { curveId: 'source', measurementKind: 'fr', active: true })

    expect(style.color).toBe('#1565c0')
    expect(style.lineWidth).toBe(1.35)
    expect(style.color.toLowerCase()).not.toBe('#f39a3b')
  })

  it('relates FR + EQ to FR while distinguishing its stroke', () => {
    const source = seriesAppearance('FR', input, { curveId: 'source', measurementKind: 'fr', active: true })
    const frEq = seriesAppearance('FR + EQ', input)

    expect(frEq.color).toBe(source.color)
    expect(frEq.lineWidth).toBe(1.6)
    expect(frEq).not.toEqual(source)
    expect([frEq.lineWidth, frEq.opacity, frEq.lineType]).not.toEqual([
      source.lineWidth,
      source.opacity,
      source.lineType,
    ])
  })

  it('centralizes theme-aware derived and selected-marker colors', () => {
    expect(seriesAppearance('PEQ', input).color).toBe('#7257a6')
    expect(seriesAppearance('Desired', input).color).toBe('#b54f67')
    expect(seriesAppearance('Selected Filter', input).color).toBe('#2f3437')

    const darkInput = { ...input, theme: 'dark' } as const
    expect(seriesAppearance('PEQ', darkInput).color).toBe('#aa8ddd')
    expect(seriesAppearance('Desired', darkInput).color).toBe('#e07a91')
    expect(seriesAppearance('Selected Filter', darkInput).color).toBe('#f3efe8')
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
