import { MVP_NUMERIC_POLICY, calculatePreampDb } from '@autoeq-workbench/core'
import type { StoreApi } from 'zustand/vanilla'
import { eqCompareStore, type EqCompareState } from './eqCompareStore'
import { workspaceStore, type WorkspaceState } from './workspaceStore'

export function initializeEqCompareRecorder(
  workspace: StoreApi<WorkspaceState> = workspaceStore,
  compare: StoreApi<EqCompareState> = eqCompareStore,
): () => void {
  const unsubscribe = workspace.subscribe((state, previousState) => {
    if (
      state.filters === previousState.filters &&
      state.filterProvenance === previousState.filterProvenance &&
      state.solutionState === previousState.solutionState
    ) return

    compare.getState().record({
      filters: state.filters,
      filterProvenance: state.filterProvenance,
      solutionState: state.solutionState,
      preampDb: calculatePreampDb(state.filters, MVP_NUMERIC_POLICY.sampleRateHz).preampDb,
    })
  })

  return () => {
    unsubscribe()
    compare.getState().cancelPending()
  }
}
