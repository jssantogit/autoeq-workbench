import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { defaultNormalization, useWorkspaceStore } from '../../state/workspaceStore'

const positive = (value: number) => value > 0

export function NormalizationControls() {
  const source = useWorkspaceStore((state) => state.sourceNormalization)
  const target = useWorkspaceStore((state) => state.targetNormalization)
  const setSource = useWorkspaceStore((state) => state.setSourceNormalization)
  const setTarget = useWorkspaceStore((state) => state.setTargetNormalization)
  const normalizeTogether = useWorkspaceStore((state) => state.normalizeTogether)
  const [togetherAnchorHz, setTogetherAnchorHz] = useState(defaultNormalization.anchorHz)
  const [togetherTargetDb, setTogetherTargetDb] = useState(defaultNormalization.targetDb)

  return (
    <section className="normalization" aria-labelledby="normalization-heading">
      <h2 id="normalization-heading">Normalization</h2>
      <div className="normalization__group">
        <strong>Source</strong>
        <NumberField
          label="Source anchor Hz"
          value={source.anchorHz}
          min={1}
          validate={positive}
          onValueChange={(anchorHz) => setSource({ ...source, anchorHz })}
        />
        <NumberField
          label="Source target dB"
          value={source.targetDb}
          step="0.1"
          onValueChange={(targetDb) => setSource({ ...source, targetDb })}
        />
      </div>
      <div className="normalization__group">
        <strong>Target</strong>
        <NumberField
          label="Target anchor Hz"
          value={target.anchorHz}
          min={1}
          validate={positive}
          onValueChange={(anchorHz) => setTarget({ ...target, anchorHz })}
        />
        <NumberField
          label="Target target dB"
          value={target.targetDb}
          step="0.1"
          onValueChange={(targetDb) => setTarget({ ...target, targetDb })}
        />
      </div>
      <div className="normalization__group normalization__group--together">
        <strong>Together</strong>
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
