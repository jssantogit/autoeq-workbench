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
      <div className="curve-work-areas">
        <section className="curve-work-area" aria-label="Source curve">
          <CurveImport role="source" />
          <CurveAppearanceControls role="source" />
          <NormalizationControls role="source" />
        </section>
        <section className="curve-work-area" aria-label="Target curve">
          <CurveImport role="target" />
          <CurveAppearanceControls role="target" />
          <NormalizationControls role="target" />
        </section>
      </div>
      <NormalizationControls role="together" />
    </section>
  )
}
