import { DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  runAutoEq,
  runAutoEqExperimentalMax10,
} from '../../state/autoeqController'
import { autoEqRunStore } from '../../state/autoeqRunStore'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { AutoEqRunControl } from './AutoEqRunControl'

vi.mock('../../state/autoeqController', () => ({
  cancelAutoEq: vi.fn(),
  runAutoEq: vi.fn(),
  runAutoEqExperimentalMax10: vi.fn(),
}))

describe('AutoEqRunControl', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    autoEqRunStore.getState().reset()
    uiStore.setState({ experimentalMax10Enabled: false })
    workspaceStore.setState({ autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS } })
    vi.mocked(runAutoEq).mockClear()
    vi.mocked(runAutoEqExperimentalMax10).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('routes the idle action to Standard AutoEQ by default', () => {
    render(<AutoEqRunControl disabled={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'AutoEQ' }))

    expect(runAutoEq).toHaveBeenCalledTimes(1)
    expect(runAutoEqExperimentalMax10).not.toHaveBeenCalled()
  })

  it('routes the idle action to Experimental Max10 only when explicitly enabled and eligible', () => {
    uiStore.setState({ experimentalMax10Enabled: true })
    render(<AutoEqRunControl disabled={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'AutoEQ Experimental' }))

    expect(runAutoEqExperimentalMax10).toHaveBeenCalledTimes(1)
    expect(runAutoEq).not.toHaveBeenCalled()
  })

  it('falls back to Standard AutoEQ if a stale experimental UI flag is no longer eligible', () => {
    uiStore.setState({ experimentalMax10Enabled: true })
    workspaceStore.setState({
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 12 },
    })
    render(<AutoEqRunControl disabled={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'AutoEQ' }))

    expect(runAutoEq).toHaveBeenCalledTimes(1)
    expect(runAutoEqExperimentalMax10).not.toHaveBeenCalled()
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
