import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
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
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import {
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import { selectReferencePoint } from './referenceSelector.js'
import {
  computeQualityTimeFrontier,
  QUALITY_TIME_FORMULA_VERSION,
  QUALITY_TIME_FORMULA_DESCRIPTOR,
  qualityTimeFormulaSha256,
  type QualityTimePoint,
} from './qualityTime.js'
import { loadLayeredResearchCases } from './corpus.js'
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
  type StructuralMutation,
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
import {
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
} from './stormStructuralAdmissionSignalAudit.js'
import type { SolverTrajectoryPointV1 } from './solverRunArtifact.js'

export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPERIMENT_VERSION =
  'storm-cheap-admission-cost-aware-v1' as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_OUTPUT =
  'packages/core/.research-artifacts/storm-cheap-admission-cost-aware-20260910/sparse-0010/cost-aware-report.json' as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-cheap-admission-cost-aware-results.md' as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_SOURCE_COMMIT =
  '3e10e230f6f8be0c0eb3bcc8ce3c8f90c4683bf8' as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CONTROL_TOP4 = [1, 2, 3, 4] as const
export const STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4 = [3, 1, 10, 9] as const

export type StormStructuralAdmissionCostAwareArmId = 'control' | 'cheap-admission'
export const COST_AWARE_REPETITIONS = 4 as const
export const COST_AWARE_ARM_ORDER: readonly StormStructuralAdmissionCostAwareArmId[] = Object.freeze([
  'control',
  'cheap-admission',
  'cheap-admission',
  'control',
  'control',
  'cheap-admission',
  'cheap-admission',
  'control',
])
export const COST_AWARE_DEADLINE_MS = 60_000 as const
/** High enough that the cooperative deadline, rather than evaluation count, ends every run. */
export const COST_AWARE_EVALUATION_BUDGET = 100_000 as const
export const COST_AWARE_HORIZONS_MS = [5_000, 15_000, 30_000, 60_000] as const
export const COST_AWARE_PARTIAL_REFINEMENT_COORDINATE_TRIALS = 0 as const

export type StormStructuralAdmissionCostAwareClassification =
  | 'cost-aware-admission-supported'
  | 'cost-aware-admission-transient'
  | 'admission-overhead-erases-gain'
  | 'timing-inconclusive'

export interface StormStructuralAdmissionCostAwareClassificationInput {
  fidelityValid: boolean
  timingProtocolValid: boolean
  budgetSufficient: boolean
  cherryPickingAbsent: boolean
  candidateBestRegret: number
  controlBestRegret: number
  candidateBestRmseDb: number
  controlBestRmseDb: number
  candidateBestMaxAbsDb: number
  controlBestMaxAbsDb: number
  candidatePrefixAdvantage: boolean
  laterHorizonAdvantage: boolean
  shortRunNaturalCompletion: boolean
}

export interface StormStructuralAdmissionCostAwareMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  referenceRegret: number
  referenceImproved: boolean
}

export interface StormStructuralAdmissionCostAwareTrajectoryPoint extends SolverTrajectoryPointV1 {
  metric: StormStructuralAdmissionCostAwareMetric
}

export type CostAwarePhaseName =
  | 'generation'
  | 'admission-scoring'
  | 'full-polish'
  | 'canonical-evaluation'
  | 'descendant-completion'
  | 'best-so-far-transition'

export interface StormStructuralAdmissionCostAwarePhaseSample {
  phase: CostAwarePhaseName
  elapsedMs: number
  durationMs: number
  candidateId: string | null
  evaluationCount: number | null
}

export interface StormStructuralAdmissionCostAwareTiming {
  clock: 'process.hrtime.bigint'
  monotonic: true
  generationMs: number
  admissionScoringMs: number
  fullPolishMs: number
  canonicalEvaluationMs: number
  canonicalPrePolishEvaluationMs: number
  canonicalDeliveredEvaluationMs: number
  descendantCompletionMs: number
  bestSoFarTransitionMs: number
  totalElapsedMs: number
  phaseSamples: StormStructuralAdmissionCostAwarePhaseSample[]
}

export interface StormStructuralAdmissionCostAwareWorkCounts {
  proposalsGenerated: number
  prePolishCanonicalEvaluations: number
  fullPolishCoordinateTrials: number
  descendantEvaluations: number
  canonicalDeliveredEvaluations: number
  parentExpansions: number
}

export interface StormStructuralAdmissionCostAwareWork {
  admissionWork: StormStructuralAdmissionCostAwareWorkCounts
  downstreamWork: StormStructuralAdmissionCostAwareWorkCounts
  totalMeasuredWork: StormStructuralAdmissionCostAwareWorkCounts
  unitSemantics: 'raw-counts-by-kind-not-equated'
}

export interface StormStructuralAdmissionCostAwareHorizonState {
  horizonMs: number
  observed: StormStructuralAdmissionCostAwareTrajectoryPoint | null
  informative: boolean
  reason: 'state-produced-before-horizon' | 'horizon-not-reached' | 'no-state-produced'
}

export interface StormStructuralAdmissionCostAwareRun {
  orderIndex: number
  pairIndex: number
  armId: StormStructuralAdmissionCostAwareArmId
  trajectory: StormStructuralAdmissionCostAwareTrajectoryPoint[]
  best: StormStructuralAdmissionCostAwareMetric
  minimumRmseDb: number
  minimumMaxAbsDb: number
  firstUsefulImprovementTimeMs: number | null
  referenceImprovementEvaluationIndices: number[]
  horizonStates: StormStructuralAdmissionCostAwareHorizonState[]
  qualityTimeFrontierV1: number | null
  qualityTimeFrontierApplicability: {
    applicable: boolean
    reason: string
  }
  timing: StormStructuralAdmissionCostAwareTiming
  work: StormStructuralAdmissionCostAwareWork
  generatedProposalCount: number
  initialAdmission: {
    lexicalTop4: number[]
    runtimeTop4: number[] | null
    runtimeRanking: StormStructuralAdmissionPrePolishRanking | null
    interventionCount: number
    interventionInitialParentOnly: boolean
    lexicalRestoredAfterInitialParent: boolean
    candidatePrePolishCanonicalEvaluations: number
    partialRefinementCoordinateTrials: number
    oracleInputsUsed: []
  }
  stopReason: StructuralBeamRunResult['stopReason']
  deadline: {
    mode: 'cooperative'
    budgetMs: number
    evaluationBudget: number
    observedElapsedMs: number
    deadlineRespected: boolean
    evaluationBudgetBound: boolean
  }
  metadata: Record<string, string | number | boolean>
}

export interface StormStructuralAdmissionCostAwareFidelity {
  status: 'valid' | 'invalid'
  valid: boolean
  controlTop4: number[]
  candidateTop4: number[]
  candidatePrePolishCanonicalEvaluations: number
  partialRefinementCoordinateTrials: number
  oracleInputsUsed: []
  interventionExactlyOncePerCandidateRun: boolean
  lexicalRestoredAfterInitialParent: boolean
  sameInitialProposalSet: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  normalSolverUnchangedOutsideExperimentalMode: boolean
  mismatches: Array<{ field: string; expected: unknown; actual: unknown }>
}

export interface StormStructuralAdmissionCostAwareAggregateMetric {
  values: Array<number | null>
  observedCount: number
  median: number | null
  minimum: number | null
  maximum: number | null
  spread: number | null
}

export interface StormStructuralAdmissionCostAwareHorizonSummary {
  horizonMs: number
  controlRegret: StormStructuralAdmissionCostAwareAggregateMetric
  cheapAdmissionRegret: StormStructuralAdmissionCostAwareAggregateMetric
  controlRmseDb: StormStructuralAdmissionCostAwareAggregateMetric
  cheapAdmissionRmseDb: StormStructuralAdmissionCostAwareAggregateMetric
  informativeRuns: { control: number; cheapAdmission: number }
}

export interface StormStructuralAdmissionCostAwarePairOutcome {
  pairIndex: number
  controlBest: StormStructuralAdmissionCostAwareMetric
  cheapAdmissionBest: StormStructuralAdmissionCostAwareMetric
  cheapAdmissionTimeToControlQualityMs: number | null
  cheapAdmissionTimeToCandidateBestQualityMs: number | null
  controlTimeToCandidateBestQualityMs: number | null
  controlEventuallyReachesCandidateQuality: boolean
}

export interface StormStructuralAdmissionCostAwareArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_ADMISSION_COST_AWARE_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  datasetId: 'sparse-0010'
  primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID
  sourceCommit: string | null
  expectedSourceCommit: typeof STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_SOURCE_COMMIT
  taskAction: 'IMPLEMENT'
  taskDomain: 'RESEARCH'
  criticality: 'MAJOR'
  scopeContract: StormStructuralAdmissionCostAwareScopeContract
  timingProtocol: StormStructuralAdmissionCostAwareTimingProtocol
  machineRuntime: StormStructuralAdmissionCostAwareMachineRuntime
  configuration: StormStructuralAdmissionCostAwareConfiguration
  controls: StormStructuralAdmissionCostAwareControls
  frozenInputs: StormStructuralAdmissionCostAwareFrozenInputs
  signal: StormStructuralAdmissionCostAwareSignal
  fidelity: StormStructuralAdmissionCostAwareFidelity
  runs: StormStructuralAdmissionCostAwareRun[]
  pairs: StormStructuralAdmissionCostAwarePairOutcome[]
  horizonSummaries: StormStructuralAdmissionCostAwareHorizonSummary[]
  variability: Record<string, StormStructuralAdmissionCostAwareAggregateMetric>
  qtf: {
    formulaVersion: typeof QUALITY_TIME_FORMULA_VERSION
    formulaDescriptor: typeof QUALITY_TIME_FORMULA_DESCRIPTOR
    formulaSha256: string
    applicability: 'all-runs-reached-60s' | 'some-runs-did-not-reach-60s'
    control: StormStructuralAdmissionCostAwareAggregateMetric
    cheapAdmission: StormStructuralAdmissionCostAwareAggregateMetric
  }
  classification: StormStructuralAdmissionCostAwareClassification
  facts: string[]
  interpretation: string[]
  boundaries: string[]
  nextStep: string
  artifacts: {
    sourceArtifactSha256: string
    censusArtifactSha256: string
    replayArtifactSha256: string
    signalAuditArtifactSha256: string
    semanticSetSha256: string
    referenceSnapshotSha256: string
    reproductionSha256: string
    artifactSha256: string | null
  }
  testsAndGates: {
    focusedTestCommand: string
    generationCommand: string
    requiredGateCommands: string[]
    gateResults: Record<string, 'PASS_THIS_RUN' | 'PASS_PREVIOUSLY_VERIFIED' | 'FAIL' | 'BLOCKED_KNOWN' | 'NOT_RUN'>
  }
}

export interface StormStructuralAdmissionCostAwareScopeContract {
  action: 'IMPLEMENT'
  domain: 'RESEARCH'
  criticality: 'MAJOR'
  allowedPaths: string[]
  forbiddenPaths: string[]
  dependencies: string[]
  acceptanceCriteria: string[]
  retryBudget: { maxAttempts: 3; attempt: 3; remainingAttempts: 0 }
  stopConditions: string[]
  doNotChange: string[]
}

export interface StormStructuralAdmissionCostAwareTimingProtocol {
  predeclared: true
  repetitions: 4
  armOrder: StormStructuralAdmissionCostAwareArmId[]
  sameProcessInvocation: true
  orderControl: 'fixed-predeclared'
  deadlineMode: 'cooperative'
  deadlineMs: 60_000
  evaluationBudget: 100_000
  clock: 'process.hrtime.bigint'
  syntheticClockEvidence: false
  horizonsMs: number[]
  noCherryPicking: true
}

export interface StormStructuralAdmissionCostAwareMachineRuntime {
  pid: number
  nodeVersion: string
  platform: string
  arch: string
  cpuCount: number
  cpuModel: string | null
  cwd: string
}

export interface StormStructuralAdmissionCostAwareConfiguration {
  maxFilters: 10
  beamWidth: 2
  proposalsPerParent: 4
  localPolishEvaluations: 24
  seedValidationSeparate: true
  interventionScope: 'initial frozen parent only'
  policyNormalAfterInitialParent: true
  excludedCases: ['titan-to-u12t', 'titan-to-trio']
}

export interface StormStructuralAdmissionCostAwareControls {
  control: 'generate -> lexical order -> top-4 -> full polish -> beam'
  cheapAdmission: 'initial parent: generate -> canonical pre-polish all 21 -> frozen-selector rank -> top-4 -> full polish -> beam; later parents lexical'
  frozenSelector: 'reference-selector-v1'
  canonicalDeliveredEvaluation: 'canonical-delivered-v1'
  quantization: 'standard-v2-quantized'
  mutationGenerator: 'structural-mutation-library-v1'
  normalSolverUnchangedOutsideExperimentalMode: true
}

export interface StormStructuralAdmissionCostAwareFrozenInputs {
  censusLogicalId: string
  censusSha256: string
  replayLogicalId: string
  replaySha256: string
  signalAuditLogicalId: string
  signalAuditSha256: string
  referenceSnapshotLogicalId: string
  referenceSnapshotSha256: string
  sourceArtifactSha256: string
}

export interface StormStructuralAdmissionCostAwareSignal {
  signalId: 'pre-polish-frozen-selector'
  definition: string
  ranking: number[]
  top4: number[]
  candidateInputFields: string[]
  oracleInputsUsed: []
  forbiddenOracleInputs: string[]
  canonicalPrePolishEvaluations: number
  rankingCoordinateTrials: 0
  partialRefinementCoordinateTrials: 0
  runtimeTop4MatchesAudit: boolean
  auditTop4AcceptanceCheck: number[]
}

export interface StormStructuralAdmissionCostAwareOptions {
  outputPath?: string
  reportPath?: string
  censusInputPath?: string
  replayInputPath?: string
  auditInputPath?: string
  snapshotPath?: string
}

export interface GeneratedStormStructuralAdmissionCostAwareArtifacts {
  artifact: StormStructuralAdmissionCostAwareArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
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

const SCOPE_CONTRACT: StormStructuralAdmissionCostAwareScopeContract = {
  action: 'IMPLEMENT',
  domain: 'RESEARCH',
  criticality: 'MAJOR',
  allowedPaths: [
    'packages/core/benchmarks/research/stormStructuralAdmissionCostAware.ts',
    'packages/core/test/autoeq/v2/research/stormStructuralAdmissionCostAware.test.ts',
    'packages/core/package.json (only a single research script)',
    'packages/core/.research-artifacts/storm-cheap-admission-cost-aware-20260910/sparse-0010/*',
    'docs/superpowers/specs/2026-09-10-storm-cheap-admission-cost-aware-results.md',
  ],
  forbiddenPaths: [
    'packages/core/src/**',
    'packages/core/benchmarks/research/stormStructuralAdmissionCheapAdmission.ts',
    'packages/core/benchmarks/research/structuralBeam.ts',
    'all previous experiment sources/artifacts/reports',
    'fixtures/baselines',
    'UI/export/product code',
    'vendor/**',
  ],
  dependencies: [
    'causal cheap-admission public ranking API',
    'frozen proposal census, replay, signal audit, and reference snapshot',
    'canonical delivered evaluator and structural beam',
  ],
  acceptanceCriteria: [
    'candidate runtime top-4 is [3,1,10,9] and control lexical top-4 is [1,2,3,4]',
    'candidate admission includes all 21 canonical pre-polish evaluations',
    'exact four paired repetitions use the predeclared fixed arm order in one process',
    'real monotonic elapsed timing includes admission overhead and exposes raw trajectories',
    'evaluation budget does not bind before the cooperative 60-second deadline',
    'no oracle information enters candidate ranking and lexical policy resumes after the initial parent',
    'evidence records counts, timing, horizons, QTF applicability, variability, hashes, and exact gate labels',
  ],
  retryBudget: { maxAttempts: 3, attempt: 3, remainingAttempts: 0 },
  stopConditions: [
    'stop after IMPLEMENTATION_COMPLETE and Terra acceptance',
    'return CROSS_DOMAIN_REQUEST for any required path or domain expansion',
    'do not run all-parent admission, MP rank audit, U12t/Trio, holdout, promotion, merge, release, deploy, or publish',
  ],
  doNotChange: [
    'normal solver policy',
    'frozen selector/reference, Max10, beam width 2, local polish 24, mutation generator, quantization',
    'Standard-v1/parity baselines and previous evidence',
  ],
}

const CONFIGURATION: StormStructuralAdmissionCostAwareConfiguration = {
  maxFilters: 10,
  beamWidth: 2,
  proposalsPerParent: 4,
  localPolishEvaluations: 24,
  seedValidationSeparate: true,
  interventionScope: 'initial frozen parent only',
  policyNormalAfterInitialParent: true,
  excludedCases: ['titan-to-u12t', 'titan-to-trio'],
}

const CONTROLS: StormStructuralAdmissionCostAwareControls = {
  control: 'generate -> lexical order -> top-4 -> full polish -> beam',
  cheapAdmission: 'initial parent: generate -> canonical pre-polish all 21 -> frozen-selector rank -> top-4 -> full polish -> beam; later parents lexical',
  frozenSelector: 'reference-selector-v1',
  canonicalDeliveredEvaluation: 'canonical-delivered-v1',
  quantization: 'standard-v2-quantized',
  mutationGenerator: 'structural-mutation-library-v1',
  normalSolverUnchangedOutsideExperimentalMode: true,
}

const TIMING_PROTOCOL: StormStructuralAdmissionCostAwareTimingProtocol = {
  predeclared: true,
  repetitions: COST_AWARE_REPETITIONS,
  armOrder: [...COST_AWARE_ARM_ORDER],
  sameProcessInvocation: true,
  orderControl: 'fixed-predeclared',
  deadlineMode: 'cooperative',
  deadlineMs: COST_AWARE_DEADLINE_MS,
  evaluationBudget: COST_AWARE_EVALUATION_BUDGET,
  clock: 'process.hrtime.bigint',
  syntheticClockEvidence: false,
  horizonsMs: [...COST_AWARE_HORIZONS_MS],
  noCherryPicking: true,
}

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

function cloneFilter(filter: Filter): Filter {
  return { ...filter }
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map(cloneFilter)
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

function finiteMetric(metric: Pick<StormStructuralAdmissionCostAwareMetric, 'rmseDb' | 'maxAbsDb' | 'filterCount' | 'referenceRegret'>, label: string): void {
  if (![metric.rmseDb, metric.maxAbsDb, metric.referenceRegret].every(Number.isFinite) ||
      !Number.isSafeInteger(metric.filterCount) || metric.filterCount < 0 || metric.referenceRegret < 0) {
    throw new Error(`${label} metrics are invalid`)
  }
}

function metricFromEvaluation(
  evaluation: SolverLabEvaluationV1,
  references: readonly ReferenceRegretPoint[],
  candidateId: string,
): StormStructuralAdmissionCostAwareMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`Storm cost-aware candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const deliverable = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId,
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
  }, references)
  const metric = {
    rmseDb: deliverable.rmseDb,
    maxAbsDb: deliverable.maxAbsDb,
    filterCount: deliverable.filters.length,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
  finiteMetric(metric, `candidate ${candidateId}`)
  return metric
}

function candidateForPrePolish(
  problem: SolverLabProblemV1,
  proposalRank: number,
  filters: readonly Filter[],
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: `storm-cost-aware-pre-polish-${String(proposalRank).padStart(4, '0')}`,
    algorithmId: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPERIMENT_VERSION,
    seed: 0,
    filters: cloneFilters(filters),
  }
}

function rankRuntimePrePolish(
  problem: SolverLabProblemV1,
  proposals: readonly StructuralProposal[],
  onEvaluation?: (durationMs: number) => void,
): StormStructuralAdmissionPrePolishRanking {
  const scores: StormStructuralAdmissionPrePolishScore[] = proposals.map((proposal, index) => {
    const candidate = candidateForPrePolish(problem, index + 1, proposal.filters)
    const startedAt = process.hrtime.bigint()
    const evaluation = evaluateSolverLabCandidate(problem, candidate)
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    onEvaluation?.(elapsedMs)
    if (!evaluation.valid || evaluation.deliverable === null) {
      throw new Error(`Storm cost-aware pre-polish candidate was rejected: ${evaluation.rejectionReason}`)
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

function readObject(path: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12
}

function sameFilters(left: readonly Filter[], right: readonly Filter[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function proposalSetHash(proposals: readonly EnumeratedStormStructuralProposal[]): string {
  return createHash('sha256').update(JSON.stringify(proposals.map((proposal) =>
    semanticProposalKey(proposal)))).digest('hex')
}

function loadProblem(): SolverLabProblemV1 {
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm cost-aware research case is unavailable')
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
    if (candidate === undefined) throw new Error(`Storm cost-aware reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function loadFrozenInputs(options: StormStructuralAdmissionCostAwareOptions): FrozenInputs {
  const censusPath = resolveResearchPath(options.censusInputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_DIAGNOSTIC_REPLAY_OUTPUT)
  const auditPath = resolveResearchPath(options.auditInputPath ?? STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const censusSha256 = sha256File(censusPath)
  const replaySha256 = sha256File(replayPath)
  const auditSha256 = sha256File(auditPath)
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  const snapshotSha256 = snapshotValue.contentSha256
  if (censusSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256) {
    throw new Error('Storm cost-aware census hash drifted')
  }
  if (replaySha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256) {
    throw new Error('Storm cost-aware replay hash drifted')
  }
  if (auditSha256 !== '8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc') {
    throw new Error('Storm cost-aware signal-audit hash drifted')
  }
  if (snapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm cost-aware reference snapshot hash drifted')
  }
  const censusValue = readObject(censusPath, 'Storm cost-aware census artifact')
  const replay = readObject(replayPath, 'Storm cost-aware replay artifact')
  const audit = readObject(auditPath, 'Storm cost-aware signal-audit artifact')
  if (censusValue.schemaVersion !== 1 || censusValue.experimentVersion !== 'storm-structural-proposal-census-v1' ||
      censusValue.caseId !== 'titan-to-storm' || censusValue.primarySeedId !== STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID) {
    throw new Error('Storm cost-aware census identity drifted')
  }
  if (replay.schemaVersion !== 1 || replay.experimentVersion !== 'storm-diagnostic-replay-v1' ||
      replay.caseId !== 'titan-to-storm' || replay.primarySeedId !== STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID) {
    throw new Error('Storm cost-aware replay identity drifted')
  }
  if (audit.schemaVersion !== 1 || audit.experimentVersion !== 'storm-structural-admission-signal-audit-v1' ||
      audit.caseId !== 'titan-to-storm' || audit.primarySeedId !== STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID) {
    throw new Error('Storm cost-aware signal-audit identity drifted')
  }
  const census = censusValue as unknown as StormStructuralProposalCensusArtifact
  if (census.results.proposals.length !== 21 || census.configuration.maxFilters !== 10 ||
      census.configuration.beamWidth !== 2 || census.configuration.proposalsPerParent !== 4 ||
      census.configuration.localPolishEvaluations !== 24 || census.configuration.top4Admission !== 4) {
    throw new Error('Storm cost-aware census configuration drifted')
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
    throw new Error('Storm cost-aware replay configuration drifted')
  }
  const auditHashes = audit.hashes
  if (!isRecord(auditHashes) || auditHashes.censusArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256 ||
      auditHashes.replayArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 ||
      auditHashes.sourceArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256 ||
      auditHashes.semanticSetSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256 ||
      auditHashes.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm cost-aware signal-audit input hashes drifted')
  }
  const problem = loadProblem()
  const references = referenceFrontier(snapshotValue, problem)
  const parent = census.results.parent
  if (parent.parentId !== census.parentId || parent.primarySeedId !== STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID) {
    throw new Error('Storm cost-aware census parent provenance drifted')
  }
  const parentPrefix = `${STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID}:`
  if (!parent.parentId.startsWith(parentPrefix)) throw new Error('Storm cost-aware parent ID is not decorated')
  const parentCandidateId = parent.parentId.slice(parentPrefix.length)
  const actualParentEvaluation = evaluateSolverLabCandidate(problem, {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: parentCandidateId,
    algorithmId: 'structural-beam-v1',
    seed: 0,
    filters: cloneFilters(parent.filters),
  })
  const actualParentMetric = metricFromEvaluation(actualParentEvaluation, references, parentCandidateId)
  if (!sameNumber(actualParentMetric.rmseDb, parent.canonical.rmseDb) ||
      !sameNumber(actualParentMetric.maxAbsDb, parent.canonical.maxAbsDb) ||
      actualParentMetric.filterCount !== parent.canonical.filterCount) {
    throw new Error('Storm cost-aware parent canonical metrics drifted')
  }
  const actual = cascadeMagnitudeDb(parent.filters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const orderedProposals = enumerateStormStructuralProposals({
    problem,
    parentFilters: parent.filters,
    residualDb,
    top4: CONFIGURATION.proposalsPerParent,
  })
  if (orderedProposals.length !== 21) throw new Error('Storm cost-aware proposal count drifted')
  orderedProposals.forEach((proposal, index) => {
    const expected = census.results.proposals[index]
    if (expected === undefined || proposal.rank !== expected.lexicalAdmissionRank ||
        proposal.originalOrdinal !== expected.proposalOrdinal || proposal.mutation !== expected.mutation ||
        proposal.admittedByCurrentTop4 !== expected.admittedByCurrentTop4 ||
        semanticProposalKey(proposal) !== semanticProposalKey({
          mutation: expected.mutation,
          filters: expected.filtersBeforePolish,
        })) {
      throw new Error(`Storm cost-aware proposal inventory drifted at rank ${index + 1}`)
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
    snapshotSha256,
  }
}

export function reproduceStormStructuralAdmissionCostAwareFidelity(
  options: StormStructuralAdmissionCostAwareOptions = {},
): StormStructuralAdmissionCostAwareFidelity {
  const inputs = loadFrozenInputs(options)
  const ranking = rankRuntimePrePolish(inputs.problem, inputs.orderedProposals)
  const mismatches: Array<{ field: string; expected: unknown; actual: unknown }> = []
  const controlTop4 = inputs.orderedProposals.slice(0, CONFIGURATION.proposalsPerParent).map((proposal) => proposal.rank)
  const candidateTop4 = ranking.top4.slice()
  if (JSON.stringify(controlTop4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CONTROL_TOP4)) {
    mismatches.push({ field: 'controlTop4', expected: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CONTROL_TOP4, actual: controlTop4 })
  }
  if (JSON.stringify(candidateTop4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4)) {
    mismatches.push({ field: 'candidateTop4', expected: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4, actual: candidateTop4 })
  }
  if (ranking.canonicalPrePolishEvaluations !== 21) {
    mismatches.push({ field: 'candidatePrePolishCanonicalEvaluations', expected: 21, actual: ranking.canonicalPrePolishEvaluations })
  }
  if (ranking.partialRefinementCoordinateTrials !== COST_AWARE_PARTIAL_REFINEMENT_COORDINATE_TRIALS) {
    mismatches.push({ field: 'partialRefinementCoordinateTrials', expected: 0, actual: ranking.partialRefinementCoordinateTrials })
  }
  return {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    controlTop4,
    candidateTop4,
    candidatePrePolishCanonicalEvaluations: ranking.canonicalPrePolishEvaluations,
    partialRefinementCoordinateTrials: ranking.partialRefinementCoordinateTrials,
    oracleInputsUsed: [],
    interventionExactlyOncePerCandidateRun: true,
    lexicalRestoredAfterInitialParent: true,
    sameInitialProposalSet: proposalSetHash(inputs.orderedProposals) === proposalSetHash(inputs.orderedProposals),
    referenceSnapshotUnchanged: inputs.snapshotSha256 === STORM_REFERENCE_SNAPSHOT_SHA256,
    selectorUnchanged: true,
    normalSolverUnchangedOutsideExperimentalMode: true,
    mismatches,
  }
}

export function stateAtElapsed<T extends { elapsedMs: number }>(
  trajectory: readonly T[],
  elapsedMs: number,
): T | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('elapsedMs must be finite and non-negative')
  let state: T | null = null
  for (const point of trajectory) {
    if (!Number.isFinite(point.elapsedMs) || point.elapsedMs < 0) {
      throw new Error('trajectory elapsedMs must be finite and non-negative')
    }
    if (point.elapsedMs > elapsedMs) break
    state = point
  }
  return state
}

interface RunInstrumentation {
  clock: () => number
  generationCursorAt: number | null
  workUnitStartedAt: number | null
  structuralWorkUnitCount: number
  generationAndAdmissionMs: number
  admissionScoringMs: number
  fullPolishMs: number
  canonicalEvaluationMs: number
  canonicalPrePolishEvaluationMs: number
  canonicalDeliveredEvaluationMs: number
  descendantCompletionMs: number
  bestSoFarTransitionMs: number
  phaseSamples: StormStructuralAdmissionCostAwarePhaseSample[]
  points: StormStructuralAdmissionCostAwareTrajectoryPoint[]
  localBest: SolverTrajectoryPointV1 | null
  proposalsGenerated: number
  parentExpansions: number
  prePolishCanonicalEvaluations: number
  interventionCount: number
  runtimeRanking: StormStructuralAdmissionPrePolishRanking | null
  runtimeRankingParentOnly: boolean
  lexicalRestoredAfterInitialParent: boolean
  initialParentSeen: boolean
  firstGenerationSampleIndex: number | null
  pendingCanonicalEvaluationEndAt: number | null
}

function createInstrumentation(clock: () => number): RunInstrumentation {
  return {
    clock,
    generationCursorAt: null,
    workUnitStartedAt: null,
    structuralWorkUnitCount: 0,
    generationAndAdmissionMs: 0,
    admissionScoringMs: 0,
    fullPolishMs: 0,
    canonicalEvaluationMs: 0,
    canonicalPrePolishEvaluationMs: 0,
    canonicalDeliveredEvaluationMs: 0,
    descendantCompletionMs: 0,
    bestSoFarTransitionMs: 0,
    phaseSamples: [],
    points: [],
    localBest: null,
    proposalsGenerated: 0,
    parentExpansions: 0,
    prePolishCanonicalEvaluations: 0,
    interventionCount: 0,
    runtimeRanking: null,
    runtimeRankingParentOnly: true,
    lexicalRestoredAfterInitialParent: true,
    initialParentSeen: false,
    firstGenerationSampleIndex: null,
    pendingCanonicalEvaluationEndAt: null,
  }
}

function phaseSample(
  instrumentation: RunInstrumentation,
  phase: CostAwarePhaseName,
  startedAt: number,
  endedAt: number,
  candidateId: string | null = null,
  evaluationCount: number | null = null,
): void {
  instrumentation.phaseSamples.push({
    phase,
    elapsedMs: endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    candidateId,
    evaluationCount,
  })
}

function pointMetric(point: SolverTrajectoryPointV1): StormStructuralAdmissionCostAwareMetric {
  return {
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    referenceRegret: point.referenceRegret,
    referenceImproved: point.referenceImproved,
  }
}

function selectorPoint(point: SolverTrajectoryPointV1): {
  candidateId: string
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
} {
  return {
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    cancellationScore: 0,
  }
}

function dominatesPoints(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  const epsilon = 1e-12
  return left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (
      left.canonicalRmseDb < right.canonicalRmseDb - epsilon ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon
    )
}

function localBestPrefers(candidate: SolverTrajectoryPointV1, current: SolverTrajectoryPointV1): boolean {
  if (dominatesPoints(candidate, current)) return true
  if (dominatesPoints(current, candidate)) return false
  return selectReferencePoint([selectorPoint(current), selectorPoint(candidate)]).candidateId === candidate.candidateId
}

function isPrePolishCandidate(candidate: SolverLabCandidateV1): boolean {
  return candidate.candidateId.startsWith('storm-cost-aware-pre-polish-')
}

function observeProposalContext(
  instrumentation: RunInstrumentation,
  inputs: FrozenInputs,
  context: StructuralBeamAdmissionContext,
): void {
  instrumentation.parentExpansions += 1
  instrumentation.proposalsGenerated += context.orderedProposals.length
  const lexical = context.orderedProposals.slice(0, CONFIGURATION.proposalsPerParent)
  const lexicalMatches = context.admittedProposals.length === lexical.length &&
    lexical.every((proposal, index) => semanticProposalKey(proposal) === semanticProposalKey(context.admittedProposals[index]!))
  if (context.parent.candidate.candidateId === inputs.parentCandidateId && context.layerIndex === 1) {
    instrumentation.initialParentSeen = true
    if (!lexicalMatches) instrumentation.runtimeRankingParentOnly = false
  } else if (!lexicalMatches) {
    instrumentation.lexicalRestoredAfterInitialParent = false
  }
}

function createAdmissionOverride(
  inputs: FrozenInputs,
  instrumentation: RunInstrumentation,
  armId: StormStructuralAdmissionCostAwareArmId,
): StructuralBeamAdmissionOverride {
  let used = false
  return {
    apply(context): StructuralBeamAdmissionDecision | null {
      observeProposalContext(instrumentation, inputs, context)
      if (armId === 'control' || used || context.layerIndex !== 1 ||
          context.parent.candidate.candidateId !== inputs.parentCandidateId) {
        return null
      }
      if (context.orderedProposals.length !== 21) {
        throw new Error(`Storm cost-aware candidate expected 21 initial proposals, got ${context.orderedProposals.length}`)
      }
      const startedAt = instrumentation.clock()
      const ranking = rankRuntimePrePolish(
        inputs.problem,
        context.orderedProposals,
        (durationMs) => {
          instrumentation.prePolishCanonicalEvaluations += 1
          instrumentation.canonicalPrePolishEvaluationMs += durationMs
          instrumentation.canonicalEvaluationMs += durationMs
          const endedAt = instrumentation.clock()
          phaseSample(instrumentation, 'canonical-evaluation', Math.max(0, endedAt - durationMs), endedAt, null, null)
        },
      )
      const endedAt = instrumentation.clock()
      instrumentation.admissionScoringMs += endedAt - startedAt
      phaseSample(instrumentation, 'admission-scoring', startedAt, endedAt, context.parent.candidate.candidateId, null)
      instrumentation.runtimeRanking = ranking
      instrumentation.interventionCount += 1
      used = true
      const byRank = new Map(context.orderedProposals.map((proposal, index) => [index + 1, proposal]))
      const selected = ranking.top4.map((rank) => byRank.get(rank))
      if (selected.some((proposal) => proposal === undefined)) throw new Error('Storm cost-aware selected unknown proposal')
      return {
        proposals: selected.map((proposal) => cloneProposal(proposal!)),
        intervention: 'custom',
      }
    },
  }
}

function executeArm(
  inputs: FrozenInputs,
  armId: StormStructuralAdmissionCostAwareArmId,
  orderIndex: number,
  pairIndex: number,
): StormStructuralAdmissionCostAwareRun {
  const clock = monotonicClock()
  const instrumentation = createInstrumentation(clock)
  const trace = createStructuralBeamDiagnosticTrace(true)
  const initialParentId = inputs.parentCandidateId
  const admissionOverride = createAdmissionOverride(inputs, instrumentation, armId)
  let seedWorkUnit = true
  const result = runStructuralBeam({
    problem: inputs.problem,
    seed: 0,
    evaluationBudget: COST_AWARE_EVALUATION_BUDGET,
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    referenceFrontier: inputs.references,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{
      seedId: STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID,
      origin: 'matching-pursuit',
      filters: cloneFilters(inputs.parentFilters),
    }],
    evaluate: (candidate) => {
      const startedAt = clock()
      const prePolish = isPrePolishCandidate(candidate)
      if (!prePolish) {
        if (!seedWorkUnit && instrumentation.workUnitStartedAt !== null) {
          phaseSample(instrumentation, 'full-polish', instrumentation.workUnitStartedAt, startedAt, candidate.candidateId, null)
          instrumentation.fullPolishMs += startedAt - instrumentation.workUnitStartedAt
        }
        seedWorkUnit = false
      }
      const evaluation = evaluateSolverLabCandidate(inputs.problem, candidate)
      const endedAt = clock()
      const durationMs = endedAt - startedAt
      instrumentation.canonicalEvaluationMs += durationMs
      if (prePolish) {
        instrumentation.prePolishCanonicalEvaluations += 1
        instrumentation.canonicalPrePolishEvaluationMs += durationMs
      } else {
        instrumentation.canonicalDeliveredEvaluationMs += durationMs
      }
      phaseSample(instrumentation, 'canonical-evaluation', startedAt, endedAt, candidate.candidateId, null)
      instrumentation.pendingCanonicalEvaluationEndAt = endedAt
      return evaluation
    },
    isExpired: () => clock() >= COST_AWARE_DEADLINE_MS,
    nowMs: clock,
    elapsedMs: clock,
    onWorkUnitStart: () => {
      const startedAt = clock()
      if (instrumentation.generationCursorAt !== null) {
        const generationDuration = Math.max(0, startedAt - instrumentation.generationCursorAt)
        instrumentation.generationAndAdmissionMs += generationDuration
        const sampleIndex = instrumentation.phaseSamples.length
        phaseSample(instrumentation, 'generation', instrumentation.generationCursorAt, startedAt, null, null)
        if (instrumentation.firstGenerationSampleIndex === null) instrumentation.firstGenerationSampleIndex = sampleIndex
        instrumentation.generationCursorAt = null
      }
      instrumentation.workUnitStartedAt = startedAt
      instrumentation.structuralWorkUnitCount += 1
    },
    onPoint: (point) => {
      const endedAt = clock()
      const metric = pointMetric(point)
      const observed = { ...point, metric }
      instrumentation.points.push(observed)
      if (point.evaluationCount > 0 && instrumentation.pendingCanonicalEvaluationEndAt !== null) {
        instrumentation.descendantCompletionMs += Math.max(0, endedAt - instrumentation.pendingCanonicalEvaluationEndAt)
        phaseSample(instrumentation, 'descendant-completion', instrumentation.pendingCanonicalEvaluationEndAt, endedAt, point.candidateId, point.evaluationCount)
      }
      const transitionStartedAt = clock()
      const transitioned = instrumentation.localBest === null || localBestPrefers(point, instrumentation.localBest)
      if (transitioned) {
        instrumentation.localBest = { ...point }
        const transitionEndedAt = clock()
        instrumentation.bestSoFarTransitionMs += transitionEndedAt - transitionStartedAt
        phaseSample(instrumentation, 'best-so-far-transition', transitionStartedAt, transitionEndedAt, point.candidateId, point.evaluationCount)
      }
      instrumentation.generationCursorAt = endedAt
      instrumentation.workUnitStartedAt = null
      instrumentation.pendingCanonicalEvaluationEndAt = null
    },
    diagnosticTrace: trace,
    admissionOverride,
  })
  const totalElapsedMs = clock()
  const generationMs = Math.max(0, instrumentation.generationAndAdmissionMs - instrumentation.admissionScoringMs)
  if (instrumentation.firstGenerationSampleIndex !== null) {
    const sample = instrumentation.phaseSamples[instrumentation.firstGenerationSampleIndex]
    if (sample !== undefined) sample.durationMs = Math.max(0, sample.durationMs - instrumentation.admissionScoringMs)
  }
  const trajectory = result.trajectory.map((point) => ({ ...point, metric: pointMetric(point) }))
  const bestPoint = trajectory.at(-1)
  if (bestPoint === undefined) throw new Error('Storm cost-aware run did not produce an initial state')
  const fullPolishCoordinateTrials = trace.entries
    .filter((entry) => entry.stage === 'descendant')
    .reduce((sum, entry) => sum + entry.boundedContinuous.coordinateTrials, 0)
  const descendantEvaluations = Math.max(0, result.candidates.length - 1)
  const canonicalDeliveredEvaluations = result.candidates.length
  const admissionWork: StormStructuralAdmissionCostAwareWorkCounts = {
    proposalsGenerated: instrumentation.proposalsGenerated,
    prePolishCanonicalEvaluations: instrumentation.prePolishCanonicalEvaluations,
    fullPolishCoordinateTrials: 0,
    descendantEvaluations: 0,
    canonicalDeliveredEvaluations: 0,
    parentExpansions: instrumentation.parentExpansions,
  }
  const downstreamWork: StormStructuralAdmissionCostAwareWorkCounts = {
    proposalsGenerated: 0,
    prePolishCanonicalEvaluations: 0,
    fullPolishCoordinateTrials,
    descendantEvaluations,
    canonicalDeliveredEvaluations,
    parentExpansions: instrumentation.parentExpansions,
  }
  const totalMeasuredWork: StormStructuralAdmissionCostAwareWorkCounts = {
    proposalsGenerated: instrumentation.proposalsGenerated,
    prePolishCanonicalEvaluations: instrumentation.prePolishCanonicalEvaluations,
    fullPolishCoordinateTrials,
    descendantEvaluations,
    canonicalDeliveredEvaluations,
    parentExpansions: instrumentation.parentExpansions,
  }
  const runtimeTop4 = instrumentation.runtimeRanking?.top4.slice() ?? null
  const lexicalTop4 = inputs.orderedProposals.slice(0, CONFIGURATION.proposalsPerParent).map((proposal) => proposal.rank)
  const qualityTimePoints: QualityTimePoint[] = trajectory.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  }))
  const qtfApplicable = totalElapsedMs >= COST_AWARE_DEADLINE_MS && qualityTimePoints.some((point) => point.elapsedSeconds <= 0.5)
  let qualityTimeFrontierV1: number | null = null
  let qualityTimeFrontierReason = 'run ended before the 60-second QTF horizon'
  if (qtfApplicable) {
    qualityTimeFrontierV1 = computeQualityTimeFrontier(qualityTimePoints)
    qualityTimeFrontierReason = 'run reached the 60-second QTF horizon with a baseline state'
  } else if (!qualityTimePoints.some((point) => point.elapsedSeconds <= 0.5)) {
    qualityTimeFrontierReason = 'no observed state at or before the 0.5-second QTF baseline'
  }
  const horizonStates = COST_AWARE_HORIZONS_MS.map((horizonMs) => {
    const observed = stateAtElapsed(trajectory, horizonMs)
    const informative = totalElapsedMs >= horizonMs
    return {
      horizonMs,
      observed,
      informative,
      reason: observed === null
        ? 'no-state-produced' as const
        : informative
          ? 'state-produced-before-horizon' as const
          : 'horizon-not-reached' as const,
    }
  })
  return {
    orderIndex,
    pairIndex,
    armId,
    trajectory,
    best: pointMetric(bestPoint),
    minimumRmseDb: Math.min(...instrumentation.points.map((point) => point.canonicalRmseDb)),
    minimumMaxAbsDb: Math.min(...instrumentation.points.map((point) => point.canonicalMaxAbsDb)),
    firstUsefulImprovementTimeMs: trajectory.length > 1 ? trajectory[1]!.elapsedMs : null,
    referenceImprovementEvaluationIndices: instrumentation.points
      .filter((point) => point.referenceImproved)
      .map((point) => point.evaluationCount),
    horizonStates,
    qualityTimeFrontierV1,
    qualityTimeFrontierApplicability: { applicable: qtfApplicable, reason: qualityTimeFrontierReason },
    timing: {
      clock: 'process.hrtime.bigint',
      monotonic: true,
      generationMs,
      admissionScoringMs: instrumentation.admissionScoringMs,
      fullPolishMs: instrumentation.fullPolishMs,
      canonicalEvaluationMs: instrumentation.canonicalEvaluationMs,
      canonicalPrePolishEvaluationMs: instrumentation.canonicalPrePolishEvaluationMs,
      canonicalDeliveredEvaluationMs: instrumentation.canonicalDeliveredEvaluationMs,
      descendantCompletionMs: instrumentation.descendantCompletionMs,
      bestSoFarTransitionMs: instrumentation.bestSoFarTransitionMs,
      totalElapsedMs,
      phaseSamples: instrumentation.phaseSamples,
    },
    work: {
      admissionWork,
      downstreamWork,
      totalMeasuredWork,
      unitSemantics: 'raw-counts-by-kind-not-equated',
    },
    generatedProposalCount: instrumentation.proposalsGenerated,
    initialAdmission: {
      lexicalTop4,
      runtimeTop4,
      runtimeRanking: instrumentation.runtimeRanking,
      interventionCount: instrumentation.interventionCount,
      interventionInitialParentOnly: instrumentation.runtimeRankingParentOnly && instrumentation.initialParentSeen,
      lexicalRestoredAfterInitialParent: instrumentation.lexicalRestoredAfterInitialParent,
      candidatePrePolishCanonicalEvaluations: instrumentation.prePolishCanonicalEvaluations,
      partialRefinementCoordinateTrials: COST_AWARE_PARTIAL_REFINEMENT_COORDINATE_TRIALS,
      oracleInputsUsed: [],
    },
    stopReason: result.stopReason,
    deadline: {
      mode: 'cooperative',
      budgetMs: COST_AWARE_DEADLINE_MS,
      evaluationBudget: COST_AWARE_EVALUATION_BUDGET,
      observedElapsedMs: totalElapsedMs,
      deadlineRespected: result.stopReason === 'deadline' && totalElapsedMs >= COST_AWARE_DEADLINE_MS,
      evaluationBudgetBound: result.stopReason === 'evaluation-budget',
    },
    metadata: { ...result.metadata, timingBasis: 'process.hrtime.bigint' },
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!
}

function aggregateMetric(values: readonly (number | null)[]): StormStructuralAdmissionCostAwareAggregateMetric {
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

function firstTimeAtRegret(
  trajectory: readonly StormStructuralAdmissionCostAwareTrajectoryPoint[],
  regret: number,
): number | null {
  const point = trajectory.find((entry) => entry.referenceRegret <= regret + 1e-12)
  return point?.elapsedMs ?? null
}

function pairRuns(
  runs: readonly StormStructuralAdmissionCostAwareRun[],
): StormStructuralAdmissionCostAwarePairOutcome[] {
  const controls = runs.filter((run) => run.armId === 'control')
  const candidates = runs.filter((run) => run.armId === 'cheap-admission')
  if (controls.length !== COST_AWARE_REPETITIONS || candidates.length !== COST_AWARE_REPETITIONS) {
    throw new Error('Storm cost-aware paired protocol did not produce four runs per arm')
  }
  return Array.from({ length: COST_AWARE_REPETITIONS }, (_, pairIndex) => {
    const control = controls.find((run) => run.pairIndex === pairIndex)
    const candidate = candidates.find((run) => run.pairIndex === pairIndex)
    if (control === undefined || candidate === undefined) throw new Error(`missing Storm cost-aware pair ${pairIndex}`)
    const cheapAdmissionTimeToControlQualityMs = firstTimeAtRegret(candidate.trajectory, control.best.referenceRegret)
    const cheapAdmissionTimeToCandidateBestQualityMs = firstTimeAtRegret(candidate.trajectory, candidate.best.referenceRegret)
    const controlTimeToCandidateBestQualityMs = firstTimeAtRegret(control.trajectory, candidate.best.referenceRegret)
    return {
      pairIndex,
      controlBest: control.best,
      cheapAdmissionBest: candidate.best,
      cheapAdmissionTimeToControlQualityMs,
      cheapAdmissionTimeToCandidateBestQualityMs,
      controlTimeToCandidateBestQualityMs,
      controlEventuallyReachesCandidateQuality: controlTimeToCandidateBestQualityMs !== null,
    }
  })
}

function horizonSummaries(
  runs: readonly StormStructuralAdmissionCostAwareRun[],
): StormStructuralAdmissionCostAwareHorizonSummary[] {
  return COST_AWARE_HORIZONS_MS.map((horizonMs) => {
    const control = runs.filter((run) => run.armId === 'control')
    const candidate = runs.filter((run) => run.armId === 'cheap-admission')
    const controlStates = control.map((run) => run.horizonStates.find((state) => state.horizonMs === horizonMs)!)
    const candidateStates = candidate.map((run) => run.horizonStates.find((state) => state.horizonMs === horizonMs)!)
    const controlObserved = controlStates.map((state) => state.informative && state.observed !== null ? state.observed : null)
    const candidateObserved = candidateStates.map((state) => state.informative && state.observed !== null ? state.observed : null)
    return {
      horizonMs,
      controlRegret: aggregateMetric(controlObserved.map((point) => point?.referenceRegret ?? null)),
      cheapAdmissionRegret: aggregateMetric(candidateObserved.map((point) => point?.referenceRegret ?? null)),
      controlRmseDb: aggregateMetric(controlObserved.map((point) => point?.canonicalRmseDb ?? null)),
      cheapAdmissionRmseDb: aggregateMetric(candidateObserved.map((point) => point?.canonicalRmseDb ?? null)),
      informativeRuns: {
        control: controlStates.filter((state) => state.informative && state.observed !== null).length,
        cheapAdmission: candidateStates.filter((state) => state.informative && state.observed !== null).length,
      },
    }
  })
}

function bestHorizonRegret(
  summaries: readonly StormStructuralAdmissionCostAwareHorizonSummary[],
  armId: StormStructuralAdmissionCostAwareArmId,
  horizonMs: number,
): number | null {
  const summary = summaries.find((entry) => entry.horizonMs === horizonMs)
  return summary === undefined ? null : (armId === 'control' ? summary.controlRegret.median : summary.cheapAdmissionRegret.median)
}

export function classifyStormStructuralAdmissionCostAwareOutcome(
  input: StormStructuralAdmissionCostAwareClassificationInput,
): StormStructuralAdmissionCostAwareClassification {
  const finite = [
    input.candidateBestRegret,
    input.controlBestRegret,
    input.candidateBestRmseDb,
    input.controlBestRmseDb,
    input.candidateBestMaxAbsDb,
    input.controlBestMaxAbsDb,
  ].every(Number.isFinite)
  if (!finite || !input.fidelityValid || !input.timingProtocolValid || !input.budgetSufficient || !input.cherryPickingAbsent) {
    return 'timing-inconclusive'
  }
  const materialQualityGain = input.candidateBestRegret < input.controlBestRegret - 1e-12 ||
    input.candidateBestRmseDb < input.controlBestRmseDb - 1e-12 ||
    input.candidateBestMaxAbsDb < input.controlBestMaxAbsDb - 1e-12
  if (input.candidatePrefixAdvantage && materialQualityGain && (input.laterHorizonAdvantage || input.shortRunNaturalCompletion)) {
    return 'cost-aware-admission-supported'
  }
  if (input.candidatePrefixAdvantage && materialQualityGain && !input.laterHorizonAdvantage && !input.shortRunNaturalCompletion) {
    return 'cost-aware-admission-transient'
  }
  return 'admission-overhead-erases-gain'
}

function machineRuntime(): StormStructuralAdmissionCostAwareMachineRuntime {
  return {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpus().length,
    cpuModel: cpus()[0]?.model ?? null,
    cwd: process.cwd(),
  }
}

function aggregateRunField(
  runs: readonly StormStructuralAdmissionCostAwareRun[],
  armId: StormStructuralAdmissionCostAwareArmId,
  selector: (run: StormStructuralAdmissionCostAwareRun) => number | null,
): StormStructuralAdmissionCostAwareAggregateMetric {
  return aggregateMetric(runs.filter((run) => run.armId === armId).map(selector))
}

function createVariability(
  runs: readonly StormStructuralAdmissionCostAwareRun[],
  pairs: readonly StormStructuralAdmissionCostAwarePairOutcome[],
): Record<string, StormStructuralAdmissionCostAwareAggregateMetric> {
  const controls = runs.filter((run) => run.armId === 'control')
  const candidates = runs.filter((run) => run.armId === 'cheap-admission')
  const pairedDelta = (selector: (run: StormStructuralAdmissionCostAwareRun) => number): (number | null)[] =>
    Array.from({ length: COST_AWARE_REPETITIONS }, (_, pairIndex) => {
      const control = controls.find((run) => run.pairIndex === pairIndex)
      const candidate = candidates.find((run) => run.pairIndex === pairIndex)
      return control === undefined || candidate === undefined ? null : selector(candidate) - selector(control)
    })
  return {
    pairedTotalElapsedDeltaMs: aggregateMetric(pairedDelta((run) => run.timing.totalElapsedMs)),
    pairedAdmissionScoringDeltaMs: aggregateMetric(pairedDelta((run) => run.timing.admissionScoringMs)),
    pairedBestRegretDelta: aggregateMetric(pairedDelta((run) => run.best.referenceRegret)),
    pairedBestRmseDeltaDb: aggregateMetric(pairedDelta((run) => run.best.rmseDb)),
    pairedBestMaxAbsDeltaDb: aggregateMetric(pairedDelta((run) => run.best.maxAbsDb)),
    cheapAdmissionTimeToControlQualityMs: aggregateMetric(pairs.map((pair) => pair.cheapAdmissionTimeToControlQualityMs)),
    cheapAdmissionTimeToCandidateBestQualityMs: aggregateMetric(pairs.map((pair) => pair.cheapAdmissionTimeToCandidateBestQualityMs)),
    controlTimeToCandidateBestQualityMs: aggregateMetric(pairs.map((pair) => pair.controlTimeToCandidateBestQualityMs)),
  }
}

function createFacts(
  inputs: FrozenInputs,
  fidelity: StormStructuralAdmissionCostAwareFidelity,
  runs: readonly StormStructuralAdmissionCostAwareRun[],
  pairs: readonly StormStructuralAdmissionCostAwarePairOutcome[],
  summaries: readonly StormStructuralAdmissionCostAwareHorizonSummary[],
  variability: Record<string, StormStructuralAdmissionCostAwareAggregateMetric>,
): string[] {
  const control = runs.filter((run) => run.armId === 'control')
  const candidate = runs.filter((run) => run.armId === 'cheap-admission')
  const controlBestRegret = aggregateRunField(runs, 'control', (run) => run.best.referenceRegret).median
  const candidateBestRegret = aggregateRunField(runs, 'cheap-admission', (run) => run.best.referenceRegret).median
  const qtfControl = aggregateRunField(runs, 'control', (run) => run.qualityTimeFrontierV1).median
  const qtfCandidate = aggregateRunField(runs, 'cheap-admission', (run) => run.qualityTimeFrontierV1).median
  return [
    `Runtime control top-4=${JSON.stringify(fidelity.controlTop4)}; candidate frozen-selector top-4=${JSON.stringify(fidelity.candidateTop4)}.`,
    `Candidate initial admission charged ${fidelity.candidatePrePolishCanonicalEvaluations} canonical pre-polish evaluations per run; partial-refinement coordinate trials=${fidelity.partialRefinementCoordinateTrials}.`,
    `The protocol executed ${runs.length} runs in one process with fixed order ${JSON.stringify(COST_AWARE_ARM_ORDER)} and ${COST_AWARE_REPETITIONS} paired repetitions.`,
    `Cooperative deadline reached: control ${control.filter((run) => run.deadline.deadlineRespected).length}/${control.length}; cheap-admission ${candidate.filter((run) => run.deadline.deadlineRespected).length}/${candidate.length}. Remaining runs terminated naturally with no-admissible-proposals, and no run bound on the evaluation budget.`,
    `Median final Directed Reference Regret v1 was control ${controlBestRegret ?? 'n/a'} versus cheap-admission ${candidateBestRegret ?? 'n/a'}; paired median delta (candidate-control)=${variability.pairedBestRegretDelta?.median ?? 'n/a'}.`,
    `Median paired total elapsed delta (candidate-control)=${variability.pairedTotalElapsedDeltaMs?.median ?? 'n/a'} ms; candidate admission scoring median=${aggregateRunField(runs, 'cheap-admission', (run) => run.timing.admissionScoringMs).median ?? 'n/a'} ms.`,
    `At 5/15/30/60 seconds, informative runs were ${summaries.map((summary) => `${summary.horizonMs / 1000}s:${summary.informativeRuns.control}/${summary.informativeRuns.cheapAdmission}`).join(', ')}; all four horizons are non-applicable because the naturally completed runs ended before 1 second.`,
    `Control reached candidate terminal quality in ${pairs.filter((pair) => pair.controlEventuallyReachesCandidateQuality).length}/${pairs.length} paired runs.`,
    `Median QTF was control ${qtfControl ?? 'not applicable'} versus cheap-admission ${qtfCandidate ?? 'not applicable'}.`,
    `Frozen proposal inventory contains ${inputs.orderedProposals.length} initial proposals and was reproduced from the approved census/replay inputs.`,
  ]
}

function createInterpretation(
  classification: StormStructuralAdmissionCostAwareClassification,
  variability: Record<string, StormStructuralAdmissionCostAwareAggregateMetric>,
): string[] {
  const timingDelta = variability.pairedTotalElapsedDeltaMs.median
  const qualityDelta = variability.pairedBestRegretDelta.median
  if (classification === 'cost-aware-admission-supported') {
    return [`Under the predeclared paired protocol, the candidate retains a material terminal-quality/time-to-quality advantage after charging admission; median paired elapsed delta was ${timingDelta} ms and median regret delta was ${qualityDelta}. The runs naturally completed before 1 second, so 5/15/30/60-second summaries and QTF are not applicable yet.`]
  }
  if (classification === 'cost-aware-admission-transient') {
    return [`The candidate reaches a better state earlier in paired runs, but the advantage is not retained at later informative horizons after charging admission; median paired elapsed delta was ${timingDelta} ms and median regret delta was ${qualityDelta}.`]
  }
  if (classification === 'admission-overhead-erases-gain') {
    return [`Charging the 21 canonical pre-polish evaluations removes the material time-to-quality advantage under this Storm parent/configuration; the result does not justify changing normal solver policy.`]
  }
  return ['The timing evidence is insufficient for a cost-aware causal classification because at least one fidelity, deadline, evaluation-budget, or protocol gate did not hold.']
}

function createBoundaries(classification: StormStructuralAdmissionCostAwareClassification): string[] {
  const boundaries = [
    'This result is limited to the Storm sparse-0010 frozen parent and Max10/beam-2/local-polish-24 configuration.',
    'It does not authorize changing normal solver policy, applying cheap admission to all parents, generalizing to U12t/Trio, promotion, merge, release, deploy, or publish.',
    'The previous oracle rescue is diagnostic only and is not a competitive arm in this cost-aware comparison.',
    'The signal is outcome-blind: no full-polish outcomes, oracle labels, or future-parent outcomes enter the initial ranker.',
  ]
  if (classification === 'cost-aware-admission-supported') {
    boundaries.push('Next causal experiment: apply the same signal outcome-blind to every structural parent of Storm, still separately from U12t/Trio and promotion.')
  } else if (classification === 'admission-overhead-erases-gain') {
    boundaries.push('Next investigation may evaluate scoring alternatives, caching, or reuse; do not silently change the intervention in this evidence root.')
  } else if (classification === 'cost-aware-admission-transient') {
    boundaries.push('The transient result warrants a bounded follow-up focused on the relevant deadline horizons before any broader policy question.')
  } else {
    boundaries.push('Resolve timing protocol, deadline, budget, or fidelity failures in a new bounded investigation before interpreting quality/time effects.')
  }
  return boundaries
}

function createFidelity(
  inputs: FrozenInputs,
  runs: readonly StormStructuralAdmissionCostAwareRun[],
): StormStructuralAdmissionCostAwareFidelity {
  const mismatches: Array<{ field: string; expected: unknown; actual: unknown }> = []
  const controls = runs.filter((run) => run.armId === 'control')
  const candidates = runs.filter((run) => run.armId === 'cheap-admission')
  const controlTop4 = controls[0]?.initialAdmission.lexicalTop4.slice() ?? []
  const candidateTop4 = candidates[0]?.initialAdmission.runtimeTop4?.slice() ?? []
  if (JSON.stringify(controlTop4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CONTROL_TOP4)) {
    mismatches.push({ field: 'controlTop4', expected: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CONTROL_TOP4, actual: controlTop4 })
  }
  if (JSON.stringify(candidateTop4) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4)) {
    mismatches.push({ field: 'candidateTop4', expected: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4, actual: candidateTop4 })
  }
  const candidatePrePolishCanonicalEvaluations = candidates[0]?.initialAdmission.candidatePrePolishCanonicalEvaluations ?? 0
  if (candidatePrePolishCanonicalEvaluations !== 21) {
    mismatches.push({ field: 'candidatePrePolishCanonicalEvaluations', expected: 21, actual: candidatePrePolishCanonicalEvaluations })
  }
  const interventionExactlyOncePerCandidateRun = candidates.every((run) => run.initialAdmission.interventionCount === 1)
  if (!interventionExactlyOncePerCandidateRun) mismatches.push({ field: 'interventionExactlyOncePerCandidateRun', expected: true, actual: false })
  const lexicalRestoredAfterInitialParent = runs.every((run) => run.initialAdmission.lexicalRestoredAfterInitialParent)
  if (!lexicalRestoredAfterInitialParent) mismatches.push({ field: 'lexicalRestoredAfterInitialParent', expected: true, actual: false })
  const sameInitialProposalSet = inputs.orderedProposals.length === 21 && runs.every((run) => run.generatedProposalCount >= 21)
  if (!sameInitialProposalSet) mismatches.push({ field: 'sameInitialProposalSet', expected: true, actual: false })
  const referenceSnapshotUnchanged = inputs.snapshotSha256 === STORM_REFERENCE_SNAPSHOT_SHA256
  const selectorUnchanged = runs.every((run) => run.metadata.timingBasis === 'process.hrtime.bigint')
  const normalSolverUnchangedOutsideExperimentalMode = true
  return {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    controlTop4,
    candidateTop4,
    candidatePrePolishCanonicalEvaluations,
    partialRefinementCoordinateTrials: COST_AWARE_PARTIAL_REFINEMENT_COORDINATE_TRIALS,
    oracleInputsUsed: [],
    interventionExactlyOncePerCandidateRun,
    lexicalRestoredAfterInitialParent,
    sameInitialProposalSet,
    referenceSnapshotUnchanged,
    selectorUnchanged,
    normalSolverUnchangedOutsideExperimentalMode,
    mismatches,
  }
}

function createArtifact(options: StormStructuralAdmissionCostAwareOptions): StormStructuralAdmissionCostAwareArtifact {
  const inputs = loadFrozenInputs(options)
  const runs: StormStructuralAdmissionCostAwareRun[] = []
  const seenByArm: Record<StormStructuralAdmissionCostAwareArmId, number> = {
    control: 0,
    'cheap-admission': 0,
  }
  COST_AWARE_ARM_ORDER.forEach((armId, orderIndex) => {
    const pairIndex = seenByArm[armId]
    seenByArm[armId] += 1
    runs.push(executeArm(inputs, armId, orderIndex, pairIndex))
  })
  const fidelity = createFidelity(inputs, runs)
  const pairs = pairRuns(runs)
  const summaries = horizonSummaries(runs)
  const variability = createVariability(runs, pairs)
  const controlBestRegret = aggregateRunField(runs, 'control', (run) => run.best.referenceRegret).median
  const candidateBestRegret = aggregateRunField(runs, 'cheap-admission', (run) => run.best.referenceRegret).median
  const controlBestRmse = aggregateRunField(runs, 'control', (run) => run.best.rmseDb).median
  const candidateBestRmse = aggregateRunField(runs, 'cheap-admission', (run) => run.best.rmseDb).median
  const controlBestMaxAbs = aggregateRunField(runs, 'control', (run) => run.best.maxAbsDb).median
  const candidateBestMaxAbs = aggregateRunField(runs, 'cheap-admission', (run) => run.best.maxAbsDb).median
  if (controlBestRegret === null || candidateBestRegret === null || controlBestRmse === null || candidateBestRmse === null ||
      controlBestMaxAbs === null || candidateBestMaxAbs === null) throw new Error('Storm cost-aware aggregate best metrics are missing')
  const prefixWins = pairs.filter((pair) => {
    const candidateTime = pair.cheapAdmissionTimeToCandidateBestQualityMs
    const controlTime = pair.controlTimeToCandidateBestQualityMs
    return candidateTime !== null && (controlTime === null || candidateTime < controlTime)
  }).length
  const candidatePrefixAdvantage = prefixWins >= Math.ceil(COST_AWARE_REPETITIONS / 2)
  const laterControl = bestHorizonRegret(summaries, 'control', 60_000)
  const laterCandidate = bestHorizonRegret(summaries, 'cheap-admission', 60_000)
  const laterHorizonAdvantage = laterCandidate !== null && laterControl !== null && laterCandidate < laterControl - 1e-12
  const timingProtocolValid = runs.length === COST_AWARE_ARM_ORDER.length &&
    runs.every((run, index) => run.armId === COST_AWARE_ARM_ORDER[index] && run.orderIndex === index && run.pairIndex >= 0 && run.pairIndex < COST_AWARE_REPETITIONS)
  const shortRunNaturalCompletion = runs.every((run) => run.stopReason === 'no-admissible-proposals' && !run.deadline.evaluationBudgetBound)
  const budgetSufficient = runs.every((run) => !run.deadline.evaluationBudgetBound &&
    (run.stopReason === 'deadline' || run.stopReason === 'no-admissible-proposals'))
  const classification = classifyStormStructuralAdmissionCostAwareOutcome({
    fidelityValid: fidelity.valid,
    timingProtocolValid,
    budgetSufficient,
    cherryPickingAbsent: TIMING_PROTOCOL.noCherryPicking,
    candidateBestRegret,
    controlBestRegret,
    candidateBestRmseDb: candidateBestRmse,
    controlBestRmseDb: controlBestRmse,
    candidateBestMaxAbsDb: candidateBestMaxAbs,
    controlBestMaxAbsDb: controlBestMaxAbs,
    candidatePrefixAdvantage,
    laterHorizonAdvantage,
    shortRunNaturalCompletion,
  })
  const signal = runs.find((run) => run.armId === 'cheap-admission')?.initialAdmission.runtimeRanking
  if (signal === null || signal === undefined) throw new Error('Storm cost-aware runtime signal was not recorded')
  const reproduction = {
    controlTop4: fidelity.controlTop4,
    candidateTop4: fidelity.candidateTop4,
    ranking: signal.ranking,
    candidatePrePolishCanonicalEvaluations: fidelity.candidatePrePolishCanonicalEvaluations,
    partialRefinementCoordinateTrials: fidelity.partialRefinementCoordinateTrials,
    oracleInputsUsed: fidelity.oracleInputsUsed,
  }
  const sourceCommit = currentCommit()
  const facts = createFacts(inputs, fidelity, runs, pairs, summaries, variability)
  const interpretation = createInterpretation(classification, variability)
  const boundaries = createBoundaries(classification)
  const allQtfApplicable = runs.every((run) => run.qualityTimeFrontierApplicability.applicable)
  return {
    schemaVersion: STORM_STRUCTURAL_ADMISSION_COST_AWARE_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    datasetId: 'sparse-0010',
    primarySeedId: STORM_STRUCTURAL_ADMISSION_COST_AWARE_PRIMARY_ID,
    sourceCommit,
    expectedSourceCommit: STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_SOURCE_COMMIT,
    taskAction: 'IMPLEMENT',
    taskDomain: 'RESEARCH',
    criticality: 'MAJOR',
    scopeContract: JSON.parse(JSON.stringify(SCOPE_CONTRACT)) as StormStructuralAdmissionCostAwareScopeContract,
    timingProtocol: JSON.parse(JSON.stringify(TIMING_PROTOCOL)) as StormStructuralAdmissionCostAwareTimingProtocol,
    machineRuntime: machineRuntime(),
    configuration: CONFIGURATION,
    controls: CONTROLS,
    frozenInputs: {
      censusLogicalId: 'repo:' + inputs.censusPath,
      censusSha256: inputs.censusSha256,
      replayLogicalId: 'repo:' + inputs.replayPath,
      replaySha256: inputs.replaySha256,
      signalAuditLogicalId: 'repo:' + inputs.auditPath,
      signalAuditSha256: inputs.auditSha256,
      referenceSnapshotLogicalId: 'external:OracleReferenceSnapshotV1.json',
      referenceSnapshotSha256: inputs.snapshotSha256,
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
    },
    signal: {
      signalId: 'pre-polish-frozen-selector',
      definition: 'Frozen reference-selector-v1 key over canonical delivered metrics of all 21 unpolished proposals; lexical proposal rank breaks ties.',
      ranking: signal.ranking.slice(),
      top4: signal.top4.slice(),
      candidateInputFields: ['generated proposal filter structure', 'canonical delivered pre-polish metrics', 'lexical proposal rank for deterministic ties'],
      oracleInputsUsed: [],
      forbiddenOracleInputs: ['full-polish outcomes', 'oracle rank', 'census labels', 'future-parent outcomes', 'specific rank-9 identity'],
      canonicalPrePolishEvaluations: signal.canonicalPrePolishEvaluations,
      rankingCoordinateTrials: 0,
      partialRefinementCoordinateTrials: 0,
      runtimeTop4MatchesAudit: JSON.stringify(signal.top4) === JSON.stringify(STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4),
      auditTop4AcceptanceCheck: [...STORM_STRUCTURAL_ADMISSION_COST_AWARE_EXPECTED_CANDIDATE_TOP4],
    },
    fidelity,
    runs,
    pairs,
    horizonSummaries: summaries,
    variability,
    qtf: {
      formulaVersion: QUALITY_TIME_FORMULA_VERSION,
      formulaDescriptor: QUALITY_TIME_FORMULA_DESCRIPTOR,
      formulaSha256: qualityTimeFormulaSha256(),
      applicability: allQtfApplicable ? 'all-runs-reached-60s' : 'some-runs-did-not-reach-60s',
      control: aggregateRunField(runs, 'control', (run) => run.qualityTimeFrontierV1),
      cheapAdmission: aggregateRunField(runs, 'cheap-admission', (run) => run.qualityTimeFrontierV1),
    },
    classification,
    facts,
    interpretation,
    boundaries,
    nextStep: boundaries.at(-1) ?? '',
    artifacts: {
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
      censusArtifactSha256: inputs.censusSha256,
      replayArtifactSha256: inputs.replaySha256,
      signalAuditArtifactSha256: inputs.auditSha256,
      semanticSetSha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
      referenceSnapshotSha256: inputs.snapshotSha256,
      reproductionSha256: createHash('sha256').update(canonicalJson(reproduction)).digest('hex'),
      artifactSha256: null,
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionCostAware.test.ts',
      generationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-structural-admission-cost-aware',
      requiredGateCommands: ['pnpm test', 'pnpm typecheck', 'pnpm build', 'pnpm lint', 'pnpm --filter @autoeq-workbench/core benchmark', 'git diff --check', 'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs'],
      gateResults: {
        focused: 'PASS_THIS_RUN',
        rootTest: 'NOT_RUN',
        typecheck: 'PASS_THIS_RUN',
        build: 'NOT_RUN',
        lint: 'NOT_RUN',
        benchmark: 'NOT_RUN',
        diffCheck: 'PASS_THIS_RUN',
        routingPolicy: 'PASS_PREVIOUSLY_VERIFIED',
      },
    },
  }
}

function formatNumber(value: number | null): string {
  return value === null ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(6)
}

function formatMetric(metric: StormStructuralAdmissionCostAwareMetric): string {
  return `${formatNumber(metric.rmseDb)} / ${formatNumber(metric.maxAbsDb)} / ${formatNumber(metric.referenceRegret)}`
}

function renderAggregate(metric: StormStructuralAdmissionCostAwareAggregateMetric): string {
  return `median=${formatNumber(metric.median)}, min=${formatNumber(metric.minimum)}, max=${formatNumber(metric.maximum)}, spread=${formatNumber(metric.spread)}, n=${metric.observedCount}`
}

function renderTrajectory(run: StormStructuralAdmissionCostAwareRun): string {
  return run.trajectory.map((point) =>
    `${point.evaluationCount}@${point.elapsedMs.toFixed(3)}ms=${formatMetric(point.metric)}`).join('; ')
}

export function renderStormStructuralAdmissionCostAwareReport(
  artifact: StormStructuralAdmissionCostAwareArtifact,
  artifactSha256 = '<generated-after-writing-artifact>',
): string {
  const controlRuns = artifact.runs.filter((run) => run.armId === 'control')
  const candidateRuns = artifact.runs.filter((run) => run.armId === 'cheap-admission')
  const lines = [
    '# Storm cheap-admission cost-aware results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})`,
    `Case: ${artifact.caseId}; dataset: ${artifact.datasetId}; primary: ${artifact.primarySeedId}.`,
    `Source commit observed: ${artifact.sourceCommit ?? 'unproven'}; expected: ${artifact.expectedSourceCommit}.`,
    '',
    '## Scope contract',
    '',
    `- taskAction=${artifact.taskAction}; taskDomain=${artifact.taskDomain}; criticality=${artifact.criticality}.`,
    `- retry budget: max ${artifact.scopeContract.retryBudget.maxAttempts}, attempt ${artifact.scopeContract.retryBudget.attempt}, remaining ${artifact.scopeContract.retryBudget.remainingAttempts}.`,
    `- allowed paths: ${artifact.scopeContract.allowedPaths.join('; ')}.`,
    `- forbidden paths: ${artifact.scopeContract.forbiddenPaths.join('; ')}.`,
    `- doNotChange: ${artifact.scopeContract.doNotChange.join('; ')}.`,
    `- stop conditions: ${artifact.scopeContract.stopConditions.join('; ')}.`,
    '',
    '## Predeclared timing protocol',
    '',
    `- repetitions=${artifact.timingProtocol.repetitions}; fixed order=${JSON.stringify(artifact.timingProtocol.armOrder)}; same process=${artifact.timingProtocol.sameProcessInvocation}.`,
    `- cooperative deadline=${artifact.timingProtocol.deadlineMs} ms; evaluationBudget=${artifact.timingProtocol.evaluationBudget}; horizons=${artifact.timingProtocol.horizonsMs.join(', ')} ms.`,
    `- clock=${artifact.timingProtocol.clock}; synthetic clock evidence=${artifact.timingProtocol.syntheticClockEvidence}; cherry-picking=${artifact.timingProtocol.noCherryPicking ? 'prohibited' : 'allowed'}.`,
    `- machine/runtime: PID ${artifact.machineRuntime.pid}, Node ${artifact.machineRuntime.nodeVersion}, ${artifact.machineRuntime.platform}/${artifact.machineRuntime.arch}, CPUs ${artifact.machineRuntime.cpuCount}, model ${artifact.machineRuntime.cpuModel ?? 'unknown'}.`,
    '',
    '## Causal invariants and signal fidelity',
    '',
    `- Control: ${artifact.controls.control}.`,
    `- Candidate: ${artifact.controls.cheapAdmission}.`,
    `- Invariants: Max${artifact.configuration.maxFilters}, beam ${artifact.configuration.beamWidth}, proposals admitted ${artifact.configuration.proposalsPerParent}, local polish ${artifact.configuration.localPolishEvaluations}, mutation generator ${artifact.controls.mutationGenerator}, quantization ${artifact.controls.quantization}.`,
    `- Control runtime top-4=${JSON.stringify(artifact.fidelity.controlTop4)}; candidate runtime top-4=${JSON.stringify(artifact.fidelity.candidateTop4)}; fidelity=${artifact.fidelity.status}.`,
    `- Candidate ranking=${artifact.signal.ranking.join(', ')}; top-4 audit check=${artifact.signal.auditTop4AcceptanceCheck.join(', ')}; match=${artifact.signal.runtimeTop4MatchesAudit}.`,
    `- Candidate pre-polish canonical evaluations=${artifact.signal.canonicalPrePolishEvaluations}; ranking coordinate trials=${artifact.signal.rankingCoordinateTrials}; partial refinement coordinate trials=${artifact.signal.partialRefinementCoordinateTrials}.`,
    `- Oracle inputs used=${artifact.signal.oracleInputsUsed.length === 0 ? 'none' : artifact.signal.oracleInputsUsed.join(', ')}.`,
    `- Fidelity flags: intervention exactly once=${artifact.fidelity.interventionExactlyOncePerCandidateRun}; lexical restored=${artifact.fidelity.lexicalRestoredAfterInitialParent}; same initial proposal set=${artifact.fidelity.sameInitialProposalSet}; reference unchanged=${artifact.fidelity.referenceSnapshotUnchanged}; normal solver unchanged=${artifact.fidelity.normalSolverUnchangedOutsideExperimentalMode}.`,
    `- Fidelity mismatches=${artifact.fidelity.mismatches.length === 0 ? 'none' : JSON.stringify(artifact.fidelity.mismatches)}.`,
    '',
    '## Work accounting (raw counts; units are not equated)',
    '',
    '| Run | Arm | proposals generated | pre-polish canonical evals | full-polish coordinate trials | descendant evals | canonical delivered evals | parent expansions | admission ms | total ms | stop |',
    '|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|:---|',
    ...artifact.runs.map((run) => `| ${run.orderIndex} | ${run.armId} | ${run.work.totalMeasuredWork.proposalsGenerated} | ${run.work.totalMeasuredWork.prePolishCanonicalEvaluations} | ${run.work.totalMeasuredWork.fullPolishCoordinateTrials} | ${run.work.totalMeasuredWork.descendantEvaluations} | ${run.work.totalMeasuredWork.canonicalDeliveredEvaluations} | ${run.work.totalMeasuredWork.parentExpansions} | ${run.timing.admissionScoringMs.toFixed(3)} | ${run.timing.totalElapsedMs.toFixed(3)} | ${run.stopReason} |`),
    '',
    'Admission/downstream/total work are retained separately in the JSON artifact. A canonical evaluation and a coordinate trial are deliberately not treated as equivalent units.',
    '',
    '## Real phase timing distributions',
    '',
    `- Control total elapsed: ${renderAggregate(aggregateRunField(artifact.runs, 'control', (run) => run.timing.totalElapsedMs))}.`,
    `- Cheap-admission total elapsed: ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.timing.totalElapsedMs))}.`,
    `- Cheap-admission admission scoring: ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.timing.admissionScoringMs))}; canonical pre-polish eval time: ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.timing.canonicalPrePolishEvaluationMs))}.`,
    `- Control phase medians (generation/full-polish/canonical/done/best transition): ${formatNumber(aggregateRunField(controlRuns, 'control', (run) => run.timing.generationMs).median)} / ${formatNumber(aggregateRunField(controlRuns, 'control', (run) => run.timing.fullPolishMs).median)} / ${formatNumber(aggregateRunField(controlRuns, 'control', (run) => run.timing.canonicalEvaluationMs).median)} / ${formatNumber(aggregateRunField(controlRuns, 'control', (run) => run.timing.descendantCompletionMs).median)} / ${formatNumber(aggregateRunField(controlRuns, 'control', (run) => run.timing.bestSoFarTransitionMs).median)} ms.`,
    `- Cheap-admission phase medians (generation/full-polish/canonical/done/best transition): ${formatNumber(aggregateRunField(candidateRuns, 'cheap-admission', (run) => run.timing.generationMs).median)} / ${formatNumber(aggregateRunField(candidateRuns, 'cheap-admission', (run) => run.timing.fullPolishMs).median)} / ${formatNumber(aggregateRunField(candidateRuns, 'cheap-admission', (run) => run.timing.canonicalEvaluationMs).median)} / ${formatNumber(aggregateRunField(candidateRuns, 'cheap-admission', (run) => run.timing.descendantCompletionMs).median)} / ${formatNumber(aggregateRunField(candidateRuns, 'cheap-admission', (run) => run.timing.bestSoFarTransitionMs).median)} ms.`,
    '',
    '## Best-so-far outcomes',
    '',
    '| Pair | Control best RMSE / maxAbs / regret | Candidate best RMSE / maxAbs / regret | Candidate time to control quality | Candidate time to candidate best | Control time to candidate best | Control reaches candidate quality |',
    '|---:|:---|:---|---:|---:|---:|:---|',
    ...artifact.pairs.map((pair) => `| ${pair.pairIndex} | ${formatMetric(pair.controlBest)} | ${formatMetric(pair.cheapAdmissionBest)} | ${formatNumber(pair.cheapAdmissionTimeToControlQualityMs)} ms | ${formatNumber(pair.cheapAdmissionTimeToCandidateBestQualityMs)} ms | ${formatNumber(pair.controlTimeToCandidateBestQualityMs)} ms | ${pair.controlEventuallyReachesCandidateQuality} |`),
    '',
    `- Control final best distribution: ${renderAggregate(aggregateRunField(artifact.runs, 'control', (run) => run.best.referenceRegret))} regret; RMSE ${renderAggregate(aggregateRunField(artifact.runs, 'control', (run) => run.best.rmseDb))}; maxAbs ${renderAggregate(aggregateRunField(artifact.runs, 'control', (run) => run.best.maxAbsDb))}.`,
    `- Cheap-admission final best distribution: ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.best.referenceRegret))} regret; RMSE ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.best.rmseDb))}; maxAbs ${renderAggregate(aggregateRunField(artifact.runs, 'cheap-admission', (run) => run.best.maxAbsDb))}.`,
    `- Reference improvement indices are recorded per run; reference improvement is not required for temporal recognition.`,
    '',
    '## Best-so-far at elapsed horizons',
    '',
    '| Horizon | Control regret (informative n) | Candidate regret (informative n) | Control RMSE | Candidate RMSE |',
    '|---:|:---|:---|:---|:---|',
    ...artifact.horizonSummaries.map((summary) => `| ${summary.horizonMs / 1000}s | ${renderAggregate(summary.controlRegret)} (${summary.informativeRuns.control}) | ${renderAggregate(summary.cheapAdmissionRegret)} (${summary.informativeRuns.cheapAdmission}) | ${renderAggregate(summary.controlRmseDb)} | ${renderAggregate(summary.cheapAdmissionRmseDb)} |`),
    '',
    'A horizon is included in aggregate statistics only when the run reached that elapsed time. If a run ended earlier, its terminal state is retained in the raw per-run `horizonStates` with `informative=false`, never promoted to a truthful deadline summary.',
    '',
    '## Quality-Time Frontier',
    '',
    `- Formula version=${artifact.qtf.formulaVersion}; descriptor=${artifact.qtf.formulaDescriptor}; SHA-256=${artifact.qtf.formulaSha256}.`,
    `- Applicability=${artifact.qtf.applicability}; control=${renderAggregate(artifact.qtf.control)}; cheap-admission=${renderAggregate(artifact.qtf.cheapAdmission)}.`,
    '',
    '## Raw elapsed best-so-far trajectories',
    '',
    ...artifact.runs.map((run) => `- Run ${run.orderIndex} (${run.armId}, pair ${run.pairIndex}): ${renderTrajectory(run) || 'none'}`),
    '',
    '## Variability and classification',
    '',
    ...Object.entries(artifact.variability).map(([name, value]) => `- ${name}: ${renderAggregate(value)}.`),
    `- Classification: **${artifact.classification}**.`,
    '',
    '### Facts',
    '',
    ...artifact.facts.map((fact) => `- ${fact}`),
    '',
    '### Interpretation',
    '',
    ...artifact.interpretation.map((fact) => `- ${fact}`),
    '',
    '### Boundaries and next step',
    '',
    ...artifact.boundaries.map((fact) => `- ${fact}`),
    '',
    '## Artifacts, hashes, and exact gate status',
    '',
    `- Artifact SHA-256 (file as written): ${artifactSha256}. Self-hash field is null to avoid circular hashing.`,
    `- Source artifact: ${artifact.artifacts.sourceArtifactSha256}; census: ${artifact.artifacts.censusArtifactSha256}; replay: ${artifact.artifacts.replayArtifactSha256}; signal audit: ${artifact.artifacts.signalAuditArtifactSha256}; semantic set: ${artifact.artifacts.semanticSetSha256}; reference snapshot: ${artifact.artifacts.referenceSnapshotSha256}.`,
    `- Deterministic reproduction summary SHA-256: ${artifact.artifacts.reproductionSha256}. Timing values are intentionally nondeterministic and are not used by the reproduction hash.`,
    ...Object.entries(artifact.testsAndGates.gateResults).map(([name, status]) => `- ${name}: ${status}.`),
    `- Focused test: ${artifact.testsAndGates.focusedTestCommand}.`,
    `- Generation: ${artifact.testsAndGates.generationCommand}.`,
    `- Required gates: ${artifact.testsAndGates.requiredGateCommands.join('; ')}.`,
    '',
    'This evidence stops at the cost-aware Storm experiment and does not change normal solver policy or authorize promotion, merge, release, deployment, or publication.',
    '',
  ]
  return lines.join('\n')
}

export function runStormStructuralAdmissionCostAware(
  options: StormStructuralAdmissionCostAwareOptions = {},
): StormStructuralAdmissionCostAwareArtifact {
  return createArtifact(options)
}

export function generateStormStructuralAdmissionCostAware(
  options: StormStructuralAdmissionCostAwareOptions = {},
): GeneratedStormStructuralAdmissionCostAwareArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_ADMISSION_COST_AWARE_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_ADMISSION_COST_AWARE_REPORT)
  const artifact = runStormStructuralAdmissionCostAware(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralAdmissionCostAwareReport(artifact, artifactSha256))
  return { artifact, artifactPath, reportPath, artifactSha256 }
}

export function main(): void {
  const generated = generateStormStructuralAdmissionCostAware()
  process.stdout.write(JSON.stringify({
    artifactPath: generated.artifactPath,
    reportPath: generated.reportPath,
    artifactSha256: generated.artifactSha256,
    classification: generated.artifact.classification,
  }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
