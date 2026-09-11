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
  STRUCTURAL_EVALUATION_BUDGET,
} from './stormAdmissionIndependentPolicyValidation.js'

export const QUOTA_ARMS = Object.freeze([
  { armId: 'Q40', lexicalQuota: 4, rmseQuota: 0 },
  { armId: 'Q31', lexicalQuota: 3, rmseQuota: 1 },
  { armId: 'Q22', lexicalQuota: 2, rmseQuota: 2 },
  { armId: 'Q13', lexicalQuota: 1, rmseQuota: 3 },
  { armId: 'Q04', lexicalQuota: 0, rmseQuota: 4 },
] as const)

export type QuotaArmId = typeof QUOTA_ARMS[number]['armId']
type GeneratedPolicyCell = ReturnType<typeof generateIndependentPolicyCells>[number]

interface SignalOverhead {
  canonicalEvaluations: number
  elapsedMs: number
}

interface QuotaSelectionItem {
  key: string
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

export function buildQuotaSelection<T extends QuotaSelectionItem>(
  lexicalRanked: readonly T[],
  rmseRanked: readonly T[],
  lexicalQuota: number,
  rmseQuota: number,
): T[] {
  if (lexicalQuota < 0 || rmseQuota < 0 || lexicalQuota + rmseQuota !== 4) {
    throw new Error('quota must be non-negative and sum to four')
  }

  const selected: T[] = []
  const seen = new Set<string>()
  const take = (ranking: readonly T[], count: number) => {
    let added = 0
    for (const item of ranking) {
      if (added >= count) break
      if (seen.has(item.key)) continue
      seen.add(item.key)
      selected.push(item)
      added += 1
    }
  }

  take(lexicalRanked, lexicalQuota)
  take(rmseRanked, rmseQuota)
  if (selected.length < 4) take(lexicalRanked, 4 - selected.length)
  if (selected.length < 4) take(rmseRanked, 4 - selected.length)
  return selected.slice(0, 4)
}

function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

function createQuotaOverride(
  arm: typeof QUOTA_ARMS[number],
  problem: SolverLabProblemV1,
  overhead: SignalOverhead,
): StructuralBeamAdmissionOverride | undefined {
  if (arm.armId === 'Q40') return undefined

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
        overhead.canonicalEvaluations += 1
        if (!evaluation.valid || evaluation.deliverable === null) {
          throw new Error('quota pre-polish probe failed')
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
      overhead.elapsedMs += performance.now() - started

      const lexicalRanked = [...scored]
      const rmseRanked = [...scored].sort((left, right) =>
        left.rmseDb - right.rmseDb ||
        left.maxAbsDb - right.maxAbsDb ||
        left.filterCount - right.filterCount ||
        left.cancellationScore - right.cancellationScore ||
        left.lexicalRank - right.lexicalRank)

      const selected = buildQuotaSelection(
        lexicalRanked,
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

function compareSelected(left: any, right: any): 'candidate' | 'control' | 'equivalent' {
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
    if (l < r) return 'candidate'
    if (l > r) return 'control'
  }
  return 'equivalent'
}

function paretoRelation(candidate: any, control: any) {
  const epsilon = 1e-12
  const dominates = (left: any, right: any) =>
    left.rmseDb <= right.rmseDb + epsilon &&
    left.maxAbsDb <= right.maxAbsDb + epsilon &&
    (
      left.rmseDb < right.rmseDb - epsilon ||
      left.maxAbsDb < right.maxAbsDb - epsilon
    )

  const candidateDominates = dominates(candidate, control)
  const controlDominates = dominates(control, candidate)
  if (candidateDominates && !controlDominates) return 'candidate-dominates'
  if (controlDominates && !candidateDominates) return 'control-dominates'
  if (!candidateDominates && !controlDominates) return 'tradeoff'
  return 'equivalent'
}

function runQuotaArm(
  arm: typeof QUOTA_ARMS[number],
  cell: GeneratedPolicyCell,
  snapshot: OracleReferenceSnapshotV1,
) {
  const caseDef = loadLayeredResearchCases('adversarial')
    .find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case for cell: ${cell.cellId}`)

  const problem = createSolverLabProblem(caseDef, 10)
  const references = referenceFrontier(snapshot, problem)
  const overhead: SignalOverhead = { canonicalEvaluations: 0, elapsedMs: 0 }

  const result = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: STRUCTURAL_EVALUATION_BUDGET,
    referenceFrontier: references,
    referenceSnapshotSha256: snapshot.contentSha256,
    config: STRUCTURAL_CONFIG,
    seeds: [{
      seedId: cell.sourceCandidateId,
      origin: 'matching-pursuit',
      filters: cell.filters,
    }],
    includeZeroSeed: false,
    admissionOverride: createQuotaOverride(arm, problem, overhead),
  })

  const best = result.trajectory.at(-1)
  if (best === undefined) throw new Error(`missing selected best: ${cell.cellId}/${arm.armId}`)

  return {
    quota: { lexical: arm.lexicalQuota, rmse: arm.rmseQuota },
    selectedBest: {
      candidateId: best.candidateId,
      rmseDb: best.canonicalRmseDb,
      maxAbsDb: best.canonicalMaxAbsDb,
      filterCount: best.actualDeliveredFilterCount,
      regret: best.referenceRegret,
      referenceImproved: best.referenceImproved,
      evaluationCount: best.evaluationCount,
    },
    realizedDownstreamEvaluations: result.evaluations.length,
    descendantEvaluations: Math.max(0, result.evaluations.length - 1),
    coordinateTrials: result.evaluations.length * STRUCTURAL_CONFIG.localPolishEvaluations,
    signalOverheadCanonicalEvaluations: overhead.canonicalEvaluations,
    signalOverheadElapsedMs: overhead.elapsedMs,
    stopReason: result.stopReason,
  }
}

function summarizeRelations(rows: any[], armId: QuotaArmId) {
  const summary = {
    wins: 0,
    losses: 0,
    ties: 0,
    lowStart: { wins: 0, losses: 0, ties: 0 },
    highStart: { wins: 0, losses: 0, ties: 0 },
    byCase: {} as Record<string, { wins: number; losses: number; ties: number }>,
    meanDeltaRmseDb: 0,
    meanDeltaMaxAbsDb: 0,
    meanDeltaRegret: 0,
    totalSignalOverheadCanonicalEvaluations: 0,
    totalSignalOverheadElapsedMs: 0,
    totalDownstreamEvaluations: 0,
  }
  const rmse: number[] = []
  const maxAbs: number[] = []
  const regret: number[] = []

  for (const row of rows) {
    const control = row.arms.Q40
    const arm = row.arms[armId]
    const relation = arm.relationToControl as 'candidate' | 'control' | 'equivalent'
    const bucket = row.initialFilterCount <= 4 ? summary.lowStart : summary.highStart
    const byCase = summary.byCase[row.caseId] ?? { wins: 0, losses: 0, ties: 0 }
    summary.byCase[row.caseId] = byCase

    if (relation === 'candidate') {
      summary.wins += 1; bucket.wins += 1; byCase.wins += 1
    } else if (relation === 'control') {
      summary.losses += 1; bucket.losses += 1; byCase.losses += 1
    } else {
      summary.ties += 1; bucket.ties += 1; byCase.ties += 1
    }

    rmse.push(arm.selectedBest.rmseDb - control.selectedBest.rmseDb)
    maxAbs.push(arm.selectedBest.maxAbsDb - control.selectedBest.maxAbsDb)
    regret.push(arm.selectedBest.regret - control.selectedBest.regret)
    summary.totalSignalOverheadCanonicalEvaluations += arm.signalOverheadCanonicalEvaluations
    summary.totalSignalOverheadElapsedMs += arm.signalOverheadElapsedMs
    summary.totalDownstreamEvaluations += arm.realizedDownstreamEvaluations
  }

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
  summary.meanDeltaRmseDb = mean(rmse)
  summary.meanDeltaMaxAbsDb = mean(maxAbs)
  summary.meanDeltaRegret = mean(regret)
  return summary
}

export function quotaParetoFrontier(
  aggregate: Record<string, { wins: number; losses: number }>,
): string[] {
  const ids = Object.keys(aggregate)
  return ids.filter((id) => {
    const point = aggregate[id]!
    return !ids.some((otherId) => {
      if (otherId === id) return false
      const other = aggregate[otherId]!
      return other.wins >= point.wins &&
        other.losses <= point.losses &&
        (other.wins > point.wins || other.losses < point.losses)
    })
  })
}

export function classifyQuotaCampaign(
  aggregate: Record<string, { wins: number; losses: number }>,
): 'hybrid-dominates-pure-rmse' | 'hybrid-tradeoff-only' | 'pure-rmse-remains-best-quality-arm' {
  const pure = aggregate.Q04!
  const hybrids = ['Q31', 'Q22', 'Q13'].map((id) => aggregate[id]!)

  const dominatesPure = hybrids.some((point) =>
    point.wins >= pure.wins &&
    point.losses <= pure.losses &&
    (point.wins > pure.wins || point.losses < pure.losses))
  if (dominatesPure) return 'hybrid-dominates-pure-rmse'

  if (hybrids.some((point) => point.losses < pure.losses && point.wins > 0)) {
    return 'hybrid-tradeoff-only'
  }
  return 'pure-rmse-remains-best-quality-arm'
}

export function runQuotaCampaign() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const cells = generateIndependentPolicyCells(snapshot)
  if (cells.length !== 24) throw new Error(`expected 24 cells, got ${cells.length}`)

  const results: any[] = []
  for (const cell of cells) {
    const arms: Record<string, any> = {}
    for (const arm of QUOTA_ARMS) {
      arms[arm.armId] = runQuotaArm(arm, cell, snapshot)
    }

    const control = arms.Q40.selectedBest
    for (const arm of QUOTA_ARMS) {
      const candidate = arms[arm.armId]
      candidate.relationToControl = arm.armId === 'Q40'
        ? 'equivalent'
        : compareSelected(candidate.selectedBest, control)
      candidate.paretoToControl = arm.armId === 'Q40'
        ? 'equivalent'
        : paretoRelation(candidate.selectedBest, control)
    }

    results.push({
      cellId: cell.cellId,
      caseId: cell.caseId,
      sourceCandidateId: cell.sourceCandidateId,
      sourcePhase: cell.sourcePhase,
      initialFilterCount: cell.initialFilterCount,
      arms,
    })
  }

  const aggregate: Record<string, any> = {}
  for (const arm of QUOTA_ARMS) {
    aggregate[arm.armId] = summarizeRelations(results, arm.armId)
  }

  const frontier = quotaParetoFrontier(aggregate)
  const classification = classifyQuotaCampaign(aggregate)
  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-admission-quota-campaign-v1',
    predecessorSha: 'db69f9f13d89fdb188a2dab731d4ca7c16e7b363',
    objective: 'Compare deterministic lexical/RMSE top-4 admission quotas under identical downstream mechanics.',
    invariants: {
      quotaArms: QUOTA_ARMS,
      q40: 'default lexical admission; zero pre-polish signal scoring',
      q04: 'pure pre-polish RMSE/maxAbs admission',
      hybridSelection: 'lexical quota first; RMSE-ranked unique proposals second; deterministic fallback fill',
      deduplication: 'semantic proposal key ignoring filter id',
      downstreamEvaluationBudget: STRUCTURAL_EVALUATION_BUDGET,
      structuralConfig: STRUCTURAL_CONFIG,
      signalOverheadAccountedSeparately: true,
      noOutcomeAdaptiveQuotaSelection: true,
    },
    cells: results.map((row) => ({
      cellId: row.cellId,
      caseId: row.caseId,
      sourceCandidateId: row.sourceCandidateId,
      sourcePhase: row.sourcePhase,
      initialFilterCount: row.initialFilterCount,
    })),
    results,
    aggregate,
    quotaParetoFrontier: frontier,
    classification,
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-admission-quota-campaign-20260911/campaign-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-admission-quota-campaign-results.md',
  )
  const lines = [
    '# Storm Admission Quota Campaign Results',
    '',
    'Predeclared quota arms: 4:0, 3:1, 2:2, 1:3, 0:4 lexical:RMSE.',
    '',
    '| Arm | W | L | T | Mean ΔRMSE | Mean ΔmaxAbs | Mean ΔRegret | Signal evals | Downstream evals |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...QUOTA_ARMS.map((arm) => {
      const a = aggregate[arm.armId]
      return `| ${arm.armId} ${arm.lexicalQuota}:${arm.rmseQuota} | ${a.wins} | ${a.losses} | ${a.ties} | ${a.meanDeltaRmseDb.toFixed(6)} | ${a.meanDeltaMaxAbsDb.toFixed(6)} | ${a.meanDeltaRegret.toFixed(6)} | ${a.totalSignalOverheadCanonicalEvaluations} | ${a.totalDownstreamEvaluations} |`
    }),
    '',
    `Quota Pareto frontier: ${frontier.join(', ')}`,
    `Classification: ${classification}`,
    '',
    'This is a policy-mixture discovery campaign on the already generated 24-state matrix. It does not establish independent corpus generalization or production readiness.',
    '',
  ]
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, lines.join('\n'))

  process.stdout.write(JSON.stringify({
    aggregate,
    quotaParetoFrontier: frontier,
    classification,
    lowStart: Object.fromEntries(QUOTA_ARMS.map((arm) => [
      arm.armId,
      aggregate[arm.armId].lowStart,
    ])),
    highStart: Object.fromEntries(QUOTA_ARMS.map((arm) => [
      arm.armId,
      aggregate[arm.armId].highStart,
    ])),
    byCase: Object.fromEntries(QUOTA_ARMS.map((arm) => [
      arm.armId,
      aggregate[arm.armId].byCase,
    ])),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runQuotaCampaign()
}
