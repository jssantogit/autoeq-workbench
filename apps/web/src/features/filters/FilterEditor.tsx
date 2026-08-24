import { Button } from '../../components/ui/Button'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { FilterRow } from './FilterRow'

export function FilterEditor() {
  const filters = useWorkspaceStore((state) => state.filters)
  const selectedFilterId = useWorkspaceStore((state) => state.selectedFilterId)
  const addFilter = useWorkspaceStore((state) => state.addFilter)
  const removeFilter = useWorkspaceStore((state) => state.removeFilter)
  const undo = useWorkspaceStore((state) => state.undo)
  const redo = useWorkspaceStore((state) => state.redo)
  const canUndo = useWorkspaceStore((state) => state.canUndo)
  const canRedo = useWorkspaceStore((state) => state.canRedo)
  const atLimit = filters.length >= 64

  return (
    <div className="filter-editor">
      <div className="filter-table-wrap">
        <table className="filter-table" aria-label="Equalizer filters">
          <thead className="filter-table__head">
            <tr><th>ON</th><th>Type</th><th>Frequency</th><th>Gain</th><th>Q</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {filters.map((filter, index) => (
              <FilterRow
                key={filter.id}
                filter={filter}
                index={index}
                count={filters.length}
                selected={filter.id === selectedFilterId}
              />
            ))}
          </tbody>
        </table>
        {filters.length === 0 && <p className="filter-editor__empty">Add a filter to begin EQ.</p>}
      </div>
      <div className="filter-editor__toolbar">
        <div className="filter-editor__actions">
          <Button
            aria-label="Add filter"
            disabled={atLimit}
            title="Add PK filter"
            onClick={() => addFilter('PK')}
          >+</Button>
          <Button
            aria-label="Remove selected filter"
            disabled={selectedFilterId === null}
            title={selectedFilterId === null ? 'Select a filter to remove it' : 'Remove selected filter'}
            onClick={() => selectedFilterId !== null && removeFilter(selectedFilterId)}
          >-</Button>
          <Button
            aria-label="Sort filters"
            disabled
            title="Sorting is unavailable until a deterministic rule is defined"
          >Sort</Button>
        </div>
        <div className="filter-editor__history">
          <Button disabled={!canUndo} onClick={undo}>Undo</Button>
          <Button disabled={!canRedo} onClick={redo}>Redo</Button>
        </div>
      </div>
      <p className="filter-editor__count">{filters.length} / 64 filters</p>
    </div>
  )
}
