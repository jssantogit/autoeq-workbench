import {
  calculatePreampDb,
  CoreError,
  formatEqualizerApoFilters,
  formatGraphicEq,
  formatPowerampText,
  MVP_NUMERIC_POLICY,
  parseEqualizerApoFilters,
} from '@autoeq-workbench/core'
import { type ChangeEvent, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import { useWorkspaceStore } from '../../state/workspaceStore'

export type ExportDestination = 'Equalizer APO' | 'Poweramp' | 'Wavelet'

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
  const [destination, setDestination] = useState<ExportDestination>('Equalizer APO')
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

  function exportFilters() {
    try {
      const preampDb = calculatePreampDb(filters, MVP_NUMERIC_POLICY.sampleRateHz).preampDb
      if (destination === 'Equalizer APO') {
        downloadTextFile(
          `${filenameBase} Equalizer APO.txt`,
          formatEqualizerApoFilters(filters, preampDb),
        )
      } else if (destination === 'Poweramp') {
        downloadTextFile(
          `${filenameBase} Poweramp.txt`,
          formatPowerampText({
            name: activeFrName ?? 'Workbench',
            preampDb,
            filters,
          }),
        )
      } else if (destination === 'Wavelet') {
        downloadTextFile(
          `${filenameBase} Wavelet GraphicEQ.txt`,
          formatGraphicEq(filters, MVP_NUMERIC_POLICY.sampleRateHz),
        )
      }
      setError(null)
    } catch (cause) {
      const category = cause instanceof CoreError ? cause.category : 'export'
      const message = cause instanceof Error ? cause.message : 'Unable to export filters'
      setError(`[${category}] ${message}`)
    }
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
      <select
        aria-label="Export format"
        value={destination}
        onChange={(event) => setDestination(event.target.value as ExportDestination)}
      >
        <option value="Equalizer APO">Equalizer APO</option>
        <option value="Poweramp">Poweramp</option>
        <option value="Wavelet">Wavelet</option>
      </select>
      <Button className="export-filters" disabled={!hasFilters} onClick={exportFilters}>Export</Button>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
    </>
  )
}
