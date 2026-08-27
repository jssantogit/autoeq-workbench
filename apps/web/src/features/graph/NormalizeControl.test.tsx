import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceStore } from '../../state/workspaceStore'
import { NormalizeControl } from './NormalizeControl'

describe('NormalizeControl', () => {
  beforeEach(() => {
    localStorage.clear()
    workspaceStore.setState({
      normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    })
  })

  it('renders dB and Hz unit controls as accessible buttons with aria-pressed reflecting active mode', () => {
    render(<NormalizeControl />)

    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })
    const dbInput = within(group).getByLabelText('Normalize dB')
    const hzInput = within(group).getByLabelText('Normalize Hz')

    expect(dbButton).toHaveAttribute('aria-pressed', 'false')
    expect(hzButton).toHaveAttribute('aria-pressed', 'true')
    expect(dbInput).toHaveValue(60)
    expect(hzInput).toHaveValue(500)
  })

  it('clicking dB unit button selects db mode without changing remembered values', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      normalization: { mode: 'hz', frequencyHz: 1000, levelDb: 65 },
    })
    render(<NormalizeControl />)

    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })

    await user.click(dbButton)

    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'db',
      frequencyHz: 1000,
      levelDb: 65,
    })
    expect(dbButton).toHaveAttribute('aria-pressed', 'true')
    expect(hzButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking Hz unit button selects hz mode without changing remembered values', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      normalization: { mode: 'db', frequencyHz: 1200, levelDb: 72 },
    })
    render(<NormalizeControl />)

    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })

    await user.click(hzButton)

    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'hz',
      frequencyHz: 1200,
      levelDb: 72,
    })
    expect(dbButton).toHaveAttribute('aria-pressed', 'false')
    expect(hzButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('editing level selects db mode, validates 0..100, and preserves frequencyHz', async () => {
    const user = userEvent.setup()
    render(<NormalizeControl />)

    const dbInput = screen.getByLabelText('Normalize dB')
    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })

    await user.clear(dbInput)
    await user.type(dbInput, '75.5')
    fireEvent.blur(dbInput)

    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'db',
      frequencyHz: 500,
      levelDb: 75.5,
    })
    expect(dbButton).toHaveAttribute('aria-pressed', 'true')
    expect(hzButton).toHaveAttribute('aria-pressed', 'false')
    expect(dbInput).not.toHaveAttribute('aria-invalid', 'true')

    // Invalid dB > 100
    await user.clear(dbInput)
    await user.type(dbInput, '105')
    fireEvent.blur(dbInput)

    expect(dbInput).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().normalization.levelDb).toBe(75.5)

    // Invalid dB < 0
    await user.clear(dbInput)
    await user.type(dbInput, '-5')
    fireEvent.blur(dbInput)

    expect(dbInput).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().normalization.levelDb).toBe(75.5)
  })

  it('editing frequency selects hz mode, validates 20..20000, and preserves levelDb', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({
      normalization: { mode: 'db', frequencyHz: 500, levelDb: 68 },
    })
    render(<NormalizeControl />)

    const hzInput = screen.getByLabelText('Normalize Hz')
    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })

    await user.clear(hzInput)
    await user.type(hzInput, '1000')
    fireEvent.keyDown(hzInput, { key: 'Enter' })

    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'hz',
      frequencyHz: 1000,
      levelDb: 68,
    })
    expect(dbButton).toHaveAttribute('aria-pressed', 'false')
    expect(hzButton).toHaveAttribute('aria-pressed', 'true')
    expect(hzInput).not.toHaveAttribute('aria-invalid', 'true')

    // Invalid frequency > 20000
    await user.clear(hzInput)
    await user.type(hzInput, '25000')
    fireEvent.blur(hzInput)

    expect(hzInput).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().normalization.frequencyHz).toBe(1000)

    // Invalid frequency < 20
    await user.clear(hzInput)
    await user.type(hzInput, '10')
    fireEvent.blur(hzInput)

    expect(hzInput).toHaveAttribute('aria-invalid', 'true')
    expect(workspaceStore.getState().normalization.frequencyHz).toBe(1000)
  })

  it('values survive switching back and forth', async () => {
    const user = userEvent.setup()
    render(<NormalizeControl />)

    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })
    const dbInput = within(group).getByLabelText('Normalize dB')
    const hzInput = within(group).getByLabelText('Normalize Hz')

    // Edit dB: mode becomes db
    await user.clear(dbInput)
    await user.type(dbInput, '70')
    fireEvent.blur(dbInput)
    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'db',
      frequencyHz: 500,
      levelDb: 70,
    })

    // Edit Hz: mode becomes hz
    await user.clear(hzInput)
    await user.type(hzInput, '800')
    fireEvent.blur(hzInput)
    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'hz',
      frequencyHz: 800,
      levelDb: 70,
    })

    // Click dB: mode becomes db, remembered values 70 and 800 preserved
    await user.click(dbButton)
    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'db',
      frequencyHz: 800,
      levelDb: 70,
    })
    expect(dbInput).toHaveValue(70)
    expect(hzInput).toHaveValue(800)

    // Click Hz: mode becomes hz, remembered values 70 and 800 preserved
    await user.click(hzButton)
    expect(workspaceStore.getState().normalization).toEqual({
      mode: 'hz',
      frequencyHz: 800,
      levelDb: 70,
    })
    expect(dbInput).toHaveValue(70)
    expect(hzInput).toHaveValue(800)
  })

  it('synchronizes with external store updates', () => {
    render(<NormalizeControl />)

    const dbInput = screen.getByLabelText('Normalize dB')
    const hzInput = screen.getByLabelText('Normalize Hz')
    const group = screen.getByRole('group', { name: 'Normalize' })
    const dbButton = within(group).getByRole('button', { name: 'dB' })
    const hzButton = within(group).getByRole('button', { name: 'Hz' })

    act(() => {
      workspaceStore.setState({
        normalization: { mode: 'db', frequencyHz: 2500, levelDb: 80 },
      })
    })

    expect(dbInput).toHaveValue(80)
    expect(hzInput).toHaveValue(2500)
    expect(dbButton).toHaveAttribute('aria-pressed', 'true')
    expect(hzButton).toHaveAttribute('aria-pressed', 'false')
  })
})
