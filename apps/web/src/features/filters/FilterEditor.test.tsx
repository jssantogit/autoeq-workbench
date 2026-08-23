import type { Filter } from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
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
      filters: [],
      selectedFilterId: null,
      filterProvenance: null,
      solutionState: 'clean',
      canUndo: false,
      canRedo: false,
    })
  })

  it('offers PK, LS, and HS defaults and dense row operations', async () => {
    const user = userEvent.setup()
    render(<FilterEditor />)

    await user.click(screen.getByRole('button', { name: 'Add PK' }))
    await user.click(screen.getByRole('button', { name: 'Add LS' }))
    await user.click(screen.getByRole('button', { name: 'Add HS' }))
    expect(workspaceStore.getState().filters.map(({ type }) => type)).toEqual(['PK', 'LS', 'HS'])

    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().filters[0]?.enabled).toBe(false)
    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(workspaceStore.getState().filters[0]?.enabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('row', { name: /filter 1/i }), { key: 'Enter' })
    expect(workspaceStore.getState().selectedFilterId).toBe(workspaceStore.getState().filters[0]?.id)
    await user.click(screen.getByRole('button', { name: 'Actions for filter 1' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate filter 1' }))
    expect(workspaceStore.getState().filters).toHaveLength(4)
    const duplicateId = workspaceStore.getState().filters[1]?.id
    await user.click(screen.getByRole('button', { name: 'Actions for filter 2' }))
    await user.click(screen.getByRole('button', { name: 'Move filter 2 down' }))
    expect(workspaceStore.getState().filters[2]?.id).toBe(duplicateId)
    await user.click(screen.getByRole('button', { name: 'Remove filter 3' }))
    expect(workspaceStore.getState().filters).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(workspaceStore.getState().filters).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(workspaceStore.getState().filters).toHaveLength(3)
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
      'Fc',
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
      'Fc',
      'Gain',
      'Q',
      undefined,
    ])
    expect(row).toHaveAttribute('tabindex', '0')
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

  it('disables Add and duplicate choices at 64 filters', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      filters: Array.from({ length: 64 }, (_, index) => ({ ...filter, id: `filter-${index}` })),
    })
    render(<FilterEditor />)
    expect(screen.getByRole('button', { name: 'Add PK' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add LS' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add HS' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Actions for filter 1' }))
    expect(screen.getByRole('button', { name: 'Duplicate filter 1' })).toBeDisabled()
  })
})
