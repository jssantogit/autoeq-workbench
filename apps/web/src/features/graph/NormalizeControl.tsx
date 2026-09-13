import { MVP_NUMERIC_POLICY } from '@autoeq-workbench/core'
import { useState, type KeyboardEvent } from 'react'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface NumberDraft {
  sourceValue: number
  text: string
  invalid: boolean
}

export function NormalizeControl() {
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setNormalization = useWorkspaceStore((state) => state.setNormalization)

  const [dbDraft, setDbDraft] = useState<NumberDraft | null>(null)
  const [hzDraft, setHzDraft] = useState<NumberDraft | null>(null)
  const currentDbDraft = dbDraft?.sourceValue === normalization.levelDb ? dbDraft : null
  const currentHzDraft = hzDraft?.sourceValue === normalization.frequencyHz ? hzDraft : null

  function commitDb(candidate: string) {
    const trimmed = candidate.trim()
    const numeric = Number(candidate)
    if (trimmed !== '' && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
      setNormalization({ ...normalization, mode: 'db', levelDb: numeric })
      setDbDraft(null)
    } else {
      setDbDraft({ sourceValue: normalization.levelDb, text: candidate, invalid: true })
    }
  }

  function commitHz(candidate: string) {
    const trimmed = candidate.trim()
    const numeric = Number(candidate)
    if (
      trimmed !== '' &&
      Number.isFinite(numeric) &&
      numeric >= MVP_NUMERIC_POLICY.minFrequencyHz &&
      numeric <= MVP_NUMERIC_POLICY.maxFrequencyHz
    ) {
      setNormalization({ ...normalization, mode: 'hz', frequencyHz: numeric })
      setHzDraft(null)
    } else {
      setHzDraft({ sourceValue: normalization.frequencyHz, text: candidate, invalid: true })
    }
  }

  function handleDbKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commitDb(event.currentTarget.value)
  }

  function handleHzKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commitHz(event.currentTarget.value)
  }

  return (
    <div className="normalize" role="group" aria-label="Normalize">
      <span>Normalize:</span>
      <div className="number-field number-field--with-unit number-field--unit-before">
        <span className="number-field__control">
          <button
            type="button"
            className="number-field__unit"
            aria-pressed={normalization.mode === 'db'}
            onClick={() => setNormalization({ ...normalization, mode: 'db' })}
          >
            dB
          </button>
          <input
            type="number"
            aria-label="Normalize dB"
            min={0}
            max={100}
            step="0.1"
            value={currentDbDraft?.text ?? String(normalization.levelDb)}
            aria-invalid={currentDbDraft?.invalid ?? false}
            onChange={(event) => {
              setDbDraft({
                sourceValue: normalization.levelDb,
                text: event.target.value,
                invalid: false,
              })
            }}
            onBlur={(event) => commitDb(event.target.value)}
            onKeyDown={handleDbKeyDown}
          />
        </span>
      </div>
      <div className="number-field number-field--with-unit number-field--unit-before">
        <span className="number-field__control">
          <button
            type="button"
            className="number-field__unit"
            aria-pressed={normalization.mode === 'hz'}
            onClick={() => setNormalization({ ...normalization, mode: 'hz' })}
          >
            Hz
          </button>
          <input
            type="number"
            aria-label="Normalize Hz"
            min={MVP_NUMERIC_POLICY.minFrequencyHz}
            max={MVP_NUMERIC_POLICY.maxFrequencyHz}
            step="1"
            value={currentHzDraft?.text ?? String(normalization.frequencyHz)}
            aria-invalid={currentHzDraft?.invalid ?? false}
            onChange={(event) => {
              setHzDraft({
                sourceValue: normalization.frequencyHz,
                text: event.target.value,
                invalid: false,
              })
            }}
            onBlur={(event) => commitHz(event.target.value)}
            onKeyDown={handleHzKeyDown}
          />
        </span>
      </div>
    </div>
  )
}
