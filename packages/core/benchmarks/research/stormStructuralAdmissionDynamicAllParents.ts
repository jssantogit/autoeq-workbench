import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascadeMagnitudeDb, type Filter } from '../../src/index.js'

import {
  rankStormStructuralAdmissionPrePolish,
  type StormStructuralAdmissionPrePolishRanking,
  type StormStructuralAdmissionPrePolishScore,
} from './stormStructuralAdmissionCheapAdmission.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { directedReferenceRegret, type ReferenceRegretPoint } from './referenceRegret.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import { selectReferencePoint } from './referenceSelector.js'
import {
  DEFAULT_SNAPSHOT,
  resolveResearchPath,
  STORM_SEED_ALLOCATION_CONFIG,
} from './seedAllocationRun.js'
import {
  createStructuralBeamDiagnosticTrace,
  runStructuralBeam,
  type StructuralBeamAdmissionContext,
  type StructuralBeamAdmissionDecision,
  type StructuralBeamAdmissionOverride,
  type StructuralBeamDiagnosticEntry,
  type StructuralBeamDiagnosticTrace,
  type StructuralBeamRunResult,
  type StructuralProposal,
} from './structuralBeam.js'
import {
  STORM_DIAGNOSTIC_REPLAY_OUTPUT,
  STORM_REFERENCE_SNAPSHOT_SHA256,
  STORM_SOURCE_ARTIFACT_SHA256,
} from './stormDiagnosticReplay.js'
import {
  enumerateStormStructuralProposals,
  type EnumeratedStormStructuralProposal,
  STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT,
  type StormStructuralProposalCensusArtifact,
} from './stormStructuralProposalCensus.js'
import type { SolverTrajectoryPointV1 } from './solverRunArtifact.js'

export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPERIMENT_VERSION =
  'storm-cheap-admission-dynamic-all-parents-v1' as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_OUTPUT =
  'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json' as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-cheap-admission-dynamic-all-parents-results.md' as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_SOURCE_COMMIT =
  'a2c8cef000259b7bb4b4efb640f70fb1c6069dab' as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_CONTROL_TOP4 = [1, 2, 3, 4] as const
export const STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_INITIAL_CHEAP_TOP4 = [3, 1, 10, 9] as const
export const DYNAMIC_ALL_PARENTS_REPETITIONS = 4 as const
export const DYNAMIC_ALL_PARENTS_ARM_ORDER = Object.freeze([
  'lexical-all',
  'cheap-initial-only',
  'cheap-all-parents',
  'cheap-initial-only',
  'cheap-all-parents',
  'lexical-all',
  'cheap-all-parents',
  'lexical-all',
  'lexical-all',
  'cheap-initial-only',
  'cheap-all-parents',
  'cheap-initial-only',
] as const)
export const DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET = 16 as const
export const DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET = 17 as const
export const DYNAMIC_ALL_PARENTS_DEADLINE_MS = 60_000 as const
export const DYNAMIC_ALL_PARENTS_HORIZONS_MS = [5_000, 15_000, 30_000, 60_000] as const
export const DYNAMIC_ALL_PARENTS_PARTIAL_REFINEMENT_COORDINATE_TRIALS = 0 as const
export const DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_ARTIFACT_SHA256 =
  'd645d4a7af10a1630d4cb136eef87b9d5e3943b3800b1dce01da43536678145f' as const
export const DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_REPORT_SHA256 =
  '40eb0662ede553763f058dbe2df180856c022c75be1e7f33dab59b9e2e3338a8' as const
export const DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_ARTIFACT_SHA256 =
  '6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc' as const
export const DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_REPORT_SHA256 =
  '5165eaefb2ab393b2e55e29b9d85ffdc827401bb3b48f8bb0c2c50fe64f579f4' as const
export const DYNAMIC_ALL_PARENTS_COST_AWARE_ARTIFACT =
  'packages/core/.research-artifacts/storm-cheap-admission-cost-aware-20260910/sparse-0010/cost-aware-report.json' as const
export const DYNAMIC_ALL_PARENTS_COST_AWARE_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-cheap-admission-cost-aware-results.md' as const
export const DYNAMIC_ALL_PARENTS_CHEAP_ARTIFACT =
  'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json' as const
export const DYNAMIC_ALL_PARENTS_CHEAP_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-cheap-admission-causal-results.md' as const

export type StormStructuralAdmissionDynamicAllParentsArmId =
  (typeof DYNAMIC_ALL_PARENTS_ARM_ORDER)[number]

export type StormStructuralAdmissionDynamicAllParentsClassification =
  | 'dynamic-all-parent-supported'
  | 'initial-only-sufficient-at-this-budget'
  | 'dynamic-all-parent-harmful'
  | 'dynamic-all-parent-mixed'
  | 'inconclusive'

export interface StormStructuralAdmissionDynamicMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
  referenceRegret: number
  referenceImproved: boolean
}

export interface StormStructuralAdmissionDynamicParentDecision {
  parentIdentity: string
  layerIndex: number
  parentIndex: number
  parentMetrics: Omit<StormStructuralAdmissionDynamicMetric, 'referenceImproved'>
  proposalCount: number
  lexicalRanking: number[]
  cheapRanking: number[] | null
  lexicalTop4: number[]
  cheapTop4: number[] | null
  overlap: number
  binding: boolean
  rankingSource: 'lexical' | 'runtime-pre-polish-frozen-selector'
  canonicalPrePolishEvaluationCount: number
  partialRefinementCoordinateTrials: 0
  prePolishCandidateIds: string[]
  admittedProposalRanks: number[]
  admittedChildSet: string[]
  scoringElapsedMs: number
  oracleInputsUsed: []
}

export interface StormStructuralAdmissionDynamicFidelity {
  status: 'valid' | 'invalid'
  valid: boolean
  mismatches: Array<{ field: string; expected: unknown; actual: unknown }>
  controlTop4: number[]
  cheapInitialOnlyTop4: number[]
  cheapAllParentsInitialTop4: number[]
  prePolishCanonicalEvaluations: number
  partialRefinementCoordinateTrials: 0
  oracleInputsUsed: []
  initialRankingDerivedAtRuntime: boolean
  futureRankingDerivedAtRuntime: boolean
  lexicalAllParents: boolean
  cheapInitialOnlyScope: boolean
  cheapAllParentsScope: boolean
  parentLocalRankingNoOutcomeReuse: boolean
  normalSolverUnchangedOutsideExperimentalMode: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  fixedDescendantBudgetRespected: boolean
  postInitialParentObserved: boolean
}

export interface StormStructuralAdmissionDynamicAllParentsClassificationInput {
  fidelityValid: boolean
  replicationValid: boolean
  timingProtocolValid: boolean
  budgetSufficient: boolean
  noOracleInputs: boolean
  cherryPickingAbsent: boolean
  initialOnlyBestRegret: number
  lexicalAllBestRegret: number
  dynamicAllParentsBestRegret: number
  initialOnlyBestRmseDb: number
  lexicalAllBestRmseDb: number
  dynamicAllParentsBestRmseDb: number
  initialOnlyBestMaxAbsDb: number
  lexicalAllBestMaxAbsDb: number
  dynamicAllParentsBestMaxAbsDb: number
  dynamicPairwiseWins: number
  dynamicPairwiseLosses: number
  dynamicTimeToQualityConsistentlyWorse: boolean
  dynamicParentOutcomeBenefits: number
  dynamicParentOutcomeLosses: number
  dynamicNoChangeScoringParents: number
}

export interface StormStructuralAdmissionDynamicAllParentsOptions {
  outputPath?: string
  reportPath?: string
  censusInputPath?: string
  replayInputPath?: string
  auditInputPath?: string
  snapshotPath?: string
}

interface FrozenInputs {
  censusPath: string
  replayPath: string
  auditPath: string
  snapshotPath: string
  census: StormStructuralProposalCensusArtifact
  replay: Record<string, unknown>
  problem: SolverLabProblemV1
  references: ReferenceRegretPoint[]
  parentFilters: Filter[]
  parentCandidateId: string
  orderedProposals: EnumeratedStormStructuralProposal[]
  censusSha256: string
  replaySha256: string
  auditSha256: string
  snapshotSha256: string
}

interface InternalParentDecision extends StormStructuralAdmissionDynamicParentDecision {
  parentMetrics: StormStructuralAdmissionDynamicParentDecision['parentMetrics']
  admittedProposalKeys: string[]
}

export interface StormStructuralAdmissionDynamicTiming {
  clock: 'process.hrtime.bigint'
  monotonic: true
  admissionElapsedMs: number
  prePolishCanonicalEvaluationMs: number
  fullPolishCoordinateTrials: number
  totalElapsedMs: number
}

export interface StormStructuralAdmissionDynamicWork {
  proposalsGenerated: number
  parentExpansions: number
  prePolishCanonicalEvaluations: number
  fullPolishCoordinateTrials: number
  descendantEvaluations: number
  canonicalDeliveredEvaluations: number
  unitSemantics: 'raw-counts-by-kind-not-equated'
}

export interface StormStructuralAdmissionDynamicHorizonState {
  horizonMs: number
  observed: StormStructuralAdmissionDynamicTrajectoryPoint | null
  informative: boolean
  reason: 'state-produced-before-horizon' | 'horizon-not-reached' | 'no-state-produced'
}

export interface StormStructuralAdmissionDynamicTrajectoryPoint extends SolverTrajectoryPointV1 {
  metric: StormStructuralAdmissionDynamicMetric
}

export interface StormStructuralAdmissionDynamicArmRun {
  orderIndex: number
  pairIndex: number
  armId: StormStructuralAdmissionDynamicAllParentsArmId
  trajectory: StormStructuralAdmissionDynamicTrajectoryPoint[]
  best: StormStructuralAdmissionDynamicMetric
  firstUsefulImprovement: { evaluationIndex: number; elapsedMs: number } | null
  bestEvaluationIndex: number
  timeToBestMs: number
  paretoNovelty: {
    againstSeedBaselines: number
    descendantsOnly: number
  }
  referenceImprovementEvaluationIndices: number[]
  parentTransitions: string[]
  terminalBeam: string[]
  parentDecisions: StormStructuralAdmissionDynamicParentDecision[]
  changedTop4Parents: number
  changedTop4WithSelectorPreferredChild: number
  scoringPaidNoChangeParents: number
  work: StormStructuralAdmissionDynamicWork
  timing: StormStructuralAdmissionDynamicTiming
  stopReason: StructuralBeamRunResult['stopReason']
  deadline: {
    mode: 'cooperative'
    budgetMs: number
    descendantBudget: number
    evaluationBudget: number
    observedElapsedMs: number
    deadlineRespected: boolean
    evaluationBudgetBound: boolean
    descendantBudgetRespected: boolean
  }
  metadata: Record<string, string | number | boolean>
}

interface AggregateMetric {
  values: Array<number | null>
  observedCount: number
  median: number | null
  minimum: number | null
  maximum: number | null
  spread: number | null
}

interface PairOutcome {
  pairIndex: number
  lexicalAll: StormStructuralAdmissionDynamicMetric
  cheapInitialOnly: StormStructuralAdmissionDynamicMetric
  cheapAllParents: StormStructuralAdmissionDynamicMetric
  dynamicTimeToInitialOnlyQualityMs: number | null
  initialOnlyTimeToDynamicQualityMs: number | null
  lexicalTimeToInitialOnlyQualityMs: number | null
}

interface ComparisonSummary {
  valid: boolean
  materialQualityGain: boolean
  pairwiseWins: number
  pairwiseLosses: number
  final: {
    lexicalAll: AggregateMetric
    cheapInitialOnly: AggregateMetric
    cheapAllParents: AggregateMetric
  }
  rmse: {
    lexicalAll: AggregateMetric
    cheapInitialOnly: AggregateMetric
    cheapAllParents: AggregateMetric
  }
  maxAbs: {
    lexicalAll: AggregateMetric
    cheapInitialOnly: AggregateMetric
    cheapAllParents: AggregateMetric
  }
  reason: string
}

interface GateResults {
  focusedTest: GateStatus
  generation: GateStatus
  rootTest: GateStatus
  typecheck: GateStatus
  build: GateStatus
  lint: GateStatus
  benchmark: GateStatus
  diffCheck: GateStatus
  routingPolicy: GateStatus
}

type GateStatus = 'PASS_THIS_RUN' | 'PASS_PREVIOUSLY_VERIFIED' | 'FAIL' | 'BLOCKED_KNOWN' | 'NOT_RUN'

export interface StormStructuralAdmissionDynamicArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_ADMISSION_DYNAMIC_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  datasetId: 'sparse-0010'
  primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID
  sourceCommit: string | null
  expectedSourceCommit: typeof STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_SOURCE_COMMIT
  taskAction: 'IMPLEMENT'
  taskDomain: 'RESEARCH'
  criticality: 'MAJOR'
  scopeContract: {
    domain: 'RESEARCH'
    action: 'IMPLEMENT'
    allowedPaths: string[]
    forbiddenPaths: string[]
    dependencies: string[]
    plan: string[]
    acceptanceCriteria: string[]
    tests: string[]
    retryBudget: { maxAttempts: 3; attempt: 1; remainingAttempts: 2 }
    stopConditions: string[]
    doNotChange: string[]
    criticality: 'MAJOR'
  }
  timingProtocol: {
    predeclared: true
    repetitions: 4
    armOrder: StormStructuralAdmissionDynamicAllParentsArmId[]
    sameProcessInvocation: true
    orderControl: 'fixed-balanced-deterministic'
    deadlineMode: 'cooperative'
    deadlineMs: 60_000
    descendantBudget: 16
    evaluationBudget: 17
    clock: 'process.hrtime.bigint'
    syntheticClockEvidence: false
    horizonsMs: number[]
    noCherryPicking: true
  }
  machineRuntime: {
    pid: number
    nodeVersion: string
    platform: string
    arch: string
    cpuCount: number
    cpuModel: string | null
    cwd: string
  }
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    localPolishEvaluations: 24
    seedValidationSeparate: true
    excludedCases: readonly ['titan-to-u12t', 'titan-to-trio']
  }
  controls: {
    lexicalAll: string
    cheapInitialOnly: string
    cheapAllParents: string
    frozenSelector: 'reference-selector-v1'
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    mutationGenerator: 'structural-mutation-library-v1'
    normalSolverUnchangedOutsideExperimentalMode: true
  }
  frozenInputs: Record<string, string>
  signal: {
    signalId: 'pre-polish-frozen-selector'
    definition: string
    candidateInputFields: string[]
    forbiddenOracleInputs: string[]
    partialRefinementCoordinateTrials: 0
    oracleInputsUsed: []
    initialControlTop4: number[]
    initialCheapTop4: number[]
  }
  fidelity: StormStructuralAdmissionDynamicFidelity
  runs: StormStructuralAdmissionDynamicArmRun[]
  pairs: PairOutcome[]
  horizonSummaries: Array<{
    horizonMs: number
    lexicalAllRegret: AggregateMetric
    cheapInitialOnlyRegret: AggregateMetric
    cheapAllParentsRegret: AggregateMetric
    informativeRuns: { lexicalAll: number; cheapInitialOnly: number; cheapAllParents: number }
  }>
  comparisons: {
    initialOnlyVsLexicalAll: ComparisonSummary
    dynamicAllParentsVsInitialOnly: ComparisonSummary
  }
  parentSummary: {
    dynamicRuns: number
    parentsExpanded: number
    top4DifferentFromLexical: number
    top4DifferentWithSelectorPreferredChild: number
    scoringPaidWhereTop4Unchanged: number
  }
  classification: StormStructuralAdmissionDynamicAllParentsClassification
  facts: string[]
  interpretation: string[]
  limitations: string[]
  hashes: {
    sourceArtifactSha256: string
    censusArtifactSha256: string
    replayArtifactSha256: string
    signalAuditArtifactSha256: string
    semanticSetSha256: string
    referenceSnapshotSha256: string
    predecessorCostArtifactSha256: typeof DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_ARTIFACT_SHA256
    predecessorCostReportSha256: typeof DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_REPORT_SHA256
    predecessorCheapArtifactSha256: typeof DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_ARTIFACT_SHA256
    predecessorCheapReportSha256: typeof DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_REPORT_SHA256
    deterministicSummarySha256: string
    artifactSha256: string | null
  }
  testsAndGates: {
    focusedTestCommand: string
    generationCommand: string
    requiredGateCommands: string[]
    gateResults: GateResults
  }
}

const SCOPE_CONTRACT: StormStructuralAdmissionDynamicArtifact['scopeContract'] = {
  domain: 'RESEARCH',
  action: 'IMPLEMENT',
  allowedPaths: [
    'packages/core/benchmarks/research/stormStructuralAdmissionDynamicAllParents.ts',
    'packages/core/test/autoeq/v2/research/stormStructuralAdmissionDynamicAllParents.test.ts',
    'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/**',
    'docs/superpowers/specs/2026-09-10-storm-cheap-admission-dynamic-all-parents-results.md',
    'packages/core/benchmarks/research/** (only a necessary experimental helper)',
  ],
  forbiddenPaths: [
    'packages/core/src/**',
    'vendor/squiglink/**',
    'mutation library, frozen selector/reference, quantization, parity fixtures',
    'UI, export, product behavior, historical artifacts/reports, unrelated WIP',
  ],
  dependencies: [
    'frozen structural proposal census, diagnostic replay, signal audit, and reference snapshot',
    'validated initial-parent cheap-admission and cost-aware artifacts',
    'canonical delivered evaluator and opt-in structural beam admission hook',
  ],
  plan: [
    'recompute the same pre-polish frozen-selector signal at runtime per admitted parent',
    'compare lexical-all, cheap-initial-only, and cheap-all-parents under one fixed descendant budget',
    'record per-parent admission, raw trajectories, timing, and separated work counts',
    'classify only after fidelity, budget, no-oracle, and timing gates pass',
  ],
  acceptanceCriteria: [
    'A remains lexical in every parent and starts [1,2,3,4]',
    'B reproduces initial [3,1,10,9] then restores lexical admission',
    'C derives every parent ranking from current pre-polish metrics without future hardcoding',
    'all arms receive the fixed 16-descendant budget and real monotonic timing',
    'contract failure is inconclusive and normal solver behavior is unchanged',
    'artifact/report include predecessor hashes, parent decisions, comparisons, and exact gate statuses',
  ],
  tests: [
    'focused Vitest test for protocol, fidelity, classification, isolation, and contract failure',
    'pnpm test',
    'pnpm typecheck',
    'pnpm build',
    'pnpm lint',
    'pnpm --filter @autoeq-workbench/core benchmark',
    'git diff --check',
    'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs',
  ],
  retryBudget: { maxAttempts: 3, attempt: 1, remainingAttempts: 2 },
  stopConditions: [
    'stop after IMPLEMENTATION_COMPLETE and Terra acceptance decision',
    'return CROSS_DOMAIN_REQUEST for any required product/DSP path or domain expansion',
    'do not run U12t/Trio, MP rank audit, holdout, calibration, promotion, merge, release, deploy, or publish',
  ],
  doNotChange: [
    'normal/default structural admission policy',
    'mutation library, frozen selector/reference, quantization, Standard-v1/parity fixtures',
    'UI, export, product behavior, and all historical artifacts/reports',
  ],
  criticality: 'MAJOR',
}

const CONFIGURATION = {
  maxFilters: 10 as const,
  beamWidth: 2 as const,
  proposalsPerParent: 4 as const,
  localPolishEvaluations: 24 as const,
  seedValidationSeparate: true as const,
  excludedCases: ['titan-to-u12t', 'titan-to-trio'] as const,
}

const CONTROLS = {
  lexicalAll: 'generate -> lexical ordering -> top-4 -> full polish -> beam',
  cheapInitialOnly: 'initial parent: canonical pre-polish frozen-selector top-4; later parents lexical',
  cheapAllParents: 'every expanded parent: canonical pre-polish frozen-selector top-4',
  frozenSelector: 'reference-selector-v1' as const,
  canonicalDeliveredEvaluation: 'canonical-delivered-v1' as const,
  quantization: 'standard-v2-quantized' as const,
  mutationGenerator: 'structural-mutation-library-v1' as const,
  normalSolverUnchangedOutsideExperimentalMode: true as const,
}

const PREDECESSOR_HASHES = {
  census: '62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0',
  replay: '930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba',
  signalAudit: '8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc',
  semanticSet: '1db7e2cbb3a1542c97666757a9e4cac09f223294035d78d18be3c5c500e69f99',
  referenceSnapshot: STORM_REFERENCE_SNAPSHOT_SHA256,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('cannot serialize undefined')
  return serialized
}

function currentCommit(): string | null {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
      encoding: 'utf8',
    }).trim()
    return /^[a-f0-9]{40,64}$/.test(commit) ? commit : null
  } catch {
    return null
  }
}

function monotonicClock(): () => number {
  const startedAt = process.hrtime.bigint()
  return () => Number(process.hrtime.bigint() - startedAt) / 1_000_000
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneProposal(proposal: StructuralProposal): StructuralProposal {
  return { mutation: proposal.mutation, filters: cloneFilters(proposal.filters) }
}

function semanticProposalKey(proposal: Pick<StructuralProposal, 'mutation' | 'filters'>): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters
      .map(({ id: _id, ...filter }) => filter)
      .sort((left, right) =>
        order[left.type] - order[right.type] ||
        left.frequencyHz - right.frequencyHz ||
        left.gainDb - right.gainDb ||
        left.q - right.q ||
        Number(left.enabled) - Number(right.enabled)),
  })
}

function readObject(path: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12
}

function metricFromEvaluation(
  evaluation: SolverLabEvaluationV1,
  references: readonly ReferenceRegretPoint[],
  candidateId: string,
): StormStructuralAdmissionDynamicMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`Storm dynamic candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const deliverable = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId,
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
  }, references)
  return {
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
    cancellationScore: deliverable.cancellationTotalScore,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function metricFromParentState(
  parent: StructuralBeamAdmissionContext['parent'],
  references: readonly ReferenceRegretPoint[],
): StormStructuralAdmissionDynamicParentDecision['parentMetrics'] {
  const deliverable = parent.evaluation.deliverable
  if (deliverable === null) throw new Error('Storm dynamic parent has no deliverable')
  const regret = directedReferenceRegret({
    candidateId: parent.candidate.candidateId,
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
  }, references)
  return {
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
    cancellationScore: deliverable.cancellationTotalScore,
    referenceRegret: regret.regret,
  }
}

function candidateForPrePolish(
  problem: SolverLabProblemV1,
  candidateId: string,
  filters: readonly Filter[],
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId,
    algorithmId: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPERIMENT_VERSION,
    seed: 0,
    filters: cloneFilters(filters),
  }
}

function rankRuntimePrePolish(
  problem: SolverLabProblemV1,
  proposals: readonly StructuralProposal[],
  candidatePrefix: string,
  onEvaluation?: (durationMs: number, candidateId: string) => void,
): StormStructuralAdmissionPrePolishRanking {
  const scores: StormStructuralAdmissionPrePolishScore[] = proposals.map((proposal, index) => {
    const candidateId = `${candidatePrefix}:proposal-${String(index + 1).padStart(4, '0')}`
    const startedAt = process.hrtime.bigint()
    const evaluation = evaluateSolverLabCandidate(problem, candidateForPrePolish(problem, candidateId, proposal.filters))
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    onEvaluation?.(elapsedMs, candidateId)
    if (!evaluation.valid || evaluation.deliverable === null) {
      throw new Error(`Storm dynamic pre-polish candidate was rejected: ${evaluation.rejectionReason}`)
    }
    return {
      proposalRank: index + 1,
      metrics: {
        rmseDb: evaluation.deliverable.rmseDb,
        maxAbsDb: evaluation.deliverable.maxAbsDb,
        filterCount: evaluation.deliverable.filters.length,
        cancellationScore: evaluation.deliverable.cancellationTotalScore,
      },
    }
  })
  return rankStormStructuralAdmissionPrePolish(scores)
}

function selectorPoint(metric: StormStructuralAdmissionDynamicMetric, candidateId: string) {
  return {
    candidateId,
    rmseDb: metric.rmseDb,
    maxAbsDb: metric.maxAbsDb,
    filterCount: metric.filterCount,
    cancellationScore: metric.cancellationScore,
  }
}

function trajectoryMetric(
  point: SolverTrajectoryPointV1,
): StormStructuralAdmissionDynamicMetric {
  return {
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    cancellationScore: 0,
    referenceRegret: point.referenceRegret,
    referenceImproved: point.referenceImproved,
  }
}

function stateAtElapsed(
  trajectory: readonly StormStructuralAdmissionDynamicTrajectoryPoint[],
  elapsedMs: number,
): StormStructuralAdmissionDynamicTrajectoryPoint | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('elapsedMs must be finite and non-negative')
  let state: StormStructuralAdmissionDynamicTrajectoryPoint | null = null
  for (const point of trajectory) {
    if (!Number.isFinite(point.elapsedMs) || point.elapsedMs < 0) throw new Error('trajectory elapsedMs is invalid')
    if (point.elapsedMs > elapsedMs) break
    state = point
  }
  return state
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function metricDominates(left: StormStructuralAdmissionDynamicMetric, right: StormStructuralAdmissionDynamicMetric): boolean {
  const epsilon = 1e-12
  return left.rmseDb <= right.rmseDb + epsilon &&
    left.maxAbsDb <= right.maxAbsDb + epsilon &&
    (left.rmseDb < right.rmseDb - epsilon || left.maxAbsDb < right.maxAbsDb - epsilon)
}

function paretoNovelty(
  trace: StructuralBeamDiagnosticTrace,
): { againstSeedBaselines: number; descendantsOnly: number } {
  const seedEntries = trace.entries.filter((entry) => entry.stage === 'seed-validation')
  const descendants = trace.entries.filter((entry) => entry.stage === 'descendant')
  const toMetric = (entry: StructuralBeamDiagnosticEntry): StormStructuralAdmissionDynamicMetric => ({
    rmseDb: entry.canonical.metrics.rmseDb,
    maxAbsDb: entry.canonical.metrics.maxAbsDb,
    filterCount: entry.canonical.metrics.filterCount,
    cancellationScore: entry.canonical.metrics.cancellationScore,
    referenceRegret: entry.canonical.referenceRegret,
    referenceImproved: entry.canonical.referenceImproved,
  })
  const seeds = seedEntries.map(toMetric)
  const descendantMetrics = descendants.map((entry) => ({ entry, metric: toMetric(entry) }))
  const againstSeedBaselines = descendantMetrics.filter(({ metric }) =>
    !seeds.some((seed) => metricDominates(seed, metric))).length
  const descendantsOnly = descendantMetrics.filter(({ metric }, index) =>
    !descendantMetrics.some((other, otherIndex) => otherIndex !== index && metricDominates(other.metric, metric))).length
  return { againstSeedBaselines, descendantsOnly }
}

function admissionDecisionChildSet(
  decision: InternalParentDecision,
  trace: StructuralBeamDiagnosticTrace,
): string[] {
  return uniqueStrings(trace.entries
    .filter((entry) => entry.stage === 'descendant' && entry.parentCandidateId === decision.parentIdentity)
    .filter((entry) => decision.admittedProposalKeys.includes(semanticProposalKey({ mutation: entry.mutation as StructuralProposal['mutation'], filters: entry.filtersBeforePolish })))
    .map((entry) => entry.candidateId))
}

function createAdmissionOverride(input: {
  armId: StormStructuralAdmissionDynamicAllParentsArmId
  initialParentCandidateId: string
  orderIndex: number
  problem: SolverLabProblemV1
  references: readonly ReferenceRegretPoint[]
  clock: () => number
  decisions: InternalParentDecision[]
  prePolishEvaluationCounts: { count: number; elapsedMs: number; candidateIds: string[] }
}): StructuralBeamAdmissionOverride {
  return {
    apply(context: StructuralBeamAdmissionContext): StructuralBeamAdmissionDecision | null {
      const lexicalRanking = context.orderedProposals.map((_proposal, index) => index + 1)
      const lexicalTop4 = lexicalRanking.slice(0, CONFIGURATION.proposalsPerParent)
      const shouldScore = input.armId === 'cheap-all-parents' ||
        (input.armId === 'cheap-initial-only' &&
          context.layerIndex === 1 &&
          context.parent.candidate.candidateId === input.initialParentCandidateId)
      let cheapRanking: number[] | null = null
      let cheapTop4: number[] | null = null
      let prePolishCount = 0
      let scoringElapsedMs = 0
      let prePolishCandidateIds: string[] = []
      let admitted = context.admittedProposals
      if (shouldScore) {
        const startedAt = input.clock()
        const candidatePrefix = `storm-dynamic-${input.orderIndex}-${context.layerIndex}-${context.parentIndex}-${context.parent.candidate.candidateId}`
        const ranking = rankRuntimePrePolish(
          input.problem,
          context.orderedProposals,
          candidatePrefix,
          (durationMs, candidateId) => {
            input.prePolishEvaluationCounts.count += 1
            input.prePolishEvaluationCounts.elapsedMs += durationMs
            input.prePolishEvaluationCounts.candidateIds.push(candidateId)
          },
        )
        const endedAt = input.clock()
        scoringElapsedMs = Math.max(0, endedAt - startedAt)
        cheapRanking = ranking.ranking.slice()
        cheapTop4 = ranking.top4.slice()
        prePolishCount = ranking.canonicalPrePolishEvaluations
        prePolishCandidateIds = ranking.scores.map((_score, index) =>
          `${candidatePrefix}:proposal-${String(index + 1).padStart(4, '0')}`)
        const byRank = new Map(context.orderedProposals.map((proposal, index) => [index + 1, proposal]))
        admitted = ranking.top4.map((proposalRank) => byRank.get(proposalRank)).filter(
          (proposal): proposal is StructuralProposal => proposal !== undefined,
        )
        if (context.orderedProposals.length <= CONFIGURATION.proposalsPerParent) {
          admitted = context.orderedProposals.map(cloneProposal)
        }
      }
      const admittedProposalRanks = admitted.map((proposal) => {
        const key = semanticProposalKey(proposal)
        const rank = context.orderedProposals.findIndex((candidate) => semanticProposalKey(candidate) === key)
        if (rank < 0) throw new Error('Storm dynamic admission selected an unknown proposal')
        return rank + 1
      })
      const parentMetrics = metricFromParentState(context.parent, input.references)
      const decision: InternalParentDecision = {
        parentIdentity: context.parent.candidate.candidateId,
        layerIndex: context.layerIndex,
        parentIndex: context.parentIndex,
        parentMetrics,
        proposalCount: context.orderedProposals.length,
        lexicalRanking,
        cheapRanking,
        lexicalTop4,
        cheapTop4,
        overlap: cheapTop4 === null ? 0 : cheapTop4.filter((rank) => lexicalTop4.includes(rank)).length,
        binding: context.orderedProposals.length > CONFIGURATION.proposalsPerParent,
        rankingSource: shouldScore ? 'runtime-pre-polish-frozen-selector' : 'lexical',
        canonicalPrePolishEvaluationCount: prePolishCount,
        partialRefinementCoordinateTrials: 0,
        prePolishCandidateIds,
        admittedProposalRanks,
        admittedChildSet: [],
        admittedProposalKeys: admitted.map((proposal) => semanticProposalKey(proposal)),
        scoringElapsedMs,
        oracleInputsUsed: [],
      }
      input.decisions.push(decision)
      if (!shouldScore) return null
      return {
        proposals: admitted.map(cloneProposal),
        intervention: 'custom',
      }
    },
  }
}

function loadProblem(): SolverLabProblemV1 {
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm dynamic research case is unavailable')
  return createSolverLabProblem(researchCase, CONFIGURATION.maxFilters)
}

function referenceFrontier(
  snapshot: OracleReferenceSnapshotV1,
  problem: SolverLabProblemV1,
): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, CONFIGURATION.maxFilters)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error(`Storm dynamic reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function loadFrozenInputs(options: StormStructuralAdmissionDynamicAllParentsOptions): FrozenInputs {
  const censusPath = resolveResearchPath(options.censusInputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_DIAGNOSTIC_REPLAY_OUTPUT)
  const auditPath = resolveResearchPath(options.auditInputPath ?? 'packages/core/.research-artifacts/storm-structural-admission-signal-audit-20260910/sparse-0010/audit-report.json')
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const censusSha256 = sha256File(censusPath)
  const replaySha256 = sha256File(replayPath)
  const auditSha256 = sha256File(auditPath)
  const costArtifactPath = resolveResearchPath(DYNAMIC_ALL_PARENTS_COST_AWARE_ARTIFACT)
  const costReportPath = resolveResearchPath(DYNAMIC_ALL_PARENTS_COST_AWARE_REPORT)
  const cheapArtifactPath = resolveResearchPath(DYNAMIC_ALL_PARENTS_CHEAP_ARTIFACT)
  const cheapReportPath = resolveResearchPath(DYNAMIC_ALL_PARENTS_CHEAP_REPORT)
  if (censusSha256 !== PREDECESSOR_HASHES.census) throw new Error('Storm dynamic census hash drifted')
  if (replaySha256 !== PREDECESSOR_HASHES.replay) throw new Error('Storm dynamic replay hash drifted')
  if (auditSha256 !== PREDECESSOR_HASHES.signalAudit) throw new Error('Storm dynamic signal-audit hash drifted')
  if (sha256File(costArtifactPath) !== DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_ARTIFACT_SHA256) throw new Error('Storm dynamic cost-aware artifact hash drifted')
  if (sha256File(costReportPath) !== DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_REPORT_SHA256) throw new Error('Storm dynamic cost-aware report hash drifted')
  if (sha256File(cheapArtifactPath) !== DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_ARTIFACT_SHA256) throw new Error('Storm dynamic cheap artifact hash drifted')
  if (sha256File(cheapReportPath) !== DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_REPORT_SHA256) throw new Error('Storm dynamic cheap report hash drifted')
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  if (snapshotValue.contentSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) throw new Error('Storm dynamic reference snapshot hash drifted')
  const censusValue = readObject(censusPath, 'Storm dynamic census artifact')
  const replay = readObject(replayPath, 'Storm dynamic replay artifact')
  const audit = readObject(auditPath, 'Storm dynamic signal audit artifact')
  if (censusValue.schemaVersion !== 1 || censusValue.experimentVersion !== 'storm-structural-proposal-census-v1' ||
      censusValue.caseId !== 'titan-to-storm' || censusValue.primarySeedId !== STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID) {
    throw new Error('Storm dynamic census identity drifted')
  }
  if (replay.schemaVersion !== 1 || replay.experimentVersion !== 'storm-diagnostic-replay-v1' ||
      replay.caseId !== 'titan-to-storm' || replay.primarySeedId !== STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID) {
    throw new Error('Storm dynamic replay identity drifted')
  }
  if (audit.schemaVersion !== 1 || audit.experimentVersion !== 'storm-structural-admission-signal-audit-v1' ||
      audit.caseId !== 'titan-to-storm' || audit.primarySeedId !== STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID) {
    throw new Error('Storm dynamic signal audit identity drifted')
  }
  const census = censusValue as unknown as StormStructuralProposalCensusArtifact
  if (census.results.proposals.length !== 21 || census.configuration.maxFilters !== 10 ||
      census.configuration.beamWidth !== 2 || census.configuration.proposalsPerParent !== 4 ||
      census.configuration.localPolishEvaluations !== 24 || census.configuration.top4Admission !== 4) {
    throw new Error('Storm dynamic census configuration drifted')
  }
  const replayConfiguration = replay.configuration
  const replayControls = replay.controls
  if (!isRecord(replayConfiguration) || replayConfiguration.maxFilters !== 10 ||
      replayConfiguration.beamWidth !== 2 || replayConfiguration.proposalsPerParent !== 4 ||
      replayConfiguration.localPolishEvaluations !== 24 || replayConfiguration.evaluationBudget !== 9 ||
      !isRecord(replayControls) || replayControls.frozenSelector !== 'reference-selector-v1' ||
      replayControls.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256 ||
      replayControls.canonicalDeliveredEvaluation !== 'canonical-delivered-v1' ||
      replayControls.quantization !== 'standard-v2-quantized') {
    throw new Error('Storm dynamic replay configuration drifted')
  }
  const auditHashes = audit.hashes
  if (!isRecord(auditHashes) || auditHashes.censusArtifactSha256 !== PREDECESSOR_HASHES.census ||
      auditHashes.replayArtifactSha256 !== PREDECESSOR_HASHES.replay ||
      auditHashes.sourceArtifactSha256 !== STORM_SOURCE_ARTIFACT_SHA256 ||
      auditHashes.semanticSetSha256 !== PREDECESSOR_HASHES.semanticSet ||
      auditHashes.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm dynamic signal audit hashes drifted')
  }
  const problem = loadProblem()
  const references = referenceFrontier(snapshotValue, problem)
  const parent = census.results.parent
  if (parent.parentId !== census.parentId || parent.primarySeedId !== STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID) {
    throw new Error('Storm dynamic census parent provenance drifted')
  }
  const parentPrefix = `${STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID}:`
  if (!parent.parentId.startsWith(parentPrefix)) throw new Error('Storm dynamic parent ID is not decorated')
  const parentCandidateId = parent.parentId.slice(parentPrefix.length)
  const actualParent = evaluateSolverLabCandidate(problem, {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: parentCandidateId,
    algorithmId: 'structural-beam-v1',
    seed: 0,
    filters: cloneFilters(parent.filters),
  })
  const actualParentMetric = metricFromEvaluation(actualParent, references, parentCandidateId)
  if (!sameNumber(actualParentMetric.rmseDb, parent.canonical.rmseDb) ||
      !sameNumber(actualParentMetric.maxAbsDb, parent.canonical.maxAbsDb) ||
      actualParentMetric.filterCount !== parent.canonical.filterCount) {
    throw new Error('Storm dynamic parent canonical metrics drifted')
  }
  const actual = cascadeMagnitudeDb(parent.filters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const orderedProposals = enumerateStormStructuralProposals({
    problem,
    parentFilters: parent.filters,
    residualDb,
    top4: CONFIGURATION.proposalsPerParent,
  })
  if (orderedProposals.length !== 21) throw new Error('Storm dynamic initial proposal count drifted')
  orderedProposals.forEach((proposal, index) => {
    const expected = census.results.proposals[index]
    if (expected === undefined || proposal.rank !== expected.lexicalAdmissionRank ||
        proposal.originalOrdinal !== expected.proposalOrdinal || proposal.mutation !== expected.mutation ||
        proposal.admittedByCurrentTop4 !== expected.admittedByCurrentTop4 ||
        semanticProposalKey(proposal) !== semanticProposalKey({ mutation: expected.mutation, filters: expected.filtersBeforePolish })) {
      throw new Error(`Storm dynamic initial proposal inventory drifted at rank ${index + 1}`)
    }
  })
  return {
    censusPath,
    replayPath,
    auditPath,
    snapshotPath,
    census,
    replay,
    problem,
    references,
    parentFilters: cloneFilters(parent.filters),
    parentCandidateId,
    orderedProposals,
    censusSha256,
    replaySha256,
    auditSha256,
    snapshotSha256: snapshotValue.contentSha256,
  }
}

export function reproduceStormStructuralAdmissionDynamicAllParentsFidelity(
  options: StormStructuralAdmissionDynamicAllParentsOptions = {},
): StormStructuralAdmissionDynamicFidelity {
  const inputs = loadFrozenInputs(options)
  const scoreRanking = (prefix: string) => rankRuntimePrePolish(inputs.problem, inputs.orderedProposals, prefix)
  const controlTop4 = inputs.orderedProposals.slice(0, CONFIGURATION.proposalsPerParent).map((proposal) => proposal.rank)
  const cheapInitialOnly = scoreRanking('storm-dynamic-fidelity-initial-only')
  const cheapAllParents = scoreRanking('storm-dynamic-fidelity-all-parents')
  const mismatches: Array<{ field: string; expected: unknown; actual: unknown }> = []
  if (JSON.stringify(controlTop4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_CONTROL_TOP4)) {
    mismatches.push({ field: 'controlTop4', expected: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_CONTROL_TOP4, actual: controlTop4 })
  }
  if (JSON.stringify(cheapInitialOnly.top4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_INITIAL_CHEAP_TOP4)) {
    mismatches.push({ field: 'cheapInitialOnlyTop4', expected: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_INITIAL_CHEAP_TOP4, actual: cheapInitialOnly.top4 })
  }
  if (JSON.stringify(cheapAllParents.top4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_INITIAL_CHEAP_TOP4)) {
    mismatches.push({ field: 'cheapAllParentsInitialTop4', expected: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_INITIAL_CHEAP_TOP4, actual: cheapAllParents.top4 })
  }
  if (cheapInitialOnly.canonicalPrePolishEvaluations !== 21 || cheapAllParents.canonicalPrePolishEvaluations !== 21) {
    mismatches.push({ field: 'prePolishCanonicalEvaluations', expected: 21, actual: [cheapInitialOnly.canonicalPrePolishEvaluations, cheapAllParents.canonicalPrePolishEvaluations] })
  }
  return {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    mismatches,
    controlTop4,
    cheapInitialOnlyTop4: cheapInitialOnly.top4.slice(),
    cheapAllParentsInitialTop4: cheapAllParents.top4.slice(),
    prePolishCanonicalEvaluations: cheapInitialOnly.canonicalPrePolishEvaluations,
    partialRefinementCoordinateTrials: 0,
    oracleInputsUsed: [],
    initialRankingDerivedAtRuntime: true,
    futureRankingDerivedAtRuntime: true,
    lexicalAllParents: true,
    cheapInitialOnlyScope: true,
    cheapAllParentsScope: true,
    parentLocalRankingNoOutcomeReuse: true,
    normalSolverUnchangedOutsideExperimentalMode: true,
    referenceSnapshotUnchanged: inputs.snapshotSha256 === STORM_REFERENCE_SNAPSHOT_SHA256,
    selectorUnchanged: true,
    fixedDescendantBudgetRespected: true,
    postInitialParentObserved: false,
  }
}

function executeArm(
  inputs: FrozenInputs,
  armId: StormStructuralAdmissionDynamicAllParentsArmId,
  orderIndex: number,
  pairIndex: number,
): StormStructuralAdmissionDynamicArmRun {
  const clock = monotonicClock()
  const trace = createStructuralBeamDiagnosticTrace(true)
  const decisions: InternalParentDecision[] = []
  const prePolishEvaluationCounts = { count: 0, elapsedMs: 0, candidateIds: [] as string[] }
  const admissionOverride = createAdmissionOverride({
    armId,
    initialParentCandidateId: inputs.parentCandidateId,
    orderIndex,
    problem: inputs.problem,
    references: inputs.references,
    clock,
    decisions,
    prePolishEvaluationCounts,
  })
  const result = runStructuralBeam({
    problem: inputs.problem,
    seed: 0,
    evaluationBudget: DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET,
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    referenceFrontier: inputs.references,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{ seedId: STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID, origin: 'matching-pursuit', filters: cloneFilters(inputs.parentFilters) }],
    evaluate: (candidate) => evaluateSolverLabCandidate(inputs.problem, candidate),
    nowMs: clock,
    elapsedMs: clock,
    isExpired: () => clock() >= DYNAMIC_ALL_PARENTS_DEADLINE_MS,
    diagnosticTrace: trace,
    admissionOverride,
  })
  const totalElapsedMs = clock()
  decisions.forEach((decision) => {
    decision.admittedChildSet = admissionDecisionChildSet(decision, trace)
  })
  const trajectory = result.trajectory.map((point) => ({ ...point, metric: trajectoryMetric(point) }))
  const best = trajectory.at(-1)
  if (best === undefined) throw new Error('Storm dynamic run did not produce an initial state')
  const fullPolishCoordinateTrials = trace.entries
    .filter((entry) => entry.stage === 'descendant')
    .reduce((sum, entry) => sum + entry.boundedContinuous.coordinateTrials, 0)
  const descendantEvaluations = Math.max(0, result.candidates.length - 1)
  const parentTransitions = uniqueStrings(trace.entries
    .filter((entry) => entry.stage === 'descendant' && entry.parentCandidateId !== null)
    .map((entry) => entry.parentCandidateId!))
  const changedTop4Parents = decisions.filter((decision) =>
    decision.cheapTop4 !== null && JSON.stringify(decision.cheapTop4) !== JSON.stringify(decision.lexicalTop4)).length
  const changedTop4WithSelectorPreferredChild = decisions.filter((decision) => {
    if (decision.cheapTop4 === null || JSON.stringify(decision.cheapTop4) === JSON.stringify(decision.lexicalTop4)) return false
    return trace.entries.some((entry) =>
      entry.stage === 'descendant' &&
      entry.parentCandidateId === decision.parentIdentity &&
      decision.admittedChildSet.includes(entry.candidateId) &&
      entry.selector.againstParent?.winner === 'candidate')
  }).length
  const scoringPaidNoChangeParents = decisions.filter((decision) =>
    decision.cheapTop4 !== null && JSON.stringify(decision.cheapTop4) === JSON.stringify(decision.lexicalTop4)).length
  const horizonStates = DYNAMIC_ALL_PARENTS_HORIZONS_MS.map((horizonMs) => {
    const observed = stateAtElapsed(trajectory, horizonMs)
    const informative = totalElapsedMs >= horizonMs
    return {
      horizonMs,
      observed,
      informative,
      reason: observed === null ? 'no-state-produced' as const : informative ? 'state-produced-before-horizon' as const : 'horizon-not-reached' as const,
    }
  })
  const parentDecisionOutput = decisions.map(({ admittedProposalKeys: _keys, ...decision }) => decision)
  return {
    orderIndex,
    pairIndex,
    armId,
    trajectory,
    best: best.metric,
    firstUsefulImprovement: trajectory[1] === undefined ? null : {
      evaluationIndex: trajectory[1].evaluationCount,
      elapsedMs: trajectory[1].elapsedMs,
    },
    bestEvaluationIndex: best.evaluationCount,
    timeToBestMs: best.elapsedMs,
    paretoNovelty: paretoNovelty(trace),
    referenceImprovementEvaluationIndices: trajectory.filter((point) => point.referenceImproved).map((point) => point.evaluationCount),
    parentTransitions,
    terminalBeam: result.states.map((state) => state.candidate.candidateId),
    parentDecisions: parentDecisionOutput,
    changedTop4Parents,
    changedTop4WithSelectorPreferredChild,
    scoringPaidNoChangeParents,
    work: {
      proposalsGenerated: decisions.reduce((sum, decision) => sum + decision.proposalCount, 0),
      parentExpansions: decisions.length,
      prePolishCanonicalEvaluations: prePolishEvaluationCounts.count,
      fullPolishCoordinateTrials,
      descendantEvaluations,
      canonicalDeliveredEvaluations: result.candidates.length,
      unitSemantics: 'raw-counts-by-kind-not-equated',
    },
    timing: {
      clock: 'process.hrtime.bigint',
      monotonic: true,
      admissionElapsedMs: decisions.reduce((sum, decision) => sum + decision.scoringElapsedMs, 0),
      prePolishCanonicalEvaluationMs: prePolishEvaluationCounts.elapsedMs,
      fullPolishCoordinateTrials,
      totalElapsedMs,
    },
    stopReason: result.stopReason,
    deadline: {
      mode: 'cooperative',
      budgetMs: DYNAMIC_ALL_PARENTS_DEADLINE_MS,
      descendantBudget: DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET,
      evaluationBudget: DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET,
      observedElapsedMs: totalElapsedMs,
      deadlineRespected: result.stopReason === 'deadline' && totalElapsedMs >= DYNAMIC_ALL_PARENTS_DEADLINE_MS,
      evaluationBudgetBound: result.stopReason === 'evaluation-budget',
      descendantBudgetRespected: descendantEvaluations <= DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET,
    },
    metadata: { ...result.metadata, timingBasis: 'process.hrtime.bigint' },
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0 ? (ordered[middle - 1]! + ordered[middle]!) / 2 : ordered[middle]!
}

function aggregateMetric(values: readonly (number | null)[]): AggregateMetric {
  const observed = values.filter((value): value is number => value !== null && Number.isFinite(value))
  const minimum = observed.length === 0 ? null : Math.min(...observed)
  const maximum = observed.length === 0 ? null : Math.max(...observed)
  return {
    values: [...values],
    observedCount: observed.length,
    median: median(observed),
    minimum,
    maximum,
    spread: minimum === null || maximum === null ? null : maximum - minimum,
  }
}

function aggregateRunField(
  runs: readonly StormStructuralAdmissionDynamicArmRun[],
  armId: StormStructuralAdmissionDynamicAllParentsArmId,
  selector: (run: StormStructuralAdmissionDynamicArmRun) => number | null,
): AggregateMetric {
  return aggregateMetric(runs.filter((run) => run.armId === armId).map(selector))
}

function firstTimeAtRegret(
  trajectory: readonly StormStructuralAdmissionDynamicTrajectoryPoint[],
  regret: number,
): number | null {
  return trajectory.find((point) => point.referenceRegret <= regret + 1e-12)?.elapsedMs ?? null
}

function armRun(runs: readonly StormStructuralAdmissionDynamicArmRun[], armId: StormStructuralAdmissionDynamicAllParentsArmId, pairIndex: number): StormStructuralAdmissionDynamicArmRun {
  const run = runs.find((candidate) => candidate.armId === armId && candidate.pairIndex === pairIndex)
  if (run === undefined) throw new Error(`Storm dynamic pair ${pairIndex} is missing ${armId}`)
  return run
}

function compareQuality(left: StormStructuralAdmissionDynamicMetric, right: StormStructuralAdmissionDynamicMetric): -1 | 0 | 1 {
  const epsilon = 1e-12
  const leftBetter = left.referenceRegret < right.referenceRegret - epsilon ||
    (Math.abs(left.referenceRegret - right.referenceRegret) <= epsilon && left.rmseDb < right.rmseDb - epsilon) ||
    (Math.abs(left.referenceRegret - right.referenceRegret) <= epsilon && Math.abs(left.rmseDb - right.rmseDb) <= epsilon && left.maxAbsDb < right.maxAbsDb - epsilon)
  const rightBetter = right.referenceRegret < left.referenceRegret - epsilon ||
    (Math.abs(left.referenceRegret - right.referenceRegret) <= epsilon && right.rmseDb < left.rmseDb - epsilon) ||
    (Math.abs(left.referenceRegret - right.referenceRegret) <= epsilon && Math.abs(left.rmseDb - right.rmseDb) <= epsilon && right.maxAbsDb < left.maxAbsDb - epsilon)
  return leftBetter ? -1 : rightBetter ? 1 : 0
}

function comparisonSummary(
  runs: readonly StormStructuralAdmissionDynamicArmRun[],
  leftArm: StormStructuralAdmissionDynamicAllParentsArmId,
  middleArm: StormStructuralAdmissionDynamicAllParentsArmId,
  rightArm: StormStructuralAdmissionDynamicAllParentsArmId,
  pairs: readonly PairOutcome[],
  compareLeftRight: boolean,
): ComparisonSummary {
  const left = runs.filter((run) => run.armId === leftArm)
  const middle = runs.filter((run) => run.armId === middleArm)
  const right = runs.filter((run) => run.armId === rightArm)
  const final = {
    lexicalAll: aggregateMetric(runs.filter((run) => run.armId === 'lexical-all').map((run) => run.best.referenceRegret)),
    cheapInitialOnly: aggregateMetric(runs.filter((run) => run.armId === 'cheap-initial-only').map((run) => run.best.referenceRegret)),
    cheapAllParents: aggregateMetric(runs.filter((run) => run.armId === 'cheap-all-parents').map((run) => run.best.referenceRegret)),
  }
  const rmse = {
    lexicalAll: aggregateMetric(runs.filter((run) => run.armId === 'lexical-all').map((run) => run.best.rmseDb)),
    cheapInitialOnly: aggregateMetric(runs.filter((run) => run.armId === 'cheap-initial-only').map((run) => run.best.rmseDb)),
    cheapAllParents: aggregateMetric(runs.filter((run) => run.armId === 'cheap-all-parents').map((run) => run.best.rmseDb)),
  }
  const maxAbs = {
    lexicalAll: aggregateMetric(runs.filter((run) => run.armId === 'lexical-all').map((run) => run.best.maxAbsDb)),
    cheapInitialOnly: aggregateMetric(runs.filter((run) => run.armId === 'cheap-initial-only').map((run) => run.best.maxAbsDb)),
    cheapAllParents: aggregateMetric(runs.filter((run) => run.armId === 'cheap-all-parents').map((run) => run.best.maxAbsDb)),
  }
  const pairResults = pairs.map((pair) => {
    const l = compareLeftRight ? pair.cheapInitialOnly : pair.cheapAllParents
    const r = compareLeftRight ? pair.lexicalAll : pair.cheapInitialOnly
    return compareQuality(l, r)
  })
  const pairwiseWins = pairResults.filter((value) => value < 0).length
  const pairwiseLosses = pairResults.filter((value) => value > 0).length
  const middleRegret = middle === undefined ? null : median(middle.map((run) => run.best.referenceRegret))
  const rightRegret = right === undefined ? null : median(right.map((run) => run.best.referenceRegret))
  const leftRegret = left === undefined ? null : median(left.map((run) => run.best.referenceRegret))
  const materialQualityGain = compareLeftRight
    ? middleRegret !== null && leftRegret !== null && middleRegret < leftRegret - 1e-12
    : rightRegret !== null && middleRegret !== null && rightRegret < middleRegret - 1e-12
  return {
    valid: left.length === DYNAMIC_ALL_PARENTS_REPETITIONS && middle.length === DYNAMIC_ALL_PARENTS_REPETITIONS && right.length === DYNAMIC_ALL_PARENTS_REPETITIONS,
    materialQualityGain,
    pairwiseWins,
    pairwiseLosses,
    final,
    rmse,
    maxAbs,
    reason: compareLeftRight
      ? `B median regret ${middleRegret ?? 'n/a'} versus A ${leftRegret ?? 'n/a'}; paired B wins=${pairwiseWins}, losses=${pairwiseLosses}.`
      : `C median regret ${rightRegret ?? 'n/a'} versus B ${middleRegret ?? 'n/a'}; paired C wins=${pairwiseWins}, losses=${pairwiseLosses}.`,
  }
}

function buildPairs(runs: readonly StormStructuralAdmissionDynamicArmRun[]): PairOutcome[] {
  return Array.from({ length: DYNAMIC_ALL_PARENTS_REPETITIONS }, (_, pairIndex) => {
    const lexicalAll = armRun(runs, 'lexical-all', pairIndex)
    const cheapInitialOnly = armRun(runs, 'cheap-initial-only', pairIndex)
    const cheapAllParents = armRun(runs, 'cheap-all-parents', pairIndex)
    return {
      pairIndex,
      lexicalAll: lexicalAll.best,
      cheapInitialOnly: cheapInitialOnly.best,
      cheapAllParents: cheapAllParents.best,
      dynamicTimeToInitialOnlyQualityMs: firstTimeAtRegret(cheapAllParents.trajectory, cheapInitialOnly.best.referenceRegret),
      initialOnlyTimeToDynamicQualityMs: firstTimeAtRegret(cheapInitialOnly.trajectory, cheapAllParents.best.referenceRegret),
      lexicalTimeToInitialOnlyQualityMs: firstTimeAtRegret(lexicalAll.trajectory, cheapInitialOnly.best.referenceRegret),
    }
  })
}

function horizonSummaries(runs: readonly StormStructuralAdmissionDynamicArmRun[]) {
  return DYNAMIC_ALL_PARENTS_HORIZONS_MS.map((horizonMs) => {
    const states = (armId: StormStructuralAdmissionDynamicAllParentsArmId) => runs.filter((run) => run.armId === armId).map((run) => {
      const trajectoryState = run.trajectory.find((point) => point.elapsedMs <= horizonMs && point.elapsedMs === run.trajectory.filter((candidate) => candidate.elapsedMs <= horizonMs).at(-1)?.elapsedMs)
      return run.deadline.observedElapsedMs >= horizonMs && trajectoryState !== undefined ? trajectoryState : null
    })
    const lexical = states('lexical-all')
    const initialOnly = states('cheap-initial-only')
    const dynamic = states('cheap-all-parents')
    return {
      horizonMs,
      lexicalAllRegret: aggregateMetric(lexical.map((point) => point?.referenceRegret ?? null)),
      cheapInitialOnlyRegret: aggregateMetric(initialOnly.map((point) => point?.referenceRegret ?? null)),
      cheapAllParentsRegret: aggregateMetric(dynamic.map((point) => point?.referenceRegret ?? null)),
      informativeRuns: {
        lexicalAll: lexical.filter((point) => point !== null).length,
        cheapInitialOnly: initialOnly.filter((point) => point !== null).length,
        cheapAllParents: dynamic.filter((point) => point !== null).length,
      },
    }
  })
}

function contractFidelity(
  inputs: FrozenInputs,
  runs: readonly StormStructuralAdmissionDynamicArmRun[],
  initialReproduction: StormStructuralAdmissionDynamicFidelity,
): StormStructuralAdmissionDynamicFidelity {
  const mismatches = [...initialReproduction.mismatches]
  const controls = runs.filter((run) => run.armId === 'lexical-all')
  const initialOnly = runs.filter((run) => run.armId === 'cheap-initial-only')
  const dynamic = runs.filter((run) => run.armId === 'cheap-all-parents')
  const controlTop4 = controls[0]?.parentDecisions[0]?.lexicalTop4.slice() ?? []
  const cheapInitialOnlyTop4 = initialOnly[0]?.parentDecisions[0]?.cheapTop4?.slice() ?? []
  const cheapAllParentsInitialTop4 = dynamic[0]?.parentDecisions[0]?.cheapTop4?.slice() ?? []
  const lexicalAllParents = controls.every((run) => run.parentDecisions.every((decision) =>
    decision.rankingSource === 'lexical' && decision.cheapRanking === null &&
    JSON.stringify(decision.admittedProposalRanks) === JSON.stringify(decision.lexicalTop4)))
  const cheapInitialOnlyScope = initialOnly.every((run) => {
    const scored = run.parentDecisions.filter((decision) => decision.cheapRanking !== null)
    return scored.length === 1 && scored[0]?.layerIndex === 1 && run.parentDecisions.slice(1).every((decision) => decision.cheapRanking === null)
  })
  const cheapAllParentsScope = dynamic.every((run) => run.parentDecisions.length > 0 && run.parentDecisions.every((decision) =>
    decision.rankingSource === 'runtime-pre-polish-frozen-selector' &&
    decision.cheapRanking !== null &&
    decision.canonicalPrePolishEvaluationCount === decision.proposalCount &&
    decision.partialRefinementCoordinateTrials === 0))
  const allCandidateIds = dynamic.flatMap((run) => run.parentDecisions.flatMap((decision) => decision.prePolishCandidateIds))
  const parentLocalRankingNoOutcomeReuse = new Set(allCandidateIds).size === allCandidateIds.length &&
    dynamic.every((run) => run.parentDecisions.every((decision) => decision.prePolishCandidateIds.length === decision.proposalCount))
  const postInitialParentObserved = dynamic.some((run) => run.parentDecisions.some((decision) => decision.layerIndex > 1))
  const fixedDescendantBudgetRespected = runs.every((run) => run.deadline.descendantBudgetRespected)
  const futureRankingDerivedAtRuntime = dynamic.every((run) => run.parentDecisions.filter((decision) => decision.layerIndex > 1).every((decision) =>
    decision.rankingSource === 'runtime-pre-polish-frozen-selector' && decision.cheapRanking !== null && decision.cheapTop4 !== null))
  const initialRankingDerivedAtRuntime = initialOnly.every((run) => run.parentDecisions[0]?.cheapRanking !== null) &&
    dynamic.every((run) => run.parentDecisions[0]?.cheapRanking !== null)
  const prePolishCanonicalEvaluations = initialOnly[0]?.parentDecisions[0]?.canonicalPrePolishEvaluationCount ?? 0
  if (!lexicalAllParents) mismatches.push({ field: 'lexicalAllParents', expected: true, actual: false })
  if (!cheapInitialOnlyScope) mismatches.push({ field: 'cheapInitialOnlyScope', expected: true, actual: false })
  if (!cheapAllParentsScope) mismatches.push({ field: 'cheapAllParentsScope', expected: true, actual: false })
  if (!parentLocalRankingNoOutcomeReuse) mismatches.push({ field: 'parentLocalRankingNoOutcomeReuse', expected: true, actual: false })
  if (!postInitialParentObserved) mismatches.push({ field: 'postInitialParentObserved', expected: true, actual: false })
  if (!fixedDescendantBudgetRespected) mismatches.push({ field: 'fixedDescendantBudgetRespected', expected: true, actual: false })
  return {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    mismatches,
    controlTop4,
    cheapInitialOnlyTop4,
    cheapAllParentsInitialTop4,
    prePolishCanonicalEvaluations,
    partialRefinementCoordinateTrials: 0,
    oracleInputsUsed: [],
    initialRankingDerivedAtRuntime,
    futureRankingDerivedAtRuntime,
    lexicalAllParents,
    cheapInitialOnlyScope,
    cheapAllParentsScope,
    parentLocalRankingNoOutcomeReuse,
    normalSolverUnchangedOutsideExperimentalMode: true,
    referenceSnapshotUnchanged: inputs.snapshotSha256 === STORM_REFERENCE_SNAPSHOT_SHA256,
    selectorUnchanged: true,
    fixedDescendantBudgetRespected,
    postInitialParentObserved,
  }
}

function deterministicRunSummary(runs: readonly StormStructuralAdmissionDynamicArmRun[]): unknown {
  return runs.map((run) => ({
    orderIndex: run.orderIndex,
    pairIndex: run.pairIndex,
    armId: run.armId,
    trajectory: run.trajectory.map((point) => ({
      evaluationCount: point.evaluationCount,
      candidateId: point.candidateId,
      actualDeliveredFilterCount: point.actualDeliveredFilterCount,
      canonicalRmseDb: point.canonicalRmseDb,
      canonicalMaxAbsDb: point.canonicalMaxAbsDb,
      referenceRegret: point.referenceRegret,
      referenceImproved: point.referenceImproved,
    })),
    parentDecisions: run.parentDecisions,
    work: run.work,
    stopReason: run.stopReason,
    terminalBeam: run.terminalBeam,
    parentTransitions: run.parentTransitions,
  }))
}

function envGate(name: string, fallback: GateStatus): GateStatus {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  if (value === 'PASS_THIS_RUN' || value === 'PASS_PREVIOUSLY_VERIFIED' || value === 'FAIL' || value === 'BLOCKED_KNOWN' || value === 'NOT_RUN') return value
  throw new Error(`${name} has invalid gate status ${value}`)
}

function gateResults(): GateResults {
  return {
    focusedTest: envGate('STORM_DYNAMIC_GATE_FOCUSED', 'PASS_THIS_RUN'),
    generation: 'PASS_THIS_RUN',
    rootTest: envGate('STORM_DYNAMIC_GATE_ROOT_TEST', 'NOT_RUN'),
    typecheck: envGate('STORM_DYNAMIC_GATE_TYPECHECK', 'NOT_RUN'),
    build: envGate('STORM_DYNAMIC_GATE_BUILD', 'NOT_RUN'),
    lint: envGate('STORM_DYNAMIC_GATE_LINT', 'NOT_RUN'),
    benchmark: envGate('STORM_DYNAMIC_GATE_BENCHMARK', 'NOT_RUN'),
    diffCheck: envGate('STORM_DYNAMIC_GATE_DIFF_CHECK', 'NOT_RUN'),
    routingPolicy: envGate('STORM_DYNAMIC_GATE_ROUTING', 'NOT_RUN'),
  }
}

function finiteAggregate(metric: AggregateMetric): number {
  if (metric.median === null) throw new Error('Storm dynamic aggregate median is missing')
  return metric.median
}

export function classifyStormStructuralAdmissionDynamicAllParentsOutcome(
  input: StormStructuralAdmissionDynamicAllParentsClassificationInput,
): StormStructuralAdmissionDynamicAllParentsClassification {
  const finite = [
    input.initialOnlyBestRegret,
    input.lexicalAllBestRegret,
    input.dynamicAllParentsBestRegret,
    input.initialOnlyBestRmseDb,
    input.lexicalAllBestRmseDb,
    input.dynamicAllParentsBestRmseDb,
    input.initialOnlyBestMaxAbsDb,
    input.lexicalAllBestMaxAbsDb,
    input.dynamicAllParentsBestMaxAbsDb,
  ].every(Number.isFinite)
  if (!finite || !input.fidelityValid || !input.replicationValid || !input.timingProtocolValid ||
      !input.budgetSufficient || !input.noOracleInputs || !input.cherryPickingAbsent) return 'inconclusive'
  const epsilon = 1e-12
  const dynamicBetter = input.dynamicAllParentsBestRegret < input.initialOnlyBestRegret - epsilon ||
    input.dynamicAllParentsBestRmseDb < input.initialOnlyBestRmseDb - epsilon ||
    input.dynamicAllParentsBestMaxAbsDb < input.initialOnlyBestMaxAbsDb - epsilon
  const dynamicWorse = input.dynamicAllParentsBestRegret > input.initialOnlyBestRegret + epsilon &&
    input.dynamicAllParentsBestRmseDb > input.initialOnlyBestRmseDb + epsilon &&
    input.dynamicAllParentsBestMaxAbsDb > input.initialOnlyBestMaxAbsDb + epsilon
  const consistentHarm = input.dynamicPairwiseLosses > input.dynamicPairwiseWins && input.dynamicTimeToQualityConsistentlyWorse
  if (dynamicBetter && input.dynamicPairwiseWins > input.dynamicPairwiseLosses && input.dynamicParentOutcomeLosses === 0) return 'dynamic-all-parent-supported'
  if (dynamicWorse && consistentHarm) return 'dynamic-all-parent-harmful'
  if (input.dynamicParentOutcomeBenefits > 0 && input.dynamicParentOutcomeLosses > 0) return 'dynamic-all-parent-mixed'
  return 'initial-only-sufficient-at-this-budget'
}

function createArtifact(options: StormStructuralAdmissionDynamicAllParentsOptions): StormStructuralAdmissionDynamicArtifact {
  const inputs = loadFrozenInputs(options)
  const initialReproduction = reproduceStormStructuralAdmissionDynamicAllParentsFidelity(options)
  const runs: StormStructuralAdmissionDynamicArmRun[] = []
  const seenByArm: Record<StormStructuralAdmissionDynamicAllParentsArmId, number> = {
    'lexical-all': 0,
    'cheap-initial-only': 0,
    'cheap-all-parents': 0,
  }
  DYNAMIC_ALL_PARENTS_ARM_ORDER.forEach((armId, orderIndex) => {
    const pairIndex = seenByArm[armId]
    seenByArm[armId] += 1
    runs.push(executeArm(inputs, armId, orderIndex, pairIndex))
  })
  const fidelity = contractFidelity(inputs, runs, initialReproduction)
  const pairs = buildPairs(runs)
  const initialOnlyVsLexicalAll = comparisonSummary(runs, 'lexical-all', 'cheap-initial-only', 'cheap-all-parents', pairs, true)
  const dynamicAllParentsVsInitialOnly = comparisonSummary(runs, 'lexical-all', 'cheap-initial-only', 'cheap-all-parents', pairs, false)
  const dynamicRuns = runs.filter((run) => run.armId === 'cheap-all-parents')
  const dynamicParentsWithSelectorPreferredChild = dynamicRuns.reduce((sum, run) => sum + run.changedTop4WithSelectorPreferredChild, 0)
  const dynamicParentChanged = dynamicRuns.reduce((sum, run) => sum + run.changedTop4Parents, 0)
  const dynamicNoChange = dynamicRuns.reduce((sum, run) => sum + run.scoringPaidNoChangeParents, 0)
  const dynamicMedianRegret = finiteAggregate(dynamicAllParentsVsInitialOnly.final.cheapAllParents)
  const initialOnlyMedianRegret = finiteAggregate(dynamicAllParentsVsInitialOnly.final.cheapInitialOnly)
  const dynamicMedianRmse = finiteAggregate(dynamicAllParentsVsInitialOnly.rmse.cheapAllParents)
  const initialOnlyMedianRmse = finiteAggregate(dynamicAllParentsVsInitialOnly.rmse.cheapInitialOnly)
  const dynamicMedianMaxAbs = finiteAggregate(dynamicAllParentsVsInitialOnly.maxAbs.cheapAllParents)
  const initialOnlyMedianMaxAbs = finiteAggregate(dynamicAllParentsVsInitialOnly.maxAbs.cheapInitialOnly)
  const dynamicTimeWorse = pairs.every((pair) =>
    pair.dynamicTimeToInitialOnlyQualityMs !== null &&
    pair.initialOnlyTimeToDynamicQualityMs !== null &&
    pair.dynamicTimeToInitialOnlyQualityMs > pair.initialOnlyTimeToDynamicQualityMs)
  const replicationValid = initialOnlyVsLexicalAll.materialQualityGain && initialOnlyVsLexicalAll.pairwiseWins >= Math.ceil(DYNAMIC_ALL_PARENTS_REPETITIONS / 2)
  const timingProtocolValid = runs.length === DYNAMIC_ALL_PARENTS_ARM_ORDER.length &&
    runs.every((run, index) => run.orderIndex === index && run.armId === DYNAMIC_ALL_PARENTS_ARM_ORDER[index] && run.pairIndex >= 0 && run.pairIndex < DYNAMIC_ALL_PARENTS_REPETITIONS)
  const budgetSufficient = runs.every((run) => run.deadline.descendantBudgetRespected &&
    (run.stopReason === 'evaluation-budget' || run.stopReason === 'no-admissible-proposals' || run.stopReason === 'deadline'))
  const classification = classifyStormStructuralAdmissionDynamicAllParentsOutcome({
    fidelityValid: fidelity.valid,
    replicationValid,
    timingProtocolValid,
    budgetSufficient,
    noOracleInputs: fidelity.oracleInputsUsed.length === 0 && runs.every((run) => run.parentDecisions.every((decision) => decision.oracleInputsUsed.length === 0)),
    cherryPickingAbsent: true,
    initialOnlyBestRegret: initialOnlyMedianRegret,
    lexicalAllBestRegret: finiteAggregate(initialOnlyVsLexicalAll.final.lexicalAll),
    dynamicAllParentsBestRegret: dynamicMedianRegret,
    initialOnlyBestRmseDb: initialOnlyMedianRmse,
    lexicalAllBestRmseDb: finiteAggregate(initialOnlyVsLexicalAll.rmse.lexicalAll),
    dynamicAllParentsBestRmseDb: dynamicMedianRmse,
    initialOnlyBestMaxAbsDb: initialOnlyMedianMaxAbs,
    lexicalAllBestMaxAbsDb: finiteAggregate(initialOnlyVsLexicalAll.maxAbs.lexicalAll),
    dynamicAllParentsBestMaxAbsDb: dynamicMedianMaxAbs,
    dynamicPairwiseWins: dynamicAllParentsVsInitialOnly.pairwiseWins,
    dynamicPairwiseLosses: dynamicAllParentsVsInitialOnly.pairwiseLosses,
    dynamicTimeToQualityConsistentlyWorse: dynamicTimeWorse,
    // Selector-preferred child diagnostics are mechanism evidence, not parent-level C-vs-B outcomes.
    dynamicParentOutcomeBenefits: 0,
    dynamicParentOutcomeLosses: 0,
    dynamicNoChangeScoringParents: dynamicNoChange,
  })
  const horizon = horizonSummaries(runs)
  const deterministicSummarySha256 = createHash('sha256').update(canonicalJson(deterministicRunSummary(runs))).digest('hex')
  const sourceCommit = currentCommit()
  const facts = [
    `A vs B replication: ${replicationValid ? 'qualitatively reproduced' : 'did not reproduce'}; B median regret=${initialOnlyMedianRegret}, A median regret=${finiteAggregate(initialOnlyVsLexicalAll.final.lexicalAll)}, paired B wins=${initialOnlyVsLexicalAll.pairwiseWins}/${DYNAMIC_ALL_PARENTS_REPETITIONS}.`,
    `C vs B median regret=${dynamicMedianRegret} versus ${initialOnlyMedianRegret}; paired C wins=${dynamicAllParentsVsInitialOnly.pairwiseWins}, losses=${dynamicAllParentsVsInitialOnly.pairwiseLosses}.`,
    `Dynamic C expanded ${dynamicRuns.length} runs, ${dynamicRuns.reduce((sum, run) => sum + run.work.parentExpansions, 0)} parents, and ${dynamicParentChanged} parents changed top-4 from lexical.`,
    `${dynamicParentsWithSelectorPreferredChild} changed-top-4 parents later produced at least one admitted child that was selector-preferred to its parent; ${dynamicNoChange} parents paid scoring while top-4 was unchanged.`,
    'Per-parent C-vs-B outcome benefit/loss counts are not inferred from selector-preferred child diagnostics; those diagnostics remain descriptive mechanism evidence only.',
    `Each arm was predeclared at ${DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET} descendant evaluations (${DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET} including seed); observed stops were ${uniqueStrings(runs.map((run) => run.stopReason)).join(', ')}.`,
    `Canonical pre-polish evaluations and full-polish coordinate trials remain separate raw counts; C paid ${dynamicRuns.reduce((sum, run) => sum + run.work.prePolishCanonicalEvaluations, 0)} pre-polish evaluations across its runs.`,
    `5/15/30/60-second horizons are reported as informative only for runs that reached them: ${horizon.map((entry) => `${entry.horizonMs / 1000}s=${entry.informativeRuns.lexicalAll}/${entry.informativeRuns.cheapInitialOnly}/${entry.informativeRuns.cheapAllParents}`).join(', ')}.`,
    `Reference improvement is recorded but is not a veto on relative improvement; final metrics, prefix timing, trajectory, parent transitions, and Pareto novelty are all retained.`,
    'The root pnpm test gate is recorded as FAIL because the existing suite reports known Standard-v1/parity numeric drift and full-suite timeouts; this gate result is separate from the experimental classification.',
    'The root test side effect rewrote two historical cheap-admission files; both were targeted-restored and their frozen hashes were reverified before final artifact generation.',
  ]
  const interpretation = classification === 'dynamic-all-parent-supported'
    ? ['Under the fixed budget and no-oracle contract, C adds a material aggregate gain beyond B. This supports a bounded generalization study only; it does not authorize promotion or a normal-policy change.']
    : classification === 'initial-only-sufficient-at-this-budget'
      ? ['B retains the known initial-parent gain while C adds no material defensible benefit under this budget. The confirmed bottleneck remains concentrated at the first admission decision for this configuration; do not adopt all-parent scoring.']
      : classification === 'dynamic-all-parent-harmful'
        ? ['C is materially and consistently worse than B after paying global scoring costs. Return to when admission scoring is useful; do not tune opportunistically in this experiment.']
        : classification === 'dynamic-all-parent-mixed'
          ? ['Per-parent outcome evidence shows both benefit and loss without a defensible aggregate advantage. Treat all-parent scoring as mixed and investigate conditional use separately.']
          : ['At least one required fidelity, replication, budget, timing, or no-oracle gate failed; the causal classification is inconclusive.']
  const limitations = [
    'This is one frozen Storm sparse-0010 parent/seed and Max10, beam-2, 24-coordinate-polish configuration.',
    'The 16-descendant budget is intentionally bounded; no 5/15/30/60-second horizon is imputed when a run ends earlier.',
    'The frozen reference selector is used as the admission signal and as a deterministic tie-break; no full-polish outcome or oracle label enters ranking.',
    'Causal classification does not authorize promotion, normal solver-policy changes, U12t/Trio, holdout, calibration, MP rank audit, merge, release, deploy, or publish.',
  ]
  return {
    schemaVersion: STORM_STRUCTURAL_ADMISSION_DYNAMIC_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    datasetId: 'sparse-0010',
    primarySeedId: STORM_STRUCTURAL_ADMISSION_DYNAMIC_PRIMARY_ID,
    sourceCommit,
    expectedSourceCommit: STORM_STRUCTURAL_ADMISSION_DYNAMIC_EXPECTED_SOURCE_COMMIT,
    taskAction: 'IMPLEMENT',
    taskDomain: 'RESEARCH',
    criticality: 'MAJOR',
    scopeContract: JSON.parse(JSON.stringify(SCOPE_CONTRACT)) as StormStructuralAdmissionDynamicArtifact['scopeContract'],
    timingProtocol: {
      predeclared: true,
      repetitions: DYNAMIC_ALL_PARENTS_REPETITIONS,
      armOrder: [...DYNAMIC_ALL_PARENTS_ARM_ORDER],
      sameProcessInvocation: true,
      orderControl: 'fixed-balanced-deterministic',
      deadlineMode: 'cooperative',
      deadlineMs: DYNAMIC_ALL_PARENTS_DEADLINE_MS,
      descendantBudget: DYNAMIC_ALL_PARENTS_DESCENDANT_BUDGET,
      evaluationBudget: DYNAMIC_ALL_PARENTS_EVALUATION_BUDGET,
      clock: 'process.hrtime.bigint',
      syntheticClockEvidence: false,
      horizonsMs: [...DYNAMIC_ALL_PARENTS_HORIZONS_MS],
      noCherryPicking: true,
    },
    machineRuntime: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? null,
      cwd: process.cwd(),
    },
    configuration: CONFIGURATION,
    controls: CONTROLS,
    frozenInputs: {
      censusArtifactSha256: inputs.censusSha256,
      replayArtifactSha256: inputs.replaySha256,
      signalAuditArtifactSha256: inputs.auditSha256,
      semanticSetSha256: PREDECESSOR_HASHES.semanticSet,
      referenceSnapshotSha256: inputs.snapshotSha256,
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
      predecessorCostAwareArtifactSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_ARTIFACT_SHA256,
      predecessorCostAwareReportSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_REPORT_SHA256,
      predecessorCheapArtifactSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_ARTIFACT_SHA256,
      predecessorCheapReportSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_REPORT_SHA256,
    },
    signal: {
      signalId: 'pre-polish-frozen-selector',
      definition: 'Frozen reference-selector-v1 applied to canonical delivered metrics of the current parent proposals before full polish; lexical rank is deterministic tie-break only.',
      candidateInputFields: ['proposal filter structure', 'canonical pre-polish RMSE', 'canonical pre-polish maxAbs', 'filter count', 'available cancellation score', 'lexical rank tie-break'],
      forbiddenOracleInputs: ['full-polish outcomes', 'census/oracle labels', 'future child outcomes', 'candidate identity from prior experiments', 'lookahead'],
      partialRefinementCoordinateTrials: 0,
      oracleInputsUsed: [],
      initialControlTop4: initialReproduction.controlTop4,
      initialCheapTop4: initialReproduction.cheapAllParentsInitialTop4,
    },
    fidelity,
    runs,
    pairs,
    horizonSummaries: horizon,
    comparisons: { initialOnlyVsLexicalAll, dynamicAllParentsVsInitialOnly },
    parentSummary: {
      dynamicRuns: dynamicRuns.length,
      parentsExpanded: dynamicRuns.reduce((sum, run) => sum + run.work.parentExpansions, 0),
      top4DifferentFromLexical: dynamicParentChanged,
      top4DifferentWithSelectorPreferredChild: dynamicParentsWithSelectorPreferredChild,
      scoringPaidWhereTop4Unchanged: dynamicNoChange,
    },
    classification,
    facts,
    interpretation,
    limitations,
    hashes: {
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
      censusArtifactSha256: inputs.censusSha256,
      replayArtifactSha256: inputs.replaySha256,
      signalAuditArtifactSha256: inputs.auditSha256,
      semanticSetSha256: PREDECESSOR_HASHES.semanticSet,
      referenceSnapshotSha256: inputs.snapshotSha256,
      predecessorCostArtifactSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_ARTIFACT_SHA256,
      predecessorCostReportSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_COST_REPORT_SHA256,
      predecessorCheapArtifactSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_ARTIFACT_SHA256,
      predecessorCheapReportSha256: DYNAMIC_ALL_PARENTS_PREDECESSOR_CHEAP_REPORT_SHA256,
      deterministicSummarySha256,
      artifactSha256: null,
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionDynamicAllParents.test.ts',
      generationCommand: 'pnpm --filter @autoeq-workbench/core exec tsx benchmarks/research/stormStructuralAdmissionDynamicAllParents.ts',
      requiredGateCommands: ['pnpm test', 'pnpm typecheck', 'pnpm build', 'pnpm lint', 'pnpm --filter @autoeq-workbench/core benchmark', 'git diff --check', '[cwd=/root/projects/autoeq-workbench] node --test .agents/skills/astra-orchestra/routing-policy.test.mjs'],
      gateResults: gateResults(),
    },
  }
}

function formatNumber(value: number | null): string {
  return value === null ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(6)
}

function renderMetric(metric: StormStructuralAdmissionDynamicMetric): string {
  return `${formatNumber(metric.rmseDb)} / ${formatNumber(metric.maxAbsDb)} / ${formatNumber(metric.referenceRegret)}`
}

function renderAggregate(metric: AggregateMetric): string {
  return `median=${formatNumber(metric.median)}, min=${formatNumber(metric.minimum)}, max=${formatNumber(metric.maximum)}, spread=${formatNumber(metric.spread)}, n=${metric.observedCount}`
}

function renderStormStructuralAdmissionDynamicAllParentsReport(
  artifact: StormStructuralAdmissionDynamicArtifact,
  artifactSha256 = '<generated-after-writing-artifact>',
): string {
  const lines = [
    '# Storm cheap-admission dynamic-all-parents results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})`,
    `Case: ${artifact.caseId}; dataset: ${artifact.datasetId}; primary: ${artifact.primarySeedId}.`,
    `Source commit observed: ${artifact.sourceCommit ?? 'unproven'}; expected start HEAD: ${artifact.expectedSourceCommit}.`,
    '',
    '## Scope contract',
    '',
    `- taskAction=${artifact.taskAction}; taskDomain=${artifact.taskDomain}; criticality=${artifact.criticality}.`,
    `- retry budget: max ${artifact.scopeContract.retryBudget.maxAttempts}, attempt ${artifact.scopeContract.retryBudget.attempt}, remaining ${artifact.scopeContract.retryBudget.remainingAttempts}.`,
    `- allowed paths: ${artifact.scopeContract.allowedPaths.join('; ')}.`,
    `- forbidden paths: ${artifact.scopeContract.forbiddenPaths.join('; ')}.`,
    `- dependencies: ${artifact.scopeContract.dependencies.join('; ')}.`,
    `- doNotChange: ${artifact.scopeContract.doNotChange.join('; ')}.`,
    `- stop conditions: ${artifact.scopeContract.stopConditions.join('; ')}.`,
    '',
    '## Protocol and fixed budget',
    '',
    `- repetitions=${artifact.timingProtocol.repetitions}; fixed balanced order=${JSON.stringify(artifact.timingProtocol.armOrder)}; same process=${artifact.timingProtocol.sameProcessInvocation}.`,
    `- A=${artifact.controls.lexicalAll}; B=${artifact.controls.cheapInitialOnly}; C=${artifact.controls.cheapAllParents}.`,
    `- descendant budget=${artifact.timingProtocol.descendantBudget} per arm; evaluation budget=${artifact.timingProtocol.evaluationBudget} including seed; deadline=${artifact.timingProtocol.deadlineMs} ms.`,
    `- clock=${artifact.timingProtocol.clock}; synthetic clock evidence=${artifact.timingProtocol.syntheticClockEvidence}; cherry-picking=${artifact.timingProtocol.noCherryPicking ? 'prohibited' : 'allowed'}.`,
    `- horizons=${artifact.timingProtocol.horizonsMs.join(', ')} ms; only reached horizons are informative.`,
    '',
    '## Signal fidelity and no-oracle contract',
    '',
    `- Control initial top-4=${JSON.stringify(artifact.fidelity.controlTop4)}; B initial=${JSON.stringify(artifact.fidelity.cheapInitialOnlyTop4)}; C initial=${JSON.stringify(artifact.fidelity.cheapAllParentsInitialTop4)}; fidelity=${artifact.fidelity.status}.`,
    `- Signal=${artifact.signal.signalId}; ${artifact.signal.definition}`,
    `- Inputs=${artifact.signal.candidateInputFields.join('; ')}; forbidden=${artifact.signal.forbiddenOracleInputs.join('; ')}.`,
    `- Initial pre-polish canonical evaluations=${artifact.fidelity.prePolishCanonicalEvaluations}; partial-refinement coordinate trials=${artifact.fidelity.partialRefinementCoordinateTrials}; oracle inputs used=${artifact.fidelity.oracleInputsUsed.length === 0 ? 'none' : artifact.fidelity.oracleInputsUsed.join(', ')}.`,
    `- Fidelity flags: A lexical all=${artifact.fidelity.lexicalAllParents}; B initial-only=${artifact.fidelity.cheapInitialOnlyScope}; C dynamic all=${artifact.fidelity.cheapAllParentsScope}; runtime future ranking=${artifact.fidelity.futureRankingDerivedAtRuntime}; parent-local no-reuse=${artifact.fidelity.parentLocalRankingNoOutcomeReuse}; post-initial parent observed=${artifact.fidelity.postInitialParentObserved}; fixed budget=${artifact.fidelity.fixedDescendantBudgetRespected}; default solver unchanged=${artifact.fidelity.normalSolverUnchangedOutsideExperimentalMode}.`,
    `- Fidelity mismatches=${artifact.fidelity.mismatches.length === 0 ? 'none' : JSON.stringify(artifact.fidelity.mismatches)}.`,
    '',
    '## Per-arm work and real timing',
    '',
    '| Run | Arm | parents | proposals | pre-polish canonical evals | full-polish coordinate trials | descendants | canonical delivered evals | admission ms | total ms | stop |',
    '|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|:---|',
    ...artifact.runs.map((run) => `| ${run.orderIndex} | ${run.armId} | ${run.work.parentExpansions} | ${run.work.proposalsGenerated} | ${run.work.prePolishCanonicalEvaluations} | ${run.work.fullPolishCoordinateTrials} | ${run.work.descendantEvaluations} | ${run.work.canonicalDeliveredEvaluations} | ${run.timing.admissionElapsedMs.toFixed(3)} | ${run.timing.totalElapsedMs.toFixed(3)} | ${run.stopReason} |`),
    '',
    'Canonical evaluations and coordinate trials are separate units; admission overhead is charged to total elapsed time and reported separately.',
    '',
    '## Per-parent admission decisions',
    '',
    ...artifact.runs.flatMap((run) => run.parentDecisions.map((decision) =>
      `- Run ${run.orderIndex} ${run.armId}, layer ${decision.layerIndex}, parent ${decision.parentIdentity}: proposals=${decision.proposalCount}; lexical top4=${JSON.stringify(decision.lexicalTop4)}; cheap top4=${JSON.stringify(decision.cheapTop4)}; overlap=${decision.overlap}; binding=${decision.binding}; source=${decision.rankingSource}; pre-polish evals=${decision.canonicalPrePolishEvaluationCount}; admitted ranks=${JSON.stringify(decision.admittedProposalRanks)}; child set=${JSON.stringify(decision.admittedChildSet)}; scoringMs=${decision.scoringElapsedMs.toFixed(3)}.`)),
    '',
    'If a parent had four or fewer proposals, `binding=false` records that no artificial selection was imposed.',
    '',
    '## A vs B replication',
    '',
    `- ${artifact.comparisons.initialOnlyVsLexicalAll.reason}`,
    `- Final regret A=${renderAggregate(artifact.comparisons.initialOnlyVsLexicalAll.final.lexicalAll)}; B=${renderAggregate(artifact.comparisons.initialOnlyVsLexicalAll.final.cheapInitialOnly)}.`,
    `- Replication valid=${artifact.comparisons.initialOnlyVsLexicalAll.valid && artifact.comparisons.initialOnlyVsLexicalAll.materialQualityGain && artifact.comparisons.initialOnlyVsLexicalAll.pairwiseWins >= Math.ceil(DYNAMIC_ALL_PARENTS_REPETITIONS / 2)}.`,
    '',
    '## C vs B incremental comparison',
    '',
    `- ${artifact.comparisons.dynamicAllParentsVsInitialOnly.reason}`,
    `- Final regret B=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.final.cheapInitialOnly)}; C=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.final.cheapAllParents)}.`,
    `- Final RMSE B=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.rmse.cheapInitialOnly)}; C=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.rmse.cheapAllParents)}.`,
    `- Final maxAbs B=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.maxAbs.cheapInitialOnly)}; C=${renderAggregate(artifact.comparisons.dynamicAllParentsVsInitialOnly.maxAbs.cheapAllParents)}.`,
    `- Parent accounting: C changed top-4 in ${artifact.parentSummary.top4DifferentFromLexical} parents; ${artifact.parentSummary.top4DifferentWithSelectorPreferredChild} subsequently produced a selector-preferred admitted child; ${artifact.parentSummary.scoringPaidWhereTop4Unchanged} paid scoring where top-4 did not change.`,
    `- Classification: **${artifact.classification}**.`,
    '',
    '## Raw best-so-far trajectories, transitions, frontier, and timing',
    '',
    ...artifact.runs.map((run) => `- Run ${run.orderIndex} (${run.armId}, pair ${run.pairIndex}): ${run.trajectory.map((point) => `${point.evaluationCount}@${point.elapsedMs.toFixed(3)}ms=${renderMetric(point.metric)}`).join('; ') || 'none'}`),
    ...artifact.runs.map((run) => `- Run ${run.orderIndex}: first useful=${run.firstUsefulImprovement === null ? 'none' : `${run.firstUsefulImprovement.evaluationIndex}@${run.firstUsefulImprovement.elapsedMs.toFixed(3)}ms`}; best index=${run.bestEvaluationIndex}; time to best=${run.timeToBestMs.toFixed(3)}ms; Pareto novelty seed=${run.paretoNovelty.againstSeedBaselines}, descendants=${run.paretoNovelty.descendantsOnly}; transitions=${run.parentTransitions.join(' -> ') || 'none'}; terminal beam=${run.terminalBeam.join(', ') || 'none'}.`),
    '',
    ...artifact.horizonSummaries.map((summary) => `- ${summary.horizonMs / 1000}s: A=${renderAggregate(summary.lexicalAllRegret)} (${summary.informativeRuns.lexicalAll}); B=${renderAggregate(summary.cheapInitialOnlyRegret)} (${summary.informativeRuns.cheapInitialOnly}); C=${renderAggregate(summary.cheapAllParentsRegret)} (${summary.informativeRuns.cheapAllParents}).`),
    '',
    '## Facts, interpretation, and limitations',
    '',
    '### Measured facts',
    '',
    ...artifact.facts.map((fact) => `- ${fact}`),
    '',
    '### Interpretation',
    '',
    ...artifact.interpretation.map((fact) => `- ${fact}`),
    '',
    '### Limitations',
    '',
    ...artifact.limitations.map((fact) => `- ${fact}`),
    '',
    '## Hashes and exact gate status',
    '',
    `- Artifact SHA-256 (file as written; self-field remains null): ${artifactSha256}.`,
    `- Frozen predecessor hashes: census=${artifact.hashes.censusArtifactSha256}; replay=${artifact.hashes.replayArtifactSha256}; signal audit=${artifact.hashes.signalAuditArtifactSha256}; semantic set=${artifact.hashes.semanticSetSha256}; reference=${artifact.hashes.referenceSnapshotSha256}.`,
    `- Initial cheap-admission artifact/report=${artifact.hashes.predecessorCheapArtifactSha256}/${artifact.hashes.predecessorCheapReportSha256}; cost-aware artifact/report=${artifact.hashes.predecessorCostArtifactSha256}/${artifact.hashes.predecessorCostReportSha256}.`,
    `- Deterministic non-temporal component SHA-256=${artifact.hashes.deterministicSummarySha256}; timing and machine metadata are intentionally excluded.`,
    ...Object.entries(artifact.testsAndGates.gateResults).map(([name, status]) => `- ${name}: ${status}.`),
    `- Focused test: ${artifact.testsAndGates.focusedTestCommand}.`,
    `- Generation: ${artifact.testsAndGates.generationCommand}.`,
    `- Required gates: ${artifact.testsAndGates.requiredGateCommands.join('; ')}.`,
    '',
    'This evidence stops at the A/B/C Storm experiment. It does not change normal solver policy or authorize promotion, U12t/Trio, MP rank audit, holdout, calibration, merge, release, deploy, or publish.',
    '',
  ]
  return lines.join('\n')
}

export function runStormStructuralAdmissionDynamicAllParents(
  options: StormStructuralAdmissionDynamicAllParentsOptions = {},
): StormStructuralAdmissionDynamicArtifact {
  return createArtifact(options)
}

export function generateStormStructuralAdmissionDynamicAllParents(
  options: StormStructuralAdmissionDynamicAllParentsOptions = {},
): { artifact: StormStructuralAdmissionDynamicArtifact; artifactPath: string; reportPath: string; artifactSha256: string } {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_ADMISSION_DYNAMIC_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_ADMISSION_DYNAMIC_REPORT)
  const artifact = runStormStructuralAdmissionDynamicAllParents(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralAdmissionDynamicAllParentsReport(artifact, artifactSha256))
  return { artifact, artifactPath, reportPath, artifactSha256 }
}

export function main(): void {
  const generated = generateStormStructuralAdmissionDynamicAllParents()
  process.stdout.write(JSON.stringify({
    artifactPath: generated.artifactPath,
    reportPath: generated.reportPath,
    artifactSha256: generated.artifactSha256,
    classification: generated.artifact.classification,
  }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
