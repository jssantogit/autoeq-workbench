import type { Curve } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveAppearanceControls } from './CurveAppearanceControls'
import { CurveImport } from './CurveImport'
import { CurvesTab } from './CurvesTab'

const previousSource: Curve = {
  id: 'source-existing',
  name: 'Previous Source.csv',
  role: 'source',
  rawPoints: [
    { frequencyHz: 20, db: -1 },
    { frequencyHz: 20_000, db: 1 },
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
  const file = new File([], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: vi.fn(text) })
  return file
}

describe('CurveImport', () => {
  beforeEach(() => {
    workspaceStore.setState({ source: previousSource })
    uiStore.setState({
      sourceColor: '#1565c0',
      targetColor: '#c62828',
      sourceVisible: true,
      targetVisible: true,
      targetPresentation: 'measurement',
    })
  })

  it('assigns a fresh graph color only after a successful latest Source import', async () => {
    const initialColor = uiStore.getState().sourceColor
    render(<CurveImport role="source" />)
    const file = fileWithText('Source.txt', async () => '20 1\n20000 2')

    fireEvent.change(screen.getByLabelText('Replace Source curve'), {
      target: { files: [file] },
    })

    await screen.findByText('Source.txt')
    expect(uiStore.getState().sourceColor).not.toBe(initialColor)
    expect(workspaceStore.getState().source?.name).toBe('Source.txt')
  })

  it('reports a structured parse failure without replacing the previous curve', async () => {
    const initialColor = uiStore.getState().sourceColor
    render(<CurveImport role="source" />)
    const file = new File(['not curve data'], 'broken.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => 'not curve data' })

    fireEvent.change(screen.getByLabelText('Replace Source curve'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('[parse]')
    })
    expect(screen.getByText('Previous Source.csv')).toBeInTheDocument()
    expect(workspaceStore.getState().source).toBe(previousSource)
    expect(uiStore.getState().sourceColor).toBe(initialColor)
  })

  it('ignores an older slow success after a newer selection fails', async () => {
    const initialColor = uiStore.getState().sourceColor
    const olderRead = deferred<string>()
    const older = fileWithText('older.csv', () => olderRead.promise)
    const newer = fileWithText('newer.csv', async () => 'not curve data')
    render(<CurveImport role="source" />)
    const input = screen.getByLabelText('Replace Source curve')

    fireEvent.change(input, { target: { files: [older] } })
    fireEvent.change(input, { target: { files: [newer] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')

    await act(async () => {
      olderRead.resolve('20 10\n20000 12')
      await olderRead.promise
    })
    expect(workspaceStore.getState().source).toBe(previousSource)
    expect(uiStore.getState().sourceColor).toBe(initialColor)
    expect(screen.getByRole('alert')).toHaveTextContent('[parse]')
  })

  it('ignores an older slow error after a newer selection succeeds', async () => {
    const olderRead = deferred<string>()
    const older = fileWithText('older.csv', () => olderRead.promise)
    const newer = fileWithText('newer.csv', async () => '20 2\n20000 4')
    render(<CurveImport role="source" />)
    const input = screen.getByLabelText('Replace Source curve')

    fireEvent.change(input, { target: { files: [older] } })
    fireEvent.change(input, { target: { files: [newer] } })
    await screen.findByText('newer.csv')
    const latestColor = uiStore.getState().sourceColor
    expect(latestColor).not.toBe('#1565c0')

    await act(async () => {
      olderRead.reject(new Error('slow read failed'))
      await olderRead.promise.catch(() => undefined)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(workspaceStore.getState().source?.name).toBe('newer.csv')
    expect(uiStore.getState().sourceColor).toBe(latestColor)
  })
})

describe('CurveAppearanceControls', () => {
  beforeEach(() => {
    workspaceStore.setState({ source: previousSource })
    uiStore.setState({
      sourceColor: '#1565c0',
      targetColor: '#c62828',
      sourceVisible: true,
      targetVisible: true,
      targetPresentation: 'measurement',
    })
  })

  it('exposes accessible Source visibility and six-digit color controls', async () => {
    const user = userEvent.setup()
    const rawPoints = workspaceStore.getState().source?.rawPoints
    render(<CurveAppearanceControls role="source" />)

    await user.click(screen.getByRole('checkbox', { name: 'Show Source curve' }))
    expect(uiStore.getState().sourceVisible).toBe(false)

    fireEvent.change(screen.getByLabelText('Source curve color'), {
      target: { value: '#123456' },
    })
    expect(uiStore.getState().sourceColor).toBe('#123456')
    expect(workspaceStore.getState().source?.rawPoints).toBe(rawPoints)
  })

  it('retains the custom Target color while switching accessible presentation modes', async () => {
    const user = userEvent.setup()
    render(<CurveAppearanceControls role="target" />)

    expect(screen.getByRole('radio', { name: 'Measurement FR' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Reference target' }))

    expect(uiStore.getState().targetPresentation).toBe('reference')
    expect(uiStore.getState().targetColor).toBe('#c62828')
    expect(screen.getByRole('checkbox', { name: 'Show Target curve' })).toBeChecked()
  })
})

describe('CurvesTab', () => {
  it('presents a compact two-row curve manager with inline controls', () => {
    workspaceStore.setState({ source: null, target: null })
    render(<CurvesTab />)

    const manager = screen.getByRole('list', { name: 'Workspace curves' })
    const rows = within(manager).getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    const source = rows[0]!
    expect(within(source).getByText('Source')).toBeInTheDocument()
    expect(within(source).getByLabelText('Import Source curve')).toBeInTheDocument()
    expect(within(source).getByLabelText('Source curve color')).toBeInTheDocument()

    const target = rows[1]!
    expect(within(target).getByText('Target')).toBeInTheDocument()
    expect(within(target).getByLabelText('Import Target curve')).toBeInTheDocument()
    expect(within(target).getByRole('radio', { name: 'Reference target' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workspace normalization' })).toBeInTheDocument()
  })
})
