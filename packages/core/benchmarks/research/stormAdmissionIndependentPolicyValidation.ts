import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { cascadeMagnitudeDb, type Filter } from '../../src/index.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { runMatchingPursuit } from './matchingPursuit.js'
import { referenceSelectorKey } from './referenceSelector.js'
import {
  createStructuralBeamDiagnosticTrace,
  generateStructuralMutations,
  orderStructuralProposals,
  quantizeStructuralBeamFilters,
  runStructuralBeam,
  type StructuralBeamAdmissionOverride,
  type StructuralBeamConfig,
} from './structuralBeam.js'
import { getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'

export const INDEPENDENT_POLICY_CASES = Object.freeze([
  'titan-to-u12t',
  'titan-to-trio',
] as const)

export const POLICY_F_MAX_LEXICAL_FILTER_COUNT = 4 as const
export const POLICY_G_LOW_START_MAX_FILTER_COUNT = 4 as const
export const SPARSE_HOLDOUT_MAX_INDEX = 9 as const
export const STORM_REPLACEMENT_HOLDOUT_COUNT = 6 as const
export const STRUCTURAL_EVALUATION_BUDGET = 17 as const

export const STRUCTURAL_CONFIG: StructuralBeamConfig = Object.freeze({
  maxFilters: 10,
  beamWidth: 2,
  proposalsPerParent: 4,
  localPolishEvaluations: 24,
})

export const PREVIOUSLY_OBSERVED_STORM_IDS = Object.freeze([
  'matching-pursuit-v1:titan-to-storm:0:sparse-0001',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0002',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0003',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0004',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0005',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0006',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0007',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0008',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0009',
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010',
  'matching-pursuit-v1:titan-to-storm:0:replacement-2-2572',
] as const)

interface GeneratedPolicyCell {
  cellId: string
  caseId: string
  sourceCandidateId: string
  sourcePhase: 'greedy' | 'replacement'
  initialFilterCount: number
  filters: Filter[]
}

interface Overhead {
  canonicalEvaluations: number
  elapsedMs: number
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

function sparseIndex(candidateId: string): number | null {
  const match = candidateId.match(/:sparse-(\d{4})$/)
  return match ? Number(match[1]) : null
}

export function classifyAdaptiveThreshold(
  pure: { wins: number; losses: number },
  adaptive: { wins: number; losses: number },
): 'adaptive-threshold-4-supported' | 'adaptive-threshold-4-partial-tradeoff' | 'adaptive-threshold-4-not-supported' {
  if (adaptive.losses < pure.losses && adaptive.wins >= pure.wins) {
    return 'adaptive-threshold-4-supported'
  }
  if (adaptive.losses < pure.losses) return 'adaptive-threshold-4-partial-tradeoff'
  return 'adaptive-threshold-4-not-supported'
}

export function classifyPurePolicy(
  result: { wins: number; losses: number },
): 'independent-policy-favorable' | 'independent-policy-mixed' | 'independent-policy-regressive' {
  if (result.wins > result.losses) return 'independent-policy-favorable'
  if (result.losses > result.wins) return 'independent-policy-regressive'
  return 'independent-policy-mixed'
}

export function generateIndependentPolicyCells(
  snapshot: OracleReferenceSnapshotV1,
): GeneratedPolicyCell[] {
  const cases = loadLayeredResearchCases('adversarial')
  const cells: GeneratedPolicyCell[] = []

  for (const caseId of INDEPENDENT_POLICY_CASES) {
    const caseDef = cases.find((candidate) => candidate.id === caseId)
    if (caseDef === undefined) throw new Error(`missing research case: ${caseId}`)
    const problem = createSolverLabProblem(caseDef, 10)
    const references = referenceFrontier(snapshot, problem)
    let cancelled = false
    const captured = new Map<string, Filter[]>()

    runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 200,
      checkpointEveryEvaluations: 1,
      referenceFrontier: references,
      referenceSnapshotSha256: snapshot.contentSha256,
      isCancelled: () => cancelled,
      onTelemetry: (event, filters) => {
        const index = sparseIndex(event.candidateId)
        if (index !== null && index >= 1 && index <= SPARSE_HOLDOUT_MAX_INDEX) {
          captured.set(event.candidateId, filters.map((filter) => ({ ...filter })))
        }
        if (index === SPARSE_HOLDOUT_MAX_INDEX) cancelled = true
      },
    })

    for (let index = 1; index <= SPARSE_HOLDOUT_MAX_INDEX; index += 1) {
      const candidateId = `matching-pursuit-v1:${caseId}:0:sparse-${String(index).padStart(4, '0')}`
      const filters = captured.get(candidateId)
      if (filters === undefined) throw new Error(`failed to generate independent sparse holdout: ${candidateId}`)
      cells.push({
        cellId: `${caseId.replace('titan-to-', '')}-sparse-${String(index).padStart(4, '0')}`,
        caseId,
        sourceCandidateId: candidateId,
        sourcePhase: 'greedy',
        initialFilterCount: filters.length,
        filters,
      })
    }
  }

  const stormCase = cases.find((candidate) => candidate.id === 'titan-to-storm')
  if (stormCase === undefined) throw new Error('missing Storm research case')
  const stormProblem = createSolverLabProblem(stormCase, 10)
  const stormReferences = referenceFrontier(snapshot, stormProblem)
  const observed = new Set<string>(PREVIOUSLY_OBSERVED_STORM_IDS)
  const replacements: { candidateId: string; filters: Filter[] }[] = []
  const replacementKeys = new Set<string>()
  let stormCancelled = false

  runMatchingPursuit({
    problem: stormProblem,
    seed: 0,
    evaluationBudget: 5_000,
    checkpointEveryEvaluations: 1,
    referenceFrontier: stormReferences,
    referenceSnapshotSha256: snapshot.contentSha256,
    isCancelled: () => stormCancelled,
    onTelemetry: (event, filters) => {
      if (
        event.phase !== 'replacement' ||
        !event.selectedChange ||
        observed.has(event.candidateId)
      ) return
      const key = JSON.stringify(filters)
      if (replacementKeys.has(key)) return
      replacementKeys.add(key)
      replacements.push({
        candidateId: event.candidateId,
        filters: filters.map((filter) => ({ ...filter })),
      })
      if (replacements.length >= STORM_REPLACEMENT_HOLDOUT_COUNT) stormCancelled = true
    },
  })

  replacements.slice(0, STORM_REPLACEMENT_HOLDOUT_COUNT).forEach((replacement, index) => {
    cells.push({
      cellId: `storm-replacement-holdout-${String(index + 1).padStart(2, '0')}`,
      caseId: 'titan-to-storm',
      sourceCandidateId: replacement.candidateId,
      sourcePhase: 'replacement',
      initialFilterCount: replacement.filters.length,
      filters: replacement.filters,
    })
  })

  return cells
}

function initialAdmissionFeatures(
  cell: GeneratedPolicyCell,
  snapshot: OracleReferenceSnapshotV1,
) {
  const caseDef = loadLayeredResearchCases('adversarial').find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case for feature audit: ${cell.cellId}`)
  const problem = createSolverLabProblem(caseDef, 10)
  const parentEvaluation = evaluateSolverLabCandidate(problem, {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: `${cell.sourceCandidateId}:feature-parent`,
    algorithmId: 'feature-audit',
    seed: 0,
    filters: cell.filters,
  })
  if (!parentEvaluation.valid || parentEvaluation.deliverable === null) {
    throw new Error(`invalid feature-audit parent: ${cell.cellId}`)
  }
  const delivered = parentEvaluation.deliverable.filters
  const curve = cascadeMagnitudeDb(delivered, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - curve[index]!)
  const ordered = orderStructuralProposals(generateStructuralMutations(problem, delivered, residualDb))
  const scored = ordered.map((proposal, lexicalRank) => {
    const quantized = quantizeStructuralBeamFilters(problem, proposal.filters)
    const evaluation = evaluateSolverLabCandidate(problem, {
      protocolVersion: 1,
      problemId: problem.problemId,
      inputSha256: problem.inputSha256,
      candidateId: `${cell.sourceCandidateId}:feature-proposal-${lexicalRank}`,
      algorithmId: 'feature-audit',
      seed: 0,
      filters: quantized,
    })
    if (!evaluation.valid || evaluation.deliverable === null) {
      throw new Error(`invalid feature-audit proposal: ${cell.cellId}/${lexicalRank}`)
    }
    return {
      lexicalRank,
      mutation: proposal.mutation,
      rmseDb: evaluation.deliverable.rmseDb,
      maxAbsDb: evaluation.deliverable.maxAbsDb,
      filterCount: evaluation.deliverable.filters.length,
      cancellationScore: evaluation.deliverable.cancellationTotalScore,
    }
  })
  const rmseRanked = [...scored].sort((left, right) =>
    left.rmseDb - right.rmseDb ||
    left.maxAbsDb - right.maxAbsDb ||
    left.filterCount - right.filterCount ||
    left.cancellationScore - right.cancellationScore ||
    left.lexicalRank - right.lexicalRank)
  const lexicalTop = scored.slice(0, STRUCTURAL_CONFIG.proposalsPerParent)
  const rmseTop = rmseRanked.slice(0, STRUCTURAL_CONFIG.proposalsPerParent)
  const rmseRanks = new Set(rmseTop.map((entry) => entry.lexicalRank))
  const countMutation = (entries: typeof scored, mutation: string) =>
    entries.filter((entry) => entry.mutation === mutation).length
  return {
    parent: {
      rmseDb: parentEvaluation.deliverable.rmseDb,
      maxAbsDb: parentEvaluation.deliverable.maxAbsDb,
      maxAbsToRmseRatio: parentEvaluation.deliverable.maxAbsDb / parentEvaluation.deliverable.rmseDb,
      filterCount: parentEvaluation.deliverable.filters.length,
      cancellationScore: parentEvaluation.deliverable.cancellationTotalScore,
    },
    proposalCount: scored.length,
    lexicalTop4: lexicalTop.map((entry) => ({
      lexicalRank: entry.lexicalRank,
      mutation: entry.mutation,
    })),
    rmseTop4: rmseTop.map((entry) => ({
      lexicalRank: entry.lexicalRank,
      mutation: entry.mutation,
      rmseDb: entry.rmseDb,
      maxAbsDb: entry.maxAbsDb,
    })),
    top4OverlapCount: lexicalTop.filter((entry) => rmseRanks.has(entry.lexicalRank)).length,
    lexicalTop4AddCount:
      countMutation(lexicalTop, 'add-pk') +
      countMutation(lexicalTop, 'add-ls') +
      countMutation(lexicalTop, 'add-hs'),
    rmseTop4AddCount:
      countMutation(rmseTop, 'add-pk') +
      countMutation(rmseTop, 'add-ls') +
      countMutation(rmseTop, 'add-hs'),
    lexicalTop4SplitCount: countMutation(lexicalTop, 'split'),
    rmseTop4SplitCount: countMutation(rmseTop, 'split'),
    bestPrePolishRmseDeltaDb: rmseTop[0]!.rmseDb - parentEvaluation.deliverable.rmseDb,
    bestPrePolishMaxAbsDeltaDb: rmseTop[0]!.maxAbsDb - parentEvaluation.deliverable.maxAbsDb,
  }
}

function createPolicyOverride(
  armId: 'A' | 'B' | 'F' | 'G',
  problem: SolverLabProblemV1,
  overhead: Overhead,
): StructuralBeamAdmissionOverride | undefined {
  if (armId === 'A') return undefined
  return {
    apply: (context) => {
      const parentFilterCount = context.parent.evaluation.deliverable?.filters.length ?? 0
      const scoreRmse = armId === 'B' ||
        armId === 'G' ||
        (armId === 'F' && parentFilterCount > POLICY_F_MAX_LEXICAL_FILTER_COUNT)
      if (!scoreRmse) return null

      const started = performance.now()
      const ranked = context.orderedProposals.map((proposal, lexicalRank) => {
        const delivered = quantizeStructuralBeamFilters(problem, proposal.filters)
        const evaluation = evaluateSolverLabCandidate(problem, {
          protocolVersion: 1,
          problemId: problem.problemId,
          inputSha256: problem.inputSha256,
          candidateId: `policy-probe-${lexicalRank}`,
          algorithmId: 'policy-probe',
          seed: 0,
          filters: delivered,
        })
        overhead.canonicalEvaluations += 1
        if (!evaluation.valid || evaluation.deliverable === null) {
          throw new Error('policy pre-polish probe failed')
        }
        return {
          proposal,
          lexicalRank,
          rmseDb: evaluation.deliverable.rmseDb,
          maxAbsDb: evaluation.deliverable.maxAbsDb,
          filterCount: evaluation.deliverable.filters.length,
          cancellationScore: evaluation.deliverable.cancellationTotalScore,
        }
      })

      ranked.sort((left, right) =>
        left.rmseDb - right.rmseDb ||
        left.maxAbsDb - right.maxAbsDb ||
        left.filterCount - right.filterCount ||
        left.cancellationScore - right.cancellationScore ||
        left.lexicalRank - right.lexicalRank)

      overhead.elapsedMs += performance.now() - started
      const rmseTop = ranked.slice(0, STRUCTURAL_CONFIG.proposalsPerParent)

      if (
        armId === 'G' &&
        parentFilterCount <= POLICY_G_LOW_START_MAX_FILTER_COUNT &&
        rmseTop.some((entry) => entry.proposal.mutation.startsWith('add-'))
      ) {
        return null
      }

      return {
        proposals: rmseTop.map((entry) => entry.proposal),
        intervention: 'custom',
      }
    },
  }
}

function compareSelected(left: any, right: any): 'candidate' | 'control' | 'equivalent' {
  const leftKey = referenceSelectorKey({
    candidateId: left.candidateId,
    rmseDb: left.canonicalRmseDb,
    maxAbsDb: left.canonicalMaxAbsDb,
    filterCount: left.actualDeliveredFilterCount,
    cancellationScore: 0,
  })
  const rightKey = referenceSelectorKey({
    candidateId: right.candidateId,
    rmseDb: right.canonicalRmseDb,
    maxAbsDb: right.canonicalMaxAbsDb,
    filterCount: right.actualDeliveredFilterCount,
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
    left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (
      left.canonicalRmseDb < right.canonicalRmseDb - epsilon ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon
    )
  const cd = dominates(candidate, control)
  const dc = dominates(control, candidate)
  if (cd && !dc) return 'candidate-dominates'
  if (dc && !cd) return 'control-dominates'
  if (!cd && !dc) return 'tradeoff'
  return 'equivalent'
}

function runArm(
  armId: 'A' | 'B' | 'F' | 'G',
  cell: GeneratedPolicyCell,
  snapshot: OracleReferenceSnapshotV1,
) {
  const caseDef = loadLayeredResearchCases('adversarial').find((candidate) => candidate.id === cell.caseId)
  if (caseDef === undefined) throw new Error(`missing case for cell: ${cell.cellId}`)
  const problem = createSolverLabProblem(caseDef, 10)
  const references = referenceFrontier(snapshot, problem)
  const overhead: Overhead = { canonicalEvaluations: 0, elapsedMs: 0 }
  const trace = createStructuralBeamDiagnosticTrace()

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
    diagnosticTrace: trace,
    admissionOverride: createPolicyOverride(armId, problem, overhead),
  })

  const best = result.trajectory.at(-1)
  if (best === undefined) throw new Error(`no selected trajectory for ${cell.cellId}/${armId}`)
  return {
    armId,
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
    signalOverheadCanonicalEvaluations: overhead.canonicalEvaluations,
    signalOverheadElapsedMs: overhead.elapsedMs,
    coordinateTrials: result.evaluations.length * STRUCTURAL_CONFIG.localPolishEvaluations,
    stopReason: result.stopReason,
  }
}

export function runIndependentPolicyValidation() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const cells = generateIndependentPolicyCells(snapshot)
  if (cells.length < 18) {
    throw new Error(`independent policy matrix is too small: ${cells.length}`)
  }

  const report: any = {
    schemaVersion: 1,
    experimentVersion: 'storm-admission-independent-policy-validation-v1',
    hypothesis: {
      provenance: 'post-hoc-from-2026-09-11-validation; independently tested here',
      armF: `lexical when parentFilterCount <= ${POLICY_F_MAX_LEXICAL_FILTER_COUNT}; pre-polish-rmse-max-abs otherwise`,
    },
    matrixGeneration: {
      u12tAndTrio: 'matching-pursuit-v1 sparse-0001..0009 generated before admission outcomes',
      storm: `first ${STORM_REPLACEMENT_HOLDOUT_COUNT} unique selected replacement states excluding previously observed IDs`,
      admissionOutcomeBlind: true,
    },
    structuralConfig: STRUCTURAL_CONFIG,
    evaluationBudgetCeiling: STRUCTURAL_EVALUATION_BUDGET,
    cells: cells.map((cell) => ({
      cellId: cell.cellId,
      caseId: cell.caseId,
      sourceCandidateId: cell.sourceCandidateId,
      sourcePhase: cell.sourcePhase,
      initialFilterCount: cell.initialFilterCount,
    })),
    results: [],
    aggregate: {},
    classifications: {},
  }

  for (const cell of cells) {
    const A = runArm('A', cell, snapshot)
    const B = runArm('B', cell, snapshot)
    const F = runArm('F', cell, snapshot)
    const G = runArm('G', cell, snapshot)
    for (const candidate of [B, F, G]) {
      const relation = compareSelected(
        {
          candidateId: candidate.selectedBest.candidateId,
          canonicalRmseDb: candidate.selectedBest.rmseDb,
          canonicalMaxAbsDb: candidate.selectedBest.maxAbsDb,
          actualDeliveredFilterCount: candidate.selectedBest.filterCount,
        },
        {
          candidateId: A.selectedBest.candidateId,
          canonicalRmseDb: A.selectedBest.rmseDb,
          canonicalMaxAbsDb: A.selectedBest.maxAbsDb,
          actualDeliveredFilterCount: A.selectedBest.filterCount,
        },
      )
      ;(candidate as any).relationToControl = relation
      ;(candidate as any).paretoToControl = paretoRelation(
        {
          canonicalRmseDb: candidate.selectedBest.rmseDb,
          canonicalMaxAbsDb: candidate.selectedBest.maxAbsDb,
        },
        {
          canonicalRmseDb: A.selectedBest.rmseDb,
          canonicalMaxAbsDb: A.selectedBest.maxAbsDb,
        },
      )
    }
    report.results.push({
      cellId: cell.cellId,
      caseId: cell.caseId,
      sourceCandidateId: cell.sourceCandidateId,
      sourcePhase: cell.sourcePhase,
      initialFilterCount: cell.initialFilterCount,
      initialAdmissionFeatures: initialAdmissionFeatures(cell, snapshot),
      A,
      B,
      F,
      G,
    })
  }

  for (const armId of ['B', 'F', 'G']) {
    const aggregate = {
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
      totalDownstreamEvaluations: 0,
    }
    const deltas: { rmse: number[]; maxAbs: number[]; regret: number[] } = {
      rmse: [], maxAbs: [], regret: [],
    }
    for (const row of report.results) {
      const arm = row[armId]
      const relation = arm.relationToControl as 'candidate' | 'control' | 'equivalent'
      const bucket = row.initialFilterCount <= POLICY_F_MAX_LEXICAL_FILTER_COUNT
        ? aggregate.lowStart
        : aggregate.highStart
      const byCase = aggregate.byCase[row.caseId] ?? { wins: 0, losses: 0, ties: 0 }
      aggregate.byCase[row.caseId] = byCase
      if (relation === 'candidate') {
        aggregate.wins += 1; bucket.wins += 1; byCase.wins += 1
      } else if (relation === 'control') {
        aggregate.losses += 1; bucket.losses += 1; byCase.losses += 1
      } else {
        aggregate.ties += 1; bucket.ties += 1; byCase.ties += 1
      }
      deltas.rmse.push(arm.selectedBest.rmseDb - row.A.selectedBest.rmseDb)
      deltas.maxAbs.push(arm.selectedBest.maxAbsDb - row.A.selectedBest.maxAbsDb)
      deltas.regret.push(arm.selectedBest.regret - row.A.selectedBest.regret)
      aggregate.totalSignalOverheadCanonicalEvaluations += arm.signalOverheadCanonicalEvaluations
      aggregate.totalDownstreamEvaluations += arm.realizedDownstreamEvaluations
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    aggregate.meanDeltaRmseDb = mean(deltas.rmse)
    aggregate.meanDeltaMaxAbsDb = mean(deltas.maxAbs)
    aggregate.meanDeltaRegret = mean(deltas.regret)
    report.aggregate[armId] = aggregate
  }

  report.classifications.B = classifyPurePolicy(report.aggregate.B)
  report.classifications.F = classifyAdaptiveThreshold(report.aggregate.B, report.aggregate.F)

  const reservedValidationRows = report.results.filter((row: any) =>
    row.caseId === 'titan-to-trio' &&
    row.initialFilterCount <= POLICY_G_LOW_START_MAX_FILTER_COUNT)
  const summarizeReserved = (armId: 'B' | 'G') => {
    const counts = { wins: 0, losses: 0, ties: 0 }
    for (const row of reservedValidationRows) {
      const relation = row[armId].relationToControl
      if (relation === 'candidate') counts.wins += 1
      else if (relation === 'control') counts.losses += 1
      else counts.ties += 1
    }
    return counts
  }
  report.reservedValidation = {
    split: 'trio sparse-0001..0004',
    B: summarizeReserved('B'),
    G: summarizeReserved('G'),
  }
  report.classifications.G =
    report.reservedValidation.G.losses < report.reservedValidation.B.losses &&
    report.reservedValidation.G.wins >= report.reservedValidation.B.wins
      ? 'low-start-mutation-gate-supported'
      : report.reservedValidation.G.losses < report.reservedValidation.B.losses
        ? 'low-start-mutation-gate-partial-tradeoff'
        : 'low-start-mutation-gate-not-supported'

  const outPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-admission-independent-policy-validation-20260911/campaign-report.json',
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-admission-independent-policy-validation-results.md',
  )
  const md = [
    '# Storm Admission Independent Policy Validation Results',
    '',
    `Generated cells: ${report.cells.length}`,
    `B: ${report.aggregate.B.wins} wins / ${report.aggregate.B.losses} losses / ${report.aggregate.B.ties} ties — ${report.classifications.B}`,
    `F: ${report.aggregate.F.wins} wins / ${report.aggregate.F.losses} losses / ${report.aggregate.F.ties} ties — ${report.classifications.F}`,
    `G: ${report.aggregate.G.wins} wins / ${report.aggregate.G.losses} losses / ${report.aggregate.G.ties} ties — ${report.classifications.G}`,
    `Reserved Trio low-start B: ${report.reservedValidation.B.wins}/${report.reservedValidation.B.losses}/${report.reservedValidation.B.ties}`,
    `Reserved Trio low-start G: ${report.reservedValidation.G.wins}/${report.reservedValidation.G.losses}/${report.reservedValidation.G.ties}`,
    '',
    '## Low-start cells (initial filters <= 4)',
    `B: ${report.aggregate.B.lowStart.wins}/${report.aggregate.B.lowStart.losses}/${report.aggregate.B.lowStart.ties}`,
    `F: ${report.aggregate.F.lowStart.wins}/${report.aggregate.F.lowStart.losses}/${report.aggregate.F.lowStart.ties}`,
    '',
    '## High-start cells (initial filters >= 5)',
    `B: ${report.aggregate.B.highStart.wins}/${report.aggregate.B.highStart.losses}/${report.aggregate.B.highStart.ties}`,
    `F: ${report.aggregate.F.highStart.wins}/${report.aggregate.F.highStart.losses}/${report.aggregate.F.highStart.ties}`,
    '',
    'Classification is derived from measured counts. This campaign validates a post-hoc threshold hypothesis on newly generated policy states; it does not claim independent target-corpus generalization.',
    '',
  ].join('\n')
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, md)

  const discoveryU12tLowStart = report.results
    .filter((row: any) =>
      row.caseId === 'titan-to-u12t' &&
      row.initialFilterCount <= POLICY_F_MAX_LEXICAL_FILTER_COUNT)
    .map((row: any) => ({
      cellId: row.cellId,
      initialFilterCount: row.initialFilterCount,
      initialAdmissionFeatures: row.initialAdmissionFeatures,
      bRelationToControl: row.B.relationToControl,
      bParetoToControl: row.B.paretoToControl,
      bDeltaRmseDb: row.B.selectedBest.rmseDb - row.A.selectedBest.rmseDb,
      bDeltaMaxAbsDb: row.B.selectedBest.maxAbsDb - row.A.selectedBest.maxAbsDb,
      bDeltaRegret: row.B.selectedBest.regret - row.A.selectedBest.regret,
    }))

  process.stdout.write(JSON.stringify({
    generatedCells: report.cells,
    aggregate: report.aggregate,
    classifications: report.classifications,
    reservedValidation: report.reservedValidation,
    policyG: {
      lowStartRule: 'if parentFilterCount <= 4 and RMSE top-4 contains any add-* mutation, use lexical; otherwise use RMSE top-4',
      provenance: 'predeclared from U12t sparse-0001..0004 discovery only',
    },
    discoverySplit: {
      discovery: 'u12t sparse-0001..0004',
      reservedValidation: 'trio sparse-0001..0004',
    },
    discoveryU12tLowStart,
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runIndependentPolicyValidation()
}
