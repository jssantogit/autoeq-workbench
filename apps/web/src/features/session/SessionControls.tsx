import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/ui/Button'
import {
  createWorkbenchSessionFromWorkspace,
  importWorkbenchSession,
  serializeWorkbenchSession,
} from '../../session/workbenchSession'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { useWorkspaceStore, workspaceStore } from '../../state/workspaceStore'

function safeFilenameBase(name: string): string {
  return Array.from(name, (character) =>
    character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character,
  ).join('')
}

export function SessionControls() {
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const [error, setError] = useState<string | null>(null)

  const activeFrName = curves.find((curve) => curve.id === activeFrId && curve.kind === 'fr')?.name
  const filenameBase = safeFilenameBase(activeFrName ?? 'Workbench').trim() || 'Workbench'

  function exportSession() {
    try {
      const session = createWorkbenchSessionFromWorkspace(workspaceStore.getState())
      const serialized = serializeWorkbenchSession(session)
      downloadTextFile(`${filenameBase}.autoeq-workbench.json`, serialized)
      setError(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to export session'
      setError(message)
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const input = event.currentTarget
    const request = ++requestRef.current

    try {
      const text = await file.text()
      if (request !== requestRef.current) return
      importWorkbenchSession(text)
      setError(null)
    } catch (cause) {
      if (request !== requestRef.current) return
      const message = cause instanceof Error ? cause.message : 'Unable to import session'
      setError(message)
    } finally {
      if (request === requestRef.current) input.value = ''
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
