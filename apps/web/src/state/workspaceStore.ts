import {
  applyEqToSource,
  biquadMagnitudeDb,
  calculateErrorMetrics,
  calculatePreampDb,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  desiredCorrection,
  MVP_NUMERIC_POLICY,
  prepareCurve,
  residualError,
  type Curve,
  type ErrorMetrics,
  type Filter,
  type FilterType,
  type Normalization,
  type PreampResult,
} from '@autoeq-workbench/core'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { createHistorySnapshot, type WorkspaceHistorySnapshot } from './history'

export type SolutionState = 'clean' | 'modified' | 'stale'
export type FilterProvenance = 'manual' | 'autoeq'
export type WorkspaceCurveRole = 'source' | 'target' | 'reference' | null

export interface WorkspaceCurveEntry {
  curve: Curve
  role: WorkspaceCurveRole
}

export interface WorkspaceState {
  curves: WorkspaceCurveEntry[]
  normalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  addCurve: (curve: Curve) => void
  setCurveRole: (curveId: string, role: WorkspaceCurveRole) => void
  renameCurve: (curveId: string, name: string) => void
  removeCurve: (curveId: string) => void
  setNormalization: (value: Normalization) => void
  setFilters: (filters: Filter[], provenance: FilterProvenance) => void
  selectFilter: (id: string | null) => void
  addFilter: (type: FilterType) => void
  removeFilter: (id: string) => void
  duplicateFilter: (id: string) => void
  toggleFilter: (id: string) => void
  updateFilter: (id: string, updates: Partial<Omit<Filter, 'id'>>) => void
  reorderFilter: (id: string, direction: 'up' | 'down') => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

export interface DerivedCurve {
  frequencies: number[]
  db: number[]
}

export interface DerivedMeasurementCurve extends DerivedCurve {
  id: string
  name: string
  role: WorkspaceCurveRole
}

export interface WorkspaceDerived {
  status: 'incomplete' | 'ready' | 'coverage-error'
  message: string
  measurementCurves: DerivedMeasurementCurve[]
  source: DerivedCurve | null
  target: DerivedCurve | null
  peq: DerivedCurve | null
  desired: DerivedCurve | null
  sourceEq: DerivedCurve | null
  metrics: ErrorMetrics | null
  preamp: PreampResult | null
  selectedFilter: (DerivedCurve & { frequencyHz: number; enabled: boolean }) | null
  hasFilters: boolean
}

export const defaultNormalization: Readonly<Normalization> = {
  anchorHz: 500,
  targetDb: 0,
}

const initialState = {
  curves: [],
  normalization: { ...defaultNormalization },
  filters: [],
  selectedFilterId: null,
  solutionState: 'clean' as const,
  filterProvenance: null,
  canUndo: false,
  canRedo: false,
}

const filterDefaults: Record<FilterType, Omit<Filter, 'id'>> = {
  PK: { enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 0, q: 1 },
  LS: { enabled: true, type: 'LS', frequencyHz: 105, gainDb: 0, q: 0.7 },
  HS: { enabled: true, type: 'HS', frequencyHz: 10_000, gainDb: 0, q: 0.7 },
}

let nextFilterId = 0

function uniqueFilterId(filters: Filter[]): string {
  let id: string
  do id = `filter-${++nextFilterId}`
  while (filters.some((filter) => filter.id === id))
  return id
}

function validFilter(filter: Filter): boolean {
  return (
    typeof filter.id === 'string' &&
    filter.id.length > 0 &&
    typeof filter.enabled === 'boolean' &&
    ['PK', 'LS', 'HS'].includes(filter.type) &&
    Number.isFinite(filter.frequencyHz) &&
    filter.frequencyHz >= MVP_NUMERIC_POLICY.minFrequencyHz &&
    filter.frequencyHz <= MVP_NUMERIC_POLICY.maxFrequencyHz &&
    Number.isFinite(filter.gainDb) &&
    filter.gainDb >= -15 &&
    filter.gainDb <= 15 &&
    Number.isFinite(filter.q) &&
    filter.q >= 0.1 &&
    filter.q <= 12
  )
}

function afterManualEdit(state: WorkspaceState): SolutionState {
  if (state.solutionState === 'stale') return 'stale'
  return state.filterProvenance === 'autoeq' ? 'modified' : 'clean'
}

function manualProvenance(state: WorkspaceState): FilterProvenance {
  return state.filterProvenance ?? 'manual'
}

function afterNormalizationChange(state: WorkspaceState): SolutionState {
  return state.filters.length > 0 && state.filterProvenance === 'autoeq'
    ? 'stale'
    : state.solutionState
}

function selectedInputIds(curves: WorkspaceCurveEntry[]): [string | null, string | null] {
  return [
    curves.find(({ role }) => role === 'source')?.curve.id ?? null,
    curves.find(({ role }) => role === 'target')?.curve.id ?? null,
  ]
}

function curveCollectionUpdate(
  state: WorkspaceState,
  future: WorkspaceHistorySnapshot[],
  curves: WorkspaceCurveEntry[],
  forceStale = false,
): Partial<WorkspaceState> {
  future.length = 0
  const before = selectedInputIds(state.curves)
  const after = selectedInputIds(curves)
  const selectedInputsChanged = forceStale || before[0] !== after[0] || before[1] !== after[1]
  return {
    curves,
    solutionState:
      state.filters.length > 0 && selectedInputsChanged ? 'stale' : state.solutionState,
    canRedo: false,
  }
}

export function createWorkspaceStore() {
  const past: WorkspaceHistorySnapshot[] = []
  const future: WorkspaceHistorySnapshot[] = []

  function record(state: WorkspaceState, update: Partial<WorkspaceState>): Partial<WorkspaceState> {
    past.push(createHistorySnapshot(state))
    future.length = 0
    return { ...update, canUndo: true, canRedo: false }
  }

  return createStore<WorkspaceState>()((set) => ({
    ...initialState,
    addCurve: (curve) =>
      set((state) => {
        if (state.curves.some(({ curve: existing }) => existing.id === curve.id)) return state
        const role: WorkspaceCurveRole =
          state.curves.length === 0 ? 'source' : state.curves.length === 1 ? 'target' : null
        return curveCollectionUpdate(state, future, [...state.curves, { curve, role }])
      }),
    setCurveRole: (curveId, role) =>
      set((state) => {
        const entry = state.curves.find(({ curve }) => curve.id === curveId)
        if (entry === undefined || entry.role === role) return state
        const curves = state.curves.map((item) => ({
          ...item,
          role:
            item.curve.id === curveId
              ? role
              : (role === 'source' || role === 'target') && item.role === role
                ? null
                : item.role,
        }))
        return curveCollectionUpdate(state, future, curves)
      }),
    renameCurve: (curveId, name) =>
      set((state) => {
        const trimmed = name.trim()
        const entry = state.curves.find(({ curve }) => curve.id === curveId)
        if (entry === undefined || trimmed.length === 0 || entry.curve.name === trimmed) return state
        const curves = state.curves.map((item) =>
          item.curve.id === curveId ? { ...item, curve: { ...item.curve, name: trimmed } } : item,
        )
        return curveCollectionUpdate(
          state,
          future,
          curves,
          entry.role === 'source' || entry.role === 'target',
        )
      }),
    removeCurve: (curveId) =>
      set((state) => {
        if (!state.curves.some(({ curve }) => curve.id === curveId)) return state
        return curveCollectionUpdate(
          state,
          future,
          state.curves.filter(({ curve }) => curve.id !== curveId),
        )
      }),
    setNormalization: (value) =>
      set((state) => {
        if (
          !Number.isFinite(value.anchorHz) ||
          value.anchorHz <= 0 ||
          !Number.isFinite(value.targetDb) ||
          (value.anchorHz === state.normalization.anchorHz &&
            value.targetDb === state.normalization.targetDb)
        ) return state
        return record(state, {
          normalization: { ...value },
          solutionState: afterNormalizationChange(state),
        })
      }),
    setFilters: (filters, provenance) =>
      set((state) => {
        if (
          filters.length > 64 ||
          !filters.every(validFilter) ||
          new Set(filters.map(({ id }) => id)).size !== filters.length
        ) return state
        const selectedFilterId = filters.some(({ id }) => id === state.selectedFilterId)
          ? state.selectedFilterId
          : null
        const replacesAutoEq = provenance === 'manual' && state.filterProvenance === 'autoeq'
        return record(state, {
          filters: filters.map((filter) => ({ ...filter })),
          selectedFilterId,
          filterProvenance: replacesAutoEq ? 'autoeq' : provenance,
          solutionState:
            provenance === 'autoeq'
              ? 'clean'
              : state.solutionState === 'stale'
                ? 'stale'
                : replacesAutoEq
                  ? 'modified'
                  : 'clean',
        })
      }),
    selectFilter: (id) =>
      set((state) => ({
        selectedFilterId:
          id === null || state.filters.some((filter) => filter.id === id) ? id : state.selectedFilterId,
      })),
    addFilter: (type) =>
      set((state) => {
        if (state.filters.length >= 64) return state
        const filter = { id: uniqueFilterId(state.filters), ...filterDefaults[type] }
        return record(state, {
          filters: [...state.filters, filter],
          selectedFilterId: filter.id,
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    removeFilter: (id) =>
      set((state) => {
        const index = state.filters.findIndex((filter) => filter.id === id)
        if (index < 0) return state
        const filters = state.filters.filter((filter) => filter.id !== id)
        const selectedFilterId =
          state.selectedFilterId === id
            ? (filters[Math.min(index, filters.length - 1)]?.id ?? null)
            : state.selectedFilterId
        return record(state, {
          filters,
          selectedFilterId,
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    duplicateFilter: (id) =>
      set((state) => {
        if (state.filters.length >= 64) return state
        const index = state.filters.findIndex((filter) => filter.id === id)
        if (index < 0) return state
        const duplicate = { ...state.filters[index]!, id: uniqueFilterId(state.filters) }
        const filters = [...state.filters]
        filters.splice(index + 1, 0, duplicate)
        return record(state, {
          filters,
          selectedFilterId: duplicate.id,
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    toggleFilter: (id) =>
      set((state) => {
        if (!state.filters.some((filter) => filter.id === id)) return state
        return record(state, {
          filters: state.filters.map((filter) =>
            filter.id === id ? { ...filter, enabled: !filter.enabled } : filter,
          ),
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    updateFilter: (id, updates) =>
      set((state) => {
        const index = state.filters.findIndex((filter) => filter.id === id)
        if (index < 0) return state
        const updated = { ...state.filters[index]!, ...updates, id }
        if (!validFilter(updated)) return state
        if (
          Object.entries(updates).every(
            ([key, value]) => state.filters[index]![key as keyof Filter] === value,
          )
        ) {
          return state
        }
        const filters = [...state.filters]
        filters[index] = updated
        return record(state, {
          filters,
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    reorderFilter: (id, direction) =>
      set((state) => {
        const from = state.filters.findIndex((filter) => filter.id === id)
        const to = direction === 'up' ? from - 1 : from + 1
        if (from < 0 || to < 0 || to >= state.filters.length) return state
        const filters = [...state.filters]
        ;[filters[from], filters[to]] = [filters[to]!, filters[from]!]
        return record(state, {
          filters,
          solutionState: afterManualEdit(state),
          filterProvenance: manualProvenance(state),
        })
      }),
    undo: () =>
      set((state) => {
        const snapshot = past.pop()
        if (snapshot === undefined) return state
        future.push(createHistorySnapshot(state))
        return {
          ...createHistorySnapshot(snapshot),
          canUndo: past.length > 0,
          canRedo: true,
        }
      }),
    redo: () =>
      set((state) => {
        const snapshot = future.pop()
        if (snapshot === undefined) return state
        past.push(createHistorySnapshot(state))
        return {
          ...createHistorySnapshot(snapshot),
          canUndo: true,
          canRedo: future.length > 0,
        }
      }),
  }))
}

function prepareImportedCurve(curve: Curve, normalization: Normalization): DerivedCurve {
  const frequencies = curve.rawPoints.map(({ frequencyHz }) => frequencyHz)
  const prepared = prepareCurve(curve, normalization, frequencies)
  return { frequencies: prepared.frequencies, db: prepared.db }
}

export function deriveWorkspace(state: WorkspaceState): WorkspaceDerived {
  const frequencies = createEvaluationGrid()
  const peqDb = cascadeMagnitudeDb(
    state.filters,
    frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const peq = { frequencies, db: peqDb }
  const preamp = calculatePreampDb(state.filters, MVP_NUMERIC_POLICY.sampleRateHz)
  let source: DerivedCurve | null = null
  let target: DerivedCurve | null = null
  let preparedSource: DerivedCurve | null = null
  let preparedTarget: DerivedCurve | null = null
  const errors: string[] = []
  const sourceEntry = state.curves.find(({ role }) => role === 'source') ?? null
  const targetEntry = state.curves.find(({ role }) => role === 'target') ?? null
  const measurementCurves: DerivedMeasurementCurve[] = []
  const selected = state.filters.find(({ id }) => id === state.selectedFilterId)
  const selectedFilter = selected
    ? {
        frequencies,
        db: biquadMagnitudeDb(selected, frequencies, MVP_NUMERIC_POLICY.sampleRateHz),
        frequencyHz: selected.frequencyHz,
        enabled: selected.enabled,
      }
    : null

  const coversWorkbenchRange = (curve: Curve) => {
    const firstFrequencyHz = curve.rawPoints[0]?.frequencyHz
    const lastFrequencyHz = curve.rawPoints.at(-1)?.frequencyHz
    return (
      firstFrequencyHz !== undefined &&
      lastFrequencyHz !== undefined &&
      firstFrequencyHz <= MVP_NUMERIC_POLICY.minFrequencyHz &&
      lastFrequencyHz >= MVP_NUMERIC_POLICY.maxFrequencyHz
    )
  }

  for (const entry of state.curves) {
    try {
      const imported = prepareImportedCurve(entry.curve, state.normalization)
      measurementCurves.push({
        id: entry.curve.id,
        name: entry.curve.name,
        role: entry.role,
        ...imported,
      })

      if (entry.role !== 'source' && entry.role !== 'target') continue
      if (entry.role === 'source') source = imported
      else target = imported

      if (!coversWorkbenchRange(entry.curve)) {
        const roleLabel = entry.role === 'source' ? 'Source' : 'Target'
        errors.push(`${roleLabel} "${entry.curve.name}" must cover the 20 Hz to 20 kHz graph range.`)
        continue
      }

      const prepared = prepareCurve(entry.curve, state.normalization, frequencies)
      const evaluationCurve = { frequencies: prepared.frequencies, db: prepared.db }
      if (entry.role === 'source') preparedSource = evaluationCurve
      else preparedTarget = evaluationCurve
    } catch (cause) {
      const roleLabel = entry.role === 'source'
        ? 'Source'
        : entry.role === 'target'
          ? 'Target'
          : entry.role === 'reference'
            ? 'Reference Target'
            : 'Comparison'
      errors.push(
        `${roleLabel} "${entry.curve.name}": ${cause instanceof Error ? cause.message : 'unable to prepare curve'}`,
      )
    }
  }

  const sourceEq = preparedSource === null
    ? null
    : { frequencies, db: applyEqToSource(preparedSource.db, peqDb) }
  const desired = preparedSource === null || preparedTarget === null
    ? null
    : { frequencies, db: desiredCorrection(preparedSource.db, preparedTarget.db) }
  const metrics = sourceEq === null || preparedTarget === null
    ? null
    : calculateErrorMetrics(residualError(preparedTarget.db, sourceEq.db), frequencies)
  const comparable = preparedSource !== null && preparedTarget !== null
  if (comparable) {
    source = preparedSource
    target = preparedTarget
  }

  const status = errors.length > 0
    ? 'coverage-error'
    : comparable
      ? 'ready'
      : 'incomplete'
  const incompleteMessage = sourceEntry === null && targetEntry === null
    ? 'Assign Source and Target to compare responses.'
    : sourceEntry === null
      ? 'Assign Source to compare responses.'
      : 'Assign Target to compare responses.'

  return {
    status,
    message:
      status === 'coverage-error'
        ? errors.join(' ')
        : status === 'ready'
          ? 'Source and Target ready.'
          : incompleteMessage,
    measurementCurves,
    source,
    target,
    peq,
    desired,
    sourceEq,
    metrics,
    preamp,
    selectedFilter,
    hasFilters: state.filters.length > 0,
  }
}

export const workspaceStore = createWorkspaceStore()

export function useWorkspaceStore<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(workspaceStore, selector)
}
