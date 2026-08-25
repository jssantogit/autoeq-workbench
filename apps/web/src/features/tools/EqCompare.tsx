import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import {
  eqCompareStore as defaultCompareStore,
  isCanonicalEqStateEqual,
  type EqCompareState,
  type EqSnapshot,
} from '../../state/eqCompareStore'
import {
  workspaceStore as defaultWorkspaceStore,
  type WorkspaceState,
} from '../../state/workspaceStore'

interface EqCompareProps {
  compareStore?: StoreApi<EqCompareState>
  workspaceStore?: StoreApi<WorkspaceState>
}

const buttonStyle = { minHeight: 36, minWidth: 0 }

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
  const aSnapshot = snapshots.find(({ id }) => id === aSnapshotId)
  const bSnapshot = snapshots.find(({ id }) => id === bSnapshotId)
  const currentState = { filters, filterProvenance, solutionState }

  const apply = (snapshot: EqSnapshot | undefined) => {
    if (snapshot === undefined) return
    compareStore.getState().suppressNext()
    workspaceStore.getState().applyFilterSnapshot({
      filters: snapshot.filters,
      filterProvenance: snapshot.filterProvenance,
      solutionState: snapshot.solutionState,
    })
  }

  return (
    <section
      className="tools-section eq-compare"
      aria-labelledby="eq-compare-heading"
      style={{ minWidth: 0 }}
    >
      <h3 id="eq-compare-heading">Compare A/B</h3>
      <div
        aria-label="Compare controls"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}
      >
        <button className="button" type="button" style={buttonStyle} disabled={aSnapshot === undefined} onClick={() => apply(aSnapshot)}>
          Apply A
        </button>
        <button className="button" type="button" style={buttonStyle} disabled={bSnapshot === undefined} onClick={() => apply(bSnapshot)}>
          Apply B
        </button>
        <button
          type="button"
          className="button"
          aria-label="Clear history and selection"
          style={{ ...buttonStyle, gridColumn: '1 / -1' }}
          disabled={snapshots.length === 0 && aSnapshotId === null && bSnapshotId === null}
          onClick={() => compareStore.getState().clear()}
        >
          Clear history / selection
        </button>
      </div>

      <div aria-live="polite" style={{ display: 'grid', gap: 3, margin: '8px 0' }}>
        <span>A: {aSnapshot?.summary ?? 'Not assigned'}</span>
        <span>B: {bSnapshot?.summary ?? 'Not assigned'}</span>
        {aSnapshot !== undefined && isCanonicalEqStateEqual(currentState, aSnapshot) && (
          <span>Current matches A</span>
        )}
        {bSnapshot !== undefined && isCanonicalEqStateEqual(currentState, bSnapshot) && (
          <span>Current matches B</span>
        )}
      </div>

      <div
        role="region"
        aria-label="EQ snapshot history"
        tabIndex={0}
        style={{ maxHeight: '20rem', minWidth: 0, overflowX: 'hidden', overflowY: 'auto' }}
      >
        {snapshots.length === 0 ? (
          <p>No EQ snapshots yet.</p>
        ) : (
          <ul style={{ display: 'grid', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
            {[...snapshots].reverse().map((snapshot) => {
              const assignedA = snapshot.id === aSnapshotId
              const assignedB = snapshot.id === bSnapshotId
              return (
                <li
                  key={snapshot.id}
                  style={{ minWidth: 0, padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
                >
                  <div data-testid="snapshot-summary" style={{ overflowWrap: 'anywhere' }}>
                    {snapshot.summary}
                  </div>
                  <div style={{ display: 'flex', minWidth: 0, flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      className="button"
                      aria-label={`Set A: ${snapshot.summary}`}
                      aria-pressed={assignedA}
                      style={buttonStyle}
                      onClick={() => compareStore.getState().setA(snapshot.id)}
                    >
                      Set A
                    </button>
                    <button
                      type="button"
                      className="button"
                      aria-label={`Set B: ${snapshot.summary}`}
                      aria-pressed={assignedB}
                      style={buttonStyle}
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
