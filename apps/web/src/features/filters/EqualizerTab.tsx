import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { cancelAutoEq, runAutoEq } from '../../state/autoeqController'
import { useAutoEqRunStore } from '../../state/autoeqRunStore'
import { type WorkspaceDerived, useWorkspaceStore } from '../../state/workspaceStore'
import { AutoEqSettings } from './AutoEqSettings'
import { FilterEditor } from './FilterEditor'
import { FilterIoControls } from './FilterIoControls'

export function EqualizerTab({ derived }: { derived: WorkspaceDerived }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const runStatus = useAutoEqRunStore((state) => state.status)
  const runError = useAutoEqRunStore((state) => state.error)
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const activeTargetId = useWorkspaceStore((state) => state.activeTargetId)
  const setActiveFr = useWorkspaceStore((state) => state.setActiveFr)
  const setActiveTarget = useWorkspaceStore((state) => state.setActiveTarget)
  const frCurves = curves.filter((curve) => curve.kind === 'fr')
  const targetCurves = curves.filter((curve) => curve.kind === 'target')

  return (
    <section className="equalizer-tab extra-eq" aria-label="Equalizer workspace">
      <div className="equalizer-heading">
        <h3>Parametric Equalizer</h3>
        <Button
          className="autoeq-settings-toggle"
          aria-expanded={settingsOpen}
          aria-controls="autoeq-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Settings
        </Button>
      </div>
      {settingsOpen && <AutoEqSettings />}
      <div className="select-eq-phone" role="group" aria-label="Equalizer profile">
        <label className="select-eq-phone__fr">
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
        <div className="target-autoeq" role="group" aria-label="Target and AutoEQ">
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
          <Button
            className={`autoeq${runStatus === 'running' ? ' autoeq--running' : ''}`}
            disabled={runStatus !== 'running' && derived.status !== 'ready'}
            onClick={runStatus === 'running' ? cancelAutoEq : () => void runAutoEq()}
          >
            {runStatus === 'running' ? 'Cancel' : 'AutoEQ'}
          </Button>
        </div>
      </div>
      <FilterEditor />
      <div className="filter-io-actions">
        <FilterIoControls />
      </div>
      {runError !== null && (
        <p className="autoeq-error" role="alert">
          [{runError.category}] {runError.message}
        </p>
      )}
    </section>
  )
}
