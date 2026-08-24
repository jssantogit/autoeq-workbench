import { DEFAULT_AUTOEQ_SETTINGS, type Curve, type Filter } from '@autoeq-workbench/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
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

  it('uses separate FR and Target action rows so the mobile hierarchy cannot collapse to one row', () => {
    render(<EqualizerTab />)

    const profile = screen.getByRole('group', { name: 'Equalizer profile' })
    const frRow = within(profile).getByRole('combobox', { name: 'FR' }).closest('.equalizer-profile__fr-row')
    const targetRow = within(profile).getByRole('combobox', { name: 'Target' }).closest('.equalizer-profile__target-row')
    expect(frRow).toBeInTheDocument()
    expect(targetRow).toBeInTheDocument()
    expect(frRow).not.toBe(targetRow)
    expect(targetRow).toContainElement(within(profile).getByRole('button', { name: 'Auto EQ' }))
  })

  it('expands compact settings with accessible values and commits valid full updates', async () => {
    const user = userEvent.setup()
    render(<EqualizerTab />)

    expect(screen.getByRole('heading', { name: 'Parametric Equalizer' })).toBeVisible()
    const toggle = screen.getByRole('button', { name: 'AutoEQ settings' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'autoeq-settings')
    expect(screen.queryByRole('region', { name: 'AutoEQ Settings' })).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const settings = screen.getByRole('region', { name: 'AutoEQ Settings' })
    expect(settings).toHaveAttribute('id', 'autoeq-settings')
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ minimum frequency Hz' })).toHaveValue(20)
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ maximum frequency Hz' })).toHaveValue(20_000)
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ minimum gain dB' })).toHaveValue(-15)
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ maximum gain dB' })).toHaveValue(15)
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ minimum Q' })).toHaveValue(0.1)
    expect(within(settings).getByRole('spinbutton', { name: 'AutoEQ maximum Q' })).toHaveValue(12)
    expect(within(settings).getAllByText('Hz')).toHaveLength(2)
    expect(within(settings).getAllByText('dB')).toHaveLength(2)

    const minimumFrequency = within(settings).getByRole('spinbutton', { name: 'AutoEQ minimum frequency Hz' })
    await user.clear(minimumFrequency)
    await user.type(minimumFrequency, '30')
    fireEvent.blur(minimumFrequency)
    expect(workspaceStore.getState().autoeqSettings.minFrequencyHz).toBe(30)

    await user.click(toggle)
    expect(screen.queryByRole('region', { name: 'AutoEQ Settings' })).not.toBeInTheDocument()
  })

  it('keeps invalid cross-bound setting edits local', async () => {
    const user = userEvent.setup()
    render(<EqualizerTab />)
    await user.click(screen.getByRole('button', { name: 'AutoEQ settings' }))
    const minimumFrequency = screen.getByRole('spinbutton', { name: 'AutoEQ minimum frequency Hz' })

    await user.clear(minimumFrequency)
    await user.type(minimumFrequency, '20000')
    fireEvent.blur(minimumFrequency)
    expect(minimumFrequency).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().autoeqSettings).toEqual(DEFAULT_AUTOEQ_SETTINGS)
  })

  it('commits validator-valid gain and Q ranges beyond defaults without native contradictions', async () => {
    const user = userEvent.setup()
    render(<EqualizerTab />)
    await user.click(screen.getByRole('button', { name: 'AutoEQ settings' }))
    const minimumGain = screen.getByRole('spinbutton', { name: 'AutoEQ minimum gain dB' })
    const maximumGain = screen.getByRole('spinbutton', { name: 'AutoEQ maximum gain dB' })
    const maximumQ = screen.getByRole('spinbutton', { name: 'AutoEQ maximum Q' })

    expect(minimumGain).not.toHaveAttribute('min')
    expect(minimumGain).not.toHaveAttribute('max')
    expect(maximumQ).not.toHaveAttribute('min')
    expect(maximumQ).not.toHaveAttribute('max')
    for (const [input, value] of [[minimumGain, '-20'], [maximumGain, '25'], [maximumQ, '20']] as const) {
      await user.clear(input)
      await user.type(input, value)
      fireEvent.blur(input)
      expect(input).toBeValid()
    }
    expect(workspaceStore.getState().autoeqSettings).toMatchObject({
      minGainDb: -20, maxGainDb: 25, maxQ: 20,
    })

    await user.clear(minimumGain)
    await user.type(minimumGain, '30')
    fireEvent.blur(minimumGain)
    expect(minimumGain).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().autoeqSettings.minGainDb).toBe(-20)
  })
})
