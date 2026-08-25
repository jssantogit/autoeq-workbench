import type { Curve } from '@autoeq-workbench/core'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NumberField } from '../../components/ui/NumberField'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurveManagerRow({ curve }: { curve: Curve }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(curve.name)
  const registrationAttempted = useRef(false)
  const appearance = useUiStore((state) => state.curveAppearance[curve.id])
  const baselineCurveId = useUiStore((state) => state.baselineCurveId)
  const registerCurve = useUiStore((state) => state.registerCurve)
  const unregisterCurve = useUiStore((state) => state.unregisterCurve)
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  const setCurveVisible = useUiStore((state) => state.setCurveVisible)
  const setCurveOffset = useUiStore((state) => state.setCurveOffset)
  const setBaselineCurve = useUiStore((state) => state.setBaselineCurve)
  const active = useWorkspaceStore((state) =>
    curve.kind === 'fr' ? state.activeFrId === curve.id : state.activeTargetId === curve.id,
  )
  const setActiveFr = useWorkspaceStore((state) => state.setActiveFr)
  const setActiveTarget = useWorkspaceStore((state) => state.setActiveTarget)
  const renameCurve = useWorkspaceStore((state) => state.renameCurve)
  const removeCurve = useWorkspaceStore((state) => state.removeCurve)

  useEffect(() => {
    if (registrationAttempted.current) return
    registrationAttempted.current = true
    if (appearance === undefined) registerCurve(curve.id)
  }, [appearance, curve.id, registerCurve])

  function activate(): void {
    if (curve.kind === 'fr') setActiveFr(curve.id)
    else setActiveTarget(curve.id)
  }

  function remove(): void {
    removeCurve(curve.id)
    unregisterCurve(curve.id)
  }

  function saveName(event: FormEvent): void {
    event.preventDefault()
    renameCurve(curve.id, name)
    if (name.trim().length > 0) setRenaming(false)
  }

  const kindLabel = curve.kind === 'fr' ? 'FR' : 'Target'
  const baseline = baselineCurveId === curve.id

  return (
    <tr className={`curve-manager-row${active ? ' selected' : ''}`}>
      <td className="remove">
        <button type="button" aria-label={`Remove ${curve.name}`} title="Remove graph" onClick={remove}>×</button>
      </td>
      <td className="phoneId">
        <button
          type="button"
          aria-label={`Set ${curve.name} as active ${kindLabel}`}
          aria-pressed={active}
          title={`Set active ${kindLabel}`}
          onClick={activate}
        >
          {kindLabel}
        </button>
      </td>
      <td className="key">
        {renaming ? (
          <form className="curve-row-rename" onSubmit={saveName}>
            <input
              aria-label={`Rename ${curve.name}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <button type="submit">Save name</button>
            <button type="button" onClick={() => { setName(curve.name); setRenaming(false) }}>Cancel</button>
          </form>
        ) : (
          <div className="curve-row-name">
            <span className="curve-row-name__label" title={curve.name}>{curve.name}</span>
            <button type="button" aria-label={`Rename ${curve.name}`} title="Rename graph" onClick={() => setRenaming(true)}>✎</button>
          </div>
        )}
      </td>
      <td className="calibrate">
        {curve.kind === 'fr' && (
          <input
            className="curve-row-color"
            type="color"
            aria-label={`${curve.name} color`}
            title="Graph color"
            value={appearance?.color ?? '#1565c0'}
            onChange={(event) => setCurveColor(curve.id, event.target.value)}
          />
        )}
        <NumberField
          label={`${curve.name} offset dB`}
          value={appearance?.offsetDb ?? 0}
          step="0.1"
          unit="dB"
          onValueChange={(offsetDb) => setCurveOffset(curve.id, offsetDb)}
        />
      </td>
      <td className="baselineButton">
        <button
          type="button"
          aria-label={`${baseline ? 'Clear' : 'Set'} ${curve.name} graph baseline`}
          aria-pressed={baseline}
          title="Set as baseline"
          onClick={() => setBaselineCurve(baseline ? null : curve.id)}
        >
          BASE
        </button>
      </td>
      <td className="hideButton">
        <label className="curve-row-visibility" title="Show graph">
          <span className="visually-hidden">{curve.name} visible</span>
          <input
            type="checkbox"
            aria-label={`${curve.name} visible`}
            checked={appearance?.visible ?? true}
            onChange={(event) => setCurveVisible(curve.id, event.target.checked)}
          />
          <span aria-hidden="true">◉</span>
        </label>
      </td>
      <td className="lastColumn" aria-hidden="true" />
    </tr>
  )
}
