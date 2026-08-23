import type { Curve } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'
import { CurvesTab } from './CurvesTab'

const curves: Curve[] = ['Source.csv', 'Target.csv', 'Overlay.csv'].map((name, index) => ({
  id: `curve-${index}`,
  name,
  role: 'comparison',
  rawPoints: [
    { frequencyHz: 20, db: index },
    { frequencyHz: 20_000, db: index + 1 },
  ],
  metadata: {},
}))

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
    workspaceStore.setState({ curves: [] })
    uiStore.setState({ curveAppearance: {} })
  })

  it('adds a generic curve and registers appearance only after a successful parse', async () => {
    render(<CurveImport />)
    fireEvent.change(screen.getByLabelText('+ Curve'), {
      target: { files: [fileWithText('Measurement.txt', async () => '20 1\n20000 2')] },
    })

    await waitFor(() => expect(workspaceStore.getState().curves).toHaveLength(1))
    const entry = workspaceStore.getState().curves[0]!
    expect(entry).toMatchObject({ curve: { name: 'Measurement.txt', role: 'comparison' }, role: 'source' })
    expect(uiStore.getState().curveAppearance[entry.curve.id]).toMatchObject({ visible: true })
  })

  it('reports structured errors without adding or registering a curve', async () => {
    render(<CurveImport />)
    fireEvent.change(screen.getByLabelText('+ Curve'), {
      target: { files: [fileWithText('broken.csv', async () => 'not curve data')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')
    expect(workspaceStore.getState().curves).toEqual([])
    expect(uiStore.getState().curveAppearance).toEqual({})
  })

  it('ignores an older slow success after a newer selection fails', async () => {
    const olderRead = deferred<string>()
    render(<CurveImport />)
    const input = screen.getByLabelText('+ Curve')
    fireEvent.change(input, { target: { files: [fileWithText('older.csv', () => olderRead.promise)] } })
    fireEvent.change(input, { target: { files: [fileWithText('newer.csv', async () => 'bad')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')

    await act(async () => {
      olderRead.resolve('20 1\n20000 2')
      await olderRead.promise
    })
    expect(workspaceStore.getState().curves).toEqual([])
    expect(uiStore.getState().curveAppearance).toEqual({})
  })

  it('ignores an older slow error after a newer selection succeeds', async () => {
    const olderRead = deferred<string>()
    render(<CurveImport />)
    const input = screen.getByLabelText('+ Curve')
    fireEvent.change(input, { target: { files: [fileWithText('older.csv', () => olderRead.promise)] } })
    fireEvent.change(input, {
      target: { files: [fileWithText('newer.csv', async () => '20 2\n20000 4')] },
    })
    await waitFor(() => expect(workspaceStore.getState().curves[0]?.curve.name).toBe('newer.csv'))

    await act(async () => {
      olderRead.reject(new Error('slow read failed'))
      await olderRead.promise.catch(() => undefined)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(workspaceStore.getState().curves).toHaveLength(1)
  })
})

describe('CurvesTab', () => {
  beforeEach(() => {
    workspaceStore.setState({
      curves: curves.map((curve, index) => ({
        curve,
        role: index === 0 ? 'source' : index === 1 ? 'target' : null,
      })),
    })
    uiStore.setState({ curveAppearance: {} })
    for (const curve of curves) uiStore.getState().registerCurve(curve.id)
  })

  it('renders a dense N-row list including an extra Comparison row and one global normalization', () => {
    render(<CurvesTab />)
    const rows = within(screen.getByRole('list', { name: 'Workspace curves' })).getAllByRole('listitem')

    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('Source')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Target')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Comparison')).toBeInTheDocument()
    expect(screen.queryByLabelText('+ Curve')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workspace normalization' })).toBeInTheDocument()
  })

  it('performs role, visibility, color, inline rename, and remove operations from a compact row menu', async () => {
    const user = userEvent.setup()
    render(<CurvesTab />)
    const overlayRow = screen.getByText('Overlay.csv').closest('li')!
    await user.click(within(overlayRow).getByLabelText('Actions for Overlay.csv'))
    await user.click(within(overlayRow).getByRole('button', { name: 'Set as Reference Target' }))
    expect(workspaceStore.getState().curves[2]?.role).toBe('reference')

    await user.click(within(overlayRow).getByLabelText('Show Overlay.csv'))
    expect(uiStore.getState().curveAppearance['curve-2']?.visible).toBe(false)
    fireEvent.change(within(overlayRow).getByLabelText('Overlay.csv color'), {
      target: { value: '#123456' },
    })
    expect(uiStore.getState().curveAppearance['curve-2']?.color).toBe('#123456')

    const rename = within(overlayRow).getByLabelText('Rename Overlay.csv')
    await user.clear(rename)
    await user.type(rename, 'Room reference')
    await user.click(within(overlayRow).getByRole('button', { name: 'Save name' }))
    expect(workspaceStore.getState().curves[2]?.curve.name).toBe('Room reference')

    await user.click(within(overlayRow).getByRole('button', { name: 'Remove' }))
    expect(workspaceStore.getState().curves).toHaveLength(2)
    expect(uiStore.getState().curveAppearance['curve-2']).toBeUndefined()
  })
})
