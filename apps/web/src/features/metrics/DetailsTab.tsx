import { MVP_NUMERIC_POLICY } from '@autoeq-workbench/core'
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
  value === 'autoeq' ? 'AutoEQ' : 'Manual'

export function DetailsTab({ derived }: DetailsTabProps) {
  const activeFilterCount = useWorkspaceStore(
    (state) => state.filters.filter(({ enabled }) => enabled).length,
  )
  const totalFilterCount = useWorkspaceStore((state) => state.filters.length)
  const solutionState = useWorkspaceStore((state) => state.solutionState)
  const filterProvenance = useWorkspaceStore((state) => state.filterProvenance)
  const policy = MVP_NUMERIC_POLICY

  return (
    <section className="details-tab" aria-labelledby="details-heading">
      <header className="details-tab__heading">
        <h2 id="details-heading">Details</h2>
        <p>Current comparison, equalizer, and evaluation information.</p>
      </header>

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

        <section className="details-section" aria-labelledby="policy-details-heading">
          <h3 id="policy-details-heading">Evaluation policy</h3>
          <MetricList
            values={[
              { label: 'Sample rate', value: `${policy.sampleRateHz / 1_000} kHz` },
              {
                label: 'Evaluation range',
                value: `${policy.minFrequencyHz} Hz-${policy.maxFrequencyHz / 1_000} kHz`,
              },
              {
                label: 'Evaluation density',
                value: `${policy.evaluationPointsPerOctave} ppo evaluation`,
              },
            ]}
          />
        </section>
      </div>
    </section>
  )
}
