import { describe, expect, it } from 'vitest'
import { graphTheme, seriesAppearance, type GraphAppearanceInput } from './graphAppearance'

const input: GraphAppearanceInput = {
  theme: 'light',
  sourceColor: '#1565c0',
  targetColor: '#c62828',
  targetPresentation: 'measurement',
}

describe('seriesAppearance', () => {
  it('renders a reference Target as the exact theme neutral gray dashed instead of the UI accent', () => {
    const style = seriesAppearance('Target', { ...input, targetPresentation: 'reference' })

    expect(style.color).toBe('#989894')
    expect(style.lineType).toBe('dashed')
    expect(style.opacity).toBeLessThan(1)
  })

  it('renders a measurement Target with its assigned graph color', () => {
    const style = seriesAppearance('Target', input)

    expect(style.color).toBe('#c62828')
    expect(style.lineType).toBe('solid')
  })

  it('keeps Source independent from the amber UI accent', () => {
    const style = seriesAppearance('Source', input)

    expect(style.color).toBe('#1565c0')
    expect(style.color.toLowerCase()).not.toBe('#f39a3b')
  })

  it('relates Source + EQ to Source while distinguishing its stroke', () => {
    const source = seriesAppearance('Source', input)
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
  it('centralizes background, axes, grids, legend, zoom, and marker colors by theme', () => {
    expect(graphTheme('light')).toEqual({
      background: '#fffefa',
      axis: '#7b7b76',
      majorGrid: '#d8d8d3',
      minorGrid: '#ecece7',
      legend: '#756e67',
      zoomBorder: '#b9afa2',
      zoomFill: 'rgba(152, 152, 148, 0.12)',
      marker: '#2f3437',
      referenceTarget: '#989894',
    })
    expect(graphTheme('dark')).toEqual({
      background: '#0b1012',
      axis: '#96918c',
      majorGrid: '#2a3032',
      minorGrid: '#1b2123',
      legend: '#aaa29a',
      zoomBorder: '#465055',
      zoomFill: 'rgba(143, 142, 138, 0.12)',
      marker: '#f3efe8',
      referenceTarget: '#8f8e8a',
    })
  })
})
