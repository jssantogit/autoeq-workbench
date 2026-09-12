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
  selectQuotaProposals,
  selectResidualFeatures,
} from '../../../src/autoeq/v2/structuralSearch.js'

const frequencies = [
  50, 60, 70,
  200, 300, 400,
  800, 1_000, 1_300,
  4_000, 5_000, 6_000,
  7_000, 8_000, 9_000,
  10_000, 12_000, 15_000,
] as const

const residual = [
  0.1, 0.8, 0.1,
  0.1, -0.9, 0.1,
  0.1, 1.0, 0.1,
  0.2, -4.0, 0.2,
  3.5, 0.2, 0.1,
  -3.0, 0.2, 2.7,
] as const

describe('Experimental Max10 structural search', () => {
  it('keeps the baseline single-region behavior while enabling six separated regions experimentally', () => {
    expect(resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET })).toMatchObject({
      featureRegionCount: 1,
      minFeatureSeparationOctaves: 0,
    })
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    })).toMatchObject({
      featureRegionCount: 6,
      minFeatureSeparationOctaves: 0.5,
    })
  })

  it('selects residual features across the spectrum instead of tunneling into the strongest cluster', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const features = selectResidualFeatures(
      frequencies,
      residual,
      bounds,
      6,
      0.5,
    )

    expect(features).toHaveLength(6)
    const selectedFrequencies = features.map((feature) => feature.frequencyHz)
    expect(selectedFrequencies).toContain(60)
    expect(selectedFrequencies).toContain(300)
    expect(selectedFrequencies).toContain(1_000)
    expect(selectedFrequencies.some((frequencyHz) => frequencyHz >= 5_000)).toBe(true)
  })

  it('generates add proposals for multiple independent residual regions in one expansion', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const proposals = generateStructuralMutations(
      [],
      residual,
      frequencies,
      bounds,
      6,
      0.5,
    )
    const additions = proposals.filter((proposal) => proposal.mutation.startsWith('add-'))

    expect(additions).toHaveLength(18)
    const centerFrequencies = new Set(
      additions.flatMap((proposal) => proposal.filters.map((filter) => filter.frequencyHz)),
    )
    expect(centerFrequencies.has(60)).toBe(true)
    expect(centerFrequencies.has(300)).toBe(true)
    expect(centerFrequencies.has(1_000)).toBe(true)
  })

  it('scales local polish budget with filter count instead of staying fixed at 24 trials', () => {
    expect(localPolishEvaluationBudget(24, 0)).toBe(24)
    expect(localPolishEvaluationBudget(24, 3)).toBe(24)
    expect(localPolishEvaluationBudget(24, 4)).toBe(32)
    expect(localPolishEvaluationBudget(24, 7)).toBe(56)
    expect(localPolishEvaluationBudget(24, 10)).toBe(80)
  })

  it('reserves most experimental admissions for metric-ranked proposals', () => {
    const lexical = Array.from({ length: 10 }, (_, index) => ({
      key: `p-${index}`,
      proposal: { id: index },
    }))
    const rmseRanked = [...lexical].reverse()
    const selected = selectQuotaProposals(lexical, rmseRanked, 2, 6, 8)
    const keys = selected.map((item) => item.key)

    expect(keys.slice(0, 2)).toEqual(['p-0', 'p-1'])
    for (const key of ['p-9', 'p-8', 'p-7', 'p-6', 'p-5', 'p-4']) {
      expect(keys).toContain(key)
    }
  })
})
