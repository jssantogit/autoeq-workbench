import type { RunManifest } from '@autoeq-workbench/core'

export interface AutoEqRunRecord {
  manifest: RunManifest
}

export function cloneAutoEqRunRecord(record: AutoEqRunRecord | null): AutoEqRunRecord | null {
  return record === null ? null : structuredClone(record)
}
