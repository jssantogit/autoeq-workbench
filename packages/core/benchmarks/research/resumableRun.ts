import { performance } from 'node:perf_hooks'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateV2Solution,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../src/index.js'
import {
  createJointRefineContinuationV2,
  type JointRefineContinuationV2,
} from '../../src/autoeq/v2/jointRefineContinuation.js'

import {
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import { computeQualityTimeFrontier } from './qualityTime.js'
import {
  assertSolverRunArtifactV1,
  type SolverRunArtifactV1,
  type SolverTrajectoryPointV1,
} from './solverRunArtifact.js'
import {
  runResumableScheduler,
  type ResearchStateOrigin,
  type ResumableSchedulerPolicy,
  type ScheduledResearchState,
} from './resumableScheduler.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import {
  loadProposalSeeds,
  type ProposalSeedV1,
} from './proposalSeeds.js'
import { selectReferencePoint } from './referenceSelector.js'

interface ResumableRunOptions {
  snapshot: string
  caseId: string
  policy: ResumableSchedulerPolicy
  maxFilters: number
  evaluationBudget: number
  seed: number
  proposalSeeds?: string
  out: string
}

function requiredOption(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name)
  if (value === undefined || value.length === 0) throw new Error(`Missing required option ${name}`)
  return value
}

function parseInteger(value: string, label: string, minimum = 0): number {
  if (!/^-?\d+$/.test(value)) throw new Error(`${label} requires an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${label} is out of range`)
  return parsed
}

function parseOptions(args: readonly string[]): ResumableRunOptions {
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
  const policy = requiredOption(values, '--policy')
  if (policy !== 'resumable-beam-v1' && policy !== 'state-bank-v1') {
    throw new Error('--policy must be resumable-beam-v1 or state-bank-v1')
  }
  const maxFilters = parseInteger(requiredOption(values, '--max-filters'), '--max-filters', 1)
  if (maxFilters !== 10) throw new Error('resumable research is fixed to the product Max10 cap')
  return {
    snapshot: requiredOption(values, '--snapshot'),
    caseId: requiredOption(values, '--case'),
    policy,
    maxFilters,
    evaluationBudget: parseInteger(requiredOption(values, '--evaluation-budget'), '--evaluation-budget', 1),
    seed: parseInteger(requiredOption(values, '--seed'), '--seed'),
    proposalSeeds: values.get('--proposal-seeds'),
    out: requiredOption(values, '--out'),
  }
}

function readSnapshot(path: string): OracleReferenceSnapshotV1 {
  const value: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'))
  assertOracleReferenceSnapshotV1(value)
  return value
}

function referencePoints(
  cell: ReturnType<typeof getReferenceCell>,
): ReferenceRegretPoint[] {
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

function objectiveFromPoint(point: SolverTrajectoryPointV1): ReferenceRegretPoint {
  return {
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
  }
}

function objectiveDominates(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  const epsilon = 1e-12
  return left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (
      left.canonicalRmseDb < right.canonicalRmseDb - epsilon ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon
    )
}

function shouldReplaceBest(previous: SolverTrajectoryPointV1, candidate: SolverTrajectoryPointV1): boolean {
  if (objectiveDominates(candidate, previous)) return true
  if (objectiveDominates(previous, candidate)) return false
  return selectReferencePoint([
    { ...objectiveFromPoint(previous), cancellationScore: 0 },
    { ...objectiveFromPoint(candidate), cancellationScore: 0 },
  ]).candidateId === candidate.candidateId
}

function appendFrozenBestTrajectory(
  trajectory: SolverTrajectoryPointV1[],
  point: SolverTrajectoryPointV1,
): void {
  const previous = trajectory.at(-1)
  if (previous === undefined || shouldReplaceBest(previous, point)) trajectory.push(point)
}

function stateOriginForSeed(seed: ProposalSeedV1): ResearchStateOrigin {
  return seed.sourceKind === 'transfer'
    ? 'transferred'
    : seed.sourceKind === 'known-good'
      ? 'known-good'
      : 'v1-seeded'
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
    deadline: { isExpired: () => false },
  })
}

function candidateForState(
  problem: SolverLabProblemV1,
  policy: ResumableSchedulerPolicy,
  state: ScheduledResearchState,
  seed: number,
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: `${policy}:${state.key}:${state.slicesReceived}`,
    algorithmId: policy,
    seed,
    filters: state.continuation.solution.filters.map((filter) => ({ ...filter })),
  }
}

function trajectoryPointForState(
  problem: SolverLabProblemV1,
  references: readonly ReferenceRegretPoint[],
  policy: ResumableSchedulerPolicy,
  state: ScheduledResearchState,
  seed: number,
  evaluationCount: number,
  elapsedMs: number,
): SolverTrajectoryPointV1 {
  const candidate = candidateForState(problem, policy, state, seed)
  const evaluation = evaluateSolverLabCandidate(problem, candidate)
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`resumable candidate ${candidate.candidateId} was rejected: ${evaluation.rejectionReason}`)
  }
  const delivered = evaluation.deliverable
  const point = {
    candidateId: candidate.candidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
  }
  const regret = directedReferenceRegret(point, references)
  return {
    evaluationCount,
    elapsedMs,
    candidateId: candidate.candidateId,
    actualDeliveredFilterCount: delivered.filters.length,
    canonicalRmseDb: delivered.rmseDb,
    canonicalMaxAbsDb: delivered.maxAbsDb,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function run(options: ResumableRunOptions): SolverRunArtifactV1 {
  const snapshot = readSnapshot(options.snapshot)
  const researchCase = loadLayeredResearchCases('adversarial').find((candidate) => candidate.id === options.caseId)
  if (researchCase === undefined) throw new Error(`Unknown approved research case: ${options.caseId}`)
  const problem = createSolverLabProblem(researchCase, options.maxFilters)
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, options.maxFilters)
  const references = referencePoints(cell)
  if (references.length === 0) throw new Error('reference cell has no deliverable frontier')
  const proposalSeeds = options.proposalSeeds === undefined
    ? []
    : loadProposalSeeds(options.proposalSeeds, problem, options.maxFilters)

  const freshStates: ScheduledResearchState[] = [{
    key: 'fresh:zero',
    origin: 'fresh',
    continuation: makeContinuation(problem, []),
    slicesReceived: 0,
  }]
  const proposalBankStates = proposalSeeds.map((seed, index) => ({
    key: `${seed.sourceKind}:${seed.sourceId}:${index}`,
    origin: stateOriginForSeed(seed),
    continuation: makeContinuation(problem, seed.filters),
    slicesReceived: 0,
  }))
  const trajectory: SolverTrajectoryPointV1[] = []
  const startedAt = performance.now()
  const originCounts: Record<ResearchStateOrigin, number> = {
    fresh: 1,
    resumed: 0,
    transferred: 0,
    'known-good': 0,
    'v1-seeded': 0,
  }
  const initial = trajectoryPointForState(
    problem,
    references,
    options.policy,
    freshStates[0]!,
    options.seed,
    0,
    0,
  )
  trajectory.push(initial)
  let totalCoordinateTrials = 0
  const result = runResumableScheduler({
    policy: options.policy,
    maxSlices: options.evaluationBudget,
    freshStates,
    proposalBankStates,
    advance: (state) => {
      const previousCoordinateTrials = state.continuation.coordinateTrials
      const nextContinuation = advanceJointRefineContinuationV2(state.continuation)
      totalCoordinateTrials += nextContinuation.coordinateTrials - previousCoordinateTrials
      originCounts[state.origin] += 1
      const nextState = { ...state, continuation: nextContinuation }
      const point = trajectoryPointForState(
        problem,
        references,
        options.policy,
        { ...nextState, slicesReceived: state.slicesReceived + 1 },
        options.seed,
        totalCoordinateTrials,
        Math.min(60_000, Math.max(0, performance.now() - startedAt)),
      )
      appendFrozenBestTrajectory(trajectory, point)
      return nextState
    },
  })
  const qualityTimePoints = trajectory.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  }))
  const qualityTimeFrontierV1 = qualityTimePoints.length > 0
    ? computeQualityTimeFrontier(qualityTimePoints)
    : null
  const artifact: SolverRunArtifactV1 = {
    schemaVersion: 1,
    algorithmId: options.policy,
    variantId: options.policy,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    maxFilters: options.maxFilters,
    referenceSnapshotSha256: snapshot.contentSha256,
    seed: options.seed,
    evaluationBudget: options.evaluationBudget,
    trajectory,
    qualityTimeFrontierV1,
    metadata: {
      policy: options.policy,
      freshStateCount: result.freshStates.length,
      proposalBankStateCount: result.proposalBankStates.length,
      freshSlices: result.slices.filter((slice) => slice.source === 'fresh').length,
      proposalBankSlices: result.slices.filter((slice) => slice.source === 'proposal-bank').length,
      freshOriginCount: originCounts.fresh,
      resumedOriginCount: originCounts.resumed,
      transferredOriginCount: originCounts.transferred,
      knownGoodOriginCount: originCounts['known-good'],
      v1SeededOriginCount: originCounts['v1-seeded'],
      referenceState: cell.referenceState,
      referenceStillMoving: cell.referenceState === 'still-moving',
      runner: 'node-ts-research-resumable-v1',
    },
  }
  assertSolverRunArtifactV1(artifact)
  return artifact
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseOptions(args)
  const artifact = run(options)
  mkdirSync(dirname(resolve(options.out)), { recursive: true })
  writeFileSync(resolve(options.out), JSON.stringify(artifact, null, 2) + '\n')
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
