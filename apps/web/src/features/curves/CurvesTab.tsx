import { CurveAppearanceControls } from './CurveAppearanceControls'
import { CurveImport } from './CurveImport'
import { NormalizationControls } from './NormalizationControls'

export function CurvesTab() {
  return (
    <section className="curves-tab" aria-labelledby="curves-tab-heading">
      <header className="curves-tab__heading">
        <div>
          <h2 id="curves-tab-heading">Curves</h2>
          <p>Import, identify, and align your frequency responses.</p>
        </div>
      </header>
      <ul className="curve-manager" aria-label="Workspace curves">
        <li className="curve-manager__row">
          <CurveImport role="source" />
          <CurveAppearanceControls role="source" />
        </li>
        <li className="curve-manager__row">
          <CurveImport role="target" />
          <CurveAppearanceControls role="target" />
        </li>
      </ul>
      <NormalizationControls />
    </section>
  )
}
