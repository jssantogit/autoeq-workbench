import { useState, type FormEvent } from 'react'
import type { WorkspaceCurveEntry, WorkspaceCurveRole } from '../../state/workspaceStore'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface CurveAppearanceControlsProps {
  entry: WorkspaceCurveEntry
}

const roleLabels: Record<Exclude<WorkspaceCurveRole, null>, string> = {
  source: 'Source',
  target: 'Target',
  reference: 'Reference Target',
}

export function CurveAppearanceControls({ entry }: CurveAppearanceControlsProps) {
  const { curve, role } = entry
  const appearance = useUiStore((state) => state.curveAppearance[curve.id])
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  const setCurveVisible = useUiStore((state) => state.setCurveVisible)
  const unregisterCurve = useUiStore((state) => state.unregisterCurve)
  const setCurveRole = useWorkspaceStore((state) => state.setCurveRole)
  const renameCurve = useWorkspaceStore((state) => state.renameCurve)
  const removeCurve = useWorkspaceStore((state) => state.removeCurve)
  const [name, setName] = useState(curve.name)

  function handleRename(event: FormEvent) {
    event.preventDefault()
    renameCurve(curve.id, name)
  }

  function handleRemove() {
    removeCurve(curve.id)
    unregisterCurve(curve.id)
  }

  return (
    <>
      <span className="curve-manager__swatch" style={{ background: appearance?.color }} aria-hidden="true" />
      <span className="curve-manager__name" title={curve.name}>{curve.name}</span>
      <span className="curve-status curve-status--loaded">{role === null ? 'Comparison' : roleLabels[role]}</span>
      <label className="visibility-control">
        <input
          type="checkbox"
          aria-label={`Show ${curve.name}`}
          checked={appearance?.visible ?? true}
          onChange={(event) => setCurveVisible(curve.id, event.target.checked)}
        />
      </label>
      <details className="curve-menu">
        <summary aria-label={`Actions for ${curve.name}`}>...</summary>
        <div className="curve-menu__panel">
          <button type="button" onClick={() => setCurveRole(curve.id, 'source')}>Set as Source</button>
          <button type="button" onClick={() => setCurveRole(curve.id, 'target')}>Set as Target</button>
          <button type="button" onClick={() => setCurveRole(curve.id, 'reference')}>Set as Reference Target</button>
          <button type="button" onClick={() => setCurveRole(curve.id, null)}>Set as Comparison</button>
          <label className="color-control">
            <span>Change color</span>
            <input
              type="color"
              aria-label={`${curve.name} color`}
              value={appearance?.color ?? '#1565c0'}
              onChange={(event) => setCurveColor(curve.id, event.target.value)}
            />
          </label>
          <form onSubmit={handleRename} className="curve-menu__rename">
            <label>
              <span>Rename</span>
              <input aria-label={`Rename ${curve.name}`} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="submit">Save name</button>
          </form>
          <button type="button" className="curve-menu__remove" onClick={handleRemove}>Remove</button>
        </div>
      </details>
    </>
  )
}
