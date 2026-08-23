import type { WorkspaceDerived } from '../../state/workspaceStore'

interface MetricsSummaryProps {
  derived: WorkspaceDerived
}

interface MetricValue {
  label: string
  value: string
}

const displayDb = (value: number | undefined) =>
  value === undefined ? '--' : `${value.toFixed(2)} dB`

const displayNumber = (value: number) => String(Number(value.toFixed(2)))

const displayFrequency = (frequencyHz: number | undefined) => {
  if (frequencyHz === undefined) return '--'
  if (frequencyHz >= 1_000) {
    return `${displayNumber(frequencyHz / 1_000)} kHz`
  }
  return `${displayNumber(frequencyHz)} Hz`
}

export function MetricList({ values }: { values: MetricValue[] }) {
  return (
    <dl className="metric-list">
      {values.map(({ label, value }) => (
        <div className="metric-list__item" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MetricsSummary({ derived }: MetricsSummaryProps) {
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
    <section className="metrics" aria-labelledby="metrics-heading">
      <div className="metrics__heading">
        <h3 id="metrics-heading">Metrics</h3>
      </div>
      <p className={`metrics__status metrics__status--${derived.status}`}>
        {derived.metrics === null
          ? `${derived.message} Comparison metrics require Source and Target with valid 20 Hz-20 kHz coverage.`
          : 'Compared on the canonical evaluation grid.'}
      </p>
      <MetricList values={values} />
    </section>
  )
}
