import { DEFAULT_AUTOEQ_SETTINGS, type Filter } from '@autoeq-workbench/core'
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

  it('adds a default PK and supports selected removal and dense row operations', async () => {
    const user = userEvent.setup()
    render(<FilterEditor />)

    const removeSelected = screen.getByRole('button', { name: 'Remove selected filter' })
    expect(removeSelected).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(workspaceStore.getState().filters.map(({ type }) => type)).toEqual(['PK'])
    expect(removeSelected).toBeEnabled()

    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().filters[0]?.enabled).toBe(false)
    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().filters[0]?.enabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('row', { name: /filter 1/i }), { key: 'Enter' })
    expect(workspaceStore.getState().selectedFilterId).toBe(workspaceStore.getState().filters[0]?.id)
    await user.click(screen.getByRole('button', { name: 'Actions for filter 1' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate filter 1' }))
    expect(workspaceStore.getState().filters).toHaveLength(2)
    const duplicateId = workspaceStore.getState().filters[1]?.id
    await user.click(screen.getByRole('button', { name: 'Actions for filter 2' }))
    await user.click(screen.getByRole('button', { name: 'Move filter 2 up' }))
    expect(workspaceStore.getState().filters[0]?.id).toBe(duplicateId)
    await user.click(removeSelected)
    expect(workspaceStore.getState().filters).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(workspaceStore.getState().filters).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(workspaceStore.getState().filters).toHaveLength(1)
  }, 10_000)

  it('keeps Sort disabled and removes the old type-specific add controls', () => {
    render(<FilterEditor />)

    expect(screen.getByRole('button', { name: 'Sort filters' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sort filters' })).toHaveAttribute(
      'title',
      'Sorting is unavailable until a deterministic rule is defined',
    )
    expect(screen.queryByRole('button', { name: 'Add PK' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add LS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add HS' })).not.toBeInTheDocument()
  })

  it('keeps temporary numeric text local and commits once on blur or Enter', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ filters: [filter], selectedFilterId: filter.id, filterProvenance: 'manual' })
    render(<FilterEditor />)
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })

    await user.clear(gain)
    await user.type(gain, '3')
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(0)
    fireEvent.blur(gain)
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(3)
    workspaceStore.getState().undo()
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(0)

    await user.clear(gain)
    await user.type(gain, '4')
    await user.keyboard('{Enter}')
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(4)
  })

  it('shows invalid local text without committing it', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ filters: [filter], selectedFilterId: filter.id, filterProvenance: 'manual' })
    render(<FilterEditor />)
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })

    await user.clear(gain)
    await user.type(gain, '16')
    fireEvent.blur(gain)
    expect(gain).toHaveAttribute('aria-invalid', 'true')
    expect(gain).toHaveValue(16)
    expect(workspaceStore.getState().filters[0]?.gainDb).toBe(0)
  })

  it('exposes one compact semantic row with the primary columns and a closed action menu', () => {
    workspaceStore.setState({ filters: [filter] })
    render(<FilterEditor />)

    expect(screen.getByRole('table', { name: 'Equalizer filters' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(6)
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'ON',
      'Type',
      'Frequency',
      'Gain',
      'Q',
      '',
    ])
    const row = screen.getByRole('row', { name: /filter 1/i })
    expect(row).toContainElement(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(row).toContainElement(screen.getByRole('combobox', { name: 'Filter 1 type' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 frequency Hz' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' }))
    expect(row).toContainElement(screen.getByRole('spinbutton', { name: 'Filter 1 Q' }))
    expect(row).toContainElement(screen.getByRole('button', { name: 'Actions for filter 1' }))
    expect(screen.queryByRole('button', { name: 'Move filter 1 up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate filter 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove filter 1' })).not.toBeInTheDocument()
    expect(Array.from(row.querySelectorAll('td')).map((cell) => cell.dataset.label)).toEqual([
      'ON',
      'Type',
      'Frequency',
      'Gain',
      'Q',
      undefined,
    ])
    expect(row).toHaveAttribute('tabindex', '0')
    expect(within(row).getByText('Hz')).toHaveAttribute('aria-hidden', 'true')
    expect(within(row).getByText('dB')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Filter 1 frequency Hz' })).toHaveValue(1_000)
    expect(screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })).toHaveValue(0)
  })

  it('reveals compact overflow actions with movement boundaries and removal', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ filters: [filter, { ...filter, id: 'filter-2' }] })
    render(<FilterEditor />)

    await user.click(screen.getByRole('button', { name: 'Actions for filter 1' }))
    expect(screen.getByRole('button', { name: 'Move filter 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move filter 1 down' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Duplicate filter 1' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Remove filter 1' }))
    expect(workspaceStore.getState().filters.map(({ id }) => id)).toEqual(['filter-2'])
  })

  it('does not let interactive row descendants override their own selection behavior', async () => {
    const user = userEvent.setup()
    const second = { ...filter, id: 'filter-2' }
    workspaceStore.setState({ filters: [filter, second], selectedFilterId: second.id })
    render(<FilterEditor />)

    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(second.id)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter 1 type' }), 'LS')
    expect(workspaceStore.getState().filters[0]?.type).toBe('LS')
    expect(workspaceStore.getState().selectedFilterId).toBe(second.id)
    await user.click(screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(second.id)
    await user.click(screen.getByRole('button', { name: 'Actions for filter 1' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(second.id)
    await user.click(screen.getByRole('button', { name: 'Duplicate filter 1' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(workspaceStore.getState().filters[1]?.id)
  })

  it('marks selected and disabled filters without relying on color alone', () => {
    workspaceStore.setState({
      filters: [{ ...filter, enabled: false }],
      selectedFilterId: filter.id,
    })
    render(<FilterEditor />)

    const row = screen.getByRole('row', { name: /filter 1/i })
    expect(row).toHaveClass('filter-row--selected', 'filter-row--disabled')
    expect(row).toHaveAttribute('data-selected', 'true')
    expect(row).toHaveAttribute('data-enabled', 'false')
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('checkbox', { name: 'Enable filter 1' })).not.toBeChecked()
  })

  it('disables Add and duplicate choices at 64 filters', () => {
    workspaceStore.setState({
      filters: Array.from({ length: 64 }, (_, index) => ({ ...filter, id: `filter-${index}` })),
    })
    render(<FilterEditor />)
    expect(screen.getByLabelText('Add filter')).toBeDisabled()
    const menu = screen.getByLabelText('Actions for filter 1').closest('details')!
    menu.open = true
    fireEvent(menu, new Event('toggle'))
    expect(screen.getByLabelText('Duplicate filter 1')).toBeDisabled()
  }, 20_000)

  it('renders twenty compact rows while keeping the toolbar and last-row menu available', () => {
    workspaceStore.setState({
      filters: Array.from({ length: 20 }, (_, index) => ({ ...filter, id: `filter-${index + 1}` })),
    })
    render(<FilterEditor />)

    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(screen.getByRole('button', { name: 'Add filter' })).toBeEnabled()
    expect(screen.getByText('20 / 64 filters')).toBeVisible()
    const menu = screen.getByLabelText('Actions for filter 20').closest('details')!
    menu.open = true
    fireEvent(menu, new Event('toggle'))
    expect(screen.getByLabelText('Move filter 20 up')).toBeEnabled()
    expect(screen.getByLabelText('Remove filter 20')).toBeEnabled()
  }, 20_000)
})
