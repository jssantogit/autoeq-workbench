import { AppHeader } from './components/layout/AppHeader'
import { WorkbenchDock } from './components/layout/WorkbenchDock'
import { CurvesTab } from './features/curves/CurvesTab'
import { EqualizerTab } from './features/filters/EqualizerTab'
import { FrequencyResponseGraph } from './features/graph/FrequencyResponseGraph'
import { GraphToolbar } from './features/graph/GraphToolbar'
import { ToolsInterim } from './features/tools/ToolsInterim'
import { SquiglinkShell } from './squiglink/SquiglinkShell'
import { deriveWorkspace, useWorkspaceStore } from './state/workspaceStore'

function App() {
  const workspace = useWorkspaceStore((state) => state)
  const derived = deriveWorkspace(workspace)

  return (
    <SquiglinkShell
      header={<AppHeader />}
      primary={(
        <div className="graphBox">
          <GraphToolbar />
          <div className="graph-sizer">
            <FrequencyResponseGraph derived={derived} />
          </div>
        </div>
      )}
      secondary={(
        <WorkbenchDock
          curves={<CurvesTab derived={derived} />}
          equalizer={<EqualizerTab />}
          tools={<ToolsInterim derived={derived} />}
        />
      )}
    />
  )
}

export default App
