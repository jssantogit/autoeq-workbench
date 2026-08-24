import { MetricsSummary } from '../metrics/MetricsSummary'
import type { WorkspaceDerived } from '../../state/workspaceStore'

export function ToolsInterim({ derived }: { derived: WorkspaceDerived }) {
  return (
    <section className="tools-panel" aria-label="Tools workspace">
      <section className="tools-section tools-section--analysis">
        <h3>Analysis</h3>
        <MetricsSummary derived={derived} />
      </section>
    </section>
  )
}
