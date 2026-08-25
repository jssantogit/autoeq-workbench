import { MVP_NUMERIC_POLICY } from '@autoeq-workbench/core'
import { useState } from 'react'
import { ThemeToggle } from '../../components/layout/ThemeToggle'
import { NumberField } from '../../components/ui/NumberField'
import {
  MEASUREMENT_CURVE_PALETTE,
  useUiStore,
  type GraphZoomPreset,
} from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { exportFrequencyResponseGraph } from './graphScreenshot'

const validAnchor = (value: number) =>
  Number.isFinite(value) &&
  value >= MVP_NUMERIC_POLICY.minFrequencyHz &&
  value <= MVP_NUMERIC_POLICY.maxFrequencyHz

export function GraphToolbar() {
  const [screenshotStatus, setScreenshotStatus] = useState('')
  const [screenshotPending, setScreenshotPending] = useState(false)
  const graphZoomPreset = useUiStore((state) => state.graphZoomPreset)
  const setGraphZoomPreset = useUiStore((state) => state.setGraphZoomPreset)
  const smoothingLevel = useUiStore((state) => state.smoothingLevel)
  const setSmoothingLevel = useUiStore((state) => state.setSmoothingLevel)
  const inspectorEnabled = useUiStore((state) => state.inspectorEnabled)
  const toggleInspector = useUiStore((state) => state.toggleInspector)
  const labelsEnabled = useUiStore((state) => state.labelsEnabled)
  const toggleLabels = useUiStore((state) => state.toggleLabels)
  const curveAppearance = useUiStore((state) => state.curveAppearance)
  const registerCurve = useUiStore((state) => state.registerCurve)
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  const curves = useWorkspaceStore((state) => state.curves)
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setNormalization = useWorkspaceStore((state) => state.setNormalization)

  function toggleZoom(preset: Exclude<GraphZoomPreset, 'full'>): void {
    setGraphZoomPreset(graphZoomPreset === preset ? 'full' : preset)
  }

  function recolorVisibleFrs(): void {
    const visibleFrs = curves.filter((curve) =>
      curve.kind === 'fr' && curveAppearance[curve.id]?.visible !== false,
    )
    const assigned: string[] = []
    for (const curve of visibleFrs) {
      const current = curveAppearance[curve.id]?.color ?? '#1565c0'
      if (curveAppearance[curve.id] === undefined) registerCurve(curve.id)
      const color = MEASUREMENT_CURVE_PALETTE.find((candidate) =>
        candidate.toLowerCase() !== current.toLowerCase() &&
        !assigned.some((used) => used.toLowerCase() === candidate.toLowerCase()),
      ) ?? MEASUREMENT_CURVE_PALETTE[
        (Math.max(0, MEASUREMENT_CURVE_PALETTE.indexOf(
          current as (typeof MEASUREMENT_CURVE_PALETTE)[number],
        )) + 1) % MEASUREMENT_CURVE_PALETTE.length
      ]
      assigned.push(color)
      setCurveColor(curve.id, color)
    }
  }

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
    <div className="tools graph-toolbar" role="toolbar" aria-label="Graph tools">
      <ThemeToggle />
      <div className="zoom" role="group" aria-label="Zoom">
        <span>Zoom:</span>
        <button type="button" aria-pressed={graphZoomPreset === 'bass'} onClick={() => toggleZoom('bass')}>Bass</button>
        <button type="button" aria-pressed={graphZoomPreset === 'midrange'} onClick={() => toggleZoom('midrange')}>Mids</button>
        <button type="button" aria-pressed={graphZoomPreset === 'treble'} onClick={() => toggleZoom('treble')}>Treble</button>
      </div>
      <div className="normalize" role="group" aria-label="Normalize">
        <span>Normalize:</span>
        <NumberField
          label="Normalize dB"
          value={normalization.targetDb}
          step="0.1"
          unit="dB"
          unitPosition="before"
          onValueChange={(targetDb) => setNormalization({ ...normalization, targetDb })}
        />
        <NumberField
          label="Normalize Hz"
          value={normalization.anchorHz}
          min={MVP_NUMERIC_POLICY.minFrequencyHz}
          max={MVP_NUMERIC_POLICY.maxFrequencyHz}
          unit="Hz"
          unitPosition="before"
          validate={validAnchor}
          onValueChange={(anchorHz) => setNormalization({ ...normalization, anchorHz })}
        />
      </div>
      <div className="smooth">
        <NumberField
          label="Smooth"
          value={smoothingLevel}
          min={0}
          step="any"
          validate={(value) => Number.isFinite(value) && value >= 0}
          onValueChange={setSmoothingLevel}
        />
      </div>
      <div className="miscTools">
        <button type="button" aria-pressed={inspectorEnabled} onClick={toggleInspector}>Inspect</button>
        <button type="button" aria-pressed={labelsEnabled} onClick={toggleLabels}>Label</button>
        <button type="button" disabled={screenshotPending} title={screenshotStatus || 'Download graph screenshot'} onClick={() => void takeScreenshot()}>Screenshot</button>
        <button type="button" onClick={recolorVisibleFrs}>Recolor</button>
      </div>
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {screenshotStatus}
      </span>
    </div>
  )
}
