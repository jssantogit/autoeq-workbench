import type { Filter, Normalization } from '@autoeq-workbench/core'
import type { FilterProvenance, SolutionState } from './workspaceStore'

// Task 7 will add history operations; Task 6 only establishes the authoritative snapshot boundary.
export interface WorkspaceHistorySnapshot {
  sourceNormalization: Normalization
  targetNormalization: Normalization
  filters: Filter[]
  selectedFilterId: string | null
  solutionState: SolutionState
  filterProvenance: FilterProvenance | null
}
