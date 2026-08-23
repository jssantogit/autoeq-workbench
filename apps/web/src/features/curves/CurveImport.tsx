import { CoreError, parseCurveText } from '@autoeq-workbench/core'
import { useRef, useState, type ChangeEvent } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurveImport() {
  const addCurve = useWorkspaceStore((state) => state.addCurve)
  const registerCurve = useUiStore((state) => state.registerCurve)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const input = event.currentTarget
    const request = ++requestRef.current

    try {
      const text = await file.text()
      const parsed = parseCurveText(text, { name: file.name, kind: 'fr' })
      if (request !== requestRef.current) return
      if (addCurve(parsed)) registerCurve(parsed.id)
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
      <label className="file-control">
        <span>+ Curve</span>
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
