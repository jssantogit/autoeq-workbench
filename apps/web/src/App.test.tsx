import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./features/graph/FrequencyResponseGraph', () => ({
  FrequencyResponseGraph: () => <section aria-label="Frequency Response graph" />,
}))

describe('App', () => {
  it('renders the workbench title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
  })

  it('assembles the graph-centered technical workspace in task order', () => {
    render(<App />)

    const graph = screen.getByLabelText('Frequency Response graph')
    const normalization = screen.getByRole('heading', { name: 'Normalization' })
    const curves = screen.getByRole('heading', { name: 'Source / Target' })
    const filters = screen.getByRole('heading', { name: 'Filter Editor' })
    const metrics = screen.getByRole('heading', { name: 'Metrics' })

    expect(graph.compareDocumentPosition(normalization)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(normalization.compareDocumentPosition(curves)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(curves.compareDocumentPosition(filters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(filters.compareDocumentPosition(metrics)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByText(/manual filter controls arrive in task 7/i)).toBeInTheDocument()
    expect(screen.getByText(/import source and target/i)).toBeInTheDocument()
  })
})
