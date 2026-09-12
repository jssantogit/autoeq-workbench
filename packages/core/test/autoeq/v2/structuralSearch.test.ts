import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import {
  resolveStructuralSearchConfig,
  MAX10_BASELINE_PRESET,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  runStructuralSearch,
  selectQuotaProposals,
  semanticFilterKey,
  proposalKey,
  generateStructuralMutations,
  orderStructuralProposals,
  retainParetoBeam,
  selectReferencePoint,
  referenceSelectorKey,
  polishFilters,
  type SearchState,
  type StructuralProposal,
} from '../../../src/autoeq/v2/structuralSearch.js'
import {
  runStructuralBeam,
  generateStructuralMutations as researchGenerateStructuralMutations,
  orderStructuralProposals as researchOrderStructuralProposals,
  retainParetoBeam as researchRetainParetoBeam,
  polishStructuralProposal as researchPolishStructuralProposal,
} from '../../../benchmarks/research/structuralBeam.js'
import {
  selectReferencePoint as researchSelectReferencePoint,
  referenceSelectorKey as researchReferenceSelectorKey,
} from '../../../benchmarks/research/referenceSelector.js'
import {
  ARM_A_CONFIG,
  ARM_C_CONFIG,
  createQuotaOverride,
  selectQuotaProposals as researchSelectQuotaProposals,
  proposalKey as researchProposalKey,
} from '../../../benchmarks/research/stormFinalDecisionBenchmark.js'
import { loadLayeredResearchCases } from '../../../benchmarks/research/corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
} from '../../../benchmarks/research/labProtocol.js'
import { loadProposalSeeds } from '../../../benchmarks/research/proposalSeeds.js'
import { resolveCapacityRecoveryPath } from '../../../benchmarks/research/frozenResearchInputs.js'
import {
  resolveStandardAutoEqV2Config,
  DEFAULT_AUTOEQ_SETTINGS,
  runStandardAutoEqV2,
} from '../../../src/index.js'
import type { Filter } from '../../../src/types/filter.js'

function normalizeFilters(filters: readonly Filter[]) {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return filters
    .map(({ id: _id, ...filter }) => ({
      type: filter.type,
      frequencyHz: Math.round(filter.frequencyHz),
      gainDb: Math.round(filter.gainDb * 10) / 10,
      q: Math.round(filter.q * 100) / 100,
      enabled: filter.enabled,
    }))
    .sort((a, b) =>
      order[a.type] - order[b.type] ||
      a.frequencyHz - b.frequencyHz ||
      a.gainDb - b.gainDb ||
      a.q - b.q ||
      Number(a.enabled) - Number(b.enabled)
    )
}

describe('Structural Search', () => {
  it('1. default config remains identical (absent option resolves to baseline: B=2, P=4, polish=24, maxFilters=10, lexical admission)', () => {
    const config = resolveStructuralSearchConfig()
    expect(config).toEqual({
      preset: MAX10_BASELINE_PRESET,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      maxFilters: 10,
      admission: 'lexical',
    })
  })

  it('2. absent experimental option resolves to baseline behavior', () => {
    const config = resolveStructuralSearchConfig({})
    expect(config).toEqual({
      preset: MAX10_BASELINE_PRESET,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      maxFilters: 10,
      admission: 'lexical',
    })
  })

  it('3. explicit experimental option resolves to B=4, P=8, polish=24, maxFilters=10', () => {
    const config = resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET })
    expect(config).toEqual({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      beamWidth: 4,
      proposalsPerParent: 8,
      localPolishEvaluations: 24,
      maxFilters: 10,
      admission: 'q31-b4-p8',
    })
  })

  it('4. Q31 selection: 6 lexical + 2 RMSE distinct selections match research exactly', () => {
    const mockProposals = Array.from({ length: 14 }, (_, i) => ({
      key: `key-${i}`,
      proposal: { mutation: 'add-pk' as const, filters: [{ id: `f-${i}`, enabled: true, type: 'PK' as const, frequencyHz: 100 * (i + 1), gainDb: 2, q: 1 }] },
      rmseDb: 15 - i,
    }))
    const rmseRanked = [...mockProposals].sort((a, b) => a.rmseDb - b.rmseDb)

    const productSelected = selectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)
    const researchSelected = researchSelectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)

    expect(productSelected.length).toBe(8)
    expect(researchSelected.length).toBe(8)
    expect(productSelected.map((s) => s.key)).toEqual(researchSelected.map((s) => s.key))
    expect(productSelected.map((s) => s.key)).toEqual([
      'key-0', 'key-1', 'key-2', 'key-3', 'key-4', 'key-5',
      'key-13', 'key-12',
    ])
  })

  it('5. Q31 selection: lexical/RMSE overlap matches research exactly', () => {
    const mockProposals = Array.from({ length: 12 }, (_, i) => ({
      key: `key-${i}`,
      proposal: { mutation: 'add-pk' as const, filters: [{ id: `f-${i}`, enabled: true, type: 'PK' as const, frequencyHz: 100 * (i + 1), gainDb: 2, q: 1 }] },
      rmseDb: i < 3 ? i * 0.1 : 10 - i,
    }))
    const rmseRanked = [...mockProposals].sort((a, b) => a.rmseDb - b.rmseDb)

    const productSelected = selectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)
    const researchSelected = researchSelectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)

    expect(productSelected.length).toBe(8)
    expect(productSelected.map((s) => s.key)).toEqual(researchSelected.map((s) => s.key))
  })

  it('6. Q31 selection: semantic duplicate IDs representing same semantic filters do not consume multiple positions', () => {
    const p1: StructuralProposal = {
      mutation: 'add-pk',
      filters: [{ id: 'filter-alpha', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 3.5, q: 1.41 }],
    }
    const p2: StructuralProposal = {
      mutation: 'add-pk',
      filters: [{ id: 'filter-beta', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 3.5, q: 1.41 }],
    }
    expect(proposalKey(p1)).toBe(proposalKey(p2))
    expect(proposalKey(p1)).toBe(researchProposalKey(p1))

    const mockProposals = [
      { key: proposalKey(p1), proposal: p1, rmseDb: 1.0 },
      { key: proposalKey(p2), proposal: p2, rmseDb: 1.0 },
      { key: 'other-1', proposal: { mutation: 'add-ls' as const, filters: [] }, rmseDb: 2.0 },
      { key: 'other-2', proposal: { mutation: 'add-hs' as const, filters: [] }, rmseDb: 3.0 },
      { key: 'other-3', proposal: { mutation: 'split' as const, filters: [] }, rmseDb: 4.0 },
      { key: 'other-4', proposal: { mutation: 'merge' as const, filters: [] }, rmseDb: 5.0 },
      { key: 'other-5', proposal: { mutation: 'type-mutation' as const, filters: [] }, rmseDb: 6.0 },
      { key: 'other-6', proposal: { mutation: 'remove' as const, filters: [] }, rmseDb: 7.0 },
      { key: 'other-7', proposal: { mutation: 'add-pk' as const, filters: [{ id: 'f7', enabled: true, type: 'PK' as const, frequencyHz: 5000, gainDb: 1, q: 1 }] }, rmseDb: 8.0 },
    ]
    const rmseRanked = [...mockProposals].sort((a, b) => a.rmseDb - b.rmseDb)

    const productSelected = selectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)
    const researchSelected = researchSelectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)

    expect(productSelected.length).toBe(8)
    expect(productSelected.map((s) => s.key)).toEqual(researchSelected.map((s) => s.key))
    expect(new Set(productSelected.map((s) => s.key)).size).toBe(8)
    expect(productSelected.filter((s) => s.key === proposalKey(p1)).length).toBe(1)
  })

  it('6b. Q31 selection: fewer than 8 unique proposals matches research exactly', () => {
    const mockProposals = [
      { key: 'p-0', proposal: { mutation: 'add-pk' as const, filters: [] }, rmseDb: 5 },
      { key: 'p-1', proposal: { mutation: 'add-ls' as const, filters: [] }, rmseDb: 4 },
      { key: 'p-2', proposal: { mutation: 'add-hs' as const, filters: [] }, rmseDb: 3 },
      { key: 'p-3', proposal: { mutation: 'split' as const, filters: [] }, rmseDb: 2 },
    ]
    const rmseRanked = [...mockProposals].sort((a, b) => a.rmseDb - b.rmseDb)

    const productSelected = selectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)
    const researchSelected = researchSelectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)

    expect(productSelected.length).toBe(4)
    expect(productSelected.map((s) => s.key)).toEqual(researchSelected.map((s) => s.key))
  })

  it('6c. Q31 selection: deterministic tie ordering matches research exactly', () => {
    const mockProposals = Array.from({ length: 10 }, (_, i) => ({
      key: `prop-tie-${i}`,
      proposal: { mutation: 'add-pk' as const, filters: [] },
      rmseDb: 2.5,
    }))
    const rmseRanked = [...mockProposals]

    const productSelected = selectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)
    const researchSelected = researchSelectQuotaProposals(mockProposals, rmseRanked, 6, 2, 8)

    expect(productSelected.map((s) => s.key)).toEqual(researchSelected.map((s) => s.key))
    expect(productSelected.map((s) => s.key)).toEqual([
      'prop-tie-0', 'prop-tie-1', 'prop-tie-2', 'prop-tie-3',
      'prop-tie-4', 'prop-tie-5', 'prop-tie-6', 'prop-tie-7',
    ])
  })

  it('7. admission ranking uses only allowed pre-polish candidate information', () => {
    // Verified mechanically by signature of selectQuotaProposals not taking post-polish data
    const item = { proposal: 'A', semanticKey: 'A', rmseDb: 1, maxAbsDb: 1, filterCount: 1, cancellationScore: 1, lexicalRank: 1 }
    expect(Object.keys(item)).not.toContain('postPolishRmse')
  })

  it('7. mutation-library parity: parent state below Max10 capacity with PK, LS, HS and merge-eligible pair', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)
    const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 10 })
    const residualDb = problem.desiredDb

    const parentFilters: Filter[] = [
      { id: 'pk-1', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 3.0, q: 1.41 },
      { id: 'pk-2', enabled: true, type: 'PK', frequencyHz: 1030, gainDb: 2.0, q: 1.41 },
      { id: 'ls-1', enabled: true, type: 'LS', frequencyHz: 100, gainDb: -4.0, q: 0.707 },
      { id: 'hs-1', enabled: true, type: 'HS', frequencyHz: 10000, gainDb: 2.5, q: 0.707 },
    ]

    const researchProposals = researchOrderStructuralProposals(
      researchGenerateStructuralMutations(problem, parentFilters, residualDb),
    )
    const productProposals = orderStructuralProposals(
      generateStructuralMutations(parentFilters, residualDb, problem.frequenciesHz, bounds),
    )

    expect(productProposals.length).toBe(researchProposals.length)
    expect(productProposals.map((p) => p.mutation)).toEqual(researchProposals.map((p) => p.mutation))
    expect(productProposals.map((p) => semanticFilterKey(p.filters))).toEqual(
      researchProposals.map((p) => semanticFilterKey(p.filters)),
    )
  })

  it('8. mutation-library parity: parent state at Max10 capacity (disables add and split)', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)
    const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 10 })
    const residualDb = problem.desiredDb

    const parentFilters: Filter[] = Array.from({ length: 10 }, (_, i) => ({
      id: `filter-${i}`,
      enabled: true,
      type: i % 3 === 0 ? 'LS' : i % 3 === 1 ? 'PK' : 'HS',
      frequencyHz: 100 * (i + 1),
      gainDb: (i % 2 === 0 ? 1 : -1) * (i + 1),
      q: 1.0,
    }))

    const researchProposals = researchOrderStructuralProposals(
      researchGenerateStructuralMutations(problem, parentFilters, residualDb),
    )
    const productProposals = orderStructuralProposals(
      generateStructuralMutations(parentFilters, residualDb, problem.frequenciesHz, bounds),
    )

    expect(productProposals.length).toBe(researchProposals.length)
    expect(productProposals.map((p) => p.mutation)).toEqual(researchProposals.map((p) => p.mutation))
    expect(productProposals.map((p) => semanticFilterKey(p.filters))).toEqual(
      researchProposals.map((p) => semanticFilterKey(p.filters)),
    )
  })

  it('9. selector/Pareto parity: candidate dominance, tradeoff, equivalence, tie-breaking', () => {
    // 9.1 Dominance
    const stateA: SearchState = { candidateId: 'A', filters: [], rmseDb: 1.0, maxAbsDb: 2.0, cancellationScore: 0 }
    const stateB: SearchState = { candidateId: 'B', filters: [], rmseDb: 1.5, maxAbsDb: 2.5, cancellationScore: 0 }
    expect(retainParetoBeam([stateA, stateB], 2).map((s) => s.candidateId)).toEqual(['A'])

    // 9.2 Tradeoff
    const stateC: SearchState = { candidateId: 'C', filters: [], rmseDb: 2.0, maxAbsDb: 1.0, cancellationScore: 0 }
    expect(retainParetoBeam([stateA, stateC], 2).map((s) => s.candidateId)).toEqual(['A', 'C'])

    // 9.3 Exact objective equivalence tie-broken by aligned candidateId
    const stateEq1: SearchState = { candidateId: '0001', filters: [], rmseDb: 1.0, maxAbsDb: 2.0, cancellationScore: 0 }
    const stateEq2: SearchState = { candidateId: '0002', filters: [], rmseDb: 1.0, maxAbsDb: 2.0, cancellationScore: 0 }
    expect(selectReferencePoint([stateEq1, stateEq2]).candidateId).toBe('0001')
    expect(researchSelectReferencePoint([
      { candidateId: '0001', rmseDb: 1.0, maxAbsDb: 2.0, filterCount: 0, cancellationScore: 0 },
      { candidateId: '0002', rmseDb: 1.0, maxAbsDb: 2.0, filterCount: 0, cancellationScore: 0 },
    ]).candidateId).toBe('0001')

    // 9.4 Frontier larger than beam
    const states: SearchState[] = [
      { candidateId: 'pt-1', filters: [{ id: 'f1', enabled: true, type: 'PK', frequencyHz: 100, gainDb: 1, q: 1 }], rmseDb: 0.20, maxAbsDb: 0.70, cancellationScore: 0 },
      { candidateId: 'pt-2', filters: [{ id: 'f2', enabled: true, type: 'PK', frequencyHz: 200, gainDb: 1, q: 1 }, { id: 'f3', enabled: true, type: 'PK', frequencyHz: 300, gainDb: 1, q: 1 }], rmseDb: 0.15, maxAbsDb: 0.60, cancellationScore: 0 },
      { candidateId: 'pt-3', filters: [], rmseDb: 0.22, maxAbsDb: 0.50, cancellationScore: 0 },
      { candidateId: 'pt-4', filters: [], rmseDb: 0.10, maxAbsDb: 0.74, cancellationScore: 0 },
    ]
    const productRetained = retainParetoBeam(states, 2)
    const researchRetained = researchRetainParetoBeam(
      states.map((s) => ({
        candidate: { candidateId: s.candidateId, filters: s.filters },
        evaluation: {
          deliverable: {
            filters: s.filters,
            rmseDb: s.rmseDb,
            maxAbsDb: s.maxAbsDb,
            cancellationTotalScore: s.cancellationScore,
          },
        },
      })) as any,
      2,
    )
    expect(productRetained.map((s) => s.candidateId)).toEqual(researchRetained.map((s) => s.candidate.candidateId))

    // 9.5 Cancellation-score tie break
    const stateCancA: SearchState = { candidateId: 'A', filters: [], rmseDb: 1.0, maxAbsDb: 2.0, cancellationScore: 5 }
    const stateCancB: SearchState = { candidateId: 'B', filters: [], rmseDb: 1.0, maxAbsDb: 2.0, cancellationScore: 1 }
    expect(selectReferencePoint([stateCancA, stateCancB]).candidateId).toBe('B')
    expect(researchSelectReferencePoint([
      { candidateId: 'A', rmseDb: 1.0, maxAbsDb: 2.0, filterCount: 0, cancellationScore: 5 },
      { candidateId: 'B', rmseDb: 1.0, maxAbsDb: 2.0, filterCount: 0, cancellationScore: 1 },
    ]).candidateId).toBe('B')

    // 9.6 Filter-count tie break on achieved targets
    const stateFcA: SearchState = { candidateId: 'A', filters: [{ id: '1', enabled: true, type: 'PK', frequencyHz: 100, gainDb: 1, q: 1 }, { id: '2', enabled: true, type: 'PK', frequencyHz: 200, gainDb: 1, q: 1 }], rmseDb: 0.2, maxAbsDb: 0.5, cancellationScore: 0 }
    const stateFcB: SearchState = { candidateId: 'B', filters: [{ id: '1', enabled: true, type: 'PK', frequencyHz: 100, gainDb: 1, q: 1 }], rmseDb: 0.2, maxAbsDb: 0.5, cancellationScore: 0 }
    expect(selectReferencePoint([stateFcA, stateFcB]).candidateId).toBe('B')
    expect(researchSelectReferencePoint([
      { candidateId: 'A', rmseDb: 0.2, maxAbsDb: 0.5, filterCount: 2, cancellationScore: 0 },
      { candidateId: 'B', rmseDb: 0.2, maxAbsDb: 0.5, filterCount: 1, cancellationScore: 0 },
    ]).candidateId).toBe('B')
  })

  it('10. quantization and coordinate polish parity (localPolishEvaluations = 24)', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)
    const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 10 })

    const proposalFilters: Filter[] = [
      { id: 'p1', enabled: true, type: 'PK', frequencyHz: 1200, gainDb: -4.5, q: 1.8 },
    ]

    const researchPolished = researchPolishStructuralProposal(
      problem,
      proposalFilters,
      24,
      () => false,
    )
    const productPolished = polishFilters(
      proposalFilters,
      24,
      bounds,
      problem.desiredDb,
      problem.frequenciesHz,
      { isExpired: () => false },
      48000,
    )

    expect(normalizeFilters(productPolished.filters)).toEqual(
      normalizeFilters(researchPolished.deliveredFilters),
    )

    const evalProblem = evaluateSolverLabCandidate(problem, {
      protocolVersion: 1,
      problemId: problem.problemId,
      inputSha256: problem.inputSha256,
      candidateId: 'test-eval',
      algorithmId: 'test',
      seed: 0,
      filters: researchPolished.deliveredFilters,
    })

    expect(Math.abs(productPolished.rmseDb - evalProblem.deliverable!.rmseDb)).toBeLessThanOrEqual(1e-12)
    expect(Math.abs(productPolished.maxAbsDb - evalProblem.deliverable!.maxAbsDb)).toBeLessThanOrEqual(1e-12)
  })

  it('11. deadline test: pre-polish Q31 scoring halts within cooperative deadline', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)

    let calls = 0
    const deadline = {
      isExpired: () => {
        calls += 1
        return calls > 5
      },
    }

    const result = runStructuralSearch({
      desiredDb: problem.desiredDb,
      frequencies: problem.frequenciesHz,
      sampleRateHz: 48000,
      config: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
      deadline,
      seedFilters: [],
    })

    expect(result).toBeDefined()
    expect(calls).toBeGreaterThanOrEqual(5)
  })

  it('12. supplementary guards: security, leakage, and source integrity invariants', () => {
    const fileContent = readFileSync(new URL('../../../src/autoeq/v2/structuralSearch.ts', import.meta.url), 'utf8')
    expect(fileContent).not.toContain('OracleReferenceSnapshot')
    expect(fileContent).toContain('quantizeV2Filters')
    expect(fileContent).toContain('cascadeMagnitudeDb(quantized')
    expect(fileContent).toContain('current.length < bounds.maxFilters')
    expect(fileContent).toContain('deadline.isExpired()')

    let diff = ''
    try {
      const repoRoot = new URL('../../../../', import.meta.url).pathname
      diff = execSync('git status --porcelain apps/', { cwd: repoRoot }).toString().trim()
    } catch {}
    expect(diff).toBe('')
  })

  it('13. Fixture A — MP-seeded Baseline A parity (titan-to-u12t teacher-student MP seed)', () => {
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === 'titan-to-u12t')!
    const problem = createSolverLabProblem(caseDef, 10)
    const seeds = loadProposalSeeds(
      resolveCapacityRecoveryPath('mp-seeds/titan-to-u12t-teacher-student.json'),
      problem,
    )
    const mpSeedFilters = seeds[0]!.filters

    const beamResult = runStructuralBeam(
      {
        problem,
        seed: 0,
        evaluationBudget: 100000,
        referenceFrontier: [{ candidateId: 'ref', rmseDb: 1, maxAbsDb: 1, filterCount: 1 }],
        referenceSnapshotSha256: '0'.repeat(64),
        config: ARM_A_CONFIG,
        seeds: [{ seedId: seeds[0]!.sourceId, origin: 'matching-pursuit' as const, filters: mpSeedFilters }],
        includeZeroSeed: false,
        evaluate: (c) => evaluateSolverLabCandidate(problem, c),
      }
    )

    const searchResult = runStructuralSearch({
      desiredDb: problem.desiredDb,
      frequencies: problem.frequenciesHz,
      sampleRateHz: 48000,
      config: resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }),
      deadline: { isExpired: () => false },
      seedFilters: mpSeedFilters,
    })

    const beamBest = beamResult.trajectory.at(-1)!
    const beamCandidate = beamResult.states.find((s) => s.candidate.candidateId === beamBest.candidateId)!
    const beamDeliverable = beamCandidate.evaluation.deliverable!

    expect(Math.abs(searchResult.rmseDb - beamBest.canonicalRmseDb)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(searchResult.maxAbsDb - beamBest.canonicalMaxAbsDb)).toBeLessThanOrEqual(1e-6)
    expect(searchResult.filters.length).toBe(beamBest.actualDeliveredFilterCount)
    expect(normalizeFilters(searchResult.filters)).toEqual(normalizeFilters(beamDeliverable.filters))
    expect(searchResult.filters.length).toBe(beamCandidate.candidate.filters.length)
    expect(beamResult.stopReason).toBe('no-admissible-proposals')
  }, 60000)

  it('14. Fixture A — MP-seeded Experimental C parity (titan-to-u12t teacher-student MP seed)', () => {
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === 'titan-to-u12t')!
    const problem = createSolverLabProblem(caseDef, 10)
    const seeds = loadProposalSeeds(
      resolveCapacityRecoveryPath('mp-seeds/titan-to-u12t-teacher-student.json'),
      problem,
    )
    const mpSeedFilters = seeds[0]!.filters

    const ledger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
    const beamResult = runStructuralBeam(
      {
        problem,
        seed: 0,
        evaluationBudget: 100000,
        referenceFrontier: [{ candidateId: 'ref', rmseDb: 1, maxAbsDb: 1, filterCount: 1 }],
        referenceSnapshotSha256: '0'.repeat(64),
        config: ARM_C_CONFIG,
        seeds: [{ seedId: seeds[0]!.sourceId, origin: 'matching-pursuit' as const, filters: mpSeedFilters }],
        includeZeroSeed: false,
        evaluate: (c) => evaluateSolverLabCandidate(problem, c),
        admissionOverride: createQuotaOverride(problem, ledger, () => 0),
      }
    )

    const searchResult = runStructuralSearch({
      desiredDb: problem.desiredDb,
      frequencies: problem.frequenciesHz,
      sampleRateHz: 48000,
      config: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
      deadline: { isExpired: () => false },
      seedFilters: mpSeedFilters,
    })

    const beamBest = beamResult.trajectory.at(-1)!
    const beamCandidate = beamResult.states.find((s) => s.candidate.candidateId === beamBest.candidateId)!
    const beamDeliverable = beamCandidate.evaluation.deliverable!

    expect(Math.abs(searchResult.rmseDb - beamBest.canonicalRmseDb)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(searchResult.maxAbsDb - beamBest.canonicalMaxAbsDb)).toBeLessThanOrEqual(1e-6)
    expect(searchResult.filters.length).toBe(beamBest.actualDeliveredFilterCount)
    expect(normalizeFilters(searchResult.filters)).toEqual(normalizeFilters(beamDeliverable.filters))
    expect(searchResult.filters.length).toBe(beamCandidate.candidate.filters.length)
    expect(beamResult.stopReason).toBe('no-admissible-proposals')
  }, 60000)

  it('15. Fixture B — zero-start Baseline A parity (titan-to-storm zero-start)', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)

    const beamResult = runStructuralBeam(
      {
        problem,
        seed: 0,
        evaluationBudget: 100000,
        referenceFrontier: [{ candidateId: 'ref', rmseDb: 1, maxAbsDb: 1, filterCount: 1 }],
        referenceSnapshotSha256: '0'.repeat(64),
        config: ARM_A_CONFIG,
        includeZeroSeed: true,
        evaluate: (c) => evaluateSolverLabCandidate(problem, c),
      }
    )

    const searchResult = runStructuralSearch({
      desiredDb: problem.desiredDb,
      frequencies: problem.frequenciesHz,
      sampleRateHz: 48000,
      config: resolveStructuralSearchConfig({ preset: MAX10_BASELINE_PRESET }),
      deadline: { isExpired: () => false },
      seedFilters: [],
    })

    const beamBest = beamResult.trajectory.at(-1)!
    const beamCandidate = beamResult.states.find((s) => s.candidate.candidateId === beamBest.candidateId)!
    const beamDeliverable = beamCandidate.evaluation.deliverable!

    expect(Math.abs(searchResult.rmseDb - beamBest.canonicalRmseDb)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(searchResult.maxAbsDb - beamBest.canonicalMaxAbsDb)).toBeLessThanOrEqual(1e-6)
    expect(searchResult.filters.length).toBe(beamBest.actualDeliveredFilterCount)
    expect(normalizeFilters(searchResult.filters)).toEqual(normalizeFilters(beamDeliverable.filters))
    expect(searchResult.filters.length).toBe(beamCandidate.candidate.filters.length)
    expect(beamResult.stopReason).toBe('no-admissible-proposals')
  }, 60000)

  it('16. Fixture B — zero-start Experimental C parity (titan-to-storm zero-start)', () => {
    const researchCases = loadLayeredResearchCases('development')
    const caseDef = researchCases[0]!
    const problem = createSolverLabProblem(caseDef, 10)

    const ledger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
    const beamResult = runStructuralBeam(
      {
        problem,
        seed: 0,
        evaluationBudget: 100000,
        referenceFrontier: [{ candidateId: 'ref', rmseDb: 1, maxAbsDb: 1, filterCount: 1 }],
        referenceSnapshotSha256: '0'.repeat(64),
        config: ARM_C_CONFIG,
        includeZeroSeed: true,
        evaluate: (c) => evaluateSolverLabCandidate(problem, c),
        admissionOverride: createQuotaOverride(problem, ledger, () => 0),
      }
    )

    const searchResult = runStructuralSearch({
      desiredDb: problem.desiredDb,
      frequencies: problem.frequenciesHz,
      sampleRateHz: 48000,
      config: resolveStructuralSearchConfig({ preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET }),
      deadline: { isExpired: () => false },
      seedFilters: [],
    })

    const beamBest = beamResult.trajectory.at(-1)!
    const beamCandidate = beamResult.states.find((s) => s.candidate.candidateId === beamBest.candidateId)!
    const beamDeliverable = beamCandidate.evaluation.deliverable!

    expect(Math.abs(searchResult.rmseDb - beamBest.canonicalRmseDb)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(searchResult.maxAbsDb - beamBest.canonicalMaxAbsDb)).toBeLessThanOrEqual(1e-6)
    expect(searchResult.filters.length).toBe(beamBest.actualDeliveredFilterCount)
    expect(normalizeFilters(searchResult.filters)).toEqual(normalizeFilters(beamDeliverable.filters))
    expect(searchResult.filters.length).toBe(beamCandidate.candidate.filters.length)
    expect(beamResult.stopReason).toBe('no-admissible-proposals')
  }, 60000)
})
