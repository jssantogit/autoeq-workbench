import type { Curve, Filter } from '@autoeq-workbench/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceStore } from '../../state/workspaceStore'
import { EqualizerTab } from './EqualizerTab'

const curve = (id: string, name: string, kind: Curve['kind']): Curve => ({
  id,
  name,
  kind,
  rawPoints: [
    { frequencyHz: 20, db: 0 },
    { frequencyHz: 20_000, db: 0 },
  ],
  metadata: {},
})

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 2,
  q: 1,
}

describe('EqualizerTab', () => {
  beforeEach(() => {
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      filters: [],
      selectedFilterId: null,
      filterProvenance: null,
      solutionState: 'clean',
      canUndo: false,
      canRedo: false,
    })
  })

  it('lists each loaded curve only in its matching profile selector and updates active IDs', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      curves: [
        curve('fr-1', 'Measurement A', 'fr'),
        curve('target-1', 'Target A', 'target'),
        curve('fr-2', 'Measurement B', 'fr'),
        curve('target-2', 'Target B', 'target'),
      ],
      activeFrId: 'fr-1',
      activeTargetId: 'target-1',
    })
    render(<EqualizerTab />)

    const profile = screen.getByRole('group', { name: 'Equalizer profile' })
    const fr = within(profile).getByRole('combobox', { name: 'FR' })
    const target = within(profile).getByRole('combobox', { name: 'Target' })
    expect(within(fr).getAllByRole('option').map(({ textContent }) => textContent)).toEqual([
      'Measurement A',
      'Measurement B',
    ])
    expect(within(target).getAllByRole('option').map(({ textContent }) => textContent)).toEqual([
      'Target A',
      'Target B',
    ])

    await user.selectOptions(fr, 'fr-2')
    await user.selectOptions(target, 'target-2')
    expect(workspaceStore.getState()).toMatchObject({
      activeFrId: 'fr-2',
      activeTargetId: 'target-2',
    })
  })

  it('shows clear disabled placeholders when profile inputs are unavailable', () => {
    render(<EqualizerTab />)

    expect(screen.getByRole('combobox', { name: 'FR' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'FR' })).toHaveDisplayValue('No FR loaded')
    expect(screen.getByRole('combobox', { name: 'Target' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveDisplayValue('No Target loaded')
  })

  it('preserves filters across profile changes and keeps Auto EQ inert for Plan 2', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      curves: [
        curve('fr-1', 'Measurement A', 'fr'),
        curve('fr-2', 'Measurement B', 'fr'),
        curve('target-1', 'Target A', 'target'),
      ],
      activeFrId: 'fr-1',
      activeTargetId: 'target-1',
      filters: [filter],
      selectedFilterId: filter.id,
      filterProvenance: 'manual',
    })
    render(<EqualizerTab />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'FR' }), 'fr-2')
    expect(workspaceStore.getState().filters).toEqual([filter])

    const before = workspaceStore.getState()
    const autoEq = screen.getByRole('button', { name: 'Auto EQ' })
    expect(autoEq).toBeDisabled()
    expect(autoEq).toHaveAttribute('title', 'Auto EQ engine arrives in Plan 2')
    await user.click(autoEq)
    expect(workspaceStore.getState()).toEqual(before)
  })
})
