import { CurveAppearanceControls } from './CurveAppearanceControls'
import { NormalizationControls } from './NormalizationControls'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)

  return (
    <section className="curves-tab" aria-label="Curves workspace">
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
