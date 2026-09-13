import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import {
  eqCompareStore as defaultCompareStore,
  isCanonicalEqStateEqual,
  type EqCompareState,
  type EqSnapshot,
} from '../../state/eqCompareStore'
import { createAutoEqRunInputSignature } from '../../state/autoEqRunInputSignature'
import {
  workspaceStore as defaultWorkspaceStore,
  type WorkspaceState,
} from '../../state/workspaceStore'

interface EqCompareProps {
  compareStore?: StoreApi<EqCompareState>
  workspaceStore?: StoreApi<WorkspaceState>
}

export function EqCompare({
  compareStore = defaultCompareStore,
  workspaceStore = defaultWorkspaceStore,
}: EqCompareProps) {
  const snapshots = useStore(compareStore, (state) => state.snapshots)
  const aSnapshotId = useStore(compareStore, (state) => state.aSnapshotId)
  const bSnapshotId = useStore(compareStore, (state) => state.bSnapshotId)
  const filters = useStore(workspaceStore, (state) => state.filters)
  const filterProvenance = useStore(workspaceStore, (state) => state.filterProvenance)
  const solutionState = useStore(workspaceStore, (state) => state.solutionState)
  const autoEqRun = useStore(workspaceStore, (state) => state.autoEqRun)
  const aSnapshot = snapshots.find(({ id }) => id === aSnapshotId)
  const bSnapshot = snapshots.find(({ id }) => id === bSnapshotId)
  const currentState = { filters, filterProvenance, solutionState, autoEqRun }

  const apply = (snapshot: EqSnapshot | undefined) => {
    if (snapshot === undefined) return
    const incompatibleAutoEqContext =
      snapshot.filterProvenance === 'autoeq' &&
      snapshot.solutionState !== 'stale' &&
      createAutoEqRunInputSignature(workspaceStore.getState()) !== snapshot.runInputSignature
    compareStore.getState().suppressNext()
    workspaceStore.getState().applyFilterSnapshot({
      filters: snapshot.filters,
      filterProvenance: snapshot.filterProvenance,
      solutionState: incompatibleAutoEqContext ? 'stale' : snapshot.solutionState,
      autoEqRun: snapshot.autoEqRun,
    })
  }

  return (
    <section className="tools-section eq-compare" aria-labelledby="eq-compare-heading">
      <h3 id="eq-compare-heading">Compare A/B</h3>
      <div className="eq-compare__controls" aria-label="Compare controls">
        <button className="button" type="button" disabled={aSnapshot === undefined} onClick={() => apply(aSnapshot)}>
          Apply A
        </button>
        <button className="button" type="button" disabled={bSnapshot === undefined} onClick={() => apply(bSnapshot)}>
          Apply B
        </button>
        <button
          type="button"
          className="button eq-compare__clear"
          aria-label="Clear history and selection"
          disabled={snapshots.length === 0 && aSnapshotId === null && bSnapshotId === null}
          onClick={() => compareStore.getState().clear()}
        >
          Clear history / selection
        </button>
      </div>

      <div className="eq-compare__status" aria-live="polite">
        <div className="eq-compare__slot" role="group" aria-label="A comparison slot">
          <span className="eq-compare__slot-label">A</span>
          <span className="eq-compare__slot-value">{aSnapshot?.summary ?? 'Not assigned'}</span>
          {aSnapshot !== undefined && isCanonicalEqStateEqual(currentState, aSnapshot) && (
            <span className="eq-compare__current">Current matches A</span>
          )}
        </div>
        <div className="eq-compare__slot" role="group" aria-label="B comparison slot">
          <span className="eq-compare__slot-label">B</span>
          <span className="eq-compare__slot-value">{bSnapshot?.summary ?? 'Not assigned'}</span>
          {bSnapshot !== undefined && isCanonicalEqStateEqual(currentState, bSnapshot) && (
            <span className="eq-compare__current">Current matches B</span>
          )}
        </div>
      </div>

      <div
        className="eq-compare__history"
        role="region"
        aria-label="EQ snapshot history"
        tabIndex={0}
      >
        {snapshots.length === 0 ? (
          <p className="eq-compare__empty">No EQ snapshots yet.</p>
        ) : (
          <ul className="eq-compare__snapshots">
            {[...snapshots].reverse().map((snapshot) => {
              const assignedA = snapshot.id === aSnapshotId
              const assignedB = snapshot.id === bSnapshotId
              return (
                <li className="eq-compare__snapshot" key={snapshot.id}>
                  <div className="eq-compare__snapshot-summary" data-testid="snapshot-summary">
                    {snapshot.summary}
                  </div>
                  <div className="eq-compare__snapshot-actions">
                    <button
                      type="button"
                      className="button"
                      aria-label={`Set A: ${snapshot.summary}`}
                      aria-pressed={assignedA}
                      onClick={() => compareStore.getState().setA(snapshot.id)}
                    >
                      Set A
                    </button>
                    <button
                      type="button"
                      className="button"
                      aria-label={`Set B: ${snapshot.summary}`}
                      aria-pressed={assignedB}
                      onClick={() => compareStore.getState().setB(snapshot.id)}
                    >
                      Set B
                    </button>
                    {assignedA && <span>Assigned A</span>}
                    {assignedB && <span>Assigned B</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
