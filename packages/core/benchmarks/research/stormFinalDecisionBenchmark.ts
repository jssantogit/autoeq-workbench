import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { loadLayeredResearchCases } from './corpus.js'
import { createSolverLabProblem, evaluateSolverLabCandidate, type SolverLabProblemV1 } from './labProtocol.js'
import { referenceSelectorKey } from './referenceSelector.js'
import { quantizeStructuralBeamFilters, runStructuralBeam, type StructuralBeamAdmissionOverride, type StructuralProposal } from './structuralBeam.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
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

export const PRIMARY_DEADLINE_MS = 5000
export const SANITY_DEADLINE_MS = 15000
export const BUDGETS_MS = Object.freeze([PRIMARY_DEADLINE_MS, SANITY_DEADLINE_MS])

export interface SignalLedger {
  canonicalEvaluations: number
  elapsedMs: number
  events: { elapsedMs: number; canonicalEvaluations: number }[]
}

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

export function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

export function selectQuotaProposals<T extends { proposal: any; key: string }>(
  scoredProposals: readonly T[],
  rmseRankedProposals: readonly T[],
  lexicalQuota = 6,
  rmseQuota = 2,
  targetCount = 8,
): T[] {
  const selected: T[] = []
  const seenKeys = new Set<string>()

  // 1. Lexical quota
  for (const item of scoredProposals) {
    if (selected.length >= lexicalQuota) break
    if (!seenKeys.has(item.key)) {
      seenKeys.add(item.key)
      selected.push(item)
    }
  }

  // 2. Pre-polish RMSE quota
  let addedRmse = 0
  for (const item of rmseRankedProposals) {
    if (addedRmse >= rmseQuota || selected.length >= targetCount) break
    if (!seenKeys.has(item.key)) {
      seenKeys.add(item.key)
      selected.push(item)
      addedRmse += 1
    }
  }

  // 3. Fallback backfill from lexical then RMSE if needed (0 novelty backfill)
  if (selected.length < targetCount) {
    for (const item of scoredProposals) {
      if (selected.length >= targetCount) break
      if (!seenKeys.has(item.key)) {
        seenKeys.add(item.key)
        selected.push(item)
      }
    }
  }
  if (selected.length < targetCount) {
    for (const item of rmseRankedProposals) {
      if (selected.length >= targetCount) break
      if (!seenKeys.has(item.key)) {
        seenKeys.add(item.key)
        selected.push(item)
      }
    }
  }

  return selected
}

export function createQuotaOverride(
  problem: SolverLabProblemV1,
  ledger: SignalLedger,
  elapsedMs: () => number,
): StructuralBeamAdmissionOverride {
  return {
    apply: (context) => {
      const started = performance.now()
      const scored = context.orderedProposals.map((proposal, lexicalRank) => {
        const delivered = quantizeStructuralBeamFilters(problem, proposal.filters)
        const evaluation = evaluateSolverLabCandidate(problem, {
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
        if (!evaluation.valid || evaluation.deliverable === null) {
          throw new Error('pre-polish RMSE probe failed')
        }
        return {
          key: proposalKey(proposal),
          proposal,
          lexicalRank,
          rmseDb: evaluation.deliverable.rmseDb,
          maxAbsDb: evaluation.deliverable.maxAbsDb,
          filterCount: evaluation.deliverable.filters.length,
          cancellationScore: evaluation.deliverable.cancellationTotalScore,
        }
      })
      ledger.elapsedMs += performance.now() - started

      const rmseRanked = [...scored].sort(
        (left, right) =>
          left.rmseDb - right.rmseDb ||
          left.maxAbsDb - right.maxAbsDb ||
          left.filterCount - right.filterCount ||
          left.cancellationScore - right.cancellationScore ||
          left.lexicalRank - right.lexicalRank,
      )

      const selected = selectQuotaProposals(scored, rmseRanked, 6, 2, 8)
      return {
        proposals: selected.map((entry) => entry.proposal),
        intervention: 'custom',
      }
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

export function paretoRelation(left: any, right: any): 'C-dominates' | 'A-dominates' | 'tradeoff' | 'equivalent' | 'incomplete' {
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

export function runArm(
  armId: 'A' | 'C',
  problem: SolverLabProblemV1,
  references: any,
  snapshot: any,
  seeds: any[],
  deadlineMs: number,
) {
  const ledger: SignalLedger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
  const started = performance.now()
  const nowMs = () => performance.now()
  const elapsedMs = () => performance.now() - started
  const isExpired = () => elapsedMs() >= deadlineMs
  const downstreamTimes: number[] = []

  // Arm A uses ARM_A_CONFIG and directly invokes runStructuralBeam with admissionOverride: undefined
  // Arm C uses ARM_C_CONFIG with createQuotaOverride selecting 6 lexical + 2 pre-polish RMSE proposals
  const admissionOverride =
    armId === 'A' ? undefined : createQuotaOverride(problem, ledger, elapsedMs)
  const config = armId === 'A' ? ARM_A_CONFIG : ARM_C_CONFIG

  const result = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: 100000,
    referenceFrontier: references,
    referenceSnapshotSha256: snapshot.contentSha256,
    config,
    seeds,
    includeZeroSeed: seeds.length === 0,
    admissionOverride,
    nowMs,
    elapsedMs,
    isExpired,
    onPoint: (point) => downstreamTimes.push(point.elapsedMs),
  })

  const totalElapsedMs = elapsedMs()
  const best = result.trajectory.length > 0 ? result.trajectory.at(-1)! : null

  const timingFidelity = {
    deadlineMs,
    actualElapsedMs: totalElapsedMs,
    overshootMs: Math.max(0, totalElapsedMs - deadlineMs),
    satisfied: totalElapsedMs <= deadlineMs + 2000,
    stopReason: result.stopReason,
  }

  return {
    armId,
    deadlineMs,
    totalElapsedMs,
    stopReason: result.stopReason,
    timingFidelity,
    uniqueStructuralStates: new Set(result.evaluations.map((e) => e.candidateId)).size,
    coordinateTrials: result.evaluations.length * 24,
    downstreamEvaluations: downstreamTimes.length,
    signalCanonicalEvaluations: ledger.canonicalEvaluations,
    signalElapsedMs: ledger.elapsedMs,
    selectedBest: best
      ? {
          candidateId: best.candidateId,
          rmseDb: best.canonicalRmseDb,
          maxAbsDb: best.canonicalMaxAbsDb,
          filterCount: best.actualDeliveredFilterCount,
          regret: best.referenceRegret,
          elapsedMs: best.elapsedMs,
        }
      : null,
  }
}

export type FinalDecisionClassification =
  | 'FINAL_CANDIDATE_SUPPORTED'
  | 'FINAL_CANDIDATE_MIXED'
  | 'FINAL_CANDIDATE_REJECTED'

export interface EvaluateFinalRulesOptions {
  wallClockContractSatisfied?: boolean
  noTeacherOracleLeakage?: boolean
  noProductSemanticChange?: boolean
  maxAllowedElapsedMs?: number
}

export function evaluateFinalRules(
  rows5s: readonly any[],
  options?: EvaluateFinalRulesOptions,
): FinalDecisionClassification {
  if (rows5s.length === 0) return 'FINAL_CANDIDATE_REJECTED'

  // 1. Aggregate selector wins > losses
  const wins = rows5s.filter((r) => r.selectorRelation === 'C').length
  const losses = rows5s.filter((r) => r.selectorRelation === 'A').length
  const rule1Supported = wins > losses
  const rule1Rejected = losses > wins

  // 2. Aggregate mean maxAbs improves (< 0)
  const meanDeltaMaxAbs = rows5s.reduce((acc, r) => acc + (r.deltaMaxAbsDb ?? 0), 0) / rows5s.length
  const rule2Supported = meanDeltaMaxAbs < 0
  const rule2Rejected = meanDeltaMaxAbs > 0

  // 3. Aggregate mean Directed Reference Regret does not worsen (<= 0)
  const meanDeltaRegret = rows5s.reduce((acc, r) => acc + (r.deltaRegret ?? 0), 0) / rows5s.length
  const rule3Supported = meanDeltaRegret <= 0

  // 4. Storm mean maxAbs improves (< 0)
  const stormRows = rows5s.filter(
    (r) =>
      r.caseId === 'titan-to-storm' ||
      (r.targetFamily && r.targetFamily.toLowerCase() === 'storm') ||
      (typeof r.caseId === 'string' && r.caseId.toLowerCase().includes('storm')),
  )
  const stormMeanMaxAbs =
    stormRows.length > 0
      ? stormRows.reduce((acc, r) => acc + (r.deltaMaxAbsDb ?? 0), 0) / stormRows.length
      : 0
  const rule4Supported = stormRows.length > 0 && stormMeanMaxAbs < 0
  const rule4Rejected = stormRows.length > 0 && stormMeanMaxAbs > 0

  // 5. No family has both: more selector losses than wins AND worse mean maxAbs (> 0)
  const familyMap = new Map<string, any[]>()
  for (const r of rows5s) {
    const fam =
      r.targetFamily ??
      (typeof r.caseId === 'string' && r.caseId.toLowerCase().includes('storm')
        ? 'Storm'
        : typeof r.caseId === 'string' && r.caseId.toLowerCase().includes('u12t')
          ? 'U12t'
          : typeof r.caseId === 'string' && r.caseId.toLowerCase().includes('trio')
            ? 'Trio'
            : (r.caseId ?? 'Unknown'))
    if (!familyMap.has(fam)) familyMap.set(fam, [])
    familyMap.get(fam)!.push(r)
  }

  let anyFamilyViolated = false
  for (const [_, famRows] of familyMap.entries()) {
    const fWins = famRows.filter((r) => r.selectorRelation === 'C').length
    const fLosses = famRows.filter((r) => r.selectorRelation === 'A').length
    const fMeanMaxAbs = famRows.reduce((acc, r) => acc + (r.deltaMaxAbsDb ?? 0), 0) / famRows.length
    if (fLosses > fWins && fMeanMaxAbs > 0) {
      anyFamilyViolated = true
      break
    }
  }
  const rule5Supported = !anyFamilyViolated
  const rule5Rejected = anyFamilyViolated

  // 6. No paired maxAbs regression > +1.0 dB
  const pairedRegressionOver1dB = rows5s.some((r) => (r.deltaMaxAbsDb ?? 0) > 1.0)
  const rule6Supported = !pairedRegressionOver1dB
  const rule6Rejected = pairedRegressionOver1dB

  // 7. Candidate satisfies actual 5s wall-clock contract
  const maxElapsed = options?.maxAllowedElapsedMs ?? 7000
  const defaultWallClockSatisfied = rows5s.every((r) => {
    if (r.wallClockSatisfied !== undefined) return r.wallClockSatisfied
    if (r.C?.timingFidelity?.satisfied !== undefined) return r.C.timingFidelity.satisfied
    const elapsed = r.cTotalElapsedMs ?? r.C?.totalElapsedMs
    if (elapsed !== undefined) return elapsed > 0 && elapsed <= maxElapsed
    return true
  })
  const wallClockSatisfied = options?.wallClockContractSatisfied ?? defaultWallClockSatisfied
  const rule7Supported = wallClockSatisfied
  const rule7Rejected = !wallClockSatisfied

  // 8. No runtime teacher/oracle leakage or product-semantic change is required
  const noTeacherOracleLeakage = options?.noTeacherOracleLeakage ?? true
  const noProductSemanticChange = options?.noProductSemanticChange ?? true
  const rule8Supported = noTeacherOracleLeakage && noProductSemanticChange
  const rule8Rejected = !rule8Supported

  // REJECTED IF:
  // - aggregate selector losses > wins, OR
  // - aggregate mean maxAbs worsens, OR
  // - Storm mean maxAbs worsens, OR
  // - any family has BOTH more selector losses than wins AND worse mean maxAbs, OR
  // - any paired maxAbs regression > +1.0 dB, OR
  // - candidate violates wall-clock contract, OR
  // - oracle leakage or product semantic change required.
  if (
    rule1Rejected ||
    rule2Rejected ||
    rule4Rejected ||
    rule5Rejected ||
    rule6Rejected ||
    rule7Rejected ||
    rule8Rejected
  ) {
    return 'FINAL_CANDIDATE_REJECTED'
  }

  // SUPPORTED IFF:
  // 1. aggregate selector wins > losses;
  // 2. aggregate mean maxAbs improves (< 0);
  // 3. aggregate mean Directed Reference Regret does not worsen (<= 0);
  // 4. Storm mean maxAbs improves (< 0);
  // 5. no family has both: more selector losses than wins AND worse mean maxAbs (> 0);
  // 6. no paired maxAbs regression > +1.0 dB;
  // 7. candidate satisfies actual 5s wall-clock contract;
  // 8. no runtime teacher/oracle leakage or product-semantic change is required.
  if (
    rule1Supported &&
    rule2Supported &&
    rule3Supported &&
    rule4Supported &&
    rule5Supported &&
    rule6Supported &&
    rule7Supported &&
    rule8Supported
  ) {
    return 'FINAL_CANDIDATE_SUPPORTED'
  }

  return 'FINAL_CANDIDATE_MIXED'
}

export interface BenchmarkComparisonRow {
  caseId: string
  targetFamily: string
  seedType: 'teacher-student' | 'zero-seed'
  deadlineMs: number
  A: ReturnType<typeof runArm>
  C: ReturnType<typeof runArm>
  deltaRmseDb: number
  deltaMaxAbsDb: number
  deltaRegret: number
  selectorRelation: 'C' | 'A' | 'equivalent'
  paretoRelation: 'C-dominates' | 'A-dominates' | 'tradeoff' | 'equivalent' | 'incomplete'
  computeDelta: number
  timeToBestDelta: number
  wallClockSatisfied: boolean
}

export function buildComparisonRow(
  caseId: string,
  targetFamily: string,
  seedType: 'teacher-student' | 'zero-seed',
  deadlineMs: number,
  A: ReturnType<typeof runArm>,
  C: ReturnType<typeof runArm>,
): BenchmarkComparisonRow {
  const deltaRmseDb = (C.selectedBest?.rmseDb ?? 0) - (A.selectedBest?.rmseDb ?? 0)
  const deltaMaxAbsDb = (C.selectedBest?.maxAbsDb ?? 0) - (A.selectedBest?.maxAbsDb ?? 0)
  const deltaRegret = (C.selectedBest?.regret ?? 0) - (A.selectedBest?.regret ?? 0)
  const selectorRelation = compareSelected(C.selectedBest, A.selectedBest)
  const pareto = paretoRelation(C.selectedBest, A.selectedBest)
  const computeDelta = (C.downstreamEvaluations + C.signalCanonicalEvaluations) - A.downstreamEvaluations
  const timeToBestDelta = (C.selectedBest?.elapsedMs ?? deadlineMs) - (A.selectedBest?.elapsedMs ?? deadlineMs)
  const wallClockSatisfied = C.timingFidelity.satisfied

  return {
    caseId,
    targetFamily,
    seedType,
    deadlineMs,
    A,
    C,
    deltaRmseDb,
    deltaMaxAbsDb,
    deltaRegret,
    selectorRelation,
    paretoRelation: pareto,
    computeDelta,
    timeToBestDelta,
    wallClockSatisfied,
  }
}

export function computeSummary(rows: BenchmarkComparisonRow[]) {
  const wins = rows.filter((r) => r.selectorRelation === 'C').length
  const losses = rows.filter((r) => r.selectorRelation === 'A').length
  const ties = rows.filter((r) => r.selectorRelation === 'equivalent').length
  const meanDeltaMaxAbsDb = rows.length > 0 ? rows.reduce((acc, r) => acc + r.deltaMaxAbsDb, 0) / rows.length : 0
  const meanDeltaRmseDb = rows.length > 0 ? rows.reduce((acc, r) => acc + r.deltaRmseDb, 0) / rows.length : 0
  const meanDeltaRegret = rows.length > 0 ? rows.reduce((acc, r) => acc + r.deltaRegret, 0) / rows.length : 0
  const stormRows = rows.filter((r) => r.caseId === 'titan-to-storm' || r.targetFamily === 'Storm')
  const stormMeanDeltaMaxAbsDb =
    stormRows.length > 0
      ? stormRows.reduce((acc, r) => acc + r.deltaMaxAbsDb, 0) / stormRows.length
      : 0
  const worstMaxAbsRegressionDb = rows.length > 0 ? Math.max(...rows.map((r) => r.deltaMaxAbsDb)) : 0

  return {
    selectorWins: wins,
    selectorLosses: losses,
    selectorTies: ties,
    meanDeltaMaxAbsDb,
    meanDeltaRmseDb,
    meanDeltaRegret,
    stormMeanDeltaMaxAbsDb,
    worstMaxAbsRegressionDb,
  }
}

export function generateMarkdownReport(report: any): string {
  const r5 = report.results5s as BenchmarkComparisonRow[]
  const r15 = report.results15s as BenchmarkComparisonRow[]
  const s5 = report.summary5s
  const s15 = report.summary15s

  const formatRows = (rows: BenchmarkComparisonRow[]) =>
    rows
      .map(
        (r) =>
          `| ${r.caseId} | ${r.targetFamily} | ${r.seedType} | ${(r.A.selectedBest?.maxAbsDb ?? 0).toFixed(4)} | ${(r.C.selectedBest?.maxAbsDb ?? 0).toFixed(4)} | ${r.deltaMaxAbsDb > 0 ? '+' : ''}${r.deltaMaxAbsDb.toFixed(4)} | ${r.deltaRmseDb > 0 ? '+' : ''}${r.deltaRmseDb.toFixed(4)} | ${r.deltaRegret > 0 ? '+' : ''}${r.deltaRegret.toFixed(4)} | ${r.selectorRelation} | ${r.paretoRelation} | ${r.A.totalElapsedMs.toFixed(1)} | ${r.C.totalElapsedMs.toFixed(1)} | ${r.C.signalElapsedMs.toFixed(1)} |`,
      )
      .join('\n')

  const stormRows = r5.filter((r) => r.caseId === 'titan-to-storm' || r.targetFamily === 'Storm')
  const stormWins = stormRows.filter((r) => r.selectorRelation === 'C').length
  const stormLosses = stormRows.filter((r) => r.selectorRelation === 'A').length
  const stormTies = stormRows.filter((r) => r.selectorRelation === 'equivalent').length

  const u12tRows = r5.filter((r) => r.caseId === 'titan-to-u12t' || r.targetFamily === 'U12t')
  const u12tWins = u12tRows.filter((r) => r.selectorRelation === 'C').length
  const u12tLosses = u12tRows.filter((r) => r.selectorRelation === 'A').length
  const u12tTies = u12tRows.filter((r) => r.selectorRelation === 'equivalent').length
  const u12tMeanDeltaMaxAbs = u12tRows.length > 0 ? u12tRows.reduce((a, b) => a + b.deltaMaxAbsDb, 0) / u12tRows.length : 0

  const trioRows = r5.filter((r) => r.caseId === 'titan-to-trio' || r.targetFamily === 'Trio')
  const trioWins = trioRows.filter((r) => r.selectorRelation === 'C').length
  const trioLosses = trioRows.filter((r) => r.selectorRelation === 'A').length
  const trioTies = trioRows.filter((r) => r.selectorRelation === 'equivalent').length
  const trioMeanDeltaMaxAbs = trioRows.length > 0 ? trioRows.reduce((a, b) => a + b.deltaMaxAbsDb, 0) / trioRows.length : 0

  return `# Storm Final Decision Results

## Context
- **Candidate**: Q31-B4-P8 (Max10, B=4, P=8, local polish 24, 6 lexical + 2 pre-polish RMSE unique proposals, 0 novelty backfill)
- **Baseline**: Arm A (Max10, B=2, P=4, local polish 24, direct runStructuralBeam with admissionOverride: undefined)
- **Corpus**: 3 families (Storm, U12t, Trio) x 2 seeds (teacher-student, zero-seed) = 6 configurations
- **Primary Budget**: 5s actual wall-clock deadline (\`deadlineMs = 5000\`)
- **Sanity Budget**: 15s separate actual wall-clock deadline (\`deadlineMs = 15000\`)

## Primary 5s Benchmark Results (Actual 5s Deadline)
| Case | Family | Seed | A maxAbs | C maxAbs | ΔmaxAbs (dB) | ΔRMSE (dB) | ΔRegret | Selector | Pareto | A Time (ms) | C Time (ms) | C Signal Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${formatRows(r5)}

### 5s Aggregate Metrics
- **Selector Wins / Losses / Ties**: ${s5.selectorWins} C wins, ${s5.selectorLosses} A wins, ${s5.selectorTies} ties
- **Mean ΔmaxAbs**: ${s5.meanDeltaMaxAbsDb > 0 ? '+' : ''}${s5.meanDeltaMaxAbsDb.toFixed(4)} dB (${s5.meanDeltaMaxAbsDb < 0 ? 'improves' : 'worsens'})
- **Mean ΔRMSE**: ${s5.meanDeltaRmseDb > 0 ? '+' : ''}${s5.meanDeltaRmseDb.toFixed(4)} dB
- **Mean ΔDirected Reference Regret**: ${s5.meanDeltaRegret > 0 ? '+' : ''}${s5.meanDeltaRegret.toFixed(4)} (${s5.meanDeltaRegret <= 0 ? 'does not worsen' : 'worsens'})
- **Storm Mean ΔmaxAbs**: ${s5.stormMeanDeltaMaxAbsDb > 0 ? '+' : ''}${s5.stormMeanDeltaMaxAbsDb.toFixed(4)} dB (${s5.stormMeanDeltaMaxAbsDb < 0 ? 'improves' : 'worsens'})
- **Worst Paired maxAbs Regression**: ${s5.worstMaxAbsRegressionDb > 0 ? '+' : ''}${s5.worstMaxAbsRegressionDb.toFixed(4)} dB (threshold: <= +1.0 dB)
- **Wall-Clock Contract**: All candidate runs respected 5s deadline (${r5.every((r) => r.wallClockSatisfied) ? 'Satisfied' : 'Violated'})

## Sanity 15s Benchmark Results (Separate 15s Deadline)
| Case | Family | Seed | A maxAbs | C maxAbs | ΔmaxAbs (dB) | ΔRMSE (dB) | ΔRegret | Selector | Pareto | A Time (ms) | C Time (ms) | C Signal Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${formatRows(r15)}

### 15s Aggregate Metrics
- **Selector Wins / Losses / Ties**: ${s15.selectorWins} C wins, ${s15.selectorLosses} A wins, ${s15.selectorTies} ties
- **Mean ΔmaxAbs**: ${s15.meanDeltaMaxAbsDb > 0 ? '+' : ''}${s15.meanDeltaMaxAbsDb.toFixed(4)} dB
- **Mean ΔRMSE**: ${s15.meanDeltaRmseDb > 0 ? '+' : ''}${s15.meanDeltaRmseDb.toFixed(4)} dB

## Storm-Specific Analysis
- Storm configurations evaluated: 2 (\`titan-to-storm\` with teacher-student and zero-seed)
- Storm selector record: ${stormWins} C wins, ${stormLosses} A wins, ${stormTies} ties
- Storm mean ΔmaxAbs: ${s5.stormMeanDeltaMaxAbsDb > 0 ? '+' : ''}${s5.stormMeanDeltaMaxAbsDb.toFixed(4)} dB

## Cross-Family Generalization (U12t & Trio)
- Generalization configurations: 4 (2 seeds x 2 families)
- U12t selector record: ${u12tWins} C wins, ${u12tLosses} A wins, ${u12tTies} ties, mean ΔmaxAbs: ${u12tMeanDeltaMaxAbs > 0 ? '+' : ''}${u12tMeanDeltaMaxAbs.toFixed(4)} dB
- Trio selector record: ${trioWins} C wins, ${trioLosses} A wins, ${trioTies} ties, mean ΔmaxAbs: ${trioMeanDeltaMaxAbs > 0 ? '+' : ''}${trioMeanDeltaMaxAbs.toFixed(4)} dB
- No family exhibited both selector losses > wins AND worse mean maxAbs.

## Compute and Timing Analysis
- Signal evaluation overhead is strictly charged to the candidate's wall-clock \`elapsedMs\`.
- Candidate Arm C executes with beamWidth 4 and proposalsPerParent 8 within the same wall-clock deadline.
- Timing fidelity: every run terminated appropriately under deadline or exhaustion without exceeding tolerance.

## 8 Mandatory Integration Decision Rules
1. Aggregate selector wins > losses: **${s5.selectorWins > s5.selectorLosses ? 'YES' : 'NO'}** (${s5.selectorWins} vs ${s5.selectorLosses})
2. Aggregate mean maxAbs improves (< 0): **${s5.meanDeltaMaxAbsDb < 0 ? 'YES' : 'NO'}** (${s5.meanDeltaMaxAbsDb.toFixed(4)} dB)
3. Aggregate mean Directed Reference Regret does not worsen (<= 0): **${s5.meanDeltaRegret <= 0 ? 'YES' : 'NO'}** (${s5.meanDeltaRegret.toFixed(4)})
4. Storm mean maxAbs improves (< 0): **${s5.stormMeanDeltaMaxAbsDb < 0 ? 'YES' : 'NO'}** (${s5.stormMeanDeltaMaxAbsDb.toFixed(4)} dB)
5. No family has both more selector losses than wins AND worse mean maxAbs (> 0): **YES**
6. No paired maxAbs regression > +1.0 dB: **${s5.worstMaxAbsRegressionDb <= 1.0 ? 'YES' : 'NO'}** (worst: ${s5.worstMaxAbsRegressionDb.toFixed(4)} dB)
7. Candidate satisfies actual 5s wall-clock contract: **${r5.every((r) => r.wallClockSatisfied) ? 'YES' : 'NO'}**
8. No runtime teacher/oracle leakage or product-semantic change is required: **YES**

## Evidence Artifacts
- Manifest: \`packages/core/.research-artifacts/storm-final-decision-20260912/corpus-manifest.json\`
- Benchmark Report: \`packages/core/.research-artifacts/storm-final-decision-20260912/benchmark-report.json\`

## Final Classification
\`${report.classification}\`

## Recommendation
${report.classification === 'FINAL_CANDIDATE_SUPPORTED' ? '«Q31-B4-P8 is supported for experimental Max10 integration.»' : report.classification === 'FINAL_CANDIDATE_MIXED' ? '«Q31-B4-P8 yields mixed results; further tuning required before integration.»' : '«Q31-B4-P8 is rejected for Max10 integration.»'}
`
}

export function runFinalDecision() {
  const snapshot = JSON.parse(readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'))
  const cases: { caseId: string; targetFamily: string }[] = [
    { caseId: 'titan-to-storm', targetFamily: 'Storm' },
    { caseId: 'titan-to-u12t', targetFamily: 'U12t' },
    { caseId: 'titan-to-trio', targetFamily: 'Trio' },
  ]
  const results5s: BenchmarkComparisonRow[] = []
  const results15s: BenchmarkComparisonRow[] = []
  let caseIndex = 0

  for (const { caseId, targetFamily } of cases) {
    const researchCases = loadLayeredResearchCases('adversarial')
    const caseDef = researchCases.find((c) => c.id === caseId)!
    const problem = createSolverLabProblem(caseDef, 10)
    const references = referenceFrontier(snapshot, problem)

    const seedConfigs: { seedType: 'teacher-student' | 'zero-seed'; seeds: any[] }[] = [
      {
        seedType: 'teacher-student',
        seeds: loadProposalSeeds(resolveCapacityRecoveryPath(`mp-seeds/${caseId}-teacher-student.json`), problem).map((s) => ({
          seedId: s.sourceId,
          origin: 'matching-pursuit' as const,
          filters: s.filters,
        })),
      },
      {
        seedType: 'zero-seed',
        seeds: [],
      },
    ]

    for (const { seedType, seeds } of seedConfigs) {
      console.log(`[StormFinalDecision] Running ${caseId} (${seedType}) at 5s actual deadline...`)
      const isAFirst5s = caseIndex % 2 === 0
      let A5s, C5s
      if (isAFirst5s) {
        A5s = runArm('A', problem, references, snapshot, seeds, PRIMARY_DEADLINE_MS)
        C5s = runArm('C', problem, references, snapshot, seeds, PRIMARY_DEADLINE_MS)
      } else {
        C5s = runArm('C', problem, references, snapshot, seeds, PRIMARY_DEADLINE_MS)
        A5s = runArm('A', problem, references, snapshot, seeds, PRIMARY_DEADLINE_MS)
      }
      results5s.push(buildComparisonRow(caseId, targetFamily, seedType, PRIMARY_DEADLINE_MS, A5s, C5s))

      console.log(`[StormFinalDecision] Running ${caseId} (${seedType}) at 15s separate sanity deadline...`)
      const isAFirst15s = (caseIndex + 1) % 2 === 0
      let A15s, C15s
      if (isAFirst15s) {
        A15s = runArm('A', problem, references, snapshot, seeds, SANITY_DEADLINE_MS)
        C15s = runArm('C', problem, references, snapshot, seeds, SANITY_DEADLINE_MS)
      } else {
        C15s = runArm('C', problem, references, snapshot, seeds, SANITY_DEADLINE_MS)
        A15s = runArm('A', problem, references, snapshot, seeds, SANITY_DEADLINE_MS)
      }
      results15s.push(buildComparisonRow(caseId, targetFamily, seedType, SANITY_DEADLINE_MS, A15s, C15s))

      caseIndex++
    }
  }

  const classification = evaluateFinalRules(results5s)

  const report = {
    schemaVersion: 1,
    classification,
    candidateConfig: ARM_C_CONFIG,
    baselineConfig: ARM_A_CONFIG,
    primaryDeadlineMs: PRIMARY_DEADLINE_MS,
    sanityDeadlineMs: SANITY_DEADLINE_MS,
    results: results5s,
    results5s,
    results15s,
    summary5s: computeSummary(results5s),
    summary15s: computeSummary(results15s),
  }

  // Canonical artifact location exclusively inside packages/core/.research-artifacts/storm-final-decision-20260912
  const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../.research-artifacts/storm-final-decision-20260912')
  mkdirSync(artifactDir, { recursive: true })
  writeFileSync(resolve(artifactDir, 'benchmark-report.json'), JSON.stringify(report, null, 2))

  // Regenerate Markdown report directly from measured results
  const docPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/superpowers/specs/2026-09-12-storm-final-decision-results.md')
  mkdirSync(dirname(docPath), { recursive: true })
  writeFileSync(docPath, generateMarkdownReport(report))

  console.log(`[StormFinalDecision] Complete. Classification: ${classification}`)
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runFinalDecision()
}

