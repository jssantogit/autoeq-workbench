import { MVP_NUMERIC_POLICY } from '@autoeq-workbench/core'
import { useState } from 'react'
import { NumberField } from '../ui/NumberField'
import { exportFrequencyResponseGraph } from '../../features/graph/graphScreenshot'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { ThemeToggle } from './ThemeToggle'

const validAnchor = (value: number) =>
  Number.isFinite(value) &&
  value >= MVP_NUMERIC_POLICY.minFrequencyHz &&
  value <= MVP_NUMERIC_POLICY.maxFrequencyHz

export function UtilityRail() {
  const [selectedNormalizationField, setSelectedNormalizationField] = useState<'db' | 'hz'>('hz')
  const [screenshotStatus, setScreenshotStatus] = useState('')
  const [screenshotPending, setScreenshotPending] = useState(false)
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setNormalization = useWorkspaceStore((state) => state.setNormalization)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const toggleInspector = useUiStore((state) => state.toggleInspector)

  async function takeScreenshot(): Promise<void> {
    setScreenshotPending(true)
    setScreenshotStatus('Creating graph screenshot.')
    try {
      const result = await exportFrequencyResponseGraph()
      setScreenshotStatus(result.message)
    } catch {
      setScreenshotStatus('Unable to create graph screenshot.')
    } finally {
      setScreenshotPending(false)
    }
  }

  return (
    <div className="utility-rail utility-rail--nowrap" role="toolbar" aria-label="Workspace utilities">
      <ThemeToggle />
      <div className="rail-normalization" role="group" aria-label="NORMALIZE">
        <span className="rail-normalization__label" aria-hidden="true">NORMALIZE</span>
        <div
          className="rail-normalization__compound"
          data-normalization-field="db"
          data-selected={selectedNormalizationField === 'db'}
          onClick={() => setSelectedNormalizationField('db')}
          onFocusCapture={() => setSelectedNormalizationField('db')}
        >
          <NumberField
            label="Target dB"
            unit="dB"
            value={normalization.targetDb}
            step="0.1"
            onValueChange={(targetDb) => setNormalization({ ...normalization, targetDb })}
          />
        </div>
        <div
          className="rail-normalization__compound"
          data-normalization-field="hz"
          data-selected={selectedNormalizationField === 'hz'}
          onClick={() => setSelectedNormalizationField('hz')}
          onFocusCapture={() => setSelectedNormalizationField('hz')}
        >
          <NumberField
            label="Anchor Hz"
            unit="Hz"
            value={normalization.anchorHz}
            min={MVP_NUMERIC_POLICY.minFrequencyHz}
            max={MVP_NUMERIC_POLICY.maxFrequencyHz}
            validate={validAnchor}
            onValueChange={(anchorHz) => setNormalization({ ...normalization, anchorHz })}
          />
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
      <button
        className="utility-rail__action"
        type="button"
        title={screenshotStatus || 'Download graph screenshot'}
        disabled={screenshotPending}
        onClick={() => void takeScreenshot()}
      >
        Screenshot
      </button>
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {screenshotStatus}
      </span>
    </div>
  )
}
