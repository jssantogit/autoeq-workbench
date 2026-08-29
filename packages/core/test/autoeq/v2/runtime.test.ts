import { describe, expect, it } from 'vitest'

import { createStandardV2Deadline } from '../../../src/index.js'

describe('Standard v2 deadline', () => {
  it('captures its start once and expires at the exact budget boundary', () => {
    let now = 1_000
    const deadline = createStandardV2Deadline({ nowMs: () => now }, 5)

    expect(deadline.isExpired()).toBe(false)
    now = 5_999
    expect(deadline.isExpired()).toBe(false)
    now = 6_000
    expect(deadline.isExpired()).toBe(true)
  })
})
