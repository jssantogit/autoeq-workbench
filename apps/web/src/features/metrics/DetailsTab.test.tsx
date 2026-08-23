import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultNormalization,
  deriveWorkspace,
  workspaceStore,
  type WorkspaceDerived,
} from '../../state/workspaceStore'
import { DetailsTab } from './DetailsTab'

function metricValue(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' })
  expect(term.parentElement?.parentElement?.tagName).toBe('DL')
  return term.nextElementSibling as HTMLElement
}

function currentDerived(overrides: Partial<WorkspaceDerived> = {}): WorkspaceDerived {
  return { ...deriveWorkspace(workspaceStore.getState()), ...overrides }
}

describe('DetailsTab', () => {
  beforeEach(() => {
    workspaceStore.setState({
      curves: [],
      normalization: { ...defaultNormalization },
      filters: [],
      selectedFilterId: null,
      solutionState: 'clean',
      filterProvenance: null,
      canUndo: false,
      canRedo: false,
    })
  })

  it('presents comparison metrics, preamp, and workspace data as semantic values', () => {
    workspaceStore.setState({
      filters: [
        { id: 'active', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 4, q: 1 },
        { id: 'disabled', enabled: false, type: 'HS', frequencyHz: 8_000, gainDb: 2, q: 0.7 },
      ],
      solutionState: 'stale',
      filterProvenance: 'autoeq',
    })
    const derived = currentDerived({
      status: 'ready',
      message: 'Source and Target ready.',
      metrics: {
        maeDb: 1.234,
        rmseDb: 2.345,
        maxAbsDb: 3.456,
        maxAbsFrequencyHz: 1_234.5,
      },
      preamp: { preampDb: -4, maxBoostDb: 4, maxBoostFrequencyHz: 1_000 },
    })

    render(<DetailsTab derived={derived} />)

    expect(metricValue('MAE')).toHaveTextContent('1.23 dB')
    expect(metricValue('RMSE')).toHaveTextContent('2.35 dB')
    expect(metricValue('Max absolute error')).toHaveTextContent('3.46 dB')
    expect(metricValue('Max-error frequency')).toHaveTextContent('1.23 kHz')
    expect(metricValue('Preamp')).toHaveTextContent('-4.00 dB')
    expect(metricValue('Active filters')).toHaveTextContent('1')
    expect(metricValue('Total filters')).toHaveTextContent('2')
    expect(metricValue('Solution state')).toHaveTextContent('Stale')
    expect(metricValue('Provenance')).toHaveTextContent('AutoEQ')
  })

  it('keeps derivable zero preamp and user-edited state legible without comparison curves', () => {
    render(<DetailsTab derived={currentDerived()} />)

    expect(metricValue('MAE')).toHaveTextContent('--')
    expect(metricValue('RMSE')).toHaveTextContent('--')
    expect(metricValue('Max absolute error')).toHaveTextContent('--')
    expect(metricValue('Max-error frequency')).toHaveTextContent('--')
    expect(metricValue('Preamp')).toHaveTextContent('0.00 dB')
    expect(metricValue('Active filters')).toHaveTextContent('0')
    expect(metricValue('Solution state')).toHaveTextContent('Clean')
    expect(metricValue('Provenance')).toHaveTextContent('User edited')
    expect(screen.getByText(/comparison metrics require source and target/i)).toBeVisible()
    expect(screen.queryByText(/peq.*unavailable/i)).not.toBeInTheDocument()
  })

  it('omits redundant headings and internal evaluation policy metadata', () => {
    render(<DetailsTab derived={currentDerived()} />)

    expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation policy')).not.toBeInTheDocument()
    expect(screen.queryByText('Sample rate')).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation range')).not.toBeInTheDocument()
    expect(screen.queryByText('Evaluation density')).not.toBeInTheDocument()
    expect(screen.queryByText('48 kHz')).not.toBeInTheDocument()
  })
})
