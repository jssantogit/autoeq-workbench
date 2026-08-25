import { useWorkspaceStore } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'
import { CurveManagerRow } from './CurveManagerRow'

export function CurvesTab() {
  const curves = useWorkspaceStore((state) => state.curves)

  return (
    <section className="manage curves-tab" aria-label="Curves workspace">
      <table className="manageTable" aria-label="Curve manager">
        <colgroup>
          <col className="remove" />
          <col className="phoneId" />
          <col className="key" />
          <col className="calibrate" />
          <col className="baselineButton" />
          <col className="hideButton" />
          <col className="lastColumn" />
        </colgroup>
        <tbody className="curves">
          {curves.map((curve) => <CurveManagerRow key={curve.id} curve={curve} />)}
        </tbody>
      </table>
      <div className="curve-upload-actions">
        <CurveImport />
      </div>
    </section>
  )
}
