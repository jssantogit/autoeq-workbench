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

    await user.click(screen.getByRole('button', { name: 'Select filter 1' }))
    expect(workspaceStore.getState().selectedFilterId).toBe(workspaceStore.getState().filters[0]?.id)
    await user.click(screen.getByRole('button', { name: 'Duplicate filter 1' }))
    expect(workspaceStore.getState().filters).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Move filter 2 down' }))
    await user.click(screen.getByRole('button', { name: 'Remove filter 3' }))
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

  it('disables all Add choices at 64 filters', () => {
    workspaceStore.setState({
      filters: Array.from({ length: 64 }, (_, index) => ({ ...filter, id: `filter-${index}` })),
    })
    render(<FilterEditor />)
    expect(screen.getByRole('button', { name: 'Add PK' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add LS' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add HS' })).toBeDisabled()
  })
})
