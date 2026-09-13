import { describe, expect, it } from 'vitest'
import { fromSquiglinkFilterType, toSquiglinkFilterType } from './filterTypeAdapter'

describe('filterTypeAdapter', () => {
  it('maps canonical filter types to Squiglink labels', () => {
    expect(toSquiglinkFilterType('PK')).toBe('PK')
    expect(toSquiglinkFilterType('LS')).toBe('LSQ')
    expect(toSquiglinkFilterType('HS')).toBe('HSQ')
  })

  it('maps Squiglink labels back to canonical filter types', () => {
    expect(fromSquiglinkFilterType('PK')).toBe('PK')
    expect(fromSquiglinkFilterType('LSQ')).toBe('LS')
    expect(fromSquiglinkFilterType('HSQ')).toBe('HS')
  })
})
