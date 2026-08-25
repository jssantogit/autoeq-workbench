import { parseCurveText, type Curve, type CurveKind } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'
import { CurvesTab } from './CurvesTab'

vi.mock('@autoeq-workbench/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@autoeq-workbench/core')>()
  return { ...actual, parseCurveText: vi.fn(actual.parseCurveText) }
})

const curves: Curve[] = ['Source.csv', 'Target.csv', 'Overlay.csv'].map((name, index) => ({
  id: `curve-${index}`,
  name,
  kind: index === 1 ? 'target' : 'fr',
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

async function chooseKind(user: ReturnType<typeof userEvent.setup>, kind: CurveKind) {
  await user.click(screen.getByRole('button', { name: 'Import FR / Target' }))
  const chooser = screen.getByRole('group', { name: 'Curve type' })
  await user.click(within(chooser).getByRole('button', { name: kind === 'fr' ? 'FR' : 'Target' }))
}

describe('CurveImport', () => {
  beforeEach(() => {
    vi.mocked(parseCurveText).mockClear()
    workspaceStore.setState({ curves: [], activeFrId: null, activeTargetId: null })
    uiStore.setState({ curveAppearance: {} })
  })

  it('uses one import entry point and requires an explicit kind before file selection', async () => {
    const user = userEvent.setup()
    render(<CurveImport />)

    expect(screen.getByRole('button', { name: 'Import FR / Target' })).toBeVisible()
    expect(screen.queryByText('Upload FR')).not.toBeInTheDocument()
    expect(screen.queryByText('Upload Target')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Curve type' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import FR / Target' }))
    const chooser = screen.getByRole('group', { name: 'Curve type' })
    expect(within(chooser).getByRole('button', { name: 'FR' })).toBeVisible()
    expect(within(chooser).getByRole('button', { name: 'Target' })).toBeVisible()
  })

  it.each([
    ['fr', 'FR'],
    ['target', 'Target'],
  ] as const)('adds an explicitly selected %s curve and registers appearance', async (kind, _label) => {
    const user = userEvent.setup()
    render(<CurveImport />)
    await chooseKind(user, kind)
    fireEvent.change(screen.getByLabelText('Curve file'), {
      target: { files: [fileWithText('Measurement.txt', async () => '20 1\n20000 2')] },
    })

    await waitFor(() => expect(workspaceStore.getState().curves).toHaveLength(1))
    const curve = workspaceStore.getState().curves[0]!
    expect(parseCurveText).toHaveBeenCalledWith(expect.any(String), {
      name: 'Measurement.txt',
      kind,
    })
    expect(curve).toMatchObject({ name: 'Measurement.txt', kind })
    expect(uiStore.getState().curveAppearance[curve.id]).toMatchObject({ visible: true })
  })

  it('does not infer a generic txt file as FR or Target', () => {
    render(<CurveImport />)
    fireEvent.change(screen.getByLabelText('Curve file'), {
      target: { files: [fileWithText('generic.txt', async () => '20 1\n20000 2')] },
    })

    expect(parseCurveText).not.toHaveBeenCalled()
    expect(workspaceStore.getState().curves).toEqual([])
  })

  it('reports structured errors without adding or registering a curve', async () => {
    const user = userEvent.setup()
    render(<CurveImport />)
    await chooseKind(user, 'target')
    fireEvent.change(screen.getByLabelText('Curve file'), {
      target: { files: [fileWithText('broken.csv', async () => 'not curve data')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')
    expect(workspaceStore.getState().curves).toEqual([])
    expect(uiStore.getState().curveAppearance).toEqual({})
  })

  it('does not register appearance when the parsed curve ID is rejected as a duplicate', async () => {
    const user = userEvent.setup()
    const duplicate = curves[0]!
    workspaceStore.setState({ curves: [duplicate], activeFrId: duplicate.id, activeTargetId: null })
    vi.mocked(parseCurveText).mockReturnValueOnce(duplicate)
    render(<CurveImport />)
    await chooseKind(user, 'fr')
    fireEvent.change(screen.getByLabelText('Curve file'), {
      target: { files: [fileWithText('duplicate.csv', async () => '20 1\n20000 2')] },
    })

    await waitFor(() => expect(parseCurveText).toHaveBeenCalled())
    expect(workspaceStore.getState().curves).toEqual([duplicate])
    expect(uiStore.getState().curveAppearance).toEqual({})
  })

  it('ignores an older slow success after a newer explicit selection fails', async () => {
    const user = userEvent.setup()
    const olderRead = deferred<string>()
    render(<CurveImport />)
    await chooseKind(user, 'fr')
    const input = screen.getByLabelText('Curve file')
    fireEvent.change(input, { target: { files: [fileWithText('older.csv', () => olderRead.promise)] } })
    await chooseKind(user, 'fr')
    fireEvent.change(input, { target: { files: [fileWithText('newer.csv', async () => 'bad')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('[parse]')

    await act(async () => {
      olderRead.resolve('20 1\n20000 2')
      await olderRead.promise
    })
    expect(workspaceStore.getState().curves).toEqual([])
    expect(uiStore.getState().curveAppearance).toEqual({})
  })

  it('ignores an older slow error after a newer explicit selection succeeds', async () => {
    const user = userEvent.setup()
    const olderRead = deferred<string>()
    render(<CurveImport />)
    await chooseKind(user, 'fr')
    const input = screen.getByLabelText('Curve file')
    fireEvent.change(input, { target: { files: [fileWithText('older.csv', () => olderRead.promise)] } })
    await chooseKind(user, 'fr')
    fireEvent.change(input, {
      target: { files: [fileWithText('newer.csv', async () => '20 2\n20000 4')] },
    })
    await waitFor(() => expect(workspaceStore.getState().curves[0]?.name).toBe('newer.csv'))

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
      curves,
      activeFrId: curves[0]!.id,
      activeTargetId: curves[1]!.id,
    })
    uiStore.setState({ curveAppearance: {} })
    for (const curve of curves) uiStore.getState().registerCurve(curve.id)
  })

  it('renders the source manager table skeleton and one import action', () => {
    render(<CurvesTab />)
    const workspace = screen.getByRole('region', { name: 'Curves workspace' })
    const table = within(workspace).getByRole('table', { name: 'Curve manager' })

    expect(within(workspace).getByRole('button', { name: 'Import FR / Target' })).toBeVisible()
    expect(within(workspace).queryByText('Upload FR')).not.toBeInTheDocument()
    expect(within(workspace).queryByText('Upload Target')).not.toBeInTheDocument()
    expect(table.querySelector(':scope > tbody > tr > td')).toBeInTheDocument()
    expect(table.querySelectorAll(':scope > colgroup > col')).toHaveLength(7)
    expect(Array.from(table.querySelectorAll(':scope > colgroup > col')).map((col) => col.className)).toEqual([
      'remove',
      'phoneId',
      'key',
      'calibrate',
      'baselineButton',
      'hideButton',
      'lastColumn',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('Source.csv')).toBeInTheDocument()
    expect(within(table).getByText('Target.csv')).toBeInTheDocument()
    expect(within(table).getByText('Overlay.csv')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /set source.csv as active fr/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).getByRole('button', { name: /set target.csv as active target/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers color only for FR rows and keeps visibility, removal, and active fallback functional', async () => {
    const user = userEvent.setup()
    render(<CurvesTab />)
    const overlayRow = screen.getByText('Overlay.csv').closest('tr')!
    await user.click(within(overlayRow).getByLabelText('Overlay.csv visible'))
    expect(uiStore.getState().curveAppearance['curve-2']?.visible).toBe(false)
    fireEvent.change(within(overlayRow).getByLabelText('Overlay.csv color'), {
      target: { value: '#123456' },
    })
    expect(uiStore.getState().curveAppearance['curve-2']?.color).toBe('#123456')

    const targetRow = screen.getByText('Target.csv').closest('tr')!
    expect(within(targetRow).queryByLabelText('Target.csv color')).not.toBeInTheDocument()
    expect(within(targetRow).getByRole('button', { name: 'Rename Target.csv' })).toBeInTheDocument()
    expect(within(targetRow).getByRole('button', { name: 'Remove Target.csv' })).toBeInTheDocument()

    const sourceRow = screen.getByText('Source.csv').closest('tr')!
    await user.click(within(sourceRow).getByRole('button', { name: 'Remove Source.csv' }))
    expect(workspaceStore.getState().curves).toHaveLength(2)
    expect(workspaceStore.getState().activeFrId).toBe('curve-2')
    expect(uiStore.getState().curveAppearance['curve-0']).toBeUndefined()
  })

  it('keeps an empty manager compact and renders six or more rows in the same table', () => {
    const manyCurves = Array.from({ length: 8 }, (_, index): Curve => ({
      ...curves[0]!,
      id: `many-${index}`,
      name: `Curve ${index}`,
      kind: index < 6 ? 'fr' : 'target',
    }))
    workspaceStore.setState({ curves: manyCurves, activeFrId: null, activeTargetId: null })
    const { rerender } = render(<CurvesTab />)

    expect(within(screen.getByRole('table', { name: 'Curve manager' })).getAllByRole('row')).toHaveLength(8)

    workspaceStore.setState({ curves: [], activeFrId: null, activeTargetId: null })
    rerender(<CurvesTab />)
    expect(screen.queryByText('No curves loaded')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import FR / Target' })).toBeVisible()
    const emptyTable = screen.getByRole('table', { name: 'Curve manager' })
    expect(within(emptyTable).queryAllByRole('row')).toHaveLength(0)
    expect(emptyTable.querySelector('tbody.curves')).toBeEmptyDOMElement()
  })
})
