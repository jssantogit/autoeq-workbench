import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { AutoEqConstraints } from './AutoEqConstraints'
import { FilterEditor } from './FilterEditor'

export function EqualizerTab() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const activeTargetId = useWorkspaceStore((state) => state.activeTargetId)
  const setActiveFr = useWorkspaceStore((state) => state.setActiveFr)
  const setActiveTarget = useWorkspaceStore((state) => state.setActiveTarget)
  const filters = useWorkspaceStore((state) => state.filters)
  const frCurves = curves.filter((curve) => curve.kind === 'fr')
  const targetCurves = curves.filter((curve) => curve.kind === 'target')
  const hasFilters = filters.length > 0

  return (
    <section className="equalizer-tab extra-eq" aria-label="Equalizer workspace">
      <h3>Parametric Equalizer</h3>
      <div className="select-eq-phone" role="group" aria-label="Equalizer profile">
        <label>
          <span>FR</span>
          <select
            name="phone"
            value={activeFrId ?? ''}
            disabled={frCurves.length === 0}
            onChange={(event) => setActiveFr(event.target.value)}
          >
            {frCurves.length === 0
              ? <option value="">No FR loaded</option>
              : activeFrId === null && <option value="">Select FR</option>}
            {frCurves.map((curve) => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select
            name="target"
            value={activeTargetId ?? ''}
            disabled={targetCurves.length === 0}
            onChange={(event) => setActiveTarget(event.target.value)}
          >
            {targetCurves.length === 0
              ? <option value="">No Target loaded</option>
              : activeTargetId === null && <option value="">Select Target</option>}
            {targetCurves.map((curve) => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
          </select>
        </label>
      </div>
      <FilterEditor />
      {settingsOpen && <AutoEqConstraints />}
      <div className="filters-button filters-button--source-actions">
        <Button className="autoeq" onClick={() => undefined}>AutoEQ</Button>
        <Button
          className="autoeq-settings-toggle"
          aria-label="AutoEQ settings"
          aria-expanded={settingsOpen}
          aria-controls="autoeq-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Constraints
        </Button>
        <Button className="import-filters" onClick={() => undefined}>Import</Button>
        <Button className="export-filters" disabled={!hasFilters} onClick={() => undefined}>Export</Button>
        <Button className="export-graphic-filters" disabled={!hasFilters} onClick={() => undefined}>
          Export Graphic EQ (For Wavelet)
        </Button>
      </div>
    </section>
  )
}
