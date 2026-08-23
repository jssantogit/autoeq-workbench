import { describe, expect, it } from 'vitest'

describe('core harness', () => {
  it('runs deterministic tests', () => {
    expect(20 * 1000).toBe(20000)
  })
})
