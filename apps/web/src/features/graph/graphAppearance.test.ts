import { describe, expect, it } from 'vitest'
import { graphTheme, seriesAppearance, type GraphAppearanceInput } from './graphAppearance'

const input: GraphAppearanceInput = {
  theme: 'light',
  curveAppearance: {
    source: { color: '#1565c0', visible: true },
    target: { color: '#c62828', visible: true },
  },
  sourceCurveId: 'source',
}

describe('seriesAppearance', () => {
  it('renders a reference Target as the exact theme neutral gray dashed instead of the UI accent', () => {
    const style = seriesAppearance('Reference', input, {
      curveId: 'target',
      measurementRole: 'reference',
    })

    expect(style.color).toBe('#989894')
    expect(style.lineType).toBe('dashed')
    expect(style.opacity).toBeLessThan(1)
    expect(seriesAppearance('Reference', { ...input, theme: 'dark' }, {
      curveId: 'target',
      measurementRole: 'reference',
    }).color).toBe('#8f8e8a')
  })

  it('renders a measurement Target with its assigned graph color', () => {
    const style = seriesAppearance('Target', input, { curveId: 'target', measurementRole: 'target' })

    expect(style.color).toBe('#c62828')
    expect(style.lineType).toBe('solid')
  })

  it('keeps Source independent from the amber UI accent', () => {
    const style = seriesAppearance('Source', input, { curveId: 'source', measurementRole: 'source' })

    expect(style.color).toBe('#1565c0')
    expect(style.color.toLowerCase()).not.toBe('#f39a3b')
  })

  it('relates Source + EQ to Source while distinguishing its stroke', () => {
    const source = seriesAppearance('Source', input, { curveId: 'source', measurementRole: 'source' })
    const sourceEq = seriesAppearance('Source + EQ', input)

    expect(sourceEq.color).toBe(source.color)
    expect(sourceEq).not.toEqual(source)
    expect([sourceEq.lineWidth, sourceEq.opacity, sourceEq.lineType]).not.toEqual([
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
      referenceTarget: '#989894',
    })
    expect(graphTheme('dark')).toEqual({
      background: '#0b1012',
      axis: '#96918c',
      majorGrid: '#2a3032',
      minorGrid: '#1b2123',
      marker: '#f3efe8',
      referenceTarget: '#8f8e8a',
    })
  })
})
