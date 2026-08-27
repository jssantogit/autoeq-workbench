import { DEFAULT_AUTOEQ_SETTINGS, type Curve, type Filter } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoEqResult, createAutoEqRunRecord } from '../../test/autoEqFixture'
import { createEqCompareStore, isCanonicalEqStateEqual } from '../../state/eqCompareStore'
import { initializeEqCompareRecorder } from '../../state/initializeEqCompareRecorder'
import { createWorkspaceStore } from '../../state/workspaceStore'
import { EqCompare } from './EqCompare'

const baseFilter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 2,
  q: 1,
}

function curve(id: string, kind: Curve['kind'], db = 0): Curve {
  return {
    id,
    name: id,
    kind,
    rawPoints: [
      { frequencyHz: 20, db },
      { frequencyHz: 1_000, db },
      { frequencyHz: 20_000, db },
    ],
    metadata: { synthetic: true },
  }
}

function capture(
  gainDb: number,
  autoEqRun: ReturnType<typeof createAutoEqRunRecord> | null = null,
) {
  return {
    filters: [{ ...baseFilter, gainDb }],
    filterProvenance: autoEqRun ? ('autoeq' as const) : ('manual' as const),
    solutionState: 'clean' as const,
    autoEqRun,
    runInputSignature: null,
    preampDb: -Math.max(0, gainDb),
  }
}

describe('EqCompare', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows newest snapshots first with usable A/B assignment and bounded history controls', () => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    compare.getState().record(capture(1))
    compare.getState().flush()
    vi.setSystemTime(1_000)
    compare.getState().record(capture(4))
    compare.getState().flush()

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)

    const history = screen.getByRole('region', { name: 'EQ snapshot history' })
    expect(history).toHaveStyle({ maxHeight: '20rem', overflowY: 'auto' })
    expect(history).toHaveAttribute('tabindex', '0')
    expect(within(history).getAllByTestId('snapshot-summary').map((node) => node.textContent)).toEqual([
      expect.stringContaining('+4.0 dB'),
      expect.stringContaining('+1.0 dB'),
    ])

    const rows = within(history).getAllByRole('listitem')
    const setAButton = within(rows[0]!).getByRole('button', { name: 'Set A: PK 1k Hz +4.0 dB, preamp -4.0 dB' })
    const setBButton = within(rows[1]!).getByRole('button', { name: 'Set B: PK 1k Hz +1.0 dB, preamp -1.0 dB' })
    expect(setAButton).toHaveTextContent('Set A')
    expect(setBButton).toHaveTextContent('Set B')
    fireEvent.click(setAButton)
    fireEvent.click(setBButton)

    expect(within(rows[0]!).getByText('Assigned A')).toBeVisible()
    expect(within(rows[1]!).getByText('Assigned B')).toBeVisible()
    expect(screen.getByText(/A:.*\+4\.0 dB/)).toBeVisible()
    expect(screen.getByText(/B:.*\+1\.0 dB/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply A' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Apply B' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear history and selection' }))
    expect(screen.getByText('No EQ snapshots yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply A' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply B' })).toBeDisabled()
  })

  it('indicates exact current matches while ignoring selected and derived state', () => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    workspace.getState().setFilters(capture(3).filters, 'manual')
    workspace.getState().selectFilter(baseFilter.id)
    compare.getState().record({ ...capture(3), preampDb: -99 })
    compare.getState().flush()
    const id = compare.getState().snapshots[0]!.id
    compare.getState().setA(id)

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)

    expect(screen.getByText('Current matches A')).toBeVisible()
    act(() => workspace.getState().updateFilter(baseFilter.id, { q: 2 }))
    expect(screen.queryByText('Current matches A')).not.toBeInTheDocument()
  })

  it('suppresses recording before one atomic apply, then supports deterministic undo and redo', () => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    const initial = capture(1)
    const target = capture(5, createAutoEqRunRecord(5))
    workspace.getState().setFilters(initial.filters, 'manual')
    compare.getState().record(target)
    compare.getState().flush()
    const snapshot = compare.getState().snapshots[0]!
    compare.getState().setA(snapshot.id)
    const cleanupRecorder = initializeEqCompareRecorder(workspace, compare)
    const calls: string[] = []
    const suppressNext = compare.getState().suppressNext
    const applyFilterSnapshot = workspace.getState().applyFilterSnapshot
    compare.setState({ suppressNext: vi.fn(() => { calls.push('suppress'); suppressNext() }) })
    workspace.setState({
      applyFilterSnapshot: vi.fn((next) => {
        calls.push('apply')
        applyFilterSnapshot(next)
      }),
    })

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply A' }))

    expect(calls).toEqual(['suppress', 'apply'])
    expect(isCanonicalEqStateEqual(workspace.getState(), snapshot)).toBe(true)
    expect(workspace.getState().selectedFilterId).toBeNull()
    expect(workspace.getState().filters).not.toBe(snapshot.filters)
    expect(workspace.getState().filters[0]).not.toBe(snapshot.filters[0])
    expect(workspace.getState().autoEqRun).toEqual(snapshot.autoEqRun)
    expect(workspace.getState().autoEqRun).not.toBe(snapshot.autoEqRun)
    expect(workspace.getState().autoEqRun!.manifest).not.toBe(snapshot.autoEqRun!.manifest)
    vi.advanceTimersByTime(500)
    expect(compare.getState().snapshots).toHaveLength(1)

    workspace.getState().undo()
    expect(isCanonicalEqStateEqual(workspace.getState(), initial)).toBe(true)
    expect(workspace.getState().autoEqRun).toBeNull()
    workspace.getState().redo()
    expect(isCanonicalEqStateEqual(workspace.getState(), snapshot)).toBe(true)
    expect(workspace.getState().autoEqRun).toEqual(snapshot.autoEqRun)

    cleanupRecorder()
  })

  it('keeps distinct filters and AutoEQ manifests paired while switching A and B', () => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    const a = capture(5, createAutoEqRunRecord(5))
    const b = capture(-4, createAutoEqRunRecord(-4))
    compare.getState().record(a)
    compare.getState().flush()
    const aSnapshot = compare.getState().snapshots[0]!
    compare.getState().setA(aSnapshot.id)
    vi.setSystemTime(1_000)
    compare.getState().record(b)
    compare.getState().flush()
    const bSnapshot = compare.getState().snapshots[1]!
    compare.getState().setB(bSnapshot.id)

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)

    for (const [buttonName, expected] of [
      ['Apply A', aSnapshot],
      ['Apply B', bSnapshot],
      ['Apply A', aSnapshot],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: buttonName }))
      expect(isCanonicalEqStateEqual(workspace.getState(), expected)).toBe(true)
      expect(workspace.getState().autoEqRun).toEqual(expected.autoEqRun)
      expect(workspace.getState().autoEqRun).not.toBe(expected.autoEqRun)
    }
  })

  it.each([
    ['settings', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 })
    }],
    ['normalization', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setNormalization({ mode: 'hz', frequencyHz: 1_000, levelDb: 61 })
    }],
    ['selected IDs', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().addCurve(curve('fr-2', 'fr', 1))
      workspace.getState().setActiveFr('fr-2')
    }],
    ['same-ID numerical points', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.setState((state) => ({
        curves: state.curves.map((item) => item.id === state.activeFrId
          ? { ...item, rawPoints: item.rawPoints.map((point, index) => index === 1
            ? { ...point, db: point.db + 0.5 }
            : point) }
          : item),
      }))
    }],
  ] as const)('marks a clean AutoEQ snapshot stale after %s change', (_label, changeContext) => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    workspace.getState().addCurve(curve('fr-1', 'fr', 2))
    workspace.getState().addCurve(curve('target-1', 'target'))
    const cleanupRecorder = initializeEqCompareRecorder(workspace, compare)
    workspace.getState().applyAutoEqResult(createAutoEqResult(3))
    compare.getState().flush()
    const snapshot = compare.getState().snapshots[0]!
    compare.getState().setA(snapshot.id)
    changeContext(workspace)

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply A' }))

    expect(workspace.getState()).toMatchObject({
      filters: snapshot.filters,
      filterProvenance: 'autoeq',
      solutionState: 'stale',
      autoEqRun: snapshot.autoEqRun,
    })
    cleanupRecorder()
  })

  it('marks a modified AutoEQ snapshot stale after its run context changes', () => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    workspace.getState().addCurve(curve('fr-1', 'fr', 2))
    workspace.getState().addCurve(curve('target-1', 'target'))
    const cleanupRecorder = initializeEqCompareRecorder(workspace, compare)
    workspace.getState().applyAutoEqResult(createAutoEqResult(3))
    workspace.getState().updateFilter('autoeq-1', { gainDb: 4 })
    compare.getState().flush()
    const snapshot = compare.getState().snapshots[0]!
    expect(snapshot.solutionState).toBe('modified')
    compare.getState().setB(snapshot.id)
    workspace.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 })

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply B' }))

    expect(workspace.getState()).toMatchObject({
      filters: snapshot.filters,
      filterProvenance: 'autoeq',
      solutionState: 'stale',
      autoEqRun: snapshot.autoEqRun,
    })
    cleanupRecorder()
  })

  it.each([
    ['an existing stale AutoEQ snapshot', { ...capture(3, createAutoEqRunRecord(3)), solutionState: 'stale' as const }],
    ['a manual snapshot', { ...capture(3), solutionState: 'modified' as const }],
  ])('retains the stored state for %s', (_label, stored) => {
    const compare = createEqCompareStore()
    const workspace = createWorkspaceStore()
    compare.getState().record(stored)
    compare.getState().flush()
    compare.getState().setA(compare.getState().snapshots[0]!.id)
    workspace.getState().addCurve(curve('fr-1', 'fr'))
    workspace.getState().addCurve(curve('target-1', 'target'))

    render(<EqCompare compareStore={compare} workspaceStore={workspace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply A' }))

    expect(workspace.getState().solutionState).toBe(stored.solutionState)
  })
})
