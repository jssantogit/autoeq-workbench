import { CoreError, parseCurveText } from '@autoeq-workbench/core'
import { useState, type ChangeEvent } from 'react'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface CurveImportProps {
  role: 'source' | 'target'
}

export function CurveImport({ role }: CurveImportProps) {
  const curve = useWorkspaceStore((state) => state[role])
  const setCurve = useWorkspaceStore((state) =>
    role === 'source' ? state.setSource : state.setTarget,
  )
  const [error, setError] = useState<string | null>(null)
  const label = role === 'source' ? 'Source' : 'Target'

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined) return

    try {
      const text = await file.text()
      const parsed = parseCurveText(text, { name: file.name, role })
      setCurve(parsed)
      setError(null)
    } catch (cause) {
      const category = cause instanceof CoreError ? cause.category : 'parse'
      const message = cause instanceof Error ? cause.message : 'Unable to read curve file'
      setError(`[${category}] ${message}`)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="curve-import" aria-labelledby={`${role}-import-heading`}>
      <div className="curve-import__heading">
        <h3 id={`${role}-import-heading`}>{label}</h3>
        <span className={curve === null ? 'status status--empty' : 'status status--loaded'}>
          {curve === null ? 'Not loaded' : 'Loaded'}
        </span>
      </div>
      <p className="curve-import__name">{curve?.name ?? `No ${label.toLowerCase()} curve`}</p>
      <label className="file-control">
        <span>Import {label} curve</span>
        <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleFile} />
      </label>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
