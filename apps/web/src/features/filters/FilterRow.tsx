import {
  AUTOEQ_PRODUCT_LIMITS,
  MVP_NUMERIC_POLICY,
  type Filter,
} from '@autoeq-workbench/core'
import { NumberField } from '../../components/ui/NumberField'
import { fromSquiglinkFilterType, toSquiglinkFilterType, type SquiglinkFilterType } from '../../squiglink/eq-io/filterTypeAdapter'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface FilterRowProps {
  filter: Filter
  index: number
  selected: boolean
}

export function FilterRow({ filter, index, selected }: FilterRowProps) {
  const updateFilter = useWorkspaceStore((state) => state.updateFilter)
  const toggleFilter = useWorkspaceStore((state) => state.toggleFilter)
  const selectFilter = useWorkspaceStore((state) => state.selectFilter)
  const rowNumber = index + 1
  const className = [
    'filter',
    'filter-row',
    !filter.enabled && 'filter-row--disabled',
  ].filter(Boolean).join(' ')

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    selectFilter(filter.id)
  }

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('button, input, select, textarea') !== null) return
    selectFilter(filter.id)
  }

  return (
    <div
      role="row"
      className={className}
      aria-label={`Filter ${rowNumber}`}
      aria-selected={selected}
      data-selected={selected}
      data-enabled={filter.enabled}
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
    >
      <span role="cell" data-label="Type">
        <input
          name="enabled"
          type="checkbox"
          checked={filter.enabled}
          aria-label={`Enable filter ${rowNumber}`}
          onChange={() => toggleFilter(filter.id)}
        />
        <select
          name="type"
          value={toSquiglinkFilterType(filter.type)}
          aria-label={`Filter ${rowNumber} type`}
          onChange={(event) => updateFilter(filter.id, {
            type: fromSquiglinkFilterType(event.target.value as SquiglinkFilterType),
          })}
        >
          <option value="PK">PK</option>
          <option value="LSQ">LSQ</option>
          <option value="HSQ">HSQ</option>
        </select>
      </span>
      <span role="cell" data-label="Frequency">
        <NumberField
          label={`Filter ${rowNumber} frequency Hz`}
          unit="Hz"
          value={filter.frequencyHz}
          min={MVP_NUMERIC_POLICY.minFrequencyHz}
          max={MVP_NUMERIC_POLICY.maxFrequencyHz}
          validate={(value) =>
            value >= MVP_NUMERIC_POLICY.minFrequencyHz && value <= MVP_NUMERIC_POLICY.maxFrequencyHz}
          onValueChange={(frequencyHz) => updateFilter(filter.id, { frequencyHz })}
        />
      </span>
      <span role="cell" data-label="Gain">
        <NumberField
          label={`Filter ${rowNumber} gain dB`}
          unit="dB"
          value={filter.gainDb}
          min={AUTOEQ_PRODUCT_LIMITS.minGainDb}
          max={AUTOEQ_PRODUCT_LIMITS.maxGainDb}
          step="0.1"
          validate={(value) =>
            value >= AUTOEQ_PRODUCT_LIMITS.minGainDb && value <= AUTOEQ_PRODUCT_LIMITS.maxGainDb}
          onValueChange={(gainDb) => updateFilter(filter.id, { gainDb })}
        />
      </span>
      <span role="cell" data-label="Q">
        <NumberField
          label={`Filter ${rowNumber} Q`}
          value={filter.q}
          min={AUTOEQ_PRODUCT_LIMITS.minQ}
          max={AUTOEQ_PRODUCT_LIMITS.maxQ}
          step="0.01"
          validate={(value) => value >= AUTOEQ_PRODUCT_LIMITS.minQ && value <= AUTOEQ_PRODUCT_LIMITS.maxQ}
          onValueChange={(q) => updateFilter(filter.id, { q })}
        />
      </span>
    </div>
  )
}
