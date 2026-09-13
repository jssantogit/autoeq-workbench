import {
  DEFAULT_AUTOEQ_SETTINGS,
  type Curve,
  type Filter,
} from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkbenchSessionFromWorkspace,
  serializeWorkbenchSession,
  type WorkbenchSessionV1,
} from '../../session/workbenchSession'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { autoEqRunStore } from '../../state/autoeqRunStore'
import { eqCompareStore } from '../../state/eqCompareStore'
import { workspaceStore } from '../../state/workspaceStore'
import { SessionControls } from './SessionControls'

vi.mock('../../squiglink/eq-io/downloadTextFile', () => ({ downloadTextFile: vi.fn() }))

const testCurve: Curve = {
  id: 'fr-1',
  name: 'Studio/Left:Take?',
  kind: 'fr',
  rawPoints: [
    { frequencyHz: 20, db: 1 },
    { frequencyHz: 1_000, db: 2 },
    { frequencyHz: 20_000, db: 3 },
  ],
  metadata: {},
}

const testTarget: Curve = {
  id: 'target-1',
  name: 'Target Harman',
  kind: 'target',
  rawPoints: [
    { frequencyHz: 20, db: 0 },
    { frequencyHz: 1_000, db: 0 },
    { frequencyHz: 20_000, db: 0 },
  ],
  metadata: {},
}

const testFilter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: -2.5,
  q: 1.41,
}

function validSessionFixture(): WorkbenchSessionV1 {
  return {
    schemaVersion: 1,
    curves: [testCurve, testTarget],
    activeFrId: testCurve.id,
    activeTargetId: testTarget.id,
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    filters: [testFilter],
    filterProvenance: 'manual',
    solutionState: 'clean',
    autoEqRun: null,
  }
}

function fileWithText(name: string, text: () => Promise<string>) {
  const file = new File([], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: vi.fn(text) })
  return file
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText('Import Workbench session'), {
    target: { files: [file] },
  })
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

describe('SessionControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    autoEqRunStore.getState().reset()
    eqCompareStore.getState().clear()
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
      filters: [],
      selectedFilterId: null,
      filterProvenance: null,
      solutionState: 'clean',
      autoEqRun: null,
      canUndo: false,
      canRedo: false,
    })
  })

  it('renders a Session section with accessible Import and Export actions', async () => {
    const user = userEvent.setup()
    const { container } = render(<SessionControls />)

    expect(screen.getByRole('heading', { name: 'Session' })).toBeVisible()
    const exportBtn = screen.getByRole('button', { name: 'Export Session' })
    const importBtn = screen.getByRole('button', { name: 'Import Session' })
    expect(exportBtn).toBeVisible()
    expect(importBtn).toBeVisible()

    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('aria-label', 'Import Workbench session')
    expect(input).toHaveAttribute('accept', '.autoeq-workbench.json,.json,application/json')
    expect(input).toHaveAttribute('hidden')

    const click = vi.spyOn(input as HTMLInputElement, 'click')
    await user.click(importBtn)
    expect(click).toHaveBeenCalledOnce()
  })

  it('exports authoritative session deterministically with sanitized active FR filename', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      curves: [testCurve, testTarget],
      activeFrId: testCurve.id,
      activeTargetId: testTarget.id,
      filters: [testFilter],
      filterProvenance: 'manual',
      solutionState: 'clean',
    })

    render(<SessionControls />)
    await user.click(screen.getByRole('button', { name: 'Export Session' }))

    const expectedSession = createWorkbenchSessionFromWorkspace(workspaceStore.getState())
    const expectedJson = serializeWorkbenchSession(expectedSession)

    expect(downloadTextFile).toHaveBeenCalledOnce()
    expect(downloadTextFile).toHaveBeenCalledWith(
      'Studio_Left_Take_.autoeq-workbench.json',
      expectedJson,
    )
    expect(expectedJson.endsWith('\n')).toBe(true)
  })

  it('uses Workbench.autoeq-workbench.json fallback filename when no active FR', async () => {
    const user = userEvent.setup()
    render(<SessionControls />)

    await user.click(screen.getByRole('button', { name: 'Export Session' }))

    expect(downloadTextFile).toHaveBeenCalledWith(
      'Workbench.autoeq-workbench.json',
      expect.any(String),
    )
  })

  it('imports valid session file, updates workspace atomically, and resets input value', async () => {
    const fixture = validSessionFixture()
    const jsonText = JSON.stringify(fixture, null, 2)

    render(<SessionControls />)
    selectFile(fileWithText('session.autoeq-workbench.json', async () => jsonText))

    await waitFor(() => {
      expect(workspaceStore.getState().curves).toHaveLength(2)
    })

    const state = workspaceStore.getState()
    expect(state.activeFrId).toBe(testCurve.id)
    expect(state.activeTargetId).toBe(testTarget.id)
    expect(state.filters).toEqual([testFilter])
    expect(state.filterProvenance).toBe('manual')
    expect(state.solutionState).toBe('clean')
    expect(screen.getByLabelText('Import Workbench session')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancels active AutoEQ run when importing session', async () => {
    autoEqRunStore.getState().start('run-1')
    expect(autoEqRunStore.getState().activeRunId).toBe('run-1')

    const fixture = validSessionFixture()
    render(<SessionControls />)
    selectFile(fileWithText('session.autoeq-workbench.json', async () => JSON.stringify(fixture)))

    await waitFor(() => {
      expect(workspaceStore.getState().curves).toHaveLength(2)
    })

    expect(autoEqRunStore.getState().activeRunId).toBeNull()
    expect(autoEqRunStore.getState().status).toBe('idle')
  })

  it('rejects invalid session file with public error and leaves workspace completely unchanged', async () => {
    const initialCurves = [testCurve]
    const initialFilters = [testFilter]
    workspaceStore.setState({
      curves: initialCurves,
      activeFrId: testCurve.id,
      filters: initialFilters,
      filterProvenance: 'manual',
      solutionState: 'clean',
    })

    render(<SessionControls />)
    selectFile(fileWithText('invalid.json', async () => JSON.stringify({ schemaVersion: 999 })))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported schema version/i)
    expect(workspaceStore.getState().curves).toBe(initialCurves)
    expect(workspaceStore.getState().filters).toBe(initialFilters)
    expect(screen.getByLabelText('Import Workbench session')).toHaveValue('')
  })

  it('ignores older slow read when a newer selection occurs', async () => {
    const older = deferred<string>()
    render(<SessionControls />)

    selectFile(fileWithText('older.json', () => older.promise))
    selectFile(fileWithText('newer.json', async () => 'not json'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid Workbench session/i)

    const fixture = validSessionFixture()
    await act(async () => {
      older.resolve(JSON.stringify(fixture))
      await older.promise
    })

    expect(workspaceStore.getState().curves).toEqual([])
  })

  it('handles unmount cleanup while import is pending without state update or mutation', async () => {
    const deferredRead = deferred<string>()
    const { unmount } = render(<SessionControls />)

    selectFile(fileWithText('pending.json', () => deferredRead.promise))
    unmount()

    const fixture = validSessionFixture()
    await act(async () => {
      deferredRead.resolve(JSON.stringify(fixture))
      await deferredRead.promise
    })

    expect(workspaceStore.getState().curves).toEqual([])
  })

  it('resets file input immediately so same-file reselection fires while pending', async () => {
    const firstRead = deferred<string>()
    render(<SessionControls />)

    selectFile(fileWithText('same.json', () => firstRead.promise))

    const input = screen.getByLabelText('Import Workbench session') as HTMLInputElement
    expect(input.value).toBe('')

    const fixture = validSessionFixture()
    selectFile(fileWithText('same.json', async () => JSON.stringify(fixture)))

    await waitFor(() => {
      expect(workspaceStore.getState().curves).toHaveLength(2)
    })

    await act(async () => {
      firstRead.resolve(JSON.stringify({ ...fixture, curves: [] }))
      await firstRead.promise
    })

    expect(workspaceStore.getState().curves).toHaveLength(2)
  })

  it('masks unknown native file read errors with a safe public error message', async () => {
    render(<SessionControls />)
    selectFile(fileWithText('secret.json', async () => {
      throw new Error('/var/secrets/keys.json: permission denied')
    }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Unable to import session')
    expect(alert).not.toHaveTextContent('/var/secrets/keys.json')
    expect(workspaceStore.getState().curves).toEqual([])
  })

  it('masks unknown export errors with a safe public error message', async () => {
    vi.mocked(downloadTextFile).mockImplementationOnce(() => {
      throw new Error('/system/fs/write failed')
    })
    const user = userEvent.setup()
    render(<SessionControls />)

    await user.click(screen.getByRole('button', { name: 'Export Session' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Unable to export session')
    expect(alert).not.toHaveTextContent('/system/fs/write')
  })
})
