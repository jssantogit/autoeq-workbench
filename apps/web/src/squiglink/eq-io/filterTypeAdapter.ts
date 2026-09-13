import type { FilterType } from '@autoeq-workbench/core'

export type SquiglinkFilterType = 'PK' | 'LSQ' | 'HSQ'

export function toSquiglinkFilterType(type: FilterType): SquiglinkFilterType {
  if (type === 'LS') return 'LSQ'
  if (type === 'HS') return 'HSQ'
  return 'PK'
}

export function fromSquiglinkFilterType(type: SquiglinkFilterType): FilterType {
  if (type === 'LSQ') return 'LS'
  if (type === 'HSQ') return 'HS'
  return 'PK'
}
