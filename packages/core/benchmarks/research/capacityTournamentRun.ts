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
} from './capacityTournament.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { runMatchingPursuit } from './matchingPursuit.js'
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
  variants: ('state-bank-v1' | 'matching-pursuit-v1' | 'structural-beam-v1')[]
  stateBankSeeds: AblationSeedPolicy
  structuralSeeds: AblationSeedPolicy
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
  const allowedVariants = new Set(['state-bank-v1', 'matching-pursuit-v1', 'structural-beam-v1'])
  if (variants.length === 0 || new Set(variants).size !== variants.length ||
    variants.some((variant) => !allowedVariants.has(variant))) {
    throw new Error('--variants must contain unique approved component IDs')
  }
  const stateBankSeeds = values.get('--state-bank-seeds') ?? 'proposal'
  const structuralSeeds = values.get('--structural-seeds') ?? 'proposal'
  if ((stateBankSeeds !== 'none' && stateBankSeeds !== 'proposal') ||
    (structuralSeeds !== 'none' && structuralSeeds !== 'proposal')) {
    throw new Error('seed policies must be none or proposal')
  }
  const known = new Set([
    '--snapshot', '--cases', '--checkpoints-ms', '--out', '--proposal-seeds-dir',
    '--variants', '--state-bank-seeds', '--structural-seeds',
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
  },
): CapacityTournamentProgressPointV1 {
  return {
    ...point,
    ...work,
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
): CapacityTournamentExecutionResult {
  const startedAt = context.nowMs()
  const freshStates: ScheduledResearchState[] = [{
    key: 'fresh:zero',
    origin: 'fresh',
    continuation: makeContinuation(data.problem, [], context),
    slicesReceived: 0,
  }]
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
    const delivered = evaluation.deliverable
    const regret = directedReferenceRegret({
      candidateId: candidate.candidateId,
      rmseDb: delivered.rmseDb,
      maxAbsDb: delivered.maxAbsDb,
      filterCount: delivered.filters.length,
    }, data.references)
    const point = progressPoint({
      evaluationCount,
      elapsedMs: Math.min(60_000, Math.max(0, context.nowMs() - startedAt)),
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
    })
  }

  reportState(freshStates[0]!)
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
): CapacityTournamentExecutionResult {
  let best: CapacityTournamentProgressPointV1 | undefined
  let candidateCount = 0
  let structuralOperationCount = 0
  const result = runMatchingPursuit({
    problem: data.problem,
    seed: context.seed ?? 0,
    evaluationBudget: 1_000_000,
    referenceFrontier: data.references,
    referenceSnapshotSha256: context.referenceSnapshotSha256,
    isExpired: context.isExpired,
    nowMs: context.nowMs,
    onPoint: (point, filters) => {
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
      })
      if (shouldReport(best, candidate)) {
        best = candidate
      }
      if (best !== undefined) context.report({
        ...best,
        evaluationCount: candidate.evaluationCount,
        elapsedMs: candidate.elapsedMs,
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
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
    },
  }
}

function runStructuralBeamVariant(
  context: CapacityTournamentExecutionContext,
  data: TournamentCaseData,
  seedPolicy: AblationSeedPolicy,
): CapacityTournamentExecutionResult {
  let best: CapacityTournamentProgressPointV1 | undefined
  let candidateCount = 0
  let structuralOperationCount = 0
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
    onPoint: (point, filters) => {
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
      if (shouldReport(best, candidate)) {
        best = candidate
      }
      if (best !== undefined) context.report({
        ...best,
        evaluationCount: candidate.evaluationCount,
        elapsedMs: candidate.elapsedMs,
        cumulativeCandidateCount: candidateCount,
        structuralOperationCount,
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

function createVariants(
  dataByCase: ReadonlyMap<string, TournamentCaseData>,
  options: Pick<CapacityTournamentCliOptions, 'variants' | 'stateBankSeeds' | 'structuralSeeds'>,
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
        return runMatchingPursuitVariant(context, data)
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
