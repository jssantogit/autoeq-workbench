import type { ReactNode } from 'react'
import { useUiStore, type DockTab } from '../../state/uiStore'
import { DockTabs } from './DockTabs'

interface WorkbenchDockProps {
  curves: ReactNode
  equalizer: ReactNode
  tools: ReactNode
}

export function WorkbenchDock({ curves, equalizer, tools }: WorkbenchDockProps) {
  const activeTab = useUiStore((state) => state.activeDockTab)
  const setActiveDockTab = useUiStore((state) => state.setActiveDockTab)
  const panels: Record<DockTab, ReactNode> = { curves, equalizer, tools }

  return (
    <section className="workbench-dock" aria-label="Workbench dock">
      <div className="workbench-dock__handle" aria-hidden="true" />
      <DockTabs activeTab={activeTab} onChange={setActiveDockTab} />
      <div className="workbench-dock__content">
        {(Object.keys(panels) as DockTab[]).map((tab) => (
          <div
            className="workbench-dock__panel"
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
