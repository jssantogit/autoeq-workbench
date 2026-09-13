import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  buildDeliverableV2,
  compressDeliverableV2,
  evaluateV2Solution,
  isV2TargetAchieved,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../../src/index.js'

const frequencies = [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000]
const deadline = { isExpired: () => false }
const filter = (id: string, frequencyHz: number, gainDb: number): Filter => ({
  id, enabled: true, type: 'PK', frequencyHz, gainDb, q: 2,
})

describe('Standard v2 deliverables', () => {
  it('always builds a quantized checkpoint inside the delivered filter cap', () => {
    const config = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 1 })
    const result = buildDeliverableV2({
      filters: [filter('a', 1_000.4, 2.04), filter('b', 2_000.4, -1.96)],
      desiredDb: frequencies.map(() => 0),
      frequencies,
      config,
      deadline,
    })

    expect(result.filters.length).toBeLessThanOrEqual(1)
    expect(result.filters.map(({ id }, index) => id === `autoeq-${index + 1}`))
      .not.toContain(false)
    for (const delivered of result.filters) {
      expect(delivered.frequencyHz % 1).toBe(0)
      expect(Number.isInteger(delivered.gainDb * 10)).toBe(true)
    }
  })

  it('removes a redundant filter but preserves an irreducible target-achieved cascade', () => {
    const config = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 2 })
    const desiredSingle = filter('desired', 1_000, 4)
    const singleDb = evaluateV2Solution([desiredSingle], [], frequencies, 48_000).cascadeDb
    const redundant = buildDeliverableV2({
      filters: [filter('a', 1_000, 2), filter('b', 1_000, 2)],
      desiredDb: singleDb,
      frequencies,
      config,
      deadline,
    })
    const compressed = compressDeliverableV2({
      deliverable: redundant, desiredDb: singleDb, frequencies, config, deadline,
    })
    expect(compressed.deliverable.filters).toHaveLength(1)
    expect(isV2TargetAchieved(compressed.deliverable.metrics)).toBe(true)

    const desiredPair = [filter('low', 200, 4), filter('high', 5_000, -4)]
    const pairDb = evaluateV2Solution(desiredPair, [], frequencies, 48_000).cascadeDb
    const irreducible = buildDeliverableV2({
      filters: desiredPair, desiredDb: pairDb, frequencies, config, deadline,
    })
    const kept = compressDeliverableV2({
      deliverable: irreducible, desiredDb: pairDb, frequencies, config, deadline,
    })
    expect(kept.deliverable.filters).toHaveLength(2)
    expect(kept.completed).toBe(true)
  })

  it('keeps the last complete deliverable when the deadline expires during removal refinement', () => {
    const config = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 2 })
    const desired = filter('desired', 1_000, 4)
    const desiredDb = evaluateV2Solution([desired], [], frequencies, 48_000).cascadeDb
    const solution = evaluateV2Solution(
      [filter('a', 1_000, 4), filter('b', 1_000, 0.1)],
      desiredDb,
      frequencies,
      48_000,
    )
    const original = { ...solution, preampDb: -4.1 }
    let checks = 0

    const compressed = compressDeliverableV2({
      deliverable: original,
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => ++checks >= 5 },
    })

    expect(compressed).toMatchObject({ completed: false, expired: true })
    expect(compressed.deliverable).toBe(original)
  })

  it('returns the prior checkpoint when discrete delivery work crosses the deadline', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const desiredDb = evaluateV2Solution(
      [filter('desired', config.minFrequencyHz + 1, 2)],
      [],
      frequencies,
      config.sampleRateHz,
    ).cascadeDb
    const fallbackOnExpiration = buildDeliverableV2({
      filters: [], desiredDb, frequencies, config, deadline,
    })
    let checks = 0

    const result = buildDeliverableV2({
      filters: [filter('start', config.minFrequencyHz, 2)],
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => ++checks > 3 },
      fallbackOnExpiration,
    })

    expect(result).toBe(fallbackOnExpiration)
  })

  it('does not start preamp work when final delivered-cascade scoring crosses the deadline', () => {
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const desiredDb = frequencies.map(() => 1)
    const fallbackOnExpiration = buildDeliverableV2({
      filters: [], desiredDb, frequencies, config, deadline,
    })
    let checks = 0

    const result = buildDeliverableV2({
      filters: [],
      desiredDb,
      frequencies,
      config,
      deadline: { isExpired: () => ++checks > 4 },
      fallbackOnExpiration,
    })

    expect(result).toBe(fallbackOnExpiration)
  })
})
