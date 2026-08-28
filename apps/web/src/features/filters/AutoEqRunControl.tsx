import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { cancelAutoEq, runAutoEq } from '../../state/autoeqController'
import { useAutoEqRunStore } from '../../state/autoeqRunStore'

function formatElapsed(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function AutoEqRunControl({ disabled }: { disabled: boolean }) {
  const status = useAutoEqRunStore((state) => state.status)
  const startedAtMs = useAutoEqRunStore((state) => state.startedAtMs)
  const [nowMs, setNowMs] = useState(() => performance.now())

  useEffect(() => {
    if (status !== 'running') return
    const interval = window.setInterval(() => setNowMs(performance.now()), 250)
    return () => window.clearInterval(interval)
  }, [status, startedAtMs])

  if (status !== 'running' || startedAtMs === null) {
    return <Button className="autoeq" disabled={disabled} onClick={() => void runAutoEq()}>AutoEQ</Button>
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000))
  return (
    <div className="autoeq-run-control">
      <span className="autoeq-run-status" role="status" aria-label="AutoEQ running">
        <span className="autoeq-run-spinner" aria-hidden="true" />
        {formatElapsed(elapsedSeconds)}
      </span>
      <Button className="autoeq autoeq--running" onClick={cancelAutoEq}>Cancel</Button>
    </div>
  )
}
