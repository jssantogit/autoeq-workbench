import type { WorkspaceDerived } from '../../state/workspaceStore'

interface MetricsSummaryProps {
  derived: WorkspaceDerived
}

const displayDb = (value: number | undefined) =>
  value === undefined ? '--' : `${value.toFixed(2)} dB`

export function MetricsSummary({ derived }: MetricsSummaryProps) {
  return (
    <section className="metrics" aria-labelledby="metrics-heading">
      <div className="metrics__heading">
        <h2 id="metrics-heading">Metrics</h2>
        <span>{derived.status === 'ready' ? 'Common grid' : derived.message}</span>
      </div>
      <dl>
        <div>
          <dt>MAE</dt>
          <dd>{displayDb(derived.metrics?.maeDb)}</dd>
        </div>
        <div>
          <dt>RMSE</dt>
          <dd>{displayDb(derived.metrics?.rmseDb)}</dd>
        </div>
        <div>
          <dt>Max error</dt>
          <dd>{displayDb(derived.metrics?.maxAbsDb)}</dd>
        </div>
        <div>
          <dt>Preamp</dt>
          <dd>{displayDb(derived.preamp?.preampDb)}</dd>
        </div>
      </dl>
    </section>
  )
}
