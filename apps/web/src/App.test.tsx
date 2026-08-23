import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { uiStore } from './state/uiStore'

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: () => <section aria-label="Frequency Response graph" />,
}))

describe('App', () => {
  beforeEach(() => uiStore.setState({ activeDockTab: 'curves' }))

  it('renders the workbench title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
  })

  it('assembles the graph before the shared workbench dock', async () => {
    const user = userEvent.setup()
    render(<App />)

    const graph = screen.getByLabelText('Frequency Response graph')
    const graphActions = screen.getByRole('toolbar', { name: 'Graph actions' })
    const dock = screen.getByRole('region', { name: 'Workbench dock' })

    expect(graphActions.compareDocumentPosition(graph)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(graph.compareDocumentPosition(dock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByRole('button', { name: 'Reset View' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Curves' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
    expect(screen.getByRole('heading', { name: 'Filter Editor' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add PK' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.getByRole('heading', { name: 'Metrics' })).toBeVisible()
    expect(screen.getByText(/import source and target/i)).toBeInTheDocument()
  })
})
