import { CoreError } from '@autoeq-workbench/core'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import {
  createWorkbenchSessionFromWorkspace,
  importWorkbenchSession,
  serializeWorkbenchSession,
} from '../../session/workbenchSession'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { getExportFilenameBase } from '../../squiglink/eq-io/exportSanitizers'
import { useWorkspaceStore, workspaceStore } from '../../state/workspaceStore'

function getSessionErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof CoreError) {
    return `[${cause.category}] ${cause.message}`
  }
  if (cause instanceof Error && cause.message.startsWith('Invalid Workbench session')) {
    return cause.message
  }
  return fallback
}

export function SessionControls() {
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const isMountedRef = useRef(true)
  const [error, setError] = useState<string | null>(null)

  const activeFrName = curves.find((curve) => curve.id === activeFrId && curve.kind === 'fr')?.name
  const filenameBase = getExportFilenameBase(activeFrName)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  function exportSession() {
    try {
      const session = createWorkbenchSessionFromWorkspace(workspaceStore.getState())
      const serialized = serializeWorkbenchSession(session)
      downloadTextFile(`${filenameBase}.autoeq-workbench.json`, serialized)
      setError(null)
    } catch (cause) {
      setError(getSessionErrorMessage(cause, 'Unable to export session'))
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const input = event.currentTarget
    input.value = ''
    if (file === undefined) return
    const request = ++requestRef.current

    try {
      const text = await file.text()
      if (request !== requestRef.current || !isMountedRef.current) return
      importWorkbenchSession(text)
      setError(null)
    } catch (cause) {
      if (request !== requestRef.current || !isMountedRef.current) return
      setError(getSessionErrorMessage(cause, 'Unable to import session'))
    }
  }

  return (
    <section className="tools-section session-controls" aria-labelledby="session-heading">
      <h3 id="session-heading">Session</h3>
      <input
        ref={inputRef}
        hidden
        aria-label="Import Workbench session"
        type="file"
        accept=".autoeq-workbench.json,.json,application/json"
        onChange={handleFile}
      />
      <div className="session-controls__actions">
        <Button className="button export-session" onClick={exportSession}>
          Export Session
        </Button>
        <Button className="button import-session" onClick={() => inputRef.current?.click()}>
          Import Session
        </Button>
      </div>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
