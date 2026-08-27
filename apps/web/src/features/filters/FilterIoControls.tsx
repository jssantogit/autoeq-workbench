import {
  calculatePreampDb,
  CoreError,
  formatEqualizerApoFilters,
  formatGraphicEq,
  formatPowerampText,
  MVP_NUMERIC_POLICY,
  parseEqualizerApoFilters,
} from '@autoeq-workbench/core'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { downloadTextFile } from '../../squiglink/eq-io/downloadTextFile'
import {
  getExportFilenameBase,
  safePowerampPresetName,
} from '../../squiglink/eq-io/exportSanitizers'
import { useWorkspaceStore } from '../../state/workspaceStore'

export type ExportDestination = 'Equalizer APO' | 'Poweramp' | 'Wavelet'

export function FilterIoControls() {
  const curves = useWorkspaceStore((state) => state.curves)
  const activeFrId = useWorkspaceStore((state) => state.activeFrId)
  const filters = useWorkspaceStore((state) => state.filters)
  const replaceFilters = useWorkspaceStore((state) => state.replaceFiltersFromImport)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const isMountedRef = useRef(true)
  const [destination, setDestination] = useState<ExportDestination>('Equalizer APO')
  const [error, setError] = useState<string | null>(null)
  const activeFrName = curves.find((curve) => curve.id === activeFrId && curve.kind === 'fr')?.name
  const filenameBase = getExportFilenameBase(activeFrName)
  const powerampPresetName = safePowerampPresetName(activeFrName)
  const hasFilters = filters.length > 0

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const input = event.currentTarget
    input.value = ''
    if (file === undefined) return
    const request = ++requestRef.current

    try {
      const text = await file.text()
      const parsed = parseEqualizerApoFilters(text)
      if (request !== requestRef.current || !isMountedRef.current) return
      replaceFilters(parsed)
      setError(null)
    } catch (cause) {
      if (request !== requestRef.current || !isMountedRef.current) return
      if (cause instanceof CoreError) {
        setError(`[${cause.category}] ${cause.message}`)
      } else {
        setError('Unable to read filter file')
      }
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
            name: powerampPresetName,
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
      if (cause instanceof CoreError) {
        setError(`[${cause.category}] ${cause.message}`)
      } else {
        setError('Unable to export filters')
      }
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
