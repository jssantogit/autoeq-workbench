import type { RunManifest } from '@autoeq-workbench/core'

export interface AutoEqRunRecord {
  manifest: RunManifest
}

export function cloneAutoEqRunRecord(
  record: AutoEqRunRecord | { readonly manifest: unknown } | null | undefined,
): AutoEqRunRecord | null {
  return !record ? null : structuredClone(record as AutoEqRunRecord)
}
