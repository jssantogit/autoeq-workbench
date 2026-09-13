import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAutoEqResult } from '../../test/autoEqFixture'
import {
  createWorkspaceStore,
  deriveWorkspace,
  workspaceStore,
  type WorkspaceDerived,
} from '../../state/workspaceStore'
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
  beforeEach(() => {
    localStorage.clear()
    workspaceStore.setState({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      filters: [],
      selectedFilterId: null,
      solutionState: 'clean',
      filterProvenance: null,
      autoEqRun: null,
    })
  })

  it('is an accessible disclosure collapsed by default', () => {
    render(<AnalysisSection derived={derivedWithMetrics()} />)

    const details = screen.getByText('Analysis').closest('details')
    expect(details).toBeInTheDocument()
    expect(details).not.toHaveAttribute('open')
  })

  it('displays current workspace metrics and compact diagnostics', () => {
    render(<AnalysisSection derived={derivedWithMetrics()} />)

    expect(metricValue('MAE')).toHaveTextContent('1.23 dB')
    expect(metricValue('RMSE')).toHaveTextContent('2.35 dB')
    expect(metricValue('Max absolute error')).toHaveTextContent('3.46 dB')
    expect(metricValue('Max-error frequency')).toHaveTextContent('1.23 kHz')
    expect(metricValue('Preamp')).toHaveTextContent('-4.00 dB')
    expect(metricValue('Active filters')).toHaveTextContent('0')
    expect(metricValue('Total filters')).toHaveTextContent('0')
    expect(metricValue('Solution state')).toHaveTextContent('Clean')
    expect(metricValue('Origin')).toHaveTextContent('--')
    expect(metricValue('Moderate cancellations')).toHaveTextContent('0')
    expect(metricValue('Strong cancellations')).toHaveTextContent('0')
    expect(screen.queryByText('Evaluation metadata')).not.toBeInTheDocument()
  })

  it('keeps origin provenance while current filter edits change live metrics', () => {
    const result = createAutoEqResult(3)
    const curves = [
      {
        id: 'source',
        name: 'Source',
        kind: 'fr' as const,
        rawPoints: [
          { frequencyHz: 20, db: 0 },
          { frequencyHz: 1000, db: 0 },
          { frequencyHz: 20_000, db: 0 },
        ],
        metadata: {},
      },
      {
        id: 'target',
        name: 'Target',
        kind: 'target' as const,
        rawPoints: [
          { frequencyHz: 20, db: 0 },
          { frequencyHz: 1000, db: 0 },
          { frequencyHz: 20_000, db: 0 },
        ],
        metadata: {},
      },
    ]
    workspaceStore.setState({
      curves,
      activeFrId: 'source',
      activeTargetId: 'target',
      filters: result.filters,
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: result.manifest },
    })

    const view = render(<AnalysisSection derived={deriveWorkspace(workspaceStore.getState())} />)
    const cleanMae = metricValue('MAE')?.textContent
    expect(metricValue('Origin')).toHaveTextContent('standard-v1')
    expect(metricValue('Solution state')).toHaveTextContent('Clean')
    expect(metricValue('20-5000')).toHaveTextContent(/MAE .* RMSE .* Max/)
    expect(metricValue('20-20000')).toHaveTextContent(/MAE .* RMSE .* Max/)

    act(() => workspaceStore.getState().updateFilter('autoeq-1', { gainDb: 6 }))
    view.rerender(<AnalysisSection derived={deriveWorkspace(workspaceStore.getState())} />)

    expect(metricValue('MAE')).not.toHaveTextContent(cleanMae ?? '')
    expect(metricValue('Origin')).toHaveTextContent('standard-v1')
    expect(metricValue('Solution state')).toHaveTextContent('Modified')

    const liveMae = metricValue('MAE')?.textContent
    act(() => workspaceStore.setState({ solutionState: 'stale' }))
    view.rerender(<AnalysisSection derived={deriveWorkspace(workspaceStore.getState())} />)

    expect(metricValue('MAE')).toHaveTextContent(liveMae ?? '')
    expect(metricValue('Solution state')).toHaveTextContent('Stale')
  })

  it('audits cancellation pairs from current enabled filters', () => {
    workspaceStore.setState({
      filters: [
        { id: 'boost', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 12, q: 1 },
        { id: 'cut', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: -12, q: 1 },
      ],
    })

    render(<AnalysisSection derived={derivedWithMetrics()} />)

    expect(metricValue('Moderate cancellations')).toHaveTextContent('0')
    expect(metricValue('Strong cancellations')).toHaveTextContent('1')
    expect(metricValue('Active filters')).toHaveTextContent('2')
    expect(metricValue('Total filters')).toHaveTextContent('2')
    expect(screen.getByText('boost <-> cut')).toBeInTheDocument()
  })
})
