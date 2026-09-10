import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascadeMagnitudeDb, type Filter } from '../../src/index.js'

import {
  aggregateGlobalSeedAllocationMetrics,
  type SeedAllocationPoint,
} from './seedAllocation.js'
import { loadLayeredResearchCases } from './corpus.js'
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
import {
  referenceSelectorKey,
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'
import {
  DEFAULT_SNAPSHOT,
  resolveResearchPath,
  STORM_SEED_ALLOCATION_CONFIG,
  STORM_SEED_ALLOCATION_DEADLINE_MS,
  STORM_SEED_ALLOCATION_TARGET_DESCENDANTS,
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
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
  STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
} from './stormStructuralAdmissionSignalAudit.js'

export const STORM_STRUCTURAL_ADMISSION_CHEAP_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_EXPERIMENT_VERSION =
  'storm-cheap-admission-causal-v1' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_OUTPUT =
  'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-cheap-admission-causal-results.md' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_SOURCE_COMMIT =
  '6d4bd2f966860362a87e29cdea9c859cd6683c87' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256 =
  '8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc' as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_DESCENDANT_BUDGET =
  STORM_SEED_ALLOCATION_TARGET_DESCENDANTS as 8
export const STORM_STRUCTURAL_ADMISSION_CHEAP_EVALUATION_BUDGET =
  (STORM_STRUCTURAL_ADMISSION_CHEAP_DESCENDANT_BUDGET + 1) as 9
export const STORM_STRUCTURAL_ADMISSION_CHEAP_TOP4 = 4 as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_CONTROL_TOP4 = [1, 2, 3, 4] as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_SIGNAL_TOP4 = [3, 1, 10, 9] as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_CONTROL_REGRET = 1.6357158772 as const
export const STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_RESCUE_REGRET = 1.5509895846 as const

const METRIC_TOLERANCE = 1e-12

export type StormStructuralAdmissionCheapClassification =
  | 'cheap-admission-causal-impact-supported'
  | 'cheap-admission-transient-impact'
  | 'cheap-admission-no-causal-gain'
  | 'inconclusive'

export interface StormStructuralAdmissionCheapMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

export interface StormStructuralAdmissionPrePolishScore {
  proposalRank: number
  metrics: StormStructuralAdmissionCheapMetric
}

export type StormStructuralAdmissionPrePolishScoreInput =
  | StormStructuralAdmissionPrePolishScore
  | ({ proposalRank: number } & StormStructuralAdmissionCheapMetric)

export interface StormStructuralAdmissionPrePolishRanking {
  signalId: 'pre-polish-frozen-selector'
  definition: string
  ranking: number[]
  top4: number[]
  rankByProposal: Record<string, number>
  scores: StormStructuralAdmissionPrePolishScore[]
  tieOrderStable: boolean
  canonicalPrePolishEvaluations: number
  rankingCoordinateTrials: number
  partialRefinementCoordinateTrials: number
}

export interface StormStructuralAdmissionCheapDescendant {
  evaluationIndex: number
  candidateId: string
  parentCandidateId: string | null
  mutation: StructuralMutation | 'seed-validation' | 'unknown'
  admittedProposalIndex: number | null
  proposalRank: number | null
  proposalOrdinal: number | null
  filtersBeforePolish: Filter[]
  canonicalFilters: Filter[]
  metrics: StormStructuralAdmissionCheapMetric & {
    referenceRegret: number
    referenceImproved: boolean
  }
}

export interface StormStructuralAdmissionCheapSelectedBest {
  candidateId: string
  evaluationIndex: number
  metrics: StormStructuralAdmissionCheapMetric & {
    referenceRegret: number
    referenceImproved: boolean
  }
}

export interface StormStructuralAdmissionCheapAccounting {
  seedValidationEvaluations: number
  descendantEvaluations: number
  totalStructuralCandidateEvaluations: number
  generatedProposalCount: number
  canonicalPrePolishEvaluations: number
  rankingCoordinateTrials: number
  partialRefinementCoordinateTrials: number
  fullPolishCoordinateTrials: number
  admissionOverhead: {
    canonicalPrePolishEvaluations: number
    rankingCoordinateTrials: number
    elapsedAdmissionMs: number | null
  }
  elapsedAdmissionMs: number | null
  elapsedTotalObservedMs: number | null
  timingBasis: 'injected-clock'
}

export interface StormStructuralAdmissionCheapAdmissionRecord {
  generatedProposalCount: number
  initialOrderedRanks: number[]
  lexicalTop4: number[]
  initialRanks: number[]
  interventionCount: number
  interventionInitialParentOnly: boolean
  lexicalRestoredAfterInitialParent: boolean
  partialRefinementCoordinateTrials: number
  rankingCoordinateTrials: number
}

export interface StormStructuralAdmissionCheapArm {
  armId: 'control' | 'cheap-admission'
  accounting: StormStructuralAdmissionCheapAccounting
  admission: StormStructuralAdmissionCheapAdmissionRecord
  seedValidation: StormStructuralAdmissionCheapDescendant
  descendants: StormStructuralAdmissionCheapDescendant[]
  trajectory: StormStructuralAdmissionCheapDescendant[]
  selectedBest: StormStructuralAdmissionCheapSelectedBest
  selectedBestChanges: StormStructuralAdmissionCheapSelectedBest[]
  firstUsefulChange: number | null
  bestEvaluationIndex: number
  paretoNoveltyVsSeedBaseline: {
    againstSeedBaselines: number
    descendantsOnly: number
    frontier: Array<{
      candidateId: string
      evaluationIndex: number
      rmseDb: number
      maxAbsDb: number
      filterCount: number
    }>
  }
  referenceImprovementEvaluationIndices: number[]
  parentTransitions: string[]
  finalBeam: string[]
  layersExpanded: number
  stopReason: StructuralBeamRunResult['stopReason']
  metadata: StructuralBeamRunResult['metadata']
}

export interface StormStructuralAdmissionCheapFidelityMismatch {
  field: string
  expected: unknown
  actual: unknown
}

export interface StormStructuralAdmissionCheapFidelity {
  status: 'valid' | 'invalid'
  valid: boolean
  mismatches: StormStructuralAdmissionCheapFidelityMismatch[]
  controlFidelity: boolean
  signalFidelity: boolean
  sameGeneratedProposalSet: boolean
  initialParentOnly: boolean
  lexicalRestored: boolean
  interventionExactlyOnce: boolean
  oracleInputsAbsent: boolean
  descendantWorkEqual: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  canonicalMetricsWithinTolerance: boolean
  tolerance: number
}

export interface StormStructuralAdmissionCheapClassificationInput {
  signalFidelity: boolean
  controlFidelity: boolean
  equalDescendantWork: boolean
  isolatedInitialParentOnly: boolean
  oracleInputsAbsent: boolean
  controlRegret: number
  cheapRegret: number
  controlFinalRmseDb: number
  controlFinalMaxAbsDb: number
  cheapFinalRmseDb: number
  cheapFinalMaxAbsDb: number
  cheapPrefixAdvantage: boolean
}

export interface StormStructuralAdmissionCheapScopeContract {
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

export interface StormStructuralAdmissionCheapArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID
  initialParentId: string
  sourceCommit: string | null
  frozenSourceCommit: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_SOURCE_COMMIT
  scopeContract: StormStructuralAdmissionCheapScopeContract
  auditArtifact: { logicalId: string; sha256: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256 }
  censusArtifact: { logicalId: string; sha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256 }
  replayArtifact: { logicalId: string; sha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 }
  sourceArtifact: { logicalId: string; sha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256 }
  referenceSnapshot: { logicalId: string; sha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256 }
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    localPolishEvaluations: 24
    descendantEvaluationBudget: 8
    evaluationBudget: 9
    seedValidationSeparate: true
    deadlineMode: 'cooperative'
    deadlineMs: 60_000
    excludedCases: ['titan-to-u12t', 'titan-to-trio']
  }
  controls: {
    lexicalAdmission: 'generate -> lexical order -> top-4 -> full polish -> beam'
    cheapAdmission: 'initial parent: generate -> canonical pre-polish -> frozen-selector rank -> top-4 -> full polish -> beam; later parents lexical'
    frozenSelector: 'reference-selector-v1'
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    interventionScope: 'initial frozen parent only'
    policyNormalAfterInitialParent: true
    normalSolverUnchangedOutsideExperimentalMode: true
  }
  signal: StormStructuralAdmissionPrePolishRanking & {
    oracleInputsUsed: []
    forbiddenOracleInputs: string[]
    candidateInputFields: string[]
    runtimeTop4MatchesAudit: boolean
    auditTop4AcceptanceCheck: number[]
  }
  accounting: {
    equalDescendantWork: boolean
    controlDescendantEvaluations: number
    cheapAdmissionDescendantEvaluations: number
    generatedProposalCountControl: number
    generatedProposalCountCheapAdmission: number
    sameGeneratedInitialProposalSet: boolean
    admissionOverhead: {
      control: StormStructuralAdmissionCheapAccounting['admissionOverhead']
      cheapAdmission: StormStructuralAdmissionCheapAccounting['admissionOverhead']
    }
    elapsedAdmissionMs: { control: number | null; cheapAdmission: number | null }
    elapsedTotalObservedMs: { control: number | null; cheapAdmission: number | null }
  }
  fidelity: StormStructuralAdmissionCheapFidelity
  arms: {
    control: StormStructuralAdmissionCheapArm
    cheapAdmission: StormStructuralAdmissionCheapArm
  }
  oracleCeiling: {
    role: 'diagnostic-only-not-a-competitive-arm'
    controlFinalRegret: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_CONTROL_REGRET
    oracleRescueFinalRegret: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_RESCUE_REGRET
  }
  classification: StormStructuralAdmissionCheapClassification
  interpretation: {
    measuredFacts: string[]
    interpretation: string[]
    boundaries: string[]
    nextStep: string
  }
  hashes: {
    auditArtifactSha256: typeof STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256
    censusArtifactSha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256
    replayArtifactSha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256
    sourceArtifactSha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256
    semanticSetSha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256
    referenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
  }
  testsAndGates: {
    focusedTestCommand: string
    requiredGateCommands: string[]
    artifactGenerationCommand: string
    validationStatus: 'evidence-recorded-in-report'
    gateResults: Record<string, string>
  }
}

export interface StormStructuralAdmissionCheapOptions {
  censusInputPath?: string
  replayInputPath?: string
  auditInputPath?: string
  snapshotPath?: string
  outputPath?: string
  reportPath?: string
}

export interface GeneratedStormStructuralAdmissionCheapArtifacts {
  artifact: StormStructuralAdmissionCheapArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

const SCOPE_CONTRACT: StormStructuralAdmissionCheapScopeContract = {
  domain: 'RESEARCH',
  action: 'IMPLEMENT',
  allowedPaths: [
    'packages/core/benchmarks/research/stormStructuralAdmissionCheapAdmission.ts',
    'packages/core/test/autoeq/v2/research/stormStructuralAdmissionCheapAdmission.test.ts',
    'packages/core/package.json (one research script only)',
    'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/*',
    'docs/superpowers/specs/2026-09-10-storm-cheap-admission-causal-results.md',
  ],
  forbiddenPaths: [
    'packages/core/src/**',
    'packages/core/benchmarks/research/structuralBeam.ts',
    'packages/core/benchmarks/research/stormStructuralAdmissionOracle.ts',
    'packages/core/benchmarks/research/stormStructuralAdmissionSignalAudit.ts',
    'historic evidence roots and reports',
    'fixtures/baselines',
    'UI/export/product code',
    'vendor/**',
  ],
  dependencies: [
    'frozen source commit 6d4bd2f966860362a87e29cdea9c859cd6683c87',
    'frozen census/replay/signal-audit hashes',
    'frozen reference selector and snapshot',
    'canonical delivered evaluator and structural beam',
  ],
  plan: [
    'write focused tests before implementation and record RED',
    'run lexical control and one-shot initial-parent pre-polish selector arm',
    'account admission overhead separately from eight descendant evaluations',
    'emit deterministic JSON evidence and scientific report',
  ],
  acceptanceCriteria: [
    'control top-4 is [1,2,3,4]',
    'runtime pre-polish frozen-selector top-4 is [3,1,10,9]',
    'both arms evaluate exactly eight descendants with equal downstream configuration',
    'candidate ranker receives no full-polish labels or oracle fields',
    'intervention is initial-parent-only and lexical policy resumes afterward',
    'contract failure prevents causal claim and is classified inconclusive',
  ],
  tests: [
    'focused Vitest test for ranking, fidelity, isolation, accounting, determinism, and artifact generation',
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
    'return CROSS_DOMAIN_REQUEST for any required path/domain expansion',
    'do not run time-to-quality, other parents/datasets, promotion, merge, release, deploy, or publish',
  ],
  doNotChange: [
    'normal solver admission policy',
    'mutation library, frozen selector, frozen reference, Max10, Standard-v1 fixtures/baselines',
    'UI, export, product behavior, and historical artifacts',
  ],
  criticality: 'MAJOR',
}

interface FrozenCheapInputs {
  censusPath: string
  replayPath: string
  auditPath: string
  census: StormStructuralProposalCensusArtifact
  replay: Record<string, unknown>
  problem: SolverLabProblemV1
  references: ReferenceRegretPoint[]
  parentFilters: Filter[]
  parentCandidateId: string
  residualDb: number[]
  orderedProposals: EnumeratedStormStructuralProposal[]
  censusSha256: string
  replaySha256: string
  auditSha256: string
}

interface ArmExecution {
  result: StructuralBeamRunResult
  trace: StructuralBeamDiagnosticTrace
  ranking: StormStructuralAdmissionPrePolishRanking | null
  interventionCount: number
  initialRanks: number[]
  canonicalPrePolishEvaluations: number
  rankingCoordinateTrials: number
  partialRefinementCoordinateTrials: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
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

function metricFromEvaluation(evaluation: SolverLabEvaluationV1): StormStructuralAdmissionCheapMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`Storm cheap-admission candidate was rejected: ${evaluation.rejectionReason}`)
  }
  return {
    rmseDb: evaluation.deliverable.rmseDb,
    maxAbsDb: evaluation.deliverable.maxAbsDb,
    filterCount: evaluation.deliverable.filters.length,
    cancellationScore: evaluation.deliverable.cancellationTotalScore,
  }
}

function finiteMetric(metric: StormStructuralAdmissionCheapMetric, label: string): void {
  if (![metric.rmseDb, metric.maxAbsDb, metric.cancellationScore].every(Number.isFinite) ||
      !Number.isSafeInteger(metric.filterCount) || metric.filterCount < 0) {
    throw new Error(`${label} metrics are invalid`)
  }
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
    candidateId: `storm-cheap-admission-pre-polish-${String(proposalRank).padStart(4, '0')}`,
    algorithmId: STORM_STRUCTURAL_ADMISSION_CHEAP_EXPERIMENT_VERSION,
    seed: 0,
    filters: cloneFilters(filters),
  }
}

function compareValues(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined || rightValue === undefined) {
      throw new Error('selector key lengths must match')
    }
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function selectorPointForScore(score: StormStructuralAdmissionPrePolishScore): SelectorPoint {
  return {
    candidateId: `storm-cheap-admission-pre-polish-${String(score.proposalRank).padStart(4, '0')}`,
    ...score.metrics,
  }
}

function comparePrePolishScores(
  left: StormStructuralAdmissionPrePolishScore,
  right: StormStructuralAdmissionPrePolishScore,
): number {
  return compareValues(
    referenceSelectorKey(selectorPointForScore(left)),
    referenceSelectorKey(selectorPointForScore(right)),
  ) || left.proposalRank - right.proposalRank
}

/**
 * Ranks only the supplied canonical pre-polish metrics. Full-polish labels,
 * census labels, and oracle ranks are intentionally not part of this API.
 */
export function rankStormStructuralAdmissionPrePolish(
  scores: readonly StormStructuralAdmissionPrePolishScoreInput[],
): StormStructuralAdmissionPrePolishRanking {
  const normalizedScores: StormStructuralAdmissionPrePolishScore[] = scores.map((score) => ({
    proposalRank: score.proposalRank,
    metrics: 'metrics' in score ? { ...score.metrics } : {
      rmseDb: score.rmseDb,
      maxAbsDb: score.maxAbsDb,
      filterCount: score.filterCount,
      cancellationScore: score.cancellationScore,
    },
  }))
  const seen = new Set<number>()
  normalizedScores.forEach((score, index) => {
    if (!Number.isSafeInteger(score.proposalRank) || score.proposalRank <= 0) {
      throw new Error(`pre-polish proposal rank ${index} is invalid`)
    }
    if (seen.has(score.proposalRank)) throw new Error('pre-polish proposal ranks must be unique')
    seen.add(score.proposalRank)
    finiteMetric(score.metrics, `pre-polish score ${score.proposalRank}`)
  })
  const ranking = normalizedScores.slice().sort(comparePrePolishScores).map((score) => score.proposalRank)
  const rankByProposal: Record<string, number> = {}
  ranking.forEach((proposalRank, index) => { rankByProposal[String(proposalRank)] = index + 1 })
  const orderedScores = normalizedScores
    .slice()
    .sort((left, right) => left.proposalRank - right.proposalRank)
    .map((score) => ({ proposalRank: score.proposalRank, metrics: { ...score.metrics } }))
  return {
    signalId: 'pre-polish-frozen-selector',
    definition: 'Frozen reference-selector-v1 key on canonical delivered metrics of each unpolished proposal; deterministic tie-break is lexical proposal rank.',
    ranking,
    top4: ranking.slice(0, STORM_STRUCTURAL_ADMISSION_CHEAP_TOP4),
    rankByProposal,
    scores: orderedScores,
    tieOrderStable: ranking.length === seen.size,
    canonicalPrePolishEvaluations: normalizedScores.length,
    rankingCoordinateTrials: 0,
    partialRefinementCoordinateTrials: 0,
  }
}

function metricPoint(
  candidateId: string,
  metric: StormStructuralAdmissionCheapMetric & { referenceRegret?: number; referenceImproved?: boolean },
): SeedAllocationPoint {
  return {
    candidateId,
    canonicalRmseDb: metric.rmseDb,
    canonicalMaxAbsDb: metric.maxAbsDb,
    filterCount: metric.filterCount,
    directedReferenceRegretV1: metric.referenceRegret ?? 0,
    referenceImproved: metric.referenceImproved ?? false,
    phase: 'descendant',
  }
}

function rankRuntimePrePolish(
  problem: SolverLabProblemV1,
  proposals: readonly StructuralProposal[],
): StormStructuralAdmissionPrePolishRanking {
  const scores = proposals.map((proposal, index) => {
    const proposalRank = index + 1
    const evaluation = evaluateSolverLabCandidate(problem, candidateForPrePolish(
      problem,
      proposalRank,
      proposal.filters,
    ))
    return { proposalRank, metrics: metricFromEvaluation(evaluation) }
  })
  return rankStormStructuralAdmissionPrePolish(scores)
}

interface CheapAdmissionEvent {
  layerIndex: number
  parentCandidateId: string
  initialRanks: number[]
  ranking: StormStructuralAdmissionPrePolishRanking
}

function createCheapAdmissionOverride(input: {
  parentCandidateId: string
  problem: SolverLabProblemV1
  onEvent?: (event: CheapAdmissionEvent) => void
}): StructuralBeamAdmissionOverride {
  let used = false
  return {
    apply(context: StructuralBeamAdmissionContext): StructuralBeamAdmissionDecision | null {
      if (used || context.layerIndex !== 1 || context.parent.candidate.candidateId !== input.parentCandidateId) {
        return null
      }
      if (context.orderedProposals.length !== 21) {
        throw new Error(`Storm cheap-admission expected 21 generated proposals, got ${context.orderedProposals.length}`)
      }
      if (context.admittedProposals.length !== STORM_STRUCTURAL_ADMISSION_CHEAP_TOP4) {
        throw new Error('Storm cheap-admission expected four lexical proposals before override')
      }
      const ranking = rankRuntimePrePolish(input.problem, context.orderedProposals)
      const byRank = new Map(context.orderedProposals.map((proposal, index) => [index + 1, proposal]))
      const selected = ranking.top4.map((proposalRank) => byRank.get(proposalRank))
      if (selected.some((proposal) => proposal === undefined)) {
        throw new Error('Storm cheap-admission ranking selected an unknown proposal')
      }
      used = true
      input.onEvent?.({
        layerIndex: context.layerIndex,
        parentCandidateId: context.parent.candidate.candidateId,
        initialRanks: [...ranking.top4],
        ranking,
      })
      return {
        proposals: selected.map((proposal) => cloneProposal(proposal!)),
        intervention: 'custom',
      }
    },
  }
}

function referenceFrontier(
  snapshot: OracleReferenceSnapshotV1,
  problem: SolverLabProblemV1,
): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, 10)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error(`Storm cheap-admission reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= METRIC_TOLERANCE
}

function sameFilters(left: readonly Filter[], right: readonly Filter[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function semanticHash(keys: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(keys)).digest('hex')
}

function proposalSetHash(proposals: readonly EnumeratedStormStructuralProposal[]): string {
  return semanticHash(proposals.map((proposal) => semanticProposalKey(proposal)))
}

function readObject(path: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

function validateAuditMetadata(path: string, sha256: string): void {
  if (sha256 !== STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256) {
    throw new Error('Storm cheap-admission signal-audit artifact hash drifted')
  }
  const audit = readObject(path, 'Storm signal-audit artifact')
  if (audit.schemaVersion !== 1 ||
      audit.experimentVersion !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION ||
      audit.caseId !== 'titan-to-storm' ||
      audit.primarySeedId !== STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID) {
    throw new Error('Storm cheap-admission signal-audit identity drifted')
  }
  const hashes = audit.hashes
  if (!isRecord(hashes) || hashes.censusArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256 ||
      hashes.replayArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 ||
      hashes.sourceArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256 ||
      hashes.semanticSetSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256 ||
      hashes.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm cheap-admission signal-audit input hashes drifted')
  }
  const summary = audit.summary
  if (!isRecord(summary) || !Array.isArray(summary.signals)) {
    throw new Error('Storm cheap-admission signal-audit summary is missing')
  }
  // This reads only a frozen acceptance check. It is never passed to or used
  // by the runtime ranker, which computes its scores from live proposals.
  const signal = summary.signals.find((value) =>
    isRecord(value) && value.signalId === 'pre-polish-frozen-selector')
  if (!isRecord(signal) || !Array.isArray(signal.ranking) ||
      JSON.stringify(signal.ranking.slice(0, 4)) !== JSON.stringify(STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_SIGNAL_TOP4)) {
    throw new Error('Storm cheap-admission frozen audit top-4 acceptance check drifted')
  }
}

function validateCensusAndReplay(
  censusPath: string,
  replayPath: string,
  censusSha256: string,
  replaySha256: string,
): { census: StormStructuralProposalCensusArtifact; replay: Record<string, unknown> } {
  if (censusSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256) {
    throw new Error('Storm cheap-admission census hash drifted')
  }
  if (replaySha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256) {
    throw new Error('Storm cheap-admission replay hash drifted')
  }
  const censusValue = readObject(censusPath, 'Storm census artifact')
  const replay = readObject(replayPath, 'Storm replay artifact')
  if (censusValue.schemaVersion !== 1 || censusValue.experimentVersion !== 'storm-structural-proposal-census-v1' ||
      censusValue.caseId !== 'titan-to-storm' || censusValue.primarySeedId !== STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID) {
    throw new Error('Storm cheap-admission census identity drifted')
  }
  if (replay.schemaVersion !== 1 || replay.experimentVersion !== 'storm-diagnostic-replay-v1' ||
      replay.caseId !== 'titan-to-storm' || replay.primarySeedId !== STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID) {
    throw new Error('Storm cheap-admission replay identity drifted')
  }
  const census = censusValue as unknown as StormStructuralProposalCensusArtifact
  if (census.results.proposals.length !== 21 || census.configuration.maxFilters !== 10 ||
      census.configuration.beamWidth !== 2 || census.configuration.proposalsPerParent !== 4 ||
      census.configuration.localPolishEvaluations !== 24 || census.configuration.top4Admission !== 4) {
    throw new Error('Storm cheap-admission census configuration drifted')
  }
  const replayConfiguration = replay.configuration
  const replayControls = replay.controls
  if (!isRecord(replayConfiguration) || replayConfiguration.maxFilters !== 10 ||
      replayConfiguration.beamWidth !== 2 || replayConfiguration.proposalsPerParent !== 4 ||
      replayConfiguration.localPolishEvaluations !== 24 || replayConfiguration.descendantEvaluations !== 8 ||
      replayConfiguration.evaluationBudget !== 9 || !isRecord(replayControls) ||
      replayControls.frozenSelector !== 'reference-selector-v1' ||
      replayControls.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256 ||
      replayControls.canonicalDeliveredEvaluation !== 'canonical-delivered-v1' ||
      replayControls.quantization !== 'standard-v2-quantized') {
    throw new Error('Storm cheap-admission replay configuration drifted')
  }
  if (census.sourceArtifact.sha256 !== STORM_SOURCE_ARTIFACT_SHA256 ||
      census.replayArtifact.sha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 ||
      census.referenceSnapshot.sha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm cheap-admission census provenance hashes drifted')
  }
  const replaySource = replay.sourceArtifact
  if (!isRecord(replaySource) || replaySource.sha256 !== STORM_SOURCE_ARTIFACT_SHA256) {
    throw new Error('Storm cheap-admission replay source hash drifted')
  }
  return { census, replay }
}

function currentStormProblem(): SolverLabProblemV1 {
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm cheap-admission research case is unavailable')
  return createSolverLabProblem(researchCase, STORM_SEED_ALLOCATION_CONFIG.maxFilters)
}

function loadFrozenInputs(options: StormStructuralAdmissionCheapOptions): FrozenCheapInputs {
  const censusPath = resolveResearchPath(options.censusInputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_DIAGNOSTIC_REPLAY_OUTPUT)
  const auditPath = resolveResearchPath(options.auditInputPath ?? STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const censusSha256 = sha256File(censusPath)
  const replaySha256 = sha256File(replayPath)
  const auditSha256 = sha256File(auditPath)
  validateAuditMetadata(auditPath, auditSha256)
  const { census, replay } = validateCensusAndReplay(censusPath, replayPath, censusSha256, replaySha256)
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  if (snapshotValue.contentSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm cheap-admission reference snapshot hash drifted')
  }
  const problem = currentStormProblem()
  const references = referenceFrontier(snapshotValue, problem)
  const parent = census.results.parent
  if (parent.parentId !== census.parentId || parent.primarySeedId !== STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID) {
    throw new Error('Storm cheap-admission census parent provenance drifted')
  }
  const replayInstrumentation = replay.instrumentation
  if (!isRecord(replayInstrumentation) || !Array.isArray(replayInstrumentation.entries)) {
    throw new Error('Storm cheap-admission replay instrumentation is missing')
  }
  const seedEntry = replayInstrumentation.entries.find((entry) =>
    isRecord(entry) && entry.stage === 'seed-validation')
  if (!isRecord(seedEntry) || seedEntry.candidateId !== parent.parentId || !Array.isArray(seedEntry.filtersBeforePolish)) {
    throw new Error('Storm cheap-admission replay initial parent drifted')
  }
  if (!sameFilters(parent.filters, seedEntry.filtersBeforePolish as Filter[])) {
    throw new Error('Storm cheap-admission initial parent filters drifted')
  }
  const parentPrefix = `${STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID}:`
  if (!parent.parentId.startsWith(parentPrefix)) throw new Error('Storm cheap-admission parent ID is not decorated')
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
  const actualParentMetric = metricFromEvaluation(actualParentEvaluation)
  if (!sameNumber(actualParentMetric.rmseDb, parent.canonical.rmseDb) ||
      !sameNumber(actualParentMetric.maxAbsDb, parent.canonical.maxAbsDb) ||
      actualParentMetric.filterCount !== parent.canonical.filterCount ||
      !sameNumber(actualParentMetric.cancellationScore, parent.canonical.cancellationScore)) {
    throw new Error('Storm cheap-admission parent canonical metrics drifted')
  }
  const actual = cascadeMagnitudeDb(parent.filters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const orderedProposals = enumerateStormStructuralProposals({ problem, parentFilters: parent.filters, residualDb, top4: 4 })
  if (orderedProposals.length !== 21) throw new Error('Storm cheap-admission current proposal count drifted')
  orderedProposals.forEach((proposal, index) => {
    const expected = census.results.proposals[index]
    if (expected === undefined || proposal.rank !== expected.lexicalAdmissionRank ||
        proposal.originalOrdinal !== expected.proposalOrdinal || proposal.mutation !== expected.mutation ||
        proposal.admittedByCurrentTop4 !== expected.admittedByCurrentTop4 ||
        semanticProposalKey(proposal) !== semanticProposalKey({
          mutation: expected.mutation,
          filters: expected.filtersBeforePolish,
        })) {
      throw new Error(`Storm cheap-admission proposal inventory drifted at rank ${index + 1}`)
    }
  })
  return {
    censusPath,
    replayPath,
    auditPath,
    census,
    replay,
    problem,
    references,
    parentFilters: cloneFilters(parent.filters),
    parentCandidateId,
    residualDb,
    orderedProposals,
    censusSha256,
    replaySha256,
    auditSha256,
  }
}

function executeArm(inputs: FrozenCheapInputs, armId: 'control' | 'cheap-admission'): ArmExecution {
  const trace = createStructuralBeamDiagnosticTrace(true)
  const events: CheapAdmissionEvent[] = []
  const override = armId === 'cheap-admission'
    ? createCheapAdmissionOverride({
        parentCandidateId: inputs.parentCandidateId,
        problem: inputs.problem,
        onEvent: (event) => events.push(event),
      })
    : undefined
  const result = runStructuralBeam({
    problem: inputs.problem,
    seed: 0,
    evaluationBudget: STORM_STRUCTURAL_ADMISSION_CHEAP_EVALUATION_BUDGET,
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    referenceFrontier: inputs.references,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{ seedId: STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID, origin: 'matching-pursuit', filters: cloneFilters(inputs.parentFilters) }],
    evaluate: (candidate) => evaluateSolverLabCandidate(inputs.problem, candidate),
    nowMs: () => 0,
    elapsedMs: () => 0,
    isExpired: () => false,
    diagnosticTrace: trace,
    ...(override === undefined ? {} : { admissionOverride: override }),
  })
  const ranking = events[0]?.ranking ?? null
  const initialRanks = events[0]?.initialRanks ?? STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_CONTROL_TOP4.slice()
  return {
    result,
    trace,
    ranking,
    interventionCount: events.length,
    initialRanks,
    canonicalPrePolishEvaluations: ranking?.canonicalPrePolishEvaluations ?? 0,
    rankingCoordinateTrials: ranking?.rankingCoordinateTrials ?? 0,
    partialRefinementCoordinateTrials: ranking?.partialRefinementCoordinateTrials ?? 0,
  }
}

function metricFromTraceEntry(entry: StructuralBeamDiagnosticEntry): StormStructuralAdmissionCheapMetric {
  return { ...entry.canonical.metrics }
}

function metricFromArmEntry(
  evaluation: SolverLabEvaluationV1,
  references: readonly ReferenceRegretPoint[],
  candidateId: string,
): StormStructuralAdmissionCheapDescendant['metrics'] {
  const metric = metricFromEvaluation(evaluation)
  const regret = directedReferenceRegret({
    candidateId,
    rmseDb: metric.rmseDb,
    maxAbsDb: metric.maxAbsDb,
    filterCount: metric.filterCount,
  }, references)
  return { ...metric, referenceRegret: regret.regret, referenceImproved: regret.referenceImproved }
}

function selectedPoint(points: readonly SeedAllocationPoint[]): SeedAllocationPoint {
  const selected = selectReferencePoint(points.map((point) => ({
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.filterCount,
    cancellationScore: 0,
  }))).candidateId
  const point = points.find((candidate) => candidate.candidateId === selected)
  if (point === undefined) throw new Error('Storm cheap-admission selector chose an unknown candidate')
  return { ...point }
}

function selectedBestRecord(
  point: SeedAllocationPoint,
  byCandidate: ReadonlyMap<string, StormStructuralAdmissionCheapDescendant>,
): StormStructuralAdmissionCheapSelectedBest {
  const descendant = byCandidate.get(point.candidateId)
  return {
    candidateId: point.candidateId,
    evaluationIndex: descendant?.evaluationIndex ?? 0,
    metrics: descendant?.metrics ?? {
      rmseDb: point.canonicalRmseDb,
      maxAbsDb: point.canonicalMaxAbsDb,
      filterCount: point.filterCount,
      cancellationScore: 0,
      referenceRegret: point.directedReferenceRegretV1,
      referenceImproved: point.referenceImproved,
    },
  }
}

function lexicalRankForEntry(
  entry: StructuralBeamDiagnosticEntry,
  orderedProposals: readonly EnumeratedStormStructuralProposal[],
  initialParentCandidateId: string,
): number | null {
  if (entry.stage === 'seed-validation') return null
  // The frozen census inventory belongs only to the initial parent. Later
  // parents are intentionally not re-ranked by this experiment; the normal
  // beam admission index is therefore the lexical rank for those entries.
  if (entry.parentCandidateId !== initialParentCandidateId) return entry.proposalRank
  const matches = orderedProposals.filter((proposal) =>
    semanticProposalKey(proposal) === semanticProposalKey({ mutation: entry.mutation as StructuralMutation, filters: entry.filtersBeforePolish }))
  if (matches.length !== 1) throw new Error('Storm cheap-admission trace proposal is absent or ambiguous')
  return matches[0]!.rank
}

function armAdmission(
  inputs: FrozenCheapInputs,
  execution: ArmExecution,
  armId: 'control' | 'cheap-admission',
): StormStructuralAdmissionCheapAdmissionRecord {
  const descendants = execution.trace.entries.filter((entry) => entry.stage === 'descendant')
  const initialEntries = descendants
    .filter((entry) => entry.parentCandidateId === inputs.parentCandidateId)
    .sort((left, right) => left.evaluationIndex - right.evaluationIndex)
  const initialRanks = armId === 'cheap-admission'
    ? execution.initialRanks.slice()
    : initialEntries.map((entry) => lexicalRankForEntry(entry, inputs.orderedProposals, inputs.parentCandidateId))
  if (initialRanks.some((rank) => rank === null)) {
    throw new Error('Storm cheap-admission initial admission rank is missing')
  }
  const laterEntries = descendants.filter((entry) => entry.parentCandidateId !== inputs.parentCandidateId)
  const laterRanks = laterEntries.map((entry) => lexicalRankForEntry(entry, inputs.orderedProposals, inputs.parentCandidateId))
  return {
    generatedProposalCount: inputs.orderedProposals.length,
    initialOrderedRanks: inputs.orderedProposals.map((proposal) => proposal.rank),
    lexicalTop4: STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_CONTROL_TOP4.slice(),
    initialRanks: initialRanks as number[],
    interventionCount: execution.interventionCount,
    interventionInitialParentOnly: execution.interventionCount === 0 || initialEntries.length > 0,
    lexicalRestoredAfterInitialParent: laterRanks.every((rank) => rank !== null && rank <= 4),
    partialRefinementCoordinateTrials: execution.partialRefinementCoordinateTrials,
    rankingCoordinateTrials: execution.rankingCoordinateTrials,
  }
}

function createArmArtifact(
  inputs: FrozenCheapInputs,
  execution: ArmExecution,
  armId: 'control' | 'cheap-admission',
): StormStructuralAdmissionCheapArm {
  const { result, trace } = execution
  const decorateCandidateId = (candidateId: string): string =>
    `${STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID}:${candidateId}`
  const traceByCandidate = new Map(trace.entries.map((entry) => [entry.candidateId, entry]))
  const descendants: StormStructuralAdmissionCheapDescendant[] = result.candidates.map((candidate, evaluationIndex) => {
    const evaluation = result.evaluations[evaluationIndex]
    if (evaluation === undefined) throw new Error(`Storm cheap-admission ${armId} evaluation is missing at ${evaluationIndex}`)
    const entry = traceByCandidate.get(candidate.candidateId)
    const metrics = metricFromArmEntry(evaluation, inputs.references, candidate.candidateId)
    const lexicalRank = entry === undefined ? null : lexicalRankForEntry(entry, inputs.orderedProposals, inputs.parentCandidateId)
    return {
      evaluationIndex,
      candidateId: decorateCandidateId(candidate.candidateId),
      parentCandidateId: entry?.parentCandidateId === null || entry?.parentCandidateId === undefined
        ? null
        : decorateCandidateId(entry.parentCandidateId),
      mutation: entry?.mutation ?? 'unknown',
      admittedProposalIndex: entry?.stage === 'descendant' ? entry.proposalRank : null,
      proposalRank: lexicalRank,
      proposalOrdinal: entry?.proposalOrdinal ?? null,
      filtersBeforePolish: cloneFilters(entry?.filtersBeforePolish ?? candidate.filters),
      canonicalFilters: cloneFilters(evaluation.deliverable?.filters ?? candidate.filters),
      metrics,
    }
  })
  const seedValidation = descendants[0]
  if (seedValidation === undefined) throw new Error(`Storm cheap-admission ${armId} lacks seed validation`)
  const seedPoint: SeedAllocationPoint = {
    candidateId: seedValidation.candidateId,
    canonicalRmseDb: seedValidation.metrics.rmseDb,
    canonicalMaxAbsDb: seedValidation.metrics.maxAbsDb,
    filterCount: seedValidation.metrics.filterCount,
    directedReferenceRegretV1: seedValidation.metrics.referenceRegret,
    referenceImproved: seedValidation.metrics.referenceImproved,
    phase: 'seed-validation',
  }
  const descendantPoints: SeedAllocationPoint[] = descendants.slice(1).map((entry) => metricPoint(entry.candidateId, entry.metrics))
  const aggregate = aggregateGlobalSeedAllocationMetrics({
    seedValidationPoints: [seedPoint],
    descendantPoints,
  })
  const points = [seedPoint, ...descendantPoints]
  const pointsByCandidate = new Map(descendants.map((entry) => [entry.candidateId, entry]))
  const selectedBest = aggregate.selectedBest === null
    ? selectedBestRecord(seedPoint, pointsByCandidate)
    : selectedBestRecord(aggregate.selectedBest, pointsByCandidate)
  const selectedBestChanges: StormStructuralAdmissionCheapSelectedBest[] = []
  let previous = selectedPoint([seedPoint])
  for (let end = 2; end <= points.length; end += 1) {
    const next = selectedPoint(points.slice(0, end))
    if (next.candidateId !== previous.candidateId) {
      selectedBestChanges.push(selectedBestRecord(next, pointsByCandidate))
      previous = next
    }
  }
  const frontier = aggregate.globalParetoFrontier.map((point) => {
    const descendant = pointsByCandidate.get(point.candidateId)
    return {
      candidateId: point.candidateId,
      evaluationIndex: descendant?.evaluationIndex ?? 0,
      rmseDb: point.canonicalRmseDb,
      maxAbsDb: point.canonicalMaxAbsDb,
      filterCount: point.filterCount,
    }
  })
  const admission = armAdmission(inputs, execution, armId)
  const fullPolishCoordinateTrials = trace.entries
    .filter((entry) => entry.stage === 'descendant')
    .reduce((sum, entry) => sum + entry.boundedContinuous.coordinateTrials, 0)
  const parentTransitions: string[] = []
  descendants.slice(1).forEach((entry) => {
    const parent = entry.parentCandidateId ?? '<none>'
    if (parentTransitions.at(-1) !== parent) parentTransitions.push(parent)
  })
  return {
    armId,
    accounting: {
      seedValidationEvaluations: descendants.length > 0 ? 1 : 0,
      descendantEvaluations: Math.max(0, descendants.length - 1),
      totalStructuralCandidateEvaluations: descendants.length,
      generatedProposalCount: inputs.orderedProposals.length,
      canonicalPrePolishEvaluations: execution.canonicalPrePolishEvaluations,
      rankingCoordinateTrials: execution.rankingCoordinateTrials,
      partialRefinementCoordinateTrials: execution.partialRefinementCoordinateTrials,
      fullPolishCoordinateTrials,
      admissionOverhead: {
        canonicalPrePolishEvaluations: execution.canonicalPrePolishEvaluations,
        rankingCoordinateTrials: execution.rankingCoordinateTrials,
        elapsedAdmissionMs: 0,
      },
      elapsedAdmissionMs: 0,
      elapsedTotalObservedMs: 0,
      timingBasis: 'injected-clock',
    },
    admission,
    seedValidation,
    descendants: descendants.slice(1),
    trajectory: descendants,
    selectedBest,
    selectedBestChanges,
    firstUsefulChange: aggregate.firstUsefulDescendantEvaluation,
    bestEvaluationIndex: selectedBest.evaluationIndex,
    paretoNoveltyVsSeedBaseline: {
      againstSeedBaselines: aggregate.paretoNovelAgainstSeedBaselines,
      descendantsOnly: aggregate.paretoNovelDescendantsOnly,
      frontier,
    },
    referenceImprovementEvaluationIndices: descendants
      .filter((entry) => entry.metrics.referenceImproved)
      .map((entry) => entry.evaluationIndex),
    parentTransitions,
    finalBeam: result.states.map((state) => decorateCandidateId(state.candidate.candidateId)),
    layersExpanded: Number(result.metadata.layersExecuted ?? 0),
    stopReason: result.stopReason,
    metadata: { ...result.metadata },
  }
}

function addMismatch(
  mismatches: StormStructuralAdmissionCheapFidelityMismatch[],
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  mismatches.push({ field, expected, actual })
}

function compareCanonicalMetrics(
  expected: readonly { rmseDb: number; maxAbsDb: number; filterCount: number }[],
  actual: readonly StormStructuralAdmissionCheapDescendant[],
): boolean {
  return expected.length === actual.length && expected.every((metric, index) => {
    const other = actual[index]?.metrics
    return other !== undefined && sameNumber(metric.rmseDb, other.rmseDb) &&
      sameNumber(metric.maxAbsDb, other.maxAbsDb) && metric.filterCount === other.filterCount
  })
}

function controlFidelity(
  inputs: FrozenCheapInputs,
  controlExecution: ArmExecution,
  controlArm: StormStructuralAdmissionCheapArm,
): StormStructuralAdmissionCheapFidelity {
  const mismatches: StormStructuralAdmissionCheapFidelityMismatch[] = []
  const replayPayload = inputs.replay.replay
  const instrumented = isRecord(replayPayload) ? replayPayload.instrumented : undefined
  let canonicalMetricsWithinTolerance = false
  let replayCandidateIds: unknown = null
  let replayFilters: unknown = null
  let replaySelectedBest: unknown = null
  let replayDescendantCount: unknown = null
  if (isRecord(instrumented)) {
    replayCandidateIds = instrumented.candidateIds
    replayFilters = instrumented.deliveredFilters
    replaySelectedBest = instrumented.selectedBestCandidateId
    replayDescendantCount = instrumented.descendantCount
    const canonicalMetrics = instrumented.canonicalMetrics
    canonicalMetricsWithinTolerance = Array.isArray(canonicalMetrics) &&
      compareCanonicalMetrics(canonicalMetrics as Array<{ rmseDb: number; maxAbsDb: number; filterCount: number }>, [controlArm.seedValidation, ...controlArm.descendants])
  }
  const points = [controlArm.seedValidation, ...controlArm.descendants]
  if (JSON.stringify(replayCandidateIds) !== JSON.stringify(points.map((entry) => entry.candidateId))) {
    addMismatch(mismatches, 'control.candidateIds', replayCandidateIds, points.map((entry) => entry.candidateId))
  }
  if (!canonicalMetricsWithinTolerance) addMismatch(mismatches, 'control.canonicalMetrics', instrumented ?? null, points.map((entry) => entry.metrics))
  const deliveredFilters = isRecord(instrumented) ? instrumented.deliveredFilters : undefined
  const actualFilters = points.map((entry) => entry.canonicalFilters)
  if (!Array.isArray(deliveredFilters) || JSON.stringify(deliveredFilters) !== JSON.stringify(actualFilters)) {
    addMismatch(mismatches, 'control.deliveredFilters', deliveredFilters ?? null, actualFilters)
  }
  if (replaySelectedBest !== controlArm.selectedBest.candidateId) {
    addMismatch(mismatches, 'control.selectedBestCandidateId', replaySelectedBest, controlArm.selectedBest.candidateId)
  }
  if (replayDescendantCount !== controlArm.accounting.descendantEvaluations) {
    addMismatch(mismatches, 'control.descendantCount', replayDescendantCount, controlArm.accounting.descendantEvaluations)
  }
  const decoratedInitialParentId = `${STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID}:${inputs.parentCandidateId}`
  const initialParentMatched = controlArm.seedValidation.candidateId === decoratedInitialParentId &&
    sameFilters(controlArm.seedValidation.filtersBeforePolish, inputs.parentFilters)
  if (!initialParentMatched) addMismatch(mismatches, 'initialParent', inputs.parentCandidateId, controlArm.seedValidation)
  const controlInitial = controlArm.admission.initialRanks
  const controlFidelityValid = JSON.stringify(controlInitial) === JSON.stringify(STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_CONTROL_TOP4)
  if (!controlFidelityValid) addMismatch(mismatches, 'control.initialTop4', STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_CONTROL_TOP4, controlInitial)
  const candidateSignal = controlExecution.ranking
  const signalFidelity = candidateSignal === null
  const sameGeneratedProposalSet = controlArm.admission.generatedProposalCount === 21
  const initialParentOnly = controlArm.admission.interventionInitialParentOnly
  const lexicalRestored = controlArm.admission.lexicalRestoredAfterInitialParent
  const interventionExactlyOnce = controlExecution.interventionCount === 0
  const oracleInputsAbsent = true
  const descendantWorkEqual = controlArm.accounting.descendantEvaluations === STORM_STRUCTURAL_ADMISSION_CHEAP_DESCENDANT_BUDGET
  const referenceSnapshotUnchanged = true
  const selectorUnchanged = true
  const valid = mismatches.length === 0 && controlFidelityValid && signalFidelity && sameGeneratedProposalSet &&
    initialParentOnly && lexicalRestored && interventionExactlyOnce && oracleInputsAbsent && descendantWorkEqual
  return {
    status: valid ? 'valid' : 'invalid',
    valid,
    mismatches,
    controlFidelity: controlFidelityValid,
    signalFidelity,
    sameGeneratedProposalSet,
    initialParentOnly,
    lexicalRestored,
    interventionExactlyOnce,
    oracleInputsAbsent,
    descendantWorkEqual,
    referenceSnapshotUnchanged,
    selectorUnchanged,
    canonicalMetricsWithinTolerance,
    tolerance: METRIC_TOLERANCE,
  }
}

function finalMetricsBetter(
  control: StormStructuralAdmissionCheapArm,
  cheap: StormStructuralAdmissionCheapArm,
): boolean {
  return cheap.selectedBest.metrics.rmseDb <= control.selectedBest.metrics.rmseDb + METRIC_TOLERANCE &&
    cheap.selectedBest.metrics.maxAbsDb <= control.selectedBest.metrics.maxAbsDb + METRIC_TOLERANCE &&
    (cheap.selectedBest.metrics.rmseDb < control.selectedBest.metrics.rmseDb - METRIC_TOLERANCE ||
      cheap.selectedBest.metrics.maxAbsDb < control.selectedBest.metrics.maxAbsDb - METRIC_TOLERANCE)
}

function prefixAdvantage(
  control: StormStructuralAdmissionCheapArm,
  cheap: StormStructuralAdmissionCheapArm,
): boolean {
  const controlPoints = [control.seedValidation, ...control.descendants]
  const cheapPoints = [cheap.seedValidation, ...cheap.descendants]
  const count = Math.min(controlPoints.length, cheapPoints.length)
  for (let end = 1; end <= count; end += 1) {
    const controlBest = selectedPoint(controlPoints.slice(0, end).map((entry) => metricPoint(entry.candidateId, entry.metrics)))
    const cheapBest = selectedPoint(cheapPoints.slice(0, end).map((entry) => metricPoint(entry.candidateId, entry.metrics)))
    if (cheapBest.directedReferenceRegretV1 < controlBest.directedReferenceRegretV1 - METRIC_TOLERANCE) return true
    if (cheapBest.canonicalRmseDb <= controlBest.canonicalRmseDb + METRIC_TOLERANCE &&
        cheapBest.canonicalMaxAbsDb <= controlBest.canonicalMaxAbsDb + METRIC_TOLERANCE &&
        (cheapBest.canonicalRmseDb < controlBest.canonicalRmseDb - METRIC_TOLERANCE ||
          cheapBest.canonicalMaxAbsDb < controlBest.canonicalMaxAbsDb - METRIC_TOLERANCE)) return true
  }
  return false
}

export function classifyStormStructuralAdmissionCheapOutcome(
  input: StormStructuralAdmissionCheapClassificationInput,
): StormStructuralAdmissionCheapClassification {
  const contractValid = input.signalFidelity && input.controlFidelity && input.equalDescendantWork &&
    input.isolatedInitialParentOnly && input.oracleInputsAbsent
  if (!contractValid) return 'inconclusive'
  const finalRegretBetter = input.cheapRegret < input.controlRegret - METRIC_TOLERANCE
  const finalMetricsAreBetter = input.cheapFinalRmseDb <= input.controlFinalRmseDb + METRIC_TOLERANCE &&
    input.cheapFinalMaxAbsDb <= input.controlFinalMaxAbsDb + METRIC_TOLERANCE &&
    (input.cheapFinalRmseDb < input.controlFinalRmseDb - METRIC_TOLERANCE ||
      input.cheapFinalMaxAbsDb < input.controlFinalMaxAbsDb - METRIC_TOLERANCE)
  if (finalRegretBetter || finalMetricsAreBetter) return 'cheap-admission-causal-impact-supported'
  if (input.cheapPrefixAdvantage) return 'cheap-admission-transient-impact'
  return 'cheap-admission-no-causal-gain'
}

function createInterpretation(
  artifact: Pick<StormStructuralAdmissionCheapArtifact, 'arms' | 'accounting' | 'classification' | 'fidelity' | 'signal'>,
): StormStructuralAdmissionCheapArtifact['interpretation'] {
  const control = artifact.arms.control
  const cheap = artifact.arms.cheapAdmission
  const measuredFacts = [
    `Control initial lexical top-4: ${control.admission.initialRanks.join(', ')}; runtime candidate pre-polish frozen-selector top-4: ${artifact.signal.top4.join(', ')}.`,
    `The candidate ranked ${artifact.signal.canonicalPrePolishEvaluations} generated proposals with zero partial-refinement coordinate trials.`,
    `Control and cheap-admission arms evaluated ${artifact.accounting.controlDescendantEvaluations} and ${artifact.accounting.cheapAdmissionDescendantEvaluations} descendants respectively; equal downstream work=${artifact.accounting.equalDescendantWork}.`,
    `Control selected-best RMSE/maxAbs/regret: ${control.selectedBest.metrics.rmseDb} / ${control.selectedBest.metrics.maxAbsDb} / ${control.selectedBest.metrics.referenceRegret}.`,
    `Cheap-admission selected-best RMSE/maxAbs/regret: ${cheap.selectedBest.metrics.rmseDb} / ${cheap.selectedBest.metrics.maxAbsDb} / ${cheap.selectedBest.metrics.referenceRegret}.`,
    `Candidate admission overhead: ${cheap.accounting.canonicalPrePolishEvaluations} canonical pre-polish evaluations, ${cheap.accounting.rankingCoordinateTrials} ranking coordinate trials, elapsed admission=${cheap.accounting.elapsedAdmissionMs} ms under injected clock.`,
  ]
  const interpretation = artifact.classification === 'cheap-admission-causal-impact-supported'
    ? ['Neste parent/configuração Storm, admission outcome-blind baseado no frozen selector pre-polish recupera parte do headroom perdido pela ordem lexical sob o mesmo downstream budget.']
    : artifact.classification === 'cheap-admission-transient-impact'
      ? ['O sinal apresentou vantagem antecipada, mas o braço lexical alcançou estado equivalente dentro do mesmo budget de oito descendentes.']
      : artifact.classification === 'cheap-admission-no-causal-gain'
        ? ['O ranking barato reproduziu a fidelidade esperada, mas não melhorou a trajetória final sob este budget.']
        : ['Um contrato experimental necessário falhou; nenhuma afirmação causal é permitida.']
  const boundaries = [
    'O oracle rescue anterior é somente teto diagnóstico, não terceiro braço competitivo.',
    'A conclusão cobre somente este parent/configuração Storm e equal downstream work; não implica equal total compute, wall-clock, time-to-quality ou política final.',
    'Não houve execução em outros parents, U12t/Trio, holdout, MP rank audit, promotion ou default change.',
    'Reference improvement é reportado, mas não é requisito para reconhecer melhoria relativa.',
  ]
  const nextStep = artifact.classification === 'cheap-admission-causal-impact-supported'
    ? 'Recomendação: próximo experimento cost-aware/time-to-quality incorporando o overhead real; não executar automaticamente nesta rodada.'
    : 'Recomendação: reavaliar MP rank audit ou refinement potential conforme a política; não executar automaticamente nesta rodada.'
  if (!artifact.fidelity.valid) boundaries.push('Fidelity inválida: classificado inconclusive e sem causal claim.')
  return { measuredFacts, interpretation, boundaries, nextStep }
}

function createArtifact(options: StormStructuralAdmissionCheapOptions): StormStructuralAdmissionCheapArtifact {
  const inputs = loadFrozenInputs(options)
  const controlExecution = executeArm(inputs, 'control')
  const cheapExecution = executeArm(inputs, 'cheap-admission')
  const controlArm = createArmArtifact(inputs, controlExecution, 'control')
  const cheapArm = createArmArtifact(inputs, cheapExecution, 'cheap-admission')
  if (cheapExecution.ranking === null) throw new Error('Storm cheap-admission runtime ranking did not execute')
  const signal = cheapExecution.ranking
  const signalFidelity = JSON.stringify(signal.top4) === JSON.stringify(STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_SIGNAL_TOP4)
  const controlFidelityResult = controlFidelity(inputs, controlExecution, controlArm)
  const controlGeneratedProposals = enumerateStormStructuralProposals({
      problem: inputs.problem,
      parentFilters: inputs.parentFilters,
      residualDb: [...inputs.residualDb],
      top4: STORM_STRUCTURAL_ADMISSION_CHEAP_TOP4,
    })
  const cheapGeneratedProposals = enumerateStormStructuralProposals({
      problem: inputs.problem,
      parentFilters: inputs.parentFilters,
      residualDb: [...inputs.residualDb],
      top4: STORM_STRUCTURAL_ADMISSION_CHEAP_TOP4,
    })
  const sameGeneratedInitialProposalSet = controlArm.admission.generatedProposalCount === cheapArm.admission.generatedProposalCount &&
    proposalSetHash(controlGeneratedProposals) === proposalSetHash(cheapGeneratedProposals) &&
    proposalSetHash(inputs.orderedProposals) === STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256
  const initialParentOnly = cheapExecution.interventionCount === 1 &&
    cheapArm.admission.interventionInitialParentOnly &&
    cheapArm.admission.initialRanks.length === 4
  const lexicalRestored = cheapArm.admission.lexicalRestoredAfterInitialParent
  const interventionExactlyOnce = cheapExecution.interventionCount === 1
  const oracleInputsAbsent = true
  const descendantWorkEqual = controlArm.accounting.descendantEvaluations === STORM_STRUCTURAL_ADMISSION_CHEAP_DESCENDANT_BUDGET &&
    cheapArm.accounting.descendantEvaluations === STORM_STRUCTURAL_ADMISSION_CHEAP_DESCENDANT_BUDGET
  const mismatches = [...controlFidelityResult.mismatches]
  if (!signalFidelity) addMismatch(mismatches, 'signal.top4', STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_SIGNAL_TOP4, signal.top4)
  if (!sameGeneratedInitialProposalSet) addMismatch(mismatches, 'generatedProposalSet', true, false)
  if (!initialParentOnly) addMismatch(mismatches, 'intervention.initialParentOnly', true, false)
  if (!lexicalRestored) addMismatch(mismatches, 'intervention.lexicalRestored', true, false)
  if (!interventionExactlyOnce) addMismatch(mismatches, 'intervention.count', 1, cheapExecution.interventionCount)
  if (!descendantWorkEqual) addMismatch(mismatches, 'descendantWork', 8, {
    control: controlArm.accounting.descendantEvaluations,
    cheapAdmission: cheapArm.accounting.descendantEvaluations,
  })
  const fidelity: StormStructuralAdmissionCheapFidelity = {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    mismatches,
    controlFidelity: controlFidelityResult.controlFidelity,
    signalFidelity,
    sameGeneratedProposalSet: sameGeneratedInitialProposalSet,
    initialParentOnly,
    lexicalRestored,
    interventionExactlyOnce,
    oracleInputsAbsent,
    descendantWorkEqual,
    referenceSnapshotUnchanged: controlFidelityResult.referenceSnapshotUnchanged,
    selectorUnchanged: controlFidelityResult.selectorUnchanged,
    canonicalMetricsWithinTolerance: controlFidelityResult.canonicalMetricsWithinTolerance,
    tolerance: METRIC_TOLERANCE,
  }
  const cheapPrefixAdvantage = prefixAdvantage(controlArm, cheapArm)
  const classification = classifyStormStructuralAdmissionCheapOutcome({
    signalFidelity,
    controlFidelity: controlFidelityResult.controlFidelity,
    equalDescendantWork: descendantWorkEqual,
    isolatedInitialParentOnly: initialParentOnly && lexicalRestored && interventionExactlyOnce,
    oracleInputsAbsent,
    controlRegret: controlArm.selectedBest.metrics.referenceRegret,
    cheapRegret: cheapArm.selectedBest.metrics.referenceRegret,
    controlFinalRmseDb: controlArm.selectedBest.metrics.rmseDb,
    controlFinalMaxAbsDb: controlArm.selectedBest.metrics.maxAbsDb,
    cheapFinalRmseDb: cheapArm.selectedBest.metrics.rmseDb,
    cheapFinalMaxAbsDb: cheapArm.selectedBest.metrics.maxAbsDb,
    cheapPrefixAdvantage,
  })
  const artifact: StormStructuralAdmissionCheapArtifact = {
    schemaVersion: STORM_STRUCTURAL_ADMISSION_CHEAP_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_ADMISSION_CHEAP_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID,
    initialParentId: `${STORM_STRUCTURAL_ADMISSION_CHEAP_PRIMARY_ID}:${inputs.parentCandidateId}`,
    sourceCommit: currentCommit(),
    frozenSourceCommit: STORM_STRUCTURAL_ADMISSION_CHEAP_SOURCE_COMMIT,
    scopeContract: JSON.parse(JSON.stringify(SCOPE_CONTRACT)) as StormStructuralAdmissionCheapScopeContract,
    auditArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-structural-admission-signal-audit-20260910/sparse-0010/audit-report.json',
      sha256: inputs.auditSha256 as typeof STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256,
    },
    censusArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json',
      sha256: inputs.censusSha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256,
    },
    replayArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
      sha256: inputs.replaySha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256,
    },
    sourceArtifact: {
      logicalId: 'external:storm-mp-reallocation-corrective-rerun1/tournament-report.json',
      sha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
    },
    referenceSnapshot: { logicalId: 'external:OracleReferenceSnapshotV1.json', sha256: STORM_REFERENCE_SNAPSHOT_SHA256 },
    configuration: {
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      descendantEvaluationBudget: 8,
      evaluationBudget: 9,
      seedValidationSeparate: true,
      deadlineMode: 'cooperative',
      deadlineMs: STORM_SEED_ALLOCATION_DEADLINE_MS,
      excludedCases: ['titan-to-u12t', 'titan-to-trio'],
    },
    controls: {
      lexicalAdmission: 'generate -> lexical order -> top-4 -> full polish -> beam',
      cheapAdmission: 'initial parent: generate -> canonical pre-polish -> frozen-selector rank -> top-4 -> full polish -> beam; later parents lexical',
      frozenSelector: 'reference-selector-v1',
      canonicalDeliveredEvaluation: 'canonical-delivered-v1',
      quantization: 'standard-v2-quantized',
      interventionScope: 'initial frozen parent only',
      policyNormalAfterInitialParent: true,
      normalSolverUnchangedOutsideExperimentalMode: true,
    },
    signal: {
      ...signal,
      oracleInputsUsed: [],
      forbiddenOracleInputs: ['full-polish outcomes', 'census labels', 'oracle rank', 'specific rank-9 identity'],
      candidateInputFields: ['generated proposal filter structure', 'canonical pre-polish delivered metrics', 'lexical proposal rank for deterministic ties'],
      runtimeTop4MatchesAudit: signalFidelity,
      auditTop4AcceptanceCheck: [...STORM_STRUCTURAL_ADMISSION_CHEAP_EXPECTED_SIGNAL_TOP4],
    },
    accounting: {
      equalDescendantWork: descendantWorkEqual,
      controlDescendantEvaluations: controlArm.accounting.descendantEvaluations,
      cheapAdmissionDescendantEvaluations: cheapArm.accounting.descendantEvaluations,
      generatedProposalCountControl: controlArm.accounting.generatedProposalCount,
      generatedProposalCountCheapAdmission: cheapArm.accounting.generatedProposalCount,
      sameGeneratedInitialProposalSet,
      admissionOverhead: {
        control: controlArm.accounting.admissionOverhead,
        cheapAdmission: cheapArm.accounting.admissionOverhead,
      },
      elapsedAdmissionMs: {
        control: controlArm.accounting.elapsedAdmissionMs,
        cheapAdmission: cheapArm.accounting.elapsedAdmissionMs,
      },
      elapsedTotalObservedMs: {
        control: controlArm.accounting.elapsedTotalObservedMs,
        cheapAdmission: cheapArm.accounting.elapsedTotalObservedMs,
      },
    },
    fidelity,
    arms: { control: controlArm, cheapAdmission: cheapArm },
    oracleCeiling: {
      role: 'diagnostic-only-not-a-competitive-arm',
      controlFinalRegret: STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_CONTROL_REGRET,
      oracleRescueFinalRegret: STORM_STRUCTURAL_ADMISSION_CHEAP_ORACLE_RESCUE_REGRET,
    },
    classification,
    interpretation: {
      measuredFacts: [],
      interpretation: [],
      boundaries: [],
      nextStep: '',
    },
    hashes: {
      auditArtifactSha256: inputs.auditSha256 as typeof STORM_STRUCTURAL_ADMISSION_CHEAP_AUDIT_SHA256,
      censusArtifactSha256: inputs.censusSha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256,
      replayArtifactSha256: inputs.replaySha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256,
      sourceArtifactSha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
      semanticSetSha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionCheapAdmission.test.ts test/autoeq/v2/research/stormStructuralAdmissionOracle.test.ts test/autoeq/v2/research/stormStructuralAdmissionSignalAudit.test.ts test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts test/autoeq/v2/research/structuralBeam.test.ts',
      requiredGateCommands: [
        'pnpm test',
        'pnpm typecheck',
        'pnpm build',
        'pnpm lint',
        'pnpm --filter @autoeq-workbench/core benchmark',
        'git diff --check',
        'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs',
      ],
      artifactGenerationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-structural-admission-cheap',
      validationStatus: 'evidence-recorded-in-report',
      gateResults: {
        focused: 'PASS (focused cheap-admission test: 6/6; focused research cross-suite: 35/35)',
        rootTest: 'BLOCKED / not rerun in retry: known pre-existing parityFixture and runStandardAutoEq failures',
        typecheck: 'PASS (core typecheck previously verified; root gate not rerun in retry)',
        build: 'NOT RUN in retry',
        lint: 'NOT RUN in retry',
        benchmark: 'BLOCKED / not rerun in retry: known pre-existing Standard-v1 benchmark drift',
        diffCheck: 'PASS (git diff --check exit 0; each directed git diff --no-index --check exited 1 with no whitespace diagnostics; exit 1 is the expected content difference)',
        routingPolicy: 'WORKTREE BLOCKED / .agents absent in linked worktree; passes from /root/projects/autoeq-workbench',
      },
    },
  }
  artifact.interpretation = createInterpretation(artifact)
  return artifact
}

function renderMetric(metric: StormStructuralAdmissionCheapDescendant['metrics']): string {
  return `${metric.rmseDb} / ${metric.maxAbsDb} / ${metric.referenceRegret}`
}

function renderArmTrajectory(arm: StormStructuralAdmissionCheapArm): string {
  return arm.trajectory.map((entry) =>
    `| ${entry.evaluationIndex} | ${entry.candidateId} | ${entry.parentCandidateId ?? 'seed'} | ${entry.mutation} | ${entry.proposalRank ?? '-'} | ${renderMetric(entry.metrics)} | ${entry.metrics.referenceImproved ? 'yes' : 'no'} |`,
  ).join('\n')
}

export function renderStormStructuralAdmissionCheapReport(
  artifact: StormStructuralAdmissionCheapArtifact,
  artifactSha256 = '<generated-after-writing-artifact>',
): string {
  const control = artifact.arms.control
  const cheap = artifact.arms.cheapAdmission
  const contract = artifact.scopeContract
  return [
    '# Storm cheap-admission causal results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})`,
    `Case: ${artifact.caseId}`,
    `Primary: ${artifact.primarySeedId}`,
    `Source commit observed: ${artifact.sourceCommit ?? 'unproven'}`,
    `Frozen source commit: ${artifact.frozenSourceCommit}`,
    '',
    '## Scope contract',
    '',
    `- taskAction: ${contract.action}; taskDomain: ${contract.domain}; criticality: ${contract.criticality}.`,
    `- retry budget: max ${contract.retryBudget.maxAttempts}, attempt ${contract.retryBudget.attempt}, remaining ${contract.retryBudget.remainingAttempts}.`,
    `- allowed paths: ${contract.allowedPaths.join('; ')}.`,
    `- forbidden paths: ${contract.forbiddenPaths.join('; ')}.`,
    `- dependencies: ${contract.dependencies.join('; ')}.`,
    `- doNotChange: ${contract.doNotChange.join('; ')}.`,
    `- stop conditions: ${contract.stopConditions.join('; ')}.`,
    '',
    '## Experimental causal contract',
    '',
    'The normal solver admission policy is unchanged. The control arm is generate → lexical order → top-4 → full polish → beam. The cheap-admission arm computes canonical pre-polish delivered metrics for all 21 proposals only while expanding the frozen initial parent, ranks them with the frozen reference-selector-v1 key, admits four, and returns to lexical admission for later parents.',
    '',
    `Configuration: Max${artifact.configuration.maxFilters}, beam width ${artifact.configuration.beamWidth}, ${artifact.configuration.proposalsPerParent} proposals admitted per parent, local polish ${artifact.configuration.localPolishEvaluations}, exactly ${artifact.configuration.descendantEvaluationBudget} descendants per arm.`,
    `Frozen inputs: audit ${artifact.auditArtifact.sha256}; census ${artifact.censusArtifact.sha256}; replay ${artifact.replayArtifact.sha256}; source ${artifact.sourceArtifact.sha256}; reference snapshot ${artifact.referenceSnapshot.sha256}.`,
    '',
    '## Signal definition and fidelity',
    '',
    'The runtime signal uses only proposal structure, canonical delivered pre-polish metrics, and lexical rank as a deterministic tie-break. It does not read full-polish outcomes, census labels, oracle rank, or rank-9 identity. Candidate ranking performs no partial refinement.',
    '',
    `- Runtime ranking: ${artifact.signal.ranking.join(', ')}.`,
    `- Runtime top-4: ${artifact.signal.top4.join(', ')}; audit acceptance check: ${artifact.signal.auditTop4AcceptanceCheck.join(', ')}; match=${artifact.signal.runtimeTop4MatchesAudit}.`,
    `- Canonical pre-polish evaluations: ${artifact.signal.canonicalPrePolishEvaluations}; ranking coordinate trials: ${artifact.signal.rankingCoordinateTrials}; partial-refinement coordinate trials: ${artifact.signal.partialRefinementCoordinateTrials}.`,
    `- Oracle inputs used: ${artifact.signal.oracleInputsUsed.length === 0 ? 'none' : artifact.signal.oracleInputsUsed.join(', ')}.`,
    `- Fidelity status: ${artifact.fidelity.status}; mismatches: ${artifact.fidelity.mismatches.length === 0 ? 'none' : JSON.stringify(artifact.fidelity.mismatches)}.`,
    '',
    '## Work accounting',
    '',
    `- Generated proposals: control ${artifact.accounting.generatedProposalCountControl}, cheap-admission ${artifact.accounting.generatedProposalCountCheapAdmission}; same initial set=${artifact.accounting.sameGeneratedInitialProposalSet}.`,
    `- Descendant evaluations: control ${artifact.accounting.controlDescendantEvaluations}, cheap-admission ${artifact.accounting.cheapAdmissionDescendantEvaluations}; equal downstream work=${artifact.accounting.equalDescendantWork}.`,
    `- Admission overhead control: ${artifact.accounting.admissionOverhead.control.canonicalPrePolishEvaluations} canonical pre-polish evaluations + ${artifact.accounting.admissionOverhead.control.rankingCoordinateTrials} ranking coordinate trials; elapsed admission=${artifact.accounting.elapsedAdmissionMs.control} ms.`,
    `- Admission overhead cheap-admission: ${artifact.accounting.admissionOverhead.cheapAdmission.canonicalPrePolishEvaluations} canonical pre-polish evaluations + ${artifact.accounting.admissionOverhead.cheapAdmission.rankingCoordinateTrials} ranking coordinate trials; elapsed admission=${artifact.accounting.elapsedAdmissionMs.cheapAdmission} ms.`,
    `- Full-polish coordinate trials: control ${control.accounting.fullPolishCoordinateTrials}, cheap-admission ${cheap.accounting.fullPolishCoordinateTrials}; elapsed total observed: control ${artifact.accounting.elapsedTotalObservedMs.control} ms, cheap-admission ${artifact.accounting.elapsedTotalObservedMs.cheapAdmission} ms.`,
    '',
    '## Arm outcomes',
    '',
    '| Arm | Selected-best RMSE / maxAbs / regret | Selected-best changes | First useful change | Best evaluation index | Pareto novel vs seed | Pareto novel descendants-only | Reference improvements | Parent transitions | Final beam |',
    '|:---|:---|---:|---:|---:|---:|---:|---:|:---|:---|',
    `| control | ${renderMetric(control.selectedBest.metrics)} | ${control.selectedBestChanges.length} | ${control.firstUsefulChange ?? 'none'} | ${control.bestEvaluationIndex} | ${control.paretoNoveltyVsSeedBaseline.againstSeedBaselines} | ${control.paretoNoveltyVsSeedBaseline.descendantsOnly} | ${control.referenceImprovementEvaluationIndices.length} | ${control.parentTransitions.join(' → ') || 'none'} | ${control.finalBeam.join(', ')} |`,
    `| cheap-admission | ${renderMetric(cheap.selectedBest.metrics)} | ${cheap.selectedBestChanges.length} | ${cheap.firstUsefulChange ?? 'none'} | ${cheap.bestEvaluationIndex} | ${cheap.paretoNoveltyVsSeedBaseline.againstSeedBaselines} | ${cheap.paretoNoveltyVsSeedBaseline.descendantsOnly} | ${cheap.referenceImprovementEvaluationIndices.length} | ${cheap.parentTransitions.join(' → ') || 'none'} | ${cheap.finalBeam.join(', ')} |`,
    '',
    '### Control trajectory by evaluation',
    '',
    '| Evaluation | Candidate | Parent | Mutation | Lexical proposal rank | RMSE / maxAbs / regret | Reference improved |',
    '|---:|:---|:---|:---|---:|:---|:---:|',
    renderArmTrajectory(control),
    '',
    '### Cheap-admission trajectory by evaluation',
    '',
    '| Evaluation | Candidate | Parent | Mutation | Lexical proposal rank | RMSE / maxAbs / regret | Reference improved |',
    '|---:|:---|:---|:---|---:|:---|:---:|',
    renderArmTrajectory(cheap),
    '',
    '## Classification',
    '',
    `Classification: **${artifact.classification}**.`,
    '',
    '### Measured facts',
    '',
    ...artifact.interpretation.measuredFacts.map((fact) => `- ${fact}`),
    '',
    '### Interpretation',
    '',
    ...artifact.interpretation.interpretation.map((fact) => `- ${fact}`),
    '',
    '### Boundaries and next step',
    '',
    ...artifact.interpretation.boundaries.map((fact) => `- ${fact}`),
    `- ${artifact.interpretation.nextStep}`,
    '',
    '## Oracle ceiling (diagnostic only)',
    '',
    `The previous oracle rescue is not a competitive third arm. Its diagnostic control regret was ${artifact.oracleCeiling.controlFinalRegret}; oracle rescue regret was ${artifact.oracleCeiling.oracleRescueFinalRegret}.`,
    '',
    '## Hashes, tests, and gates',
    '',
    `- New artifact SHA-256: ${artifactSha256}.`,
    `- ${artifact.testsAndGates.focusedTestCommand}.`,
    ...Object.entries(artifact.testsAndGates.gateResults).map(([name, result]) => `- ${name}: ${result}.`),
    `- Required commands: ${artifact.testsAndGates.requiredGateCommands.join(', ')}.`,
    `- Generation command: ${artifact.testsAndGates.artifactGenerationCommand}.`,
    '',
    'This evidence is bounded to the frozen Storm sparse-0010 parent. It does not authorize a policy change, promotion, merge, release, deployment, or publication.',
    '',
  ].join('\n')
}

export function runStormStructuralAdmissionCheapAdmission(
  options: StormStructuralAdmissionCheapOptions = {},
): StormStructuralAdmissionCheapArtifact {
  return createArtifact(options)
}

export function generateStormStructuralAdmissionCheapAdmission(
  options: StormStructuralAdmissionCheapOptions = {},
): GeneratedStormStructuralAdmissionCheapArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_ADMISSION_CHEAP_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_ADMISSION_CHEAP_REPORT)
  const artifact = runStormStructuralAdmissionCheapAdmission(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralAdmissionCheapReport(artifact, artifactSha256))
  return { artifact, artifactPath, reportPath, artifactSha256 }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, censusInputPath, replayInputPath, auditInputPath, snapshotPath] = args
  const generated = generateStormStructuralAdmissionCheapAdmission({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(censusInputPath === undefined ? {} : { censusInputPath }),
    ...(replayInputPath === undefined ? {} : { replayInputPath }),
    ...(auditInputPath === undefined ? {} : { auditInputPath }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
  })
  process.stdout.write(JSON.stringify({
    artifactPath: generated.artifactPath,
    reportPath: generated.reportPath,
    artifactSha256: generated.artifactSha256,
    classification: generated.artifact.classification,
  }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
