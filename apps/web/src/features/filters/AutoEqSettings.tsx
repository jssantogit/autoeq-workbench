import { useEffect } from 'react'
import {
  AUTOEQ_PRODUCT_LIMITS,
  AUTOEQ_TIME_LIMIT_OPTIONS,
  isValidAutoEqSettings,
  type AutoEqSettings,
  type AutoEqTimeLimitSeconds,
} from '@autoeq-workbench/core'
import { NumberField } from '../../components/ui/NumberField'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { isExperimentalStructuralAutoEqEligible } from '../../workers/autoeqClient'

export function AutoEqSettings() {
  const settings = useWorkspaceStore((state) => state.autoeqSettings)
  const setSettings = useWorkspaceStore((state) => state.setAutoEqSettings)
  const experimentalMax10Enabled = useUiStore((state) => state.experimentalMax10Enabled)
  const setExperimentalMax10Enabled = useUiStore((state) => state.setExperimentalMax10Enabled)
  const experimentalMax10Eligible = isExperimentalStructuralAutoEqEligible(settings)
  const update = (change: Partial<AutoEqSettings>) => {
    const nextSettings = { ...settings, ...change }
    setSettings(nextSettings)
    if (
      experimentalMax10Enabled &&
      !isExperimentalStructuralAutoEqEligible(nextSettings)
    ) {
      setExperimentalMax10Enabled(false)
    }
  }

  useEffect(() => {
    if (!experimentalMax10Eligible && experimentalMax10Enabled) {
      setExperimentalMax10Enabled(false)
    }
  }, [
    experimentalMax10Eligible,
    experimentalMax10Enabled,
    setExperimentalMax10Enabled,
  ])
  const validates = (key: keyof AutoEqSettings) => (value: number) =>
    isValidAutoEqSettings({ ...settings, [key]: value })

  return (
    <section id="autoeq-settings" className="autoeq-settings" aria-label="AutoEQ Settings">
      <div className="autoeq-settings-grid" role="table" aria-label="AutoEQ setting ranges">
        <div className="settings-grid-header" role="row">
          <span aria-hidden="true" />
          <span role="columnheader">Min</span>
          <span role="columnheader">Max</span>
        </div>
        <div className="settings-row" role="row" aria-label="AutoEQ frequency range">
          <span role="rowheader">Frequency</span>
          <NumberField
            label="From"
            aria-label="AutoEQ minimum frequency Hz"
            unit="Hz"
            value={settings.minFrequencyHz}
            min={AUTOEQ_PRODUCT_LIMITS.minFrequencyHz}
            max={AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz}
            validate={validates('minFrequencyHz')}
            onValueChange={(minFrequencyHz) => update({ minFrequencyHz })}
          />
          <NumberField
            label="To"
            aria-label="AutoEQ maximum frequency Hz"
            unit="Hz"
            value={settings.maxFrequencyHz}
            min={AUTOEQ_PRODUCT_LIMITS.minFrequencyHz}
            max={AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz}
            validate={validates('maxFrequencyHz')}
            onValueChange={(maxFrequencyHz) => update({ maxFrequencyHz })}
          />
        </div>
        <div className="settings-row" role="row" aria-label="AutoEQ gain range">
          <span role="rowheader">Gain</span>
          <NumberField
            label="Min"
            aria-label="AutoEQ minimum gain dB"
            unit="dB"
            value={settings.minGainDb}
            min={AUTOEQ_PRODUCT_LIMITS.minGainDb}
            max={AUTOEQ_PRODUCT_LIMITS.maxGainDb}
            step="0.1"
            validate={validates('minGainDb')}
            onValueChange={(minGainDb) => update({ minGainDb })}
          />
          <NumberField
            label="Max"
            aria-label="AutoEQ maximum gain dB"
            unit="dB"
            value={settings.maxGainDb}
            min={AUTOEQ_PRODUCT_LIMITS.minGainDb}
            max={AUTOEQ_PRODUCT_LIMITS.maxGainDb}
            step="0.1"
            validate={validates('maxGainDb')}
            onValueChange={(maxGainDb) => update({ maxGainDb })}
          />
        </div>
        <div className="settings-row" role="row" aria-label="AutoEQ Q range">
          <span role="rowheader">Q</span>
          <NumberField
            label="Min"
            aria-label="AutoEQ minimum Q"
            value={settings.minQ}
            min={AUTOEQ_PRODUCT_LIMITS.minQ}
            max={AUTOEQ_PRODUCT_LIMITS.maxQ}
            step="0.1"
            validate={validates('minQ')}
            onValueChange={(minQ) => update({ minQ })}
          />
          <NumberField
            label="Max"
            aria-label="AutoEQ maximum Q"
            value={settings.maxQ}
            min={AUTOEQ_PRODUCT_LIMITS.minQ}
            max={AUTOEQ_PRODUCT_LIMITS.maxQ}
            step="0.1"
            validate={validates('maxQ')}
            onValueChange={(maxQ) => update({ maxQ })}
          />
        </div>
        <div className="settings-row settings-row--limit" role="row" aria-label="AutoEQ filter limit">
          <span role="rowheader">Max Filters</span>
          <span aria-hidden="true" />
          <NumberField
            label="Max"
            aria-label="AutoEQ max filters"
            value={settings.maxFilters}
            min={0}
            max={AUTOEQ_PRODUCT_LIMITS.hardMaxFilters}
            step="1"
            validate={validates('maxFilters')}
            onValueChange={(maxFilters) => update({ maxFilters })}
          />
        </div>
        <div className="settings-row settings-row--time-limit" role="row" aria-label="AutoEQ time limit">
          <span role="rowheader">Time Limit</span>
          <span aria-hidden="true" />
          <select
            aria-label="AutoEQ time limit"
            value={settings.timeLimitSeconds}
            onChange={(event) => update({
              timeLimitSeconds: Number(event.target.value) as AutoEqTimeLimitSeconds,
            })}
          >
            {AUTOEQ_TIME_LIMIT_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>{seconds} s</option>
            ))}
          </select>
        </div>
        <div className="settings-row settings-row--experimental" role="row" aria-label="Experimental Max10">
          <span role="rowheader">Experimental</span>
          <label
            className="experimental-autoeq-toggle"
            title={experimentalMax10Eligible
              ? 'Use the validated Max10 Q31-B4-P8 structural search.'
              : 'Requires Max Filters 10 and the standard frequency, gain, and Q bounds.'}
          >
            <input
              type="checkbox"
              role="switch"
              aria-label="Use experimental Max10 Q31-B4-P8"
              checked={experimentalMax10Enabled && experimentalMax10Eligible}
              disabled={!experimentalMax10Eligible}
              onChange={(event) => setExperimentalMax10Enabled(event.target.checked)}
            />
            <span>Max10 Q31-B4-P8</span>
          </label>
        </div>
      </div>
    </section>
  )
}
