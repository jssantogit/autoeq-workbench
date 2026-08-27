import {
  calculatePreampDb,
  formatEqualizerApoFilters,
  formatGraphicEq,
  formatPowerampText,
  MVP_NUMERIC_POLICY,
  parseEqualizerApoFilters,
  type Curve,
  type Filter,
} from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveWorkspace, workspaceStore } from '../../state/workspaceStore'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { FilterIoControls } from './FilterIoControls'

vi.mock('@autoeq-workbench/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@autoeq-workbench/core')>()
  return { ...actual, parseEqualizerApoFilters: vi.fn(actual.parseEqualizerApoFilters) }
})

vi.mock('../../squiglink/eq-io/downloadTextFile', () => ({ downloadTextFile: vi.fn() }))

const existingFilters: Filter[] = [
  { id: 'existing', enabled: true, type: 'HS', frequencyHz: 8_000, gainDb: 1, q: 0.8 },
]

const mixedFilters: Filter[] = [
  { id: 'f-1', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 3, q: 1.41 },
  { id: 'f-2', enabled: false, type: 'HS', frequencyHz: 10_000, gainDb: -4, q: 0.71 },
]

const activeFr: Curve = {
  id: 'fr-1',
  name: 'Studio/Left:Take?',
  kind: 'fr',
  rawPoints: [
    { frequencyHz: 20, db: 0 },
    { frequencyHz: 20_000, db: 0 },
  ],
  metadata: {},
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function fileWithText(name: string, text: () => Promise<string>) {
  const file = new File([], name, { type: 'text/plain' })
  Object.defineProperty(file, 'text', { value: vi.fn(text) })
  return file
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText('Import Equalizer APO filters'), {
    target: { files: [file] },
  })
}

describe('FilterIoControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      filters: existingFilters,
      selectedFilterId: existingFilters[0]!.id,
      filterProvenance: 'manual',
      solutionState: 'modified',
      canUndo: false,
      canRedo: false,
    })
  })

  it('uses one local hidden text input and opens it from Import', async () => {
    const user = userEvent.setup()
    const { container } = render(<FilterIoControls />)
    const input = container.querySelector('input[type="file"]')
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1)
    expect(input).toHaveAttribute('accept', '.txt,text/plain')
    expect(input).toHaveAttribute('hidden')
    const click = vi.spyOn(input as HTMLInputElement, 'click')

    await user.click(screen.getByRole('button', { name: 'Import' }))

    expect(click).toHaveBeenCalledOnce()
  })

  it('imports once into canonical filters, ignores imported preamp, and preserves order and OFF state', async () => {
    const replace = workspaceStore.getState().replaceFiltersFromImport
    const replaceSpy = vi.fn(replace)
    const text = [
      'Preamp: -4.0 dB',
      'Filter 1: OFF PK Fc 1000 Hz Gain 2.0 dB Q 1.000',
      'Filter 2: ON LSC Fc 105 Hz Gain -3.0 dB Q 0.700',
    ].join('\n')
    workspaceStore.setState({ replaceFiltersFromImport: replaceSpy })
    render(<FilterIoControls />)
    selectFile(fileWithText('filters.txt', async () => text))

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledOnce())
    expect(parseEqualizerApoFilters).toHaveBeenCalledOnce()
    expect(parseEqualizerApoFilters).toHaveBeenCalledWith(text)
    const filters = workspaceStore.getState().filters
    expect(filters.map(({ id, enabled, type }) => ({ id, enabled, type }))).toEqual([
      { id: expect.any(String), enabled: false, type: 'PK' },
      { id: expect.any(String), enabled: true, type: 'LS' },
    ])
    expect(new Set(filters.map(({ id }) => id)).size).toBe(2)
    expect(filters.every(({ id }) => id !== 'existing')).toBe(true)
    const expectedPreamp = calculatePreampDb(filters, MVP_NUMERIC_POLICY.sampleRateHz).preampDb
    expect(deriveWorkspace(workspaceStore.getState()).preamp?.preampDb).toBe(expectedPreamp)
    expect(expectedPreamp).not.toBe(-4)
    expect(screen.getByLabelText('Import Equalizer APO filters')).toHaveValue('')
  })

  it.each([
    ['malformed', 'Filter 1: ON PK 1000 Hz Gain 1 dB Q 1', '[parse]'],
    ['out of bounds', 'Filter 1: ON PK Fc 19 Hz Gain 1 dB Q 1', '[validation]'],
    ['over 64', Array.from({ length: 65 }, (_, index) =>
      `Filter ${index + 1}: ON PK Fc 1000 Hz Gain 0 dB Q 1`).join('\n'), '[validation]'],
  ])('keeps exact filters and reports a structured error for %s input', async (_name, text, category) => {
    const before = workspaceStore.getState().filters
    render(<FilterIoControls />)
    selectFile(fileWithText('bad.txt', async () => text))

    expect(await screen.findByRole('alert')).toHaveTextContent(category)
    expect(workspaceStore.getState().filters).toBe(before)
    expect(screen.getByLabelText('Import Equalizer APO filters')).toHaveValue('')
  })

  it('ignores an older slow success after a newer read errors', async () => {
    const older = deferred<string>()
    render(<FilterIoControls />)
    selectFile(fileWithText('older.txt', () => older.promise))
    selectFile(fileWithText('newer.txt', async () => 'bad'))
    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')

    await act(async () => {
      older.resolve('Filter 1: ON PK Fc 1000 Hz Gain 2 dB Q 1')
      await older.promise
    })

    expect(workspaceStore.getState().filters).toEqual(existingFilters)
  })

  it('ignores an older slow error after a newer selection succeeds', async () => {
    const older = deferred<string>()
    render(<FilterIoControls />)
    selectFile(fileWithText('older.txt', () => older.promise))
    selectFile(fileWithText('newer.txt', async () =>
      'Filter 1: ON PK Fc 2000 Hz Gain 3 dB Q 1'))
    await waitFor(() => expect(workspaceStore.getState().filters[0]?.frequencyHz).toBe(2_000))

    await act(async () => {
      older.reject(new Error('late read failure'))
      await older.promise.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(workspaceStore.getState().filters[0]?.frequencyHz).toBe(2_000)
  })

  it('exposes exact destination choices in an accessible select', () => {
    render(<FilterIoControls />)
    const select = screen.getByRole('combobox', { name: /export/i })
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent)
    expect(options).toEqual(['Equalizer APO', 'Poweramp', 'Wavelet'])
  })

  it('downloads exact APO, Poweramp, and Wavelet outputs with correct suffixes, safety preamp, and disabled filter exclusion', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    const xhr = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', xhr)

    workspaceStore.setState({ curves: [activeFr], activeFrId: activeFr.id, filters: mixedFilters })
    render(<FilterIoControls />)

    const select = screen.getByRole('combobox', { name: /export/i })
    const exportButton = screen.getByRole('button', { name: 'Export' })
    const expectedPreamp = calculatePreampDb(mixedFilters, MVP_NUMERIC_POLICY.sampleRateHz).preampDb

    // 1. Equalizer APO
    await user.selectOptions(select, 'Equalizer APO')
    await user.click(exportButton)

    expect(downloadTextFile).toHaveBeenNthCalledWith(
      1,
      'Studio_Left_Take_ Equalizer APO.txt',
      formatEqualizerApoFilters(mixedFilters, expectedPreamp),
    )
    const apoOutput = vi.mocked(downloadTextFile).mock.calls[0]![1]
    expect(apoOutput).toContain(`Preamp: ${expectedPreamp.toFixed(1)} dB`)
    expect(apoOutput).toContain('Filter 1: ON PK Fc 1000 Hz Gain 3.0 dB Q 1.410')
    expect(apoOutput).not.toContain('10000')
    expect(apoOutput).not.toContain('HSC')

    // 2. Poweramp
    await user.selectOptions(select, 'Poweramp')
    await user.click(exportButton)

    expect(downloadTextFile).toHaveBeenNthCalledWith(
      2,
      'Studio_Left_Take_ Poweramp.txt',
      formatPowerampText({
        name: activeFr.name,
        preampDb: expectedPreamp,
        filters: mixedFilters,
      }),
    )
    const powerampOutput = vi.mocked(downloadTextFile).mock.calls[1]![1]
    expect(powerampOutput).toContain('# AutoEQ Workbench — Studio/Left:Take?')
    expect(powerampOutput).toContain('# Poweramp-style manual-entry preset')
    expect(powerampOutput).toContain(`Preamp: ${expectedPreamp.toFixed(1)} dB`)
    expect(powerampOutput).toContain('Filter 1: ON PK Fc 1000 Hz Gain 3.0 dB Q 1.41')
    expect(powerampOutput).not.toContain('10000')
    expect(powerampOutput).not.toContain('HS')

    // 3. Wavelet
    await user.selectOptions(select, 'Wavelet')
    await user.click(exportButton)

    expect(downloadTextFile).toHaveBeenNthCalledWith(
      3,
      'Studio_Left_Take_ Wavelet GraphicEQ.txt',
      formatGraphicEq(mixedFilters, MVP_NUMERIC_POLICY.sampleRateHz),
    )
    const waveletOutput = vi.mocked(downloadTextFile).mock.calls[2]![1]
    expect(waveletOutput).toMatch(/^GraphicEQ: /)
    expect(waveletOutput).toBe(formatGraphicEq([mixedFilters[0]!], MVP_NUMERIC_POLICY.sampleRateHz))

    // Assert filenames end with exact suffixes from brief
    expect(vi.mocked(downloadTextFile).mock.calls[0]![0]).toMatch(/ Equalizer APO\.txt$/)
    expect(vi.mocked(downloadTextFile).mock.calls[1]![0]).toMatch(/ Poweramp\.txt$/)
    expect(vi.mocked(downloadTextFile).mock.calls[2]![0]).toMatch(/ Wavelet GraphicEQ\.txt$/)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
  })

  it('uses the Workbench filename fallback for all destinations when there is no active FR', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ curves: [], activeFrId: null, filters: existingFilters })
    render(<FilterIoControls />)

    const select = screen.getByRole('combobox', { name: /export/i })
    const exportButton = screen.getByRole('button', { name: 'Export' })

    await user.selectOptions(select, 'Equalizer APO')
    await user.click(exportButton)
    expect(downloadTextFile).toHaveBeenNthCalledWith(
      1,
      'Workbench Equalizer APO.txt',
      expect.stringMatching(/^Preamp: /),
    )

    await user.selectOptions(select, 'Poweramp')
    await user.click(exportButton)
    expect(downloadTextFile).toHaveBeenNthCalledWith(
      2,
      'Workbench Poweramp.txt',
      expect.stringContaining('# AutoEQ Workbench — Workbench'),
    )

    await user.selectOptions(select, 'Wavelet')
    await user.click(exportButton)
    expect(downloadTextFile).toHaveBeenNthCalledWith(
      3,
      'Workbench Wavelet GraphicEQ.txt',
      expect.stringMatching(/^GraphicEQ: /),
    )
  })

  it('disables export with no filters', () => {
    workspaceStore.setState({ filters: [] })
    render(<FilterIoControls />)

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(downloadTextFile).not.toHaveBeenCalled()
  })

  it('exports Poweramp successfully when active FR contains CR/LF without injecting directives', async () => {
    const user = userEvent.setup()
    const newlineFr: Curve = {
      ...activeFr,
      name: 'Studio/Left\r\n:Take?\nSecond Line',
    }
    workspaceStore.setState({ curves: [newlineFr], activeFrId: newlineFr.id, filters: mixedFilters })
    render(<FilterIoControls />)

    const select = screen.getByRole('combobox', { name: /export/i })
    const exportButton = screen.getByRole('button', { name: 'Export' })

    await user.selectOptions(select, 'Poweramp')
    await user.click(exportButton)

    expect(downloadTextFile).toHaveBeenCalledOnce()
    const [filename, content] = vi.mocked(downloadTextFile).mock.calls[0]!
    expect(filename).toBe('Studio_Left___Take__Second Line Poweramp.txt')
    expect(content).toContain('# AutoEQ Workbench — Studio/Left :Take? Second Line\n# Poweramp-style manual-entry preset')
    expect(content).not.toContain('\r')
    expect(content).not.toContain(':Take?\nSecond Line')
  })

  it('handles unmount cleanup while import is pending without state update or mutation', async () => {
    const deferredRead = deferred<string>()
    const { unmount } = render(<FilterIoControls />)

    selectFile(fileWithText('pending.txt', () => deferredRead.promise))
    unmount()

    await act(async () => {
      deferredRead.resolve('Filter 1: ON PK Fc 2000 Hz Gain 3 dB Q 1')
      await deferredRead.promise
    })

    expect(workspaceStore.getState().filters).toEqual(existingFilters)
  })

  it('resets file input immediately so same-file reselection fires while pending', async () => {
    const firstRead = deferred<string>()
    render(<FilterIoControls />)

    const file = fileWithText('same.txt', () => firstRead.promise)
    selectFile(file)

    const input = screen.getByLabelText('Import Equalizer APO filters') as HTMLInputElement
    expect(input.value).toBe('')

    selectFile(fileWithText('same.txt', async () => 'Filter 1: ON PK Fc 3000 Hz Gain 2 dB Q 1'))

    await waitFor(() => {
      expect(workspaceStore.getState().filters[0]?.frequencyHz).toBe(3_000)
    })

    await act(async () => {
      firstRead.resolve('Filter 1: ON PK Fc 1000 Hz Gain 1 dB Q 1')
      await firstRead.promise
    })

    expect(workspaceStore.getState().filters[0]?.frequencyHz).toBe(3_000)
  })

  it('masks unknown native file read errors with a safe public error message', async () => {
    render(<FilterIoControls />)
    selectFile(fileWithText('secret.txt', async () => {
      throw new Error('/var/secrets/keys.txt: permission denied')
    }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Unable to read filter file')
    expect(alert).not.toHaveTextContent('/var/secrets/keys.txt')
    expect(workspaceStore.getState().filters).toEqual(existingFilters)
  })
})
