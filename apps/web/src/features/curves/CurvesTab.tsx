import { CurveAppearanceControls } from './CurveAppearanceControls'
import { NormalizationControls } from './NormalizationControls'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)

  return (
    <section className="curves-tab" aria-label="Curves workspace">
      <ul className="curve-manager" aria-label="Workspace curves">
        {curves.map((curve) => (
          <li className="curve-manager__row" key={curve.id}>
            <CurveAppearanceControls curve={curve} />
          </li>
        ))}
      </ul>
      <NormalizationControls />
    </section>
  )
}
