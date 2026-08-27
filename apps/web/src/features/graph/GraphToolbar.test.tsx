import { DEFAULT_AUTOEQ_SETTINGS } from '@autoeq-workbench/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../../state/uiStore'
import { workspaceStore } from '../../state/workspaceStore'
import { GraphToolbar } from './GraphToolbar'

vi.mock('./graphScreenshot', () => ({
  exportFrequencyResponseGraph: vi.fn().mockResolvedValue({
    ok: true,
    message: 'Graph screenshot downloaded.',
  }),
}))

describe('GraphToolbar', () => {
  beforeEach(() => {
    localStorage.clear()
    uiStore.setState({
      theme: 'light',
      graphZoomPreset: 'full',
      smoothingLevel: 5,
      inspectorEnabled: true,
      labelsEnabled: true,
      curveAppearance: {},
    })
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    })
  })

  it('exposes the source-derived graph controls in one horizontal flow and toggles zoom presets', async () => {
    const user = userEvent.setup()
    render(<GraphToolbar />)

    const toolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
    const themeToggle = within(toolbar).getByRole('button', { name: 'Switch to dark theme' })
    expect(toolbar.firstElementChild).toBe(themeToggle)
    expect(within(toolbar).getByRole('button', { name: 'Bass' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Mids' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Treble' })).toBeInTheDocument()
    expect(within(toolbar).getByLabelText('Normalize dB')).toBeInTheDocument()
    expect(within(toolbar).getByLabelText('Normalize Hz')).toBeInTheDocument()
    const normalize = within(toolbar).getByRole('group', { name: 'Normalize' })
    const fields = normalize.querySelectorAll('.number-field__control')
    expect([...fields].map((field) => [...field.children].map((child) => child.textContent || child.tagName))).toEqual([
      ['dB', 'INPUT'],
      ['Hz', 'INPUT'],
    ])
    expect(within(toolbar).getByLabelText('Smooth')).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: /inspect/i })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: /label/i })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: /screenshot/i })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: /recolor/i })).toBeInTheDocument()

    await user.click(within(toolbar).getByRole('button', { name: 'Bass' }))
    expect(uiStore.getState().graphZoomPreset).toBe('bass')
    await user.click(within(toolbar).getByRole('button', { name: 'Bass' }))
    expect(uiStore.getState().graphZoomPreset).toBe('full')
  })

  it('commits bounded normalization and smoothing values', () => {
    render(<GraphToolbar />)
    const db = screen.getByLabelText('Normalize dB')
    const hz = screen.getByLabelText('Normalize Hz')
    fireEvent.change(db, { target: { value: '61.5' } })
    fireEvent.blur(db)
    fireEvent.change(hz, { target: { value: '800' } })
    fireEvent.blur(hz)
    expect(workspaceStore.getState().normalization).toEqual({ mode: 'hz', frequencyHz: 800, levelDb: 61.5 })

    fireEvent.change(hz, { target: { value: '25000' } })
    fireEvent.blur(hz)
    expect(workspaceStore.getState().normalization.frequencyHz).toBe(800)
    expect(hz).toHaveAttribute('aria-invalid', 'true')

    const smoothing = screen.getByLabelText('Smooth')
    fireEvent.change(smoothing, { target: { value: '12' } })
    fireEvent.blur(smoothing)
    expect(uiStore.getState().smoothingLevel).toBe(12)
  })

  it('recolors only visible FR measurements with semantic palette colors', async () => {
    const user = userEvent.setup()
    workspaceStore.setState({ curves: [
      { id: 'fr', name: 'FR', kind: 'fr', rawPoints: [], metadata: {} },
      { id: 'hidden', name: 'Hidden FR', kind: 'fr', rawPoints: [], metadata: {} },
      { id: 'restored', name: 'Restored FR', kind: 'fr', rawPoints: [], metadata: {} },
      { id: 'target', name: 'Target', kind: 'target', rawPoints: [], metadata: {} },
    ] })
    uiStore.setState({ curveAppearance: {
      fr: { color: '#1565c0', visible: true, offsetDb: 0 },
      hidden: { color: '#c62828', visible: false, offsetDb: 0 },
      target: { color: '#2e7d32', visible: true, offsetDb: 0 },
    } })
    render(<GraphToolbar />)

    await user.click(screen.getByRole('button', { name: 'Recolor' }))

    expect(uiStore.getState().curveAppearance.fr?.color).not.toBe('#1565c0')
    expect(uiStore.getState().curveAppearance.fr?.color.toLowerCase()).not.toBe('#ffa03a')
    expect(uiStore.getState().curveAppearance.hidden?.color).toBe('#c62828')
    expect(uiStore.getState().curveAppearance.restored?.color).toBeDefined()
    expect(uiStore.getState().curveAppearance.restored?.color).not.toBe('#1565c0')
    expect(uiStore.getState().curveAppearance.target?.color).toBe('#2e7d32')
  })
})
