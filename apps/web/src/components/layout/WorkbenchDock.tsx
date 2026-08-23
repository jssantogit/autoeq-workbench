import type { ReactNode } from 'react'
import { useUiStore, type DockTab } from '../../state/uiStore'
import { DockTabs } from './DockTabs'

interface WorkbenchDockProps {
  curves: ReactNode
  equalizer: ReactNode
  details: ReactNode
}

export function WorkbenchDock({ curves, equalizer, details }: WorkbenchDockProps) {
  const activeTab = useUiStore((state) => state.activeDockTab)
  const setActiveDockTab = useUiStore((state) => state.setActiveDockTab)
  const panels: Record<DockTab, ReactNode> = { curves, equalizer, details }

  return (
    <section className="workbench-dock" aria-label="Workbench dock">
      <DockTabs activeTab={activeTab} onChange={setActiveDockTab} />
      <div className="workbench-dock__content">
        {(Object.keys(panels) as DockTab[]).map((tab) => (
          <div
            key={tab}
            id={`dock-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`dock-tab-${tab}`}
            tabIndex={0}
            hidden={activeTab !== tab}
          >
            {panels[tab]}
          </div>
        ))}
      </div>
    </section>
  )
}
