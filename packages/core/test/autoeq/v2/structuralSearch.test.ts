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
  type StructuralProposal,
  type StructuralSearchM3TelemetryEvent,
} from '../../../src/autoeq/v2/structuralSearch.js'
import type { Filter } from '../../../src/types/filter.js'

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
      admission: 'q31-b4-p8',
      workProfile: 'full',
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

  it('uses the deterministic short work profile only for the 5 second budget', () => {
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 5,
    }).workProfile).toBe('short-5s')
  })

  it.each([15, 30, 60, 120])(
    'uses the full work profile for a %i second budget',
    (timeLimitSeconds) => {
      expect(resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds,
      }).workProfile).toBe('full')
    },
  )

  it('defaults to the full work profile when no time budget is provided', () => {
    expect(resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }).workProfile).toBe('full')
  })

  it('emits opt-in phase telemetry without changing deterministic search output', () => {
    const config = {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      }),
      maxFilters: 2,
      beamWidth: 2,
      proposalsPerParent: 4,
    }

    const run = (withTrace: boolean) => {
      let deadlineChecks = 0
      const events: Array<{ type: string; phase?: string; reason?: string }> = []
      const result = runStructuralSearch({
        desiredDb: [...localizedResidual],
        frequencies: [...frequencies],
        sampleRateHz: 48_000,
        config,
        deadline: { isExpired: () => ++deadlineChecks > 500 },
        seedFilters: [],
        onTrace: withTrace ? (event) => events.push(event) : undefined,
      })
      return { result, events }
    }

    const plain = run(false)
    const traced = run(true)

    expect(traced.result).toEqual(plain.result)
    expect(traced.events[0]?.type).toBe('start')
    expect(traced.events.some((event) => event.type === 'beam-generation')).toBe(true)
    expect(traced.events.some(
      (event) => event.type === 'phase' && event.phase === 'rescue',
    )).toBe(true)
  })

  it('emits completed ordinary baseline structural telemetry without changing the result', () => {
    const config = {
      ...resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }),
      maxFilters: 2,
      beamWidth: 2,
      proposalsPerParent: 4,
    }
    const run = (observe: boolean) => {
      let deadlineChecks = 0
      const events: StructuralSearchM3TelemetryEvent[] = []
      const traceEvents: unknown[] = []
      const result = runStructuralSearch({
        desiredDb: [...localizedResidual],
        frequencies: [...frequencies],
        sampleRateHz: 48_000,
        config,
        deadline: { isExpired: () => ++deadlineChecks > 500 },
        seedFilters: [],
        onBaselineTelemetry: observe ? (event) => events.push(event) : undefined,
        onTrace: (event) => traceEvents.push(event),
      })
      return { result, events, traceEvents }
    }

    const plain = run(false)
    const observed = run(true)
    expect(observed.result).toEqual(plain.result)
    expect(observed.traceEvents).toEqual(plain.traceEvents)
    expect(observed.events.length).toBeGreaterThan(0)
    const generation = observed.events[0]!
    expect(generation.type).toBe('ordinary-baseline-generation')
    expect(generation.referenceSignature).toEqual(expect.any(String))
    expect(generation.retainedBeamSignatures).toEqual(expect.any(Array))
    expect(generation.generatedStructuralSignatures).toEqual(expect.any(Array))
    expect(generation.admittedStructuralSignatures).toEqual(expect.any(Array))
    expect(generation.survivingStructuralSignatures).toEqual(expect.any(Array))
    expect(generation.signals).toEqual(expect.objectContaining({
      S0: expect.any(Boolean),
      S1: expect.any(Boolean),
      S2: expect.any(Boolean),
      S3: expect.any(Boolean),
      S4: expect.any(Boolean),
    }))
    for (const event of observed.events) {
      expect(event.signals.S0).toBe(event.unresolved && !event.numericReferenceImprovement)
      expect(event.signals.S1).toBe(event.unresolved && !event.referenceSignatureChanged)
      expect(event.signals.S2).toBe(event.unresolved && !event.retainedBeamSignatureSetChanged)
      expect(event.signals.S3).toBe(event.unresolved && !event.newlyGeneratedStructuralSignatureSurvived)
      expect(event.signals.S4).toBe(event.unresolved && !event.referenceSignatureChanged && !event.newlyGeneratedStructuralSignatureSurvived)
    }
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

describe('capacity-pressure trace accounting', () => {
  it('counts only existing capacity gates and preserves search output', () => {
    const config = {
      ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
      maxFilters: 3,
      beamWidth: 1,
      proposalsPerParent: 1,
    }
    const run = (observe: boolean) => {
      let checks = 0
      const pressure = {
        additiveProposalsGenerated: 0,
        additiveMutationGatesBlockedByCapacity: 0,
        rescueAddGatesBlockedByCapacity: 0,
        pairAddGatesBlockedByCapacity: 0,
      }
      const result = runStructuralSearch({
        desiredDb: [...localizedResidual], frequencies: [...frequencies], sampleRateHz: 48_000,
        config, deadline: { isExpired: () => ++checks > 500 },
        seedFilters: [
          { id: 'a', enabled: true, type: 'PK', frequencyHz: 200, gainDb: 1, q: 1 },
          { id: 'b', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -1, q: 1 },
          { id: 'c', enabled: true, type: 'PK', frequencyHz: 5_000, gainDb: 1, q: 1 },
        ],
        onTrace: observe ? (event) => {
          const delta = event.capacityPressure
          if (delta !== undefined) {
            pressure.additiveProposalsGenerated += delta.additiveProposalsGenerated
            pressure.additiveMutationGatesBlockedByCapacity += delta.additiveMutationGatesBlockedByCapacity
            pressure.rescueAddGatesBlockedByCapacity += delta.rescueAddGatesBlockedByCapacity
            pressure.pairAddGatesBlockedByCapacity += delta.pairAddGatesBlockedByCapacity
          }
        } : undefined,
      })
      return { result, pressure }
    }
    const plain = run(false)
    const observed = run(true)
    expect(observed.result).toEqual(plain.result)
    expect(observed.pressure.additiveProposalsGenerated).toBeGreaterThan(0)
    expect(observed.pressure.additiveMutationGatesBlockedByCapacity).toBeGreaterThan(0)
    expect(observed.pressure.rescueAddGatesBlockedByCapacity).toBeGreaterThanOrEqual(0)
    expect(observed.pressure.pairAddGatesBlockedByCapacity).toBeGreaterThanOrEqual(0)
  })

  it('keeps capacity-blocked counters zero below an irregular ceiling', () => {
    const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 17 })
    const proposals = generateStructuralMutations([], localizedResidual, frequencies, bounds, 1, 0, 'legacy')
    expect(proposals.some((proposal) => proposal.filters.length > 0)).toBe(true)
    // This direct generation path has no capacity gate at all; duplicate/quality
    // handling occurs later and therefore cannot fabricate pressure.
    expect(proposals.every((proposal) => proposal.filters.length <= 17)).toBe(true)
  })
})

describe('structural-search-vnext primitives', () => {
  it('uses an ID-independent coarse structural signature', async () => {
    const { structuralSignature } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    expect(structuralSignature([
      { id: 'first', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 },
    ], bounds, 6)).toBe(structuralSignature([
      { id: 'second', enabled: true, type: 'PK', frequencyHz: 1_010, gainDb: -4, q: 8 },
    ], bounds, 6))
  })

  it('keeps multi-filter structural signatures independent of order and IDs', async () => {
    const { structuralSignature } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const first = [
      { id: 'left-a', enabled: true, type: 'PK' as const, frequencyHz: 220, gainDb: 4, q: 1 },
      { id: 'shelf-a', enabled: true, type: 'HS' as const, frequencyHz: 8_000, gainDb: -2, q: 0.7 },
      { id: 'right-a', enabled: true, type: 'PK' as const, frequencyHz: 8_500, gainDb: 1, q: 4 },
    ]
    const reordered = [
      { ...first[2]!, id: 'right-b', gainDb: -8 },
      { ...first[0]!, id: 'left-b', frequencyHz: 230 },
      { ...first[1]!, id: 'shelf-b', q: 3 },
    ]
    expect(structuralSignature(first, bounds, 6)).toBe(structuralSignature(reordered, bounds, 6))
  })

  it('does not emit the M3 baseline callback for experimental policies', async () => {
    const { runStructuralSearchVNext } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const events: unknown[] = []
    let checks = 0
    runStructuralSearchVNext({
      desiredDb: [...localizedResidual],
      frequencies: [...frequencies],
      sampleRateHz: 48_000,
      config: { ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }), maxFilters: 2 },
      deadline: { isExpired: () => ++checks > 20 },
      onBaselineTelemetry: (event) => events.push(event),
    })
    expect(events).toEqual([])
  })

  it('retains a viable distinct signature within a fixed beam width deterministically', async () => {
    const { retainDiverseStructuralBeam } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const bounds = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const states = [
      { candidateId: 'a', filters: [{ id: 'a', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 1, q: 1 }], rmseDb: 0.4, maxAbsDb: 1, cancellationScore: 0 },
      { candidateId: 'b', filters: [{ id: 'b', enabled: true, type: 'PK' as const, frequencyHz: 1_010, gainDb: 2, q: 2 }], rmseDb: 0.41, maxAbsDb: 1.01, cancellationScore: 0 },
      { candidateId: 'c', filters: [{ id: 'c', enabled: true, type: 'HS' as const, frequencyHz: 8_000, gainDb: 1, q: 0.7 }], rmseDb: 0.45, maxAbsDb: 1.1, cancellationScore: 0 },
    ]
    const retained = retainDiverseStructuralBeam(states, 2, bounds, 6)
    expect(retained).toHaveLength(2)
    expect(retained.map((state: { candidateId: string }) => state.candidateId)).toEqual(['a', 'c'])
  })
})

  it('keeps the supplied incumbent or improves it through bounded VNext replacement', async () => {
    const { runStructuralSearchVNext } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const config = { ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }), maxFilters: 3, proposalsPerParent: 3 }
    let checks = 0
    const result = runStructuralSearchVNext({
      desiredDb: [...localizedResidual], frequencies: [...frequencies], sampleRateHz: 48_000,
      config, deadline: { isExpired: () => ++checks > 2_000 },
      seedFilters: [{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 60, gainDb: 0.8, q: 1 }],
    })
    const start = evaluateV2Solution([{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 60, gainDb: 0.75, q: 1 }], localizedResidual, frequencies, 48_000)
    expect(Math.max(result.rmseDb / 0.25, result.maxAbsDb / 0.75)).toBeLessThanOrEqual(
      Math.max(start.metrics.rmseDb / 0.25, start.metrics.maxAbsDb / 0.75) + 1e-12,
    )
    expect(result.filters.length).toBeLessThanOrEqual(config.maxFilters)
  })

it('exposes the VNext runner as an explicit core research selector', async () => {
  const core = await import('../../../src/index.js')
  expect(typeof core.runStructuralSearchVNext).toBe('function')
})

it('exposes the protected-progress M2 runner as an explicit core research selector', async () => {
  const core = await import('../../../src/index.js')
  expect(typeof core.runStructuralSearchVNextM2).toBe('function')
})

describe('VNext identity hardening', () => {
  it('uses multiset structural difference independently of canonical order and IDs', async () => {
    const { structuralFilterDifference } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const hs = { id: 'hs', enabled: true, type: 'HS' as const, frequencyHz: 12_000, gainDb: 2, q: 0.7 }
    const pk = { id: 'new-pk', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: -3, q: 2 }
    const diff = structuralFilterDifference([hs], [pk, { ...hs, id: 'other' }])
    expect(diff.added).toEqual([pk])
    expect(diff.removed).toEqual([])
  })

  it('consumes structurally identical duplicates as a multiset', async () => {
    const { structuralFilterDifference } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const pk = { id: 'a', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 1, q: 1 }
    const diff = structuralFilterDifference([pk, { ...pk, id: 'b' }], [{ ...pk, id: 'c' }])
    expect(diff.added).toEqual([])
    expect(diff.removed).toHaveLength(1)
  })
})

it('reports bounded VNext diversity telemetry inside beam generations', async () => {
  const { runStructuralSearchVNext } = await import('../../../src/autoeq/v2/structuralSearch.js')
  const events: Array<Record<string, unknown>> = []
  let checks = 0
  runStructuralSearchVNext({ desiredDb: [...localizedResidual], frequencies: [...frequencies], sampleRateHz: 48_000,
    config: { ...resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }), maxFilters: 2 },
    deadline: { isExpired: () => ++checks > 400 }, onTrace: event => events.push(event as unknown as Record<string, unknown>) })
  const beam = events.find(event => event.type === 'beam-generation')!
  expect(typeof beam.structuralSignaturesGenerated).toBe('number')
  expect(typeof beam.structuralSignaturesAdmitted).toBe('number')
})

describe('VNext pre-benchmark correctness mechanisms', () => {
  it('keeps frozen baseline q31 admission intact when its cooperative deadline expires during scoring', () => {
    const events: Array<Record<string, unknown>> = []
    let checks = 0
    runStructuralSearch({
      desiredDb: [...localizedResidual], frequencies: [...frequencies], sampleRateHz: 48_000,
      config: { ...resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }), admission: 'q31-b4-p8' },
      deadline: { isExpired: () => ++checks >= 3 },
      onTrace: event => events.push(event as unknown as Record<string, unknown>),
    })
    const generation = events.find(event => event.type === 'beam-generation')!
    expect(generation.generatedProposals).toBeGreaterThan(0)
    // Locked pre-VNext q31 fixture: full scoring selects its one unique
    // candidate even though the subsequent polish boundary is expired.
    expect(generation.admittedProposals).toBe(1)
    expect(generation.polishedProposals).toBe(0)
  })

  it('preserves explicit phase provenance only when a phase improves the incumbent', async () => {
    const { updateStructuralIncumbentProvenance } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const initial = { candidateId: 'initial', filters: [], rmseDb: 2, maxAbsDb: 2, cancellationScore: 0 }
    const replacement = { ...initial, candidateId: 'replacement', rmseDb: 1.5 }
    const beamOnly = { ...initial, candidateId: 'beam', rmseDb: 1.75 }
    const replacementWinner = updateStructuralIncumbentProvenance(
      { state: initial, phase: 'beam' }, replacement, 'vnext-replacement',
    )
    expect(replacementWinner.phase).toBe('vnext-replacement')
    expect(updateStructuralIncumbentProvenance(replacementWinner, beamOnly, 'beam').phase).toBe('vnext-replacement')
    const rescued = { ...initial, candidateId: 'rescued', rmseDb: 1 }
    expect(updateStructuralIncumbentProvenance(replacementWinner, rescued, 'rescue').phase).toBe('rescue')
    expect(updateStructuralIncumbentProvenance({ state: initial, phase: 'beam' }, initial, 'pair-add').phase).toBe('beam')
  })

  it('annotates only the unambiguous additive candidate and retains non-additive proposals', async () => {
    const { createRegionAwareCandidatePool } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 })
    const hs: Filter = { id: 'hs-parent', enabled: true, type: 'HS', frequencyHz: 12_000, gainDb: 2, q: 0.7 }
    const ls: Filter = { id: 'ls-parent', enabled: true, type: 'LS', frequencyHz: 100, gainDb: -1, q: 0.7 }
    const existingPk: Filter = { id: 'pk-parent', enabled: true, type: 'PK', frequencyHz: 900, gainDb: 1, q: 1 }
    const addedPk: Filter = { id: 'new-pk', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: -3, q: 2 }
    const parent = [hs, ls, existingPk]
    const proposals: StructuralProposal[] = [
      { mutation: 'add-pk', filters: [addedPk, hs, ls, existingPk] },
      { mutation: 'remove', filters: [hs, ls] },
      { mutation: 'type-mutation', filters: [hs, ls, { ...existingPk, type: 'HS' }] },
      { mutation: 'split', filters: [hs, ls, { ...existingPk, id: 'split-a', gainDb: 0.5 }, { ...existingPk, id: 'split-b', frequencyHz: 950, gainDb: 0.5 }] },
      { mutation: 'merge', filters: [hs, { ...ls, id: 'merged', frequencyHz: 300, gainDb: 0 }] },
    ]
    const pool = createRegionAwareCandidatePool(parent, [-3, -3, -3], [100, 1_000, 12_000], bounds, 3, proposals.length, proposals)
    const additive = pool.find(entry => entry.proposal.mutation === 'add-pk')!
    expect(additive.metadata?.filterType).toBe('PK')
    expect(additive.metadata?.sign).toBe(-1)
    expect(additive.candidateFilter?.frequencyHz).toBe(1_000)
    for (const mutation of ['remove', 'type-mutation', 'split', 'merge'] as const) {
      const entry = pool.find(candidate => candidate.proposal.mutation === mutation)!
      expect(entry.metadata).toBeUndefined()
      expect(entry.candidateFilter).toBeUndefined()
    }
  })

  it('reports one coherent q31 VNext pool and bounded diversity telemetry before any benchmark', async () => {
    const { runStructuralSearchVNext } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const { resolveScalableEffortConfig } = await import('../../../src/autoeq/v2/scalableStructuralSearch.js')
    const events: Array<Record<string, unknown>> = []
    let checks = 0
    const config = resolveScalableEffortConfig(
      resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, timeLimitSeconds: 30 }),
      10,
      6,
    )
    runStructuralSearchVNext({
      desiredDb: [4, -4, 4, -4, 4, -4],
      frequencies: [40, 100, 250, 630, 1_600, 10_000],
      sampleRateHz: 48_000,
      config,
      deadline: { isExpired: () => ++checks > 300 },
      onTrace: event => events.push(event as unknown as Record<string, unknown>),
    })
    const generation = events.find(event => event.type === 'beam-generation')!
    const generatedFamilies = generation.candidateSourceCounts as Record<string, number>
    expect(Object.values(generatedFamilies).reduce((sum, count) => sum + count, 0)).toBe(generation.generatedProposals)
    expect(generation.admittedProposals).toBeLessThanOrEqual(config.proposalsPerParent)
    expect(typeof generation.residualRegionsAdmitted).toBe('number')
    expect(typeof generation.structuralSignaturesRetained).toBe('number')
    expect(typeof generation.bestImprovementPhase).toBe('string')
  })
})

describe('M2 protected-progress mechanism gate', () => {
  const runWithCheckpointDeadline = (
    runner: (input: Parameters<typeof runStructuralSearch>[0]) => ReturnType<typeof runStructuralSearch>,
    config: ReturnType<typeof resolveStructuralSearchConfig>,
  ) => {
    let expired = false
    const events: Array<Record<string, unknown>> = []
    const result = runner({
      desiredDb: [...localizedResidual],
      frequencies: [...frequencies],
      sampleRateHz: 48_000,
      config: { ...config, maxFilters: 3, proposalsPerParent: 1 },
      deadline: { isExpired: () => expired },
      onTrace: (event) => {
        events.push(event as unknown as Record<string, unknown>)
        if (event.type === 'beam-generation' && event.generation === 1) expired = true
      },
    })
    return { result, events }
  }

  it('matches baseline ordinary output and emits zero experimental work when no stall intervention is reached', async () => {
    const { runStructuralSearchVNextM2 } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const config = resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET })
    const baseline = runWithCheckpointDeadline(runStructuralSearch, config)
    const m2 = runWithCheckpointDeadline(runStructuralSearchVNextM2, config)

    expect(m2.result).toEqual(baseline.result)
    expect(m2.events.some((event) => event.phase === 'm2-challenger')).toBe(false)
    const start = m2.events.find((event) => event.type === 'start')!
    const generation = m2.events.find((event) => event.type === 'beam-generation' && event.generation === 0)!
    expect(generation.nextStates).toBeGreaterThan(0)
    expect(generation.violation as number).toBeLessThan(start.violation as number)
    expect(generation.stallEvents).toBe(0)
    expect(generation.ordinaryProposalsGenerated).toBe(generation.generatedProposals)
    expect(generation.ordinaryProposalsAdmitted).toBe(generation.admittedProposals)
    expect(generation.ordinaryProposalsPolished).toBe(generation.polishedProposals)
  })

  it('constructs at most one residual challenger only after a completed ordinary stall and resumes ordinary progression', async () => {
    const { runStructuralSearchVNextM2 } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const config = {
      ...resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }),
      maxFilters: 3,
      proposalsPerParent: 0,
    }
    let stopAfterResume = false
    const events: Array<Record<string, unknown>> = []
    runStructuralSearchVNextM2({
      desiredDb: [...localizedResidual],
      frequencies: [...frequencies],
      sampleRateHz: 48_000,
      config,
      seedFilters: [{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 200, gainDb: 0, q: 1 }],
      deadline: { isExpired: () => stopAfterResume },
      onTrace: (event) => {
        events.push(event as unknown as Record<string, unknown>)
        if (event.type === 'beam-generation' && event.generation === 1) stopAfterResume = true
      },
    })

    const stall = events.find((event) => event.type === 'beam-generation' && event.stallEvents === 1)!
    const interventionIndex = events.findIndex((event) => event.phase === 'm2-challenger')
    const stallIndex = events.indexOf(stall)
    expect(interventionIndex).toBeGreaterThan(stallIndex)
    const intervention = events[interventionIndex]!
    expect(intervention.challengerCandidatesConstructed).toBeLessThanOrEqual(1)
    expect(intervention.challengerPolishAttempts).toBeLessThanOrEqual(1)
    expect(intervention.challengerAcceptedIntoBeam).toBeLessThanOrEqual(1)
    expect(intervention.challengerCandidatesConstructed).toBe(1)
    expect(intervention.challengerAcceptedIntoBeam).toBe(1)
    expect(intervention.challengerIncumbentImprovements).toBe(1)
    expect((intervention.frontierMax as number)).toBeLessThanOrEqual(config.beamWidth)

    const resumed = events.find((event) => event.type === 'beam-generation' && event.generation === 1)!
    expect(resumed.ordinaryBeamGenerations).toBe(1)
    expect(resumed.challengerCandidatesConstructed).toBeUndefined()
    expect(events.filter((event) => event.phase === 'm2-challenger')).toHaveLength(1)
  })

  it('uses no extra beam capacity and performs no challenger work after deadline expiry', async () => {
    const { runStructuralSearchVNextM2 } = await import('../../../src/autoeq/v2/structuralSearch.js')
    const config = {
      ...resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }),
      maxFilters: 3,
      proposalsPerParent: 0,
    }
    let expired = false
    const events: Array<Record<string, unknown>> = []
    runStructuralSearchVNextM2({
      desiredDb: [...localizedResidual],
      frequencies: [...frequencies],
      sampleRateHz: 48_000,
      config,
      seedFilters: [{ id: 'seed', enabled: true, type: 'PK', frequencyHz: 200, gainDb: 0, q: 1 }],
      deadline: { isExpired: () => expired },
      onTrace: (event) => {
        events.push(event as unknown as Record<string, unknown>)
        if (event.phase === 'm2-challenger') expired = true
      },
    })

    for (const event of events.filter((candidate) => candidate.type === 'beam-generation')) {
      expect(event.beamSize).toBeLessThanOrEqual(config.beamWidth)
      expect(event.frontierMax).toBeLessThanOrEqual(config.beamWidth)
    }
    const interventionIndex = events.findIndex((event) => event.phase === 'm2-challenger')
    expect(interventionIndex).toBeGreaterThanOrEqual(0)
    expect(events.slice(interventionIndex + 1).some((event) => event.type === 'beam-generation')).toBe(false)
    expect(events.slice(interventionIndex + 1).filter((event) => event.phase === 'rescue' || event.phase === 'pair-add' || event.phase === 'cap-swap')
      .every((event) => (event.attempts ?? 0) === 0 && (event.acceptedSteps ?? 0) === 0)).toBe(true)
  })
})
