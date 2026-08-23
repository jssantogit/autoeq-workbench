import { CurveAppearanceControls } from './CurveAppearanceControls'
import { CurveImport } from './CurveImport'
import { NormalizationControls } from './NormalizationControls'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)

  return (
    <section className="curves-tab" aria-labelledby="curves-tab-heading">
      <header className="curves-tab__heading">
        <div>
          <h2 id="curves-tab-heading">Curves</h2>
          <p>Import, identify, and align your frequency responses.</p>
        </div>
        <CurveImport />
      </header>
      <ul className="curve-manager" aria-label="Workspace curves">
        {curves.map((entry) => (
          <li className="curve-manager__row" key={entry.curve.id}>
            <CurveAppearanceControls entry={entry} />
          </li>
        ))}
      </ul>
      <NormalizationControls />
    </section>
  )
}
