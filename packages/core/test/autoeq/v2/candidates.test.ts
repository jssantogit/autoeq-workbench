import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  generateV2Candidates,
  rankV2CandidateShortlist,
  resolveStandardAutoEqV2Config,
  type V2FilterCandidate,
} from '../../../src/index.js'

const frequencies = [100, 150, 220, 330, 500, 750, 1_000, 1_500, 2_200, 3_300, 5_000]
const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)

describe('Standard v2 candidates', () => {
  it('uses canonical extrema and the approved PK Q scales', () => {
    const residualDb = [0, 0.1, 0.4, 1, 3, 1, 0.4, 0.1, 0, 0, 0]
    const candidates = generateV2Candidates({ frequencies, residualDb, config })
      .filter((candidate) => candidate.type === 'PK' && candidate.featureIndex === 4)

    expect(candidates.map((candidate) => candidate.frequencyHz)).toEqual([500, 500, 500])
    expect(candidates.map((candidate) => candidate.qScale)).toEqual([0.5, 1, 2])
    expect(candidates.map((candidate) => candidate.gainDb)).toEqual([3, 3, 3])
  })

  it('does not generate candidates below the residual floor', () => {
    expect(generateV2Candidates({
      frequencies,
      residualDb: frequencies.map(() => 0.149),
      config,
    })).toEqual([])
  })

  it('keeps shelf evidence inside the effective fit interval and shelf Q at 0.7', () => {
    const narrowed = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      minFrequencyHz: 500,
      maxFrequencyHz: 2_200,
    })
    const candidates = generateV2Candidates({
      frequencies,
      residualDb: [4, 4, 4, 4, 0, 0, 0, 0, 0, 4, 4],
      config: narrowed,
    })

    expect(candidates.filter((candidate) => candidate.type !== 'PK')).toEqual([])
    expect(generateV2Candidates({
      frequencies,
      residualDb: [4, 4, 4, 4, 3, 2.5, 2, 1, 0.5, 0.1, 0],
      config,
    }).filter((candidate) => candidate.type === 'LS').every((candidate) => candidate.q === 0.7))
      .toBe(true)
  })

  it('caps the exact shortlist at eight and resolves score ties stably', () => {
    const candidates: V2FilterCandidate[] = Array.from({ length: 12 }, (_, index) => ({
      type: index % 3 === 0 ? 'LS' : index % 3 === 1 ? 'PK' : 'HS',
      frequencyHz: 100 + (11 - index) * 10,
      gainDb: index % 2 === 0 ? 2 : -2,
      q: index % 3 === 1 ? 1 : 0.7,
      featureIndex: index,
      qScale: index % 3 === 1 ? 1 : null,
      cheapScore: 1,
    }))
    const shortlist = rankV2CandidateShortlist(candidates)

    expect(shortlist).toHaveLength(8)
    expect(shortlist.map((candidate) => candidate.frequencyHz)).toEqual([
      100, 110, 120, 130, 140, 150, 160, 170,
    ])
  })
})
