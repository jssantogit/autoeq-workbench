import { describe, expect, it } from 'vitest'

import {
  HOLDOUTS_PER_STRATUM,
  HOLDOUT_STRATA,
  PREVIOUSLY_OBSERVED_STORM_POLICY_IDS,
  buildStormHoldoutInventory,
} from '../../../../benchmarks/research/stormAdmissionHoldoutInventory.js'

function seed(sourceId: string, filterCount: number) {
  return {
    sourceId,
    sourceKind: 'transfer',
    filters: Array.from({ length: filterCount }, (_, index) => ({ id: `${sourceId}-${index}` })),
  }
}

describe('Storm admission holdout inventory', () => {
  it('predeclares four filter-count strata and three states per stratum', () => {
    expect(HOLDOUT_STRATA.map((stratum) => stratum.id)).toEqual(['1-4', '5-6', '7-8', '9-10'])
    expect(HOLDOUTS_PER_STRATUM).toBe(3)
  })

  it('excludes every Storm state used by the previous validation campaign', () => {
    expect(PREVIOUSLY_OBSERVED_STORM_POLICY_IDS).toHaveLength(11)
    expect(PREVIOUSLY_OBSERVED_STORM_POLICY_IDS).toContain(
      'matching-pursuit-v1:titan-to-storm:0:sparse-0005',
    )
    expect(PREVIOUSLY_OBSERVED_STORM_POLICY_IDS).toContain(
      'matching-pursuit-v1:titan-to-storm:0:replacement-2-2572',
    )
  })

  it('selects lexicographically within strata without policy outcomes', () => {
    const observed = PREVIOUSLY_OBSERVED_STORM_POLICY_IDS[0]
    const bundle = {
      seeds: [
        seed(observed, 1),
        seed('low-b', 4),
        seed('low-a', 3),
        seed('mid-b', 6),
        seed('mid-a', 5),
        seed('high-b', 8),
        seed('high-a', 7),
        seed('full-b', 10),
        seed('full-a', 9),
      ],
    }
    const report = buildStormHoldoutInventory(bundle)
    expect(report.selected.map((candidate) => candidate.sourceId)).toEqual([
      'low-a', 'low-b',
      'mid-a', 'mid-b',
      'high-a', 'high-b',
      'full-a', 'full-b',
    ])
    expect(report.selected.some((candidate) => candidate.sourceId === observed)).toBe(false)
  })

  it('deduplicates exact filter payloads before selection', () => {
    const duplicate = seed('a', 5)
    const report = buildStormHoldoutInventory({
      seeds: [duplicate, { ...duplicate, sourceId: 'b' }],
    })
    expect(report.uniqueEligibleCandidates).toBe(1)
    expect(report.selectedCount).toBe(1)
  })

  it('requires a seed array', () => {
    expect(() => buildStormHoldoutInventory({})).toThrow(/seeds are missing/)
  })
})
