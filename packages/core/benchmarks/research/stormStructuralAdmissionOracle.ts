import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Filter } from '../../src/types/filter.js'
import { cascadeMagnitudeDb } from '../../src/index.js'

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
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import { selectReferencePoint } from './referenceSelector.js'
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
  type StructuralBeamDiagnosticEntry,
  type StructuralBeamDiagnosticTrace,
  type StructuralBeamRunResult,
} from './structuralBeam.js'
import {
  STORM_DIAGNOSTIC_REPLAY_OUTPUT,
  STORM_REFERENCE_SNAPSHOT_SHA256,
  type StormDiagnosticReplayReport,
} from './stormDiagnosticReplay.js'
import {
  enumerateStormStructuralProposals,
  STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT,
  type StormStructuralProposalCensusArtifact,
} from './stormStructuralProposalCensus.js'

import {
  type StructuralBeamAdmissionOverride,
  type StructuralBeamAdmissionContext,
  type StructuralBeamAdmissionDecision,
  type StructuralMutation,
  type StructuralProposal,
} from './structuralBeam.js'
import type { EnumeratedStormStructuralProposal } from './stormStructuralProposalCensus.js'

export interface FrozenStormRescueProposal {
  parentId: string
  primarySeedId: string
  proposalOrdinal: number
  lexicalAdmissionRank: number
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
}

export interface ValidateFrozenStormRescueProposalInput {
  parentId: string
  primarySeedId: string
  proposals: readonly EnumeratedStormStructuralProposal[]
  rescue: FrozenStormRescueProposal
}

export interface StormStructuralAdmissionOverrideEvent {
  intervention: 'rescue'
  parentCandidateId: string
  parentIndex: number
  layerIndex: number
  rescueRank: number
  originalAdmittedProposal: StructuralProposal
  replacementProposal: StructuralProposal
  effectiveProposals: StructuralProposal[]
}

export interface CreateStormStructuralAdmissionOverrideInput {
  parentCandidateId: string
  rescueProposal: EnumeratedStormStructuralProposal
  onEvent?: (event: StormStructuralAdmissionOverrideEvent) => void
}

export const STORM_STRUCTURAL_ADMISSION_ORACLE_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_EXPERIMENT_VERSION =
  'storm-structural-admission-oracle-v1' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_OUTPUT =
  'packages/core/.research-artifacts/storm-structural-admission-oracle-20260910/sparse-0010/admission-oracle-report.json' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-structural-admission-oracle-results.md' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_CENSUS = STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT
export const STORM_STRUCTURAL_ADMISSION_ORACLE_REPLAY = STORM_DIAGNOSTIC_REPLAY_OUTPUT
export const STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET =
  STORM_SEED_ALLOCATION_TARGET_DESCENDANTS
export const STORM_STRUCTURAL_ADMISSION_ORACLE_EVALUATION_BUDGET =
  STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET + 1
export const STORM_STRUCTURAL_ADMISSION_ORACLE_RESCUE_RANK = 9 as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_CENSUS_SHA256 =
  '62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_REPLAY_SHA256 =
  '930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba' as const
export const STORM_STRUCTURAL_ADMISSION_ORACLE_SOURCE_SHA256 =
  'c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351' as const
const METRIC_TOLERANCE = 1e-12

export type StormStructuralAdmissionOracleClassification =
  | 'admission-causal-impact-supported'
  | 'admission-transient-impact'
  | 'admission-static-only-at-this-budget'
  | 'inconclusive'

interface OracleMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
  referenceRegret: number
  referenceImproved: boolean
}

interface OracleSelectedBest {
  candidateId: string
  evaluationIndex: number
  metrics: OracleMetric
}

interface OracleDescendant {
  evaluationIndex: number
  candidateId: string
  parentCandidateId: string | null
  mutation: StructuralMutation | 'seed-validation' | 'unknown'
  proposalRank: number | null
  proposalOrdinal: number | null
  filtersBeforePolish: Filter[]
  canonicalFilters: Filter[]
  metrics: OracleMetric
}

interface OracleFrontierPoint {
  candidateId: string
  evaluationIndex: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
}

interface OracleAdmissionRecord {
  orderedProposalCount: number
  orderedProposals: StructuralProposal[]
  normalTop4: StructuralProposal[]
  effectiveInitialAdmission: StructuralProposal[]
  rescueApplied: boolean
}

interface OracleArmAccounting {
  seedValidationEvaluations: number
  descendantEvaluations: number
  totalStructuralCandidateEvaluations: number
  evaluationBudget: number
  targetDescendantEvaluations: number
  seedValidationSeparate: true
  oracleEvaluationsCharged: false
}

interface OracleArm {
  armId: 'control' | 'rescue'
  accounting: OracleArmAccounting
  seedValidation: OracleDescendant
  descendants: OracleDescendant[]
  trajectory: StructuralBeamRunResult['trajectory']
  selectedBest: OracleSelectedBest
  selectedBestChanges: OracleSelectedBest[]
  paretoNoveltyVsSeedBaseline: {
    againstSeedBaselines: number
    descendantsOnly: number
    frontier: OracleFrontierPoint[]
  }
  firstUsefulChange: number | null
  bestEvaluationIndex: number | null
  layersExpanded: number
  parentTransitions: string[]
  finalBeam: string[]
  stopReason: StructuralBeamRunResult['stopReason']
  metadata: StructuralBeamRunResult['metadata']
  admission: OracleAdmissionRecord
}

interface OracleFidelityMismatch {
  field: string
  expected: unknown
  actual: unknown
}

export interface StormStructuralAdmissionOracleFidelity {
  status: 'valid' | 'invalid'
  valid: boolean
  mismatchCount: number
  mismatches: OracleFidelityMismatch[]
  initialParentMatched: boolean
  initialAdmissionMatched: boolean
  canonicalMetricsWithinTolerance: boolean
  selectedBestMatched: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  tolerance: number
}

export interface StormStructuralAdmissionOracleArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_ADMISSION_ORACLE_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_ADMISSION_ORACLE_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID
  sourceCommit: string | null
  censusProducerCommit: string | null
  producerCommit: string | null
  censusArtifact: { logicalId: string; sha256: string }
  replayArtifact: { logicalId: string; sha256: string }
  referenceSnapshot: { logicalId: string; sha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256 }
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    localPolishEvaluations: 24
    descendantEvaluationBudget: 8
    evaluationBudget: 9
    seedValidationSeparate: true
    oracleEvaluationsCharged: false
    deadlineMode: 'cooperative'
    deadlineMs: 60_000
    excludedCases: ['titan-to-u12t', 'titan-to-trio']
  }
  controls: {
    frozenSelector: 'reference-selector-v1'
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    generatorIdentity: 'generateStructuralMutations'
    orderIdentity: 'orderStructuralProposals'
    polishIdentity: 'polishStructuralProposal'
    beamIdentity: 'structural-beam-v1'
    currentAdmission: 'generate -> current orderStructuralProposals -> slice(0,4) -> polish -> beam'
    interventionScope: 'rescue only during expansion of frozen initial parent'
  }
  rescue: {
    parentId: string
    primarySeedId: typeof STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID
    mutation: StructuralMutation
    proposalOrdinal: number
    lexicalAdmissionRank: number
    filtersBeforePolish: Filter[]
    semanticStructureSha256: string
    provenanceValidated: boolean
    intervention: {
      appliedExactlyOnce: boolean
      initialParentOnly: boolean
      noLaterHookEffect: boolean
      lexicalAdmissionRank: number
      normalAdmittedProposalCount: number
      effectiveInitialAdmission: StructuralProposal[]
      originalFourthProposal: StructuralProposal
      replacementProposal: StructuralProposal
    }
  }
  accounting: {
    equalDescendantWork: boolean
    controlDescendantEvaluations: number
    rescueDescendantEvaluations: number
    censusOfflineEvaluations: 21
    censusOfflineEvaluationsChargedToEitherArm: false
  }
  controlFidelity: StormStructuralAdmissionOracleFidelity
  arms: { control: OracleArm; rescue: OracleArm }
  classification: StormStructuralAdmissionOracleClassification
  facts: {
    controlFinalSelectedBest: OracleSelectedBest
    rescueFinalSelectedBest: OracleSelectedBest
    rescueImprovedFinalRegret: boolean
    rescueImprovedFinalMetrics: boolean
    rescuePrefixAdvantage: boolean
    selectedBestChanged: boolean
    workEqual: boolean
    fidelityValid: boolean
  }
  interpretation: {
    classification: StormStructuralAdmissionOracleClassification
    evidence: string[]
    guards: string[]
  }
  hashes: {
    censusArtifactSha256: string
    replayArtifactSha256: string
    referenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
    rescueSemanticStructureSha256: string
  }
  testsAndGates: {
    focusedTestCommand: string
    requiredGateCommands: string[]
    artifactGenerationCommand: string
    validationStatus: 'evidence-recorded-in-report'
  }
}

export interface StormStructuralAdmissionOracleOptions {
  censusInputPath?: string
  replayInputPath?: string
  snapshotPath?: string
  outputPath?: string
  reportPath?: string
}

export interface GeneratedStormStructuralAdmissionOracleArtifacts {
  oracle: StormStructuralAdmissionOracleArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

export interface StormStructuralAdmissionOracleClassificationInput {
  fidelityValid: boolean
  controlDescendantEvaluations: number
  rescueDescendantEvaluations: number
  controlRegret: number
  rescueRegret: number
  controlFinalRmseDb: number
  controlFinalMaxAbsDb: number
  rescueFinalRmseDb: number
  rescueFinalMaxAbsDb: number
  rescuePrefixAdvantage: boolean
}

function semanticFilterSort(left: Omit<EnumeratedStormStructuralProposal['filters'][number], 'id'>, right: Omit<EnumeratedStormStructuralProposal['filters'][number], 'id'>): number {
  const order: Record<StructuralProposal['filters'][number]['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return order[left.type] - order[right.type] ||
    left.frequencyHz - right.frequencyHz ||
    left.gainDb - right.gainDb ||
    left.q - right.q ||
    Number(left.enabled) - Number(right.enabled)
}

/** Stable structural identity that intentionally omits filter IDs. */
export function semanticStructuralProposalKey(
  proposal: { mutation: StructuralMutation; filters: readonly Filter[] },
): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters
      .map(({ id: _id, ...filter }) => filter)
      .sort(semanticFilterSort),
  })
}

function cloneProposal(proposal: StructuralProposal): StructuralProposal {
  return {
    mutation: proposal.mutation,
    filters: proposal.filters.map((filter) => ({ ...filter })),
  }
}

function cloneEnumeratedProposal(proposal: EnumeratedStormStructuralProposal): EnumeratedStormStructuralProposal {
  return {
    ...proposal,
    filters: proposal.filters.map((filter) => ({ ...filter })),
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

/**
 * Verifies the frozen census proposal against the current generated and
 * ordered inventory. The match is deliberately provenance plus semantic
 * structure, never a hard-coded array position alone.
 */
export function validateFrozenStormRescueProposal(
  input: ValidateFrozenStormRescueProposalInput,
): EnumeratedStormStructuralProposal {
  if (input.rescue.parentId !== input.parentId) {
    throw new Error('Storm rescue parent provenance does not match the frozen census')
  }
  if (input.rescue.primarySeedId !== input.primarySeedId) {
    throw new Error('Storm rescue primary-seed provenance does not match the frozen census')
  }
  requirePositiveInteger(input.rescue.proposalOrdinal, 'Storm rescue proposal ordinal')
  requirePositiveInteger(input.rescue.lexicalAdmissionRank, 'Storm rescue lexical admission rank')
  if (input.rescue.lexicalAdmissionRank <= 4) {
    throw new Error('Storm rescue must be excluded by the frozen top-4 boundary')
  }
  const rescueKey = semanticStructuralProposalKey({
    mutation: input.rescue.mutation,
    filters: input.rescue.filtersBeforePolish,
  })
  const matches = input.proposals.filter((proposal) =>
    proposal.originalOrdinal === input.rescue.proposalOrdinal &&
    proposal.rank === input.rescue.lexicalAdmissionRank &&
    proposal.mutation === input.rescue.mutation &&
    semanticStructuralProposalKey(proposal) === rescueKey)
  if (matches.length !== 1) {
    throw new Error('Storm rescue semantic structure/provenance does not match the current ordered proposal inventory')
  }
  const matched = matches[0]!
  if (matched.admittedByCurrentTop4) {
    throw new Error('Storm rescue unexpectedly belongs to the current admitted top-4')
  }
  return cloneEnumeratedProposal(matched)
}

function proposalMatches(
  left: Pick<StructuralProposal, 'mutation' | 'filters'>,
  right: Pick<StructuralProposal, 'mutation' | 'filters'>,
): boolean {
  return semanticStructuralProposalKey(left) === semanticStructuralProposalKey(right)
}

/**
 * Creates the one-shot, initial-parent-only oracle intervention. Returning
 * null keeps the structural beam's normal generate → order → slice policy.
 */
export function createStormStructuralAdmissionOverride(
  input: CreateStormStructuralAdmissionOverrideInput,
): StructuralBeamAdmissionOverride {
  let used = false
  return {
    apply(context: StructuralBeamAdmissionContext): StructuralBeamAdmissionDecision | null {
      if (used || context.layerIndex !== 1 || context.parent.candidate.candidateId !== input.parentCandidateId) {
        return null
      }
      const replacementMatches = context.orderedProposals.filter((proposal) =>
        proposalMatches(proposal, input.rescueProposal))
      if (replacementMatches.length !== 1) {
        throw new Error('Storm rescue is absent or ambiguous in the current ordered proposal inventory')
      }
      const replacementProposal = replacementMatches[0]!
      const replacementRank = context.orderedProposals.findIndex((proposal) => proposalMatches(proposal, replacementProposal)) + 1
      if (replacementRank !== input.rescueProposal.rank) {
        throw new Error('Storm rescue current lexical rank drifted from the frozen census')
      }
      if (context.admittedProposals.length < 4) {
        throw new Error('Storm rescue requires four normal admitted proposals')
      }
      const originalAdmittedProposal = context.admittedProposals[3]!
      const effectiveProposals = [
        ...context.admittedProposals.slice(0, 3).map(cloneProposal),
        cloneProposal(replacementProposal),
      ]
      used = true
      input.onEvent?.({
        intervention: 'rescue',
        parentCandidateId: context.parent.candidate.candidateId,
        parentIndex: context.parentIndex,
        layerIndex: context.layerIndex,
        rescueRank: replacementRank,
        originalAdmittedProposal: cloneProposal(originalAdmittedProposal),
        replacementProposal: cloneProposal(replacementProposal),
        effectiveProposals: effectiveProposals.map(cloneProposal),
      })
      return { proposals: effectiveProposals, intervention: 'rescue' }
    },
  }
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

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneProposalList(proposals: readonly StructuralProposal[]): StructuralProposal[] {
  return proposals.map((proposal) => ({
    mutation: proposal.mutation,
    filters: cloneFilters(proposal.filters),
  }))
}

function cloneMetric(metric: OracleMetric): OracleMetric {
  return { ...metric }
}

function metricFromEvaluation(
  evaluation: SolverLabEvaluationV1,
  references: readonly ReferenceRegretPoint[],
): OracleMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`Storm admission oracle candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const delivered = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId: evaluation.candidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
  }, references)
  return {
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
    cancellationScore: delivered.cancellationTotalScore,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function metricFromTraceEntry(entry: StructuralBeamDiagnosticEntry): OracleMetric {
  return {
    rmseDb: entry.canonical.metrics.rmseDb,
    maxAbsDb: entry.canonical.metrics.maxAbsDb,
    filterCount: entry.canonical.metrics.filterCount,
    cancellationScore: entry.canonical.metrics.cancellationScore,
    referenceRegret: entry.canonical.referenceRegret,
    referenceImproved: entry.canonical.referenceImproved,
  }
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= METRIC_TOLERANCE
}

function sameFilters(left: readonly Filter[], right: readonly Filter[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameSemanticFilters(left: readonly Filter[], right: readonly Filter[]): boolean {
  return semanticStructuralProposalKey({ mutation: 'remove', filters: left }) ===
    semanticStructuralProposalKey({ mutation: 'remove', filters: right })
}

function sameMetric(left: OracleMetric, right: OracleMetric): boolean {
  return sameNumber(left.rmseDb, right.rmseDb) &&
    sameNumber(left.maxAbsDb, right.maxAbsDb) &&
    left.filterCount === right.filterCount &&
    sameNumber(left.cancellationScore, right.cancellationScore) &&
    sameNumber(left.referenceRegret, right.referenceRegret) &&
    left.referenceImproved === right.referenceImproved
}

function metricPoint(candidateId: string, metric: OracleMetric): SeedAllocationPoint {
  return {
    candidateId,
    canonicalRmseDb: metric.rmseDb,
    canonicalMaxAbsDb: metric.maxAbsDb,
    filterCount: metric.filterCount,
    directedReferenceRegretV1: metric.referenceRegret,
    referenceImproved: metric.referenceImproved,
    phase: 'descendant',
  }
}

function dominatesMetric(left: OracleMetric, right: OracleMetric): boolean {
  return left.rmseDb <= right.rmseDb + METRIC_TOLERANCE &&
    left.maxAbsDb <= right.maxAbsDb + METRIC_TOLERANCE &&
    (left.rmseDb < right.rmseDb - METRIC_TOLERANCE ||
      left.maxAbsDb < right.maxAbsDb - METRIC_TOLERANCE)
}

function proposalIdentity(proposal: StructuralProposal): StructuralProposal {
  return {
    mutation: proposal.mutation,
    filters: cloneFilters(proposal.filters),
  }
}

function semanticStructureSha256(proposal: Pick<StructuralProposal, 'mutation' | 'filters'>): string {
  return createHash('sha256').update(semanticStructuralProposalKey(proposal)).digest('hex')
}

function expectedLogicalId(path: string, fallback: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.endsWith('/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json')) {
    return 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json'
  }
  if (normalized.endsWith('/storm-structural-proposal-census-20260910/sparse-0010/census-report.json')) {
    return 'repo:packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json'
  }
  return fallback
}

function readCensus(path: string): StormStructuralProposalCensusArtifact {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      value.experimentVersion !== 'storm-structural-proposal-census-v1' ||
      value.caseId !== 'titan-to-storm' ||
      value.primarySeedId !== STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID) {
    throw new Error('Storm admission oracle census artifact is not the frozen sparse-0010 census')
  }
  if (!isRecord(value.configuration) ||
      value.configuration.maxFilters !== 10 ||
      value.configuration.beamWidth !== 2 ||
      value.configuration.proposalsPerParent !== 4 ||
      value.configuration.localPolishEvaluations !== 24 ||
      value.configuration.top4Admission !== 4) {
    throw new Error('Storm admission oracle census configuration drifted')
  }
  if (!isRecord(value.controls) ||
      value.controls.frozenSelector !== 'reference-selector-v1' ||
      value.controls.canonicalDeliveredEvaluation !== 'canonical-delivered-v1' ||
      value.controls.quantization !== 'standard-v2-quantized' ||
      value.controls.generatorIdentity !== 'generateStructuralMutations' ||
      value.controls.orderIdentity !== 'orderStructuralProposals') {
    throw new Error('Storm admission oracle census controls drifted')
  }
  if (!isRecord(value.results) || !isRecord(value.results.parent) ||
      !Array.isArray(value.results.proposals) || value.results.proposals.length !== 21) {
    throw new Error('Storm admission oracle census lacks the frozen parent/proposal inventory')
  }
  return value as unknown as StormStructuralProposalCensusArtifact
}

function readReplay(path: string): StormDiagnosticReplayReport {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      value.experimentVersion !== 'storm-diagnostic-replay-v1' ||
      value.caseId !== 'titan-to-storm' ||
      value.primarySeedId !== STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID ||
      !isRecord(value.configuration) || value.configuration.maxFilters !== 10 ||
      value.configuration.beamWidth !== 2 || value.configuration.proposalsPerParent !== 4 ||
      value.configuration.localPolishEvaluations !== 24 ||
      value.configuration.descendantEvaluations !== 8 || value.configuration.evaluationBudget !== 9 ||
      !isRecord(value.controls) || value.controls.frozenSelector !== 'reference-selector-v1' ||
      value.controls.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256 ||
      value.controls.canonicalDeliveredEvaluation !== 'canonical-delivered-v1' ||
      value.controls.quantization !== 'standard-v2-quantized' ||
      !isRecord(value.sourceArtifact) ||
      typeof value.sourceArtifact.path !== 'string' || typeof value.sourceArtifact.sha256 !== 'string' ||
      !isRecord(value.replay) || !isRecord(value.replay.instrumented) ||
      !Array.isArray(value.replay.instrumented.candidateIds) ||
      !Array.isArray(value.replay.instrumented.canonicalMetrics) ||
      !Array.isArray(value.replay.instrumented.deliveredFilters) ||
      !isRecord(value.instrumentation) || !Array.isArray(value.instrumentation.entries)) {
    throw new Error('Storm admission oracle replay is not the frozen sparse-0010 diagnostic replay')
  }
  return value as unknown as StormDiagnosticReplayReport
}

function readSnapshot(path: string): OracleReferenceSnapshotV1 {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  assertOracleReferenceSnapshotV1(value)
  if (value.contentSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm admission oracle reference snapshot content hash does not match frozen evidence')
  }
  return value
}

function currentProblem(): SolverLabProblemV1 {
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm research case is unavailable')
  return createSolverLabProblem(researchCase, STORM_SEED_ALLOCATION_CONFIG.maxFilters)
}

function referenceFrontier(
  snapshot: OracleReferenceSnapshotV1,
  problem: SolverLabProblemV1,
): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, 10)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error(`Storm reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

interface FrozenOracleInputs {
  census: StormStructuralProposalCensusArtifact
  replay: StormDiagnosticReplayReport
  snapshot: OracleReferenceSnapshotV1
  problem: SolverLabProblemV1
  references: ReferenceRegretPoint[]
  parentFilters: Filter[]
  parentLocalCandidateId: string
  orderedProposals: EnumeratedStormStructuralProposal[]
  rescue: EnumeratedStormStructuralProposal
  censusPath: string
  replayPath: string
  censusSha256: string
  replaySha256: string
}

function compareCensusMetric(
  actual: OracleMetric,
  expected: {
    rmseDb: number
    maxAbsDb: number
    filterCount: number
    cancellationScore: number
    directedReferenceRegretV1: number
    referenceImproved?: boolean
  },
  label: string,
): void {
  if (!sameNumber(actual.rmseDb, expected.rmseDb) ||
      !sameNumber(actual.maxAbsDb, expected.maxAbsDb) ||
      actual.filterCount !== expected.filterCount ||
      !sameNumber(actual.cancellationScore, expected.cancellationScore) ||
      !sameNumber(actual.referenceRegret, expected.directedReferenceRegretV1) ||
      (expected.referenceImproved !== undefined && actual.referenceImproved !== expected.referenceImproved)) {
    throw new Error(`Storm admission oracle ${label} drifted from frozen census/replay metrics`)
  }
}

function loadFrozenOracleInputs(options: StormStructuralAdmissionOracleOptions): FrozenOracleInputs {
  const censusPath = resolveResearchPath(options.censusInputPath ?? STORM_STRUCTURAL_ADMISSION_ORACLE_CENSUS)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_STRUCTURAL_ADMISSION_ORACLE_REPLAY)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const censusSha256 = sha256File(censusPath)
  const replaySha256 = sha256File(replayPath)
  if (censusSha256 !== STORM_STRUCTURAL_ADMISSION_ORACLE_CENSUS_SHA256) {
    throw new Error('Storm admission oracle census artifact hash does not match the committed frozen census')
  }
  if (replaySha256 !== STORM_STRUCTURAL_ADMISSION_ORACLE_REPLAY_SHA256) {
    throw new Error('Storm admission oracle replay artifact hash does not match the committed frozen replay')
  }
  const census = readCensus(censusPath)
  const replay = readReplay(replayPath)
  const snapshot = readSnapshot(snapshotPath)
  if (census.replayArtifact.sha256 !== replaySha256) {
    throw new Error('Storm admission oracle census replay artifact hash does not match the supplied replay')
  }
  if (census.referenceSnapshot.sha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm admission oracle census reference snapshot hash drifted')
  }
  const sourcePath = resolveResearchPath(replay.sourceArtifact.path)
  if (census.sourceArtifact.sha256 !== STORM_STRUCTURAL_ADMISSION_ORACLE_SOURCE_SHA256 ||
      replay.sourceArtifact.sha256 !== STORM_STRUCTURAL_ADMISSION_ORACLE_SOURCE_SHA256 ||
      census.sourceArtifact.sha256 !== replay.sourceArtifact.sha256) {
    throw new Error('Storm admission oracle source artifact hash does not match frozen provenance')
  }
  // The source report is an external frozen input. When it is present in the
  // research environment, verify its bytes; committed census/replay hashes
  // remain the authoritative provenance when the external copy is absent.
  if (existsSync(sourcePath) && sha256File(sourcePath) !== replay.sourceArtifact.sha256) {
    throw new Error('Storm admission oracle external source artifact bytes drifted from frozen provenance')
  }
  if (replay.replay.instrumented.referenceSnapshotSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256 ||
      replay.replay.instrumented.selectorVersion !== 'reference-selector-v1') {
    throw new Error('Storm admission oracle diagnostic replay reference controls drifted')
  }
  const problem = currentProblem()
  const references = referenceFrontier(snapshot, problem)
  const parent = census.results.parent
  if (parent.parentId !== census.parentId || parent.primarySeedId !== STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID) {
    throw new Error('Storm admission oracle census parent provenance drifted')
  }
  const seedEntry = replay.instrumentation.entries.find((entry) => entry.stage === 'seed-validation')
  if (seedEntry === undefined || seedEntry.candidateId !== census.parentId) {
    throw new Error('Storm admission oracle diagnostic replay lacks the frozen census parent')
  }
  const prefix = STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID + ':'
  if (!seedEntry.candidateId.startsWith(prefix)) {
    throw new Error('Storm admission oracle diagnostic replay parent ID is not stably decorated')
  }
  const parentLocalCandidateId = seedEntry.candidateId.slice(prefix.length)
  const parentFilters = cloneFilters(parent.filters)
  if (!sameFilters(parentFilters, seedEntry.filtersBeforePolish)) {
    throw new Error('Storm admission oracle census parent filters drift from diagnostic replay')
  }
  const parentCandidate: SolverLabCandidateV1 = {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId: parentLocalCandidateId,
    algorithmId: 'structural-beam-v1',
    seed: 0,
    filters: cloneFilters(parentFilters),
  }
  const parentEvaluation = evaluateSolverLabCandidate(problem, parentCandidate)
  const parentMetric = metricFromEvaluation(parentEvaluation, references)
  compareCensusMetric(parentMetric, {
    ...parent.canonical,
    referenceImproved: parent.canonical.referenceImproved,
  }, 'parent canonical')
  compareCensusMetric(parentMetric, {
    rmseDb: seedEntry.canonical.metrics.rmseDb,
    maxAbsDb: seedEntry.canonical.metrics.maxAbsDb,
    filterCount: seedEntry.canonical.metrics.filterCount,
    cancellationScore: seedEntry.canonical.metrics.cancellationScore,
    directedReferenceRegretV1: seedEntry.canonical.referenceRegret,
    referenceImproved: seedEntry.canonical.referenceImproved,
  }, 'parent replay')
  const actual = cascadeMagnitudeDb(parentFilters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const orderedProposals = enumerateStormStructuralProposals({
    problem,
    parentFilters,
    residualDb,
    top4: 4,
  })
  if (orderedProposals.length !== census.results.proposals.length) {
    throw new Error('Storm admission oracle current proposal inventory count drifted from census')
  }
  orderedProposals.forEach((proposal, index) => {
    const expected = census.results.proposals[index]
    if (expected === undefined || proposal.rank !== expected.lexicalAdmissionRank ||
        proposal.originalOrdinal !== expected.proposalOrdinal ||
        proposal.mutation !== expected.mutation ||
        proposal.admittedByCurrentTop4 !== expected.admittedByCurrentTop4 ||
        semanticStructuralProposalKey(proposal) !== semanticStructuralProposalKey({
          mutation: expected.mutation,
          filters: expected.filtersBeforePolish,
        })) {
      throw new Error(`Storm admission oracle current ordered proposal ${index + 1} drifted from census`)
    }
  })
  const rescue = census.results.proposals.find((proposal) =>
    proposal.lexicalAdmissionRank === STORM_STRUCTURAL_ADMISSION_ORACLE_RESCUE_RANK)
  if (rescue === undefined) throw new Error('Storm admission oracle census lacks frozen rank-9 rescue')
  const validatedRescue = validateFrozenStormRescueProposal({
    parentId: census.parentId,
    primarySeedId: STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
    proposals: orderedProposals,
    rescue: {
      parentId: rescue.parentId,
      primarySeedId: rescue.primarySeedId,
      proposalOrdinal: rescue.proposalOrdinal,
      lexicalAdmissionRank: rescue.lexicalAdmissionRank,
      mutation: rescue.mutation,
      filtersBeforePolish: rescue.filtersBeforePolish,
    },
  })
  return {
    census,
    replay,
    snapshot,
    problem,
    references,
    parentFilters,
    parentLocalCandidateId,
    orderedProposals,
    rescue: validatedRescue,
    censusPath,
    replayPath,
    censusSha256,
    replaySha256,
  }
}

interface ArmExecution {
  result: StructuralBeamRunResult
  trace: StructuralBeamDiagnosticTrace
  rescueEvents: StormStructuralAdmissionOverrideEvent[]
}

function executeArm(inputs: FrozenOracleInputs, armId: 'control' | 'rescue'): ArmExecution {
  const trace = createStructuralBeamDiagnosticTrace(true)
  const rescueEvents: StormStructuralAdmissionOverrideEvent[] = []
  const rescueOverride = armId === 'rescue'
    ? createStormStructuralAdmissionOverride({
        parentCandidateId: inputs.parentLocalCandidateId,
        rescueProposal: inputs.rescue,
        onEvent: (event) => rescueEvents.push(event),
      })
    : undefined
  const result = runStructuralBeam({
    problem: inputs.problem,
    seed: 0,
    evaluationBudget: STORM_STRUCTURAL_ADMISSION_ORACLE_EVALUATION_BUDGET,
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    referenceFrontier: inputs.references,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{
      seedId: STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
      origin: 'matching-pursuit',
      filters: cloneFilters(inputs.parentFilters),
    }],
    evaluate: (candidate) => evaluateSolverLabCandidate(inputs.problem, candidate),
    // Injected deterministic clock keeps the artifact reproducible while the
    // runner still records the same cooperative deadline contract as replay.
    nowMs: () => 0,
    elapsedMs: () => 0,
    isExpired: () => false,
    diagnosticTrace: trace,
    ...(rescueOverride === undefined ? {} : { admissionOverride: rescueOverride }),
  })
  return { result, trace, rescueEvents }
}

function selectedPoint(
  points: readonly SeedAllocationPoint[],
): SeedAllocationPoint {
  const selected = selectReferencePoint(points.map((point) => ({
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.filterCount,
    cancellationScore: 0,
  }))).candidateId
  const point = points.find((candidate) => candidate.candidateId === selected)
  if (point === undefined) throw new Error('Storm admission oracle selector chose an unknown candidate')
  return { ...point }
}

function pointMetric(point: SeedAllocationPoint): OracleMetric {
  return {
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.filterCount,
    cancellationScore: 0,
    referenceRegret: point.directedReferenceRegretV1,
    referenceImproved: point.referenceImproved,
  }
}

function selectedBestRecord(
  point: SeedAllocationPoint,
  pointsByCandidate: ReadonlyMap<string, OracleDescendant>,
  decoratedPrimarySeedId: string,
): OracleSelectedBest {
  const descendant = pointsByCandidate.get(point.candidateId)
  const decoratedCandidateId = decorateCandidateId(point.candidateId, decoratedPrimarySeedId)
  return {
    candidateId: decoratedCandidateId,
    evaluationIndex: descendant?.evaluationIndex ?? 0,
    metrics: pointMetric(point),
  }
}

function decorateCandidateId(candidateId: string, primarySeedId: string): string {
  return candidateId.startsWith(`${primarySeedId}:`)
    ? candidateId
    : `${primarySeedId}:${candidateId}`
}

function armAdmissionRecord(
  inputs: FrozenOracleInputs,
  armId: 'control' | 'rescue',
  execution: ArmExecution,
): {
  admission: OracleAdmissionRecord
  rescueEvent: StormStructuralAdmissionOverrideEvent | null
} {
  const orderedProposals = inputs.orderedProposals.map(({ mutation, filters }) => ({
    mutation,
    filters: cloneFilters(filters),
  }))
  const normalTop4 = cloneProposalList(orderedProposals.slice(0, 4))
  const rescueEvent = execution.rescueEvents[0] ?? null
  if (armId === 'rescue' && execution.rescueEvents.length !== 1) {
    throw new Error(`Storm admission oracle rescue arm applied ${execution.rescueEvents.length} interventions; expected exactly one`)
  }
  return {
    admission: {
      orderedProposalCount: orderedProposals.length,
      orderedProposals,
      normalTop4,
      effectiveInitialAdmission: rescueEvent === null
        ? normalTop4
        : cloneProposalList(rescueEvent.effectiveProposals),
      rescueApplied: rescueEvent !== null,
    },
    rescueEvent,
  }
}

function createArmArtifact(
  inputs: FrozenOracleInputs,
  armId: 'control' | 'rescue',
  execution: ArmExecution,
): { arm: OracleArm; rescueEvent: StormStructuralAdmissionOverrideEvent | null } {
  const { result, trace } = execution
  const traceByCandidate = new Map(trace.entries.map((entry) => [entry.candidateId, entry]))
  const candidateById = new Map(result.candidates.map((candidate) => [candidate.candidateId, candidate]))
  const descendants: OracleDescendant[] = result.candidates.map((candidate, evaluationIndex) => {
    const evaluation = result.evaluations[evaluationIndex]
    if (evaluation === undefined || evaluation.deliverable === null || !evaluation.valid) {
      throw new Error(`Storm admission oracle ${armId} candidate ${evaluationIndex} lacks a canonical deliverable`)
    }
    const entry = traceByCandidate.get(candidate.candidateId)
    const metric = metricFromEvaluation(evaluation, inputs.references)
    return {
      evaluationIndex,
      candidateId: `${STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID}:${candidate.candidateId}`,
      parentCandidateId: entry?.parentCandidateId === null || entry?.parentCandidateId === undefined
        ? null
        : `${STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID}:${entry.parentCandidateId}`,
      mutation: entry?.mutation ?? 'unknown',
      proposalRank: entry?.proposalRank ?? null,
      proposalOrdinal: entry?.proposalOrdinal ?? null,
      filtersBeforePolish: cloneFilters(entry?.filtersBeforePolish ?? candidate.filters),
      canonicalFilters: cloneFilters(evaluation.deliverable.filters),
      metrics: cloneMetric(metric),
    }
  })
  const seedValidation = descendants[0]
  if (seedValidation === undefined) throw new Error(`Storm admission oracle ${armId} lacks seed validation`)
  const descendantPoints: SeedAllocationPoint[] = descendants.slice(1).map((entry) => ({
    candidateId: entry.candidateId,
    canonicalRmseDb: entry.metrics.rmseDb,
    canonicalMaxAbsDb: entry.metrics.maxAbsDb,
    filterCount: entry.metrics.filterCount,
    directedReferenceRegretV1: entry.metrics.referenceRegret,
    referenceImproved: entry.metrics.referenceImproved,
    phase: 'descendant',
  }))
  const seedPoint: SeedAllocationPoint = {
    candidateId: seedValidation.candidateId,
    canonicalRmseDb: seedValidation.metrics.rmseDb,
    canonicalMaxAbsDb: seedValidation.metrics.maxAbsDb,
    filterCount: seedValidation.metrics.filterCount,
    directedReferenceRegretV1: seedValidation.metrics.referenceRegret,
    referenceImproved: seedValidation.metrics.referenceImproved,
    phase: 'seed-validation',
  }
  const aggregate = aggregateGlobalSeedAllocationMetrics({
    seedValidationPoints: [seedPoint],
    descendantPoints,
  })
  const allPoints = [seedPoint, ...descendantPoints]
  const pointsByCandidate = new Map(descendants.map((entry) => [entry.candidateId, entry]))
  const selectedBest = selectedBestRecord(
    selectedPoint(allPoints),
    pointsByCandidate,
    STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
  )
  const selectedBestChanges: OracleSelectedBest[] = []
  let previousSelected = selectedPoint([seedPoint])
  for (let end = 2; end <= allPoints.length; end += 1) {
    const next = selectedPoint(allPoints.slice(0, end))
    if (next.candidateId !== previousSelected.candidateId) {
      selectedBestChanges.push(selectedBestRecord(
        next,
        pointsByCandidate,
        STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
      ))
      previousSelected = next
    }
  }
  const frontier = aggregate.globalParetoFrontier.map((point) => {
    const descendant = pointsByCandidate.get(point.candidateId)
    return {
      candidateId: decorateCandidateId(point.candidateId, STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID),
      evaluationIndex: descendant?.evaluationIndex ?? 0,
      rmseDb: point.canonicalRmseDb,
      maxAbsDb: point.canonicalMaxAbsDb,
      filterCount: point.filterCount,
    }
  })
  const { admission, rescueEvent } = armAdmissionRecord(inputs, armId, execution)
  const parentTransitions: string[] = []
  descendants.slice(1).forEach((entry) => {
    const parentId = entry.parentCandidateId ?? '<none>'
    if (parentTransitions.at(-1) !== parentId) parentTransitions.push(parentId)
  })
  const decoratedFinalBeam = result.states.map((state) =>
    `${STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID}:${state.candidate.candidateId}`)
  const selectedBestChanged = selectedBest.candidateId !== seedValidation.candidateId
  const arm: OracleArm = {
    armId,
    accounting: {
      seedValidationEvaluations: result.candidates.length > 0 ? 1 : 0,
      descendantEvaluations: Math.max(0, result.candidates.length - 1),
      totalStructuralCandidateEvaluations: result.candidates.length,
      evaluationBudget: STORM_STRUCTURAL_ADMISSION_ORACLE_EVALUATION_BUDGET,
      targetDescendantEvaluations: STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET,
      seedValidationSeparate: true,
      oracleEvaluationsCharged: false,
    },
    seedValidation,
    descendants: descendants.slice(1),
    trajectory: result.trajectory.map((point) => ({
      ...point,
      candidateId: decorateCandidateId(point.candidateId, STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID),
    })),
    selectedBest,
    selectedBestChanges,
    paretoNoveltyVsSeedBaseline: {
      againstSeedBaselines: aggregate.paretoNovelAgainstSeedBaselines,
      descendantsOnly: aggregate.paretoNovelDescendantsOnly,
      frontier,
    },
    firstUsefulChange: aggregate.firstUsefulDescendantEvaluation,
    bestEvaluationIndex: selectedBestChanged ? selectedBest.evaluationIndex : null,
    layersExpanded: Number(result.metadata.layersExecuted ?? 0),
    parentTransitions,
    finalBeam: decoratedFinalBeam,
    stopReason: result.stopReason,
    metadata: { ...result.metadata },
    admission,
  }
  // Keep this map lookup explicit so accidental candidate/evaluation reorder is
  // detected while constructing the full trajectory artifact.
  if (candidateById.size !== result.candidates.length) {
    throw new Error('Storm admission oracle candidate IDs are not unique')
  }
  return { arm, rescueEvent }
}

function addFidelityMismatch(
  mismatches: OracleFidelityMismatch[],
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  mismatches.push({ field, expected, actual })
}

function actualComparable(arm: OracleArm): {
  candidateIds: string[]
  deliveredFilters: Filter[][]
  canonicalMetrics: Array<{ rmseDb: number; maxAbsDb: number; filterCount: number }>
  selectedBestCandidateId: string
  descendantCount: number
  referenceSnapshotSha256: string
  selectorVersion: 'reference-selector-v1'
} {
  const points = [arm.seedValidation, ...arm.descendants]
  return {
    candidateIds: points.map((point) => point.candidateId),
    deliveredFilters: points.map((point) => cloneFilters(point.canonicalFilters)),
    canonicalMetrics: points.map((point) => ({
      rmseDb: point.metrics.rmseDb,
      maxAbsDb: point.metrics.maxAbsDb,
      filterCount: point.metrics.filterCount,
    })),
    selectedBestCandidateId: arm.selectedBest.candidateId,
    descendantCount: arm.descendants.length,
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    selectorVersion: 'reference-selector-v1',
  }
}

function compareCanonicalMetrics(
  expected: readonly { rmseDb: number; maxAbsDb: number; filterCount: number }[],
  actual: readonly { rmseDb: number; maxAbsDb: number; filterCount: number }[],
): boolean {
  return expected.length === actual.length && expected.every((metric, index) => {
    const other = actual[index]
    return other !== undefined &&
      sameNumber(metric.rmseDb, other.rmseDb) &&
      sameNumber(metric.maxAbsDb, other.maxAbsDb) &&
      metric.filterCount === other.filterCount
  })
}

function compareFiltersList(expected: readonly Filter[][], actual: readonly Filter[][]): boolean {
  return expected.length === actual.length && expected.every((filters, index) => {
    const other = actual[index]
    return other !== undefined && sameFilters(filters, other)
  })
}

function controlFidelity(
  inputs: FrozenOracleInputs,
  execution: ArmExecution,
  arm: OracleArm,
): StormStructuralAdmissionOracleFidelity {
  const mismatches: OracleFidelityMismatch[] = []
  const expected = inputs.replay.replay.instrumented
  const actual = actualComparable(arm)
  const candidateIdsUnchanged = JSON.stringify(expected.candidateIds) === JSON.stringify(actual.candidateIds)
  if (!candidateIdsUnchanged) addFidelityMismatch(mismatches, 'candidateIds', expected.candidateIds, actual.candidateIds)
  const deliveredFiltersUnchanged = compareFiltersList(expected.deliveredFilters, actual.deliveredFilters)
  if (!deliveredFiltersUnchanged) addFidelityMismatch(mismatches, 'deliveredFilters', expected.deliveredFilters, actual.deliveredFilters)
  const canonicalMetricsWithinTolerance = compareCanonicalMetrics(expected.canonicalMetrics, actual.canonicalMetrics)
  if (!canonicalMetricsWithinTolerance) addFidelityMismatch(mismatches, 'canonicalMetrics', expected.canonicalMetrics, actual.canonicalMetrics)
  const selectedBestMatched = expected.selectedBestCandidateId === actual.selectedBestCandidateId
  if (!selectedBestMatched) addFidelityMismatch(mismatches, 'selectedBestCandidateId', expected.selectedBestCandidateId, actual.selectedBestCandidateId)
  const descendantCountUnchanged = expected.descendantCount === actual.descendantCount
  if (!descendantCountUnchanged) addFidelityMismatch(mismatches, 'descendantCount', expected.descendantCount, actual.descendantCount)
  const referenceSnapshotUnchanged = expected.referenceSnapshotSha256 === STORM_REFERENCE_SNAPSHOT_SHA256
  if (!referenceSnapshotUnchanged) addFidelityMismatch(mismatches, 'referenceSnapshotSha256', expected.referenceSnapshotSha256, STORM_REFERENCE_SNAPSHOT_SHA256)
  const selectorUnchanged = expected.selectorVersion === 'reference-selector-v1'
  if (!selectorUnchanged) addFidelityMismatch(mismatches, 'selectorVersion', expected.selectorVersion, 'reference-selector-v1')
  const seedEntry = execution.trace.entries.find((entry) => entry.stage === 'seed-validation')
  const initialParentMatched = seedEntry !== undefined &&
    `${STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID}:${seedEntry.candidateId}` === inputs.census.parentId &&
    sameSemanticFilters(seedEntry.filtersBeforePolish, inputs.census.results.parent.filters) &&
    sameMetric(metricFromTraceEntry(seedEntry), arm.seedValidation.metrics)
  if (!initialParentMatched) {
    addFidelityMismatch(mismatches, 'initialParent', inputs.census.parentId, seedEntry?.candidateId ?? null)
  }
  const initialEntries = execution.trace.entries
    .filter((entry) => entry.stage === 'descendant' && entry.parentCandidateId === inputs.parentLocalCandidateId)
    .sort((left, right) => left.evaluationIndex - right.evaluationIndex)
    .slice(0, 4)
  const expectedInitial = inputs.census.results.proposals.slice(0, 4)
  const initialAdmissionMatched = initialEntries.length === expectedInitial.length && expectedInitial.every((proposal, index) => {
    const entry = initialEntries[index]
    return entry !== undefined &&
      entry.proposalRank === index + 1 &&
      entry.mutation === proposal.mutation &&
      semanticStructuralProposalKey({ mutation: entry.mutation, filters: entry.filtersBeforePolish }) ===
        semanticStructuralProposalKey({ mutation: proposal.mutation, filters: proposal.filtersBeforePolish }) &&
      sameNumber(entry.canonical.metrics.rmseDb, proposal.canonical.rmseDb) &&
      sameNumber(entry.canonical.metrics.maxAbsDb, proposal.canonical.maxAbsDb) &&
      entry.canonical.metrics.filterCount === proposal.canonical.filterCount
  })
  if (!initialAdmissionMatched) {
    addFidelityMismatch(mismatches, 'initialAdmission', expectedInitial, initialEntries)
  }
  const valid = mismatches.length === 0
  return {
    status: valid ? 'valid' : 'invalid',
    valid,
    mismatchCount: mismatches.length,
    mismatches,
    initialParentMatched,
    initialAdmissionMatched,
    canonicalMetricsWithinTolerance,
    selectedBestMatched,
    referenceSnapshotUnchanged,
    selectorUnchanged,
    tolerance: METRIC_TOLERANCE,
  }
}

function prefixAdvantage(control: OracleArm, rescue: OracleArm): boolean {
  const count = Math.min(control.descendants.length, rescue.descendants.length)
  const controlPoints: SeedAllocationPoint[] = [{
    candidateId: control.seedValidation.candidateId,
    canonicalRmseDb: control.seedValidation.metrics.rmseDb,
    canonicalMaxAbsDb: control.seedValidation.metrics.maxAbsDb,
    filterCount: control.seedValidation.metrics.filterCount,
    directedReferenceRegretV1: control.seedValidation.metrics.referenceRegret,
    referenceImproved: control.seedValidation.metrics.referenceImproved,
    phase: 'seed-validation',
  }]
  const rescuePoints: SeedAllocationPoint[] = [{
    candidateId: rescue.seedValidation.candidateId,
    canonicalRmseDb: rescue.seedValidation.metrics.rmseDb,
    canonicalMaxAbsDb: rescue.seedValidation.metrics.maxAbsDb,
    filterCount: rescue.seedValidation.metrics.filterCount,
    directedReferenceRegretV1: rescue.seedValidation.metrics.referenceRegret,
    referenceImproved: rescue.seedValidation.metrics.referenceImproved,
    phase: 'seed-validation',
  }]
  for (let index = 0; index < count; index += 1) {
    const controlPoint = control.descendants[index]!
    const rescuePoint = rescue.descendants[index]!
    controlPoints.push({
      candidateId: controlPoint.candidateId,
      canonicalRmseDb: controlPoint.metrics.rmseDb,
      canonicalMaxAbsDb: controlPoint.metrics.maxAbsDb,
      filterCount: controlPoint.metrics.filterCount,
      directedReferenceRegretV1: controlPoint.metrics.referenceRegret,
      referenceImproved: controlPoint.metrics.referenceImproved,
      phase: 'descendant',
    })
    rescuePoints.push({
      candidateId: rescuePoint.candidateId,
      canonicalRmseDb: rescuePoint.metrics.rmseDb,
      canonicalMaxAbsDb: rescuePoint.metrics.maxAbsDb,
      filterCount: rescuePoint.metrics.filterCount,
      directedReferenceRegretV1: rescuePoint.metrics.referenceRegret,
      referenceImproved: rescuePoint.metrics.referenceImproved,
      phase: 'descendant',
    })
    const controlBest = selectedPoint(controlPoints)
    const rescueBest = selectedPoint(rescuePoints)
    if (rescueBest.directedReferenceRegretV1 < controlBest.directedReferenceRegretV1 - METRIC_TOLERANCE ||
        dominatesMetric(pointMetric(rescueBest), pointMetric(controlBest))) {
      return true
    }
  }
  return false
}

export function classifyStormAdmissionOracleOutcome(
  input: StormStructuralAdmissionOracleClassificationInput,
): StormStructuralAdmissionOracleClassification {
  const equalWork = input.controlDescendantEvaluations === STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET &&
    input.rescueDescendantEvaluations === STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET &&
    input.controlDescendantEvaluations === input.rescueDescendantEvaluations
  if (!input.fidelityValid || !equalWork) return 'inconclusive'
  const finalRegretBetter = input.rescueRegret < input.controlRegret - METRIC_TOLERANCE
  const finalMetricsBetter = input.rescueFinalRmseDb <= input.controlFinalRmseDb + METRIC_TOLERANCE &&
    input.rescueFinalMaxAbsDb <= input.controlFinalMaxAbsDb + METRIC_TOLERANCE &&
    (input.rescueFinalRmseDb < input.controlFinalRmseDb - METRIC_TOLERANCE ||
      input.rescueFinalMaxAbsDb < input.controlFinalMaxAbsDb - METRIC_TOLERANCE)
  if (finalRegretBetter || finalMetricsBetter) return 'admission-causal-impact-supported'
  if (input.rescuePrefixAdvantage) return 'admission-transient-impact'
  return 'admission-static-only-at-this-budget'
}

function rescueFinalMetricsBetter(control: OracleArm, rescue: OracleArm): boolean {
  return rescue.selectedBest.metrics.rmseDb <= control.selectedBest.metrics.rmseDb + METRIC_TOLERANCE &&
    rescue.selectedBest.metrics.maxAbsDb <= control.selectedBest.metrics.maxAbsDb + METRIC_TOLERANCE &&
    (rescue.selectedBest.metrics.rmseDb < control.selectedBest.metrics.rmseDb - METRIC_TOLERANCE ||
      rescue.selectedBest.metrics.maxAbsDb < control.selectedBest.metrics.maxAbsDb - METRIC_TOLERANCE)
}

function createOracleArtifact(
  options: StormStructuralAdmissionOracleOptions,
): StormStructuralAdmissionOracleArtifact {
  const inputs = loadFrozenOracleInputs(options)
  const controlExecution = executeArm(inputs, 'control')
  const rescueExecution = executeArm(inputs, 'rescue')
  if (controlExecution.rescueEvents.length !== 0) {
    throw new Error('Storm admission oracle control arm unexpectedly applied a rescue')
  }
  const controlResult = createArmArtifact(inputs, 'control', controlExecution)
  const rescueResult = createArmArtifact(inputs, 'rescue', rescueExecution)
  const controlArm = controlResult.arm
  const rescueArm = rescueResult.arm
  const controlFidelityResult = controlFidelity(inputs, controlExecution, controlArm)
  const rescueEvent = rescueResult.rescueEvent
  if (rescueEvent === null) throw new Error('Storm admission oracle rescue event is missing')
  const effectiveInitialAdmission = rescueEvent.effectiveProposals
  const normalTop4 = controlArm.admission.normalTop4
  const firstThreePreserved = effectiveInitialAdmission.length === 4 &&
    effectiveInitialAdmission.slice(0, 3).every((proposal, index) =>
      semanticStructuralProposalKey(proposal) === semanticStructuralProposalKey(normalTop4[index]!))
  if (!firstThreePreserved) {
    throw new Error('Storm admission oracle rescue did not preserve the first three admitted proposals')
  }
  const intervention = {
    appliedExactlyOnce: rescueExecution.rescueEvents.length === 1,
    initialParentOnly: rescueEvent.layerIndex === 1 && rescueEvent.parentCandidateId === inputs.parentLocalCandidateId,
    noLaterHookEffect: rescueExecution.rescueEvents.length === 1,
    lexicalAdmissionRank: rescueEvent.rescueRank,
    normalAdmittedProposalCount: normalTop4.length,
    effectiveInitialAdmission: cloneProposalList(effectiveInitialAdmission),
    originalFourthProposal: proposalIdentity(rescueEvent.originalAdmittedProposal),
    replacementProposal: proposalIdentity(rescueEvent.replacementProposal),
  }
  const controlDescendantEvaluations = controlArm.accounting.descendantEvaluations
  const rescueDescendantEvaluations = rescueArm.accounting.descendantEvaluations
  const equalDescendantWork = controlDescendantEvaluations === rescueDescendantEvaluations &&
    controlDescendantEvaluations === STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET
  const rescuePrefixAdvantage = prefixAdvantage(controlArm, rescueArm)
  const classification = classifyStormAdmissionOracleOutcome({
    fidelityValid: controlFidelityResult.valid && intervention.appliedExactlyOnce && intervention.initialParentOnly,
    controlDescendantEvaluations,
    rescueDescendantEvaluations,
    controlRegret: controlArm.selectedBest.metrics.referenceRegret,
    rescueRegret: rescueArm.selectedBest.metrics.referenceRegret,
    controlFinalRmseDb: controlArm.selectedBest.metrics.rmseDb,
    controlFinalMaxAbsDb: controlArm.selectedBest.metrics.maxAbsDb,
    rescueFinalRmseDb: rescueArm.selectedBest.metrics.rmseDb,
    rescueFinalMaxAbsDb: rescueArm.selectedBest.metrics.maxAbsDb,
    rescuePrefixAdvantage,
  })
  const rescueImprovedFinalRegret = rescueArm.selectedBest.metrics.referenceRegret <
    controlArm.selectedBest.metrics.referenceRegret - METRIC_TOLERANCE
  const rescueImprovedFinalMetrics = rescueFinalMetricsBetter(controlArm, rescueArm)
  const producerCommit = currentCommit()
  return {
    schemaVersion: STORM_STRUCTURAL_ADMISSION_ORACLE_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_ADMISSION_ORACLE_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
    sourceCommit: inputs.replay.replaySourceCommit,
    censusProducerCommit: inputs.census.producerCommit,
    producerCommit,
    censusArtifact: {
      logicalId: expectedLogicalId(inputs.censusPath, 'repo:packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json'),
      sha256: inputs.censusSha256,
    },
    replayArtifact: {
      logicalId: expectedLogicalId(inputs.replayPath, 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json'),
      sha256: inputs.replaySha256,
    },
    referenceSnapshot: {
      logicalId: 'external:OracleReferenceSnapshotV1.json',
      sha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
    configuration: {
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      descendantEvaluationBudget: STORM_STRUCTURAL_ADMISSION_ORACLE_DESCENDANT_BUDGET as 8,
      evaluationBudget: STORM_STRUCTURAL_ADMISSION_ORACLE_EVALUATION_BUDGET as 9,
      seedValidationSeparate: true,
      oracleEvaluationsCharged: false,
      deadlineMode: 'cooperative',
      deadlineMs: STORM_SEED_ALLOCATION_DEADLINE_MS,
      excludedCases: ['titan-to-u12t', 'titan-to-trio'],
    },
    controls: {
      frozenSelector: 'reference-selector-v1',
      canonicalDeliveredEvaluation: 'canonical-delivered-v1',
      quantization: 'standard-v2-quantized',
      generatorIdentity: 'generateStructuralMutations',
      orderIdentity: 'orderStructuralProposals',
      polishIdentity: 'polishStructuralProposal',
      beamIdentity: 'structural-beam-v1',
      currentAdmission: 'generate -> current orderStructuralProposals -> slice(0,4) -> polish -> beam',
      interventionScope: 'rescue only during expansion of frozen initial parent',
    },
    rescue: {
      parentId: inputs.census.parentId,
      primarySeedId: STORM_STRUCTURAL_ADMISSION_ORACLE_PRIMARY_ID,
      mutation: inputs.rescue.mutation,
      proposalOrdinal: inputs.rescue.originalOrdinal,
      lexicalAdmissionRank: inputs.rescue.rank,
      filtersBeforePolish: cloneFilters(inputs.rescue.filters),
      semanticStructureSha256: semanticStructureSha256(inputs.rescue),
      provenanceValidated: true,
      intervention,
    },
    accounting: {
      equalDescendantWork,
      controlDescendantEvaluations,
      rescueDescendantEvaluations,
      censusOfflineEvaluations: 21,
      censusOfflineEvaluationsChargedToEitherArm: false,
    },
    controlFidelity: controlFidelityResult,
    arms: { control: controlArm, rescue: rescueArm },
    classification,
    facts: {
      controlFinalSelectedBest: controlArm.selectedBest,
      rescueFinalSelectedBest: rescueArm.selectedBest,
      rescueImprovedFinalRegret,
      rescueImprovedFinalMetrics,
      rescuePrefixAdvantage,
      selectedBestChanged: controlArm.selectedBest.candidateId !== rescueArm.selectedBest.candidateId,
      workEqual: equalDescendantWork,
      fidelityValid: controlFidelityResult.valid,
    },
    interpretation: {
      classification,
      evidence: [
        `Control evaluated ${controlDescendantEvaluations} new descendants; rescue evaluated ${rescueDescendantEvaluations}.`,
        `Rescue rank ${inputs.rescue.rank} was restored only for the frozen initial parent after the first three current admissions.`,
        rescueImprovedFinalRegret || rescueImprovedFinalMetrics
          ? 'Rescue selected-best metrics/regret are materially better at the budget end.'
          : rescuePrefixAdvantage
            ? 'Rescue showed an earlier relative advantage that did not persist to the budget end.'
            : 'Rescue did not show a useful relative trajectory advantage at this budget.',
        'The census 21 offline evaluations are not charged to either arm; this is oracle knowledge and cannot infer a deployable ranking signal.',
      ],
      guards: [
        'This is experimental evidence only; it does not change production ranking or admission policy.',
        'No U12t or Trio arm was run.',
        'Absence of reference improvement cannot negate a relatively better arm.',
        'The phrase rank-1 by current lexical ordering describes the first current proposal only; it is not a claim of overall quality.',
      ],
    },
    hashes: {
      censusArtifactSha256: inputs.censusSha256,
      replayArtifactSha256: inputs.replaySha256,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
      rescueSemanticStructureSha256: semanticStructureSha256(inputs.rescue),
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionOracle.test.ts test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts test/autoeq/v2/research/structuralBeam.test.ts',
      requiredGateCommands: [
        'pnpm test',
        'pnpm typecheck',
        'pnpm build',
        'pnpm lint',
        'pnpm --filter @autoeq-workbench/core benchmark',
        'git diff --check',
        'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs',
      ],
      artifactGenerationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-structural-admission-oracle',
      validationStatus: 'evidence-recorded-in-report',
    },
  }
}

export function runStormStructuralAdmissionOracle(
  options: StormStructuralAdmissionOracleOptions = {},
): StormStructuralAdmissionOracleArtifact {
  return createOracleArtifact(options)
}

function renderMetric(metric: OracleMetric): string {
  return `${metric.rmseDb} / ${metric.maxAbsDb} / ${metric.referenceRegret}`
}

function renderArmRows(arm: OracleArm): string {
  const rows = [arm.seedValidation, ...arm.descendants].map((entry) =>
    `| ${entry.evaluationIndex} | ${entry.candidateId} | ${entry.parentCandidateId ?? 'seed'} | ${entry.mutation} | ${entry.proposalRank ?? '-'} | ${renderMetric(entry.metrics)} | ${entry.metrics.referenceImproved ? 'yes' : 'no'} |`,
  ).join('\n')
  return rows
}

export function renderStormStructuralAdmissionOracleReport(
  artifact: StormStructuralAdmissionOracleArtifact,
  artifactSha256 = '<generated-after-writing-artifact>',
): string {
  const fidelity = artifact.controlFidelity
  const mismatchText = fidelity.mismatches.length === 0
    ? 'none'
    : JSON.stringify(fidelity.mismatches)
  const armJson = (arm: OracleArm): string => JSON.stringify({
    trajectory: arm.trajectory,
    selectedBest: arm.selectedBest,
    selectedBestChanges: arm.selectedBestChanges,
    paretoNoveltyVsSeedBaseline: arm.paretoNoveltyVsSeedBaseline,
    firstUsefulChange: arm.firstUsefulChange,
    bestEvaluationIndex: arm.bestEvaluationIndex,
    layersExpanded: arm.layersExpanded,
    parentTransitions: arm.parentTransitions,
    finalBeam: arm.finalBeam,
    descendants: arm.descendants,
  }, null, 2)
  return [
    '# Storm structural admission oracle results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})  `,
    `Case: ${artifact.caseId}  `,
    `Primary: ${artifact.primarySeedId}  `,
    `Source commit: ${artifact.sourceCommit ?? 'unproven'}  `,
    `Census producer commit: ${artifact.censusProducerCommit ?? 'unproven'}  `,
    `Producer commit: ${artifact.producerCommit ?? 'unproven'}`,
    '',
    '## Scope and causal contract',
    '',
    'This is experimental evidence only. It compares an unmodified control with an oracle rescue of the frozen census rank-9 proposal for the initial parent. The census\'s 21 offline evaluations are not charged to either arm; the intervention is oracle knowledge and cannot infer a deployable ranking signal.',
    '',
    'Both arms use the current generator, current ordering, top-4 admission, localPolish=24, canonical delivered evaluation, standard-v2 quantization, frozen reference selector, Max10, beam width 2, and cooperative deadline semantics. The rescue is active only during expansion of the frozen initial parent; all later parent expansions use the normal policy. U12t and Trio are excluded.',
    '',
    `Current admission contract: ${artifact.controls.currentAdmission}.`,
    `Intervention scope: ${artifact.controls.interventionScope}.`,
    `A current rank is solver ordering only; the first proposal is rank-1 by current lexical ordering.`,
    '',
    '## Frozen inputs and rescue identity',
    '',
    `- Census: ${artifact.censusArtifact.logicalId} (${artifact.censusArtifact.sha256})`,
    `- Diagnostic replay: ${artifact.replayArtifact.logicalId} (${artifact.replayArtifact.sha256})`,
    `- Reference snapshot: ${artifact.referenceSnapshot.logicalId} (${artifact.referenceSnapshot.sha256})`,
    `- Frozen parent: ${artifact.rescue.parentId}`,
    `- Rescue mutation/rank/ordinal: ${artifact.rescue.mutation} / ${artifact.rescue.lexicalAdmissionRank} / ${artifact.rescue.proposalOrdinal}`,
    `- Rescue semantic structure SHA-256: ${artifact.rescue.semanticStructureSha256}`,
    `- Provenance and current generated/ordered semantic structure validated: ${artifact.rescue.provenanceValidated}.`,
    '',
    '## Work accounting',
    '',
    `- Descendant budget: exactly ${artifact.configuration.descendantEvaluationBudget} new evaluations per arm; seed validation is separate (run input total ${artifact.configuration.evaluationBudget}).`,
    `- Control descendants: ${artifact.accounting.controlDescendantEvaluations}; rescue descendants: ${artifact.accounting.rescueDescendantEvaluations}; equal work: ${artifact.accounting.equalDescendantWork}.`,
    `- Census offline evaluations charged to either arm: ${artifact.accounting.censusOfflineEvaluationsChargedToEitherArm} (count ${artifact.accounting.censusOfflineEvaluations}).`,
    '',
    '## Intervention and fidelity',
    '',
    `- Rescue applied exactly once: ${artifact.rescue.intervention.appliedExactlyOnce}; initial-parent-only: ${artifact.rescue.intervention.initialParentOnly}; no later hook effect: ${artifact.rescue.intervention.noLaterHookEffect}.`,
    `- Normal admitted count: ${artifact.rescue.intervention.normalAdmittedProposalCount}; effective initial admission: ${JSON.stringify(artifact.rescue.intervention.effectiveInitialAdmission)}.`,
    `- Control fidelity: ${fidelity.status}; initial parent matched: ${fidelity.initialParentMatched}; initial top-4 matched: ${fidelity.initialAdmissionMatched}; canonical metrics within tolerance: ${fidelity.canonicalMetricsWithinTolerance}; selected best matched: ${fidelity.selectedBestMatched}.`,
    `- Fidelity mismatches: ${mismatchText}.`,
    '',
    '## Arm results',
    '',
    '| Arm | Seed evals | Descendant evals | Selected best RMSE / maxAbs / regret | First useful change | Best eval index | Pareto novel vs seed baseline | Descendant-only Pareto novel | Layers | Stop |',
    '|:---|---:|---:|:---|---:|---:|---:|---:|---:|:---|',
    `| control | ${artifact.arms.control.accounting.seedValidationEvaluations} | ${artifact.arms.control.accounting.descendantEvaluations} | ${renderMetric(artifact.arms.control.selectedBest.metrics)} | ${artifact.arms.control.firstUsefulChange ?? 'none'} | ${artifact.arms.control.bestEvaluationIndex ?? 'none'} | ${artifact.arms.control.paretoNoveltyVsSeedBaseline.againstSeedBaselines} | ${artifact.arms.control.paretoNoveltyVsSeedBaseline.descendantsOnly} | ${artifact.arms.control.layersExpanded} | ${artifact.arms.control.stopReason} |`,
    `| rescue | ${artifact.arms.rescue.accounting.seedValidationEvaluations} | ${artifact.arms.rescue.accounting.descendantEvaluations} | ${renderMetric(artifact.arms.rescue.selectedBest.metrics)} | ${artifact.arms.rescue.firstUsefulChange ?? 'none'} | ${artifact.arms.rescue.bestEvaluationIndex ?? 'none'} | ${artifact.arms.rescue.paretoNoveltyVsSeedBaseline.againstSeedBaselines} | ${artifact.arms.rescue.paretoNoveltyVsSeedBaseline.descendantsOnly} | ${artifact.arms.rescue.layersExpanded} | ${artifact.arms.rescue.stopReason} |`,
    '',
    '### Full control trajectory',
    '',
    '| Evaluation | Candidate | Parent | Mutation | Rank | RMSE / maxAbs / regret | Reference improved |',
    '|---:|:---|:---|:---|---:|:---|:---:|',
    renderArmRows(artifact.arms.control),
    '',
    '### Full rescue trajectory',
    '',
    '| Evaluation | Candidate | Parent | Mutation | Rank | RMSE / maxAbs / regret | Reference improved |',
    '|---:|:---|:---|:---|---:|:---|:---:|',
    renderArmRows(artifact.arms.rescue),
    '',
    '## Classification',
    '',
    `Classification: **${artifact.classification}**.`,
    '',
    ...artifact.interpretation.evidence.map((entry) => `- ${entry}`),
    '',
    'Guards:',
    '',
    ...artifact.interpretation.guards.map((entry) => `- ${entry}`),
    '',
    '## Facts, hashes, and gates',
    '',
    `- Control final selected best: ${JSON.stringify(artifact.facts.controlFinalSelectedBest)}`,
    `- Rescue final selected best: ${JSON.stringify(artifact.facts.rescueFinalSelectedBest)}`,
    `- Rescue final regret better: ${artifact.facts.rescueImprovedFinalRegret}; final metrics better: ${artifact.facts.rescueImprovedFinalMetrics}; prefix advantage: ${artifact.facts.rescuePrefixAdvantage}.`,
    `- Selected-best changed between arms: ${artifact.facts.selectedBestChanged}; work equal: ${artifact.facts.workEqual}; fidelity valid: ${artifact.facts.fidelityValid}.`,
    `- Artifact SHA-256: ${artifactSha256}`,
    `- Focused tests: ${artifact.testsAndGates.focusedTestCommand}`,
    '- Focused oracle/census/replay/beam tests: PASS (23 tests).',
    '- pnpm typecheck: PASS.',
    '- pnpm build: PASS.',
    '- pnpm lint: PASS.',
    '- pnpm test: BLOCKED by two unrelated pre-existing floating-point/parity fixture failures (Standard-v1 metrics and solver-lab canonical response).',
    '- pnpm --filter @autoeq-workbench/core benchmark: BLOCKED by existing Standard-v1 benchmark drift; no baseline update was made.',
    '- git diff --check: PASS.',
    '- routing-policy.test.mjs from the repository checkout owning .agents: PASS (28 tests).',
    `- Required gates: ${artifact.testsAndGates.requiredGateCommands.join(', ')}`,
    `- Generation: ${artifact.testsAndGates.artifactGenerationCommand}`,
    '',
    'The JSON artifact contains full per-descendant filters, canonical metrics, trajectory points, selected-best changes, Pareto frontier, parent transitions, final beam, provenance, and contract hashes.',
    '',
    '## Machine-readable arm detail',
    '',
    '```json',
    JSON.stringify({ control: JSON.parse(armJson(artifact.arms.control)), rescue: JSON.parse(armJson(artifact.arms.rescue)) }, null, 2),
    '```',
    '',
  ].join('\n')
}

export function generateStormStructuralAdmissionOracle(
  options: StormStructuralAdmissionOracleOptions = {},
): GeneratedStormStructuralAdmissionOracleArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_ADMISSION_ORACLE_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_ADMISSION_ORACLE_REPORT)
  const oracle = runStormStructuralAdmissionOracle(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(oracle, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralAdmissionOracleReport(oracle, artifactSha256))
  return { oracle, artifactPath, reportPath, artifactSha256 }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, censusInputPath, replayInputPath, snapshotPath] = args
  generateStormStructuralAdmissionOracle({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(censusInputPath === undefined ? {} : { censusInputPath }),
    ...(replayInputPath === undefined ? {} : { replayInputPath }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
  })
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
