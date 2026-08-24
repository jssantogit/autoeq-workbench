import { useRef, type KeyboardEvent } from 'react'
import type { DockTab } from '../../state/uiStore'

const tabs: { id: DockTab; label: string }[] = [
  { id: 'curves', label: 'Curves' },
  { id: 'equalizer', label: 'Equalizer' },
  { id: 'tools', label: 'Tools' },
]

interface DockTabsProps {
  activeTab: DockTab
  onChange: (tab: DockTab) => void
}

export function DockTabs({ activeTab, onChange }: DockTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = tabs[nextIndex]!
    onChange(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="dock-tabs dock-tabs--segmented" role="tablist" aria-label="Workbench tools">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            tabRefs.current[index] = element
          }}
          id={`dock-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`dock-panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
