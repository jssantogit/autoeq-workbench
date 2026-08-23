import type { Curve } from '@autoeq-workbench/core'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { uiStore } from './state/uiStore'
import { workspaceStore } from './state/workspaceStore'

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: () => <section aria-label="Frequency Response graph" />,
}))

describe('App', () => {
  beforeEach(() => {
    uiStore.setState({ activeDockTab: 'curves', curveAppearance: {} })
    workspaceStore.setState({ curves: [] })
  })

  it('renders the workbench title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
  })

  it('assembles the graph before the shared workbench dock', async () => {
    const user = userEvent.setup()
    render(<App />)

    const graph = screen.getByLabelText('Frequency Response graph')
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    const dock = screen.getByRole('region', { name: 'Workbench dock' })

    expect(utilityRail.compareDocumentPosition(graph)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(graph.compareDocumentPosition(dock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByRole('button', { name: 'Reset View' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('+ Curve')).toHaveLength(1)
    expect(utilityRail).toHaveClass('utility-rail', 'utility-rail--nowrap')
    expect(within(utilityRail).getByText('Normalize: 500 Hz / 0 dB')).toBeVisible()
    expect(utilityRail).toHaveTextContent('Source: None')
    expect(utilityRail).toHaveTextContent('Target: None')
    expect(screen.getByRole('heading', { name: 'Curves' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    expect(screen.getByRole('region', { name: 'Equalizer workspace' })).toBeVisible()
    const profile = screen.getByRole('group', { name: 'Equalizer profile' })
    expect(profile).toBeVisible()
    expect(within(profile).getByText('Manual')).toBeVisible()
    expect(within(profile).getByText('48 kHz')).toBeVisible()
    expect(within(profile).getByText('20 Hz-20 kHz')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add PK' })).toBeInTheDocument()
    expect(screen.getByText('0 / 64 filters')).toBeVisible()
    expect(screen.queryByRole('button', { name: /run autoeq/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByRole('heading', { name: 'Metrics' })).toBeVisible()
    expect(screen.getByText(/assign source and target/i)).toBeInTheDocument()
  })

  it('switches to Curves and focuses normalization from the utility rail', async () => {
    const user = userEvent.setup()
    uiStore.setState({ activeDockTab: 'details' })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Normalize: 500 Hz / 0 dB' }))

    expect(uiStore.getState().activeDockTab).toBe('curves')
    expect(screen.getByRole('region', { name: 'Workspace normalization' })).toHaveFocus()
  })

  it('reacts to Source and Target role assignments in the utility rail', () => {
    const curves: Curve[] = ['Measurement A', 'Measurement B'].map((name, index) => ({
      id: `curve-${index}`,
      name,
      role: 'comparison',
      rawPoints: [{ frequencyHz: 20, db: 0 }, { frequencyHz: 20_000, db: 0 }],
      metadata: {},
    }))
    workspaceStore.setState({
      curves: curves.map((curve) => ({ curve, role: null })),
    })
    render(<App />)
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })

    act(() => {
      workspaceStore.getState().setCurveRole('curve-0', 'source')
      workspaceStore.getState().setCurveRole('curve-1', 'target')
    })

    expect(utilityRail).toHaveTextContent('Source: Measurement A')
    expect(utilityRail).toHaveTextContent('Target: Measurement B')
  })

  it('keeps import errors accessibly associated with the utility rail', async () => {
    render(<App />)
    const utilityRail = screen.getByRole('toolbar', { name: 'Workspace utilities' })
    const file = new File([], 'broken.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => 'not curve data' })

    fireEvent.change(within(utilityRail).getByLabelText('+ Curve'), {
      target: { files: [file] },
    })

    expect(await within(utilityRail).findByRole('alert')).toHaveTextContent('[parse]')
  })
})
