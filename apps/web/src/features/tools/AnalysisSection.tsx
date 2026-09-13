import {
  auditCancellations,
  calculateBandMetrics,
  createEvaluationGrid,
  MVP_NUMERIC_POLICY,
  residualError,
  type MetricBand,
} from '@autoeq-workbench/core'
import { useWorkspaceStore, type WorkspaceDerived } from '../../state/workspaceStore'

const METRIC_BANDS: readonly MetricBand[] = [
  { id: '20-5000', minHz: 20, maxHz: 5_000 },
  { id: '20-8000', minHz: 20, maxHz: 8_000 },
  { id: '20-10000', minHz: 20, maxHz: 10_000 },
  { id: '20-14000', minHz: 20, maxHz: 14_000 },
  { id: '20-20000', minHz: 20, maxHz: 20_000 },
]
const EVALUATION_FREQUENCIES = createEvaluationGrid()

const displayDb = (value: number | undefined) =>
  value === undefined ? '--' : `${value.toFixed(2)} dB`

const displayNumber = (value: number) => String(Number(value.toFixed(2)))

const displayFrequency = (frequencyHz: number | undefined) => {
  if (frequencyHz === undefined) return '--'
  if (frequencyHz >= 1_000) return `${displayNumber(frequencyHz / 1_000)} kHz`
  return `${displayNumber(frequencyHz)} Hz`
}

export function AnalysisSection({ derived }: { derived: WorkspaceDerived }) {
  const filters = useWorkspaceStore((state) => state.filters)
  const solutionState = useWorkspaceStore((state) => state.solutionState)
  const autoEqRun = useWorkspaceStore((state) => state.autoEqRun)
  const cancellationAudit = auditCancellations(
    filters,
    EVALUATION_FREQUENCIES,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const bandMetrics = derived.metrics !== null && derived.target !== null && derived.frEq !== null
    ? calculateBandMetrics(
        residualError(derived.target.db, derived.frEq.db),
        EVALUATION_FREQUENCIES,
        METRIC_BANDS,
      )
    : []
  const moderateCancellations = cancellationAudit.pairs.filter(
    ({ severity }) => severity === 'moderate',
  ).length
  const strongCancellations = cancellationAudit.pairs.filter(
    ({ severity }) => severity === 'strong',
  ).length
  const values = [
    { label: 'MAE', value: displayDb(derived.metrics?.maeDb) },
    { label: 'RMSE', value: displayDb(derived.metrics?.rmseDb) },
    { label: 'Max absolute error', value: displayDb(derived.metrics?.maxAbsDb) },
    {
      label: 'Max-error frequency',
      value: displayFrequency(derived.metrics?.maxAbsFrequencyHz),
    },
    { label: 'Preamp', value: displayDb(derived.preamp?.preampDb) },
    { label: 'Active filters', value: String(filters.filter(({ enabled }) => enabled).length) },
    { label: 'Total filters', value: String(filters.length) },
    { label: 'Solution state', value: solutionState[0]!.toUpperCase() + solutionState.slice(1) },
    { label: 'Origin', value: autoEqRun?.manifest.algorithmVersion ?? '--' },
    { label: 'Moderate cancellations', value: String(moderateCancellations) },
    { label: 'Strong cancellations', value: String(strongCancellations) },
  ]

  return (
    <details className="tools-section tools-section--analysis analysis-section">
      <summary>Analysis</summary>
      <dl className="metric-list">
        {values.map(({ label, value }) => (
          <div className="metric-list__item" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {bandMetrics.length > 0 && (
        <dl className="metric-list" aria-label="Frequency-band metrics">
          {bandMetrics.map((metric) => (
            <div className="metric-list__item" key={metric.id}>
              <dt>{metric.id}</dt>
              <dd>
                MAE {displayDb(metric.maeDb)} / RMSE {displayDb(metric.rmseDb)} / Max{' '}
                {displayDb(metric.maxAbsDb)} @ {displayFrequency(metric.maxAbsFrequencyHz)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {cancellationAudit.pairs.length > 0 && (
        <details className="analysis-section__details">
          <summary>Cancellation details</summary>
          <ul>
            {cancellationAudit.pairs.map((pair) => (
              <li key={`${pair.filterAId}:${pair.filterBId}`}>
                {pair.filterAId} {'<->'} {pair.filterBId}
              </li>
            ))}
          </ul>
        </details>
      )}
    </details>
  )
}
