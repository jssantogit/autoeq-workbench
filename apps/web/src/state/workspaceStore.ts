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

export interface WorkspaceState {
  source: Curve | null
  target: Curve | null
  sourceNormalization: Normalization
  targetNormalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  setSource: (curve: Curve) => void
  setTarget: (curve: Curve) => void
  setSourceNormalization: (value: Normalization) => void
  setTargetNormalization: (value: Normalization) => void
  normalizeTogether: (value: Normalization) => void
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

export interface WorkspaceDerived {
  status: 'incomplete' | 'ready' | 'coverage-error'
  message: string
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
  source: null,
  target: null,
  sourceNormalization: { ...defaultNormalization },
  targetNormalization: { ...defaultNormalization },
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
    setSource: (curve) =>
      set((state) => {
        if (state.source === null) return { source: curve }
        future.length = 0
        return {
          source: curve,
          solutionState: state.filters.length > 0 ? 'stale' : state.solutionState,
          canRedo: false,
        }
      }),
    setTarget: (curve) =>
      set((state) => {
        if (state.target === null) return { target: curve }
        future.length = 0
        return {
          target: curve,
          solutionState: state.filters.length > 0 ? 'stale' : state.solutionState,
          canRedo: false,
        }
      }),
    setSourceNormalization: (value) =>
      set((state) => {
        if (
          !Number.isFinite(value.anchorHz) ||
          value.anchorHz <= 0 ||
          !Number.isFinite(value.targetDb) ||
          (value.anchorHz === state.sourceNormalization.anchorHz &&
            value.targetDb === state.sourceNormalization.targetDb)
        ) return state
        return record(state, {
          sourceNormalization: { ...value },
          solutionState: afterNormalizationChange(state),
        })
      }),
    setTargetNormalization: (value) =>
      set((state) => {
        if (
          !Number.isFinite(value.anchorHz) ||
          value.anchorHz <= 0 ||
          !Number.isFinite(value.targetDb) ||
          (value.anchorHz === state.targetNormalization.anchorHz &&
            value.targetDb === state.targetNormalization.targetDb)
        ) return state
        return record(state, {
          targetNormalization: { ...value },
          solutionState: afterNormalizationChange(state),
        })
      }),
    normalizeTogether: (value) =>
      set((state) => {
        if (!Number.isFinite(value.anchorHz) || value.anchorHz <= 0 || !Number.isFinite(value.targetDb)) {
          return state
        }
        const unchanged = [state.sourceNormalization, state.targetNormalization].every(
          (normalization) =>
            normalization.anchorHz === value.anchorHz && normalization.targetDb === value.targetDb,
        )
        if (unchanged) return state
        return record(state, {
          sourceNormalization: { ...value },
          targetNormalization: { ...value },
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

function prepareImportedCurve(
  curve: Curve | null,
  normalization: Normalization,
): DerivedCurve | null {
  if (curve === null) return null
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

  for (const role of ['source', 'target'] as const) {
    const curve = state[role]
    if (curve === null) continue
    const normalization = state[`${role}Normalization`]
    try {
      const imported = prepareImportedCurve(curve, normalization)
      if (role === 'source') source = imported
      else target = imported

      if (!coversWorkbenchRange(curve)) {
        errors.push(`${role === 'source' ? 'Source' : 'Target'} must cover the 20 Hz to 20 kHz graph range.`)
        continue
      }

      const prepared = prepareCurve(curve, normalization, frequencies)
      const evaluationCurve = { frequencies: prepared.frequencies, db: prepared.db }
      if (role === 'source') preparedSource = evaluationCurve
      else preparedTarget = evaluationCurve
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : `Unable to prepare ${role} curve`)
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
  const incompleteMessage = state.source === null && state.target === null
    ? 'Import Source and Target to compare responses.'
    : state.source === null
      ? 'Import Source to compare responses.'
      : 'Import Target to compare responses.'

  return {
    status,
    message:
      status === 'coverage-error'
        ? errors.join(' ')
        : status === 'ready'
          ? 'Source and Target ready.'
          : incompleteMessage,
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
