import { Fragment } from 'react'
import { formatEqualizedFrName } from '../graph/graphSeries'
import { useWorkspaceStore } from '../../state/workspaceStore'
import type { WorkspaceDerived } from '../../state/workspaceStore'
import { CurveImport } from './CurveImport'
import { CurveManagerRow, DerivedCurveManagerRow } from './CurveManagerRow'

export function CurvesTab({ derived }: { derived: WorkspaceDerived }) {
  const curves = useWorkspaceStore((state) => state.curves)
  const showEqualized = derived.hasFilters && derived.frEq !== null

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
        <tbody className="curves" aria-label={curves.length === 0 ? 'No curves loaded' : undefined}>
          {curves.map((curve) => (
            <Fragment key={curve.id}>
              <CurveManagerRow curve={curve} />
              {showEqualized && curve.id === derived.activeFrId && (
                <DerivedCurveManagerRow name={formatEqualizedFrName(curve.name)} />
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="curve-upload-actions">
        <CurveImport />
      </div>
    </section>
  )
}
