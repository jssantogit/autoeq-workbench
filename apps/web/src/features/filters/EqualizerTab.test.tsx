import { DEFAULT_AUTOEQ_SETTINGS, type Curve, type Filter } from '@autoeq-workbench/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoEqRunStore } from '../../state/autoeqRunStore'
import { deriveWorkspace, workspaceStore } from '../../state/workspaceStore'
import { EqualizerTab } from './EqualizerTab'

const { cancelAutoEqMock, runAutoEqMock } = vi.hoisted(() => ({
  cancelAutoEqMock: vi.fn(),
  runAutoEqMock: vi.fn(),
}))

vi.mock('../../state/autoeqController', () => ({
  cancelAutoEq: cancelAutoEqMock,
  runAutoEq: runAutoEqMock,
}))

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

function renderEqualizer() {
  return render(<EqualizerTab derived={deriveWorkspace(workspaceStore.getState())} />)
}

function setReadyCurves() {
  workspaceStore.setState({
    curves: [curve('fr-1', 'Measurement A', 'fr'), curve('target-1', 'Target A', 'target')],
    activeFrId: 'fr-1',
    activeTargetId: 'target-1',
  })
}

describe('EqualizerTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    cancelAutoEqMock.mockReset()
    runAutoEqMock.mockReset()
    runAutoEqMock.mockResolvedValue(undefined)
    autoEqRunStore.getState().reset()
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
    renderEqualizer()

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
    expect(within(panel).getByRole('button', { name: 'AutoEQ' })).toBeDisabled()
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
    renderEqualizer()

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

  it('enables AutoEQ only for ready active coverage without adding another settings surface', async () => {
    const user = userEvent.setup()
    setReadyCurves()
    renderEqualizer()

    const action = screen.getByRole('button', { name: 'AutoEQ' })
    expect(action).toBeEnabled()
    expect(screen.queryByText('Standard')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AutoEQ Settings' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'AutoEQ settings' }))
    expect(screen.getAllByRole('region', { name: 'AutoEQ Settings' })).toHaveLength(1)
  })

  it('keeps AutoEQ disabled when active FR and Target do not cover the evaluation range', () => {
    workspaceStore.setState({
      curves: [
        {
          ...curve('fr-1', 'Measurement A', 'fr'),
          rawPoints: [
            { frequencyHz: 40, db: 0 },
            { frequencyHz: 10_000, db: 0 },
          ],
        },
        {
          ...curve('target-1', 'Target A', 'target'),
          rawPoints: [
            { frequencyHz: 40, db: 0 },
            { frequencyHz: 10_000, db: 0 },
          ],
        },
      ],
      activeFrId: 'fr-1',
      activeTargetId: 'target-1',
    })
    const derived = deriveWorkspace(workspaceStore.getState())

    expect(derived.status).toBe('coverage-error')
    render(<EqualizerTab derived={derived} />)

    expect(screen.getByRole('button', { name: 'AutoEQ' })).toBeDisabled()
  })

  it('turns the action into Cancel without a progress meter while running', async () => {
    const user = userEvent.setup()
    setReadyCurves()
    autoEqRunStore.getState().start('run-1')
    renderEqualizer()

    expect(screen.queryByRole('button', { name: 'AutoEQ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancelAutoEqMock).toHaveBeenCalledOnce()
  })

  it('shows a compact structured error without replacing prior filter rows', () => {
    workspaceStore.setState({
      filters: [filter],
      selectedFilterId: filter.id,
      filterProvenance: 'manual',
      solutionState: 'modified',
    })
    autoEqRunStore.getState().reject({
      category: 'optimization',
      message: 'AutoEQ optimization failed.',
    })
    renderEqualizer()

    expect(screen.getByRole('alert')).toHaveTextContent('[optimization] AutoEQ optimization failed.')
    expect(screen.getByRole('row', { name: 'Filter 1' })).toBeVisible()
    expect(screen.getByLabelText('Filter 1 gain dB')).toHaveValue(2)
  })

  it('toggles the validated constraints control', async () => {
    const user = userEvent.setup()
    renderEqualizer()
    const toggle = screen.getByRole('button', { name: 'AutoEQ settings' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'AutoEQ Settings' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'AutoEQ Settings' })).toBeVisible()
  })
})
