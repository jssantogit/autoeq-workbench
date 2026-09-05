import { describe, expect, it } from 'vitest'

import {
  createStandardV2Deadline,
  createStandardV2DeadlineWindow,
} from '../../../src/index.js'

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

  it('reserves finalization time without moving the hard deadline or recapturing start', () => {
    let now = 1_000
    let startReads = 0
    const runtime = {
      nowMs: () => {
        startReads += 1
        return now
      },
    }
    const deadlines = createStandardV2DeadlineWindow(runtime, 5, 100)

    expect(startReads).toBe(1)
    now = 5_899
    expect(deadlines.explorationDeadline.isExpired()).toBe(false)
    expect(deadlines.hardDeadline.isExpired()).toBe(false)
    now = 5_900
    expect(deadlines.explorationDeadline.isExpired()).toBe(true)
    expect(deadlines.hardDeadline.isExpired()).toBe(false)
    now = 6_000
    expect(deadlines.hardDeadline.isExpired()).toBe(true)
  })
})
