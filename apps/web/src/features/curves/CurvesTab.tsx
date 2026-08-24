import { CurveAppearanceControls } from './CurveAppearanceControls'
import { CurveImport } from './CurveImport'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)
  const frCurves = curves.filter(({ kind }) => kind === 'fr')
  const targets = curves.filter(({ kind }) => kind === 'target')

  return (
    <section className="curves-tab" aria-label="Curves workspace">
      <section className="curve-manager__section" aria-labelledby="fr-curves-heading">
        <div className="curve-manager__heading">
          <h3 id="fr-curves-heading">FR</h3>
          <CurveImport kind="fr" />
        </div>
        <ul className="curve-manager" aria-label="Frequency response curves">
          {frCurves.map((curve) => (
            <li className="curve-manager__row" key={curve.id}>
              <CurveAppearanceControls curve={curve} />
            </li>
          ))}
        </ul>
      </section>
      <section className="curve-manager__section" aria-labelledby="target-curves-heading">
        <div className="curve-manager__heading">
          <h3 id="target-curves-heading">TARGETS</h3>
          <CurveImport kind="target" />
        </div>
        <ul className="curve-manager" aria-label="Target curves">
          {targets.map((curve) => (
            <li className="curve-manager__row" key={curve.id}>
              <CurveAppearanceControls curve={curve} />
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
