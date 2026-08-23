import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MVP_NUMERIC_POLICY } from '@autoeq-workbench/core'
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
      source: null,
      target: null,
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

  it('keeps derivable zero preamp and manual state legible without comparison curves', () => {
    render(<DetailsTab derived={currentDerived()} />)

    expect(metricValue('MAE')).toHaveTextContent('--')
    expect(metricValue('RMSE')).toHaveTextContent('--')
    expect(metricValue('Max absolute error')).toHaveTextContent('--')
    expect(metricValue('Max-error frequency')).toHaveTextContent('--')
    expect(metricValue('Preamp')).toHaveTextContent('0.00 dB')
    expect(metricValue('Active filters')).toHaveTextContent('0')
    expect(metricValue('Solution state')).toHaveTextContent('Clean')
    expect(metricValue('Provenance')).toHaveTextContent('Manual')
    expect(screen.getByText(/comparison metrics require source and target/i)).toBeVisible()
    expect(screen.queryByText(/peq.*unavailable/i)).not.toBeInTheDocument()
  })

  it('shows the core-owned fixed numeric policy', () => {
    render(<DetailsTab derived={currentDerived()} />)

    expect(MVP_NUMERIC_POLICY).toEqual({
      sampleRateHz: 48_000,
      minFrequencyHz: 20,
      maxFrequencyHz: 20_000,
      evaluationPointsPerOctave: 96,
    })
    expect(metricValue('Sample rate')).toHaveTextContent('48 kHz')
    expect(metricValue('Evaluation range')).toHaveTextContent('20 Hz-20 kHz')
    expect(metricValue('Evaluation density')).toHaveTextContent('96 ppo')
  })
})
