import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GRAPH_SCREENSHOT_FILENAME,
  exportFrequencyResponseGraph,
  type GraphScreenshotDependencies,
} from './graphScreenshot'

function successfulDependencies(graph: SVGSVGElement): {
  dependencies: GraphScreenshotDependencies
  context: CanvasRenderingContext2D
  sourceBlobs: Blob[]
} {
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))),
  } as unknown as HTMLCanvasElement
  const image = {} as HTMLImageElement
  Object.defineProperty(image, 'src', {
    set: () => queueMicrotask(() => image.onload?.(new Event('load'))),
  })
  const sourceBlobs: Blob[] = []
  let urlIndex = 0
  const dependencies: GraphScreenshotDependencies = {
    findGraph: () => graph,
    serialize: (svg) => new XMLSerializer().serializeToString(svg),
    createBlob: (parts, options) => {
      const blob = new Blob(parts, options)
      sourceBlobs.push(blob)
      return blob
    },
    createObjectURL: vi.fn(() => `blob:test-${urlIndex++}`),
    revokeObjectURL: vi.fn(),
    createImage: () => image,
    createCanvas: () => canvas,
    triggerDownload: vi.fn(),
  }
  return { dependencies, context, sourceBlobs }
}

describe('exportFrequencyResponseGraph', () => {
  beforeEach(() => document.body.replaceChildren())

  it('returns an accessible failure when the graph is missing', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const { dependencies } = successfulDependencies(svg)
    dependencies.findGraph = () => null

    await expect(exportFrequencyResponseGraph(dependencies)).resolves.toEqual({
      ok: false,
      message: 'Frequency response graph not found.',
    })
    expect(dependencies.createObjectURL).not.toHaveBeenCalled()
  })

  it('serializes the graph clone and downloads a crisp PNG without retaining object URLs', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('data-fr-graph', '')
    svg.setAttribute('viewBox', '0 0 800 346')
    svg.setAttribute('style', 'background: rgb(17, 18, 19)')
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('fill', '#111213')
    svg.append(background)
    const { dependencies, context, sourceBlobs } = successfulDependencies(svg)

    await expect(exportFrequencyResponseGraph(dependencies)).resolves.toEqual({
      ok: true,
      message: 'Graph screenshot downloaded.',
    })

    expect(await sourceBlobs[0]!.text()).toContain('viewBox="0 0 800 346"')
    expect(await sourceBlobs[0]!.text()).toContain('width="1600"')
    expect(await sourceBlobs[0]!.text()).toContain('height="692"')
    expect(await sourceBlobs[0]!.text()).toContain('background: rgb(17, 18, 19)')
    expect(await sourceBlobs[0]!.text()).toContain('fill="#111213"')
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1_600, 692)
    expect(dependencies.triggerDownload).toHaveBeenCalledWith('blob:test-1', GRAPH_SCREENSHOT_FILENAME)
    expect(dependencies.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(svg).not.toHaveAttribute('width')
  })
})
