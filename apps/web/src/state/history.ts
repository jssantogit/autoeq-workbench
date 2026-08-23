import type { Filter, Normalization } from '@autoeq-workbench/core'
import type { FilterProvenance, SolutionState } from './workspaceStore'

export interface WorkspaceHistorySnapshot {
  normalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
}

export function createHistorySnapshot(state: WorkspaceHistorySnapshot): WorkspaceHistorySnapshot {
  return {
    normalization: { ...state.normalization },
    filters: state.filters.map((filter) => ({ ...filter })),
    selectedFilterId: state.selectedFilterId,
    solutionState: state.solutionState,
    filterProvenance: state.filterProvenance,
  }
}
