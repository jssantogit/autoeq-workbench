import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../src/index.js'
import {
  advanceJointRefineContinuationV2,
  createJointRefineContinuationV2,
  type JointRefineContinuationV2,
} from '../../src/autoeq/v2/jointRefineContinuation.js'

import {
  CAPACITY_TOURNAMENT_APPROVED_VARIANT_IDS,
  CAPACITY_TOURNAMENT_CASES,
  CAPACITY_TOURNAMENT_CHECKPOINTS_MS,
  runCapacityTournament,
  type CapacityTournamentCaseInput,
  type CapacityTournamentExecutionContext,
  type CapacityTournamentExecutionResult,
  type CapacityTournamentProgressPointV1,
  type CapacityTournamentResultV1,
  type CapacityTournamentVariant,
  type CapacityTournamentVariantId,
} from './capacityTournament.js'
import { runAnytimeFeedbackSchedule } from './anytimeComposition.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import {
  advanceMatchingPursuitContinuation,
  createMatchingPursuitContinuation,
  runMatchingPursuit,
} from './matchingPursuit.js'
import type { MatchingPursuitReplacementOrdering } from './matchingPursuit.js'
import {
  loadProposalSeeds,
  type ProposalSeedV1,
} from './proposalSeeds.js'
import {
  getReferenceCell,
  assertOracleReferenceSnapshotV1,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'
import { runStructuralBeam, type StructuralBeamSeed } from './structuralBeam.js'
import {
  runResumableScheduler,
  type ScheduledResearchState,
} from './resumableScheduler.js'

interface TournamentCaseData {
  input: CapacityTournamentCaseInput
  problem: SolverLabProblemV1
  references: ReferenceRegretPoint[]
  proposalSeeds: ProposalSeedV1[]
}

interface CapacityTournamentCliOptions {
  snapshot: string
  cases: typeof CAPACITY_TOURNAMENT_CASES[number][]
  checkpointsMs: typeof CAPACITY_TOURNAMENT_CHECKPOINTS_MS[number][]
  out: string
  proposalSeedsDir?: string
  variants: CapacityTournamentVariantId[]
  stateBankSeeds: AblationSeedPolicy
  structuralSeeds: AblationSeedPolicy
  mpReplacementOrdering: MatchingPursuitReplacementOrdering
}

export type AblationSeedPolicy = 'none' | 'proposal'

export function selectAblationSeeds(
  seeds: readonly ProposalSeedV1[],
  policy: AblationSeedPolicy,
): ProposalSeedV1[] {
  return policy === 'proposal' ? [...seeds] : []
}

interface CapacityTournamentCompleteReport {
  schemaVersion: 1
  program: 'autoeq-capacity-aware-solver'
  status: 'complete'
  snapshot: {
    path: string
    contentSha256: string
  }
  cases: typeof CAPACITY_TOURNAMENT_CASES[number][]
  checkpointsMs: typeof CAPACITY_TOURNAMENT_CHECKPOINTS_MS[number][]
  maxFilters: 10
  registeredVariantIds: string[]
  runs: CapacityTournamentResultV1['runs']
  tournament: CapacityTournamentResultV1
  blockers: []
  excludedFromRuntimeTournament: [20, 40, 64]
  holdout: { executed: false }
  productionPromotion: { executed: false }
}

function requiredOption(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name)
  if (value === undefined || value.length === 0) throw new Error(`Missing required option ${name}`)
  return value
}

function parseOptions(args: readonly string[]): CapacityTournamentCliOptions {
  const values = new Map<string, string>()
  const normalized = args[0] === '--' ? args.slice(1) : args
  for (let index = 0; index < normalized.length; index += 1) {
    const option = normalized[index]!
    if (!option.startsWith('--')) throw new Error(`Unexpected argument ${option}`)
    const value = normalized[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    if (values.has(option)) throw new Error(`Duplicate option ${option}`)
    values.set(option, value)
    index += 1
  }
  const cases = requiredOption(values, '--cases').split(',')
  if (JSON.stringify(cases) !== JSON.stringify([...CAPACITY_TOURNAMENT_CASES])) {
    throw new Error('capacity tournament cases must be exactly titan-to-storm,titan-to-u12t,titan-to-trio')
  }
  const checkpointsMs = requiredOption(values, '--checkpoints-ms').split(',').map((value) => {
    if (!/^\d+$/.test(value)) throw new Error('--checkpoints-ms requires integer milliseconds')
    return Number(value)
  })
  if (JSON.stringify(checkpointsMs) !== JSON.stringify([...CAPACITY_TOURNAMENT_CHECKPOINTS_MS])) {
    throw new Error('--checkpoints-ms must be exactly 5000,15000,30000,60000')
  }
  const variants = (values.get('--variants') ?? 'state-bank-v1,matching-pursuit-v1,structural-beam-v1')
    .split(',')
  const allowedVariants = new Set<string>(CAPACITY_TOURNAMENT_APPROVED_VARIANT_IDS)
  if (variants.length === 0 || new Set(variants).size !== variants.length ||
    variants.some((variant) => !allowedVariants.has(variant))) {
    throw new Error('--variants must contain unique approved component IDs')
  }
  const stateBankSeeds = values.get('--state-bank-seeds') ?? 'proposal'
  const structuralSeeds = values.get('--structural-seeds') ?? 'proposal'
  const mpReplacementOrdering = values.get('--mp-replacement-ordering') ?? 'dictionary-drop-major-v1'
  if (![
    'dictionary-drop-major-v1',
    'dictionary-drop-round-robin-v1',
    'residual-ranked-drop-round-robin-v1',
  ].includes(mpReplacementOrdering)) {
    throw new Error('--mp-replacement-ordering is unsupported')
  }
  if ((stateBankSeeds !== 'none' && stateBankSeeds !== 'proposal') ||
    (structuralSeeds !== 'none' && structuralSeeds !== 'proposal')) {
    throw new Error('seed policies must be none or proposal')
  }
  const known = new Set([
    '--snapshot', '--cases', '--checkpoints-ms', '--out', '--proposal-seeds-dir',
    '--variants', '--state-bank-seeds', '--structural-seeds',
    '--mp-replacement-ordering',
  ])
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`Unknown option ${key}`)
  return {
    snapshot: requiredOption(values, '--snapshot'),
    cases: cases as CapacityTournamentCliOptions['cases'],
    checkpointsMs: checkpointsMs as CapacityTournamentCliOptions['checkpointsMs'],
    out: requiredOption(values, '--out'),
    proposalSeedsDir: values.get('--proposal-seeds-dir'),
    variants: variants as CapacityTournamentCliOptions['variants'],
    stateBankSeeds,
    structuralSeeds,
    mpReplacementOrdering: mpReplacementOrdering as MatchingPursuitReplacementOrdering,
  }
}

function readSnapshot(path: string): OracleReferenceSnapshotV1 {
  const value: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'))
  assertOracleReferenceSnapshotV1(value)
  return value
}

function referencePoints(snapshot: OracleReferenceSnapshotV1, problem: SolverLabProblemV1): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, 10)
  const byId = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = byId.get(candidateId)
    if (candidate === undefined) throw new Error(`reference frontier candidate is absent: ${candidateId}`)
    return {
      candidateId: candidate.candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function caseData(
  snapshot: OracleReferenceSnapshotV1,
  caseId: typeof CAPACITY_TOURNAMENT_CASES[number],
  proposalSeedsDir: string,
): TournamentCaseData {
  const researchCase = loadLayeredResearchCases('adversarial').find((candidate) => candidate.id === caseId)
  if (researchCase === undefined) throw new Error(`Unknown approved research case: ${caseId}`)
  const problem = createSolverLabProblem(researchCase, 10)
  const references = referencePoints(snapshot, problem)
  const seedPath = join(proposalSeedsDir, `${caseId}-teacher-student.json`)
  const proposalSeeds = existsSync(seedPath)
    ? loadProposalSeeds(seedPath, problem, 10)
    : []
  return {
    input: {
      problemId: caseId,
      inputSha256: problem.inputSha256,
      maxFilters: 10,
      referenceSnapshotSha256: snapshot.contentSha256,
      seed: 0,
    },
    problem,
    references,
    proposalSeeds,
  }
}

function selectorPoint(point: CapacityTournamentProgressPointV1): SelectorPoint {
  return {
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    cancellationScore: 0,
  }
}

function dominates(left: CapacityTournamentProgressPointV1, right: CapacityTournamentProgressPointV1): boolean {
  const epsilon = 1e-12
  return left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (left.canonicalRmseDb < right.canonicalRmseDb - epsilon ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon)
}

function shouldReport(
  previous: CapacityTournamentProgressPointV1 | undefined,
  candidate: CapacityTournamentProgressPointV1,
): boolean {
  if (previous === undefined || dominates(candidate, previous)) return true
  if (dominates(previous, candidate)) return false
  return selectReferencePoint([selectorPoint(previous), selectorPoint(candidate)]).candidateId === candidate.candidateId
}

export interface NoveltyAccounting {
  frontier: CapacityTournamentProgressPointV1[]
  paretoNovel: number
  dominated: number
  equivalent: number
}

export function createCapacityNoveltyAccounting(): NoveltyAccounting {
  return { frontier: [], paretoNovel: 0, dominated: 0, equivalent: 0 }
}

export function accountCapacityNovelty(
  accounting: NoveltyAccounting,
  candidate: CapacityTournamentProgressPointV1,
): void {
  const equivalent = accounting.frontier.some((point) =>
    Math.abs(point.canonicalRmseDb - candidate.canonicalRmseDb) <= 1e-12 &&
    Math.abs(point.canonicalMaxAbsDb - candidate.canonicalMaxAbsDb) <= 1e-12)
  const dominatedByFrontier = accounting.frontier.some((point) => dominates(point, candidate))
  if (equivalent) accounting.equivalent += 1
  else if (dominatedByFrontier) accounting.dominated += 1
  else {
    accounting.paretoNovel += 1
    accounting.frontier = accounting.frontier.filter((point) => !dominates(candidate, point))
    accounting.frontier.push(candidate)
  }
}

function progressPoint(
  point: {
    evaluationCount: number
    elapsedMs: number
    candidateId: string
    actualDeliveredFilterCount: number
    canonicalRmseDb: number
    canonicalMaxAbsDb: number
    referenceRegret: number
    referenceImproved: boolean
  },
  filters: readonly Filter[],
  work: {
    cumulativeCandidateCount: number
    structuralOperationCount: number
    bestOrigin: string
    cumulativeParetoNovelCount?: number
    cumulativeDominatedCount?: number
    cumulativeEquivalentMetricCount?: number
  },
): CapacityTournamentProgressPointV1 {
  return {
    ...point,
    ...work,
    cumulativeParetoNovelCount: work.cumulativeParetoNovelCount ?? 0,
    cumulativeDominatedCount: work.cumulativeDominatedCount ?? 0,
    cumulativeEquivalentMetricCount: work.cumulativeEquivalentMetricCount ?? 0,
    filters: filters.map((filter) => ({ ...filter })),
    metricSource: 'canonical-delivered-v1',
  }
}

function candidateForState(
  problem: SolverLabProblemV1,
  policy: 'state-bank-v1',
  key: string,
  slicesReceived: number,
  seed: number,
  filters: readonly Filter[],
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: `${policy}:${key}:${slicesReceived}`,
    algorithmId: policy,
    seed,
    filters: filters.map((filter) => ({ ...filter })),
  }
}

function configForProblem(problem: SolverLabProblemV1) {
  return resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    minFrequencyHz: problem.bounds.minFrequencyHz,
    maxFrequencyHz: problem.bounds.maxFrequencyHz,
    minGainDb: problem.bounds.minGainDb,
    maxGainDb: problem.bounds.maxGainDb,
    minQ: problem.bounds.minPkQ,
    maxQ: problem.bounds.maxPkQ,
    maxFilters: 10,
  })
}

function makeContinuation(
  problem: SolverLabProblemV1,
  filters: readonly Filter[],
  context: CapacityTournamentExecutionContext,
): JointRefineContinuationV2 {
  const config = configForProblem(problem)
  const solution = evaluateV2Solution(
    filters,
    problem.desiredDb,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )
  return createJointRefineContinuationV2({
    solution,
    desiredDb: problem.desiredDb,
    frequencies: problem.frequenciesHz,
    config,
    deadline: { isExpired: context.isExpired },
  })
}

function runStateBank(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  seedPolicy: AblationSeedPolicy,
  includeFreshZero = true,
  onRawCandidate?: (point: CapacityTournamentProgressPointV1) => void,
): CapacityTournamentExecutionResult {
  const freshStates: ScheduledResearchState[] = includeFreshZero ? [{
    key: 'fresh:zero',
    origin: 'fresh',
    continuation: makeContinuation(data.problem, [], context),
    slicesReceived: 0,
  }] : []
  const proposalBankStates: ScheduledResearchState[] = data.proposalSeeds.map((seed, index) => ({
    key: `${seed.sourceKind}:${seed.sourceId}:${index}`,
    origin: seed.sourceKind === 'transfer'
      ? 'transferred'
      : seed.sourceKind === 'known-good'
        ? 'known-good'
        : 'v1-seeded',
    continuation: makeContinuation(data.problem, seed.filters, context),
    slicesReceived: 0,
  }))
  let best: CapacityTournamentProgressPointV1 | undefined
  const novelty = createCapacityNoveltyAccounting()
  let evaluationCount = 0
  const reportState = (state: ScheduledResearchState): void => {
    if (context.isExpired()) return
    const candidate = candidateForState(
      data.problem,
      'state-bank-v1',
      state.key,
      state.slicesReceived,
      context.seed ?? 0,
      state.continuation.solution.filters,
    )
    const evaluation = evaluateSolverLabCandidate(data.problem, candidate)
    if (!evaluation.valid || evaluation.deliverable === null) {
      throw new Error(`state-bank candidate rejected: ${evaluation.rejectionReason}`)
    }
    if (context.isExpired()) return
    const delivered = evaluation.deliverable
    const regret = directedReferenceRegret({
      candidateId: candidate.candidateId,
      rmseDb: delivered.rmseDb,
      maxAbsDb: delivered.maxAbsDb,
      filterCount: delivered.filters.length,
    }, data.references)
    const point = progressPoint({
      evaluationCount,
      elapsedMs: Math.min(60_000, Math.max(0, context.elapsedMs())),
      candidateId: candidate.candidateId,
      actualDeliveredFilterCount: delivered.filters.length,
      canonicalRmseDb: delivered.rmseDb,
      canonicalMaxAbsDb: delivered.maxAbsDb,
      referenceRegret: regret.regret,
      referenceImproved: regret.referenceImproved,
    }, delivered.filters, {
      cumulativeCandidateCount: evaluationCount + 1,
      structuralOperationCount: 0,
      bestOrigin: state.origin,
    })
    accountCapacityNovelty(novelty, point)
    point.cumulativeParetoNovelCount = novelty.paretoNovel
    point.cumulativeDominatedCount = novelty.dominated
    point.cumulativeEquivalentMetricCount = novelty.equivalent
    onRawCandidate?.(point)
    evaluationCount += 1
    if (shouldReport(best, point)) {
      best = point
    }
    if (best !== undefined) context.report({
      ...best,
      evaluationCount: point.evaluationCount,
      elapsedMs: point.elapsedMs,
      cumulativeCandidateCount: evaluationCount,
      structuralOperationCount: 0,
      cumulativeParetoNovelCount: novelty.paretoNovel,
      cumulativeDominatedCount: novelty.dominated,
      cumulativeEquivalentMetricCount: novelty.equivalent,
    })
  }

  const initialState = freshStates[0] ?? proposalBankStates[0]
  if (initialState !== undefined) reportState(initialState)
  const result = runResumableScheduler({
    policy: 'state-bank-v1',
    maxSlices: Number.MAX_SAFE_INTEGER,
    freshStates,
    proposalBankStates,
    isExpired: context.isExpired,
    advance: (state) => {
      if (context.isExpired()) {
        state.continuation.done = true
        return state
      }
      context.startWorkUnit()
      const next = {
        ...state,
        continuation: advanceJointRefineContinuationV2(state.continuation),
      }
      if (!context.isExpired()) reportState(next)
      if (context.isExpired()) next.continuation.done = true
      return next
    },
  })
  return {
    terminationReason: context.isExpired()
      ? 'deadline'
      : result.stopReason === 'no-admissible-proposals'
        ? 'search-space-exhausted-under-current-mechanism'
        : result.stopReason === 'slice-budget'
          ? 'evaluation-budget'
          : result.stopReason,
    metadata: {
      searchComponent: 'resumable-refinement-plus-state-bank',
      policy: 'state-bank-v1',
      freshStateCount: result.freshStates.length,
      proposalBankStateCount: result.proposalBankStates.length,
      freshSlices: result.slices.filter((slice) => slice.source === 'fresh').length,
      proposalBankSlices: result.slices.filter((slice) => slice.source === 'proposal-bank').length,
      teacherSeedCount: data.proposalSeeds.length,
      seedPolicy,
      stopReason: result.stopReason,
      cumulativeCandidateCount: evaluationCount,
      structuralOperationCount: 0,
      nodeVersion: process.version,
    },
  }
}

function runMatchingPursuitVariant(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  replacementOrdering: MatchingPursuitReplacementOrdering,
  onRawCandidate?: (point: CapacityTournamentProgressPointV1) => void,
): CapacityTournamentExecutionResult {
  let best: CapacityTournamentProgressPointV1 | undefined
  let candidateCount = 0
  let structuralOperationCount = 0
  const researchTrace: Record<string, unknown>[] = []
  let paretoNovelCount = 0
  let dominatedCount = 0
  let equivalentMetricCount = 0
  const result = runMatchingPursuit({
    problem: data.problem,
    seed: context.seed ?? 0,
    evaluationBudget: 1_000_000,
    referenceFrontier: data.references,
    referenceSnapshotSha256: context.referenceSnapshotSha256,
    replacementOrdering,
    isExpired: context.isExpired,
    nowMs: context.nowMs,
    elapsedMs: context.elapsedMs,
    onWorkUnitStart: context.startWorkUnit,
    onTelemetry: (event) => {
      if (event.paretoNovel) paretoNovelCount += 1
      else if (event.dominated) dominatedCount += 1
      else if (event.equivalentMetrics) equivalentMetricCount += 1
      researchTrace.push({ component: 'matching-pursuit-v1', ...event })
    },
    onPoint: (point, filters) => {
      if (context.isExpired()) return
      candidateCount += 1
      if (point.candidateId.includes(':replacement-')) structuralOperationCount += 1
      const origin = point.candidateId.includes(':replacement-')
        ? 'matching-pursuit-replacement'
        : point.candidateId.includes(':sparse-')
          ? 'matching-pursuit-greedy'
          : 'matching-pursuit-baseline'
      const candidate = progressPoint(point, filters, {
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
        bestOrigin: origin,
        cumulativeParetoNovelCount: paretoNovelCount,
        cumulativeDominatedCount: dominatedCount,
        cumulativeEquivalentMetricCount: equivalentMetricCount,
      })
      onRawCandidate?.(candidate)
      if (shouldReport(best, candidate)) {
        best = candidate
      }
      if (best !== undefined) context.report({
        ...best,
        evaluationCount: candidate.evaluationCount,
        elapsedMs: candidate.elapsedMs,
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
        cumulativeParetoNovelCount: paretoNovelCount,
        cumulativeDominatedCount: dominatedCount,
        cumulativeEquivalentMetricCount: equivalentMetricCount,
      })
    },
  })
  return {
    terminationReason: result.stopReason,
    metadata: {
      searchComponent: 'matching-pursuit-v1',
      dictionaryAtoms: result.metadata.dictionaryAtoms,
      selectedAtoms: result.selectedAtoms.length,
      candidateCount: result.candidates.length,
      structuralOperationCount,
      stopReason: result.stopReason,
      teacherSeedCount: 0,
      nodeVersion: process.version,
      replacementOrdering,
      replacementRankingScoreComputations: result.metadata.replacementRankingScoreComputations,
      ...result.diagnostics,
    },
    researchTrace,
  }
}

function runStructuralBeamVariant(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  seedPolicy: AblationSeedPolicy,
  onRawCandidate?: (point: CapacityTournamentProgressPointV1) => void,
  useRootElapsed = true,
): CapacityTournamentExecutionResult {
  let best: CapacityTournamentProgressPointV1 | undefined
  let candidateCount = 0
  let structuralOperationCount = 0
  const novelty = createCapacityNoveltyAccounting()
  const seeds: StructuralBeamSeed[] = data.proposalSeeds.map((seed) => ({
    seedId: seed.sourceId,
    origin: seed.sourceKind === 'transfer'
      ? seed.sourceId.startsWith('matching-pursuit-v1:')
        ? 'matching-pursuit'
        : 'teacher-compression'
      : seed.sourceKind === 'known-good'
        ? 'teacher-compression'
        : 'zero',
    filters: seed.filters,
  }))
  const result = runStructuralBeam({
    problem: data.problem,
    seed: context.seed ?? 0,
    evaluationBudget: 1_000_000,
    referenceFrontier: data.references,
    referenceSnapshotSha256: context.referenceSnapshotSha256,
    config: {
      beamWidth: 4,
      proposalsPerParent: 8,
      localPolishEvaluations: 120,
      maxFilters: 10,
    },
    seeds,
    isExpired: context.isExpired,
    nowMs: context.nowMs,
    elapsedMs: useRootElapsed ? context.elapsedMs : undefined,
    onWorkUnitStart: context.startWorkUnit,
    onPoint: (point, filters) => {
      if (context.isExpired()) return
      candidateCount += 1
      if (point.candidateId.includes(':proposal-')) structuralOperationCount += 1
      const origin = point.candidateId.includes(':proposal-')
        ? 'structural-beam-proposal'
        : point.candidateId.includes(':matching-pursuit:')
          ? 'matching-pursuit-seed'
          : point.candidateId.includes(':teacher-compression:')
            ? 'teacher-compression-seed'
            : 'zero-seed'
      const candidate = progressPoint(point, filters, {
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
        bestOrigin: origin,
      })
      accountCapacityNovelty(novelty, candidate)
      candidate.cumulativeParetoNovelCount = novelty.paretoNovel
      candidate.cumulativeDominatedCount = novelty.dominated
      candidate.cumulativeEquivalentMetricCount = novelty.equivalent
      onRawCandidate?.(candidate)
      if (shouldReport(best, candidate)) {
        best = candidate
      }
      if (best !== undefined) context.report({
        ...best,
        evaluationCount: candidate.evaluationCount,
        elapsedMs: candidate.elapsedMs,
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
        cumulativeParetoNovelCount: novelty.paretoNovel,
        cumulativeDominatedCount: novelty.dominated,
        cumulativeEquivalentMetricCount: novelty.equivalent,
      })
    },
  })
  return {
    terminationReason: result.stopReason,
    metadata: {
      searchComponent: 'structural-beam-v1',
      beamWidth: 4,
      proposalsPerParent: 8,
      localPolishEvaluations: 120,
      evaluatedStateCount: result.candidates.length,
      paretoRetained: result.paretoRetained,
      structuralOperationCount,
      stopReason: result.stopReason,
      teacherSeedCount: data.proposalSeeds.length,
      seedPolicy,
      nodeVersion: process.version,
    },
  }
}

interface CompositionTracker {
  best?: CapacityTournamentProgressPointV1
  candidateOffset: number
  structuralOffset: number
  paretoNovelOffset: number
  dominatedOffset: number
  equivalentOffset: number
  novelty: NoveltyAccounting
  trace: Record<string, unknown>[]
}

function createCompositionTracker(): CompositionTracker {
  return {
    candidateOffset: 0,
    structuralOffset: 0,
    paretoNovelOffset: 0,
    dominatedOffset: 0,
    equivalentOffset: 0,
    novelty: createCapacityNoveltyAccounting(),
    trace: [],
  }
}

function beginCompositionPhase(
  root: CapacityTournamentExecutionContext,
  tracker: CompositionTracker,
  lineage: string,
  localCandidateStart = 0,
  localStructuralStart = 0,
  localNoveltyStart = { pareto: 0, dominated: 0, equivalent: 0 },
  phaseExpired: () => boolean = root.isExpired,
) {
  const candidateBase = tracker.candidateOffset
  const structuralBase = tracker.structuralOffset
  const paretoBase = tracker.paretoNovelOffset
  const dominatedBase = tracker.dominatedOffset
  const equivalentBase = tracker.equivalentOffset
  let localCandidateMaximum = localCandidateStart
  let localStructuralMaximum = localStructuralStart
  let localParetoMaximum = localNoveltyStart.pareto
  let localDominatedMaximum = localNoveltyStart.dominated
  let localEquivalentMaximum = localNoveltyStart.equivalent
  let localBest: CapacityTournamentProgressPointV1 | undefined
  const context: CapacityTournamentExecutionContext = {
    ...root,
    isExpired: () => root.isExpired() || phaseExpired(),
    report: (point) => {
      const observedElapsedMs = root.elapsedMs()
      if (observedElapsedMs >= 60_000) {
        tracker.trace.push({
          event: 'late-component-progress-rejected',
          lineage,
          candidateId: point.candidateId,
          observedElapsedMs,
        })
        return
      }
      localCandidateMaximum = Math.max(localCandidateMaximum, point.cumulativeCandidateCount)
      localStructuralMaximum = Math.max(localStructuralMaximum, point.structuralOperationCount)
      localParetoMaximum = Math.max(localParetoMaximum, point.cumulativeParetoNovelCount)
      localDominatedMaximum = Math.max(localDominatedMaximum, point.cumulativeDominatedCount)
      localEquivalentMaximum = Math.max(localEquivalentMaximum, point.cumulativeEquivalentMetricCount)
      const cumulativeCandidateCount = candidateBase + point.cumulativeCandidateCount - localCandidateStart
      const structuralOperationCount = structuralBase + point.structuralOperationCount - localStructuralStart
      const cumulativeParetoNovelCount = tracker.novelty.paretoNovel
      const cumulativeDominatedCount = tracker.novelty.dominated
      const cumulativeEquivalentMetricCount = tracker.novelty.equivalent
      const candidate: CapacityTournamentProgressPointV1 = {
        ...point,
        evaluationCount: cumulativeCandidateCount,
        elapsedMs: observedElapsedMs,
        cumulativeCandidateCount,
        structuralOperationCount,
        cumulativeParetoNovelCount,
        cumulativeDominatedCount,
        cumulativeEquivalentMetricCount,
        bestOrigin: `${lineage}:${point.bestOrigin}`,
      }
      if (shouldReport(localBest, candidate)) localBest = candidate
      if (shouldReport(tracker.best, candidate)) tracker.best = candidate
      if (tracker.best !== undefined) root.report({
        ...tracker.best,
        evaluationCount: cumulativeCandidateCount,
        elapsedMs: candidate.elapsedMs,
        cumulativeCandidateCount,
        structuralOperationCount,
        cumulativeParetoNovelCount,
        cumulativeDominatedCount,
        cumulativeEquivalentMetricCount,
      })
      tracker.trace.push({
        event: 'component-progress',
        lineage,
        ...candidate,
      })
    },
  }
  return {
    context,
    observeRaw: (point: CapacityTournamentProgressPointV1) => {
      accountCapacityNovelty(tracker.novelty, point)
      tracker.trace.push({ event: 'raw-candidate', lineage, ...point })
    },
    get localBest() { return localBest },
    finish: () => {
      tracker.candidateOffset = candidateBase + localCandidateMaximum - localCandidateStart
      tracker.structuralOffset = structuralBase + localStructuralMaximum - localStructuralStart
      tracker.paretoNovelOffset = tracker.novelty.paretoNovel
      tracker.dominatedOffset = tracker.novelty.dominated
      tracker.equivalentOffset = tracker.novelty.equivalent
    },
  }
}

function proposalSeed(sourceId: string, filters: readonly Filter[]): ProposalSeedV1 {
  return {
    version: 1,
    problemId: '',
    inputSha256: '',
    sourceKind: 'transfer',
    sourceId,
    filters: filters.map((filter) => ({ ...filter })),
  }
}

function seedForData(
  data: TournamentCaseData,
  sourceId: string,
  filters: readonly Filter[],
): ProposalSeedV1 {
  return {
    ...proposalSeed(sourceId, filters),
    problemId: data.problem.problemId,
    inputSha256: data.problem.inputSha256,
  }
}

function feedbackSemanticKey(filters: readonly Filter[]): string {
  return JSON.stringify(filters.map(({ id: _id, ...filter }) => filter).sort((left, right) =>
    left.type.localeCompare(right.type) || left.frequencyHz - right.frequencyHz ||
    left.gainDb - right.gainDb || left.q - right.q))
}

function runMpStructuralComposition(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  replacementOrdering: MatchingPursuitReplacementOrdering,
): CapacityTournamentExecutionResult {
  const tracker = createCompositionTracker()
  const mpPhase = beginCompositionPhase(
    context, tracker, 'zero→matching-pursuit', 0, 0,
    { pareto: 0, dominated: 0, equivalent: 0 }, () => context.elapsedMs() >= 15_000,
  )
  const mp = runMatchingPursuitVariant(mpPhase.context, data, replacementOrdering, mpPhase.observeRaw)
  mpPhase.finish()
  const mpBest = mpPhase.localBest
  let structuralStopReason = 'not-started'
  if (mpBest !== undefined && !context.isExpired()) {
    const structuralPhase = beginCompositionPhase(context, tracker, 'zero→matching-pursuit→structural')
    const structural = runStructuralBeamVariant(structuralPhase.context, {
      ...data,
      proposalSeeds: [seedForData(data, mpBest.candidateId, mpBest.filters)],
    }, 'proposal', structuralPhase.observeRaw, false)
    structuralStopReason = structural.terminationReason
    structuralPhase.finish()
  }
  return {
    terminationReason: context.isExpired() ? 'deadline' : 'phase-budget',
    metadata: {
      searchComponent: 'mp-structural-v2',
      mpPhaseBudgetMs: 15_000,
      cumulativeCandidateCount: tracker.candidateOffset,
      structuralOperationCount: tracker.structuralOffset,
      feedbackEnabled: false,
      mpPhaseStopReason: mp.terminationReason === 'deadline' ? 'phase-budget' : mp.terminationReason,
      mpContinuationHadAdmissibleWork: mp.terminationReason === 'deadline' && !context.isExpired(),
      structuralStopReason,
      nodeVersion: process.version,
    },
    researchTrace: [...tracker.trace, ...(mp.researchTrace ?? [])],
  }
}

interface FeedbackSeed {
  candidateId: string
  filters: Filter[]
}

function runAnytimeComposition(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  replacementOrdering: MatchingPursuitReplacementOrdering,
  feedbackEnabled: boolean,
): CapacityTournamentExecutionResult {
  const tracker = createCompositionTracker()
  const feedbackQueue: FeedbackSeed[] = []
  const queued = new Set<string>()
  let mpCandidateCount = 0
  let mpStructuralCount = 0
  let mpParetoCount = 0
  let mpDominatedCount = 0
  let mpEquivalentCount = 0
  let activeMpContext: CapacityTournamentExecutionContext | undefined
  const mpTrace: Record<string, unknown>[] = []
  const continuation = createMatchingPursuitContinuation({
    problem: data.problem,
    seed: context.seed ?? 0,
    evaluationBudget: 1_000_000,
    referenceFrontier: data.references,
    referenceSnapshotSha256: context.referenceSnapshotSha256,
    replacementOrdering,
    isExpired: context.isExpired,
    nowMs: context.nowMs,
    elapsedMs: context.elapsedMs,
    onWorkUnitStart: context.startWorkUnit,
    onTelemetry: (event, filters) => {
      if (event.paretoNovel) mpParetoCount += 1
      else if (event.dominated) mpDominatedCount += 1
      else if (event.equivalentMetrics) mpEquivalentCount += 1
      mpTrace.push({ component: 'matching-pursuit-v1', ...event })
      const semanticKey = feedbackSemanticKey(filters)
      if (feedbackEnabled && event.paretoNovel && event.selectedChange && event.phase !== 'baseline' &&
        !queued.has(semanticKey)) {
        queued.add(semanticKey)
        feedbackQueue.push({ candidateId: event.candidateId, filters: filters.map((filter) => ({ ...filter })) })
      }
    },
    onPoint: (point, filters) => {
      mpCandidateCount += 1
      if (point.candidateId.includes(':replacement-')) mpStructuralCount += 1
      const candidate = progressPoint(point, filters, {
        cumulativeCandidateCount: mpCandidateCount,
        structuralOperationCount: mpStructuralCount,
        bestOrigin: point.candidateId.includes(':replacement-')
          ? 'matching-pursuit-replacement'
          : point.candidateId.includes(':sparse-') ? 'matching-pursuit-greedy' : 'matching-pursuit-baseline',
        cumulativeParetoNovelCount: mpParetoCount,
        cumulativeDominatedCount: mpDominatedCount,
        cumulativeEquivalentMetricCount: mpEquivalentCount,
      })
      if (activeMpContext !== undefined) {
        accountCapacityNovelty(tracker.novelty, candidate)
        activeMpContext.report(candidate)
      }
    },
  })
  const schedule = runAnytimeFeedbackSchedule({
    isExpired: context.isExpired,
    mpDone: () => continuation.done,
    advanceMpSlice: () => {
      const phase = beginCompositionPhase(
        context, tracker, 'zero→matching-pursuit', mpCandidateCount, mpStructuralCount,
        { pareto: mpParetoCount, dominated: mpDominatedCount, equivalent: mpEquivalentCount },
      )
      activeMpContext = phase.context
      const before = continuation.emittedCandidates
      advanceMatchingPursuitContinuation(continuation, 64)
      activeMpContext = undefined
      phase.finish()
      return continuation.emittedCandidates - before
    },
    takeFeedback: () => feedbackEnabled ? feedbackQueue.shift() : undefined,
    processFeedback: (seed) => {
      if (context.isExpired()) return 0
      const structuralPhase = beginCompositionPhase(
        context, tracker, `zero→matching-pursuit→structural:${seed.candidateId}`,
      )
      const structural = runStructuralBeam({
        problem: data.problem,
        seed: context.seed ?? 0,
        evaluationBudget: 12,
        referenceFrontier: data.references,
        referenceSnapshotSha256: context.referenceSnapshotSha256,
        config: { beamWidth: 2, proposalsPerParent: 4, localPolishEvaluations: 24, maxFilters: 10 },
        includeZeroSeed: false,
        seeds: [{ seedId: seed.candidateId, origin: 'matching-pursuit', filters: seed.filters }],
        isExpired: structuralPhase.context.isExpired,
        nowMs: context.nowMs,
        onWorkUnitStart: context.startWorkUnit,
        onPoint: (point, filters) => {
          const candidate = progressPoint(point, filters, {
            cumulativeCandidateCount: point.evaluationCount + 1,
            structuralOperationCount: Math.max(0, point.evaluationCount),
            bestOrigin: 'matching-pursuit-seed→structural',
          })
          structuralPhase.observeRaw(candidate)
          structuralPhase.context.report(candidate)
        },
      })
      const structuralBest = structuralPhase.localBest
      structuralPhase.finish()
      let stateBankWork = 0
      if (structuralBest !== undefined && !context.isExpired()) {
        const statePhase = beginCompositionPhase(
          context, tracker, `zero→matching-pursuit→structural→state-bank:${seed.candidateId}`,
        )
        const stateResult = runStateBank(statePhase.context, {
          ...data,
          proposalSeeds: [seedForData(data, structuralBest.candidateId, structuralBest.filters)],
        }, 'proposal', false, statePhase.observeRaw)
        stateBankWork = Number(stateResult.metadata.cumulativeCandidateCount ?? 0)
        statePhase.finish()
      }
      return structural.candidates.length + stateBankWork
    },
  })
  return {
    terminationReason: context.isExpired()
      ? 'deadline'
      : schedule.stopReason === 'exhausted'
        ? 'search-space-exhausted-under-current-mechanism'
        : 'no-admissible-proposals',
    metadata: {
      searchComponent: feedbackEnabled ? 'anytime-feedback-v2' : 'anytime-no-feedback-v2',
      feedbackEnabled,
      mpSliceCandidates: 64,
      scheduleRounds: schedule.rounds,
      mpSlices: schedule.mpSlices,
      handoffs: schedule.handoffs,
      workUnits: schedule.workUnits,
      cumulativeCandidateCount: tracker.candidateOffset,
      structuralOperationCount: tracker.structuralOffset,
      queuedNovelSelections: queued.size,
      unprocessedFeedbackSeeds: feedbackQueue.length,
      scheduleStopReason: schedule.stopReason,
      mpDone: continuation.done,
      feedbackQueuePending: feedbackQueue.length > 0,
      nodeVersion: process.version,
    },
    researchTrace: [...tracker.trace, ...mpTrace],
  }
}

function createVariants(
  dataByCase: ReadonlyMap<string, TournamentCaseData>,
  options: Pick<CapacityTournamentCliOptions, 'variants' | 'stateBankSeeds' | 'structuralSeeds' | 'mpReplacementOrdering'>,
): CapacityTournamentVariant[] {
  const variants: CapacityTournamentVariant[] = [
    {
      algorithmId: 'state-bank-v1',
      variantId: 'state-bank-v1',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStateBank(context, {
          ...data,
          proposalSeeds: selectAblationSeeds(data.proposalSeeds, options.stateBankSeeds),
        }, options.stateBankSeeds)
      },
    },
    {
      algorithmId: 'matching-pursuit-v1',
      variantId: 'matching-pursuit-v1',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runMatchingPursuitVariant(context, data, options.mpReplacementOrdering)
      },
    },
    {
      algorithmId: 'structural-beam-v1',
      variantId: 'structural-beam-v1',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStructuralBeamVariant(context, {
          ...data,
          proposalSeeds: selectAblationSeeds(data.proposalSeeds, options.structuralSeeds),
        }, options.structuralSeeds)
      },
    },
    {
      algorithmId: 'state-bank-v1',
      variantId: 'state-bank-pure-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStateBank(context, { ...data, proposalSeeds: [] }, 'none')
      },
    },
    {
      algorithmId: 'state-bank-v1',
      variantId: 'state-bank-teacher-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStateBank(context, data, 'proposal')
      },
    },
    {
      algorithmId: 'structural-beam-v1',
      variantId: 'structural-pure-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStructuralBeamVariant(context, { ...data, proposalSeeds: [] }, 'none')
      },
    },
    {
      algorithmId: 'structural-beam-v1',
      variantId: 'teacher-structural-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runStructuralBeamVariant(context, data, 'proposal')
      },
    },
    {
      algorithmId: 'mp-structural-v2',
      variantId: 'mp-structural-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runMpStructuralComposition(context, data, options.mpReplacementOrdering)
      },
    },
    {
      algorithmId: 'anytime-composition-v2',
      variantId: 'anytime-no-feedback-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runAnytimeComposition(context, data, options.mpReplacementOrdering, false)
      },
    },
    {
      algorithmId: 'anytime-composition-v2',
      variantId: 'anytime-feedback-v2',
      run: (context) => {
        const data = dataByCase.get(context.problemId)
        if (data === undefined) throw new Error(`missing tournament case data: ${context.problemId}`)
        return runAnytimeComposition(context, data, options.mpReplacementOrdering, true)
      },
    },
  ]
  return variants.filter((variant) =>
    options.variants.includes(variant.variantId as CapacityTournamentCliOptions['variants'][number]))
}

function execute(options: CapacityTournamentCliOptions): CapacityTournamentCompleteReport {
  const snapshotPath = resolve(options.snapshot)
  const snapshot = readSnapshot(snapshotPath)
  const proposalSeedsDir = resolve(
    options.proposalSeedsDir ?? join(dirname(snapshotPath), 'proposal-seeds'),
  )
  const dataByCase = new Map<string, TournamentCaseData>()
  const inputs: CapacityTournamentCaseInput[] = []
  for (const caseId of options.cases) {
    const data = caseData(snapshot, caseId, proposalSeedsDir)
    dataByCase.set(caseId, data)
    inputs.push(data.input)
  }
  const variants = createVariants(dataByCase, options)
  const tournament = runCapacityTournament({
    cases: inputs,
    variants,
    shortlistedVariantIds: variants.map((variant) => variant.variantId),
    checkpointsMs: options.checkpointsMs,
  })
  return {
    schemaVersion: 1,
    program: 'autoeq-capacity-aware-solver',
    status: 'complete',
    snapshot: { path: snapshotPath, contentSha256: snapshot.contentSha256 },
    cases: options.cases,
    checkpointsMs: options.checkpointsMs,
    maxFilters: 10,
    registeredVariantIds: variants.map((variant) => variant.variantId),
    runs: tournament.runs,
    tournament,
    blockers: [],
    excludedFromRuntimeTournament: [20, 40, 64],
    holdout: { executed: false },
    productionPromotion: { executed: false },
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseOptions(args)
  const report = execute(options)
  const output = resolve(options.out)
  mkdirSync(output, { recursive: true })
  writeFileSync(`${output}/tournament-report.json`, JSON.stringify(report, null, 2) + '\n')
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
