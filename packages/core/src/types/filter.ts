export type FilterType = 'PK' | 'LS' | 'HS'

export interface Filter {
  id: string
  enabled: boolean
  type: FilterType
  frequencyHz: number
  gainDb: number
  q: number
}
