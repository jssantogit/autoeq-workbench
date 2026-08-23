import { useRef } from 'react'
import { Panel } from './components/ui/Panel'
import { AppHeader } from './components/layout/AppHeader'
import { WorkbenchDock } from './components/layout/WorkbenchDock'
import { CurveImport } from './features/curves/CurveImport'
import { NormalizationControls } from './features/curves/NormalizationControls'
import {
  FrequencyResponseGraph,
  type FrequencyResponseGraphHandle,
} from './features/graph/FrequencyResponseGraph'
import { GraphToolbar } from './features/graph/GraphToolbar'
import { FilterEditor } from './features/filters/FilterEditor'
import { MetricsSummary } from './features/metrics/MetricsSummary'
import { deriveWorkspace, useWorkspaceStore } from './state/workspaceStore'

function App() {
  const workspace = useWorkspaceStore((state) => state)
  const derived = deriveWorkspace(workspace)
  const graphRef = useRef<FrequencyResponseGraphHandle>(null)

  return (
    <main className="workbench">
      <AppHeader />

      <GraphToolbar onResetView={() => graphRef.current?.resetView()} />
      <FrequencyResponseGraph ref={graphRef} derived={derived} />

      <WorkbenchDock
        curves={
          <Panel title="Source / Target">
            <div className="curve-grid">
              <CurveImport role="source" />
              <CurveImport role="target" />
            </div>
            <NormalizationControls />
            <div className="config-strip" aria-label="Workbench configuration">
              <span>Profile: Manual</span>
              <span>48 kHz</span>
              <span>20 Hz-20 kHz</span>
            </div>
          </Panel>
        }
        equalizer={
          <Panel title="Filter Editor">
            <FilterEditor />
          </Panel>
        }
        details={<MetricsSummary derived={derived} />}
      />
    </main>
  )
}

export default App
