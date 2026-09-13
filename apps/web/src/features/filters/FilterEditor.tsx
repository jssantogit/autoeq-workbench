import { AUTOEQ_PRODUCT_LIMITS } from '@autoeq-workbench/core'
import { Button } from '../../components/ui/Button'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { FilterRow } from './FilterRow'

export function FilterEditor() {
  const filters = useWorkspaceStore((state) => state.filters)
  const selectedFilterId = useWorkspaceStore((state) => state.selectedFilterId)
  const addFilter = useWorkspaceStore((state) => state.addFilter)
  const removeFilter = useWorkspaceStore((state) => state.removeFilter)
  const sortFilters = useWorkspaceStore((state) => state.sortFiltersByFrequency)
  const undo = useWorkspaceStore((state) => state.undo)
  const redo = useWorkspaceStore((state) => state.redo)
  const canUndo = useWorkspaceStore((state) => state.canUndo)
  const canRedo = useWorkspaceStore((state) => state.canRedo)
  const atLimit = filters.length >= AUTOEQ_PRODUCT_LIMITS.hardMaxFilters

  return (
    <div className="filter-editor">
      <div className="filter-table" role="table" aria-label="Equalizer filters">
        <div className="filters-header" role="row">
          <span role="columnheader">Type</span>
          <span role="columnheader">Frequency</span>
          <span role="columnheader">Gain</span>
          <span role="columnheader">Q</span>
        </div>
        <div className="filters" role="rowgroup">
          {filters.map((filter, index) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              index={index}
              selected={filter.id === selectedFilterId}
            />
          ))}
          {filters.length === 0 && <p className="filter-editor__empty">Add a filter to begin EQ.</p>}
        </div>
      </div>
      <div className="filter-editor__toolbar">
        <div className="filter-editor__operations" role="group" aria-label="Filter operations">
          <Button
            className="add-filter"
            aria-label="Add filter"
            disabled={atLimit}
            title="Add PK filter"
            onClick={() => addFilter('PK')}
          >+</Button>
          <Button
            className="remove-filter"
            aria-label="Remove selected filter"
            disabled={selectedFilterId === null}
            title={selectedFilterId === null ? 'Select a filter to remove it' : 'Remove selected filter'}
            onClick={() => selectedFilterId !== null && removeFilter(selectedFilterId)}
          >-</Button>
          <Button className="sort-filters" aria-label="Sort filters" onClick={sortFilters}>Sort</Button>
        </div>
        <div className="filter-editor__history" role="group" aria-label="Filter history">
          <Button disabled={!canUndo} onClick={undo}>Undo</Button>
          <Button disabled={!canRedo} onClick={redo}>Redo</Button>
        </div>
      </div>
    </div>
  )
}
