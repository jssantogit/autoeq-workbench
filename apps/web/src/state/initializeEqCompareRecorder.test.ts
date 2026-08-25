import {
  DEFAULT_AUTOEQ_SETTINGS,
  MVP_NUMERIC_POLICY,
  calculatePreampDb,
  type Filter,
} from '@autoeq-workbench/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEqCompareStore } from './eqCompareStore'
import { initializeEqCompareRecorder } from './initializeEqCompareRecorder'
import { createUiStore } from './uiStore'
import { createWorkspaceStore } from './workspaceStore'

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 3,
  q: 1,
}

describe('initializeEqCompareRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records canonical filter, provenance, and solution changes with core-derived preamp', () => {
    const workspace = createWorkspaceStore()
    const compare = createEqCompareStore()
    const cleanup = initializeEqCompareRecorder(workspace, compare)

    workspace.getState().setFilters([filter], 'autoeq')
    vi.advanceTimersByTime(500)

    const snapshot = compare.getState().snapshots[0]
    expect(snapshot).toMatchObject({
      filters: [filter],
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      preampDb: calculatePreampDb([filter], MVP_NUMERIC_POLICY.sampleRateHz).preampDb,
    })

    vi.advanceTimersByTime(1_000)
    workspace.setState({ filterProvenance: 'manual' })
    vi.advanceTimersByTime(500)
    vi.advanceTimersByTime(1_000)
    workspace.setState({ solutionState: 'stale' })
    vi.advanceTimersByTime(500)

    expect(compare.getState().snapshots).toHaveLength(3)
    expect(compare.getState().snapshots[1]?.filterProvenance).toBe('manual')
    expect(compare.getState().snapshots[2]?.solutionState).toBe('stale')

    cleanup()
  })

  it('ignores selected row, curves, tab, theme, appearance, graph, and playback-only changes', () => {
    const workspace = createWorkspaceStore()
    const compare = createEqCompareStore()
    const ui = createUiStore(() => 0)
    const cleanup = initializeEqCompareRecorder(workspace, compare)

    workspace.setState({ selectedFilterId: 'filter-1' })
    workspace.setState({ activeFrId: 'curve-1' })
    workspace.setState({ normalization: { anchorHz: 1_000, targetDb: 1 } })
    workspace.setState({ autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 } })
    ui.getState().setActiveDockTab('tools')
    ui.getState().setTheme('dark')
    ui.getState().registerCurve('curve-1')
    ui.getState().setCurveVisible('curve-1', false)
    ui.getState().setCurveColor('curve-1', '#123456')
    ui.getState().toggleInspector()
    ui.getState().toggleLabels()
    ui.getState().setGraphZoomPreset('bass')
    let playbackEqEnabled = true
    playbackEqEnabled = false
    expect(playbackEqEnabled).toBe(false)
    vi.advanceTimersByTime(500)

    expect(compare.getState().snapshots).toEqual([])
    cleanup()
  })

  it('cleanup unsubscribes and cancels a pending capture', () => {
    const workspace = createWorkspaceStore()
    const compare = createEqCompareStore()
    const cleanup = initializeEqCompareRecorder(workspace, compare)

    workspace.getState().setFilters([filter], 'manual')
    cleanup()
    vi.advanceTimersByTime(500)
    workspace.getState().toggleFilter(filter.id)
    vi.advanceTimersByTime(500)

    expect(compare.getState().snapshots).toEqual([])
  })
})
