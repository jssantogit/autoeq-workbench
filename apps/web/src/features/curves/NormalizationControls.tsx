import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { useWorkspaceStore } from '../../state/workspaceStore'

const positive = (value: number) => value > 0

export function NormalizationControls() {
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setNormalization = useWorkspaceStore((state) => state.setNormalization)
  const [anchorHz, setAnchorHz] = useState(normalization.anchorHz)
  const [targetDb, setTargetDb] = useState(normalization.targetDb)
  const [lastNormalization, setLastNormalization] = useState(normalization)

  if (normalization !== lastNormalization) {
    setLastNormalization(normalization)
    setAnchorHz(normalization.anchorHz)
    setTargetDb(normalization.targetDb)
  }

  return (
    <section className="workspace-normalization" aria-label="Workspace normalization">
      <div className="workspace-normalization__heading">
        <h3>Workspace normalization</h3>
        <p>Applied non-destructively to every imported curve.</p>
      </div>
      <div className="workspace-normalization__controls">
        <NumberField
          label="Anchor Hz"
          value={anchorHz}
          min={1}
          validate={positive}
          onValueChange={setAnchorHz}
        />
        <NumberField
          label="Target dB"
          value={targetDb}
          step="0.1"
          onValueChange={setTargetDb}
        />
        <Button onClick={() => setNormalization({ anchorHz, targetDb })}>
          Apply normalization
        </Button>
      </div>
    </section>
  )
}
