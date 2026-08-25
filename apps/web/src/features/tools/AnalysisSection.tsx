import type { WorkspaceDerived } from '../../state/workspaceStore'

const displayDb = (value: number | undefined) =>
  value === undefined ? '--' : `${value.toFixed(2)} dB`

const displayNumber = (value: number) => String(Number(value.toFixed(2)))

const displayFrequency = (frequencyHz: number | undefined) => {
  if (frequencyHz === undefined) return '--'
  if (frequencyHz >= 1_000) return `${displayNumber(frequencyHz / 1_000)} kHz`
  return `${displayNumber(frequencyHz)} Hz`
}

export function AnalysisSection({ derived }: { derived: WorkspaceDerived }) {
  const values = [
    { label: 'MAE', value: displayDb(derived.metrics?.maeDb) },
    { label: 'RMSE', value: displayDb(derived.metrics?.rmseDb) },
    { label: 'Max absolute error', value: displayDb(derived.metrics?.maxAbsDb) },
    {
      label: 'Max-error frequency',
      value: displayFrequency(derived.metrics?.maxAbsFrequencyHz),
    },
    { label: 'Preamp', value: displayDb(derived.preamp?.preampDb) },
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
    </details>
  )
}
