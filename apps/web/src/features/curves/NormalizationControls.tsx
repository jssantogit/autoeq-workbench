import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { defaultNormalization, useWorkspaceStore } from '../../state/workspaceStore'

const positive = (value: number) => value > 0

interface NormalizationControlsProps {
  role: 'source' | 'target' | 'together'
}

function CurveNormalizationControls({ role }: { role: 'source' | 'target' }) {
  const normalization = useWorkspaceStore((state) => state[`${role}Normalization`])
  const setNormalization = useWorkspaceStore((state) =>
    role === 'source' ? state.setSourceNormalization : state.setTargetNormalization,
  )
  const label = role === 'source' ? 'Source' : 'Target'

  return (
    <section className="curve-normalization" aria-labelledby={`${role}-normalization-heading`}>
      <h4 id={`${role}-normalization-heading`}>Normalization</h4>
      <div className="normalization-fields">
        <NumberField
          label={`${label} anchor Hz`}
          value={normalization.anchorHz}
          min={1}
          validate={positive}
          onValueChange={(anchorHz) => setNormalization({ ...normalization, anchorHz })}
        />
        <NumberField
          label={`${label} target dB`}
          value={normalization.targetDb}
          step="0.1"
          onValueChange={(targetDb) => setNormalization({ ...normalization, targetDb })}
        />
      </div>
    </section>
  )
}

function TogetherNormalizationControls() {
  const normalizeTogether = useWorkspaceStore((state) => state.normalizeTogether)
  const [togetherAnchorHz, setTogetherAnchorHz] = useState(defaultNormalization.anchorHz)
  const [togetherTargetDb, setTogetherTargetDb] = useState(defaultNormalization.targetDb)

  return (
    <section className="normalize-together" aria-labelledby="normalize-together-heading">
      <div className="normalize-together__heading">
        <h3 id="normalize-together-heading">Normalize Together</h3>
        <p>Apply one non-destructive anchor and level to both curves.</p>
      </div>
      <div className="normalize-together__controls">
        <NumberField
          label="Together anchor Hz"
          value={togetherAnchorHz}
          min={1}
          validate={positive}
          onValueChange={setTogetherAnchorHz}
        />
        <NumberField
          label="Together target dB"
          value={togetherTargetDb}
          step="0.1"
          onValueChange={setTogetherTargetDb}
        />
        <Button
          onClick={() =>
            normalizeTogether({ anchorHz: togetherAnchorHz, targetDb: togetherTargetDb })
          }
        >
          Normalize Together
        </Button>
      </div>
    </section>
  )
}

export function NormalizationControls({ role }: NormalizationControlsProps) {
  return role === 'together' ? (
    <TogetherNormalizationControls />
  ) : (
    <CurveNormalizationControls role={role} />
  )
}
