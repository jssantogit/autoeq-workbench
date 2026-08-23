import {
  applyEqToSource,
  calculateErrorMetrics,
  calculatePreampDb,
  cascadeMagnitudeDb,
  createLogGrid,
  desiredCorrection,
  prepareCurve,
  residualError,
  type Curve,
  type ErrorMetrics,
  type Filter,
  type Normalization,
  type PreampResult,
} from '@autoeq-workbench/core'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

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
}

export function createWorkspaceStore() {
  return createStore<WorkspaceState>()((set) => ({
    ...initialState,
    setSource: (curve) =>
      set((state) => ({
        source: curve,
        solutionState:
          state.source !== null && state.filters.length > 0 ? 'stale' : state.solutionState,
      })),
    setTarget: (curve) =>
      set((state) => ({
        target: curve,
        solutionState:
          state.target !== null && state.filters.length > 0 ? 'stale' : state.solutionState,
      })),
    setSourceNormalization: (value) => set({ sourceNormalization: { ...value } }),
    setTargetNormalization: (value) => set({ targetNormalization: { ...value } }),
    normalizeTogether: (value) =>
      set({ sourceNormalization: { ...value }, targetNormalization: { ...value } }),
    setFilters: (filters, provenance) =>
      set({
        filters: [...filters],
        filterProvenance: provenance,
        solutionState: provenance === 'autoeq' ? 'clean' : 'modified',
      }),
    selectFilter: (id) => set({ selectedFilterId: id }),
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
  let source: DerivedCurve | null = null
  let target: DerivedCurve | null = null

  try {
    source = prepareImportedCurve(state.source, state.sourceNormalization)
    target = prepareImportedCurve(state.target, state.targetNormalization)
  } catch (cause) {
    return {
      status: 'coverage-error',
      message: cause instanceof Error ? cause.message : 'Unable to prepare imported curves',
      source,
      target,
      peq: null,
      desired: null,
      sourceEq: null,
      metrics: null,
      preamp: null,
      hasFilters: state.filters.length > 0,
    }
  }

  if (state.source === null || state.target === null) {
    return {
      status: 'incomplete',
      message: 'Import Source and Target to compare responses.',
      source,
      target,
      peq: null,
      desired: null,
      sourceEq: null,
      metrics: null,
      preamp: null,
      hasFilters: state.filters.length > 0,
    }
  }

  const coversWorkbenchRange = (curve: Curve) =>
    curve.rawPoints[0]!.frequencyHz <= 20 && curve.rawPoints.at(-1)!.frequencyHz >= 20_000
  if (!coversWorkbenchRange(state.source) || !coversWorkbenchRange(state.target)) {
    return {
      status: 'coverage-error',
      message: 'Source and Target must both cover the 20 Hz to 20 kHz graph range.',
      source,
      target,
      peq: null,
      desired: null,
      sourceEq: null,
      metrics: null,
      preamp: null,
      hasFilters: state.filters.length > 0,
    }
  }

  try {
    const frequencies = createLogGrid(20, 20_000, 24)
    const preparedSource = prepareCurve(state.source, state.sourceNormalization, frequencies)
    const preparedTarget = prepareCurve(state.target, state.targetNormalization, frequencies)
    const peqDb = cascadeMagnitudeDb(state.filters, frequencies, 48_000)
    const sourceEqDb = applyEqToSource(preparedSource.db, peqDb)
    const desiredDb = desiredCorrection(preparedSource.db, preparedTarget.db)
    const residual = residualError(preparedTarget.db, sourceEqDb)

    return {
      status: 'ready',
      message: 'Source and Target ready.',
      source: { frequencies, db: preparedSource.db },
      target: { frequencies, db: preparedTarget.db },
      peq: { frequencies, db: peqDb },
      desired: { frequencies, db: desiredDb },
      sourceEq: { frequencies, db: sourceEqDb },
      metrics: calculateErrorMetrics(residual, frequencies),
      preamp: calculatePreampDb(state.filters, 48_000),
      hasFilters: state.filters.length > 0,
    }
  } catch (cause) {
    return {
      status: 'coverage-error',
      message: cause instanceof Error ? cause.message : 'Unable to derive workspace responses',
      source,
      target,
      peq: null,
      desired: null,
      sourceEq: null,
      metrics: null,
      preamp: null,
      hasFilters: state.filters.length > 0,
    }
  }
}

export const workspaceStore = createWorkspaceStore()

export function useWorkspaceStore<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(workspaceStore, selector)
}
