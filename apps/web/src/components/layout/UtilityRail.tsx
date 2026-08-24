import { useState } from 'react'
import { NumberField } from '../ui/NumberField'
import { exportFrequencyResponseGraph } from '../../features/graph/graphScreenshot'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

const positive = (value: number) => value > 0

export function UtilityRail() {
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
      <div className="rail-normalization" role="group" aria-label="NORMALIZE">
        <span className="rail-normalization__label" aria-hidden="true">NORMALIZE</span>
        <NumberField
          label="Target dB"
          unit="dB"
          value={normalization.targetDb}
          step="0.1"
          onValueChange={(targetDb) => setNormalization({ ...normalization, targetDb })}
        />
        <NumberField
          label="Anchor Hz"
          unit="Hz"
          value={normalization.anchorHz}
          min={1}
          validate={positive}
          onValueChange={(anchorHz) => setNormalization({ ...normalization, anchorHz })}
        />
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
