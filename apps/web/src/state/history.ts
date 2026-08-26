import type { AutoEqSettings, Filter, Normalization } from '@autoeq-workbench/core'
import type { FilterProvenance, SolutionState } from './workspaceStore'
import { cloneAutoEqRunRecord, type AutoEqRunRecord } from './autoEqRun'

export interface WorkspaceHistorySnapshot {
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
  autoEqRun: AutoEqRunRecord | null
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
    autoeqSettings: { ...state.autoeqSettings },
    filters: state.filters.map((filter) => ({ ...filter })),
    selectedFilterId: state.selectedFilterId,
    solutionState: state.solutionState,
    filterProvenance: state.filterProvenance,
    autoEqRun: cloneAutoEqRunRecord(state.autoEqRun),
    activeFrId: state.activeFrId,
    activeTargetId: state.activeTargetId,
  }
}

export function restoreHistorySnapshot(
  snapshot: WorkspaceHistorySnapshot,
  activeIds: ActiveCurveIds,
): WorkspaceHistoryState {
  const solutionState =
    snapshot.filterProvenance === 'autoeq' &&
    (snapshot.filters.length > 0 || snapshot.autoEqRun !== null) &&
    (snapshot.activeFrId !== activeIds.activeFrId ||
      snapshot.activeTargetId !== activeIds.activeTargetId)
      ? 'stale'
      : snapshot.solutionState

  return {
    normalization: { ...snapshot.normalization },
    autoeqSettings: { ...snapshot.autoeqSettings },
    filters: snapshot.filters.map((filter) => ({ ...filter })),
    selectedFilterId: snapshot.selectedFilterId,
    solutionState,
    filterProvenance: snapshot.filterProvenance,
    autoEqRun: cloneAutoEqRunRecord(snapshot.autoEqRun),
  }
}
