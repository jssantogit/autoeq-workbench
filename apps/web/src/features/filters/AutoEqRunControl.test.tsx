import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoEqRunStore } from '../../state/autoeqRunStore'
import { AutoEqRunControl } from './AutoEqRunControl'

vi.mock('../../state/autoeqController', () => ({
  cancelAutoEq: vi.fn(),
  runAutoEq: vi.fn(),
}))

describe('AutoEqRunControl', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    autoEqRunStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows whole-second elapsed time and activity without fake progress', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    autoEqRunStore.getState().start('run-1')
    render(<AutoEqRunControl disabled={false} />)

    now = 65_000
    act(() => vi.advanceTimersByTime(250))

    expect(screen.getByRole('status', { name: 'AutoEQ running' })).toHaveTextContent('01:05')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('shows the normal action without a timer while idle', () => {
    render(<AutoEqRunControl disabled />)

    expect(screen.getByRole('button', { name: 'AutoEQ' })).toBeDisabled()
    expect(screen.queryByRole('status', { name: 'AutoEQ running' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument()
  })
})
