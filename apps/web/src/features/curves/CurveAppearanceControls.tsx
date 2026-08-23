import { useUiStore } from '../../state/uiStore'

interface CurveAppearanceControlsProps {
  role: 'source' | 'target'
}

export function CurveAppearanceControls({ role }: CurveAppearanceControlsProps) {
  const color = useUiStore((state) => state[`${role}Color`])
  const visible = useUiStore((state) => state[`${role}Visible`])
  const targetPresentation = useUiStore((state) => state.targetPresentation)
  const setCurveColor = useUiStore((state) => state.setCurveColor)
  const setCurveVisible = useUiStore((state) => state.setCurveVisible)
  const setTargetPresentation = useUiStore((state) => state.setTargetPresentation)
  const label = role === 'source' ? 'Source' : 'Target'

  return (
    <div className="curve-appearance" aria-label={`${label} graph appearance`}>
      {role === 'target' && (
        <fieldset className="curve-presentation">
          <legend>Target type</legend>
          <label>
            <input
              type="radio"
              name="target-presentation"
              checked={targetPresentation === 'measurement'}
              onChange={() => setTargetPresentation('measurement')}
            />
            <span>Measurement FR</span>
          </label>
          <label>
            <input
              type="radio"
              name="target-presentation"
              checked={targetPresentation === 'reference'}
              onChange={() => setTargetPresentation('reference')}
            />
            <span>Reference target</span>
          </label>
        </fieldset>
      )}
      <div className="curve-appearance__row">
        <label className="visibility-control">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setCurveVisible(role, event.target.checked)}
          />
          <span>Show {label} curve</span>
        </label>
        <label className="color-control">
          <span>{label} curve color</span>
          <input
            type="color"
            value={color}
            onChange={(event) => setCurveColor(role, event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
