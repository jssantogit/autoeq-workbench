import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { referenceSelectorKey } from './referenceSelector.js'
import {
  cascadeMagnitudeDb,
  createStructuralBeamExhaustionTrace,
  generateStructuralMutations,
  quantizeStructuralBeamFilters,
  runStructuralBeam,
  semanticFilterKey,
  type StructuralBeamAdmissionOverride,
  type StructuralBeamExhaustionTrace,
  type StructuralBeamRetentionOverride,
  type StructuralProposal,
} from './structuralBeam.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import {
  generateIndependentPolicyCells,
  STRUCTURAL_CONFIG,
} from './stormAdmissionIndependentPolicyValidation.js'
import { ANYTIME_PANEL_CELL_IDS } from './stormAdmissionQuotaAnytimeCampaign.js'

export const STAGE_A_DEADLINE_MS = 5_000 as const
export const EXTENSION_15S_DEADLINE_MS = 15_000 as const
export const EXTENSION_60S_DEADLINE_MS = 60_000 as const
export const EVALUATION_BUDGET_CEILING = 100_000 as const

export const STORM_MILESTONE_THRESHOLDS = [5.0, 4.5, 4.0, 3.5, 3.0] as const

export interface CausalWidthArmConfig {
  readonly armId: string
  readonly lexicalQuota: number
  readonly rmseQuota: number
  readonly beamWidth: number
  readonly proposalsPerParent: number
  readonly noveltyBackfill: boolean
}

export const CAUSAL_WIDTH_ARMS: readonly CausalWidthArmConfig[] = Object.freeze([
  { armId: 'Q40-B2-P4', lexicalQuota: 4, rmseQuota: 0, beamWidth: 2, proposalsPerParent: 4, noveltyBackfill: false },
  { armId: 'Q31-B2-P4', lexicalQuota: 3, rmseQuota: 1, beamWidth: 2, proposalsPerParent: 4, noveltyBackfill: false },
  { armId: 'Q31-B4-P4', lexicalQuota: 3, rmseQuota: 1, beamWidth: 4, proposalsPerParent: 4, noveltyBackfill: false },
  { armId: 'Q31-B2-P8', lexicalQuota: 6, rmseQuota: 2, beamWidth: 2, proposalsPerParent: 8, noveltyBackfill: false },
  { armId: 'Q31-B4-P8', lexicalQuota: 6, rmseQuota: 2, beamWidth: 4, proposalsPerParent: 8, noveltyBackfill: false },
  { armId: 'Q04-B2-P4', lexicalQuota: 0, rmseQuota: 4, beamWidth: 2, proposalsPerParent: 4, noveltyBackfill: false },
  { armId: 'Q04-B4-P4', lexicalQuota: 0, rmseQuota: 4, beamWidth: 4, proposalsPerParent: 4, noveltyBackfill: false },
  { armId: 'Q04-B2-P8', lexicalQuota: 0, rmseQuota: 8, beamWidth: 2, proposalsPerParent: 8, noveltyBackfill: false },
  { armId: 'Q04-B4-P8', lexicalQuota: 0, rmseQuota: 8, beamWidth: 4, proposalsPerParent: 8, noveltyBackfill: false },
  { armId: 'Q31-NOVELTY-BACKFILL', lexicalQuota: 3, rmseQuota: 1, beamWidth: 2, proposalsPerParent: 4, noveltyBackfill: true },
  { armId: 'Q31-NOVELTY-BACKFILL-B4-P8', lexicalQuota: 6, rmseQuota: 2, beamWidth: 4, proposalsPerParent: 8, noveltyBackfill: true },
] as const)

export type GeneratedPolicyCell = ReturnType<typeof generateIndependentPolicyCells>[number]

export interface SignalLedger {
  canonicalEvaluations: number
  elapsedMs: number
}

export function proposalKey(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

export function buildVariableQuotaSelection<T extends { key: string }>(
  lexicalRanked: readonly T[],
  rmseRanked: readonly T[],
  lexicalQuota: number,
  rmseQuota: number,
  targetCount: number = lexicalQuota + rmseQuota,
): T[] {
  if (lexicalQuota < 0 || rmseQuota < 0 || lexicalQuota + rmseQuota !== targetCount) {
    throw new Error('quota must be non-negative and sum to targetCount')
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
  if (selected.length < targetCount) take(lexicalRanked, targetCount - selected.length)
  if (selected.length < targetCount) take(rmseRanked, targetCount - selected.length)
  return selected.slice(0, targetCount)
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

export function createCausalAdmissionOverride(
  arm: CausalWidthArmConfig,
  problem: SolverLabProblemV1,
  ledger: SignalLedger,
): StructuralBeamAdmissionOverride | undefined {
  if (arm.rmseQuota === 0 && !arm.noveltyBackfill) {
    // Q40: baseline lexical ordering without pre-polish RMSE scoring overhead
    return undefined
  }

  return {
    apply: (context) => {
      const started = performance.now()
      const scored = context.orderedProposals.map((proposal, lexicalRank) => {
        const delivered = quantizeStructuralBeamFilters(problem, proposal.filters)
        const evaluation = evaluateSolverLabCandidate(problem, {
          protocolVersion: 1,
          problemId: problem.problemId,
          inputSha256: problem.inputSha256,
          candidateId: `causal-quota-probe-${lexicalRank}`,
          algorithmId: 'causal-quota-probe',
          seed: 0,
          filters: delivered,
        })
        ledger.canonicalEvaluations += 1
        if (!evaluation.valid || evaluation.deliverable === null) {
          throw new Error('causal quota pre-polish probe failed')
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

      const lexicalRanked = [...scored]
      const rmseRanked = [...scored].sort((left, right) =>
        left.rmseDb - right.rmseDb ||
        left.maxAbsDb - right.maxAbsDb ||
        left.filterCount - right.filterCount ||
        left.cancellationScore - right.cancellationScore ||
        left.lexicalRank - right.lexicalRank)

      const selectedItems = buildVariableQuotaSelection(
        lexicalRanked,
        rmseRanked,
        arm.lexicalQuota,
        arm.rmseQuota,
        arm.proposalsPerParent,
      )

      let admittedProposals = selectedItems.map((entry) => entry.proposal)

      if (arm.noveltyBackfill && context.isVisited !== undefined) {
        const isVisited = context.isVisited
        const selectedKeySet = new Set(selectedItems.map((item) => item.key))
        const unvisitedBackfillPool = lexicalRanked.filter(
          (item) => !selectedKeySet.has(item.key) && !isVisited(item.proposal.filters),
        )

        let poolIdx = 0
        const backfilledProposals: StructuralProposal[] = []
        for (const prop of admittedProposals) {
          if (isVisited(prop.filters) && poolIdx < unvisitedBackfillPool.length) {
            backfilledProposals.push(unvisitedBackfillPool[poolIdx].proposal)
            poolIdx += 1
          } else {
            backfilledProposals.push(prop)
          }
        }
        admittedProposals = backfilledProposals
      }

      return {
        proposals: admittedProposals,
        intervention: 'custom',
      }
    },
  }
}

export type CausalExhaustionClassification =
  | 'GENERATOR_EMPTY'
  | 'GENERATOR_ONLY_DUPLICATES'
  | 'ALL_NOVEL_PROPOSALS_PREVIOUSLY_VISITED'
  | 'ADMISSION_EXCLUDES_REMAINING_NOVELTY'
  | 'POLISH_COLLAPSES_TO_VISITED_STATE'
  | 'BEAM_RETENTION_ELIMINATES_NOVELTY'
  | 'MAX_FILTER_CAPACITY_BLOCK'
  | 'MIXED_EXHAUSTION'
  | 'DEADLINE'
  | 'EVALUATION_CEILING'
  | 'SURVIVED_ACTIVE'

export function classifyCausalExhaustion(
  stopReason: string,
  totalElapsedMs: number,
  deadlineMs: number,
  trace?: StructuralBeamExhaustionTrace,
): CausalExhaustionClassification {
  if (stopReason === 'deadline' || totalElapsedMs >= deadlineMs) {
    return 'DEADLINE'
  }
  if (stopReason === 'evaluation-budget') {
    return 'EVALUATION_CEILING'
  }
  if (stopReason !== 'no-admissible-proposals' || trace === undefined) {
    return 'SURVIVED_ACTIVE'
  }

  const terminal = trace.layers.at(-1)
  if (terminal === undefined || !terminal.terminalNoGenerated) {
    return 'SURVIVED_ACTIVE'
  }

  const parents = terminal.parents
  if (parents.length === 0) return 'GENERATOR_EMPTY'

  const orderedTotal = parents.reduce((sum, p) => sum + p.orderedProposalCount, 0)
  const selectedTotal = parents.reduce((sum, p) => sum + p.selectedProposalCount, 0)
  const overMaxTotal = parents.reduce((sum, p) => sum + p.overMaxFiltersCount, 0)
  const prePolishVisitedTotal = parents.reduce((sum, p) => sum + p.prePolishAlreadyVisitedCount, 0)
  const postPolishVisitedTotal = parents.reduce((sum, p) => sum + p.postPolishVisitedCount, 0)
  const evaluatedNewTotal = parents.reduce((sum, p) => sum + p.evaluatedNewCount, 0)
  const rawGeneratedTotal = parents.reduce((sum, p) => sum + (p.rawProposalsGenerated ?? p.orderedProposalCount), 0)
  const semanticUniqueBeforeAdmission = parents.reduce((sum, p) => sum + (p.semanticUniqueProposalsBeforeAdmission ?? p.orderedProposalCount), 0)

  if (rawGeneratedTotal === 0 || orderedTotal === 0) return 'GENERATOR_EMPTY'
  if (overMaxTotal === selectedTotal && overMaxTotal > 0) return 'MAX_FILTER_CAPACITY_BLOCK'

  // Check previous layer for beam-retention cycle
  const previous = trace.layers.length >= 2 ? trace.layers.at(-2) : undefined
  if (
    previous !== undefined &&
    previous.generatedCandidateIds.length > 0 &&
    previous.retainedGeneratedCandidateIds.length === 0 &&
    postPolishVisitedTotal + overMaxTotal === selectedTotal
  ) {
    return 'BEAM_RETENTION_ELIMINATES_NOVELTY'
  }

  if (semanticUniqueBeforeAdmission === 0 && rawGeneratedTotal > 0) {
    return 'GENERATOR_ONLY_DUPLICATES'
  }

  if (prePolishVisitedTotal === selectedTotal && semanticUniqueBeforeAdmission === 0) {
    return 'ALL_NOVEL_PROPOSALS_PREVIOUSLY_VISITED'
  }

  // Check if admission left unvisited proposals unselected
  const proposalsExcluded = parents.reduce((sum, p) => sum + (p.proposalsExcludedByAdmission ?? 0), 0)
  if (proposalsExcluded > 0 && semanticUniqueBeforeAdmission > selectedTotal && postPolishVisitedTotal + prePolishVisitedTotal === selectedTotal) {
    return 'ADMISSION_EXCLUDES_REMAINING_NOVELTY'
  }

  if (postPolishVisitedTotal > 0 && evaluatedNewTotal === 0 && prePolishVisitedTotal < selectedTotal) {
    return 'POLISH_COLLAPSES_TO_VISITED_STATE'
  }

  if (prePolishVisitedTotal + postPolishVisitedTotal + overMaxTotal === selectedTotal) {
    return 'ALL_NOVEL_PROPOSALS_PREVIOUSLY_VISITED'
  }

  return 'MIXED_EXHAUSTION'
}

export interface MilestoneCrossing {
  thresholdDb: number
  elapsedMs: number
  maxAbsDb: number
  rmseDb: number
}

export interface RunExecutionResult {
  cellId: string
  caseId: string
  armId: string
  beamWidth: number
  proposalsPerParent: number
  noveltyBackfill: boolean
  stopReason: string
  totalElapsedMs: number
  deadlineMs: number
  downstreamEvaluations: number
  signalCanonicalEvaluations: number
  totalSignalElapsedMs: number
  totalEvaluations: number
  totalCoordinateTrials: number
  uniqueStatesGenerated: number
  uniqueStatesEvaluated: number
  uniqueStatesRetained: number
  candidates: SolverLabCandidateV1[]
  selectedBest: {
    candidateId: string
    rmseDb: number
    maxAbsDb: number
    filterCount: number
    regret: number
    elapsedMs: number
  } | null
  milestones: MilestoneCrossing[]
  classification: CausalExhaustionClassification
  mutationFunnel: Record<string, {
    generated: number
    uniquePrePolish: number
    admitted: number
    evaluated: number
    retained: number
  }>
}

export function runCausalArmOnCell(
  arm: CausalWidthArmConfig,
  cell: GeneratedPolicyCell,
  snapshot: OracleReferenceSnapshotV1,
  trace?: StructuralBeamExhaustionTrace,
  deadlineMs: number = STAGE_A_DEADLINE_MS,
  beamRetentionOverride?: StructuralBeamRetentionOverride,
): RunExecutionResult {
  const caseDef = loadLayeredResearchCases('adversarial')
    .find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case for cell: ${cell.cellId}`)

  const problem = createSolverLabProblem(caseDef, 10)
  const references = referenceFrontier(snapshot, problem)
  const ledger: SignalLedger = { canonicalEvaluations: 0, elapsedMs: 0 }
  const started = performance.now()
  const nowMs = () => performance.now()
  const elapsedMs = () => performance.now() - started
  const isExpired = () => elapsedMs() >= deadlineMs

  const milestones: MilestoneCrossing[] = []
  const crossedMilestones = new Set<number>()

  const checkMilestones = (maxAbsDb: number, rmseDb: number, timeMs: number) => {
    for (const threshold of STORM_MILESTONE_THRESHOLDS) {
      if (!crossedMilestones.has(threshold) && maxAbsDb < threshold) {
        crossedMilestones.add(threshold)
        milestones.push({
          thresholdDb: threshold,
          elapsedMs: timeMs,
          maxAbsDb,
          rmseDb,
        })
      }
    }
  }

  const armConfig = {
    ...STRUCTURAL_CONFIG,
    beamWidth: arm.beamWidth,
    proposalsPerParent: arm.proposalsPerParent,
  }

  const admissionOverride = createCausalAdmissionOverride(arm, problem, ledger)

  const result = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: EVALUATION_BUDGET_CEILING,
    referenceFrontier: references,
    referenceSnapshotSha256: snapshot.contentSha256,
    config: armConfig,
    seeds: [{
      seedId: cell.sourceCandidateId,
      origin: 'matching-pursuit',
      filters: cell.filters,
    }],
    includeZeroSeed: false,
    admissionOverride,
    exhaustionTrace: trace,
    beamRetentionOverride,
    nowMs,
    elapsedMs,
    isExpired,
    onPoint: (point) => {
      checkMilestones(point.canonicalMaxAbsDb, point.canonicalRmseDb, point.elapsedMs)
    },
  })

  const totalElapsedMs = elapsedMs()
  const bestPoint = result.trajectory.at(-1)
  const selectedBest = bestPoint !== undefined ? {
    candidateId: bestPoint.candidateId,
    rmseDb: bestPoint.canonicalRmseDb,
    maxAbsDb: bestPoint.canonicalMaxAbsDb,
    filterCount: bestPoint.actualDeliveredFilterCount,
    regret: bestPoint.referenceRegret,
    elapsedMs: bestPoint.elapsedMs,
  } : null

  if (selectedBest !== null) {
    checkMilestones(selectedBest.maxAbsDb, selectedBest.rmseDb, totalElapsedMs)
  }

  // Aggregate mutation funnel
  const mutationFunnel: Record<string, {
    generated: number
    uniquePrePolish: number
    admitted: number
    evaluated: number
    retained: number
  }> = {}

  if (trace !== undefined) {
    for (const layer of trace.layers) {
      for (const parent of layer.parents) {
        if (parent.mutationFamilyCounts !== undefined) {
          for (const [mut, count] of Object.entries(parent.mutationFamilyCounts)) {
            if (!mutationFunnel[mut]) {
              mutationFunnel[mut] = { generated: 0, uniquePrePolish: 0, admitted: 0, evaluated: 0, retained: 0 }
            }
            mutationFunnel[mut].generated += count
          }
        }
      }
    }
  }

  const terminalLayer = trace?.layers.at(-1)
  const uniqueStatesGenerated = trace !== undefined
    ? trace.layers.reduce((sum, l) => sum + l.generatedCandidateIds.length, 0)
    : 0
  const uniqueStatesEvaluated = result.evaluations.length
  const uniqueStatesRetained = result.states.length

  const classification = classifyCausalExhaustion(
    result.stopReason,
    totalElapsedMs,
    deadlineMs,
    trace,
  )

  const totalCoordinateTrials = terminalLayer?.cumulativeTrials ?? 0

  return {
    cellId: cell.cellId,
    caseId: cell.caseId,
    armId: arm.armId,
    beamWidth: arm.beamWidth,
    proposalsPerParent: arm.proposalsPerParent,
    noveltyBackfill: arm.noveltyBackfill,
    stopReason: result.stopReason,
    totalElapsedMs,
    deadlineMs,
    downstreamEvaluations: result.evaluations.length,
    signalCanonicalEvaluations: ledger.canonicalEvaluations,
    totalSignalElapsedMs: ledger.elapsedMs,
    totalEvaluations: result.evaluations.length + ledger.canonicalEvaluations,
    totalCoordinateTrials,
    uniqueStatesGenerated,
    uniqueStatesEvaluated,
    uniqueStatesRetained,
    candidates: result.candidates,
    selectedBest,
    milestones,
    classification,
    mutationFunnel,
  }
}

export interface OfflineTerminalCensusResult {
  cellId: string
  armId: string
  parentCandidateId: string
  legalProposalsGenerated: number
  semanticNewProposalsGenerated: number
  semanticNewProposalsOutsideNormalTopK: number
  wouldP8HaveAdmittedUnseen: boolean
  wouldB4HaveRetainedAdditional: boolean
  isGenuinelySaturated: boolean
}

export function performOfflineTerminalFrontierCensus(
  cell: GeneratedPolicyCell,
  arm: CausalWidthArmConfig,
  runResult: RunExecutionResult,
  trace: StructuralBeamExhaustionTrace,
): OfflineTerminalCensusResult[] {
  if (runResult.stopReason !== 'no-admissible-proposals') return []

  const terminalLayer = trace.layers.at(-1)
  if (terminalLayer === undefined) return []

  const caseDef = loadLayeredResearchCases('adversarial')
    .find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case: ${cell.caseId}`)
  const problem = createSolverLabProblem(caseDef, 10)

  // Use visited keys from trace
  const visited = new Set<string>(trace.visitedKeys ?? [])

  const results: OfflineTerminalCensusResult[] = []

  for (const parent of terminalLayer.parents) {
    const parentCandidate = runResult.candidates.find((c) => c.candidateId === parent.parentCandidateId)
    if (parentCandidate === undefined) continue
    const parentFilters = parentCandidate.filters
    const actual = cascadeMagnitudeDb(
      parentFilters,
      problem.frequenciesHz,
      problem.sampleRateHz,
    )
    const parentResidual = problem.desiredDb.map((desired, index) => desired - actual[index]!)
    const legalProposals = generateStructuralMutations(problem, parentFilters, parentResidual)

    let semanticNewCount = 0
    let semanticNewOutsideTopK = 0
    let unseenBetween4And8 = false

    for (let idx = 0; idx < legalProposals.length; idx++) {
      const prop = legalProposals[idx]
      const quantized = quantizeStructuralBeamFilters(problem, prop.filters)
      const key = semanticFilterKey(quantized)
      const isUnseen = !visited.has(key)

      if (isUnseen) {
        semanticNewCount += 1
        if (idx >= arm.proposalsPerParent) {
          semanticNewOutsideTopK += 1
        }
        if (idx >= 4 && idx < 8) {
          unseenBetween4And8 = true
        }
      }
    }

    const previousLayer = trace.layers.length >= 2 ? trace.layers.at(-2) : undefined
    const wouldB4HaveRetainedAdditional =
      previousLayer !== undefined &&
      previousLayer.droppedGeneratedCandidateIds.length > 0 &&
      previousLayer.retainedCandidateIds.length < 4

    const isGenuinelySaturated = legalProposals.length === 0 || semanticNewCount === 0

    results.push({
      cellId: cell.cellId,
      armId: arm.armId,
      parentCandidateId: parent.parentCandidateId,
      legalProposalsGenerated: legalProposals.length,
      semanticNewProposalsGenerated: semanticNewCount,
      semanticNewProposalsOutsideNormalTopK: semanticNewOutsideTopK,
      wouldP8HaveAdmittedUnseen: unseenBetween4And8,
      wouldB4HaveRetainedAdditional,
      isGenuinelySaturated,
    })
  }

  return results
}

export function runFullCausalWidthCampaign() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const allCells = generateIndependentPolicyCells(snapshot)

  const stageAResults: RunExecutionResult[] = []
  const offlineCensusResults: OfflineTerminalCensusResult[] = []

  // Step 1: Execute Stage-A (5s deadline) across all 24 cells x 11 arms
  console.log(`Starting Stage-A: ${allCells.length} cells x ${CAUSAL_WIDTH_ARMS.length} arms at 5000ms deadline...`)
  for (const cell of allCells) {
    for (const arm of CAUSAL_WIDTH_ARMS) {
      const trace = createStructuralBeamExhaustionTrace()
      const run = runCausalArmOnCell(arm, cell, snapshot, trace, STAGE_A_DEADLINE_MS)
      stageAResults.push(run)

      // Conduct offline census on exhausted baseline Q31/Q04 runs
      if (
        (arm.armId.startsWith('Q31-B2-P4') || arm.armId.startsWith('Q04-B2-P4')) &&
        run.stopReason === 'no-admissible-proposals'
      ) {
        const census = performOfflineTerminalFrontierCensus(cell, arm, run, trace)
        offlineCensusResults.push(...census)
      }
    }
  }

  // Step 2: Evaluate Extension Gate 1 (15s extension if >= 6 cells survive to 5s)
  const survivalAt5sByArm = Object.fromEntries(
    CAUSAL_WIDTH_ARMS.map((arm) => {
      const armRuns = stageAResults.filter((r) => r.armId === arm.armId)
      const surviving = armRuns.filter((r) => r.stopReason !== 'no-admissible-proposals')
      return [arm.armId, { survivingCount: surviving.length, total: armRuns.length }]
    }),
  )

  const eligibleFor15s = CAUSAL_WIDTH_ARMS.filter(
    (arm) => survivalAt5sByArm[arm.armId].survivingCount >= 6,
  )

  const stage15sResults: RunExecutionResult[] = []
  if (eligibleFor15s.length > 0) {
    console.log(`Extension Gate 1 TRIGGERED for arms: ${eligibleFor15s.map((a) => a.armId).join(', ')}`)
    for (const arm of eligibleFor15s) {
      for (const cell of allCells) {
        const trace = createStructuralBeamExhaustionTrace()
        const run = runCausalArmOnCell(arm, cell, snapshot, trace, EXTENSION_15S_DEADLINE_MS)
        stage15sResults.push(run)
      }
    }
  } else {
    console.log('Extension Gate 1 NOT TRIGGERED: No arm achieved >= 6/24 survival at 5s.')
  }

  // Step 3: Evaluate Extension Gate 2 (60s extension if >= 6 cells survive to 15s)
  const survivalAt15sByArm = Object.fromEntries(
    eligibleFor15s.map((arm) => {
      const armRuns = stage15sResults.filter((r) => r.armId === arm.armId)
      const surviving = armRuns.filter((r) => r.stopReason !== 'no-admissible-proposals')
      return [arm.armId, { survivingCount: surviving.length, total: armRuns.length }]
    }),
  )

  const eligibleFor60s = eligibleFor15s.filter(
    (arm) => (survivalAt15sByArm[arm.armId]?.survivingCount ?? 0) >= 6,
  )

  const stage60sResults: RunExecutionResult[] = []
  if (eligibleFor60s.length > 0) {
    console.log(`Extension Gate 2 TRIGGERED for arms on panel cells: ${eligibleFor60s.map((a) => a.armId).join(', ')}`)
    const panelCells = ANYTIME_PANEL_CELL_IDS.map((cellId) => {
      const c = allCells.find((cand) => cand.cellId === cellId)
      if (c === undefined) throw new Error(`missing panel cell: ${cellId}`)
      return c
    })
    for (const arm of eligibleFor60s) {
      for (const cell of panelCells) {
        const trace = createStructuralBeamExhaustionTrace()
        const run = runCausalArmOnCell(arm, cell, snapshot, trace, EXTENSION_60S_DEADLINE_MS)
        stage60sResults.push(run)
      }
    }
  } else {
    console.log('Extension Gate 2 NOT TRIGGERED.')
  }

  // Compile Comprehensive Artifact Report
  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-exhaustion-causal-v1',
    predecessorSha: '3c1f77058e459e58e1bb9ea099f0d42d0155d4af',
    cells: allCells.map((c) => ({ cellId: c.cellId, caseId: c.caseId, initialFilterCount: c.initialFilterCount })),
    arms: CAUSAL_WIDTH_ARMS,
    survivalAt5sByArm,
    extensionGate1Triggered: eligibleFor15s.length > 0,
    eligibleFor15s: eligibleFor15s.map((a) => a.armId),
    survivalAt15sByArm,
    extensionGate2Triggered: eligibleFor60s.length > 0,
    eligibleFor60s: eligibleFor60s.map((a) => a.armId),
    stageAResults,
    stage15sResults,
    stage60sResults,
    offlineCensusResults,
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-exhaustion-causal-20260911/campaign-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`Artifact written to: ${artifactPath}`)

  return report
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runFullCausalWidthCampaign()
}

