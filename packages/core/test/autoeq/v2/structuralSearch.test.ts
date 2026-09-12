import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  resolveStandardAutoEqV2Config,
} from '../../../src/index.js'
import {
  MAX10_BASELINE_PRESET,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  generateStructuralMutations,
  localPolishEvaluationBudget,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  selectResidualFeatures,
  selectShelfEvidence,
} from '../../../src/autoeq/v2/structuralSearch.js'

const frequencies = [
  50, 60, 70,
  200, 300, 400,
  800, 1_000, 1_300,
  4_000, 5_000, 6_000,
  7_000, 8_000, 9_000,
  10_000, 12_000, 15_000,
] as const

const localizedResidual = [
  0.05, 0.8, 0.05,
  0.05, -0.9, 0.05,
  0.05, 1.0, 0.05,
  0.05, -4.0, 0.05,
  3.5, 0.05, 0.05,
  -3.0, 0.05, 3.2,
] as const

describe('Experimental Max10 structural search', () => {
  it('keeps the baseline policy intact while enabling semantic deterministic policy experimentally', () => {
    expect(resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET })).toMatchObject({
      featureRegionCount: 1,
      minFeatureSeparationOctaves: 0,
      candidatePolicy: 'legacy',
      selectionMetric: 'hypot',
      admission: 'lexical',
    })
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    })).toMatchObject({
      featureRegionCount: 6,
      minFeatureSeparationOctaves: 0.5,
      candidatePolicy: 'semantic',
      selectionMetric: 'violation',
      admission: 'metric',
    })
  })

  it('selects independent internal residual features without treating either endpoint as a peak', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const features = selectResidualFeatures(
      frequencies,
      localizedResidual,
      bounds,
      6,
      0.5,
      false,
    )

    const selectedFrequencies = features.map((feature) => feature.frequencyHz)
    expect(selectedFrequencies).toContain(60)
    expect(selectedFrequencies).toContain(300)
    expect(selectedFrequencies).toContain(1_000)
    expect(selectedFrequencies).toContain(5_000)
    expect(selectedFrequencies).toContain(10_000)
    expect(selectedFrequencies).not.toContain(15_000)
    expect(selectedFrequencies).not.toContain(50)
  })

  it('does not create a high shelf from an isolated 20 kHz edge spike', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const edgeSpike = frequencies.map(() => 0.05)
    edgeSpike[edgeSpike.length - 1] = 3

    expect(selectShelfEvidence(frequencies, edgeSpike, bounds)).toEqual([])
  })

  it('creates a shelf only when residual evidence is sustained across the edge region', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const shelfFrequencies = [
      20, 30, 45, 70, 110, 170, 260, 400, 620,
      960, 1_500, 2_300, 3_600, 5_600, 8_700, 13_500, 18_000, 20_000,
    ]
    const lowShelfResidual = [
      1, 1, 1, 0.9, 0.8, 0.4, 0.2, 0.1, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
    ]

    const shelves = selectShelfEvidence(shelfFrequencies, lowShelfResidual, bounds)
    expect(shelves).toHaveLength(1)
    expect(shelves[0]).toMatchObject({ type: 'LS' })
    expect(shelves[0]!.frequencyHz).toBeGreaterThan(20)
    expect(shelves[0]!.frequencyHz).toBeLessThan(620)
  })

  it('generates PK additions for local features without manufacturing LS/HS from those peaks', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const proposals = generateStructuralMutations(
      [],
      localizedResidual,
      frequencies,
      bounds,
      6,
      0.5,
      'semantic',
    )
    const additions = proposals.filter((proposal) => proposal.mutation.startsWith('add-'))

    expect(additions.length).toBeGreaterThanOrEqual(5)
    expect(additions.every((proposal) => proposal.mutation === 'add-pk')).toBe(true)
    expect(additions.flatMap((proposal) => proposal.filters).some(
      (filter) => filter.frequencyHz === 15_000,
    )).toBe(false)
  })

  it('does not allow PK to mutate into a shelf or a shelf to split without fresh edge evidence', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const pk = {
      id: 'pk',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 1_000,
      gainDb: 1,
      q: 1,
    }
    const hs = {
      id: 'hs',
      enabled: true,
      type: 'HS' as const,
      frequencyHz: 8_000,
      gainDb: -1,
      q: 0.7,
    }

    const fromPk = generateStructuralMutations(
      [pk], localizedResidual, frequencies, bounds, 6, 0.5, 'semantic',
    )
    expect(fromPk.some((proposal) => proposal.mutation === 'type-mutation')).toBe(false)

    const fromShelf = generateStructuralMutations(
      [hs], localizedResidual, frequencies, bounds, 6, 0.5, 'semantic',
    )
    const typeMutation = fromShelf.find((proposal) => proposal.mutation === 'type-mutation')
    expect(typeMutation?.filters.some((filter) => filter.type === 'PK')).toBe(true)
    expect(fromShelf.some((proposal) => proposal.mutation === 'split')).toBe(false)
  })

  it('scales local polish budget with filter count instead of staying fixed at 24 trials', () => {
    expect(localPolishEvaluationBudget(24, 0)).toBe(24)
    expect(localPolishEvaluationBudget(24, 3)).toBe(24)
    expect(localPolishEvaluationBudget(24, 4)).toBe(32)
    expect(localPolishEvaluationBudget(24, 7)).toBe(56)
    expect(localPolishEvaluationBudget(24, 10)).toBe(80)
  })

  it('returns bit-for-bit identical filters for repeated deterministic searches', () => {
    const config = {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      }),
      maxFilters: 3,
      beamWidth: 2,
      proposalsPerParent: 4,
    }
    const input = {
      desiredDb: [...localizedResidual],
      frequencies: [...frequencies],
      sampleRateHz: 48_000,
      config,
      deadline: { isExpired: () => false },
      seedFilters: [],
    }

    const first = runStructuralSearch(input)
    const second = runStructuralSearch(input)

    expect(second).toEqual(first)
  })
})
