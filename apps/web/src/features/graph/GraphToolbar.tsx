import { Button } from '../../components/ui/Button'

interface GraphToolbarProps {
  onResetView: () => void
}

export function GraphToolbar({ onResetView }: GraphToolbarProps) {
  return (
    <div className="graph-toolbar" role="toolbar" aria-label="Graph actions">
      <Button onClick={onResetView}>Reset View</Button>
    </div>
  )
}
