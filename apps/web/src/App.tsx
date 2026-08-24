import { AppHeader } from './components/layout/AppHeader'
import { UtilityRail } from './components/layout/UtilityRail'
import { WorkbenchDock } from './components/layout/WorkbenchDock'
import { CurvesTab } from './features/curves/CurvesTab'
import { EqualizerTab } from './features/filters/EqualizerTab'
import { FrequencyResponseGraph } from './features/graph/FrequencyResponseGraph'
import { DetailsTab } from './features/metrics/DetailsTab'
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
          <UtilityRail />
          <div className="graph-sizer">
            <FrequencyResponseGraph derived={derived} />
          </div>
        </div>
      )}
      secondary={(
        <WorkbenchDock
          curves={<CurvesTab />}
          equalizer={<EqualizerTab />}
          tools={<DetailsTab derived={derived} />}
        />
      )}
    />
  )
}

export default App
