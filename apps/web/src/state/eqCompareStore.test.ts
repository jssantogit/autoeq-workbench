import type { Filter } from '@autoeq-workbench/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoEqRunRecord } from '../test/autoEqFixture'
import { createEqCompareStore, isCanonicalEqStateEqual } from './eqCompareStore'

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 2,
  q: 1,
}

function capture(
  overrides: Partial<Filter> = {},
  autoEqRun: ReturnType<typeof createAutoEqRunRecord> | null = null,
) {
  return {
    filters: [{ ...filter, ...overrides }],
    filterProvenance: 'manual' as const,
    solutionState: 'clean' as const,
    autoEqRun,
    runInputSignature: null,
    preampDb: -2,
  }
}

describe('EQ compare store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces captures for 500 ms and coalesces commits less than 1000 ms apart', () => {
    const store = createEqCompareStore()

    store.getState().record(capture())
    vi.advanceTimersByTime(499)
    expect(store.getState().snapshots).toEqual([])

    vi.advanceTimersByTime(1)
    expect(store.getState().snapshots).toHaveLength(1)
    expect(store.getState().snapshots[0]?.summary).toBe(
      'PK 1k Hz +2.0 dB, preamp -2.0 dB',
    )

    vi.advanceTimersByTime(100)
    store.getState().record(capture({ gainDb: 3 }))
    vi.advanceTimersByTime(500)
    expect(store.getState().snapshots).toHaveLength(1)
    expect(store.getState().snapshots[0]?.filters[0]?.gainDb).toBe(3)

    vi.advanceTimersByTime(500)
    store.getState().record(capture({ gainDb: 4 }))
    vi.advanceTimersByTime(500)
    expect(store.getState().snapshots).toHaveLength(2)
  })

  it('does not duplicate identical canonical EQ state', () => {
    const store = createEqCompareStore()

    store.getState().record(capture())
    store.getState().flush()
    vi.advanceTimersByTime(1_000)
    store.getState().record({ ...capture(), preampDb: -9 })
    store.getState().flush()

    expect(store.getState().snapshots).toHaveLength(1)
  })

  it('matches only ordered canonical filter fields, provenance, and solution state', () => {
    const left = {
      ...capture(),
      filters: [filter, { ...filter, id: 'filter-2', frequencyHz: 2_000 }],
      selectedFilterId: 'filter-1',
      preampDb: -2,
      view: 'equalizer',
    }
    const sameCanonicalState = {
      ...left,
      filters: left.filters.map((item) => ({ ...item })),
      selectedFilterId: null,
      preampDb: -99,
      view: 'tools',
    }

    expect(isCanonicalEqStateEqual(left, sameCanonicalState)).toBe(true)
    const sameCanonicalWithDifferentContext = {
      ...sameCanonicalState,
      runInputSignature: 'different-run-context',
    }
    expect(isCanonicalEqStateEqual(left, sameCanonicalWithDifferentContext)).toBe(true)
    expect(
      isCanonicalEqStateEqual(left, {
        ...sameCanonicalState,
        filters: [...sameCanonicalState.filters].reverse(),
      }),
    ).toBe(false)

    for (const changedFilter of [
      { ...filter, id: 'changed' },
      { ...filter, enabled: false },
      { ...filter, type: 'LS' as const },
      { ...filter, frequencyHz: 999 },
      { ...filter, gainDb: 3 },
      { ...filter, q: 2 },
    ]) {
      expect(
        isCanonicalEqStateEqual(left, {
          ...sameCanonicalState,
          filters: [changedFilter, sameCanonicalState.filters[1]!],
        }),
      ).toBe(false)
    }
    expect(
      isCanonicalEqStateEqual(left, { ...sameCanonicalState, filterProvenance: 'autoeq' }),
    ).toBe(false)
    expect(
      isCanonicalEqStateEqual(left, { ...sameCanonicalState, solutionState: 'stale' }),
    ).toBe(false)
    expect(
      isCanonicalEqStateEqual(left, {
        ...sameCanonicalState,
        autoEqRun: createAutoEqRunRecord(),
      }),
    ).toBe(false)
    expect(
      isCanonicalEqStateEqual(
        { ...left, autoEqRun: createAutoEqRunRecord() },
        { ...sameCanonicalState, autoEqRun: createAutoEqRunRecord() },
      ),
    ).toBe(true)
  })

  it('deep-copies the AutoEQ run manifest into snapshots', () => {
    const store = createEqCompareStore()
    const autoEqRun = createAutoEqRunRecord()

    store.getState().record(capture({}, autoEqRun))
    store.getState().flush()

    const snapshot = store.getState().snapshots[0]!
    expect(snapshot.autoEqRun).toEqual(autoEqRun)
    expect(snapshot.autoEqRun).not.toBe(autoEqRun)
    expect(snapshot.autoEqRun!.manifest).not.toBe(autoEqRun.manifest)
    autoEqRun.manifest.algorithmParameters.deadbandDb = 9
    const snapshotManifest = snapshot.autoEqRun!.manifest
    expect(snapshotManifest.algorithmVersion).toBe('standard-v1')
    if (snapshotManifest.algorithmVersion !== 'standard-v1') {
      throw new Error('Expected historical Standard-v1 fixture')
    }
    expect(snapshotManifest.algorithmParameters.deadbandDb).toBe(0.1)
  })

  it('retains the 100 newest deep-copied snapshots and clears trimmed selections', () => {
    const store = createEqCompareStore()
    const firstCapture = capture({ frequencyHz: 100 })
    store.getState().record(firstCapture)
    store.getState().flush()
    const firstId = store.getState().snapshots[0]!.id
    store.getState().setA(firstId)
    store.getState().setB(firstId)

    firstCapture.filters[0]!.gainDb = 9
    expect(store.getState().snapshots[0]?.filters[0]?.gainDb).toBe(2)

    for (let index = 1; index <= 100; index += 1) {
      vi.advanceTimersByTime(1_000)
      store.getState().record(capture({ frequencyHz: 100 + index }))
      store.getState().flush()
    }

    const state = store.getState()
    expect(state.snapshots).toHaveLength(100)
    expect(state.snapshots[0]?.filters[0]?.frequencyHz).toBe(101)
    expect(state.snapshots.at(-1)?.filters[0]?.frequencyHz).toBe(200)
    expect(state.aSnapshotId).toBeNull()
    expect(state.bSnapshotId).toBeNull()
  })

  it('accepts only existing snapshot ids or null for A and B', () => {
    const store = createEqCompareStore()
    store.getState().record(capture())
    store.getState().flush()
    const id = store.getState().snapshots[0]!.id

    store.getState().setA('missing')
    store.getState().setB('missing')
    expect(store.getState()).toMatchObject({ aSnapshotId: null, bSnapshotId: null })

    store.getState().setA(id)
    store.getState().setB(id)
    expect(store.getState()).toMatchObject({ aSnapshotId: id, bSnapshotId: id })

    store.getState().setA(null)
    store.getState().setB(null)
    expect(store.getState()).toMatchObject({ aSnapshotId: null, bSnapshotId: null })
  })

  it('suppresses exactly one automatic capture', () => {
    const store = createEqCompareStore()

    store.getState().suppressNext()
    store.getState().record(capture())
    store.getState().record(capture({ gainDb: 3 }))
    store.getState().flush()

    expect(store.getState().snapshots).toHaveLength(1)
    expect(store.getState().snapshots[0]?.filters[0]?.gainDb).toBe(3)
  })

  it('clear cancels pending work and clears history and A/B', () => {
    const store = createEqCompareStore()
    store.getState().record(capture())
    store.getState().flush()
    const id = store.getState().snapshots[0]!.id
    store.getState().setA(id)
    store.getState().setB(id)
    vi.advanceTimersByTime(1_000)
    store.getState().record(capture({ gainDb: 3 }))

    store.getState().clear()
    vi.advanceTimersByTime(500)

    expect(store.getState()).toMatchObject({ snapshots: [], aSnapshotId: null, bSnapshotId: null })
  })
})
