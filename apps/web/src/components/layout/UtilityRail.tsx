import { CurveImport } from '../../features/curves/CurveImport'
import { NumberField } from '../ui/NumberField'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

const positive = (value: number) => value > 0

export function UtilityRail() {
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setNormalization = useWorkspaceStore((state) => state.setNormalization)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const toggleInspector = useUiStore((state) => state.toggleInspector)

  return (
    <div className="utility-rail utility-rail--nowrap" role="toolbar" aria-label="Workspace utilities">
      <div className="utility-rail__imports">
        <CurveImport kind="fr" />
        <CurveImport kind="target" />
      </div>
      <div className="rail-normalization" role="group" aria-label="NORMALIZE">
        <span className="rail-normalization__label" aria-hidden="true">NORMALIZE</span>
        <div className="rail-number-field">
          <NumberField
            label="Target dB"
            value={normalization.targetDb}
            step="0.1"
            onValueChange={(targetDb) => setNormalization({ ...normalization, targetDb })}
          />
          <span className="rail-number-field__unit" aria-hidden="true">dB</span>
        </div>
        <div className="rail-number-field">
          <NumberField
            label="Anchor Hz"
            value={normalization.anchorHz}
            min={1}
            validate={positive}
            onValueChange={(anchorHz) => setNormalization({ ...normalization, anchorHz })}
          />
          <span className="rail-number-field__unit" aria-hidden="true">Hz</span>
        </div>
      </div>
      <button
        className="utility-rail__action"
        type="button"
        aria-pressed={inspectorEnabled}
        onClick={toggleInspector}
      >
        Inspect
      </button>
    </div>
  )
}
