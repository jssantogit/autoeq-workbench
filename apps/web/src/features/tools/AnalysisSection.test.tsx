import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace, type WorkspaceDerived } from '../../state/workspaceStore'
import { AnalysisSection } from './AnalysisSection'

function derivedWithMetrics(): WorkspaceDerived {
  return {
    ...deriveWorkspace(createWorkspaceStore().getState()),
    metrics: {
      maeDb: 1.234,
      rmseDb: 2.345,
      maxAbsDb: 3.456,
      maxAbsFrequencyHz: 1_234.5,
    },
    preamp: { preampDb: -4, maxBoostDb: 4, maxBoostFrequencyHz: 1_000 },
  }
}

function metricValue(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling
}

describe('AnalysisSection', () => {
  it('is an accessible disclosure collapsed by default', () => {
    render(<AnalysisSection derived={derivedWithMetrics()} />)

    const details = screen.getByText('Analysis').closest('details')
    expect(details).toBeInTheDocument()
    expect(details).not.toHaveAttribute('open')
  })

  it('displays only the approved values supplied by WorkspaceDerived', () => {
    render(<AnalysisSection derived={derivedWithMetrics()} />)

    expect(metricValue('MAE')).toHaveTextContent('1.23 dB')
    expect(metricValue('RMSE')).toHaveTextContent('2.35 dB')
    expect(metricValue('Max absolute error')).toHaveTextContent('3.46 dB')
    expect(metricValue('Max-error frequency')).toHaveTextContent('1.23 kHz')
    expect(metricValue('Preamp')).toHaveTextContent('-4.00 dB')
    expect(screen.queryByText('Active filters')).not.toBeInTheDocument()
    expect(screen.queryByText('Total filters')).not.toBeInTheDocument()
    expect(screen.queryByText('Solution state')).not.toBeInTheDocument()
    expect(screen.queryByText('Provenance')).not.toBeInTheDocument()
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation metadata')).not.toBeInTheDocument()
  })
})
