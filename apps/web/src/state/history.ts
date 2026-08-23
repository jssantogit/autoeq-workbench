import type { Filter, Normalization } from '@autoeq-workbench/core'
import type { FilterProvenance, SolutionState } from './workspaceStore'

export interface WorkspaceHistorySnapshot {
  normalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  sourceCurveId: string | null
  targetCurveId: string | null
}

export type WorkspaceHistoryState = Omit<WorkspaceHistorySnapshot, 'sourceCurveId' | 'targetCurveId'>

export function createHistorySnapshot(
  state: WorkspaceHistoryState,
  [sourceCurveId, targetCurveId]: [string | null, string | null],
): WorkspaceHistorySnapshot {
  return {
    normalization: { ...state.normalization },
    filters: state.filters.map((filter) => ({ ...filter })),
    selectedFilterId: state.selectedFilterId,
    solutionState: state.solutionState,
    filterProvenance: state.filterProvenance,
    sourceCurveId,
    targetCurveId,
  }
}

export function restoreHistorySnapshot(
  snapshot: WorkspaceHistorySnapshot,
  [sourceCurveId, targetCurveId]: [string | null, string | null],
): WorkspaceHistoryState {
  const solutionState =
    snapshot.filters.length > 0 &&
    snapshot.filterProvenance === 'autoeq' &&
    (snapshot.sourceCurveId !== sourceCurveId || snapshot.targetCurveId !== targetCurveId)
      ? 'stale'
      : snapshot.solutionState

  return {
    normalization: { ...snapshot.normalization },
    filters: snapshot.filters.map((filter) => ({ ...filter })),
    selectedFilterId: snapshot.selectedFilterId,
    solutionState,
    filterProvenance: snapshot.filterProvenance,
  }
}
