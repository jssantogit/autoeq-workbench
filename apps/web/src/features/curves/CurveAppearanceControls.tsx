import { useState, type FormEvent } from 'react'
import type { Curve } from '@autoeq-workbench/core'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface CurveAppearanceControlsProps {
  curve: Curve
}

export function CurveAppearanceControls({ curve }: CurveAppearanceControlsProps) {
  const appearance = useUiStore((state) => state.curveAppearance[curve.id])
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  const setCurveVisible = useUiStore((state) => state.setCurveVisible)
  const unregisterCurve = useUiStore((state) => state.unregisterCurve)
  const activeId = useWorkspaceStore((state) =>
    curve.kind === 'fr' ? state.activeFrId : state.activeTargetId,
  )
  const setActive = useWorkspaceStore((state) =>
    curve.kind === 'fr' ? state.setActiveFr : state.setActiveTarget,
  )
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
      <span className="curve-status curve-status--loaded">
        {activeId === curve.id ? `Active ${curve.kind === 'fr' ? 'FR' : 'Target'}` : curve.kind === 'fr' ? 'FR' : 'Target'}
      </span>
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
          {activeId === curve.id
            ? <button type="button" onClick={() => setActive(null)}>Clear active {curve.kind === 'fr' ? 'FR' : 'Target'}</button>
            : <button type="button" onClick={() => setActive(curve.id)}>Set active {curve.kind === 'fr' ? 'FR' : 'Target'}</button>}
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
