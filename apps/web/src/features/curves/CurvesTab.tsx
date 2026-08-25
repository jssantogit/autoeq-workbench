import { useWorkspaceStore } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'
import { CurveManagerRow } from './CurveManagerRow'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)

  return (
    <section className="manage curves-tab" aria-label="Curves workspace">
      <div className="curve-upload-actions" role="toolbar" aria-label="Curve uploads">
        <CurveImport kind="fr" />
        <CurveImport kind="target" />
      </div>
      <table className="manageTable" aria-label="Curve manager">
        <tbody>
          {curves.length === 0 ? (
            <tr className="curve-manager-empty">
              <td colSpan={6}>No curves loaded</td>
            </tr>
          ) : curves.map((curve) => <CurveManagerRow key={curve.id} curve={curve} />)}
        </tbody>
      </table>
    </section>
  )
}
