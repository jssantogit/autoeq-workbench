import { useEffect } from 'react'
import { AppHeader } from './components/layout/AppHeader'
import { WorkbenchDock } from './components/layout/WorkbenchDock'
import { CurvesTab } from './features/curves/CurvesTab'
import { EqualizerTab } from './features/filters/EqualizerTab'
import { FrequencyResponseGraph } from './features/graph/FrequencyResponseGraph'
import { GraphToolbar } from './features/graph/GraphToolbar'
import { ToolsTab } from './features/tools/ToolsTab'
import { SquiglinkShell } from './squiglink/SquiglinkShell'
import { initializeEqCompareRecorder } from './state/initializeEqCompareRecorder'
import { deriveWorkspace, useWorkspaceStore } from './state/workspaceStore'

function App() {
  useEffect(() => initializeEqCompareRecorder(), [])
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
          equalizer={<EqualizerTab derived={derived} />}
          tools={<ToolsTab filters={workspace.filters} derived={derived} />}
        />
      )}
    />
  )
}

export default App
