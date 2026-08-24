const GRAPH_SELECTOR = '[data-fr-graph]'
const EXPORT_WIDTH = 1_600
const EXPORT_HEIGHT = 692
const GRAPH_FONT_FAMILY = 'Open Sans, Segoe UI, system-ui, sans-serif'

export const GRAPH_SCREENSHOT_FILENAME = 'autoeq-workbench-fr.png'

export interface GraphScreenshotResult {
  ok: boolean
  message: string
}

export interface GraphScreenshotDependencies {
  findGraph: () => SVGSVGElement | null
  serialize: (svg: SVGSVGElement) => string
  createBlob: (parts: BlobPart[], options: BlobPropertyBag) => Blob
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  createImage: () => HTMLImageElement
  createCanvas: () => HTMLCanvasElement
  triggerDownload: (url: string, filename: string) => void
}

function browserDependencies(): GraphScreenshotDependencies | null {
  if (
    typeof document === 'undefined' ||
    typeof XMLSerializer === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined'
  ) return null

  return {
    findGraph: () => document.querySelector<SVGSVGElement>(GRAPH_SELECTOR),
    serialize: (svg) => new XMLSerializer().serializeToString(svg),
    createBlob: (parts, options) => new Blob(parts, options),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createImage: () => new Image(),
    createCanvas: () => document.createElement('canvas'),
    triggerDownload: (url, filename) => {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
    },
  }
}

function loadImage(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Unable to render the graph image.'))
    image.src = url
  })
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('Unable to encode the graph image.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export async function exportFrequencyResponseGraph(
  dependencies?: GraphScreenshotDependencies,
): Promise<GraphScreenshotResult> {
  const browser = dependencies ?? browserDependencies()
  if (browser === null) return { ok: false, message: 'Screenshot is unavailable in this browser.' }

  const graph = browser.findGraph()
  if (graph === null) return { ok: false, message: 'Frequency response graph not found.' }

  try {
    const clone = graph.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(EXPORT_WIDTH))
    clone.setAttribute('height', String(EXPORT_HEIGHT))
    clone.setAttribute('font-family', GRAPH_FONT_FAMILY)
    const source = browser.serialize(clone)
    const sourceUrl = browser.createObjectURL(browser.createBlob([source], { type: 'image/svg+xml;charset=utf-8' }))
    let image: HTMLImageElement | null = null

    try {
      image = browser.createImage()
      await loadImage(image, sourceUrl)
    } finally {
      browser.revokeObjectURL(sourceUrl)
    }
    if (image === null) return { ok: false, message: 'Screenshot image is unavailable.' }

    const canvas = browser.createCanvas()
    canvas.width = EXPORT_WIDTH
    canvas.height = EXPORT_HEIGHT
    const context = canvas.getContext('2d')
    if (context === null) return { ok: false, message: 'Screenshot canvas is unavailable.' }
    context.drawImage(image, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)

    const png = await canvasToPng(canvas)
    const downloadUrl = browser.createObjectURL(png)
    try {
      browser.triggerDownload(downloadUrl, GRAPH_SCREENSHOT_FILENAME)
    } finally {
      browser.revokeObjectURL(downloadUrl)
    }
    return { ok: true, message: 'Graph screenshot downloaded.' }
  } catch {
    return { ok: false, message: 'Unable to create graph screenshot.' }
  }
}
