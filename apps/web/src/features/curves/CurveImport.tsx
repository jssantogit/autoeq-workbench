import { CoreError, parseCurveText, type CurveKind } from '@autoeq-workbench/core'
import { useRef, useState, type ChangeEvent } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

export function CurveImport() {
  const addCurve = useWorkspaceStore((state) => state.addCurve)
  const registerCurve = useUiStore((state) => state.registerCurve)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingKindRef = useRef<CurveKind | null>(null)
  const requestRef = useRef(0)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function chooseKind(kind: CurveKind): void {
    pendingKindRef.current = kind
    setChooserOpen(false)
    inputRef.current?.click()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const kind = pendingKindRef.current
    const input = event.currentTarget
    pendingKindRef.current = null

    if (file === undefined || kind === null) {
      input.value = ''
      return
    }

    const request = ++requestRef.current

    try {
      const text = await file.text()
      const parsed = parseCurveText(text, { name: file.name, kind })
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
      <button
        type="button"
        className="curve-import__trigger"
        aria-expanded={chooserOpen}
        onClick={() => setChooserOpen((open) => !open)}
      >
        Import FR / Target
      </button>
      {chooserOpen && (
        <div className="curve-import__chooser" role="group" aria-label="Curve type">
          <button type="button" onClick={() => chooseKind('fr')}>FR</button>
          <button type="button" onClick={() => chooseKind('target')}>Target</button>
        </div>
      )}
      <input
        ref={inputRef}
        className="curve-import__input"
        aria-label="Curve file"
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        onChange={handleFile}
      />
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
