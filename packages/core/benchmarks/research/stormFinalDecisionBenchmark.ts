import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { loadLayeredResearchCases } from './corpus.js'
import { createSolverLabProblem, evaluateSolverLabCandidate, type SolverLabProblemV1 } from './labProtocol.js'
import { referenceSelectorKey } from './referenceSelector.js'
import { quantizeStructuralBeamFilters, runStructuralBeam, type StructuralBeamAdmissionOverride, type StructuralProposal } from './structuralBeam.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { buildQuotaSelection } from './stormAdmissionQuotaCampaign.js'
import { loadProposalSeeds } from './proposalSeeds.js'

export const ARM_A_CONFIG = Object.freeze({
  maxFilters: 10,
  beamWidth: 2,
  proposalsPerParent: 4,
  localPolishEvaluations: 24,
})

export const ARM_C_CONFIG = Object.freeze({
  maxFilters: 10,
  beamWidth: 4,
  proposalsPerParent: 8,
  localPolishEvaluations: 24,
})

export const BUDGETS_MS = Object.freeze([5000, 15000])

function referenceFrontier(snapshot: OracleReferenceSnapshotV1, problem: SolverLabProblemV1) {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, 10)
  const byId = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = byId.get(candidateId)
    if (candidate === undefined) throw new Error(`missing reference candidate: ${candidateId}`)
    return {
      candidateId: candidate.candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

function createQuotaOverride(
  armId: 'A' | 'C',
  problem: SolverLabProblemV1,
  ledger: { canonicalEvaluations: number; elapsedMs: number; events: { elapsedMs: number, canonicalEvaluations: number }[] },
  elapsedMs: () => number,
): StructuralBeamAdmissionOverride {
  const lexicalQuota = armId === 'A' ? 4 : 6
  const rmseQuota = armId === 'A' ? 0 : 2
  return {
    apply: (context) => {
      const started = performance.now()
      const scored = context.orderedProposals.map((proposal, lexicalRank) => {
        let evaluation
        if (armId === 'C') {
          const delivered = quantizeStructuralBeamFilters(problem, proposal.filters)
          evaluation = evaluateSolverLabCandidate(problem, {
            protocolVersion: 1,
            problemId: problem.problemId,
            inputSha256: problem.inputSha256,
            candidateId: `quota-probe-${lexicalRank}`,
            algorithmId: 'quota-probe',
            seed: 0,
            filters: delivered,
          })
          ledger.canonicalEvaluations += 1
          ledger.events.push({ elapsedMs: elapsedMs(), canonicalEvaluations: ledger.canonicalEvaluations })
          if (!evaluation.valid || evaluation.deliverable === null) throw new Error('probe failed')
        }
        return {
          key: proposalKey(proposal),
          proposal,
          lexicalRank,
          rmseDb: evaluation?.deliverable?.rmseDb ?? 0,
          maxAbsDb: evaluation?.deliverable?.maxAbsDb ?? 0,
          filterCount: evaluation?.deliverable?.filters?.length ?? 0,
          cancellationScore: evaluation?.deliverable?.cancellationTotalScore ?? 0,
        }
      })
      if (armId === 'C') ledger.elapsedMs += performance.now() - started

      const rmseRanked = [...scored].sort((left, right) =>
        left.rmseDb - right.rmseDb ||
        left.maxAbsDb - right.maxAbsDb ||
        left.filterCount - right.filterCount ||
        left.cancellationScore - right.cancellationScore ||
        left.lexicalRank - right.lexicalRank)

      
      let selectedIds = new Set()
      let selected = []
      for (const item of scored) {
        if (selected.length < lexicalQuota) {
          selected.push(item)
          selectedIds.add(item.proposal)
        }
      }
      for (const item of rmseRanked) {
        if (!selectedIds.has(item.proposal) && selected.length < lexicalQuota + rmseQuota) {
          selected.push(item)
          selectedIds.add(item.proposal)
        }
      }

      return { proposals: selected.map((entry) => entry.proposal), intervention: 'custom' }
    },
  }
}

export function compareSelected(left: any, right: any): 'C' | 'A' | 'equivalent' {
  if (left === null && right === null) return 'equivalent'
  if (left === null) return 'A'
  if (right === null) return 'C'
  const epsilon = 1e-12
  if (
    Math.abs(left.rmseDb - right.rmseDb) <= epsilon &&
    Math.abs(left.maxAbsDb - right.maxAbsDb) <= epsilon &&
    left.filterCount === right.filterCount
  ) return 'equivalent'
  const leftKey = referenceSelectorKey({ ...left, cancellationScore: 0 })
  const rightKey = referenceSelectorKey({ ...right, cancellationScore: 0 })
  for (let index = 0; index < Math.max(leftKey.length, rightKey.length); index += 1) {
    const l = leftKey[index]
    const r = rightKey[index]
    if (l === undefined || r === undefined) throw new Error('mismatch')
    if (l < r) return 'C'
    if (l > r) return 'A'
  }
  return 'equivalent'
}

export function paretoRelation(left: any, right: any) {
  if (left === null || right === null) return 'incomplete'
  const epsilon = 1e-12
  if (Math.abs(left.rmseDb - right.rmseDb) <= epsilon && Math.abs(left.maxAbsDb - right.maxAbsDb) <= epsilon) return 'equivalent'
  const dominates = (a: any, b: any) =>
    a.rmseDb <= b.rmseDb + epsilon && a.maxAbsDb <= b.maxAbsDb + epsilon &&
    (a.rmseDb < b.rmseDb - epsilon || a.maxAbsDb < b.maxAbsDb - epsilon)
  const leftDominates = dominates(left, right)
  const rightDominates = dominates(right, left)
  if (leftDominates && !rightDominates) return 'C-dominates'
  if (rightDominates && !leftDominates) return 'A-dominates'
  if (!leftDominates && !rightDominates) return 'tradeoff'
  return 'equivalent'
}

function runArm(armId: 'A' | 'C', problem: SolverLabProblemV1, references: any, snapshot: any, seeds: any[]) {
  const ledger: { canonicalEvaluations: number; elapsedMs: number; events: { elapsedMs: number; canonicalEvaluations: number }[] } = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
  const started = performance.now()
  const nowMs = () => performance.now()
  const elapsedMs = () => performance.now() - started
  const isExpired = () => elapsedMs() >= 15000
  const downstreamTimes: number[] = []

  const result = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: 100000,
    referenceFrontier: references,
    referenceSnapshotSha256: snapshot.contentSha256,
    config: armId === 'A' ? ARM_A_CONFIG : ARM_C_CONFIG,
    seeds,
    includeZeroSeed: seeds.length === 0,
    admissionOverride: createQuotaOverride(armId, problem, ledger, elapsedMs),
    nowMs,
    elapsedMs,
    isExpired,
    onPoint: (point) => downstreamTimes.push(point.elapsedMs),
  })

  const checkpoints = BUDGETS_MS.map((budget) => {
    const eligible = result.trajectory.filter((p) => p.elapsedMs <= budget)
    const best = eligible.at(-1)
    let signalEvals = 0
    for (const e of ledger.events) {
      if (e.elapsedMs <= budget) signalEvals = e.canonicalEvaluations
      else break
    }
    return {
      budgetMs: budget,
      selectedBest: best ? {
        candidateId: best.candidateId,
        rmseDb: best.canonicalRmseDb,
        maxAbsDb: best.canonicalMaxAbsDb,
        filterCount: best.actualDeliveredFilterCount,
        regret: best.referenceRegret,
        elapsedMs: best.elapsedMs,
      } : null,
      downstreamEvaluations: downstreamTimes.filter((t) => t <= budget).length,
      signalCanonicalEvaluations: signalEvals,
    }
  })

  return {
    armId,
    totalElapsedMs: elapsedMs(),
    stopReason: result.stopReason,
    uniqueStructuralStates: new Set(result.evaluations.map(e => e.candidateId)).size,
    coordinateTrials: result.evaluations.length * 24,
    checkpoints,
  }
}

export function runFinalDecision() {
  const snapshot = JSON.parse(readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'))
  const cases = ['titan-to-storm', 'titan-to-u12t', 'titan-to-trio']
  const results: any[] = []
  let caseIndex = 0

  for (const caseId of cases) {
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === caseId)!
    const problem = createSolverLabProblem(caseDef, 10)
    const references = referenceFrontier(snapshot, problem)

    const seedSets = [
      loadProposalSeeds(resolveCapacityRecoveryPath(`mp-seeds/${caseId}-teacher-student.json`), problem).map(s => ({
        seedId: s.sourceId, origin: 'matching-pursuit' as const, filters: s.filters
      })),
      [] // zero-seed
    ]

    for (const seeds of seedSets) {
      const isAFirst = caseIndex % 2 === 0
      let A, C
      if (isAFirst) {
        A = runArm('A', problem, references, snapshot, seeds)
        C = runArm('C', problem, references, snapshot, seeds)
      } else {
        C = runArm('C', problem, references, snapshot, seeds)
        A = runArm('A', problem, references, snapshot, seeds)
      }

      results.push({
        caseId,
        seedType: seeds.length > 0 ? 'teacher-student' : 'zero-seed',
        A,
        C,
        checkpoints: BUDGETS_MS.map(budget => {
          const aCp = A.checkpoints.find((c: any) => c.budgetMs === budget)!
          const cCp = C.checkpoints.find((c: any) => c.budgetMs === budget)!
          return {
            budgetMs: budget,
            deltaRmseDb: (cCp.selectedBest?.rmseDb ?? 0) - (aCp.selectedBest?.rmseDb ?? 0),
            deltaMaxAbsDb: (cCp.selectedBest?.maxAbsDb ?? 0) - (aCp.selectedBest?.maxAbsDb ?? 0),
            deltaRegret: (cCp.selectedBest?.regret ?? 0) - (aCp.selectedBest?.regret ?? 0),
            selectorRelation: compareSelected(cCp.selectedBest, aCp.selectedBest),
            paretoRelation: paretoRelation(cCp.selectedBest, aCp.selectedBest),
            computeDelta: (cCp.downstreamEvaluations + cCp.signalCanonicalEvaluations) - aCp.downstreamEvaluations,
            timeToBestDelta: (cCp.selectedBest?.elapsedMs ?? budget) - (aCp.selectedBest?.elapsedMs ?? budget)
          }
        })
      })
      caseIndex++
    }
  }

  // Determine final classification
  const storm5s = results.filter(r => r.caseId === 'titan-to-storm').map(r => r.checkpoints.find((c: any) => c.budgetMs === 5000)!)
  const cWins = storm5s.filter((c: any) => c.selectorRelation === 'C').length
  const aWins = storm5s.filter((c: any) => c.selectorRelation === 'A').length
  let classification = 'FINAL_CANDIDATE_MIXED'
  if (cWins > aWins) classification = 'FINAL_CANDIDATE_SUPPORTED'
  else if (aWins > cWins) classification = 'FINAL_CANDIDATE_REJECTED'

  const report = {
    schemaVersion: 1,
    classification,
    results
  }

  mkdirSync('/root/projects/autoeq-workbench/.worktrees/storm-diagnosis-20260910/.research-artifacts/storm-final-decision-20260912', { recursive: true })
  writeFileSync('/root/projects/autoeq-workbench/.worktrees/storm-diagnosis-20260910/.research-artifacts/storm-final-decision-20260912/benchmark-report.json', JSON.stringify(report, null, 2))
  writeFileSync('/root/projects/autoeq-workbench/.worktrees/storm-diagnosis-20260910/docs/superpowers/specs/2026-09-12-storm-final-decision-results.md', `# Storm Final Decision Results\n\nClassification: ${classification}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runFinalDecision()
}
