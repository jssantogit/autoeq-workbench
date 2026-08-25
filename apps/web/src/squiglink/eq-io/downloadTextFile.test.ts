import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from './downloadTextFile'

describe('downloadTextFile', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads a local text Blob and releases the temporary resources', async () => {
    const blobs: Blob[] = []
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test-download'
    })
    const revokeObjectURL = vi.fn()
    const fetchMock = vi.fn()
    const xhrMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', xhrMock)

    let clickedAnchor: HTMLAnchorElement | undefined
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true)
      clickedAnchor = this
    })

    downloadTextFile('filters.txt', 'Preamp: -4.2 dB', document, {
      createObjectURL,
      revokeObjectURL,
    })

    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = blobs[0]!
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/plain;charset=utf-8')
    expect(await blob.text()).toBe('Preamp: -4.2 dB')
    expect(clickedAnchor?.download).toBe('filters.txt')
    expect(clickedAnchor?.href).toBe('blob:test-download')
    expect(clickedAnchor?.isConnected).toBe(false)
    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-download')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(xhrMock).not.toHaveBeenCalled()
  })

  it('removes the anchor and revokes the object URL when clicking throws', () => {
    const revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed')
    })

    expect(() =>
      downloadTextFile('filters.txt', 'text', document, {
        createObjectURL: () => 'blob:test-error',
        revokeObjectURL,
      }),
    ).toThrow('click failed')

    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-error')
  })
})
