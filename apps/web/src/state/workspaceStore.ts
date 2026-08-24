import {
  applyEqToSource,
  AUTOEQ_PRODUCT_LIMITS,
  biquadMagnitudeDb,
  calculateErrorMetrics,
  calculatePreampDb,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  DEFAULT_AUTOEQ_SETTINGS,
  desiredCorrection,
  MVP_NUMERIC_POLICY,
  isValidAutoEqSettings,
  prepareCurve,
  residualError,
  type Curve,
  type AutoEqSettings,
  type CurveKind,
  type ErrorMetrics,
  type Filter,
  type FilterType,
  type Normalization,
  type PreampResult,
} from '@autoeq-workbench/core'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import {
  createHistorySnapshot,
  restoreHistorySnapshot,
  type WorkspaceHistorySnapshot,
} from './history'

export type SolutionState = 'clean' | 'modified' | 'stale'
export type FilterProvenance = 'manual' | 'autoeq'

export interface WorkspaceState {
  curves: Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  addCurve: (curve: Curve) => boolean
  setActiveFr: (id: string | null) => void
  setActiveTarget: (id: string | null) => void
  renameCurve: (curveId: string, name: string) => void
  removeCurve: (curveId: string) => void
  setNormalization: (value: Normalization) => void
  setAutoEqSettings: (settings: AutoEqSettings) => void
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
  kind: CurveKind
}

export interface WorkspaceDerived {
  status: 'incomplete' | 'ready' | 'coverage-error'
  message: string
  measurementCurves: DerivedMeasurementCurve[]
  fr: DerivedCurve | null
  target: DerivedCurve | null
  peq: DerivedCurve | null
  desired: DerivedCurve | null
  frEq: DerivedCurve | null
  metrics: ErrorMetrics | null
  preamp: PreampResult | null
  selectedFilter: (DerivedCurve & { frequencyHz: number; enabled: boolean }) | null
  hasFilters: boolean
  activeFrId: string | null
  activeTargetId: string | null
}

export const defaultNormalization: Readonly<Normalization> = {
  anchorHz: 500,
  targetDb: 0,
}

const initialState = {
  curves: [],
  activeFrId: null,
  activeTargetId: null,
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
    filter.gainDb >= AUTOEQ_PRODUCT_LIMITS.minGainDb &&
    filter.gainDb <= AUTOEQ_PRODUCT_LIMITS.maxGainDb &&
    Number.isFinite(filter.q) &&
    filter.q >= AUTOEQ_PRODUCT_LIMITS.minQ &&
    filter.q <= AUTOEQ_PRODUCT_LIMITS.maxQ
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

function curveCollectionUpdate(
  state: WorkspaceState,
  future: WorkspaceHistorySnapshot[],
  update: Pick<WorkspaceState, 'curves' | 'activeFrId' | 'activeTargetId'>,
): Partial<WorkspaceState> {
  future.length = 0
  const selectedInputsChanged =
    state.activeFrId !== update.activeFrId || state.activeTargetId !== update.activeTargetId
  return {
    ...update,
    solutionState:
      state.filters.length > 0 &&
      state.filterProvenance === 'autoeq' &&
      selectedInputsChanged
        ? 'stale'
        : state.solutionState,
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

  return createStore<WorkspaceState>()((set, get) => ({
    ...initialState,
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    addCurve: (curve) => {
      if (get().curves.some((existing) => existing.id === curve.id)) return false
      set((state) => {
        return curveCollectionUpdate(state, future, {
          curves: [...state.curves, curve],
          activeFrId: curve.kind === 'fr' && state.activeFrId === null ? curve.id : state.activeFrId,
          activeTargetId:
            curve.kind === 'target' && state.activeTargetId === null
              ? curve.id
              : state.activeTargetId,
        })
      })
      return true
    },
    setActiveFr: (id) =>
      set((state) => {
        if (
          id === state.activeFrId ||
          (id !== null && !state.curves.some((curve) => curve.id === id && curve.kind === 'fr'))
        ) return state
        return curveCollectionUpdate(state, future, {
          curves: state.curves,
          activeFrId: id,
          activeTargetId: state.activeTargetId,
        })
      }),
    setActiveTarget: (id) =>
      set((state) => {
        if (
          id === state.activeTargetId ||
          (id !== null && !state.curves.some((curve) => curve.id === id && curve.kind === 'target'))
        ) return state
        return curveCollectionUpdate(state, future, {
          curves: state.curves,
          activeFrId: state.activeFrId,
          activeTargetId: id,
        })
      }),
    renameCurve: (curveId, name) =>
      set((state) => {
        const trimmed = name.trim()
        const curve = state.curves.find((item) => item.id === curveId)
        if (curve === undefined || trimmed.length === 0 || curve.name === trimmed) return state
        const curves = state.curves.map((item) =>
          item.id === curveId ? { ...item, name: trimmed } : item,
        )
        return curveCollectionUpdate(state, future, {
          curves,
          activeFrId: state.activeFrId,
          activeTargetId: state.activeTargetId,
        })
      }),
    removeCurve: (curveId) =>
      set((state) => {
        const removed = state.curves.find((curve) => curve.id === curveId)
        if (removed === undefined) return state
        const curves = state.curves.filter((curve) => curve.id !== curveId)
        return curveCollectionUpdate(state, future, {
          curves,
          activeFrId:
            state.activeFrId === curveId
              ? (curves.find((curve) => curve.kind === 'fr')?.id ?? null)
              : state.activeFrId,
          activeTargetId:
            state.activeTargetId === curveId
              ? (curves.find((curve) => curve.kind === 'target')?.id ?? null)
              : state.activeTargetId,
        })
      }),
    setNormalization: (value) =>
      set((state) => {
        if (
          !Number.isFinite(value.anchorHz) ||
          value.anchorHz < MVP_NUMERIC_POLICY.minFrequencyHz ||
          value.anchorHz > MVP_NUMERIC_POLICY.maxFrequencyHz ||
          !Number.isFinite(value.targetDb) ||
          (value.anchorHz === state.normalization.anchorHz &&
            value.targetDb === state.normalization.targetDb)
        ) return state
        return record(state, {
          normalization: { ...value },
          solutionState: afterNormalizationChange(state),
        })
      }),
    setAutoEqSettings: (settings) =>
      set((state) => {
        if (
          !isValidAutoEqSettings(settings) ||
          Object.entries(settings).every(
            ([key, value]) => state.autoeqSettings[key as keyof AutoEqSettings] === value,
          )
        ) return state
        return record(state, {
          autoeqSettings: { ...settings },
          solutionState: afterNormalizationChange(state),
        })
      }),
    setFilters: (filters, provenance) =>
      set((state) => {
        if (
          filters.length > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters ||
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
        if (state.filters.length >= AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) return state
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
        if (state.filters.length >= AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) return state
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
          ...restoreHistorySnapshot(snapshot, state),
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
          ...restoreHistorySnapshot(snapshot, state),
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
  let fr: DerivedCurve | null = null
  let target: DerivedCurve | null = null
  let preparedFr: DerivedCurve | null = null
  let preparedTarget: DerivedCurve | null = null
  const errors: string[] = []
  const warnings: string[] = []
  const activeFr = state.curves.find((curve) => curve.id === state.activeFrId && curve.kind === 'fr') ?? null
  const activeTarget =
    state.curves.find((curve) => curve.id === state.activeTargetId && curve.kind === 'target') ?? null
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

  for (const curve of state.curves) {
    const isActiveFr = curve.id === activeFr?.id
    const isActiveTarget = curve.id === activeTarget?.id
    try {
      const imported = prepareImportedCurve(curve, state.normalization)
      measurementCurves.push({
        id: curve.id,
        name: curve.name,
        kind: curve.kind,
        ...imported,
      })

      if (!isActiveFr && !isActiveTarget) continue
      if (isActiveFr) fr = imported
      else target = imported

      if (!coversWorkbenchRange(curve)) {
        const kindLabel = isActiveFr ? 'FR' : 'Target'
        errors.push(`${kindLabel} "${curve.name}" must cover the 20 Hz to 20 kHz graph range.`)
        continue
      }

      const prepared = prepareCurve(curve, state.normalization, frequencies)
      const evaluationCurve = { frequencies: prepared.frequencies, db: prepared.db }
      if (isActiveFr) preparedFr = evaluationCurve
      else preparedTarget = evaluationCurve
    } catch (cause) {
      const kindLabel = curve.kind === 'fr' ? 'FR' : 'Target'
      const message =
        `${kindLabel} "${curve.name}": ${cause instanceof Error ? cause.message : 'unable to prepare curve'}`
      if (isActiveFr || isActiveTarget) errors.push(message)
      else warnings.push(message)
    }
  }

  const frEq = preparedFr === null
    ? null
    : { frequencies, db: applyEqToSource(preparedFr.db, peqDb) }
  const desired = preparedFr === null || preparedTarget === null
    ? null
    : { frequencies, db: desiredCorrection(preparedFr.db, preparedTarget.db) }
  const metrics = frEq === null || preparedTarget === null
    ? null
    : calculateErrorMetrics(residualError(preparedTarget.db, frEq.db), frequencies)
  const comparable = preparedFr !== null && preparedTarget !== null
  if (comparable) {
    fr = preparedFr
    target = preparedTarget
  }

  const status = errors.length > 0
    ? 'coverage-error'
    : comparable
      ? 'ready'
      : 'incomplete'
  const incompleteMessage = activeFr === null && activeTarget === null
    ? 'Select an active FR and Target to compare responses.'
    : activeFr === null
      ? 'Select an active FR to compare responses.'
      : 'Select an active Target to compare responses.'

  const message = status === 'coverage-error'
    ? errors.join(' ')
    : status === 'ready'
      ? 'FR and Target ready.'
      : incompleteMessage

  return {
    status,
    message: [message, ...warnings].join(' '),
    measurementCurves,
    fr,
    target,
    peq,
    desired,
    frEq,
    metrics,
    preamp,
    selectedFilter,
    hasFilters: state.filters.length > 0,
    activeFrId: activeFr?.id ?? null,
    activeTargetId: activeTarget?.id ?? null,
  }
}
