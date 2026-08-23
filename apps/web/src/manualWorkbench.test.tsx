import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { uiStore } from './state/uiStore'
import { defaultNormalization, workspaceStore } from './state/workspaceStore'

const curveText = '20 0\n500 0\n1000 0\n20000 0'

describe('manual workbench integration', () => {
  beforeEach(() => {
    uiStore.setState({ activeDockTab: 'curves' })
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

  it('recomputes response and preamp, excludes a disabled filter, and undoes the toggle', async () => {
    const user = userEvent.setup()
    render(<App />)

    const sourceFile = new File([curveText], 'Synthetic Source.txt', { type: 'text/plain' })
    const targetFile = new File([curveText], 'Synthetic Target.csv', { type: 'text/csv' })
    Object.defineProperty(sourceFile, 'text', { value: async () => curveText })
    Object.defineProperty(targetFile, 'text', { value: async () => curveText })
    fireEvent.change(screen.getByLabelText('Import Source curve'), {
      target: { files: [sourceFile] },
    })
    fireEvent.change(screen.getByLabelText('Import Target curve'), {
      target: { files: [targetFile] },
    })
    await waitFor(() => {
      expect(screen.getByText('Synthetic Source.txt')).toBeInTheDocument()
      expect(screen.getByText('Synthetic Target.csv')).toBeInTheDocument()
    })
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
