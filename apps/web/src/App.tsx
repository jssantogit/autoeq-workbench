import { Panel } from './components/ui/Panel'
import { CurveImport } from './features/curves/CurveImport'
import { NormalizationControls } from './features/curves/NormalizationControls'
import { FrequencyResponseGraph } from './features/graph/FrequencyResponseGraph'
import { MetricsSummary } from './features/metrics/MetricsSummary'
import { deriveWorkspace, useWorkspaceStore } from './state/workspaceStore'

function App() {
  const workspace = useWorkspaceStore((state) => state)
  const derived = deriveWorkspace(workspace)

  return (
    <main className="workbench">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">Manual FR workspace</p>
          <h1>AutoEQ Workbench</h1>
        </div>
        <div className="workspace-status" aria-label="Workspace status">
          <span>Source {workspace.source === null ? 'empty' : 'ready'}</span>
          <span>Target {workspace.target === null ? 'empty' : 'ready'}</span>
          <span>{workspace.filters.length} filters</span>
          <span className={`solution-state solution-state--${workspace.solutionState}`}>
            {workspace.solutionState}
          </span>
        </div>
      </header>

      <FrequencyResponseGraph derived={derived} />

      <div className="graph-toolbar">
        <NormalizationControls />
      </div>

      <div className="workspace-grid">
        <Panel title="Source / Target">
          <div className="curve-grid">
            <CurveImport role="source" />
            <CurveImport role="target" />
          </div>
          <div className="config-strip" aria-label="Workbench configuration">
            <span>Profile: Manual</span>
            <span>48 kHz</span>
            <span>20 Hz-20 kHz</span>
          </div>
        </Panel>

        <Panel title="Filter Editor" className="filter-placeholder">
          <div className="filter-columns" aria-hidden="true">
            <span>ON</span><span>#</span><span>TYPE</span><span>FC</span><span>GAIN</span><span>Q</span>
          </div>
          <p>Manual filter controls arrive in Task 7.</p>
        </Panel>
      </div>

      <MetricsSummary derived={derived} />
    </main>
  )
}

export default App
