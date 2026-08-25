import { AUTOEQ_PRODUCT_LIMITS, DEFAULT_AUTOEQ_SETTINGS, type Filter } from '@autoeq-workbench/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceStore } from '../../state/workspaceStore'
import { FilterEditor } from './FilterEditor'

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 0,
  q: 1,
}

describe('FilterEditor', () => {
  beforeEach(() => {
    workspaceStore.setState({
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
      filters: [],
      selectedFilterId: null,
      filterProvenance: null,
      solutionState: 'clean',
      canUndo: false,
      canRedo: false,
    })
  })

  it('adds PK, removes the selection, sorts atomically, and preserves Undo/Redo', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      filters: [
        { ...filter, id: 'high', frequencyHz: 2_000 },
        { ...filter, id: 'low', frequencyHz: 200 },
      ],
      selectedFilterId: null,
    })
    render(<FilterEditor />)

    expect(screen.getByRole('button', { name: 'Remove selected filter' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Sort filters' }))
    expect(workspaceStore.getState().filters.map(({ id }) => id)).toEqual(['low', 'high'])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(workspaceStore.getState().filters.map(({ id }) => id)).toEqual(['high', 'low'])
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(workspaceStore.getState().filters.map(({ id }) => id)).toEqual(['low', 'high'])

    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(workspaceStore.getState().filters.at(-1)?.type).toBe('PK')
    await user.click(screen.getByRole('button', { name: 'Remove selected filter' }))
    expect(workspaceStore.getState().filters).toHaveLength(2)
  }, 10_000)

  it('renders source-style accessible rows with enabled state and four columns', () => {
    workspaceStore.setState({ filters: [filter] })
    render(<FilterEditor />)

    const table = screen.getByRole('table', { name: 'Equalizer filters' })
    expect(table).toHaveClass('filter-table')
    expect(within(table).getAllByRole('columnheader').map(({ textContent }) => textContent)).toEqual([
      'Type',
      'Frequency',
      'Gain',
      'Q',
    ])
    const row = within(table).getByRole('row', { name: /filter 1/i })
    expect(row).toHaveClass('filter')
    expect(row).toContainElement(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(row).toContainElement(screen.getByRole('combobox', { name: 'Filter 1 type' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 frequency Hz' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 Q' }))
    expect(row).toHaveAttribute('tabindex', '0')
    expect(within(row).getByText('Hz')).toHaveAttribute('aria-hidden', 'true')
    expect(within(row).getByText('dB')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: 'Actions for filter 1' })).not.toBeInTheDocument()
  })

  it('maps source LSQ and HSQ labels to canonical filter types', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ filters: [filter] })
    render(<FilterEditor />)
    const type = screen.getByRole('combobox', { name: 'Filter 1 type' })

    expect(within(type).getAllByRole('option').map(({ textContent }) => textContent)).toEqual(['PK', 'LSQ', 'HSQ'])
    await user.selectOptions(type, 'LSQ')
    expect(workspaceStore.getState().filters[0]?.type).toBe('LS')
    expect(type).toHaveValue('LSQ')
    await user.selectOptions(type, 'HSQ')
    expect(workspaceStore.getState().filters[0]?.type).toBe('HS')
  })

  it('keeps row selection keyboard-accessible and interactive descendants independent', async () => {
    const user = userEvent.setup()
    const second = { ...filter, id: 'filter-2' }
    workspaceStore.setState({ filters: [filter, second], selectedFilterId: second.id })
    render(<FilterEditor />)
    const firstRow = screen.getByRole('row', { name: /filter 1/i })

    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(second.id)
    fireEvent.keyDown(firstRow, { key: 'Enter' })
    expect(workspaceStore.getState().selectedFilterId).toBe(filter.id)
  })

  it('keeps temporary numeric text local and rejects values outside core limits', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ filters: [filter], selectedFilterId: filter.id })
    render(<FilterEditor />)
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })

    expect(gain).toHaveAttribute('min', String(AUTOEQ_PRODUCT_LIMITS.minGainDb))
    expect(gain).toHaveAttribute('max', String(AUTOEQ_PRODUCT_LIMITS.maxGainDb))
    await user.clear(gain)
    await user.type(gain, '3')
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(0)
    fireEvent.blur(gain)
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(3)

    await user.clear(gain)
    await user.type(gain, String(AUTOEQ_PRODUCT_LIMITS.maxGainDb + 1))
    fireEvent.blur(gain)
    expect(gain).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(3)
  })

  it('marks selected and disabled filters without relying on color alone', () => {
    workspaceStore.setState({ filters: [{ ...filter, enabled: false }], selectedFilterId: filter.id })
    render(<FilterEditor />)
    const row = screen.getByRole('row', { name: /filter 1/i })

    expect(row).toHaveClass('filter-row--selected', 'filter-row--disabled')
    expect(row).toHaveAttribute('data-selected', 'true')
    expect(row).toHaveAttribute('data-enabled', 'false')
    expect(row).toHaveAttribute('aria-selected', 'true')
  })

  it('uses the product hard filter limit in controls and status', () => {
    workspaceStore.setState({
      filters: Array.from({ length: AUTOEQ_PRODUCT_LIMITS.hardMaxFilters }, (_, index) => ({
        ...filter,
        id: `filter-${index}`,
      })),
    })
    render(<FilterEditor />)

    expect(screen.getByRole('button', { name: 'Add filter' })).toBeDisabled()
    expect(screen.getByText(`${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters} / ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters} filters`)).toBeVisible()
  })
})
