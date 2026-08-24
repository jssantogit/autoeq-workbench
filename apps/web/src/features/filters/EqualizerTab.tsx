import { Button } from '../../components/ui/Button'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { FilterEditor } from './FilterEditor'

export function EqualizerTab() {
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const activeTargetId = useWorkspaceStore((state) => state.activeTargetId)
  const setActiveFr = useWorkspaceStore((state) => state.setActiveFr)
  const setActiveTarget = useWorkspaceStore((state) => state.setActiveTarget)
  const frCurves = curves.filter((curve) => curve.kind === 'fr')
  const targetCurves = curves.filter((curve) => curve.kind === 'target')

  return (
    <section className="equalizer-tab" aria-label="Equalizer workspace">
      <div className="equalizer-profile" role="group" aria-label="Equalizer profile">
        <label className="equalizer-profile__field">
          <span>FR</span>
          <select
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
        <label className="equalizer-profile__field">
          <span>Target</span>
          <select
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
        <Button disabled title="Auto EQ engine arrives in Plan 2">Auto EQ</Button>
      </div>
      <FilterEditor />
    </section>
  )
}
