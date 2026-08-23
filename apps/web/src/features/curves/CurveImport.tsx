import { CoreError, parseCurveText } from '@autoeq-workbench/core'
import { useRef, useState, type ChangeEvent } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface CurveImportProps {
  role: 'source' | 'target'
}

export function CurveImport({ role }: CurveImportProps) {
  const curve = useWorkspaceStore((state) => state[role])
  const setCurve = useWorkspaceStore((state) =>
    role === 'source' ? state.setSource : state.setTarget,
  )
  const assignFreshCurveColor = useUiStore((state) => state.assignFreshCurveColor)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const label = role === 'source' ? 'Source' : 'Target'

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const input = event.currentTarget
    const request = ++requestRef.current

    try {
      const text = await file.text()
      const parsed = parseCurveText(text, { name: file.name, role })
      if (request !== requestRef.current) return
      setCurve(parsed)
      assignFreshCurveColor(role)
      setError(null)
    } catch (cause) {
      if (request !== requestRef.current) return
      const category = cause instanceof CoreError ? cause.category : 'parse'
      const message = cause instanceof Error ? cause.message : 'Unable to read curve file'
      setError(`[${category}] ${message}`)
    } finally {
      if (request === requestRef.current) input.value = ''
    }
  }

  return (
    <div className="curve-import">
      <div className="curve-import__heading">
        <h3 id={`${role}-import-heading`}>{label}</h3>
        <span className={curve === null ? 'curve-status' : 'curve-status curve-status--loaded'}>
          {curve === null ? 'Not loaded' : 'Loaded'}
        </span>
      </div>
      <p className="curve-import__name">{curve?.name ?? `No ${label.toLowerCase()} curve`}</p>
      <label className="file-control">
        <span>
          {curve === null ? 'Import' : 'Replace'} {label} curve
        </span>
        <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleFile} />
      </label>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
