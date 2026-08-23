import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seriesAppearance } from './features/graph/graphAppearance'
import type { WorkspaceDerived } from './state/workspaceStore'

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: ({ derived }: { derived: WorkspaceDerived }) => (
    <output aria-label="Graph response">
      PEQ {Math.max(...(derived.peq?.db ?? [0])).toFixed(2)}; Source + EQ{' '}
      {Math.max(...(derived.sourceEq?.db ?? [0])).toFixed(2)}
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
      sourceColor: MEASUREMENT_CURVE_PALETTE[0],
      targetColor: MEASUREMENT_CURVE_PALETTE[1],
      sourceVisible: true,
      targetVisible: true,
      targetPresentation: 'measurement',
    })
    initializeTheme()
    workspaceStore.setState({
      source: null,
      target: null,
      sourceNormalization: { ...defaultNormalization },
      targetNormalization: { ...defaultNormalization },
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

    const initialSourceColor = uiStore.getState().sourceColor
    const sourceFile = new File([curveText], 'Synthetic Source.txt', { type: 'text/plain' })
    const targetFile = new File([curveText], 'Synthetic Target.csv', { type: 'text/csv' })
    Object.defineProperty(sourceFile, 'text', { value: async () => curveText })
    Object.defineProperty(targetFile, 'text', { value: async () => curveText })
    fireEvent.change(screen.getByLabelText('Import Source curve'), {
      target: { files: [sourceFile] },
    })
    await waitFor(() => expect(screen.getByText('Synthetic Source.txt')).toBeInTheDocument())
    const importedSourceColor = uiStore.getState().sourceColor
    expect(importedSourceColor).not.toBe(initialSourceColor)
    expect(MEASUREMENT_CURVE_PALETTE).toContain(importedSourceColor)
    expect(
      seriesAppearance('Source', {
        ...uiStore.getState(),
      }),
    ).toMatchObject({ color: importedSourceColor, lineType: 'solid' })

    await user.click(screen.getByRole('radio', { name: 'Reference target' }))
    expect(uiStore.getState().targetPresentation).toBe('reference')
    fireEvent.change(screen.getByLabelText('Import Target curve'), {
      target: { files: [targetFile] },
    })
    await waitFor(() => {
      expect(screen.getByText('Synthetic Source.txt')).toBeInTheDocument()
      expect(screen.getByText('Synthetic Target.csv')).toBeInTheDocument()
    })
    expect(
      seriesAppearance('Target', {
        ...uiStore.getState(),
      }),
    ).toMatchObject({ color: '#989894', lineType: 'dashed' })
    await user.click(screen.getByRole('button', { name: 'Normalize Together' }))
    expect(workspaceStore.getState().sourceNormalization).toEqual({ anchorHz: 500, targetDb: 0 })
    expect(workspaceStore.getState().targetNormalization).toEqual({ anchorHz: 500, targetDb: 0 })

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('button', { name: 'Add PK' }))
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })
    await user.clear(gain)
    await user.type(gain, '3')
    fireEvent.blur(gain)

    expect(screen.getByLabelText('Graph response')).toHaveTextContent('PEQ 3.00; Source + EQ 3.00')
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
    expect(
      seriesAppearance('Target', {
        ...uiStore.getState(),
      }),
    ).toMatchObject({ color: '#8f8e8a', lineType: 'dashed' })
  })

  it('shows preamp in Details even before Target is loaded', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    await user.click(screen.getByRole('button', { name: 'Add PK' }))
    const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })
    await user.clear(gain)
    await user.type(gain, '6')
    fireEvent.blur(gain)

    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByText('Preamp').nextElementSibling).toHaveTextContent('-6')
    expect(screen.getByText('MAE').nextElementSibling).toHaveTextContent('--')
    expect(screen.getByText('RMSE').nextElementSibling).toHaveTextContent('--')
    expect(screen.getByText(/comparison metrics require source and target/i)).toBeVisible()
  })
})
