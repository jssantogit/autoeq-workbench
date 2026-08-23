import type { Filter, FilterType } from '@autoeq-workbench/core'
import { NumberField } from '../../components/ui/NumberField'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface FilterRowProps {
  filter: Filter
  index: number
  count: number
  selected: boolean
}

export function FilterRow({ filter, index, count, selected }: FilterRowProps) {
  const updateFilter = useWorkspaceStore((state) => state.updateFilter)
  const toggleFilter = useWorkspaceStore((state) => state.toggleFilter)
  const duplicateFilter = useWorkspaceStore((state) => state.duplicateFilter)
  const removeFilter = useWorkspaceStore((state) => state.removeFilter)
  const reorderFilter = useWorkspaceStore((state) => state.reorderFilter)
  const selectFilter = useWorkspaceStore((state) => state.selectFilter)
  const rowNumber = index + 1
  const className = [
    'filter-row',
    selected && 'filter-row--selected',
    !filter.enabled && 'filter-row--disabled',
  ].filter(Boolean).join(' ')

  return (
    <tr className={className} data-selected={selected} data-enabled={filter.enabled}>
      <td data-label="ON">
        <input
          type="checkbox"
          checked={filter.enabled}
          aria-label={`Enable filter ${rowNumber}`}
          onChange={() => toggleFilter(filter.id)}
        />
      </td>
      <td data-label="#">
        <button
          type="button"
          className="filter-row__select"
          aria-label={`Select filter ${rowNumber}`}
          aria-pressed={selected}
          onClick={() => selectFilter(filter.id)}
        >
          {rowNumber}
        </button>
      </td>
      <td data-label="Type">
        <select
          value={filter.type}
          aria-label={`Filter ${rowNumber} type`}
          onChange={(event) => updateFilter(filter.id, { type: event.target.value as FilterType })}
        >
          <option value="PK">PK</option>
          <option value="LS">LS</option>
          <option value="HS">HS</option>
        </select>
      </td>
      <td data-label="Fc">
        <NumberField
          label={`Filter ${rowNumber} frequency Hz`}
          value={filter.frequencyHz}
          min={20}
          max={20_000}
          validate={(value) => value >= 20 && value <= 20_000}
          onValueChange={(frequencyHz) => updateFilter(filter.id, { frequencyHz })}
        />
      </td>
      <td data-label="Gain">
        <NumberField
          label={`Filter ${rowNumber} gain dB`}
          value={filter.gainDb}
          min={-15}
          max={15}
          step="0.1"
          validate={(value) => value >= -15 && value <= 15}
          onValueChange={(gainDb) => updateFilter(filter.id, { gainDb })}
        />
      </td>
      <td data-label="Q">
        <NumberField
          label={`Filter ${rowNumber} Q`}
          value={filter.q}
          min={0.1}
          max={12}
          step="0.1"
          validate={(value) => value >= 0.1 && value <= 12}
          onValueChange={(q) => updateFilter(filter.id, { q })}
        />
      </td>
      <td className="filter-row__actions" data-label="Actions">
        <button
          type="button"
          aria-label={`Move filter ${rowNumber} up`}
          disabled={index === 0}
          onClick={() => reorderFilter(filter.id, 'up')}
        >
          Up
        </button>
        <button
          type="button"
          aria-label={`Move filter ${rowNumber} down`}
          disabled={index === count - 1}
          onClick={() => reorderFilter(filter.id, 'down')}
        >
          Down
        </button>
        <button type="button" aria-label={`Duplicate filter ${rowNumber}`} onClick={() => duplicateFilter(filter.id)}>
          Copy
        </button>
        <button type="button" aria-label={`Remove filter ${rowNumber}`} onClick={() => removeFilter(filter.id)}>
          Remove
        </button>
      </td>
    </tr>
  )
}
