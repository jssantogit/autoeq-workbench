import type { Curve } from '@autoeq-workbench/core'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { NumberField } from '../../components/ui/NumberField'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { EQUALIZED_FR_APPEARANCE_ID } from '../graph/graphSeries'

function useRegisteredAppearance(id: string) {
  const registrationAttempted = useRef(false)
  const appearance = useUiStore((state) => state.curveAppearance[id])
  const registerCurve = useUiStore((state) => state.registerCurve)

  useEffect(() => {
    if (registrationAttempted.current) return
    registrationAttempted.current = true
    if (appearance === undefined) registerCurve(id)
  }, [appearance, id, registerCurve])

  return appearance
}

function VisibilityButton({ id, name, visible }: { id: string; name: string; visible: boolean }) {
  const setCurveVisible = useUiStore((state) => state.setCurveVisible)
  const action = visible ? 'Hide' : 'Show'
  return (
    <button type="button" aria-label={`${action} ${name}`} onClick={() => setCurveVisible(id, !visible)} />
  )
}

function ColorControl({ id, name, color }: { id: string; name: string; color: string }) {
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  return (
    <input
      className="curve-row-color"
      type="color"
      aria-label={`${name} color`}
      title="Graph color"
      value={color}
      onChange={(event) => setCurveColor(id, event.target.value)}
    />
  )
}

export function CurveManagerRow({ curve }: { curve: Curve }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(curve.name)
  const appearance = useRegisteredAppearance(curve.id)
  const baselineCurveId = useUiStore((state) => state.baselineCurveId)
  const unregisterCurve = useUiStore((state) => state.unregisterCurve)
  const setCurveOffset = useUiStore((state) => state.setCurveOffset)
  const setBaselineCurve = useUiStore((state) => state.setBaselineCurve)
  const renameCurve = useWorkspaceStore((state) => state.renameCurve)
  const removeCurve = useWorkspaceStore((state) => state.removeCurve)
  const visible = appearance?.visible ?? true
  const baseline = baselineCurveId === curve.id

  function remove(): void {
    removeCurve(curve.id)
    unregisterCurve(curve.id)
  }

  function saveName(event: FormEvent): void {
    event.preventDefault()
    renameCurve(curve.id, name)
    if (name.trim().length > 0) setRenaming(false)
  }

  function cancelRename(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Escape') return
    setName(curve.name)
    setRenaming(false)
  }

  return (
    <tr className="curve-manager-row" aria-label={curve.name}>
      <td className={`curve-color${curve.kind === 'target' ? ' curve-color--target' : ''}`}>
        {curve.kind === 'fr' ? (
          <ColorControl id={curve.id} name={curve.name} color={appearance?.color ?? '#1565c0'} />
        ) : (
          <span className="curve-row-color curve-row-color--target" role="img" aria-label={`${curve.name} fixed gray color`} />
        )}
      </td>
      <td className={`item-line ${curve.kind === 'target' ? 'item-target' : 'item-phone'}`}>
        {renaming ? (
          <form className="curve-row-rename" onSubmit={saveName}>
            <input
              aria-label={`Rename ${curve.name}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={cancelRename}
              autoFocus
            />
          </form>
        ) : (
          <button
            className="curve-row-name__label"
            type="button"
            aria-label={`Rename ${curve.name}`}
            title={curve.name}
            onClick={() => { setName(curve.name); setRenaming(true) }}
          >{curve.name}</button>
        )}
      </td>
      <td className="levels">
        <NumberField
          label={`${curve.name} offset dB`}
          value={appearance?.offsetDb ?? 0}
          step="0.1"
          onValueChange={(offsetDb) => setCurveOffset(curve.id, offsetDb)}
        />
      </td>
      <td className={`button button-baseline${baseline ? ' selected' : ''}`}>
        <button
          type="button"
          aria-label={`${baseline ? 'Clear' : 'Set'} ${curve.name} graph baseline`}
          aria-pressed={baseline}
          onClick={() => setBaselineCurve(baseline ? null : curve.id)}
        />
      </td>
      <td className={`button hideIcon${visible ? '' : ' selected'}`}>
        <VisibilityButton id={curve.id} name={curve.name} visible={visible} />
      </td>
      <td className="remove">
        <button type="button" aria-label={`Remove ${curve.name}`} onClick={remove} />
      </td>
    </tr>
  )
}

export function DerivedCurveManagerRow({ name }: { name: string }) {
  const appearance = useRegisteredAppearance(EQUALIZED_FR_APPEARANCE_ID)
  const visible = appearance?.visible ?? true

  return (
    <tr className="curve-manager-row curve-manager-row--derived" aria-label={name}>
      <td className="curve-color">
        <ColorControl
          id={EQUALIZED_FR_APPEARANCE_ID}
          name={name}
          color={appearance?.color ?? '#c62828'}
        />
      </td>
      <td className="item-line item-phone">
        <span className="curve-row-name__label" title={name}>{name}</span>
      </td>
      <td className="levels curve-row-cell-placeholder" aria-hidden="true" />
      <td className="button button-baseline curve-row-cell-placeholder" aria-hidden="true" />
      <td className={`button hideIcon${visible ? '' : ' selected'}`}>
        <VisibilityButton id={EQUALIZED_FR_APPEARANCE_ID} name={name} visible={visible} />
      </td>
      <td className="remove curve-row-cell-placeholder" aria-hidden="true" />
    </tr>
  )
}
