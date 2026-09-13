import type { Filter } from '@autoeq-workbench/core'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { SessionControls } from '../session/SessionControls'
import { AnalysisSection } from './AnalysisSection'
import { EqCompare } from './EqCompare'
import { SoundTools } from './SoundTools'

interface ToolsTabProps {
  filters: readonly Filter[]
  derived: WorkspaceDerived
}

export function ToolsTab({ filters, derived }: ToolsTabProps) {
  return (
    <section className="tools-panel" aria-label="Tools workspace">
      <SoundTools filters={filters} preampDb={derived.preamp?.preampDb ?? 0} />
      <EqCompare />
      <SessionControls />
      <AnalysisSection derived={derived} />
    </section>
  )
}
