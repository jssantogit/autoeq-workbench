import { AppHeader } from './components/layout/AppHeader'
import { UtilityRail } from './components/layout/UtilityRail'
import { WorkbenchDock } from './components/layout/WorkbenchDock'
import { CurvesTab } from './features/curves/CurvesTab'
import { EqualizerTab } from './features/filters/EqualizerTab'
import { FrequencyResponseGraph } from './features/graph/FrequencyResponseGraph'
import { DetailsTab } from './features/metrics/DetailsTab'
import { deriveWorkspace, useWorkspaceStore } from './state/workspaceStore'

function App() {
  const workspace = useWorkspaceStore((state) => state)
  const derived = deriveWorkspace(workspace)

  return (
    <main className="workbench">
      <AppHeader />

      <UtilityRail />
      <FrequencyResponseGraph derived={derived} />

      <WorkbenchDock
        curves={<CurvesTab />}
        equalizer={<EqualizerTab />}
        details={<DetailsTab derived={derived} />}
      />
    </main>
  )
}

export default App
