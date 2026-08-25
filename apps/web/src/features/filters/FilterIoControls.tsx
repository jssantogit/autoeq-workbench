import {
  calculatePreampDb,
  CoreError,
  formatEqualizerApoFilters,
  formatGraphicEq,
  MVP_NUMERIC_POLICY,
  parseEqualizerApoFilters,
} from '@autoeq-workbench/core'
import { type ChangeEvent, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { useWorkspaceStore } from '../../state/workspaceStore'

function safeFilenameBase(name: string): string {
  return Array.from(name, (character) =>
    character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character,
  ).join('')
}

export function FilterIoControls() {
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const filters = useWorkspaceStore((state) => state.filters)
  const replaceFilters = useWorkspaceStore((state) => state.replaceFiltersFromImport)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const activeFrName = curves.find((curve) => curve.id === activeFrId && curve.kind === 'fr')?.name
  const filenameBase = safeFilenameBase(activeFrName ?? 'Workbench').trim() || 'Workbench'
  const hasFilters = filters.length > 0

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const input = event.currentTarget
    const request = ++requestRef.current

    try {
      const text = await file.text()
      const parsed = parseEqualizerApoFilters(text)
      if (request !== requestRef.current) return
      replaceFilters(parsed)
      setError(null)
    } catch (cause) {
      if (request !== requestRef.current) return
      const category = cause instanceof CoreError ? cause.category : 'parse'
      const message = cause instanceof Error ? cause.message : 'Unable to read filter file'
      setError(`[${category}] ${message}`)
    } finally {
      if (request === requestRef.current) input.value = ''
    }
  }

  function exportPeq() {
    const preampDb = calculatePreampDb(filters, MVP_NUMERIC_POLICY.sampleRateHz).preampDb
    downloadTextFile(
      `${filenameBase} PEQ.txt`,
      formatEqualizerApoFilters(filters, preampDb),
    )
  }

  function exportGraphicEq() {
    downloadTextFile(
      `${filenameBase} Graphic EQ.txt`,
      formatGraphicEq(filters, MVP_NUMERIC_POLICY.sampleRateHz),
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        hidden
        aria-label="Import Equalizer APO filters"
        type="file"
        accept=".txt,text/plain"
        onChange={handleFile}
      />
      <Button className="import-filters" onClick={() => inputRef.current?.click()}>Import</Button>
      <Button className="export-filters" disabled={!hasFilters} onClick={exportPeq}>Export</Button>
      <Button className="export-graphic-filters" disabled={!hasFilters} onClick={exportGraphicEq}>
        Export Graphic EQ (For Wavelet)
      </Button>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
    </>
  )
}
