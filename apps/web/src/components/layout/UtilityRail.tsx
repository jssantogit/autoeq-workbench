import { CurveImport } from '../../features/curves/CurveImport'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function UtilityRail() {
  const curves = useWorkspaceStore((state) => state.curves)
  const normalization = useWorkspaceStore((state) => state.normalization)
  const setActiveDockTab = useUiStore((state) => state.setActiveDockTab)
  const source = curves.find(({ role }) => role === 'source')?.curve.name ?? 'None'
  const target = curves.find(({ role }) => role === 'target')?.curve.name ?? 'None'
  const normalizationLabel = `Normalize: ${normalization.anchorHz} Hz / ${normalization.targetDb} dB`

  function showNormalization() {
    setActiveDockTab('curves')
    const focusNormalization = () => document.getElementById('workspace-normalization')?.focus()
    if (window.requestAnimationFrame === undefined) window.setTimeout(focusNormalization, 0)
    else window.requestAnimationFrame(focusNormalization)
  }

  return (
    <div className="utility-rail utility-rail--nowrap" role="toolbar" aria-label="Workspace utilities">
      <CurveImport />
      <button className="utility-rail__action" type="button" onClick={showNormalization}>
        {normalizationLabel}
      </button>
      <span className="utility-rail__summary">Source: <strong>{source}</strong></span>
      <span className="utility-rail__summary">Target: <strong>{target}</strong></span>
    </div>
  )
}
