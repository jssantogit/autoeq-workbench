import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seriesAppearance } from './features/graph/graphAppearance'
import type { WorkspaceDerived } from './state/workspaceStore'

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: ({ derived }: { derived: WorkspaceDerived }) => (
    <output aria-label="Graph response">
      PEQ {Math.max(...(derived.peq?.db ?? [0])).toFixed(2)}; FR + EQ{' '}
      {Math.max(...(derived.frEq?.db ?? [0])).toFixed(2)}
    </output>
  ),
}))

import App from './App'
import { initializeTheme, MEASUREMENT_CURVE_PALETTE, uiStore } from './state/uiStore'
import { defaultNormalization, deriveWorkspace, workspaceStore } from './state/workspaceStore'

const curveText = '20 0\n500 0\n1000 0\n20000 0'

describe('manual workbench integration', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    uiStore.setState({
      theme: 'light',
      activeDockTab: 'curves',
      curveAppearance: {},
    })
    initializeTheme()
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: { ...defaultNormalization },
      filters: [],
      selectedFilterId: null,
      solutionState: 'clean',
      filterProvenance: null,
      canUndo: false,
      canRedo: false,
    })
  })

  it('preserves the complete manual workbench flow across presentation and theme changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toHaveTextContent('Light')

    const sourceFile = new File([curveText], 'Synthetic Source.txt', { type: 'text/plain' })
    const targetFile = new File([curveText], 'Synthetic Target.csv', { type: 'text/csv' })
    Object.defineProperty(sourceFile, 'text', { value: async () => curveText })
    Object.defineProperty(targetFile, 'text', { value: async () => curveText })
    fireEvent.change(screen.getByLabelText('+ FR'), {
      target: { files: [sourceFile] },
    })
    const curveManager = screen.getByRole('region', { name: 'Curves workspace' })
    await waitFor(() => expect(within(curveManager).getByText('Synthetic Source.txt')).toBeInTheDocument())
    const frId = workspaceStore.getState().curves[0]!.id
    const importedFrColor = uiStore.getState().curveAppearance[frId]!.color
    expect(MEASUREMENT_CURVE_PALETTE).toContain(importedFrColor)
    expect(
      seriesAppearance('FR', {
        theme: uiStore.getState().theme,
        curveAppearance: uiStore.getState().curveAppearance,
        frCurveId: frId,
      }, { curveId: frId, measurementKind: 'fr', active: true }),
    ).toMatchObject({ color: importedFrColor, lineType: 'solid' })

    fireEvent.change(screen.getByLabelText('+ Target'), {
      target: { files: [targetFile] },
    })
    await waitFor(() => {
      expect(within(curveManager).getByText('Synthetic Source.txt')).toBeInTheDocument()
      expect(within(curveManager).getByText('Synthetic Target.csv')).toBeInTheDocument()
    })
    const targetDb = screen.getByLabelText('Target dB')
    await user.clear(targetDb)
    await user.type(targetDb, '1')
    fireEvent.blur(targetDb)
    expect(workspaceStore.getState().normalization).toEqual({ anchorHz: 500, targetDb: 1 })
    await user.clear(targetDb)
    await user.type(targetDb, '0')
    fireEvent.blur(targetDb)
    expect(workspaceStore.getState().normalization).toEqual({ anchorHz: 500, targetDb: 0 })

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })
    await user.clear(gain)
    await user.type(gain, '3')
    fireEvent.blur(gain)

    expect(screen.getByLabelText('Graph response')).toHaveTextContent('PEQ 3.00; FR + EQ 3.00')
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByText('-3.00 dB')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('checkbox', { name: 'Enable filter 1' }))
    expect(screen.getByLabelText('Graph response')).toHaveTextContent('PEQ 0.00')
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByText('Preamp').nextElementSibling).toHaveTextContent('0.00 dB')

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('checkbox', { name: 'Enable filter 1' })).toBeChecked()
    expect(screen.getByLabelText('Graph response')).toHaveTextContent('PEQ 3.00')

    await user.click(screen.getByRole('tab', { name: 'Details' }))
    const metrics = deriveWorkspace(workspaceStore.getState()).metrics
    expect(metrics).not.toBeNull()
    expect(screen.getByText('MAE').nextElementSibling).toHaveTextContent(
      `${metrics!.maeDb.toFixed(2)} dB`,
    )
    expect(screen.getByText('RMSE').nextElementSibling).toHaveTextContent(
      `${metrics!.rmseDb.toFixed(2)} dB`,
    )
    expect(screen.getByText('Preamp').nextElementSibling).toHaveTextContent('-3.00 dB')

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('autoeq-workbench.theme')).toBe('dark')
  }, 10_000)

  it('shows preamp in Details even before Target is loaded', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })
    await user.clear(gain)
    await user.type(gain, '6')
    fireEvent.blur(gain)

    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByText('Preamp').nextElementSibling).toHaveTextContent('-6')
    expect(screen.getByText('MAE').nextElementSibling).toHaveTextContent('--')
    expect(screen.getByText('RMSE').nextElementSibling).toHaveTextContent('--')
    expect(screen.getByText(/metrics require an active FR and Target/i)).toBeVisible()
  })
})
