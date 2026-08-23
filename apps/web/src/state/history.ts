import type { Filter, Normalization } from '@autoeq-workbench/core'
import type { FilterProvenance, SolutionState } from './workspaceStore'

export interface WorkspaceHistorySnapshot {
  normalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  activeFrId: string | null
  activeTargetId: string | null
}

export type WorkspaceHistoryState = Omit<WorkspaceHistorySnapshot, 'activeFrId' | 'activeTargetId'>
type ActiveCurveIds = Pick<WorkspaceHistorySnapshot, 'activeFrId' | 'activeTargetId'>

export function createHistorySnapshot(
  state: WorkspaceHistoryState & ActiveCurveIds,
): WorkspaceHistorySnapshot {
  return {
    normalization: { ...state.normalization },
    filters: state.filters.map((filter) => ({ ...filter })),
    selectedFilterId: state.selectedFilterId,
    solutionState: state.solutionState,
    filterProvenance: state.filterProvenance,
    activeFrId: state.activeFrId,
    activeTargetId: state.activeTargetId,
  }
}

export function restoreHistorySnapshot(
  snapshot: WorkspaceHistorySnapshot,
  activeIds: ActiveCurveIds,
): WorkspaceHistoryState {
  const solutionState =
    snapshot.filters.length > 0 &&
    snapshot.filterProvenance === 'autoeq' &&
    (snapshot.activeFrId !== activeIds.activeFrId ||
      snapshot.activeTargetId !== activeIds.activeTargetId)
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
