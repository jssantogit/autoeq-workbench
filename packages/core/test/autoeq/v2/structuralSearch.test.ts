import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  cascadeMagnitudeDb,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
} from '../../../src/index.js'
import {
  MAX10_BASELINE_PRESET,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  generateStructuralMutations,
  localPolishEvaluationBudget,
  pruneMarginalFilter,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  selectResidualFeatures,
  selectShelfEvidence,
  simplifyStructuralState,
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
      mergeProximityOctaves: 1 / 12,
      marginalPruneTolerance: 0,
      structuralCleanupMinFilters: 10,
      structuralCleanupMaxSteps: 0,
      admission: 'lexical',
    })
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    })).toMatchObject({
      featureRegionCount: 6,
      minFeatureSeparationOctaves: 0.5,
      candidatePolicy: 'semantic',
      selectionMetric: 'violation',
      mergeProximityOctaves: 1 / 12 + 0.002,
      marginalPruneTolerance: 0.01,
      structuralCleanupMinFilters: 8,
      structuralCleanupMaxSteps: 3,
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

  it('merges split siblings after small quantization/refinement drift only in the experimental tolerance', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const nearSplitPair = [
      {
        id: 'left',
        enabled: true,
        type: 'PK' as const,
        frequencyHz: 1_191,
        gainDb: 0.7,
        q: 1.1,
      },
      {
        id: 'right',
        enabled: true,
        type: 'PK' as const,
        frequencyHz: 1_262,
        gainDb: 0.7,
        q: 1.1,
      },
    ]

    const baseline = generateStructuralMutations(
      nearSplitPair,
      localizedResidual,
      frequencies,
      bounds,
      6,
      0.5,
      'semantic',
      1 / 12,
    )
    const experimental = generateStructuralMutations(
      nearSplitPair,
      localizedResidual,
      frequencies,
      bounds,
      6,
      0.5,
      'semantic',
      1 / 12 + 0.002,
    )

    expect(baseline.some((proposal) => proposal.mutation === 'merge')).toBe(false)
    expect(experimental.some((proposal) => proposal.mutation === 'merge')).toBe(true)
  })

  it('prunes a truly redundant slot but preserves a small filter with measurable contribution', () => {
    const testFrequencies = [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000]
    const main = {
      id: 'main',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 1_000,
      gainDb: 2,
      q: 1,
    }
    const redundant = {
      id: 'redundant',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 100,
      gainDb: 0,
      q: 0.7,
    }
    const smallButUseful = {
      id: 'small',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 100,
      gainDb: 0.1,
      q: 0.7,
    }

    const desiredWithoutSmall = cascadeMagnitudeDb([main], testFrequencies, 48_000)
    const redundantSolution = evaluateV2Solution(
      [main, redundant],
      desiredWithoutSmall,
      testFrequencies,
      48_000,
    )
    const redundantState = {
      candidateId: 'redundant-state',
      filters: redundantSolution.filters,
      rmseDb: redundantSolution.metrics.rmseDb,
      maxAbsDb: redundantSolution.metrics.maxAbsDb,
      cancellationScore: redundantSolution.cancellationAudit.totalScore,
    }
    const pruned = pruneMarginalFilter(
      redundantState,
      desiredWithoutSmall,
      testFrequencies,
      48_000,
      0.01,
    )
    expect(pruned.filters.map((filter) => filter.id)).toEqual(['main'])

    const desiredWithSmall = cascadeMagnitudeDb(
      [main, smallButUseful],
      testFrequencies,
      48_000,
    )
    const usefulSolution = evaluateV2Solution(
      [main, smallButUseful],
      desiredWithSmall,
      testFrequencies,
      48_000,
    )
    const usefulState = {
      candidateId: 'useful-state',
      filters: usefulSolution.filters,
      rmseDb: usefulSolution.metrics.rmseDb,
      maxAbsDb: usefulSolution.metrics.maxAbsDb,
      cancellationScore: usefulSolution.cancellationAudit.totalScore,
    }
    const preserved = pruneMarginalFilter(
      usefulState,
      desiredWithSmall,
      testFrequencies,
      48_000,
      0.01,
    )
    expect(preserved.filters).toHaveLength(2)
  })

  it('can merge and prune more than one redundant structural slot within one cumulative tolerance budget', () => {
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const testFrequencies = [
      200, 400, 800, 1_000, 1_100, 1_191, 1_226, 1_262, 1_400, 2_000, 4_000, 8_000,
    ]
    const main = {
      id: 'main',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 4_000,
      gainDb: -2,
      q: 1.4,
    }
    const left = {
      id: 'left',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 1_191,
      gainDb: 0.7,
      q: 1.1,
    }
    const right = {
      id: 'right',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 1_262,
      gainDb: 0.7,
      q: 1.1,
    }
    const redundant = {
      id: 'redundant',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: 97,
      gainDb: 0,
      q: 0.7,
    }
    const mergedIdeal = {
      id: 'merged-ideal',
      enabled: true,
      type: 'PK' as const,
      frequencyHz: Math.sqrt(1_191 * 1_262),
      gainDb: 1.4,
      q: 1.1,
    }

    const desired = cascadeMagnitudeDb([main, mergedIdeal], testFrequencies, 48_000)
    const initialSolution = evaluateV2Solution(
      [main, left, right, redundant],
      desired,
      testFrequencies,
      48_000,
    )
    const initialState = {
      candidateId: 'cleanup-state',
      filters: initialSolution.filters,
      rmseDb: initialSolution.metrics.rmseDb,
      maxAbsDb: initialSolution.metrics.maxAbsDb,
      cancellationScore: initialSolution.cancellationAudit.totalScore,
    }

    const simplified = simplifyStructuralState(
      initialState,
      desired,
      testFrequencies,
      48_000,
      bounds,
      1 / 12 + 0.002,
      0.01,
      3,
    )

    expect(simplified.filters).toHaveLength(2)
    expect(simplified.filters.some((filter) => filter.id === 'main')).toBe(true)
    expect(simplified.filters.some((filter) => filter.id === 'redundant')).toBe(false)
    expect(simplified.filters.some((filter) => filter.id === 'left')).toBe(false)
    expect(simplified.filters.some((filter) => filter.id === 'right')).toBe(false)
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
      maxFilters: 2,
      beamWidth: 2,
      proposalsPerParent: 4,
    }
    const run = () => {
      let deadlineChecks = 0
      return runStructuralSearch({
        desiredDb: [...localizedResidual],
        frequencies: [...frequencies],
        sampleRateHz: 48_000,
        config,
        deadline: { isExpired: () => ++deadlineChecks > 500 },
        seedFilters: [],
      })
    }

    const first = run()
    const second = run()

    expect(second).toEqual(first)
  })
})
