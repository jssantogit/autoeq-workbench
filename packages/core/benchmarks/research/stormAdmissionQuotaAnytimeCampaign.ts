import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { referenceSelectorKey } from './referenceSelector.js'
import {
  quantizeStructuralBeamFilters,
  runStructuralBeam,
  type StructuralBeamAdmissionOverride,
  type StructuralProposal,
} from './structuralBeam.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import {
  generateIndependentPolicyCells,
  STRUCTURAL_CONFIG,
} from './stormAdmissionIndependentPolicyValidation.js'
import { buildQuotaSelection } from './stormAdmissionQuotaCampaign.js'

export const ANYTIME_CHECKPOINTS_MS = Object.freeze([5_000, 15_000, 30_000, 60_000] as const)
export const ANYTIME_EVALUATION_BUDGET_CEILING = 100_000 as const

export const ANYTIME_PANEL_CELL_IDS = Object.freeze([
  'u12t-sparse-0002',
  'u12t-sparse-0008',
  'trio-sparse-0002',
  'trio-sparse-0008',
  'storm-replacement-holdout-01',
  'storm-replacement-holdout-06',
] as const)

export const ANYTIME_ARMS = Object.freeze([
  { armId: 'Q31', lexicalQuota: 3, rmseQuota: 1 },
  { armId: 'Q04', lexicalQuota: 0, rmseQuota: 4 },
] as const)

type AnytimeArm = typeof ANYTIME_ARMS[number]
type GeneratedPolicyCell = ReturnType<typeof generateIndependentPolicyCells>[number]

interface SignalEvent {
  elapsedMs: number
  canonicalEvaluations: number
}

interface SignalLedger {
  canonicalEvaluations: number
  elapsedMs: number
  events: SignalEvent[]
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

function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

function createAnytimeQuotaOverride(
  arm: AnytimeArm,
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
          candidateId: `anytime-quota-probe-${lexicalRank}`,
          algorithmId: 'anytime-quota-probe',
          seed: 0,
          filters: delivered,
        })
        ledger.canonicalEvaluations += 1
        ledger.events.push({
          elapsedMs: elapsedMs(),
          canonicalEvaluations: ledger.canonicalEvaluations,
        })
        if (!evaluation.valid || evaluation.deliverable === null) {
          throw new Error('anytime quota pre-polish probe failed')
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

      const rmseRanked = [...scored].sort((left, right) =>
        left.rmseDb - right.rmseDb ||
        left.maxAbsDb - right.maxAbsDb ||
        left.filterCount - right.filterCount ||
        left.cancellationScore - right.cancellationScore ||
        left.lexicalRank - right.lexicalRank)

      const selected = buildQuotaSelection(
        scored,
        rmseRanked,
        arm.lexicalQuota,
        arm.rmseQuota,
      )
      return {
        proposals: selected.map((entry) => entry.proposal),
        intervention: 'custom',
      }
    },
  }
}

function selectedBestAt(trajectory: readonly any[], checkpointMs: number) {
  const eligible = trajectory.filter((point) => point.elapsedMs <= checkpointMs)
  const best = eligible.at(-1)
  if (best === undefined) return null
  return {
    candidateId: best.candidateId,
    rmseDb: best.canonicalRmseDb,
    maxAbsDb: best.canonicalMaxAbsDb,
    filterCount: best.actualDeliveredFilterCount,
    regret: best.referenceRegret,
    referenceImproved: best.referenceImproved,
    evaluationCount: best.evaluationCount + 1,
    elapsedMs: best.elapsedMs,
  }
}

export function compareSelected(left: any, right: any): 'Q31' | 'Q04' | 'equivalent' {
  if (left === null && right === null) return 'equivalent'
  if (left === null) return 'Q04'
  if (right === null) return 'Q31'

  const epsilon = 1e-12
  if (
    Math.abs(left.rmseDb - right.rmseDb) <= epsilon &&
    Math.abs(left.maxAbsDb - right.maxAbsDb) <= epsilon &&
    left.filterCount === right.filterCount
  ) return 'equivalent'

  const leftKey = referenceSelectorKey({
    candidateId: left.candidateId,
    rmseDb: left.rmseDb,
    maxAbsDb: left.maxAbsDb,
    filterCount: left.filterCount,
    cancellationScore: 0,
  })
  const rightKey = referenceSelectorKey({
    candidateId: right.candidateId,
    rmseDb: right.rmseDb,
    maxAbsDb: right.maxAbsDb,
    filterCount: right.filterCount,
    cancellationScore: 0,
  })
  for (let index = 0; index < Math.max(leftKey.length, rightKey.length); index += 1) {
    const l = leftKey[index]
    const r = rightKey[index]
    if (l === undefined || r === undefined) throw new Error('selector key mismatch')
    if (l < r) return 'Q31'
    if (l > r) return 'Q04'
  }
  return 'equivalent'
}

export function paretoRelation(left: any, right: any) {
  if (left === null || right === null) return 'incomplete'
  const epsilon = 1e-12
  if (
    Math.abs(left.rmseDb - right.rmseDb) <= epsilon &&
    Math.abs(left.maxAbsDb - right.maxAbsDb) <= epsilon
  ) return 'equivalent'
  const dominates = (a: any, b: any) =>
    a.rmseDb <= b.rmseDb + epsilon &&
    a.maxAbsDb <= b.maxAbsDb + epsilon &&
    (a.rmseDb < b.rmseDb - epsilon || a.maxAbsDb < b.maxAbsDb - epsilon)
  const leftDominates = dominates(left, right)
  const rightDominates = dominates(right, left)
  if (leftDominates && !rightDominates) return 'Q31-dominates'
  if (rightDominates && !leftDominates) return 'Q04-dominates'
  if (!leftDominates && !rightDominates) return 'tradeoff'
  return 'equivalent'
}

function signalEvaluationsAt(ledger: SignalLedger, checkpointMs: number): number {
  let count = 0
  for (const event of ledger.events) {
    if (event.elapsedMs <= checkpointMs) count = event.canonicalEvaluations
    else break
  }
  return count
}

function runAnytimeArm(
  arm: AnytimeArm,
  cell: GeneratedPolicyCell,
  snapshot: OracleReferenceSnapshotV1,
) {
  const caseDef = loadLayeredResearchCases('adversarial')
    .find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case for cell: ${cell.cellId}`)

  const problem = createSolverLabProblem(caseDef, 10)
  const references = referenceFrontier(snapshot, problem)
  const ledger: SignalLedger = { canonicalEvaluations: 0, elapsedMs: 0, events: [] }
  const started = performance.now()
  const nowMs = () => performance.now()
  const elapsedMs = () => performance.now() - started
  const isExpired = () => elapsedMs() >= 60_000

  const result = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: ANYTIME_EVALUATION_BUDGET_CEILING,
    referenceFrontier: references,
    referenceSnapshotSha256: snapshot.contentSha256,
    config: STRUCTURAL_CONFIG,
    seeds: [{
      seedId: cell.sourceCandidateId,
      origin: 'matching-pursuit',
      filters: cell.filters,
    }],
    includeZeroSeed: false,
    admissionOverride: createAnytimeQuotaOverride(arm, problem, ledger, elapsedMs),
    nowMs,
    elapsedMs,
    isExpired,
  })

  const totalElapsedMs = elapsedMs()
  const checkpoints = ANYTIME_CHECKPOINTS_MS.map((checkpointMs) => {
    const selectedBest = selectedBestAt(result.trajectory, checkpointMs)
    return {
      checkpointMs,
      selectedBest,
      downstreamEvaluations: selectedBest?.evaluationCount ?? 0,
      signalCanonicalEvaluations: signalEvaluationsAt(ledger, checkpointMs),
    }
  })

  return {
    armId: arm.armId,
    quota: { lexical: arm.lexicalQuota, rmse: arm.rmseQuota },
    stopReason: result.stopReason,
    totalElapsedMs,
    totalDownstreamEvaluations: result.evaluations.length,
    totalSignalCanonicalEvaluations: ledger.canonicalEvaluations,
    totalSignalElapsedMs: ledger.elapsedMs,
    evaluationBudgetCeiling: ANYTIME_EVALUATION_BUDGET_CEILING,
    budgetCeilingHit: result.stopReason === 'evaluation-budget',
    naturallyExhausted: result.stopReason === 'no-admissible-proposals',
    deadlineHit: result.stopReason === 'deadline',
    checkpoints,
  }
}

export function classifyAnytimeCampaign(
  checkpointSummaries: readonly {
    checkpointMs: number
    q31Wins: number
    q04Wins: number
    ties: number
  }[],
  allRunsExhaustedBeforeFirstCheckpoint: boolean,
): 'search-exhausted-before-first-checkpoint' | 'Q31-anytime-favorable' | 'Q04-anytime-favorable' | 'anytime-tradeoff' {
  if (allRunsExhaustedBeforeFirstCheckpoint) return 'search-exhausted-before-first-checkpoint'
  const q31 = checkpointSummaries.reduce((sum, row) => sum + row.q31Wins, 0)
  const q04 = checkpointSummaries.reduce((sum, row) => sum + row.q04Wins, 0)
  if (q31 > q04) return 'Q31-anytime-favorable'
  if (q04 > q31) return 'Q04-anytime-favorable'
  return 'anytime-tradeoff'
}

export function runAnytimeCampaign() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const allCells = generateIndependentPolicyCells(snapshot)
  const cells = ANYTIME_PANEL_CELL_IDS.map((cellId) => {
    const cell = allCells.find((candidate) => candidate.cellId === cellId)
    if (cell === undefined) throw new Error(`missing anytime panel cell: ${cellId}`)
    return cell
  })

  const results: any[] = []
  for (const cell of cells) {
    const Q31 = runAnytimeArm(ANYTIME_ARMS[0], cell, snapshot)
    const Q04 = runAnytimeArm(ANYTIME_ARMS[1], cell, snapshot)

    const comparisons = ANYTIME_CHECKPOINTS_MS.map((checkpointMs) => {
      const left = Q31.checkpoints.find((checkpoint) => checkpoint.checkpointMs === checkpointMs)!
      const right = Q04.checkpoints.find((checkpoint) => checkpoint.checkpointMs === checkpointMs)!
      return {
        checkpointMs,
        selectorWinner: compareSelected(left.selectedBest, right.selectedBest),
        paretoRelation: paretoRelation(left.selectedBest, right.selectedBest),
        deltaRmseDb: left.selectedBest !== null && right.selectedBest !== null
          ? left.selectedBest.rmseDb - right.selectedBest.rmseDb
          : null,
        deltaMaxAbsDb: left.selectedBest !== null && right.selectedBest !== null
          ? left.selectedBest.maxAbsDb - right.selectedBest.maxAbsDb
          : null,
        deltaRegret: left.selectedBest !== null && right.selectedBest !== null
          ? left.selectedBest.regret - right.selectedBest.regret
          : null,
      }
    })

    results.push({
      cellId: cell.cellId,
      caseId: cell.caseId,
      sourceCandidateId: cell.sourceCandidateId,
      initialFilterCount: cell.initialFilterCount,
      arms: { Q31, Q04 },
      comparisons,
    })
  }

  const checkpoints = ANYTIME_CHECKPOINTS_MS.map((checkpointMs) => {
    const rows = results.map((row) =>
      row.comparisons.find((comparison: any) => comparison.checkpointMs === checkpointMs))
    const finite = (key: string) =>
      rows.map((row: any) => row[key]).filter((value: any) => typeof value === 'number') as number[]
    const mean = (values: number[]) =>
      values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
    return {
      checkpointMs,
      q31Wins: rows.filter((row: any) => row.selectorWinner === 'Q31').length,
      q04Wins: rows.filter((row: any) => row.selectorWinner === 'Q04').length,
      ties: rows.filter((row: any) => row.selectorWinner === 'equivalent').length,
      pareto: {
        q31Dominates: rows.filter((row: any) => row.paretoRelation === 'Q31-dominates').length,
        q04Dominates: rows.filter((row: any) => row.paretoRelation === 'Q04-dominates').length,
        tradeoffs: rows.filter((row: any) => row.paretoRelation === 'tradeoff').length,
        equivalent: rows.filter((row: any) => row.paretoRelation === 'equivalent').length,
      },
      meanDeltaRmseDb: mean(finite('deltaRmseDb')),
      meanDeltaMaxAbsDb: mean(finite('deltaMaxAbsDb')),
      meanDeltaRegret: mean(finite('deltaRegret')),
      totalWork: {
        Q31: {
          downstreamEvaluations: results.reduce((sum, row) =>
            sum + row.arms.Q31.checkpoints.find((c: any) => c.checkpointMs === checkpointMs).downstreamEvaluations, 0),
          signalCanonicalEvaluations: results.reduce((sum, row) =>
            sum + row.arms.Q31.checkpoints.find((c: any) => c.checkpointMs === checkpointMs).signalCanonicalEvaluations, 0),
        },
        Q04: {
          downstreamEvaluations: results.reduce((sum, row) =>
            sum + row.arms.Q04.checkpoints.find((c: any) => c.checkpointMs === checkpointMs).downstreamEvaluations, 0),
          signalCanonicalEvaluations: results.reduce((sum, row) =>
            sum + row.arms.Q04.checkpoints.find((c: any) => c.checkpointMs === checkpointMs).signalCanonicalEvaluations, 0),
        },
      },
    }
  })

  const firstCheckpointMs = ANYTIME_CHECKPOINTS_MS[0]
  const allRunsExhaustedBeforeFirstCheckpoint = results.every((row) =>
    row.arms.Q31.naturallyExhausted &&
    row.arms.Q04.naturallyExhausted &&
    row.arms.Q31.totalElapsedMs < firstCheckpointMs &&
    row.arms.Q04.totalElapsedMs < firstCheckpointMs)
  const classification = classifyAnytimeCampaign(
    checkpoints,
    allRunsExhaustedBeforeFirstCheckpoint,
  )
  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-admission-quota-anytime-v1',
    predecessorSha: '2bdcfbbe6b80f5f2f1682eac943d828d04f3abfd',
    objective: 'Compare Q31 versus Q04 under a shared wall-clock that charges admission signal overhead.',
    panel: {
      selectionRule: 'fixed stratified positions, not selected by quota outcome',
      cellIds: ANYTIME_PANEL_CELL_IDS,
      caveat: 'diagnostic timing panel on previously generated states; not independent corpus validation',
    },
    protocol: {
      checkpointsMs: ANYTIME_CHECKPOINTS_MS,
      evaluationBudgetCeiling: ANYTIME_EVALUATION_BUDGET_CEILING,
      structuralConfig: STRUCTURAL_CONFIG,
      wallClockIncludesAdmissionSignal: true,
      oneRunPerArmCell: true,
      checkpointsExtractedFromSingle60SecondTrajectory: true,
      noPostOutcomeBudgetExtension: true,
      allRunsExhaustedBeforeFirstCheckpoint,
    },
    results,
    checkpointSummaries: checkpoints,
    classification,
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-admission-quota-anytime-20260911/campaign-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-admission-quota-anytime-results.md',
  )
  const lines = [
    '# Storm Admission Q31 vs Q04 Cost-Aware Anytime Results',
    '',
    'Wall-clock includes admission-time pre-polish canonical scoring.',
    '',
    '| Checkpoint | Q31 wins | Q04 wins | Ties | Mean ΔRMSE (Q31-Q04) | Mean ΔmaxAbs | Mean ΔRegret | Q31 work D/S | Q04 work D/S |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...checkpoints.map((checkpoint) =>
      `| ${checkpoint.checkpointMs / 1000}s | ${checkpoint.q31Wins} | ${checkpoint.q04Wins} | ${checkpoint.ties} | ${checkpoint.meanDeltaRmseDb?.toFixed(6) ?? 'n/a'} | ${checkpoint.meanDeltaMaxAbsDb?.toFixed(6) ?? 'n/a'} | ${checkpoint.meanDeltaRegret?.toFixed(6) ?? 'n/a'} | ${checkpoint.totalWork.Q31.downstreamEvaluations}/${checkpoint.totalWork.Q31.signalCanonicalEvaluations} | ${checkpoint.totalWork.Q04.downstreamEvaluations}/${checkpoint.totalWork.Q04.signalCanonicalEvaluations} |`),
    '',
    `Classification: ${classification}`,
    '',
    allRunsExhaustedBeforeFirstCheckpoint
      ? 'All Q31/Q04 runs naturally exhausted before 5 seconds; 5/15/30/60 second checkpoints therefore repeat the same terminal state and do not measure additional anytime scaling.'
      : 'At least one run remained active through the first checkpoint, so checkpoint differences contain actual anytime information.',
    'D/S means downstream canonical evaluations / admission-signal canonical evaluations accumulated by the checkpoint.',
    'This timing panel is diagnostic and does not establish independent corpus generalization.',
    '',
  ]
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, lines.join('\n'))

  process.stdout.write(JSON.stringify({
    checkpointSummaries: checkpoints,
    allRunsExhaustedBeforeFirstCheckpoint,
    classification,
    stopReasons: results.map((row) => ({
      cellId: row.cellId,
      Q31: {
        stopReason: row.arms.Q31.stopReason,
        totalElapsedMs: row.arms.Q31.totalElapsedMs,
        downstreamEvaluations: row.arms.Q31.totalDownstreamEvaluations,
        signalEvaluations: row.arms.Q31.totalSignalCanonicalEvaluations,
      },
      Q04: {
        stopReason: row.arms.Q04.stopReason,
        totalElapsedMs: row.arms.Q04.totalElapsedMs,
        downstreamEvaluations: row.arms.Q04.totalDownstreamEvaluations,
        signalEvaluations: row.arms.Q04.totalSignalCanonicalEvaluations,
      },
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runAnytimeCampaign()
}
