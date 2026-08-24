import {
  AUTOEQ_PRODUCT_LIMITS,
  isValidAutoEqSettings,
  type AutoEqSettings,
} from '@autoeq-workbench/core'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { FilterEditor } from './FilterEditor'

export function EqualizerTab() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const activeTargetId = useWorkspaceStore((state) => state.activeTargetId)
  const setActiveFr = useWorkspaceStore((state) => state.setActiveFr)
  const setActiveTarget = useWorkspaceStore((state) => state.setActiveTarget)
  const autoeqSettings = useWorkspaceStore((state) => state.autoeqSettings)
  const setAutoEqSettings = useWorkspaceStore((state) => state.setAutoEqSettings)
  const frCurves = curves.filter((curve) => curve.kind === 'fr')
  const targetCurves = curves.filter((curve) => curve.kind === 'target')
  const updateSetting = (update: Partial<AutoEqSettings>) => {
    setAutoEqSettings({ ...autoeqSettings, ...update })
  }
  const validates = (key: keyof AutoEqSettings) => (value: number) =>
    isValidAutoEqSettings({ ...autoeqSettings, [key]: value })

  return (
    <section className="equalizer-tab" aria-label="Equalizer workspace">
      <header className="equalizer-tab__header">
        <h3>Parametric Equalizer</h3>
        <button
          type="button"
          className="equalizer-settings-toggle"
          aria-label="AutoEQ settings"
          aria-expanded={settingsOpen}
          aria-controls="autoeq-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M9.7 3.2h4.6l.6 2.1 1.2.7 2.1-.6 2.3 4-1.5 1.6v1.4l1.5 1.6-2.3 4-2.1-.6-1.2.7-.6 2.1H9.7l-.6-2.1-1.2-.7-2.1.6-2.3-4L5 12.4V11L3.5 9.4l2.3-4 2.1.6 1.2-.7.6-2.1Z" />
            <circle cx="12" cy="11.7" r="3" />
          </svg>
        </button>
      </header>
      <div className="equalizer-profile" role="group" aria-label="Equalizer profile">
        <div className="equalizer-profile__fr-row">
          <label className="equalizer-profile__field">
            <span>FR</span>
            <select
              value={activeFrId ?? ''}
              disabled={frCurves.length === 0}
              onChange={(event) => setActiveFr(event.target.value)}
            >
              {frCurves.length === 0
                ? <option value="">No FR loaded</option>
                : activeFrId === null && <option value="">Select FR</option>}
              {frCurves.map((curve) => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
            </select>
          </label>
        </div>
        <div className="equalizer-profile__target-row">
          <label className="equalizer-profile__field">
            <span>Target</span>
            <select
              value={activeTargetId ?? ''}
              disabled={targetCurves.length === 0}
              onChange={(event) => setActiveTarget(event.target.value)}
            >
              {targetCurves.length === 0
                ? <option value="">No Target loaded</option>
                : activeTargetId === null && <option value="">Select Target</option>}
              {targetCurves.map((curve) => <option key={curve.id} value={curve.id}>{curve.name}</option>)}
            </select>
          </label>
          <Button disabled title="Auto EQ engine arrives in Plan 2">Auto EQ</Button>
        </div>
      </div>
      {settingsOpen && <section
        id="autoeq-settings"
        className="autoeq-settings"
        aria-label="AutoEQ Settings"
      >
        <div className="autoeq-settings__row" role="group" aria-label="AutoEQ frequency range">
          <span>Frequency</span>
          <NumberField
            label="From"
            aria-label="AutoEQ minimum frequency Hz"
            unit="Hz"
            value={autoeqSettings.minFrequencyHz}
            min={AUTOEQ_PRODUCT_LIMITS.minFrequencyHz}
            max={AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz}
            validate={validates('minFrequencyHz')}
            onValueChange={(minFrequencyHz) => updateSetting({ minFrequencyHz })}
          />
          <NumberField
            label="To"
            aria-label="AutoEQ maximum frequency Hz"
            unit="Hz"
            value={autoeqSettings.maxFrequencyHz}
            min={AUTOEQ_PRODUCT_LIMITS.minFrequencyHz}
            max={AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz}
            validate={validates('maxFrequencyHz')}
            onValueChange={(maxFrequencyHz) => updateSetting({ maxFrequencyHz })}
          />
        </div>
        <div className="autoeq-settings__row" role="group" aria-label="AutoEQ gain range">
          <span>Gain</span>
          <NumberField
            label="Min"
            aria-label="AutoEQ minimum gain dB"
            unit="dB"
            value={autoeqSettings.minGainDb}
            min={AUTOEQ_PRODUCT_LIMITS.minGainDb}
            max={AUTOEQ_PRODUCT_LIMITS.maxGainDb}
            step="0.1"
            validate={validates('minGainDb')}
            onValueChange={(minGainDb) => updateSetting({ minGainDb })}
          />
          <NumberField
            label="Max"
            aria-label="AutoEQ maximum gain dB"
            unit="dB"
            value={autoeqSettings.maxGainDb}
            min={AUTOEQ_PRODUCT_LIMITS.minGainDb}
            max={AUTOEQ_PRODUCT_LIMITS.maxGainDb}
            step="0.1"
            validate={validates('maxGainDb')}
            onValueChange={(maxGainDb) => updateSetting({ maxGainDb })}
          />
        </div>
        <div className="autoeq-settings__row" role="group" aria-label="AutoEQ Q range">
          <span>Q</span>
          <NumberField
            label="Min"
            aria-label="AutoEQ minimum Q"
            value={autoeqSettings.minQ}
            min={AUTOEQ_PRODUCT_LIMITS.minQ}
            max={AUTOEQ_PRODUCT_LIMITS.maxQ}
            step="0.1"
            validate={validates('minQ')}
            onValueChange={(minQ) => updateSetting({ minQ })}
          />
          <NumberField
            label="Max"
            aria-label="AutoEQ maximum Q"
            value={autoeqSettings.maxQ}
            min={AUTOEQ_PRODUCT_LIMITS.minQ}
            max={AUTOEQ_PRODUCT_LIMITS.maxQ}
            step="0.1"
            validate={validates('maxQ')}
            onValueChange={(maxQ) => updateSetting({ maxQ })}
          />
        </div>
        <div className="autoeq-settings__row" role="group" aria-label="AutoEQ filter limit">
          <span>Filters</span>
          <NumberField
            label="Max"
            aria-label="AutoEQ max filters"
            value={autoeqSettings.maxFilters}
            min={0}
            max={AUTOEQ_PRODUCT_LIMITS.hardMaxFilters}
            step="1"
            validate={validates('maxFilters')}
            onValueChange={(maxFilters) => updateSetting({ maxFilters })}
          />
        </div>
      </section>}
      <FilterEditor />
    </section>
  )
}
