import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  generateV2Candidates,
  rankV2CandidateShortlist,
  resolveStandardAutoEqV2Config,
  type Filter,
  type V2FilterCandidate,
} from '../../../src/index.js'

const frequencies = [100, 150, 220, 330, 500, 750, 1_000, 1_500, 2_200, 3_300, 5_000]
const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)

describe('Standard v2 candidates', () => {
  it('uses canonical extrema and the approved PK Q scales', () => {
    const residualDb = [0, 0.1, 0.4, 1, 3, 1, 0.4, 0.1, 0, 0, 0]
    const candidates = generateV2Candidates({
      frequencies,
      residualDb,
      config,
      boundaryMode: 'sign-crossing',
    })
      .filter((candidate) => candidate.type === 'PK' && candidate.featureIndex === 4)

    expect(candidates.map((candidate) => candidate.frequencyHz)).toEqual([500, 500, 500])
    expect(candidates.map((candidate) => candidate.qScale)).toEqual([0.5, 1, 2])
    expect(candidates.map((candidate) => candidate.gainDb)).toEqual([3, 3, 3])
  })

  it('keeps each search attempt on exactly one selected boundary geometry', () => {
    const evaluationFrequencies = createEvaluationGrid()
    const denseFilters: Filter[] = [
      { id: '', enabled: true, type: 'PK', frequencyHz: 6_200, gainDb: 2.6, q: 4 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 8_100, gainDb: -3.2, q: 5 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 10_400, gainDb: 2.5, q: 4.2 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 13_600, gainDb: -2.2, q: 3.5 },
      { id: '', enabled: true, type: 'PK', frequencyHz: 17_000, gainDb: 1.6, q: 2.5 },
    ]
    const anchorDb = cascadeMagnitudeDb(denseFilters, [500], config.sampleRateHz)[0]!
    const residualDb = cascadeMagnitudeDb(
      denseFilters,
      evaluationFrequencies,
      config.sampleRateHz,
    ).map((value) => value - anchorDb)
    for (const boundaryMode of ['sign-crossing', 'half-height'] as const) {
      const candidates = generateV2Candidates({
        frequencies: evaluationFrequencies,
        residualDb,
        config,
        boundaryMode,
      })
      const lowFeature = candidates.filter((candidate) =>
        candidate.type === 'PK' && candidate.frequencyHz > 6_000 && candidate.frequencyHz < 6_400)
      const nextFeature = candidates.filter((candidate) =>
        candidate.type === 'PK' && candidate.frequencyHz > 8_000 && candidate.frequencyHz < 8_300)

      expect(lowFeature).toHaveLength(3)
      expect(nextFeature).toHaveLength(3)
      expect(candidates.every((candidate) => Number.isFinite(candidate.cheapScore))).toBe(true)
      expect(new Set(candidates
        .filter((candidate) => candidate.type === 'PK')
        .map((candidate) => candidate.boundaryMode))).toEqual(new Set([boundaryMode]))
      expect(rankV2CandidateShortlist(candidates)
        .filter((candidate) => candidate.type === 'PK')
        .every((candidate) => candidate.boundaryMode === boundaryMode)).toBe(true)
    }
  })

  it('makes both approved geometries compete only in the mixed fallback', () => {
    const residualDb = [0, 0.1, 0.4, 1, 3, 1, 0.4, 0.1, 0, 0, 0]
    const candidates = generateV2Candidates({
      frequencies,
      residualDb,
      config,
      boundaryMode: 'mixed',
    }).filter((candidate) => candidate.type === 'PK' && candidate.featureIndex === 4)

    expect(candidates).toHaveLength(6)
    expect(new Set(candidates.map(({ boundaryMode }) => boundaryMode))).toEqual(new Set([
      'sign-crossing',
      'half-height',
    ]))
    expect(new Set(rankV2CandidateShortlist(candidates)
      .map(({ boundaryMode }) => boundaryMode))).toEqual(new Set([
        'sign-crossing',
        'half-height',
      ]))
  })

  it('does not generate candidates below the residual floor', () => {
    expect(generateV2Candidates({
      frequencies,
      residualDb: frequencies.map(() => 0.149),
      config,
      boundaryMode: 'sign-crossing',
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
      boundaryMode: 'sign-crossing',
    })

    expect(candidates.filter((candidate) => candidate.type !== 'PK')).toEqual([])
    expect(generateV2Candidates({
      frequencies,
      residualDb: [4, 4, 4, 4, 3, 2.5, 2, 1, 0.5, 0.1, 0],
      config,
      boundaryMode: 'sign-crossing',
    }).filter((candidate) => candidate.type === 'LS').every((candidate) => candidate.q === 0.7))
      .toBe(true)
  })

  it('finds broad contiguous edge evidence when an opposite interior feature contaminates the outer quarter', () => {
    const edgeFrequencies = [
      100, 150, 220, 330, 500, 750, 1_000, 1_500, 2_200, 3_300,
      4_500, 5_500, 6_500, 7_500, 8_000, 10_000, 12_000, 16_000, 20_000,
    ]
    const residualDb = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 2, 1, -1, -1.5, -1.5,
    ]

    const highShelves = generateV2Candidates({
      frequencies: edgeFrequencies,
      residualDb,
      config,
      boundaryMode: 'half-height',
    }).filter((candidate) => candidate.type === 'HS')

    expect(highShelves).toHaveLength(1)
    expect(highShelves[0]).toMatchObject({ gainDb: -1.5, q: 0.7 })
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

  it('admits the strongest candidate from each material feature before filling by energy', () => {
    const dominantFeature: V2FilterCandidate[] = Array.from({ length: 8 }, (_, index) => ({
      type: 'PK',
      frequencyHz: 1_000 + index,
      gainDb: 4,
      q: 1 + index / 10,
      featureIndex: 10,
      qScale: 1,
      cheapScore: 100 - index,
    }))
    const secondFeature: V2FilterCandidate = {
      type: 'PK',
      frequencyHz: 3_891,
      gainDb: -3.1,
      q: 11,
      featureIndex: 20,
      qScale: 2,
      cheapScore: 92,
    }
    const candidates = [...dominantFeature, secondFeature]

    const shortlist = rankV2CandidateShortlist(candidates)
    const reversed = rankV2CandidateShortlist([...candidates].reverse())

    expect(shortlist).toHaveLength(8)
    expect(shortlist).toContain(secondFeature)
    expect(shortlist.filter(({ featureIndex }) => featureIndex === 20)).toEqual([secondFeature])
    expect(reversed).toEqual(shortlist)
  })
})
