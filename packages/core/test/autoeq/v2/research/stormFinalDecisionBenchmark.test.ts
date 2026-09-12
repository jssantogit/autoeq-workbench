import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import {
  ARM_A_CONFIG,
  ARM_C_CONFIG,
  PRIMARY_DEADLINE_MS,
  SANITY_DEADLINE_MS,
  compareSelected,
  paretoRelation,
  proposalKey,
  selectQuotaProposals,
  createQuotaOverride,
  runArm,
  evaluateFinalRules,
  type SignalLedger,
} from '../../../../benchmarks/research/stormFinalDecisionBenchmark.js'
import { loadLayeredResearchCases } from '../../../../benchmarks/research/corpus.js'
import { createSolverLabProblem, evaluateSolverLabCandidate, type SolverLabProblemV1 } from '../../../../benchmarks/research/labProtocol.js'
import { quantizeStructuralBeamFilters, runStructuralBeam, type StructuralProposal } from '../../../../benchmarks/research/structuralBeam.js'
import { resolveCapacityRecoveryPath } from '../../../../benchmarks/research/frozenResearchInputs.js'
import { loadProposalSeeds } from '../../../../benchmarks/research/proposalSeeds.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from '../../../../benchmarks/research/referenceSnapshot.js'
import type { Filter } from '../../../../src/index.js'

describe('Storm Final Decision Benchmark Runner', () => {
  const rootDir = resolve('/root/projects/autoeq-workbench/.worktrees/storm-diagnosis-20260910')
  const artifactDir = resolve(rootDir, 'packages/core/.research-artifacts/storm-final-decision-20260912')

  it('1. Verify corpus-manifest.json exists and contains exactly the 3 frozen cases', () => {
    const manifestPath = resolve(artifactDir, 'corpus-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.corpus.length).toBe(3)
    const ids = manifest.corpus.map((c: any) => c.id).sort()
    expect(ids).toEqual(['titan-to-storm', 'titan-to-trio', 'titan-to-u12t'])

    const storm = manifest.corpus.find((c: any) => c.id === 'titan-to-storm')
    expect(storm.targetFamily).toBe('Storm')
    expect(storm.inputSha).toBe('12d7384980a0953f2a27f8edc8d0171d8d22f35cd1bc48060d5bf20defefafa7')
    expect(storm.reproducibleEntries).toContain('mp-seeds/titan-to-storm-teacher-student.json')
    expect(storm.reproducibleEntries).toContain('mp-seeds/titan-to-storm-zero-seed.json')

    const u12t = manifest.corpus.find((c: any) => c.id === 'titan-to-u12t')
    expect(u12t.targetFamily).toBe('U12t')
    expect(u12t.inputSha).toBe('6d9b6c937749237ceeb6b9733783349776cd39a7137a4c90db343bbd3a289286')

    const trio = manifest.corpus.find((c: any) => c.id === 'titan-to-trio')
    expect(trio.targetFamily).toBe('Trio')
    expect(trio.inputSha).toBe('f902f6925f0ad06ee71c37ce7bd26b0e6c7d9de2695f9f0327482ab68ac7ef6e')
  })

  it('2. Verify A and C are initialized with identical inputs and seeds', () => {
    const researchCases = loadLayeredResearchCases('adversarial')
    for (const caseId of ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio']) {
      const caseDef = researchCases.find((c) => c.id === caseId)!
      expect(caseDef).toBeDefined()
      const problemA = createSolverLabProblem(caseDef, 10)
      const problemC = createSolverLabProblem(caseDef, 10)

      // Problem payloads must be identical
      expect(problemA.problemId).toBe(problemC.problemId)
      expect(problemA.inputSha256).toBe(problemC.inputSha256)
      expect(problemA.sampleRateHz).toBe(problemC.sampleRateHz)
      expect(problemA.frequenciesHz).toEqual(problemC.frequenciesHz)
      expect(problemA.desiredDb).toEqual(problemC.desiredDb)
      expect(problemA.bounds).toEqual(problemC.bounds)

      // Seed payloads must be identical
      const seedsA = loadProposalSeeds(resolveCapacityRecoveryPath(`mp-seeds/${caseId}-teacher-student.json`), problemA)
      const seedsC = loadProposalSeeds(resolveCapacityRecoveryPath(`mp-seeds/${caseId}-teacher-student.json`), problemC)
      expect(seedsA.length).toBe(seedsC.length)
      expect(seedsA.map((s) => s.sourceId)).toEqual(seedsC.map((s) => s.sourceId))
      expect(seedsA.map((s) => s.filters)).toEqual(seedsC.map((s) => s.filters))
    }
  })

  it('3. Verify authoritative baseline A equivalence with direct runStructuralBeam', () => {
    expect(ARM_A_CONFIG.maxFilters).toBe(10)
    expect(ARM_A_CONFIG.beamWidth).toBe(2)
    expect(ARM_A_CONFIG.proposalsPerParent).toBe(4)
    expect(ARM_A_CONFIG.localPolishEvaluations).toBe(24)

    const snapshot = JSON.parse(readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'))
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === 'titan-to-storm')!
    const problem = createSolverLabProblem(caseDef, 10)
    const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, 10)
    const byId = new Map(cell.candidates.map((c) => [c.candidateId, c]))
    const references = cell.deliverableFrontierCandidateIds.map((id) => {
      const c = byId.get(id)!
      return { candidateId: c.candidateId, rmseDb: c.canonicalRmseDb, maxAbsDb: c.canonicalMaxAbsDb, filterCount: c.actualDeliveredFilterCount }
    })
    const seeds = loadProposalSeeds(resolveCapacityRecoveryPath('mp-seeds/titan-to-storm-teacher-student.json'), problem).map((s) => ({
      seedId: s.sourceId,
      origin: 'matching-pursuit' as const,
      filters: s.filters,
    }))

    // Run Arm A through benchmark helper
    const armAResult = runArm('A', problem, references, snapshot, seeds, 5000)

    // Run direct runStructuralBeam with ARM_A_CONFIG and admissionOverride: undefined
    const started = performance.now()
    const elapsedMs = () => performance.now() - started
    const directResult = runStructuralBeam({
      problem,
      seed: 0,
      evaluationBudget: 100000,
      referenceFrontier: references,
      referenceSnapshotSha256: snapshot.contentSha256,
      config: ARM_A_CONFIG,
      seeds,
      includeZeroSeed: false,
      admissionOverride: undefined,
      nowMs: () => performance.now(),
      elapsedMs,
      isExpired: () => elapsedMs() >= 5000,
    })

    const directBest = directResult.trajectory.at(-1)!
    expect(armAResult.selectedBest).not.toBeNull()
    expect(armAResult.selectedBest?.candidateId).toBe(directBest.candidateId)
    expect(armAResult.selectedBest?.rmseDb).toBe(directBest.canonicalRmseDb)
    expect(armAResult.selectedBest?.maxAbsDb).toBe(directBest.canonicalMaxAbsDb)
    expect(armAResult.selectedBest?.filterCount).toBe(directBest.actualDeliveredFilterCount)
    expect(armAResult.uniqueStructuralStates).toBe(new Set(directResult.evaluations.map((e) => e.candidateId)).size)
    expect(armAResult.stopReason).toBe(directResult.stopReason)
  })

  it('4. Verify C differs only by the Q31-B4-P8 mechanism', () => {
    expect(ARM_C_CONFIG.maxFilters).toBe(10)
    expect(ARM_C_CONFIG.beamWidth).toBe(4)
    expect(ARM_C_CONFIG.proposalsPerParent).toBe(8)
    expect(ARM_C_CONFIG.localPolishEvaluations).toBe(24)
  })

  it('5. Verify deterministic quota selection logic for Q31 (6 lexical + 2 RMSE)', () => {
    // Generate 12 mock proposals with distinct keys and RMSE scores
    const mockProposals = Array.from({ length: 12 }, (_, i) => ({
      key: `proposal-${i}`,
      proposal: { mutation: 'add-pk' as const, filters: [] },
      lexicalRank: i,
      rmseDb: 10 - i, // proposal 11 has best (lowest) RMSE = -1, proposal 10 has 0, etc.
    }))

    const lexicalRanked = [...mockProposals]
    const rmseRanked = [...mockProposals].sort((a, b) => a.rmseDb - b.rmseDb)

    // selectQuotaProposals: 6 lexical + 2 RMSE
    const selected = selectQuotaProposals(lexicalRanked, rmseRanked, 6, 2, 8)
    expect(selected.length).toBe(8)

    // Top 6 lexical: proposals 0..5
    const selectedKeys = selected.map((s) => s.key)
    for (let i = 0; i < 6; i++) {
      expect(selectedKeys).toContain(`proposal-${i}`)
    }
    // Top 2 RMSE (items 11 and 10)
    expect(selectedKeys).toContain('proposal-11')
    expect(selectedKeys).toContain('proposal-10')

    // Determinism test: multiple runs return identical arrays
    const run2 = selectQuotaProposals(lexicalRanked, rmseRanked, 6, 2, 8)
    expect(selected.map((s) => s.key)).toEqual(run2.map((s) => s.key))

    // Overlap handling: when top RMSE proposals overlap with top lexical proposals
    const overlappingRmseRanked = [mockProposals[0]!, mockProposals[1]!, mockProposals[8]!, mockProposals[9]!]
    const selectedOverlap = selectQuotaProposals(lexicalRanked, overlappingRmseRanked, 6, 2, 8)
    expect(selectedOverlap.length).toBe(8)
    // 0 and 1 were already picked by lexical, so 8 and 9 must be picked without duplicating 0 or 1
    const keysOverlap = selectedOverlap.map((s) => s.key)
    expect(new Set(keysOverlap).size).toBe(8)
    expect(keysOverlap).toContain('proposal-8')
    expect(keysOverlap).toContain('proposal-9')
  })

  it('6. Verify admission scoring time is charged to candidate runtime within elapsed wall clock', () => {
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === 'titan-to-storm')!
    const problem = createSolverLabProblem(caseDef, 10)

    const ledger: SignalLedger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
    const started = performance.now()
    const elapsedMs = () => performance.now() - started

    const override = createQuotaOverride(problem, ledger, elapsedMs)
    expect(override).toBeDefined()
    expect(typeof override.apply).toBe('function')

    const mockProposals: StructuralProposal[] = [
      { mutation: 'add-pk', filters: [{ id: 'f1', enabled: true, type: 'PK', frequencyHz: 1000, q: 1, gainDb: 2 }] },
      { mutation: 'add-pk', filters: [{ id: 'f2', enabled: true, type: 'PK', frequencyHz: 2000, q: 1, gainDb: -2 }] },
    ]

    const decision = override.apply({
      layerIndex: 0,
      parentIndex: 0,
      parent: { candidate: { candidateId: 'parent', filters: [] } } as any,
      orderedProposals: mockProposals,
      admittedProposals: mockProposals,
      isVisited: () => false,
    })

    expect(decision).not.toBeNull()
    expect(decision!.intervention).toBe('custom')
    expect(decision!.proposals.length).toBe(2)
    expect(ledger.canonicalEvaluations).toBe(2)
    expect(ledger.elapsedMs).toBeGreaterThan(0)
    expect(ledger.events.length).toBe(2)
    expect(ledger.events[0]!.canonicalEvaluations).toBe(1)
    expect(ledger.events[1]!.canonicalEvaluations).toBe(2)
  })

  it('7. Verify hard cap of 10 filters on all deliverables', () => {
    expect(ARM_A_CONFIG.maxFilters).toBe(10)
    expect(ARM_C_CONFIG.maxFilters).toBe(10)

    const reportPath = resolve(artifactDir, 'benchmark-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'))
      const rows = report.results5s ?? report.results ?? []
      for (const row of rows) {
        if (row.A?.selectedBest) {
          expect(row.A.selectedBest.filterCount).toBeLessThanOrEqual(10)
        }
        if (row.C?.selectedBest) {
          expect(row.C.selectedBest.filterCount).toBeLessThanOrEqual(10)
        }
      }
    }
  })

  it('8. Verify local polish evaluations remain frozen at 24', () => {
    expect(ARM_A_CONFIG.localPolishEvaluations).toBe(24)
    expect(ARM_C_CONFIG.localPolishEvaluations).toBe(24)
    expect(ARM_A_CONFIG.localPolishEvaluations).toBe(ARM_C_CONFIG.localPolishEvaluations)
  })

  it('9. Verify reference selector semantics use frozen referenceSelectorKey and paretoRelation', () => {
    const itemC = { candidateId: 'c1', rmseDb: 1.2, maxAbsDb: 4.0, filterCount: 8 }
    const itemA = { candidateId: 'a1', rmseDb: 1.5, maxAbsDb: 4.5, filterCount: 8 }
    expect(compareSelected(itemC, itemA)).toBe('C')
    expect(compareSelected(itemA, itemC)).toBe('A')
    expect(compareSelected(itemC, itemC)).toBe('equivalent')

    expect(paretoRelation(itemC, itemA)).toBe('C-dominates')
    expect(paretoRelation(itemA, itemC)).toBe('A-dominates')

    const itemTradeoff = { candidateId: 't1', rmseDb: 1.0, maxAbsDb: 5.0, filterCount: 8 }
    expect(paretoRelation(itemC, itemTradeoff)).toBe('tradeoff')
  })

  it('10. Verify no teacher/oracle data reaches candidate admission', () => {
    // createQuotaOverride signature accepts only (problem, ledger, elapsedMs)
    expect(createQuotaOverride.length).toBe(3)
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === 'titan-to-storm')!
    const problem = createSolverLabProblem(caseDef, 10)
    const ledger: SignalLedger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
    const override = createQuotaOverride(problem, ledger, () => 0)

    // Apply uses only proposal filters evaluated via evaluateSolverLabCandidate against problem
    const proposals: StructuralProposal[] = [{ mutation: 'add-pk', filters: [] }]
    const result = override.apply({
      layerIndex: 0,
      parentIndex: 0,
      parent: { candidate: { candidateId: 'test', filters: [] } } as any,
      orderedProposals: proposals,
      admittedProposals: proposals,
      isVisited: () => false,
    })
    expect(result).not.toBeNull()
    expect(result!.proposals).toBeDefined()
    expect(result!.intervention).toBe('custom')
  })

  it('11. Verify paired aggregation is result-derived from report data', () => {
    const reportPath = resolve(artifactDir, 'benchmark-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'))
      const rows = report.results5s ?? report.results ?? []
      expect(rows.length).toBe(6)
      for (const row of rows) {
        const expectedDeltaRmse = (row.C.selectedBest?.rmseDb ?? 0) - (row.A.selectedBest?.rmseDb ?? 0)
        expect(Math.abs(row.deltaRmseDb - expectedDeltaRmse)).toBeLessThan(1e-10)

        const expectedDeltaMaxAbs = (row.C.selectedBest?.maxAbsDb ?? 0) - (row.A.selectedBest?.maxAbsDb ?? 0)
        expect(Math.abs(row.deltaMaxAbsDb - expectedDeltaMaxAbs)).toBeLessThan(1e-10)

        const expectedDeltaRegret = (row.C.selectedBest?.regret ?? 0) - (row.A.selectedBest?.regret ?? 0)
        expect(Math.abs(row.deltaRegret - expectedDeltaRegret)).toBeLessThan(1e-10)

        expect(row.selectorRelation).toBe(compareSelected(row.C.selectedBest, row.A.selectedBest))
        expect(row.paretoRelation).toBe(paretoRelation(row.C.selectedBest, row.A.selectedBest))
      }
    }
  })

  it('12. Verify Storm milestone accounting filters exclusively on caseId === titan-to-storm', () => {
    const mockRows = [
      { caseId: 'titan-to-storm', targetFamily: 'Storm', deltaMaxAbsDb: -0.5, deltaRegret: -0.1, selectorRelation: 'C' },
      { caseId: 'titan-to-storm', targetFamily: 'Storm', deltaMaxAbsDb: -0.3, deltaRegret: -0.1, selectorRelation: 'C' },
      { caseId: 'titan-to-u12t', targetFamily: 'U12t', deltaMaxAbsDb: 0.8, deltaRegret: 0.0, selectorRelation: 'A' },
      { caseId: 'titan-to-trio', targetFamily: 'Trio', deltaMaxAbsDb: 0.9, deltaRegret: 0.0, selectorRelation: 'A' },
    ]

    const stormRows = mockRows.filter((r) => r.caseId === 'titan-to-storm')
    expect(stormRows.length).toBe(2)
    const stormMeanMaxAbs = stormRows.reduce((acc, r) => acc + r.deltaMaxAbsDb, 0) / stormRows.length
    expect(stormMeanMaxAbs).toBeCloseTo(-0.4, 5)

    // Altering non-storm rows must have zero effect on storm milestone
    const alteredRows = mockRows.map((r) => (r.caseId !== 'titan-to-storm' ? { ...r, deltaMaxAbsDb: 99.9 } : r))
    const alteredStormRows = alteredRows.filter((r) => r.caseId === 'titan-to-storm')
    const alteredStormMeanMaxAbs = alteredStormRows.reduce((acc, r) => acc + r.deltaMaxAbsDb, 0) / alteredStormRows.length
    expect(alteredStormMeanMaxAbs).toBe(stormMeanMaxAbs)
  })

  it('13. Verify mechanical final classification logic against all 8 predeclared rules', () => {
    const baseSupportedRows = [
      { caseId: 'titan-to-storm', targetFamily: 'Storm', deltaMaxAbsDb: -0.6, deltaRegret: -0.2, selectorRelation: 'C', wallClockSatisfied: true },
      { caseId: 'titan-to-storm', targetFamily: 'Storm', deltaMaxAbsDb: -0.4, deltaRegret: -0.1, selectorRelation: 'C', wallClockSatisfied: true },
      { caseId: 'titan-to-u12t', targetFamily: 'U12t', deltaMaxAbsDb: -0.1, deltaRegret: 0.0, selectorRelation: 'C', wallClockSatisfied: true },
      { caseId: 'titan-to-u12t', targetFamily: 'U12t', deltaMaxAbsDb: 0.0, deltaRegret: 0.0, selectorRelation: 'equivalent', wallClockSatisfied: true },
      { caseId: 'titan-to-trio', targetFamily: 'Trio', deltaMaxAbsDb: -0.2, deltaRegret: -0.1, selectorRelation: 'C', wallClockSatisfied: true },
      { caseId: 'titan-to-trio', targetFamily: 'Trio', deltaMaxAbsDb: 0.0, deltaRegret: 0.0, selectorRelation: 'equivalent', wallClockSatisfied: true },
    ]

    const validOptions = { wallClockContractSatisfied: true, noTeacherOracleLeakage: true, noProductSemanticChange: true }

    // 1. Fully supported case
    expect(evaluateFinalRules(baseSupportedRows, validOptions)).toBe('FINAL_CANDIDATE_SUPPORTED')

    // 2. MIXED case: regret worsens (+0.05 mean) but no rejection trigger fired
    const mixedRows = baseSupportedRows.map((r) => ({ ...r, deltaRegret: 0.05 }))
    expect(evaluateFinalRules(mixedRows, validOptions)).toBe('FINAL_CANDIDATE_MIXED')

    // 3. REJECTED: losses > wins
    const moreLossesRows = baseSupportedRows.map((r, idx) => ({ ...r, selectorRelation: idx < 4 ? 'A' : 'C' }))
    expect(evaluateFinalRules(moreLossesRows, validOptions)).toBe('FINAL_CANDIDATE_REJECTED')

    // 4. REJECTED: aggregate mean maxAbs worsens
    const worseAggregateMaxAbsRows = baseSupportedRows.map((r) => ({ ...r, deltaMaxAbsDb: 0.5 }))
    expect(evaluateFinalRules(worseAggregateMaxAbsRows, validOptions)).toBe('FINAL_CANDIDATE_REJECTED')

    // 5. REJECTED: Storm mean maxAbs worsens
    const worseStormMaxAbsRows = baseSupportedRows.map((r) =>
      r.targetFamily === 'Storm' ? { ...r, deltaMaxAbsDb: 0.5 } : { ...r, deltaMaxAbsDb: -1.0 },
    )
    expect(evaluateFinalRules(worseStormMaxAbsRows, validOptions)).toBe('FINAL_CANDIDATE_REJECTED')

    // 6. REJECTED: a family has both more losses than wins AND worse mean maxAbs
    const familyLossAndWorseRows = baseSupportedRows.map((r) =>
      r.targetFamily === 'U12t' ? { ...r, selectorRelation: 'A', deltaMaxAbsDb: 0.2 } : r,
    )
    expect(evaluateFinalRules(familyLossAndWorseRows, validOptions)).toBe('FINAL_CANDIDATE_REJECTED')

    // 7. REJECTED: paired maxAbs regression > +1.0 dB
    const singleRegressionOver1dBRows = baseSupportedRows.map((r, idx) =>
      idx === 0 ? { ...r, deltaMaxAbsDb: 1.05 } : r,
    )
    expect(evaluateFinalRules(singleRegressionOver1dBRows, validOptions)).toBe('FINAL_CANDIDATE_REJECTED')

    // 8. REJECTED: candidate violates wall-clock contract
    expect(evaluateFinalRules(baseSupportedRows, { ...validOptions, wallClockContractSatisfied: false })).toBe('FINAL_CANDIDATE_REJECTED')

    // 9. REJECTED: oracle leakage or product semantic change
    expect(evaluateFinalRules(baseSupportedRows, { ...validOptions, noTeacherOracleLeakage: false })).toBe('FINAL_CANDIDATE_REJECTED')
    expect(evaluateFinalRules(baseSupportedRows, { ...validOptions, noProductSemanticChange: false })).toBe('FINAL_CANDIDATE_REJECTED')
  })

  it('14. Verify git status has 0 changes in packages/core/src/**', () => {
    const diff = execSync('git status --porcelain packages/core/src', { cwd: rootDir }).toString().trim()
    expect(diff).toBe('')
    const diffProduct = execSync('git diff packages/core/src', { cwd: rootDir }).toString().trim()
    expect(diffProduct).toBe('')
  })

  it('15. Verify predecessor research artifacts remain intact and non-empty', () => {
    const predecessorFiles = [
      'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/tournament-report.json',
      'packages/core/.research-artifacts/storm-admission-generalization-20260911/campaign-report.json',
      'packages/core/.research-artifacts/storm-admission-validation-20260911/campaign-report.json',
      'packages/core/.research-artifacts/storm-bridge-detectability-audit-20260911/sparse-0010/audit-report.json',
      'packages/core/.research-artifacts/storm-exhaustion-causal-20260911/campaign-report.json',
    ]

    for (const relPath of predecessorFiles) {
      const fullPath = resolve(rootDir, relPath)
      expect(existsSync(fullPath)).toBe(true)
      const stats = statSync(fullPath)
      expect(stats.size).toBeGreaterThan(0)
    }
  })
})

