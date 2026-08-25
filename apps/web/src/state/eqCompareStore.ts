import type { Filter } from '@autoeq-workbench/core'
import { createStore } from 'zustand/vanilla'
import type { FilterProvenance, SolutionState } from './workspaceStore'

export const RECORD_DEBOUNCE_MS = 500
export const RECORD_MIN_GAP_MS = 1_000
export const SNAPSHOT_CAP = 100

export interface EqSnapshot {
  id: string
  timestamp: number
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
  preampDb: number
  summary: string
}

export type EqSnapshotCapture = Omit<EqSnapshot, 'id' | 'timestamp' | 'summary'>

export interface EqCompareState {
  snapshots: EqSnapshot[]
  aSnapshotId: string | null
  bSnapshotId: string | null
  record: (snapshot: EqSnapshotCapture) => void
  flush: () => void
  cancelPending: () => void
  suppressNext: () => void
  setA: (id: string | null) => void
  setB: (id: string | null) => void
  clear: () => void
}

function copyCapture(capture: EqSnapshotCapture): EqSnapshotCapture {
  return { ...capture, filters: capture.filters.map((filter) => ({ ...filter })) }
}

export function isCanonicalEqStateEqual(
  left: Pick<EqSnapshotCapture, 'filters' | 'filterProvenance' | 'solutionState'>,
  right: Pick<EqSnapshotCapture, 'filters' | 'filterProvenance' | 'solutionState'>,
): boolean {
  return (
    left.filterProvenance === right.filterProvenance &&
    left.solutionState === right.solutionState &&
    left.filters.length === right.filters.length &&
    left.filters.every((filter, index) => {
      const other = right.filters[index]
      return (
        other !== undefined &&
        filter.id === other.id &&
        filter.enabled === other.enabled &&
        filter.type === other.type &&
        filter.frequencyHz === other.frequencyHz &&
        filter.gainDb === other.gainDb &&
        filter.q === other.q
      )
    })
  )
}

function formatFrequency(frequencyHz: number): string {
  if (frequencyHz < 1_000) return `${frequencyHz} Hz`
  return `${Number((frequencyHz / 1_000).toFixed(1))}k Hz`
}

function formatGain(gainDb: number): string {
  return `${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB`
}

function summarize(capture: EqSnapshotCapture): string {
  const first = capture.filters[0]
  const preamp = `preamp ${capture.preampDb.toFixed(1)} dB`
  if (first === undefined) return `no bands, ${preamp}`
  const remaining = capture.filters.length - 1
  const more = remaining > 0 ? ` +${remaining}` : ''
  return `${first.type} ${formatFrequency(first.frequencyHz)} ${formatGain(first.gainDb)}${more}, ${preamp}`
}

export function createEqCompareStore() {
  let pending: EqSnapshotCapture | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let suppressNextRecord = false
  let nextSnapshotId = 0

  return createStore<EqCompareState>()((set) => {
    const cancelPending = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = null
    }

    const flush = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      const capture = pending
      pending = null
      if (capture === null) return

      set((state) => {
        const newest = state.snapshots.at(-1)
        if (newest !== undefined && isCanonicalEqStateEqual(newest, capture)) return state

        const timestamp = Date.now()
        const newestIsAssigned =
          newest !== undefined &&
          (state.aSnapshotId === newest.id || state.bSnapshotId === newest.id)
        const shouldCoalesce =
          newest !== undefined &&
          !newestIsAssigned &&
          timestamp - newest.timestamp < RECORD_MIN_GAP_MS
        const snapshot: EqSnapshot = {
          ...copyCapture(capture),
          id: shouldCoalesce ? newest.id : `eq-snapshot-${++nextSnapshotId}`,
          timestamp,
          summary: summarize(capture),
        }
        const snapshots = shouldCoalesce
          ? [...state.snapshots.slice(0, -1), snapshot]
          : [...state.snapshots, snapshot].slice(-SNAPSHOT_CAP)
        const retainedIds = new Set(snapshots.map(({ id }) => id))
        return {
          snapshots,
          aSnapshotId:
            state.aSnapshotId !== null && retainedIds.has(state.aSnapshotId)
              ? state.aSnapshotId
              : null,
          bSnapshotId:
            state.bSnapshotId !== null && retainedIds.has(state.bSnapshotId)
              ? state.bSnapshotId
              : null,
        }
      })
    }

    return {
      snapshots: [],
      aSnapshotId: null,
      bSnapshotId: null,
      record: (capture) => {
        if (suppressNextRecord) {
          suppressNextRecord = false
          return
        }
        pending = copyCapture(capture)
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(flush, RECORD_DEBOUNCE_MS)
      },
      flush,
      cancelPending,
      suppressNext: () => {
        suppressNextRecord = true
      },
      setA: (id) =>
        set((state) =>
          id === null || state.snapshots.some((snapshot) => snapshot.id === id)
            ? { aSnapshotId: id }
            : state,
        ),
      setB: (id) =>
        set((state) =>
          id === null || state.snapshots.some((snapshot) => snapshot.id === id)
            ? { bSnapshotId: id }
            : state,
        ),
      clear: () => {
        cancelPending()
        suppressNextRecord = false
        set({ snapshots: [], aSnapshotId: null, bSnapshotId: null })
      },
    }
  })
}

export const eqCompareStore = createEqCompareStore()
