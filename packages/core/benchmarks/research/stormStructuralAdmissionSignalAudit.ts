import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cascadeMagnitudeDb,
  evaluateV2Solution,
  type Filter,
} from '../../src/index.js'

import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  referenceSelectorKey,
  type SelectorPoint,
} from './referenceSelector.js'
import {
  enumerateStormStructuralProposals,
  STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT,
  type StormStructuralProposalCensusArtifact,
} from './stormStructuralProposalCensus.js'
import {
  polishStructuralProposal,
  quantizeStructuralBeamFilters,
  type StructuralBeamRunProblem,
  type StructuralMutation,
} from './structuralBeam.js'
import {
  STORM_DIAGNOSTIC_REPLAY_OUTPUT,
  STORM_REFERENCE_SNAPSHOT_SHA256,
} from './stormDiagnosticReplay.js'
import { resolveResearchPath } from './seedAllocationRun.js'

export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION =
  'storm-structural-admission-signal-audit-v1' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT =
  'packages/core/.research-artifacts/storm-structural-admission-signal-audit-20260910/sparse-0010/audit-report.json' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-structural-admission-signal-audit-results.md' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PROPOSAL_COUNT = 21 as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_TOP4 = 4 as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_LABEL_TRIALS = 24 as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PROBE_TRIALS = [2, 6] as const

export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256 =
  '62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 =
  '930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256 =
  'c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351' as const
export const STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256 =
  '1db7e2cbb3a1542c97666757a9e4cac09f223294035d78d18be3c5c500e69f99' as const

export type StormStructuralAdmissionSignalId =
  | 'lexical'
  | 'pre-polish-rmse-max-abs'
  | 'pre-polish-frozen-selector'
  | 'partial-refinement-2'
  | 'partial-refinement-6'

export type StormStructuralAdmissionSignalAuditClassification =
  | 'cheap-signal-supported'
  | 'partial-refinement-needed'
  | 'cheap-signal-not-supported'
  | 'mixed-unresolved'

export interface StormStructuralAdmissionSignalMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

export interface StormStructuralAdmissionSignalRow {
  proposalRank: number
  mutation: StructuralMutation
  prePolish: {
    continuous: Pick<StormStructuralAdmissionSignalMetric, 'rmseDb' | 'maxAbsDb'>
    canonical: StormStructuralAdmissionSignalMetric
  }
  partialRefinement: {
    2: {
      metrics: StormStructuralAdmissionSignalMetric
      coordinateTrials: number
    }
    6: {
      metrics: StormStructuralAdmissionSignalMetric
      coordinateTrials: number
    }
  }
}

export interface StormStructuralAdmissionSignalLabel {
  proposalRank: number
  admittedByCurrentTop4: boolean
  canonical: StormStructuralAdmissionSignalMetric
  coordinateTrialCount: 24
  selectorBeatsParent: boolean
}

interface SignalScore {
  proposalRank: number
  metrics: StormStructuralAdmissionSignalMetric | null
}

export interface StormStructuralAdmissionSignalRanking {
  signalId: StormStructuralAdmissionSignalId
  definition: string
  ranking: number[]
  rankByProposal: Record<string, number>
  scores: SignalScore[]
  tieOrderStable: boolean
}

export interface StormStructuralAdmissionSignalCost {
  currentAdmission: {
    generatedProposalCount: number
    admittedProposalCount: number
    canonicalEvaluations: number
    coordinateTrialsPerAdmittedProposal: number
    coordinateTrialsTotal: number
  }
  signalEvaluationWork: {
    canonicalEvaluations: number
    continuousEvaluations: number
    coordinateTrialsTotal: number
  }
  coordinateTrialsPerProbe: number
  labelCost: {
    canonicalEvaluations: 21
    coordinateTrialsPerProposal: 24
    coordinateTrialsTotal: 504
    offlineOnly: true
  }
}

export interface StormStructuralAdmissionSignalResult extends StormStructuralAdmissionSignalRanking {
  bestFullCanonicalProposal: {
    proposalRank: number
    rank: number
    top1: boolean
    top4: boolean
  }
  recallAt4OfProposalsBeatingAnyCurrentAdmitted: {
    recoveredProposalRanks: number[]
    eligibleProposalRanks: number[]
    recoveredCount: number
    eligibleCount: number
    value: number
  }
  recallAt4OfProposalsBeatingParentByFrozenSelector: {
    recoveredProposalRanks: number[]
    eligibleProposalRanks: number[]
    recoveredCount: number
    eligibleCount: number
    value: number
  }
  overlapWithLexicalTop4: {
    proposalRanks: number[]
    count: number
  }
  cost: StormStructuralAdmissionSignalCost
}

export interface StormStructuralAdmissionSignalOracleSummary {
  bestFullCanonicalProposalRank: number
  bestFullCanonicalSelectorKey: readonly (number | string)[]
  currentAdmittedRanks: number[]
  proposalsBeatingAnyCurrentAdmitted: number[]
  proposalsBeatingParentByFrozenSelector: number[]
}

export interface StormStructuralAdmissionSignalSummary {
  signals: StormStructuralAdmissionSignalResult[]
  oracle: StormStructuralAdmissionSignalOracleSummary
}

export interface StormStructuralAdmissionSignalAuditArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PRIMARY_ID
  sourceCommit: string | null
  censusProducerCommit: string | null
  producerCommit: string | null
  censusArtifact: { logicalId: string; sha256: string }
  replayArtifact: { logicalId: string; sha256: string }
  sourceArtifact: { logicalId: string; sha256: string }
  referenceSnapshot: { logicalId: string; sha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256 }
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    currentLocalPolishEvaluations: 24
    admissionSignalProbeTrials: [2, 6]
    top4Admission: 4
    proposalCount: 21
  }
  controls: {
    frozenInitialParentOnly: true
    currentLexicalBaseline: 'current orderStructuralProposals then slice(0,4)'
    currentAdmissionUnchanged: true
    labelsPostHocOnly: true
    labelsNotReadByRanking: true
    probesAdmissionOnly: true
    probesFeedBackIntoSolver: false
    refinementIdentity: 'polishStructuralProposal'
    quantization: 'standard-v2-quantized'
    selector: 'reference-selector-v1'
    permittedAdmissionTimeInformation: string[]
    materialRecallCriterion: 'same eligible set and at least one additional recovered proposal in either recall@4 set versus lexical baseline'
    excludedCases: ['titan-to-u12t', 'titan-to-trio']
  }
  frozenInputs: {
    proposalCount: 21
    parentId: string
    parentFilterSemanticSha256: string
    semanticSetSha256: typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256
    lexicalOrderReproduced: true
    censusHashMatched: true
    replayHashMatched: true
    sourceHashMatched: true
  }
  proposals: Array<{
    proposalRank: number
    proposalOrdinal: number
    mutation: StructuralMutation
    admittedByCurrentTop4: boolean
    filtersBeforePolish: Filter[]
    signalRow: StormStructuralAdmissionSignalRow
    fullCanonicalLabel: StormStructuralAdmissionSignalLabel
  }>
  summary: StormStructuralAdmissionSignalSummary
  classification: StormStructuralAdmissionSignalAuditClassification
  interpretation: {
    measuredFacts: string[]
    interpretation: string[]
    hypotheses: string[]
    limitations: string[]
    recommendation: string
  }
  hashes: {
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
  }
}

export interface StormStructuralAdmissionSignalAuditOptions {
  censusInputPath?: string
  replayInputPath?: string
  outputPath?: string
  reportPath?: string
}

export interface GeneratedStormStructuralAdmissionSignalAuditArtifacts {
  audit: StormStructuralAdmissionSignalAuditArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

export interface StormStructuralAdmissionSignalClassificationInput {
  cheapSignalTop4: boolean
  cheapSignalRecallImprovement: boolean
  partialRefinementTop4: boolean
  partialRefinementRecallImprovement: boolean
  rankingAgreement: boolean
}

interface FrozenReplayReport {
  primarySeedId: string
  replaySourceCommit: string | null
  sourceArtifact: { path: string; sha256: string }
  instrumentation: {
    entries: Array<{
      stage: string
      candidateId: string
      filtersBeforePolish: Filter[]
    }>
  }
}

interface FrozenAuditInputs {
  censusPath: string
  replayPath: string
  census: StormStructuralProposalCensusArtifact
  replay: FrozenReplayReport
  problem: SolverLabProblemV1
  orderedProposals: Array<{
    proposalRank: number
    proposalOrdinal: number
    mutation: StructuralMutation
    filters: Filter[]
  }>
  censusSha256: string
  replaySha256: string
  semanticSetSha256: string
  parentFilterSemanticSha256: string
}

const SIGNAL_DEFINITIONS: Readonly<Record<StormStructuralAdmissionSignalId, string>> = Object.freeze({
  lexical: 'Current lexical orderStructuralProposals rank, with proposal rank as the score.',
  'pre-polish-rmse-max-abs': 'Canonical delivered RMSE then maxAbs of each unpolished proposal structure; deterministic tie-break is filter count, cancellation score, proposal rank.',
  'pre-polish-frozen-selector': 'Frozen reference-selector-v1 key on the canonical delivered state of each unpolished proposal structure; no full-polish label is read.',
  'partial-refinement-2': 'Frozen reference-selector-v1 key after exactly two coordinate trials through polishStructuralProposal and standard-v2 quantization.',
  'partial-refinement-6': 'Frozen reference-selector-v1 key after exactly six coordinate trials through polishStructuralProposal and standard-v2 quantization.',
})

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

function semanticStructuralProposalKey(
  proposal: { mutation: StructuralMutation; filters: readonly Filter[] },
): string {
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

function metricFromEvaluation(evaluation: SolverLabEvaluationV1): StormStructuralAdmissionSignalMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error('Storm admission signal candidate was rejected: ' + evaluation.rejectionReason)
  }
  return {
    rmseDb: evaluation.deliverable.rmseDb,
    maxAbsDb: evaluation.deliverable.maxAbsDb,
    filterCount: evaluation.deliverable.filters.length,
    cancellationScore: evaluation.deliverable.cancellationTotalScore,
  }
}

function metricFromContinuous(
  filters: readonly Filter[],
  problem: StructuralBeamRunProblem,
): Pick<StormStructuralAdmissionSignalMetric, 'rmseDb' | 'maxAbsDb'> {
  const solution = evaluateV2Solution(
    filters,
    problem.desiredDb,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )
  return {
    rmseDb: solution.metrics.rmseDb,
    maxAbsDb: solution.metrics.maxAbsDb,
  }
}

function candidateFor(
  problem: SolverLabProblemV1,
  candidateId: string,
  filters: readonly Filter[],
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId,
    algorithmId: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION,
    seed: 0,
    filters: cloneFilters(filters),
  }
}

function evaluateCanonical(
  problem: SolverLabProblemV1,
  candidateId: string,
  filters: readonly Filter[],
): SolverLabEvaluationV1 {
  return evaluateSolverLabCandidate(problem, candidateFor(problem, candidateId, filters))
}

function candidateIdForRank(proposalRank: number): string {
  return `storm-admission-signal-proposal-${String(proposalRank).padStart(4, '0')}`
}

function selectorPoint(
  candidateId: string,
  metrics: StormStructuralAdmissionSignalMetric,
): SelectorPoint {
  return { candidateId, ...metrics }
}

function compareValues(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined || rightValue === undefined) {
      throw new Error('ranking key lengths must match')
    }
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function compareMetric(
  left: StormStructuralAdmissionSignalMetric,
  right: StormStructuralAdmissionSignalMetric,
  leftRank: number,
  rightRank: number,
): number {
  return left.rmseDb - right.rmseDb ||
    left.maxAbsDb - right.maxAbsDb ||
    left.filterCount - right.filterCount ||
    left.cancellationScore - right.cancellationScore ||
    leftRank - rightRank
}

function compareSelector(
  left: StormStructuralAdmissionSignalMetric,
  right: StormStructuralAdmissionSignalMetric,
  leftRank: number,
  rightRank: number,
): number {
  return compareValues(
    referenceSelectorKey(selectorPoint(candidateIdForRank(leftRank), left)),
    referenceSelectorKey(selectorPoint(candidateIdForRank(rightRank), right)),
  ) || leftRank - rightRank
}

function rankRows(
  rows: readonly StormStructuralAdmissionSignalRow[],
  signalId: StormStructuralAdmissionSignalId,
  metricForRow: (row: StormStructuralAdmissionSignalRow) => StormStructuralAdmissionSignalMetric | null,
  comparator: (left: StormStructuralAdmissionSignalRow, right: StormStructuralAdmissionSignalRow) => number,
): StormStructuralAdmissionSignalRanking {
  const ranking = [...rows]
    .sort(comparator)
    .map((row) => row.proposalRank)
  const rankByProposal: Record<string, number> = {}
  ranking.forEach((proposalRank, index) => { rankByProposal[String(proposalRank)] = index + 1 })
  const scores = rows
    .slice()
    .sort((left, right) => left.proposalRank - right.proposalRank)
    .map((row) => ({ proposalRank: row.proposalRank, metrics: metricForRow(row) }))
  return {
    signalId,
    definition: SIGNAL_DEFINITIONS[signalId],
    ranking,
    rankByProposal,
    scores,
    tieOrderStable: ranking.length === new Set(ranking).size,
  }
}

export function rankStormStructuralAdmissionSignals(
  rows: readonly StormStructuralAdmissionSignalRow[],
): StormStructuralAdmissionSignalRanking[] {
  const lexical = rankRows(
    rows,
    'lexical',
    () => null,
    (left, right) => left.proposalRank - right.proposalRank,
  )
  const prePolishRmseMaxAbs = rankRows(
    rows,
    'pre-polish-rmse-max-abs',
    (row) => row.prePolish.canonical,
    (left, right) => compareMetric(
      left.prePolish.canonical,
      right.prePolish.canonical,
      left.proposalRank,
      right.proposalRank,
    ),
  )
  const prePolishSelector = rankRows(
    rows,
    'pre-polish-frozen-selector',
    (row) => row.prePolish.canonical,
    (left, right) => compareSelector(
      left.prePolish.canonical,
      right.prePolish.canonical,
      left.proposalRank,
      right.proposalRank,
    ),
  )
  const partialTwo = rankRows(
    rows,
    'partial-refinement-2',
    (row) => row.partialRefinement[2].metrics,
    (left, right) => compareSelector(
      left.partialRefinement[2].metrics,
      right.partialRefinement[2].metrics,
      left.proposalRank,
      right.proposalRank,
    ),
  )
  const partialSix = rankRows(
    rows,
    'partial-refinement-6',
    (row) => row.partialRefinement[6].metrics,
    (left, right) => compareSelector(
      left.partialRefinement[6].metrics,
      right.partialRefinement[6].metrics,
      left.proposalRank,
      right.proposalRank,
    ),
  )
  return [lexical, prePolishRmseMaxAbs, prePolishSelector, partialTwo, partialSix]
}

function fullCanonicalSelectorPrefers(
  candidate: StormStructuralAdmissionSignalLabel,
  baseline: StormStructuralAdmissionSignalLabel,
): boolean {
  return compareSelector(
    candidate.canonical,
    baseline.canonical,
    candidate.proposalRank,
    baseline.proposalRank,
  ) < 0
}

function selectorRank(labels: readonly StormStructuralAdmissionSignalLabel[]): StormStructuralAdmissionSignalLabel[] {
  return [...labels].sort((left, right) => compareSelector(
    left.canonical,
    right.canonical,
    left.proposalRank,
    right.proposalRank,
  ))
}

function signalCost(signalId: StormStructuralAdmissionSignalId, proposalCount: number): StormStructuralAdmissionSignalCost {
  const coordinateTrialsPerProbe = signalId === 'partial-refinement-2'
    ? 2
    : signalId === 'partial-refinement-6'
      ? 6
      : 0
  const usesCanonicalEvaluation = signalId !== 'lexical'
  return {
    currentAdmission: {
      generatedProposalCount: 21,
      admittedProposalCount: 4,
      canonicalEvaluations: 4,
      coordinateTrialsPerAdmittedProposal: 24,
      coordinateTrialsTotal: 96,
    },
    signalEvaluationWork: {
      canonicalEvaluations: usesCanonicalEvaluation ? proposalCount : 0,
      continuousEvaluations: signalId === 'pre-polish-rmse-max-abs' ? proposalCount : 0,
      coordinateTrialsTotal: proposalCount * coordinateTrialsPerProbe,
    },
    coordinateTrialsPerProbe,
    labelCost: {
      canonicalEvaluations: 21,
      coordinateTrialsPerProposal: 24,
      coordinateTrialsTotal: 504,
      offlineOnly: true,
    },
  }
}

function intersect(left: readonly number[], right: readonly number[]): number[] {
  const rightSet = new Set(right)
  return left.filter((value) => rightSet.has(value))
}

interface StormStructuralAdmissionRecallSummary {
  recoveredCount: number
  eligibleCount: number
}

/**
 * Minimal deterministic materiality rule: keep the frozen eligible set and
 * recover at least one additional useful proposal in either recall metric.
 */
export function materiallyImprovesStormStructuralAdmissionRecall(
  candidate: {
    anyCurrentAdmitted: StormStructuralAdmissionRecallSummary
    parentByFrozenSelector: StormStructuralAdmissionRecallSummary
  },
  lexical: {
    anyCurrentAdmitted: StormStructuralAdmissionRecallSummary
    parentByFrozenSelector: StormStructuralAdmissionRecallSummary
  },
): boolean {
  const improves = (
    candidateRecall: StormStructuralAdmissionRecallSummary,
    lexicalRecall: StormStructuralAdmissionRecallSummary,
  ): boolean => candidateRecall.eligibleCount === lexicalRecall.eligibleCount &&
    candidateRecall.recoveredCount > lexicalRecall.recoveredCount
  return improves(candidate.anyCurrentAdmitted, lexical.anyCurrentAdmitted) ||
    improves(candidate.parentByFrozenSelector, lexical.parentByFrozenSelector)
}

function createSignalResult(
  ranking: StormStructuralAdmissionSignalRanking,
  oracle: StormStructuralAdmissionSignalOracleSummary,
): StormStructuralAdmissionSignalResult {
  const oracleRank = ranking.rankByProposal[String(oracle.bestFullCanonicalProposalRank)]
  if (oracleRank === undefined) throw new Error('oracle proposal is absent from signal ranking')
  const top4 = ranking.ranking.slice(0, 4)
  const eligibleAny = oracle.proposalsBeatingAnyCurrentAdmitted
  const eligibleParent = oracle.proposalsBeatingParentByFrozenSelector
  const recoveredAny = intersect(top4, eligibleAny)
  const recoveredParent = intersect(top4, eligibleParent)
  return {
    ...ranking,
    bestFullCanonicalProposal: {
      proposalRank: oracle.bestFullCanonicalProposalRank,
      rank: oracleRank,
      top1: oracleRank === 1,
      top4: oracleRank <= 4,
    },
    recallAt4OfProposalsBeatingAnyCurrentAdmitted: {
      recoveredProposalRanks: recoveredAny,
      eligibleProposalRanks: [...eligibleAny],
      recoveredCount: recoveredAny.length,
      eligibleCount: eligibleAny.length,
      value: eligibleAny.length === 0 ? 0 : recoveredAny.length / eligibleAny.length,
    },
    recallAt4OfProposalsBeatingParentByFrozenSelector: {
      recoveredProposalRanks: recoveredParent,
      eligibleProposalRanks: [...eligibleParent],
      recoveredCount: recoveredParent.length,
      eligibleCount: eligibleParent.length,
      value: eligibleParent.length === 0 ? 0 : recoveredParent.length / eligibleParent.length,
    },
    overlapWithLexicalTop4: {
      proposalRanks: intersect(top4, [1, 2, 3, 4]),
      count: intersect(top4, [1, 2, 3, 4]).length,
    },
    cost: signalCost(ranking.signalId, ranking.ranking.length),
  }
}

export function computeStormStructuralAdmissionSignalSummary(
  rankings: readonly StormStructuralAdmissionSignalRanking[],
  labels: readonly StormStructuralAdmissionSignalLabel[],
  parentCanonical: StormStructuralAdmissionSignalMetric,
): StormStructuralAdmissionSignalSummary {
  if (labels.length === 0) throw new Error('Storm admission signal labels are required for post-hoc summary')
  const rankedLabels = selectorRank(labels)
  const best = rankedLabels[0]
  if (best === undefined) throw new Error('Storm admission signal labels are empty')
  const currentAdmitted = labels.filter((label) => label.admittedByCurrentTop4)
  const excluded = labels.filter((label) => !label.admittedByCurrentTop4)
  const proposalsBeatingAnyCurrentAdmitted = excluded
    .filter((candidate) => currentAdmitted.some((baseline) => fullCanonicalSelectorPrefers(candidate, baseline)))
    .map((label) => label.proposalRank)
    .sort((left, right) => left - right)
  const parentKey = referenceSelectorKey(selectorPoint('storm-admission-parent', parentCanonical))
  const proposalsBeatingParentByFrozenSelector = labels
    .filter((label) => compareValues(
      referenceSelectorKey(selectorPoint(candidateIdForRank(label.proposalRank), label.canonical)),
      parentKey,
    ) < 0)
    .map((label) => label.proposalRank)
    .sort((left, right) => left - right)
  const oracle: StormStructuralAdmissionSignalOracleSummary = {
    bestFullCanonicalProposalRank: best.proposalRank,
    bestFullCanonicalSelectorKey: referenceSelectorKey(selectorPoint(
      candidateIdForRank(best.proposalRank),
      best.canonical,
    )),
    currentAdmittedRanks: currentAdmitted.map((label) => label.proposalRank).sort((left, right) => left - right),
    proposalsBeatingAnyCurrentAdmitted,
    proposalsBeatingParentByFrozenSelector,
  }
  return {
    signals: rankings.map((ranking) => createSignalResult(ranking, oracle)),
    oracle,
  }
}

export function classifyStormStructuralAdmissionSignalAudit(
  input: StormStructuralAdmissionSignalClassificationInput,
): StormStructuralAdmissionSignalAuditClassification {
  if (!input.rankingAgreement) return 'mixed-unresolved'
  if (input.cheapSignalTop4 && input.cheapSignalRecallImprovement) return 'cheap-signal-supported'
  if (!input.cheapSignalTop4 && input.partialRefinementTop4 && input.partialRefinementRecallImprovement) {
    return 'partial-refinement-needed'
  }
  return 'cheap-signal-not-supported'
}

export function runPartialStormStructuralAdmissionProbe(
  problem: StructuralBeamRunProblem,
  filters: readonly Filter[],
  coordinateTrials: 2 | 6,
): { metrics: StormStructuralAdmissionSignalMetric; coordinateTrials: number; deliveredFilters: Filter[] } {
  const polished = polishStructuralProposal(problem, filters, coordinateTrials, () => false)
  if (polished.coordinateTrials !== coordinateTrials) {
    throw new Error(`Storm admission probe exceeded its ${coordinateTrials}-trial budget`)
  }
  const deliveredFilters = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
  const evaluation = evaluateCanonical(
    problem as SolverLabProblemV1,
    `storm-admission-probe-${coordinateTrials}`,
    deliveredFilters,
  )
  return {
    metrics: metricFromEvaluation(evaluation),
    coordinateTrials: polished.coordinateTrials,
    deliveredFilters: cloneFilters(deliveredFilters),
  }
}

function computeSignalRow(
  problem: StructuralBeamRunProblem,
  proposal: { proposalRank: number; mutation: StructuralMutation; filters: Filter[] },
): StormStructuralAdmissionSignalRow {
  const prePolishContinuous = metricFromContinuous(proposal.filters, problem)
  const prePolishCanonicalFilters = quantizeStructuralBeamFilters(problem, proposal.filters)
  const prePolishCanonical = metricFromEvaluation(evaluateCanonical(
    problem as SolverLabProblemV1,
    `${candidateIdForRank(proposal.proposalRank)}-pre-polish`,
    prePolishCanonicalFilters,
  ))
  const partialRefinement = {
    2: runPartialStormStructuralAdmissionProbe(problem, proposal.filters, 2),
    6: runPartialStormStructuralAdmissionProbe(problem, proposal.filters, 6),
  }
  return {
    proposalRank: proposal.proposalRank,
    mutation: proposal.mutation,
    prePolish: {
      continuous: prePolishContinuous,
      canonical: prePolishCanonical,
    },
    partialRefinement: {
      2: {
        metrics: partialRefinement[2].metrics,
        coordinateTrials: partialRefinement[2].coordinateTrials,
      },
      6: {
        metrics: partialRefinement[6].metrics,
        coordinateTrials: partialRefinement[6].coordinateTrials,
      },
    },
  }
}

function semanticHash(keys: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(keys)).digest('hex')
}

function semanticFilterHash(filters: readonly Filter[]): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  const semanticFilters = filters
    .map(({ id: _id, ...filter }) => filter)
    .sort((left, right) =>
      order[left.type] - order[right.type] ||
      left.frequencyHz - right.frequencyHz ||
      left.gainDb - right.gainDb ||
      left.q - right.q ||
      Number(left.enabled) - Number(right.enabled))
  return semanticHash([JSON.stringify(semanticFilters)])
}

function assertFiltersEqual(left: readonly Filter[], right: readonly Filter[], label: string): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} filters do not match frozen census`)
  }
}

function loadFrozenAuditInputs(options: StormStructuralAdmissionSignalAuditOptions): FrozenAuditInputs {
  const censusPath = resolveResearchPath(options.censusInputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_DIAGNOSTIC_REPLAY_OUTPUT)
  const censusSha256 = sha256File(censusPath)
  const replaySha256 = sha256File(replayPath)
  if (censusSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256) {
    throw new Error('Storm admission signal audit census artifact hash drifted')
  }
  if (replaySha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256) {
    throw new Error('Storm admission signal audit replay artifact hash drifted')
  }
  const censusValue: unknown = JSON.parse(readFileSync(censusPath, 'utf8'))
  if (!isRecord(censusValue)) throw new Error('Storm admission signal audit census is not an object')
  const census = censusValue as unknown as StormStructuralProposalCensusArtifact
  const replayValue: unknown = JSON.parse(readFileSync(replayPath, 'utf8'))
  if (!isRecord(replayValue)) throw new Error('Storm admission signal audit replay is not an object')
  const replay = replayValue as unknown as FrozenReplayReport
  if (census.primarySeedId !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PRIMARY_ID ||
      replay.primarySeedId !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PRIMARY_ID) {
    throw new Error('Storm admission signal audit primary seed drifted')
  }
  if (census.results.proposals.length !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PROPOSAL_COUNT) {
    throw new Error('Storm admission signal audit requires exactly 21 census proposals')
  }
  if (census.configuration.top4Admission !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_TOP4 ||
      census.configuration.localPolishEvaluations !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_LABEL_TRIALS) {
    throw new Error('Storm admission signal audit census configuration drifted')
  }
  if (census.hashes.sourceArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256 ||
      census.hashes.replayArtifactSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256 ||
      census.hashes.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256 ||
      replay.sourceArtifact.sha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256) {
    throw new Error('Storm admission signal audit frozen artifact hashes drifted')
  }
  const seedEntry = replay.instrumentation.entries.find((entry) => entry.stage === 'seed-validation')
  if (seedEntry === undefined) throw new Error('Storm admission signal audit seed-validation entry is missing')
  if (seedEntry.candidateId !== census.results.parent.parentId) {
    throw new Error('Storm admission signal audit initial parent identity drifted')
  }
  assertFiltersEqual(seedEntry.filtersBeforePolish, census.results.parent.filters, 'initial parent')
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm admission signal audit research case is missing')
  const problem = createSolverLabProblem(researchCase, census.configuration.maxFilters)
  const actual = cascadeMagnitudeDb(
    census.results.parent.filters,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const ordered = enumerateStormStructuralProposals({
    problem,
    parentFilters: census.results.parent.filters,
    residualDb,
    top4: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_TOP4,
  })
  if (ordered.length !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PROPOSAL_COUNT) {
    throw new Error('Current structural generator no longer reproduces 21 proposals')
  }
  const orderedProposals = ordered.map((proposal) => ({
    proposalRank: proposal.rank,
    proposalOrdinal: proposal.originalOrdinal,
    mutation: proposal.mutation,
    filters: cloneFilters(proposal.filters),
  }))
  const censusKeys: string[] = []
  const currentKeys: string[] = []
  orderedProposals.forEach((proposal, index) => {
    const expected = census.results.proposals[index]
    if (expected === undefined ||
        expected.lexicalAdmissionRank !== proposal.proposalRank ||
        expected.proposalOrdinal !== proposal.proposalOrdinal ||
        expected.mutation !== proposal.mutation ||
        expected.admittedByCurrentTop4 !== (proposal.proposalRank <= STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_TOP4)) {
      throw new Error('Current lexical order no longer reproduces the frozen census')
    }
    const expectedKey = semanticStructuralProposalKey({ mutation: expected.mutation, filters: expected.filtersBeforePolish })
    const currentKey = semanticStructuralProposalKey(proposal)
    if (expectedKey !== currentKey) throw new Error(`Frozen proposal semantic identity drifted at rank ${proposal.proposalRank}`)
    censusKeys.push(expectedKey)
    currentKeys.push(currentKey)
  })
  const semanticSetSha256 = semanticHash(censusKeys)
  if (semanticSetSha256 !== STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256 ||
      semanticHash(currentKeys) !== semanticSetSha256) {
    throw new Error('Storm admission signal audit semantic proposal-set hash drifted')
  }
  return {
    censusPath,
    replayPath,
    census,
    replay,
    problem,
    orderedProposals,
    censusSha256,
    replaySha256,
    semanticSetSha256,
    parentFilterSemanticSha256: semanticFilterHash(census.results.parent.filters),
  }
}

function labelsFromCensus(census: StormStructuralProposalCensusArtifact): StormStructuralAdmissionSignalLabel[] {
  return census.results.proposals.map((proposal) => ({
    proposalRank: proposal.lexicalAdmissionRank,
    admittedByCurrentTop4: proposal.admittedByCurrentTop4,
    canonical: { ...proposal.canonical },
    coordinateTrialCount: proposal.coordinateTrialCount as 24,
    selectorBeatsParent: proposal.frozenReferenceSelectorV1.againstParent.winner === 'candidate',
  }))
}

function createInterpretation(
  summary: StormStructuralAdmissionSignalSummary,
  classification: StormStructuralAdmissionSignalAuditClassification,
): StormStructuralAdmissionSignalAuditArtifact['interpretation'] {
  const cheap = summary.signals.filter((signal) =>
    (signal.signalId === 'pre-polish-rmse-max-abs' || signal.signalId === 'pre-polish-frozen-selector') &&
    signal.bestFullCanonicalProposal.top4,
  ).map((signal) => signal.signalId)
  const partial = summary.signals.filter((signal) =>
    (signal.signalId === 'partial-refinement-2' || signal.signalId === 'partial-refinement-6') &&
    signal.bestFullCanonicalProposal.top4,
  ).map((signal) => signal.signalId)
  const lexical = summary.signals.find((signal) => signal.signalId === 'lexical')
  if (lexical === undefined) throw new Error('lexical baseline is missing from Storm admission signal summary')
  const recallImprovement = summary.signals.filter((signal) =>
    signal.signalId !== 'lexical' && materiallyImprovesStormStructuralAdmissionRecall(
      {
        anyCurrentAdmitted: signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted,
        parentByFrozenSelector: signal.recallAt4OfProposalsBeatingParentByFrozenSelector,
      },
      {
        anyCurrentAdmitted: lexical.recallAt4OfProposalsBeatingAnyCurrentAdmitted,
        parentByFrozenSelector: lexical.recallAt4OfProposalsBeatingParentByFrozenSelector,
      },
    ),
  ).map((signal) => signal.signalId)
  const measuredFacts = [
    `Exactly ${summary.signals[0]?.ranking.length ?? 0} frozen initial-parent proposals were ranked.`,
    `The best full-polish canonical proposal is lexical rank ${summary.oracle.bestFullCanonicalProposalRank}.`,
    `Cheap signals placing that proposal in top-4: ${cheap.length === 0 ? 'none' : cheap.join(', ')}.`,
    `Partial-refinement signals placing that proposal in top-4: ${partial.length === 0 ? 'none' : partial.join(', ')}.`,
    `Signals with material recall improvement versus lexical baseline: ${recallImprovement.length === 0 ? 'none' : recallImprovement.join(', ')}.`,
    `Full-polish labels cost 21 offline canonical evaluations and 504 coordinate trials; they were not used by ranking.`,
  ]
  const interpretation = classification === 'cheap-signal-supported'
    ? ['At this frozen parent, at least one admission-time cheap signal ranks the best known full-polish canonical proposal into top-4 and materially improves recall versus lexical admission.']
    : classification === 'partial-refinement-needed'
      ? ['The cheap signals miss the best known full-polish canonical proposal while a permitted 2/6-trial probe ranks it into top-4 and materially improves recall versus lexical admission.']
      : classification === 'cheap-signal-not-supported'
        ? ['No permitted admission-time signal ranks the best known full-polish canonical proposal into top-4 at this parent.']
        : ['Signal families disagree or are not stable enough for a bounded conclusion at this parent.']
  const hypotheses = classification === 'cheap-signal-supported' || classification === 'partial-refinement-needed'
    ? ['A separate causal equal-work study is needed to determine whether replacing current lexical admission improves solver outcomes under equal downstream work.']
    : ['The next bounded avenue should be one of MP rank audit, refinement-potential oracle, or structured admission; this audit does not justify increasing proposalsPerParent.']
  const recommendation = classification === 'cheap-signal-supported' || classification === 'partial-refinement-needed'
    ? 'Recommend a separate causal equal-work study comparing current lexical admission with the candidate signal; do not implement a policy change from this audit.'
    : 'Do not increase proposalsPerParent. Choose one next avenue: MP rank audit, refinement-potential oracle, or structured admission.'
  return {
    measuredFacts,
    interpretation,
    hypotheses,
    limitations: [
      'This is one frozen sparse-0010 initial parent and 21 proposals; it is not a holdout or promotion study.',
      'The full-polish canonical outcome is a post-hoc label/oracle and cannot establish a deployable signal by itself.',
      'No U12t, Trio, MP rank audit, refinement-potential oracle, or structured-admission policy was run.',
      'Partial probes were admission-only and did not feed back into solver beam state or parent expansion.',
    ],
    recommendation,
  }
}

function createAuditArtifact(options: StormStructuralAdmissionSignalAuditOptions): StormStructuralAdmissionSignalAuditArtifact {
  const inputs = loadFrozenAuditInputs(options)
  const signalRows = inputs.orderedProposals.map((proposal) => computeSignalRow(inputs.problem, proposal))
  const rankings = rankStormStructuralAdmissionSignals(signalRows)
  const secondRankings = rankStormStructuralAdmissionSignals(signalRows)
  const rankingAgreement = JSON.stringify(rankings) === JSON.stringify(secondRankings)
  rankings.forEach((ranking, index) => {
    ranking.tieOrderStable = ranking.tieOrderStable && rankingAgreement &&
      JSON.stringify(ranking.ranking) === JSON.stringify(secondRankings[index]?.ranking)
  })
  const labels = labelsFromCensus(inputs.census)
  const parentCanonical = { ...inputs.census.results.parent.canonical }
  const summary = computeStormStructuralAdmissionSignalSummary(rankings, labels, parentCanonical)
  const cheapSignalTop4 = summary.signals.some((signal) =>
    (signal.signalId === 'pre-polish-rmse-max-abs' || signal.signalId === 'pre-polish-frozen-selector') &&
    signal.bestFullCanonicalProposal.top4,
  )
  const partialRefinementTop4 = summary.signals.some((signal) =>
    (signal.signalId === 'partial-refinement-2' || signal.signalId === 'partial-refinement-6') &&
    signal.bestFullCanonicalProposal.top4,
  )
  const lexical = summary.signals.find((signal) => signal.signalId === 'lexical')
  if (lexical === undefined) throw new Error('lexical baseline is missing from Storm admission signal summary')
  const recallBaseline = {
    anyCurrentAdmitted: lexical.recallAt4OfProposalsBeatingAnyCurrentAdmitted,
    parentByFrozenSelector: lexical.recallAt4OfProposalsBeatingParentByFrozenSelector,
  }
  const cheapSignalRecallImprovement = summary.signals.some((signal) =>
    (signal.signalId === 'pre-polish-rmse-max-abs' || signal.signalId === 'pre-polish-frozen-selector') &&
    materiallyImprovesStormStructuralAdmissionRecall({
      anyCurrentAdmitted: signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted,
      parentByFrozenSelector: signal.recallAt4OfProposalsBeatingParentByFrozenSelector,
    }, recallBaseline),
  )
  const partialRefinementRecallImprovement = summary.signals.some((signal) =>
    (signal.signalId === 'partial-refinement-2' || signal.signalId === 'partial-refinement-6') &&
    materiallyImprovesStormStructuralAdmissionRecall({
      anyCurrentAdmitted: signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted,
      parentByFrozenSelector: signal.recallAt4OfProposalsBeatingParentByFrozenSelector,
    }, recallBaseline),
  )
  const classification = classifyStormStructuralAdmissionSignalAudit({
    cheapSignalTop4,
    cheapSignalRecallImprovement,
    partialRefinementTop4,
    partialRefinementRecallImprovement,
    rankingAgreement,
  })
  const producerCommit = currentCommit()
  const censusProducerCommit = inputs.census.producerCommit
  return {
    schemaVersion: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PRIMARY_ID,
    sourceCommit: inputs.replay.replaySourceCommit,
    censusProducerCommit,
    producerCommit,
    censusArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json',
      sha256: inputs.censusSha256,
    },
    replayArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
      sha256: inputs.replaySha256,
    },
    sourceArtifact: {
      logicalId: 'external:storm-mp-reallocation-corrective-rerun1/tournament-report.json',
      sha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
    },
    referenceSnapshot: {
      logicalId: 'external:OracleReferenceSnapshotV1.json',
      sha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
    configuration: {
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      currentLocalPolishEvaluations: 24,
      admissionSignalProbeTrials: [2, 6],
      top4Admission: 4,
      proposalCount: 21,
    },
    controls: {
      frozenInitialParentOnly: true,
      currentLexicalBaseline: 'current orderStructuralProposals then slice(0,4)',
      currentAdmissionUnchanged: true,
      labelsPostHocOnly: true,
      labelsNotReadByRanking: true,
      probesAdmissionOnly: true,
      probesFeedBackIntoSolver: false,
      refinementIdentity: 'polishStructuralProposal',
      quantization: 'standard-v2-quantized',
      selector: 'reference-selector-v1',
      permittedAdmissionTimeInformation: [
        'proposal mutation and unpolished proposal filter structure',
        'current lexical order key',
        'canonical delivered RMSE/maxAbs/filter-count/cancellation metrics of an unpolished proposal',
        'canonical delivered metrics from exactly 2 or 6 coordinate-trial admission-only probes',
      ],
      materialRecallCriterion: 'same eligible set and at least one additional recovered proposal in either recall@4 set versus lexical baseline',
      excludedCases: ['titan-to-u12t', 'titan-to-trio'],
    },
    frozenInputs: {
      proposalCount: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_PROPOSAL_COUNT,
      parentId: inputs.census.results.parent.parentId,
      parentFilterSemanticSha256: inputs.parentFilterSemanticSha256,
      semanticSetSha256: inputs.semanticSetSha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
      lexicalOrderReproduced: true,
      censusHashMatched: true,
      replayHashMatched: true,
      sourceHashMatched: true,
    },
    proposals: inputs.orderedProposals.map((proposal, index) => ({
      proposalRank: proposal.proposalRank,
      proposalOrdinal: proposal.proposalOrdinal,
      mutation: proposal.mutation,
      admittedByCurrentTop4: proposal.proposalRank <= 4,
      filtersBeforePolish: cloneFilters(proposal.filters),
      signalRow: signalRows[index]!,
      fullCanonicalLabel: labels[index]!,
    })),
    summary,
    classification,
    interpretation: createInterpretation(summary, classification),
    hashes: {
      censusArtifactSha256: inputs.censusSha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_CENSUS_SHA256,
      replayArtifactSha256: inputs.replaySha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPLAY_SHA256,
      sourceArtifactSha256: STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SOURCE_SHA256,
      semanticSetSha256: inputs.semanticSetSha256 as typeof STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_SEMANTIC_SET_SHA256,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionSignalAudit.test.ts',
      requiredGateCommands: [
        'pnpm test',
        'pnpm typecheck',
        'pnpm build',
        'pnpm lint',
        'pnpm --filter @autoeq-workbench/core benchmark',
        'git diff --check',
      ],
      artifactGenerationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-structural-admission-signal-audit',
      validationStatus: 'evidence-recorded-in-report',
    },
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toPrecision(8)
}

export function renderStormStructuralAdmissionSignalAuditReport(
  artifact: StormStructuralAdmissionSignalAuditArtifact,
  artifactSha256?: string,
): string {
  const signalRows = artifact.summary.signals.map((signal) => {
    const top4 = signal.ranking.slice(0, 4).join(', ')
    return [
      `### ${signal.signalId}`,
      '',
      `Definition: ${signal.definition}`,
      '',
      `- Complete ranking (best → worst): ${signal.ranking.join(', ')}.`,
      `- Full-polish oracle proposal rank ${signal.bestFullCanonicalProposal.proposalRank}: signal rank ${signal.bestFullCanonicalProposal.rank}; top-1=${signal.bestFullCanonicalProposal.top1}; top-4=${signal.bestFullCanonicalProposal.top4}.`,
      `- Top-4: ${top4}.`,
      `- Recall@4 of proposals beating any current-admitted proposal: ${signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted.recoveredCount}/${signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted.eligibleCount} (${formatNumber(signal.recallAt4OfProposalsBeatingAnyCurrentAdmitted.value)}).`,
      `- Recall@4 of proposals beating parent by frozen selector: ${signal.recallAt4OfProposalsBeatingParentByFrozenSelector.recoveredCount}/${signal.recallAt4OfProposalsBeatingParentByFrozenSelector.eligibleCount} (${formatNumber(signal.recallAt4OfProposalsBeatingParentByFrozenSelector.value)}).`,
      `- Overlap with lexical top-4: ${signal.overlapWithLexicalTop4.count}/4 (${signal.overlapWithLexicalTop4.proposalRanks.join(', ') || 'none'}).`,
      `- Cost: current admission=${signal.cost.currentAdmission.admittedProposalCount} admitted / ${signal.cost.currentAdmission.coordinateTrialsTotal} coordinate trials; signal work=${signal.cost.signalEvaluationWork.canonicalEvaluations} canonical + ${signal.cost.signalEvaluationWork.continuousEvaluations} continuous evaluations and ${signal.cost.signalEvaluationWork.coordinateTrialsTotal} probe coordinate trials; coordinate trials per probe=${signal.cost.coordinateTrialsPerProbe}; label cost=${signal.cost.labelCost.coordinateTrialsTotal} offline coordinate trials at 24 per proposal.`,
      `- Tie/order stability: ${signal.tieOrderStable}.`,
      '',
    ].join('\n')
  }).join('\n')
  return [
    '# Storm structural admission cheap-signal audit results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})`,
    'Case: titan-to-storm',
    `Primary: ${artifact.primarySeedId}`,
    `Source commit: ${artifact.sourceCommit ?? 'null'}`,
    `Census producer commit: ${artifact.censusProducerCommit ?? 'null'}`,
    `Audit producer commit: ${artifact.producerCommit ?? 'null'}`,
    '',
    '## Scope and contract',
    '',
    'This is deterministic experimental evidence only. It ranks exactly the 21 frozen sparse-0010 initial-parent proposals from the existing Storm census. The current solver admission policy is unchanged.',
    '',
    '- Frozen census hash: `' + artifact.hashes.censusArtifactSha256 + '`. Replay hash: `' + artifact.hashes.replayArtifactSha256 + '`. Source hash: `' + artifact.hashes.sourceArtifactSha256 + '`. Semantic proposal-set hash: `' + artifact.hashes.semanticSetSha256 + '`.',
    ...(artifactSha256 === undefined ? [] : [`- Audit artifact SHA-256: \`${artifactSha256}\`.`]),
    '- Current admission remains generate → orderStructuralProposals → slice(0,4) → full 24-trial polish → canonical delivery.',
    '- Labels are the existing full 24-coordinate-trial polish plus canonical outcome from the census. They are post-hoc only and never enter signal scores or rankings.',
    '- Permitted admission-time information is limited to mutation/unpolished structure, current lexical order, canonical delivered RMSE/maxAbs/filter-count/cancellation metrics of the unpolished structure, and canonical metrics from exactly the 2- or 6-trial admission-only probes.',
    '- Material recall improvement is defined minimally and deterministically as the same eligible set plus at least one additional recovered proposal in either recall@4 set versus the lexical baseline.',
    '- Partial probes call polishStructuralProposal exactly at 2 and 6 coordinate trials, with existing coordinate order, steps, mutation, selector, and standard-v2 quantization semantics. Probes score admission only and do not feed back into the solver.',
    '',
    '## Frozen inputs',
    '',
    `- Proposal count: ${artifact.frozenInputs.proposalCount}; lexical order reproduced: ${artifact.frozenInputs.lexicalOrderReproduced}; semantic set hash matched: ${artifact.frozenInputs.semanticSetSha256}.`,
    `- Parent: ${artifact.frozenInputs.parentId}; parent semantic hash: ${artifact.frozenInputs.parentFilterSemanticSha256}.`,
    '- Excluded cases: U12t and Trio.',
    '',
    '## Results',
    '',
    `Best full-polish canonical proposal: lexical rank ${artifact.summary.oracle.bestFullCanonicalProposalRank}. Current admitted ranks: ${artifact.summary.oracle.currentAdmittedRanks.join(', ')}.`,
    `Proposals beating any current-admitted proposal by the full-canonical frozen selector: ${artifact.summary.oracle.proposalsBeatingAnyCurrentAdmitted.join(', ') || 'none'}.`,
    `Proposals beating parent by the full-canonical frozen selector: ${artifact.summary.oracle.proposalsBeatingParentByFrozenSelector.join(', ') || 'none'}.`,
    '',
    signalRows,
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
    '### Hypotheses and recommendation',
    '',
    ...artifact.interpretation.hypotheses.map((fact) => `- ${fact}`),
    `- ${artifact.interpretation.recommendation}`,
    '',
    '### Limitations',
    '',
    ...artifact.interpretation.limitations.map((fact) => `- ${fact}`),
    '',
    '## Tests and gates',
    '',
    '- Focused command: `' + artifact.testsAndGates.focusedTestCommand + '`.',
    '- Required commands: ' + artifact.testsAndGates.requiredGateCommands
      .map((command) => '`' + command + '`')
      .join(', ') + '.',
    '- Generation command: `' + artifact.testsAndGates.artifactGenerationCommand + '`.',
    '- This report records evidence from the execution; it does not authorize admission-policy change, promotion, merge, release, deployment, or publication.',
    '',
  ].join('\n')
}

export function runStormStructuralAdmissionSignalAudit(
  options: StormStructuralAdmissionSignalAuditOptions = {},
): StormStructuralAdmissionSignalAuditArtifact {
  return createAuditArtifact(options)
}

export function generateStormStructuralAdmissionSignalAudit(
  options: StormStructuralAdmissionSignalAuditOptions = {},
): GeneratedStormStructuralAdmissionSignalAuditArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_ADMISSION_SIGNAL_AUDIT_REPORT)
  const audit = runStormStructuralAdmissionSignalAudit(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(audit, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralAdmissionSignalAuditReport(audit, artifactSha256))
  return {
    audit,
    artifactPath,
    reportPath,
    artifactSha256,
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, censusInputPath, replayInputPath] = args
  const generated = generateStormStructuralAdmissionSignalAudit({
    outputPath,
    reportPath,
    censusInputPath,
    replayInputPath,
  })
  process.stdout.write(JSON.stringify({
    artifactPath: generated.artifactPath,
    reportPath: generated.reportPath,
    artifactSha256: generated.artifactSha256,
    classification: generated.audit.classification,
  }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
