export function safeFilenameBase(name: string): string {
  return Array.from(name, (character) =>
    character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character,
  ).join('')
}

export function getExportFilenameBase(
  name: string | null | undefined,
  fallback = 'Workbench',
): string {
  const sanitized = safeFilenameBase(name ?? fallback).replace(/_+/g, '_').trim()
  const withoutLeadingTrailingUnderscore = sanitized.replace(/^_+|_+$/g, '')
  if (!withoutLeadingTrailingUnderscore) {
    return fallback
  }
  return safeFilenameBase(name ?? fallback).trim() || fallback
}

interface FilterExportFilenameContext {
  activeFrName: string | null | undefined
  filterProvenance: 'manual' | 'autoeq' | null
  autoEqRun: { manifest: { sourceName: string; targetName: string } } | null
}

export function getFilterExportFilenameBase({
  activeFrName,
  filterProvenance,
  autoEqRun,
}: FilterExportFilenameContext): string {
  if (filterProvenance === 'autoeq' && autoEqRun !== null) {
    const sourceName = getExportFilenameBase(autoEqRun.manifest.sourceName)
    const targetName = getExportFilenameBase(autoEqRun.manifest.targetName)
    return `${sourceName} - [${targetName}]`
  }
  return `${getExportFilenameBase(activeFrName)} - [EQ]`
}

export function safePowerampPresetName(
  name: string | null | undefined,
  fallback = 'Workbench',
): string {
  const collapsed = Array.from(name ?? fallback, (character) =>
    character.charCodeAt(0) < 32 ? ' ' : character,
  )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return collapsed || fallback
}
