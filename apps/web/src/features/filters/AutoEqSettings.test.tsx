import {
  AUTOEQ_PRODUCT_LIMITS,
  DEFAULT_AUTOEQ_SETTINGS,
} from '@autoeq-workbench/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceStore } from '../../state/workspaceStore'
import { AutoEqSettings } from './AutoEqSettings'

describe('AutoEqSettings', () => {
  beforeEach(() => {
    workspaceStore.setState({ autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS } })
  })

  it('edits the existing seven validated AutoEqSettings fields', async () => {
    const user = userEvent.setup()
    render(<AutoEqSettings />)

    expect(screen.getAllByRole('spinbutton')).toHaveLength(7)
    expect(screen.getAllByRole('columnheader').map(({ textContent }) => textContent)).toEqual(['Min', 'Max'])
    const minimumFrequency = screen.getByRole('spinbutton', { name: 'AutoEQ minimum frequency Hz' })
    const maximumGain = screen.getByRole('spinbutton', { name: 'AutoEQ maximum gain dB' })
    const maximumQ = screen.getByRole('spinbutton', { name: 'AutoEQ maximum Q' })
    const maxFilters = screen.getByRole('spinbutton', { name: 'AutoEQ max filters' })

    for (const [input, value] of [
      [minimumFrequency, '30'],
      [maximumGain, '12'],
      [maximumQ, '10'],
      [maxFilters, '12'],
    ] as const) {
      await user.clear(input)
      await user.type(input, value)
      fireEvent.blur(input)
    }

    expect(workspaceStore.getState().autoeqSettings).toEqual({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 30,
      maxGainDb: 12,
      maxQ: 10,
      maxFilters: 12,
    })
  })

  it('uses product bounds and leaves invalid cross-bound edits uncommitted', async () => {
    const user = userEvent.setup()
    render(<AutoEqSettings />)

    const minimumFrequency = screen.getByRole('spinbutton', { name: 'AutoEQ minimum frequency Hz' })
    const minimumGain = screen.getByRole('spinbutton', { name: 'AutoEQ minimum gain dB' })
    const maximumGain = screen.getByRole('spinbutton', { name: 'AutoEQ maximum gain dB' })
    const minimumQ = screen.getByRole('spinbutton', { name: 'AutoEQ minimum Q' })
    const maximumQ = screen.getByRole('spinbutton', { name: 'AutoEQ maximum Q' })
    const maxFilters = screen.getByRole('spinbutton', { name: 'AutoEQ max filters' })

    expect(minimumGain).toHaveAttribute('min', String(AUTOEQ_PRODUCT_LIMITS.minGainDb))
    expect(maximumGain).toHaveAttribute('max', String(AUTOEQ_PRODUCT_LIMITS.maxGainDb))
    expect(minimumQ).toHaveAttribute('min', String(AUTOEQ_PRODUCT_LIMITS.minQ))
    expect(maximumQ).toHaveAttribute('max', String(AUTOEQ_PRODUCT_LIMITS.maxQ))
    expect(maxFilters).toHaveAttribute('min', '0')
    expect(maxFilters).toHaveAttribute('max', String(AUTOEQ_PRODUCT_LIMITS.hardMaxFilters))
    expect(maxFilters).toHaveAttribute('step', '1')

    await user.clear(minimumFrequency)
    await user.type(minimumFrequency, String(DEFAULT_AUTOEQ_SETTINGS.maxFrequencyHz))
    fireEvent.blur(minimumFrequency)
    expect(minimumFrequency).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().autoeqSettings).toEqual(DEFAULT_AUTOEQ_SETTINGS)
  })
})
