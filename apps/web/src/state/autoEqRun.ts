import type { RunManifest } from '@autoeq-workbench/core'

type DeepReadonly<T> = T extends (...args: readonly unknown[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

export interface AutoEqRunRecord {
  manifest: RunManifest
}

export type ReadonlyAutoEqRunRecord = DeepReadonly<AutoEqRunRecord>

export function cloneAutoEqRunRecord(
  record: AutoEqRunRecord | ReadonlyAutoEqRunRecord | null | undefined,
): AutoEqRunRecord | null {
  return !record ? null : structuredClone(record as AutoEqRunRecord)
}
