import { CurveAppearanceControls } from './CurveAppearanceControls'
import { CurveImport } from './CurveImport'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)
  const frCurves = curves.filter(({ kind }) => kind === 'fr')
  const targets = curves.filter(({ kind }) => kind === 'target')

  return (
    <section className="curves-tab" aria-label="Curves workspace">
      <div className="curve-upload-toolbar" role="toolbar" aria-label="Curve uploads">
        <CurveImport kind="fr" />
        <CurveImport kind="target" />
      </div>
      <section className="curve-manager__section" aria-labelledby="fr-curves-heading">
        <h3 className="curve-manager__heading" id="fr-curves-heading">FR</h3>
        {frCurves.length === 0 ? (
          <p className="curve-manager__empty">No FR loaded</p>
        ) : (
          <ul className="curve-manager" aria-label="Frequency response curves">
            {frCurves.map((curve) => (
              <li className="curve-manager__row" key={curve.id}>
                <CurveAppearanceControls curve={curve} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="curve-manager__section" aria-labelledby="target-curves-heading">
        <h3 className="curve-manager__heading" id="target-curves-heading">TARGETS</h3>
        {targets.length === 0 ? (
          <p className="curve-manager__empty">No Target loaded</p>
        ) : (
          <ul className="curve-manager" aria-label="Target curves">
            {targets.map((curve) => (
              <li className="curve-manager__row" key={curve.id}>
                <CurveAppearanceControls curve={curve} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
