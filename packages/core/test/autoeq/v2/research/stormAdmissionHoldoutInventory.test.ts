import { describe, expect, it } from 'vitest'

import {
  HOLDOUTS_PER_STRATUM,
  HOLDOUT_STRATA,
  PREVIOUSLY_OBSERVED_STORM_POLICY_IDS,
  buildStormHoldoutInventory,
} from '../../../../benchmarks/research/stormAdmissionHoldoutInventory.js'

function point(candidateId: string, filterCount: number, evaluationCount: number) {
  return {
    candidateId,
    evaluationCount,
    elapsedMs: evaluationCount,
    actualDeliveredFilterCount: filterCount,
    canonicalRmseDb: 1 + evaluationCount / 100,
    canonicalMaxAbsDb: 5 + evaluationCount / 100,
    referenceRegret: 1,
    referenceImproved: false,
    filters: Array.from({ length: filterCount }, (_, index) => ({ id: String(index) })),
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

  it('selects by first appearance within each stratum without reading policy outcomes', () => {
    const observed = PREVIOUSLY_OBSERVED_STORM_POLICY_IDS[0]
    const sameRun = {
      runs: [{
        problemId: 'titan-to-storm',
        algorithmId: 'matching-pursuit-v1',
        variantId: 'matching-pursuit-v1',
        progressTrace: [
          point(observed, 1, 1),
          point('low-b', 4, 4),
          point('low-a', 3, 3),
          point('mid-a', 5, 5),
          point('mid-b', 6, 6),
          point('high-a', 7, 7),
          point('high-b', 8, 8),
          point('full-a', 9, 9),
          point('full-b', 10, 10),
          point('low-a', 3, 30),
        ],
      }],
    }
    const report = buildStormHoldoutInventory(sameRun)
    expect(report.selected.map((candidate) => candidate.candidateId)).toEqual([
      'low-a', 'low-b',
      'mid-a', 'mid-b',
      'high-a', 'high-b',
      'full-a', 'full-b',
    ])
    expect(report.selected.some((candidate) => candidate.candidateId === observed)).toBe(false)
  })

  it('requires the exact frozen matching-pursuit-v1 Storm run', () => {
    expect(() => buildStormHoldoutInventory({ runs: [] })).toThrow(/matching-pursuit-v1 run is missing/)
  })
})
