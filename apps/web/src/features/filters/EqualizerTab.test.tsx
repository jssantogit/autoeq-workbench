import { DEFAULT_AUTOEQ_SETTINGS, type Curve, type Filter } from '@autoeq-workbench/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
      filters: [],
      selectedFilterId: null,
      filterProvenance: null,
      solutionState: 'clean',
      canUndo: false,
      canRedo: false,
    })
  })

  it('uses the source composition and final action positions', () => {
    render(<EqualizerTab />)

    const panel = screen.getByRole('region', { name: 'Equalizer workspace' })
    expect(panel).toHaveClass('extra-eq')
    expect(within(panel).getByRole('heading', { name: 'Parametric Equalizer' })).toBeVisible()
    expect(within(panel).getByRole('combobox', { name: 'FR' })).toBeDisabled()
    expect(within(panel).getByRole('combobox', { name: 'Target' })).toBeDisabled()
    expect(within(panel).getAllByRole('columnheader').map(({ textContent }) => textContent)).toEqual([
      'Type',
      'Frequency',
      'Gain',
      'Q',
    ])
    expect(within(panel).getByRole('button', { name: 'Add filter' })).toHaveTextContent('+')
    expect(within(panel).getByRole('button', { name: 'Remove selected filter' })).toHaveTextContent('-')
    expect(within(panel).getByRole('button', { name: 'Sort filters' })).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'AutoEQ settings' })).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'AutoEQ' })).toBeEnabled()
    expect(within(panel).getByRole('button', { name: 'Import' })).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Export Graphic EQ (For Wavelet)' })).toBeDisabled()
    expect(within(panel).getByText('0 / 64 filters')).toBeVisible()
  })

  it('lists profiles separately and updates canonical active IDs', async () => {
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

    const selectors = screen.getByRole('group', { name: 'Equalizer profile' })
    const fr = within(selectors).getByRole('combobox', { name: 'FR' })
    const target = within(selectors).getByRole('combobox', { name: 'Target' })
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
    expect(workspaceStore.getState()).toMatchObject({ activeFrId: 'fr-2', activeTargetId: 'target-2' })
  })

  it('keeps AutoEQ inert without workers or network activity', async () => {
    const user = userEvent.setup()
    const worker = vi.fn()
    const fetchMock = vi.fn()
    const xhr = vi.fn()
    vi.stubGlobal('Worker', worker)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', xhr)
    workspaceStore.setState({
      filters: [filter],
      selectedFilterId: filter.id,
      filterProvenance: 'manual',
      solutionState: 'modified',
    })
    render(<EqualizerTab />)
    const before = workspaceStore.getState()

    await user.click(screen.getByRole('button', { name: 'AutoEQ' }))

    expect(workspaceStore.getState()).toEqual(before)
    expect(worker).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
  })

  it('toggles the validated constraints control', async () => {
    const user = userEvent.setup()
    render(<EqualizerTab />)
    const toggle = screen.getByRole('button', { name: 'AutoEQ settings' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'AutoEQ Settings' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'AutoEQ Settings' })).toBeVisible()
  })
})
