import type { FilterType } from '@autoeq-workbench/core'
import { Button } from '../../components/ui/Button'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { FilterRow } from './FilterRow'

const filterTypes: FilterType[] = ['PK', 'LS', 'HS']

export function FilterEditor() {
  const filters = useWorkspaceStore((state) => state.filters)
  const selectedFilterId = useWorkspaceStore((state) => state.selectedFilterId)
  const addFilter = useWorkspaceStore((state) => state.addFilter)
  const undo = useWorkspaceStore((state) => state.undo)
  const redo = useWorkspaceStore((state) => state.redo)
  const canUndo = useWorkspaceStore((state) => state.canUndo)
  const canRedo = useWorkspaceStore((state) => state.canRedo)
  const atLimit = filters.length >= 64

  return (
    <div className="filter-editor">
      <div className="filter-editor__toolbar">
        <div className="filter-editor__add" aria-label="Add filter">
          {filterTypes.map((type) => (
            <Button key={type} disabled={atLimit} onClick={() => addFilter(type)}>
              Add {type}
            </Button>
          ))}
        </div>
        <div className="filter-editor__history">
          <Button disabled={!canUndo} onClick={undo}>Undo</Button>
          <Button disabled={!canRedo} onClick={redo}>Redo</Button>
        </div>
      </div>
      <div className="filter-table-wrap">
        <table className="filter-table" aria-label="Equalizer filters">
          <thead className="filter-table__head">
            <tr><th>ON</th><th>Type</th><th>Fc</th><th>Gain</th><th>Q</th><th aria-label="Actions" /></tr>
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
      <p className="filter-editor__count">{filters.length} / 64 filters</p>
    </div>
  )
}
