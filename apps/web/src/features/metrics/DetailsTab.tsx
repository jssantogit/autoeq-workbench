import {
  useWorkspaceStore,
  type WorkspaceDerived,
} from '../../state/workspaceStore'
import { MetricList, MetricsSummary } from './MetricsSummary'

interface DetailsTabProps {
  derived: WorkspaceDerived
}

const titleCase = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`

const displayProvenance = (value: 'manual' | 'autoeq' | null) =>
  value === 'autoeq' ? 'AutoEQ' : 'User edited'

export function DetailsTab({ derived }: DetailsTabProps) {
  const activeFilterCount = useWorkspaceStore(
    (state) => state.filters.filter(({ enabled }) => enabled).length,
  )
  const totalFilterCount = useWorkspaceStore((state) => state.filters.length)
  const solutionState = useWorkspaceStore((state) => state.solutionState)
  const filterProvenance = useWorkspaceStore((state) => state.filterProvenance)
  return (
    <section className="details-tab" aria-label="Details workspace">
      <div className="details-tab__sections">
        <MetricsSummary derived={derived} />

        <section className="details-section" aria-labelledby="workspace-details-heading">
          <h3 id="workspace-details-heading">Workspace</h3>
          <MetricList
            values={[
              { label: 'Active filters', value: String(activeFilterCount) },
              { label: 'Total filters', value: String(totalFilterCount) },
              { label: 'Solution state', value: titleCase(solutionState) },
              { label: 'Provenance', value: displayProvenance(filterProvenance) },
            ]}
          />
        </section>
      </div>
    </section>
  )
}
