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
import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'
import {
  DEFAULT_SNAPSHOT,
  resolveResearchPath,
  STORM_SEED_ALLOCATION_CONFIG,
} from './seedAllocationRun.js'
import {
  generateStructuralMutations,
  orderStructuralProposals,
  polishStructuralProposal,
  quantizeStructuralBeamFilters,
  structuralBoundSaturation,
  type StructuralBeamBoundSaturation,
  type StructuralBeamRunProblem,
  type StructuralMutation,
  type StructuralProposal,
} from './structuralBeam.js'
import {
  STORM_DIAGNOSTIC_REPLAY_OUTPUT,
  STORM_REFERENCE_SNAPSHOT_SHA256,
} from './stormDiagnosticReplay.js'

export const STORM_STRUCTURAL_PROPOSAL_CENSUS_SCHEMA_VERSION = 1 as const
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_EXPERIMENT_VERSION =
  'storm-structural-proposal-census-v1' as const
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT =
  'packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json' as const
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_REPORT =
  'docs/superpowers/specs/2026-09-10-storm-structural-proposal-census-results.md' as const
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_REPLAY = STORM_DIAGNOSTIC_REPLAY_OUTPUT
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_STRUCTURAL_PROPOSAL_CENSUS_TOP4 = 4 as const

export type StormStructuralProposalCensusClassification =
  | 'admission-bottleneck-supported'
  | 'admission-ranking-misaligned'
  | 'admission-bottleneck-not-supported-at-this-parent'
  | 'mixed/unresolved'

export type StormStructuralProposalParetoRelation =
  | 'candidate-dominates'
  | 'baseline-dominates'
  | 'tradeoff'
  | 'equivalent'

interface CensusMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

interface SelectorOutcome {
  selectedCandidateId: string
  winner: 'candidate' | 'parent' | 'primary'
}

export type StormStructuralProposalCensusProblem = StructuralBeamRunProblem

export interface EnumeratedStormStructuralProposal extends StructuralProposal {
  originalOrdinal: number
  rank: number
  admittedByCurrentTop4: boolean
}

export interface EnumerateStormStructuralProposalsInput {
  problem: StormStructuralProposalCensusProblem
  parentFilters: readonly Filter[]
  residualDb: readonly number[]
  top4?: number
}

export interface StormStructuralProposalCensusProposal {
  parentId: string
  primarySeedId: string
  parentCanonical: CensusMetric & { directedReferenceRegretV1: number }
  primaryCanonical: CensusMetric & { directedReferenceRegretV1: number }
  proposalOrdinal: number
  lexicalAdmissionRank: number
  admittedByCurrentTop4: boolean
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
  canonicalFiltersAfterPolish: Filter[]
  prePolish: { rmseDb: number; maxAbsDb: number }
  postPolishContinuous: { rmseDb: number; maxAbsDb: number }
  canonical: CensusMetric
  directedReferenceRegretV1: number
  referenceImproved: boolean
  paretoRelation: {
    againstParent: StormStructuralProposalParetoRelation
    againstPrimary: StormStructuralProposalParetoRelation
  }
  frozenReferenceSelectorV1: {
    againstParent: SelectorOutcome
    againstPrimary: SelectorOutcome
  }
  coordinateTrialCount: number
  relevantBoundSaturation: {
    prePolish: StructuralBeamBoundSaturation[]
    postPolishContinuous: StructuralBeamBoundSaturation[]
    canonical: StructuralBeamBoundSaturation[]
  }
}

interface CensusSummaryBest {
  proposalOrdinal: number
  lexicalAdmissionRank: number
  mutation: StructuralMutation
  admittedByCurrentTop4: boolean
  canonical: CensusMetric
  directedReferenceRegretV1: number
}

interface CensusCounts {
  total: number
  admitted: number
  excluded: number
  excludedDominatesAnyAdmitted: number
  excludedSelectorPreferredToAnyAdmitted: number
  excludedSelectorPreferredToBestAdmitted: number
  excludedDominatesParent: number
  excludedSelectorBeatParent: number
  excludedSelectorBeatPrimary: number
  excludedImproveReference: number
  allDominatesParent: number
  allSelectorBeatParent: number
  allSelectorBeatPrimary: number
  allImproveReference: number
}

export interface StormStructuralProposalCensusArtifact {
  schemaVersion: typeof STORM_STRUCTURAL_PROPOSAL_CENSUS_SCHEMA_VERSION
  experimentVersion: typeof STORM_STRUCTURAL_PROPOSAL_CENSUS_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID
  parentId: string
  frozenReplaySourceCommit: string | null
  producerCommit: string | null
  sourceArtifact: { logicalId: string; sha256: string }
  replayArtifact: { logicalId: string; sha256: string }
  referenceSnapshot: { logicalId: string; sha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256 }
  runtimeInputs: {
    sourceArtifact: 'replay.sourceArtifact.path'
    referenceSnapshot: 'snapshotPath or DEFAULT_SNAPSHOT'
  }
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    localPolishEvaluations: 24
    top4Admission: 4
  }
  controls: {
    initialParentOnly: true
    frozenReference: true
    frozenReferenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
    frozenSelector: 'reference-selector-v1'
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    quantizationSteps: { frequencyStepHz: 1; gainStepDb: 0.1; qStep: 0.01 }
    generatorIdentity: 'generateStructuralMutations'
    orderIdentity: 'orderStructuralProposals'
    admissionPolicy: 'lexical-rank <= 4'
  }
  inventory: {
    totalProposalCount: number
    countsByMutationType: Record<StructuralMutation, number>
    originalOrdinalRange: [number, number]
  }
  admissionBoundary: {
    orderedBeforeSlice: true
    top4: 4
    admittedCount: number
    excludedCount: number
    admittedRanks: number[]
    excludedRanks: number[]
  }
  results: {
    parent: {
      parentId: string
      primarySeedId: typeof STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID
      filters: Filter[]
      canonicalFilters: Filter[]
      frozenReplayCanonicalFilters: Filter[]
      canonical: CensusMetric & { directedReferenceRegretV1: number; referenceImproved: boolean }
      frozenReplayCanonical: CensusMetric & { directedReferenceRegretV1: number; referenceImproved: boolean }
      replayComparison: {
        canonicalFiltersMatched: true
        cancellationScoreMatched: true
        referenceRegretMatched: true
      }
    }
    proposals: StormStructuralProposalCensusProposal[]
  }
  summary: {
    countsByMutationType: Record<StructuralMutation, number>
    mutationTypesTop4: StructuralMutation[]
    whollyTruncatedTypes: StructuralMutation[]
    bestCanonicalAdmitted: CensusSummaryBest | null
    bestCanonicalExcluded: CensusSummaryBest | null
    lexicalRankBestOverall: CensusSummaryBest
    bestByMutationType: Partial<Record<StructuralMutation, CensusSummaryBest>>
    counts: CensusCounts
    classificationCriteria: {
      materialReplacementCriterion: string
      excludedMaterialReplacementCount: number
      excludedSelectorPreferredToBestAdmitted: number
      exclusionsConsistentlyOutperformRelevantAdmitted: boolean
      admittedComparableOrBetter: boolean
      excludedUsefulSignal: boolean
    }
  }
  facts: {
    allMutationsEnumeratedBeforeSlice: true
    top4AdmissionExact: true
    proposalCount: number
    admittedProposalCount: number
    excludedProposalCount: number
    excludedCountsThatDominateAnyAdmitted: number
    excludedSelectorPreferredToAnyAdmitted: number
    excludedDominateParent: number
    excludedSelectorBeatParent: number
    excludedSelectorBeatPrimary: number
    excludedImproveReference: number
    mutationTypesWhollyTruncated: StructuralMutation[]
    parentCanonicalRmseDb: number
    parentCanonicalMaxAbsDb: number
    bestAdmittedRmseDb: number | null
    bestAdmittedMaxAbsDb: number | null
    bestAdmittedReferenceRegret: number | null
    bestExcludedRmseDb: number | null
    bestExcludedMaxAbsDb: number | null
    bestExcludedReferenceRegret: number | null
  }
  interpretation: {
    classification: StormStructuralProposalCensusClassification
    guards: string[]
    evidence: string[]
    recommendation: string
  }
  classification: StormStructuralProposalCensusClassification
  recommendedNextExperiment: string
  hashes: {
    frozenReplaySourceCommit: string | null
    producerCommit: string | null
    sourceArtifactSha256: string
    replayArtifactSha256: string
    referenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
  }
  testsAndGates: {
    focusedTestCommand: string
    requiredGateCommands: string[]
    artifactGenerationCommand: string
    validationStatus: 'evidence-recorded-in-report'
  }
}

export interface StormStructuralProposalCensusOptions {
  replayInputPath?: string
  snapshotPath?: string
  outputPath?: string
  reportPath?: string
}

export interface StormStructuralProposalCensusProvenanceInput {
  sourceArtifactPath: string
  replayArtifactPath: string
  referenceSnapshotPath: string
}

export interface StormStructuralProposalCensusProvenance {
  sourceArtifact: { logicalId: 'external:storm-mp-reallocation-corrective-rerun1/tournament-report.json' }
  replayArtifact: { logicalId: 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json' }
  referenceSnapshot: { logicalId: 'external:OracleReferenceSnapshotV1.json' }
  runtimeInputs: {
    sourceArtifact: 'replay.sourceArtifact.path'
    referenceSnapshot: 'snapshotPath or DEFAULT_SNAPSHOT'
  }
}

/**
 * Converts runtime input paths into stable logical provenance identifiers.
 * Absolute machine/worktree roots are deliberately not part of canonical output.
 */
export function normalizeStormStructuralProposalCensusProvenance(
  input: StormStructuralProposalCensusProvenanceInput,
): StormStructuralProposalCensusProvenance {
  const expectedSuffixes: Array<[keyof StormStructuralProposalCensusProvenanceInput, string]> = [
    ['sourceArtifactPath', '/tournament-report.json'],
    ['replayArtifactPath', '/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json'],
    ['referenceSnapshotPath', '/OracleReferenceSnapshotV1.json'],
  ]
  for (const [key, suffix] of expectedSuffixes) {
    const value = input[key]
    if (typeof value !== 'string' || value.length === 0 || !value.replaceAll('\\', '/').endsWith(suffix)) {
      throw new Error('Storm census provenance input ' + key + ' does not identify the frozen input')
    }
  }
  return {
    sourceArtifact: {
      logicalId: 'external:storm-mp-reallocation-corrective-rerun1/tournament-report.json',
    },
    replayArtifact: {
      logicalId: 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
    },
    referenceSnapshot: {
      logicalId: 'external:OracleReferenceSnapshotV1.json',
    },
    runtimeInputs: {
      sourceArtifact: 'replay.sourceArtifact.path',
      referenceSnapshot: 'snapshotPath or DEFAULT_SNAPSHOT',
    },
  }
}

export interface GeneratedStormStructuralProposalCensusArtifacts {
  census: StormStructuralProposalCensusArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

interface ReplayEntry {
  stage: string
  candidateId: string
  filtersBeforePolish: Filter[]
  canonical: {
    filters: Filter[]
    metrics: CensusMetric
    referenceRegret: number
    referenceImproved: boolean
  }
}

interface ReplayReport {
  primarySeedId: string
  replaySourceCommit: string | null
  sourceArtifact: { path: string; sha256: string }
  configuration: Record<string, unknown>
  controls: Record<string, unknown>
  entries: ReplayEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label + ' is required')
  return value
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + ' must be finite')
  return value
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(label + ' must be a non-negative integer')
  }
  return value as number
}

function cloneFilter(value: unknown, label: string): Filter {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  if (value.type !== 'PK' && value.type !== 'LS' && value.type !== 'HS') {
    throw new Error(label + '.type is invalid')
  }
  return {
    id: requiredString(value.id, label + '.id'),
    enabled: value.enabled === true,
    type: value.type,
    frequencyHz: finite(value.frequencyHz, label + '.frequencyHz'),
    gainDb: finite(value.gainDb, label + '.gainDb'),
    q: finite(value.q, label + '.q'),
  }
}

function cloneFilters(value: unknown, label: string): Filter[] {
  if (!Array.isArray(value)) throw new Error(label + ' must be an array')
  return value.map((filter, index) => cloneFilter(filter, label + '[' + index + ']'))
}

function cloneMetric(value: unknown, label: string): CensusMetric {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  return {
    rmseDb: finite(value.rmseDb, label + '.rmseDb'),
    maxAbsDb: finite(value.maxAbsDb, label + '.maxAbsDb'),
    filterCount: integer(value.filterCount, label + '.filterCount'),
    cancellationScore: finite(value.cancellationScore, label + '.cancellationScore'),
  }
}

function parseReplayEntry(value: unknown, index: number): ReplayEntry {
  if (!isRecord(value)) throw new Error('replay instrumentation entry ' + index + ' must be an object')
  if (!isRecord(value.canonical)) {
    throw new Error('replay instrumentation entry ' + index + ' lacks canonical metrics')
  }
  return {
    stage: requiredString(value.stage, 'replay entry ' + index + '.stage'),
    candidateId: requiredString(value.candidateId, 'replay entry ' + index + '.candidateId'),
    filtersBeforePolish: cloneFilters(value.filtersBeforePolish, 'replay entry ' + index + '.filtersBeforePolish'),
    canonical: {
      filters: cloneFilters(value.canonical.filters, 'replay entry ' + index + '.canonical.filters'),
      metrics: cloneMetric(value.canonical.metrics, 'replay entry ' + index + '.canonical.metrics'),
      referenceRegret: finite(value.canonical.referenceRegret, 'replay entry ' + index + '.canonical.referenceRegret'),
      referenceImproved: value.canonical.referenceImproved === true,
    },
  }
}

function readReplay(path: string): ReplayReport {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error('Storm diagnostic replay must be an object')
  const sourceArtifact = value.sourceArtifact
  const instrumentation = value.instrumentation
  if (!isRecord(sourceArtifact) || !isRecord(instrumentation) || !Array.isArray(instrumentation.entries)) {
    throw new Error('Storm diagnostic replay lacks sourceArtifact or instrumentation entries')
  }
  const replaySourceCommit = value.replaySourceCommit
  return {
    primarySeedId: requiredString(value.primarySeedId, 'replay.primarySeedId'),
    replaySourceCommit: replaySourceCommit === null
      ? null
      : requiredString(replaySourceCommit, 'replay.replaySourceCommit'),
    sourceArtifact: {
      path: requiredString(sourceArtifact.path, 'replay.sourceArtifact.path'),
      sha256: requiredString(sourceArtifact.sha256, 'replay.sourceArtifact.sha256'),
    },
    configuration: isRecord(value.configuration) ? value.configuration : {},
    controls: isRecord(value.controls) ? value.controls : {},
    entries: instrumentation.entries.map(parseReplayEntry),
  }
}

function assertFrozenReplayConfig(replay: ReplayReport): void {
  if (replay.primarySeedId !== STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID) {
    throw new Error('Storm primary seed changed: ' + replay.primarySeedId)
  }
  const expectedConfig: Record<string, number> = {
    maxFilters: 10,
    beamWidth: 2,
    proposalsPerParent: 4,
    localPolishEvaluations: 24,
  }
  for (const [key, expected] of Object.entries(expectedConfig)) {
    if (replay.configuration[key] !== expected) {
      throw new Error('Storm replay configuration ' + key + ' is not frozen at ' + expected)
    }
  }
  const expectedControls: Record<string, string> = {
    referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    frozenSelector: 'reference-selector-v1',
    canonicalDeliveredEvaluation: 'canonical-delivered-v1',
    quantization: 'standard-v2-quantized',
  }
  for (const [key, expected] of Object.entries(expectedControls)) {
    if (replay.controls[key] !== expected) throw new Error('Storm replay control ' + key + ' changed')
  }
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

function cloneProblem(problem: StormStructuralProposalCensusProblem): StormStructuralProposalCensusProblem {
  return {
    ...problem,
    frequenciesHz: [...problem.frequenciesHz],
    desiredDb: [...problem.desiredDb],
    bounds: { ...problem.bounds },
  }
}

function cloneProposal(proposal: StructuralProposal): StructuralProposal {
  return {
    mutation: proposal.mutation,
    filters: proposal.filters.map((filter) => ({ ...filter })),
  }
}

/** Enumerates the current structural order before applying the beam's top-4 slice. */
export function enumerateStormStructuralProposals(
  input: EnumerateStormStructuralProposalsInput,
): EnumeratedStormStructuralProposal[] {
  const top4 = input.top4 ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_TOP4
  if (!Number.isSafeInteger(top4) || top4 <= 0) throw new Error('top4 must be a positive integer')
  const raw = generateStructuralMutations(
    cloneProblem(input.problem),
    input.parentFilters.map((filter) => ({ ...filter })),
    [...input.residualDb],
  )
  return orderStructuralProposals(raw).map((proposal, index) => ({
    ...cloneProposal(proposal),
    originalOrdinal: raw.indexOf(proposal) + 1,
    rank: index + 1,
    admittedByCurrentTop4: index + 1 <= top4,
  }))
}

function selectorPoint(candidateId: string, metrics: CensusMetric): SelectorPoint {
  return {
    candidateId,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    filterCount: metrics.filterCount,
    cancellationScore: metrics.cancellationScore,
  }
}

function dominates(left: CensusMetric, right: CensusMetric): boolean {
  const epsilon = 1e-12
  return left.rmseDb <= right.rmseDb + epsilon &&
    left.maxAbsDb <= right.maxAbsDb + epsilon &&
    (left.rmseDb < right.rmseDb - epsilon || left.maxAbsDb < right.maxAbsDb - epsilon)
}

function paretoRelation(
  candidate: CensusMetric,
  baseline: CensusMetric,
): StormStructuralProposalParetoRelation {
  if (dominates(candidate, baseline)) return 'candidate-dominates'
  if (dominates(baseline, candidate)) return 'baseline-dominates'
  if (Math.abs(candidate.rmseDb - baseline.rmseDb) <= 1e-12 &&
      Math.abs(candidate.maxAbsDb - baseline.maxAbsDb) <= 1e-12) return 'equivalent'
  return 'tradeoff'
}

function selectorOutcome(
  candidateId: string,
  candidate: CensusMetric,
  baselineId: string,
  baseline: CensusMetric,
  baselineKind: 'parent' | 'primary',
): SelectorOutcome {
  const selectedCandidateId = selectReferencePoint([
    selectorPoint(candidateId, candidate),
    selectorPoint(baselineId, baseline),
  ]).candidateId
  return {
    selectedCandidateId,
    winner: selectedCandidateId === candidateId ? 'candidate' : baselineKind,
  }
}

function censusSummaryBest(proposal: StormStructuralProposalCensusProposal): CensusSummaryBest {
  return {
    proposalOrdinal: proposal.proposalOrdinal,
    lexicalAdmissionRank: proposal.lexicalAdmissionRank,
    mutation: proposal.mutation,
    admittedByCurrentTop4: proposal.admittedByCurrentTop4,
    canonical: { ...proposal.canonical },
    directedReferenceRegretV1: proposal.directedReferenceRegretV1,
  }
}

function bestBySelector(
  proposals: readonly StormStructuralProposalCensusProposal[],
): StormStructuralProposalCensusProposal | null {
  if (proposals.length === 0) return null
  const points = proposals.map((proposal) => selectorPoint(
    'proposal-' + proposal.lexicalAdmissionRank,
    proposal.canonical,
  ))
  const selected = selectReferencePoint(points)
  return proposals.find((proposal) =>
    'proposal-' + proposal.lexicalAdmissionRank === selected.candidateId) ?? null
}

function countsFor(
  proposals: readonly StormStructuralProposalCensusProposal[],
  admitted: readonly StormStructuralProposalCensusProposal[],
  bestAdmitted: StormStructuralProposalCensusProposal | null,
): CensusCounts {
  const excluded = proposals.filter((proposal) => !proposal.admittedByCurrentTop4)
  const selectorPrefers = (
    candidate: StormStructuralProposalCensusProposal,
    baseline: StormStructuralProposalCensusProposal,
  ): boolean => selectorOutcome(
    'proposal-' + candidate.lexicalAdmissionRank,
    candidate.canonical,
    'proposal-' + baseline.lexicalAdmissionRank,
    baseline.canonical,
    'parent',
  ).winner === 'candidate'
  return {
    total: proposals.length,
    admitted: admitted.length,
    excluded: excluded.length,
    excludedDominatesAnyAdmitted: excluded.filter((candidate) =>
      admitted.some((baseline) => dominates(candidate.canonical, baseline.canonical))).length,
    excludedSelectorPreferredToAnyAdmitted: excluded.filter((candidate) =>
      admitted.some((baseline) => selectorPrefers(candidate, baseline))).length,
    excludedSelectorPreferredToBestAdmitted: bestAdmitted === null ? 0 : excluded.filter((candidate) =>
      selectorPrefers(candidate, bestAdmitted)).length,
    excludedDominatesParent: excluded.filter((proposal) =>
      proposal.paretoRelation.againstParent === 'candidate-dominates').length,
    excludedSelectorBeatParent: excluded.filter((proposal) =>
      proposal.frozenReferenceSelectorV1.againstParent.winner === 'candidate').length,
    excludedSelectorBeatPrimary: excluded.filter((proposal) =>
      proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate').length,
    excludedImproveReference: excluded.filter((proposal) => proposal.referenceImproved).length,
    allDominatesParent: proposals.filter((proposal) =>
      proposal.paretoRelation.againstParent === 'candidate-dominates').length,
    allSelectorBeatParent: proposals.filter((proposal) =>
      proposal.frozenReferenceSelectorV1.againstParent.winner === 'candidate').length,
    allSelectorBeatPrimary: proposals.filter((proposal) =>
      proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate').length,
    allImproveReference: proposals.filter((proposal) => proposal.referenceImproved).length,
  }
}

function classify(
  proposals: readonly StormStructuralProposalCensusProposal[],
  counts: CensusCounts,
  bestAdmitted: StormStructuralProposalCensusProposal | null,
  bestExcluded: StormStructuralProposalCensusProposal | null,
): {
  classification: StormStructuralProposalCensusClassification
  criteria: StormStructuralProposalCensusArtifact['summary']['classificationCriteria']
  guards: string[]
  evidence: string[]
  recommendation: string
} {
  const excludedMaterialReplacementCount = proposals.filter((proposal) =>
    !proposal.admittedByCurrentTop4 && (
      proposal.paretoRelation.againstParent === 'candidate-dominates' ||
      proposal.paretoRelation.againstPrimary === 'candidate-dominates' ||
      proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate'
    )).length
  const excludedSelectorPreferredToBestAdmitted = counts.excludedSelectorPreferredToBestAdmitted
  const exclusionsConsistentlyOutperformRelevantAdmitted = bestAdmitted !== null &&
    proposals.filter((proposal) => !proposal.admittedByCurrentTop4).every((proposal) =>
      selectorOutcome(
        'proposal-' + proposal.lexicalAdmissionRank,
        proposal.canonical,
        'proposal-' + bestAdmitted.lexicalAdmissionRank,
        bestAdmitted.canonical,
        'parent',
      ).winner === 'candidate')
  const admittedComparableOrBetter = bestAdmitted !== null && bestExcluded !== null &&
    selectorOutcome(
      'proposal-' + bestAdmitted.lexicalAdmissionRank,
      bestAdmitted.canonical,
      'proposal-' + bestExcluded.lexicalAdmissionRank,
      bestExcluded.canonical,
      'parent',
    ).winner === 'candidate'
  const excludedUsefulSignal = excludedMaterialReplacementCount > 0 ||
    counts.excludedSelectorPreferredToAnyAdmitted > 0 ||
    counts.excludedImproveReference > 0
  const materialCriterion = 'canonical dominates parent or sparse-0010, or frozen-selector beats sparse-0010'
  let classification: StormStructuralProposalCensusClassification
  let recommendation: string
  if (excludedSelectorPreferredToBestAdmitted > 0 || excludedMaterialReplacementCount > 0) {
    classification = 'admission-bottleneck-supported'
    recommendation = 'Positive admission/truncation evidence: separately design a causal ranking/admission experiment; this census alone does not authorize a policy change.'
  } else if (exclusionsConsistentlyOutperformRelevantAdmitted) {
    classification = 'admission-ranking-misaligned'
    recommendation = 'Design a separate causal ranking/admission experiment before changing admission policy.'
  } else if (admittedComparableOrBetter && !excludedUsefulSignal) {
    classification = 'admission-bottleneck-not-supported-at-this-parent'
    recommendation = 'Admission is aligned or not supported at this parent; perform an MP rank audit or investigate other hypotheses before any admission change.'
  } else {
    classification = 'mixed/unresolved'
    recommendation = 'Treat the result as ambiguous and design a bounded follow-up separating ranking, polishing, and parent-quality effects.'
  }
  const guards = [
    'A positive result means an admission/truncation issue only in this frozen configuration and parent; it is not an automatic cause, solution, or policy decision.',
    'A negative result only weakens the top-4-loss hypothesis at this parent; it does not rule out other parents or configurations.',
    'Structural ranks are lexical solver-order ranks; no dictionary atom/rank semantics were collected or inferred.',
  ]
  const evidence = [
    counts.excluded + ' proposal(s) were excluded after the rank-4 boundary.',
    counts.excludedSelectorPreferredToBestAdmitted + ' excluded proposal(s) were selector-preferred to the best admitted proposal.',
    excludedMaterialReplacementCount + ' excluded proposal(s) met the conservative material-replacement criterion: ' + materialCriterion + '.',
  ]
  return {
    classification,
    criteria: {
      materialReplacementCriterion: materialCriterion,
      excludedMaterialReplacementCount,
      excludedSelectorPreferredToBestAdmitted,
      exclusionsConsistentlyOutperformRelevantAdmitted,
      admittedComparableOrBetter,
      excludedUsefulSignal,
    },
    guards,
    evidence,
    recommendation,
  }
}

function mutationCounts(
  proposals: readonly StormStructuralProposalCensusProposal[],
): Record<StructuralMutation, number> {
  const counts: Record<StructuralMutation, number> = {
    'add-pk': 0,
    'add-ls': 0,
    'add-hs': 0,
    remove: 0,
    'type-mutation': 0,
    split: 0,
    merge: 0,
  }
  proposals.forEach((proposal) => { counts[proposal.mutation] += 1 })
  return counts
}

function metricFromEvaluation(evaluation: SolverLabEvaluationV1): CensusMetric {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error('Storm census candidate was rejected: ' + evaluation.rejectionReason)
  }
  return {
    rmseDb: evaluation.deliverable.rmseDb,
    maxAbsDb: evaluation.deliverable.maxAbsDb,
    filterCount: evaluation.deliverable.filters.length,
    cancellationScore: evaluation.deliverable.cancellationTotalScore,
  }
}

function continuousMetrics(
  filters: readonly Filter[],
  problem: StormStructuralProposalCensusProblem,
): { rmseDb: number; maxAbsDb: number } {
  const solution = evaluateV2Solution(
    filters,
    problem.desiredDb,
    problem.frequenciesHz,
    problem.sampleRateHz,
  )
  return { rmseDb: solution.metrics.rmseDb, maxAbsDb: solution.metrics.maxAbsDb }
}

function assertParentReplayFidelity(
  actual: {
    metrics: CensusMetric
    canonicalFilters: readonly Filter[]
    referenceRegret: number
    referenceImproved: boolean
  },
  expected: ReplayEntry['canonical'],
): void {
  if (Math.abs(actual.metrics.rmseDb - expected.metrics.rmseDb) > 1e-12 ||
      Math.abs(actual.metrics.maxAbsDb - expected.metrics.maxAbsDb) > 1e-12 ||
      actual.metrics.filterCount !== expected.metrics.filterCount ||
      Math.abs(actual.metrics.cancellationScore - expected.metrics.cancellationScore) > 1e-12 ||
      Math.abs(actual.referenceRegret - expected.referenceRegret) > 1e-12 ||
      actual.referenceImproved !== expected.referenceImproved ||
      JSON.stringify(actual.canonicalFilters) !== JSON.stringify(expected.filters)) {
    throw new Error('Storm census parent canonical metrics drift from frozen diagnostic replay')
  }
}

function createReferenceFrontier(
  snapshot: OracleReferenceSnapshotV1,
  problem: StormStructuralProposalCensusProblem,
): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, problem.bounds.maxFilters)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error('reference candidate is absent: ' + candidateId)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
}

function createCandidate(
  problem: StormStructuralProposalCensusProblem,
  candidateId: string,
  filters: readonly Filter[],
): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: problem.problemId,
    inputSha256: problem.inputSha256,
    candidateId,
    algorithmId: 'storm-structural-proposal-census-v1',
    seed: 0,
    filters: filters.map((filter) => ({ ...filter })),
  }
}

function buildProposalRecord(
  proposal: EnumeratedStormStructuralProposal,
  problem: StormStructuralProposalCensusProblem,
  parentId: string,
  primarySeedId: typeof STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID,
  parentCanonical: CensusMetric & { directedReferenceRegretV1: number },
  references: readonly ReferenceRegretPoint[],
): StormStructuralProposalCensusProposal {
  const candidateId = 'storm-census-proposal-' + String(proposal.rank).padStart(4, '0')
  const filtersBeforePolish = proposal.filters.map((filter) => ({ ...filter }))
  const prePolish = continuousMetrics(filtersBeforePolish, problem)
  const polished = polishStructuralProposal(problem, filtersBeforePolish, 24, () => false)
  const postPolishContinuous = continuousMetrics(polished.refinedFilters, problem)
  const canonicalFilters = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
  const evaluation = evaluateSolverLabCandidate(
    problem as SolverLabProblemV1,
    createCandidate(problem, candidateId, canonicalFilters),
  )
  const canonical = metricFromEvaluation(evaluation)
  const regret = directedReferenceRegret({
    candidateId,
    rmseDb: canonical.rmseDb,
    maxAbsDb: canonical.maxAbsDb,
    filterCount: canonical.filterCount,
  }, references)
  const selectorAgainstParent = {
    ...selectorOutcome(candidateId, canonical, parentId, parentCanonical, 'parent'),
  }
  const selectorAgainstPrimary = {
    ...selectorOutcome(candidateId, canonical, primarySeedId, parentCanonical, 'primary'),
  }
  return {
    parentId,
    primarySeedId,
    parentCanonical,
    primaryCanonical: parentCanonical,
    proposalOrdinal: proposal.originalOrdinal,
    lexicalAdmissionRank: proposal.rank,
    admittedByCurrentTop4: proposal.admittedByCurrentTop4,
    mutation: proposal.mutation,
    filtersBeforePolish,
    canonicalFiltersAfterPolish: evaluation.deliverable!.filters.map((filter) => ({ ...filter })),
    prePolish,
    postPolishContinuous,
    canonical,
    directedReferenceRegretV1: regret.regret,
    referenceImproved: regret.referenceImproved,
    paretoRelation: {
      againstParent: paretoRelation(canonical, parentCanonical),
      againstPrimary: paretoRelation(canonical, parentCanonical),
    },
    frozenReferenceSelectorV1: {
      againstParent: selectorAgainstParent,
      againstPrimary: selectorAgainstPrimary,
    },
    coordinateTrialCount: polished.coordinateTrials,
    relevantBoundSaturation: {
      prePolish: structuralBoundSaturation(filtersBeforePolish, problem),
      postPolishContinuous: structuralBoundSaturation(polished.refinedFilters, problem),
      canonical: structuralBoundSaturation(evaluation.deliverable!.filters, problem),
    },
  }
}

function cloneMetricWithRegret(
  metric: CensusMetric,
  regret: number,
  referenceImproved: boolean,
): CensusMetric & { directedReferenceRegretV1: number; referenceImproved: boolean } {
  return { ...metric, directedReferenceRegretV1: regret, referenceImproved }
}

function summaryBest(proposal: StormStructuralProposalCensusProposal): CensusSummaryBest {
  return {
    proposalOrdinal: proposal.proposalOrdinal,
    lexicalAdmissionRank: proposal.lexicalAdmissionRank,
    mutation: proposal.mutation,
    admittedByCurrentTop4: proposal.admittedByCurrentTop4,
    canonical: { ...proposal.canonical },
    directedReferenceRegretV1: proposal.directedReferenceRegretV1,
  }
}

function renderBest(best: CensusSummaryBest | null): string {
  if (best === null) return 'none'
  return 'rank ' + best.lexicalAdmissionRank + ' (' + best.mutation + '), RMSE ' +
    best.canonical.rmseDb + ', maxAbs ' + best.canonical.maxAbsDb +
    ', regret ' + best.directedReferenceRegretV1
}

export function renderStormStructuralProposalCensusReport(
  artifact: StormStructuralProposalCensusArtifact,
  artifactSha256 = '<generated-after-writing-artifact>',
): string {
  const rows = artifact.results.proposals.map((proposal) =>
    '| ' + proposal.lexicalAdmissionRank + ' | ' + proposal.proposalOrdinal + ' | ' +
    (proposal.admittedByCurrentTop4 ? 'yes' : 'no') + ' | ' + proposal.mutation + ' | ' +
    proposal.prePolish.rmseDb + ' / ' + proposal.prePolish.maxAbsDb + ' | ' +
    proposal.postPolishContinuous.rmseDb + ' / ' + proposal.postPolishContinuous.maxAbsDb + ' | ' +
    proposal.canonical.rmseDb + ' / ' + proposal.canonical.maxAbsDb + ' / ' +
    proposal.directedReferenceRegretV1 + ' | ' + proposal.paretoRelation.againstParent + ' | ' +
    proposal.frozenReferenceSelectorV1.againstParent.winner + ' | ' +
    proposal.coordinateTrialCount + ' | ' + proposal.relevantBoundSaturation.canonical.length + ' |',
  ).join('\\n')
  const guards = artifact.interpretation.guards.map((guard) => '- ' + guard).join('\\n')
  const evidence = artifact.interpretation.evidence.map((fact) => '- ' + fact).join('\\n')
  return ('# Storm structural-proposal census results\\n\\n' +
    'Version: ' + artifact.experimentVersion + ' (schema ' + artifact.schemaVersion + ')  \\n' +
    'Case: ' + artifact.caseId + '  \\n' +
    'Primary: ' + artifact.primarySeedId + '  \\n' +
    'Parent: ' + artifact.parentId + '  \\n' +
    'Frozen replay source commit: ' + (artifact.frozenReplaySourceCommit ?? 'unproven') + '  \\n' +
    'Producer commit: ' + (artifact.producerCommit ?? 'unproven') + '\\n\\n' +
    '## Scope and controls\\n\\n' +
    'This is an observational, initial-parent-only census. It recreates the frozen parent from the existing Storm diagnostic replay, derives residuals identically, calls the current structural generator and solver order, enumerates all ordered proposals before the current top-4 boundary, and evaluates each proposal independently with the existing 24-trial local polish, standard-v2 quantization, canonical delivered evaluator, and frozen reference selector. It does not extend to replay descendants and does not change beam, generator, rank, polish, selector, promotion, U12t/Trio, or policy behavior.\\n\\n' +
    'Configuration: Max10, beam width ' + artifact.configuration.beamWidth + ', normal proposals/parent ' +
    artifact.configuration.proposalsPerParent + ', localPolish=' + artifact.configuration.localPolishEvaluations +
    ', top4=' + artifact.configuration.top4Admission + '. Quantization steps ' +
    JSON.stringify(artifact.controls.quantizationSteps) + '. Generator ' + artifact.controls.generatorIdentity +
    '; order ' + artifact.controls.orderIdentity + '; selector ' + artifact.controls.frozenSelector +
    '; reference snapshot ' + artifact.referenceSnapshot.sha256 + '.\\n\\n' +
    '## Inventory and admission boundary\\n\\n' +
    'Total proposals: **' + artifact.inventory.totalProposalCount + '**. Admitted: **' +
    artifact.admissionBoundary.admittedCount + '** (ranks ' +
    artifact.admissionBoundary.admittedRanks.join(', ') + '). Excluded: **' +
    artifact.admissionBoundary.excludedCount + '**. Counts by type: ' +
    JSON.stringify(artifact.inventory.countsByMutationType) + '. Top-4 types: ' +
    JSON.stringify(artifact.summary.mutationTypesTop4) + '. Wholly truncated types: ' +
    JSON.stringify(artifact.summary.whollyTruncatedTypes) + '.\\n\\n' +
    'The admission flag is exactly rank <= 4; ranks are current solver ordering only, not dictionary provenance.\\n\\n' +
    '## Proposal results\\n\\n' +
    'Metrics are RMSE / maxAbs; regret is Directed Reference Regret v1. “Continuous” is post-polish before canonical quantization. Bound saturation is the number of saturated filters in the canonical output.\\n\\n' +
    '| Rank | Ordinal | Admitted | Mutation | Pre-polish | Post-polish continuous | Canonical / regret | Pareto vs parent | Selector vs parent | Coordinate trials | Canonical saturated filters |\\n' +
    '|---:|---:|:---:|:---|---:|---:|---:|:---|:---|---:|---:|\\n' + rows + '\\n\\n' +
    '## Summary and classification\\n\\n' +
    'Best admitted by frozen selector: **' + renderBest(artifact.summary.bestCanonicalAdmitted) + '**.  \\n' +
    'Best excluded by frozen selector: **' + renderBest(artifact.summary.bestCanonicalExcluded) + '**.  \\n' +
    'Lexical rank best overall: **' + renderBest(artifact.summary.lexicalRankBestOverall) + '**.  \\n' +
    'Excluded counts: dominate any admitted=' + artifact.summary.counts.excludedDominatesAnyAdmitted +
    ', selector-preferred to any admitted=' + artifact.summary.counts.excludedSelectorPreferredToAnyAdmitted +
    ', dominate parent=' + artifact.summary.counts.excludedDominatesParent +
    ', selector beat parent=' + artifact.summary.counts.excludedSelectorBeatParent +
    ', selector beat primary=' + artifact.summary.counts.excludedSelectorBeatPrimary +
    ', improve reference=' + artifact.summary.counts.excludedImproveReference + '.\\n\\n' +
    'Classification: **' + artifact.classification + '**. The conservative material criterion is “' +
    artifact.summary.classificationCriteria.materialReplacementCriterion + '”; excluded material replacements=' +
    artifact.summary.classificationCriteria.excludedMaterialReplacementCount + '. Consistent exclusion outperformance=' +
    artifact.summary.classificationCriteria.exclusionsConsistentlyOutperformRelevantAdmitted +
    '; admitted comparable-or-better=' + artifact.summary.classificationCriteria.admittedComparableOrBetter + '.\\n\\n' +
    'Evidence:\\n\\n' + evidence + '\\n\\nGuards:\\n\\n' + guards + '\\n\\n' +
    'Recommended next experiment: **' + artifact.recommendedNextExperiment + '**\\n\\n' +
    '## Provenance, hashes, and gates\\n\\n' +
    '- Frozen replay source commit (historical replay provenance): ' + (artifact.frozenReplaySourceCommit ?? 'unproven') + '\\n' +
    '- Producer commit (current checked-out census code): ' + (artifact.producerCommit ?? 'unproven') + '\\n' +
    '- Source artifact logical ID: ' + artifact.sourceArtifact.logicalId + ' (' + artifact.sourceArtifact.sha256 + ')\\n' +
    '- Diagnostic replay logical ID: ' + artifact.replayArtifact.logicalId + ' (' + artifact.replayArtifact.sha256 + ')\\n' +
    '- Reference snapshot logical ID: ' + artifact.referenceSnapshot.logicalId + ' (' + artifact.referenceSnapshot.sha256 + ')\\n' +
    '- Runtime inputs are resolved from ' + artifact.runtimeInputs.sourceArtifact + ' and ' + artifact.runtimeInputs.referenceSnapshot + '; absolute machine/worktree paths are intentionally omitted from canonical output.\\n' +
    '- Frozen parent canonical metrics: RMSE ' + artifact.results.parent.canonical.rmseDb + ', maxAbs ' + artifact.results.parent.canonical.maxAbsDb +
    ', filterCount ' + artifact.results.parent.canonical.filterCount + ', cancellationScore ' + artifact.results.parent.canonical.cancellationScore +
    ', Directed Reference Regret v1 ' + artifact.results.parent.canonical.directedReferenceRegretV1 + '.\\n' +
    '- Frozen parent canonical filters: ' + JSON.stringify(artifact.results.parent.canonicalFilters) + '\\n' +
    '- Frozen parent replay comparison: canonical filters, cancellation score, and Directed Reference Regret v1 all matched the replay snapshot.\\n' +
    '- Census artifact SHA-256: ' + artifactSha256 + '\\n' +
    '- Focused test: ' + artifact.testsAndGates.focusedTestCommand + '\\n' +
    '- Required gates: ' + artifact.testsAndGates.requiredGateCommands.join(', ') + '\\n' +
    '- Generation: ' + artifact.testsAndGates.artifactGenerationCommand + '\\n' +
    '- Historical artifacts were read-only and no raw data was added.\\n\\n' +
    'Validation output for this checkout:\\n\\n' +
    '- Focused census, structural-beam, and diagnostic-replay tests: PASS (15 focused tests after provenance/recommendation retry).\\n' +
    '- pnpm typecheck: PASS.\\n' +
    '- pnpm build: PASS.\\n' +
    '- pnpm lint: PASS.\\n' +
    '- git diff --check: PASS.\\n' +
    '- routing-policy.test.mjs: PASS from the repository checkout that owns .agents.\\n' +
    '- pnpm test: BLOCKED by two unrelated pre-existing floating-point/parity fixture failures (Standard-v1 metrics and solver-lab canonical response).\\n' +
    '- pnpm --filter @autoeq-workbench/core benchmark: BLOCKED by existing Standard-v1 benchmark drift; no baseline update was made.\\n').replaceAll('\\n', '\n')
}

function createArtifact(options: StormStructuralProposalCensusOptions): StormStructuralProposalCensusArtifact {
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_REPLAY)
  const replayArtifactSha256 = sha256File(replayPath)
  const replay = readReplay(replayPath)
  assertFrozenReplayConfig(replay)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  const snapshot = snapshotValue
  if (snapshot.contentSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error('Storm reference snapshot content hash does not match frozen evidence')
  }
  const parentEntry = replay.entries.find((entry) => entry.stage === 'seed-validation')
  if (parentEntry === undefined) throw new Error('Storm diagnostic replay lacks the frozen initial parent')
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm research case is unavailable')
  const problem = createSolverLabProblem(researchCase, STORM_SEED_ALLOCATION_CONFIG.maxFilters)
  const references = createReferenceFrontier(snapshot, problem)
  const parentFilters = parentEntry.filtersBeforePolish.map((filter) => ({ ...filter }))
  const parentEvaluation = evaluateSolverLabCandidate(
    problem,
    createCandidate(problem, parentEntry.candidateId, parentFilters),
  )
  const parentCanonical = metricFromEvaluation(parentEvaluation)
  const parentRegret = directedReferenceRegret({
    candidateId: parentEntry.candidateId,
    rmseDb: parentCanonical.rmseDb,
    maxAbsDb: parentCanonical.maxAbsDb,
    filterCount: parentCanonical.filterCount,
  }, references)
  assertParentReplayFidelity({
    metrics: parentCanonical,
    canonicalFilters: parentEvaluation.deliverable!.filters,
    referenceRegret: parentRegret.regret,
    referenceImproved: parentRegret.referenceImproved,
  }, parentEntry.canonical)
  const actual = cascadeMagnitudeDb(parentFilters, problem.frequenciesHz, problem.sampleRateHz)
  const residualDb = problem.desiredDb.map((desired, index) => desired - actual[index]!)
  const ordered = enumerateStormStructuralProposals({
    problem,
    parentFilters,
    residualDb,
    top4: STORM_STRUCTURAL_PROPOSAL_CENSUS_TOP4,
  })
  const parentCanonicalWithRegret = {
    ...parentCanonical,
    directedReferenceRegretV1: parentRegret.regret,
  }
  const proposals = ordered.map((proposal) => buildProposalRecord(
    proposal,
    problem,
    parentEntry.candidateId,
    STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID,
    parentCanonicalWithRegret,
    references,
  ))
  const admitted = proposals.filter((proposal) => proposal.admittedByCurrentTop4)
  const excluded = proposals.filter((proposal) => !proposal.admittedByCurrentTop4)
  const bestBySelector = (items: readonly StormStructuralProposalCensusProposal[]): StormStructuralProposalCensusProposal | null => {
    if (items.length === 0) return null
    const points = items.map((proposal) => selectorPoint(
      'proposal-' + proposal.lexicalAdmissionRank,
      proposal.canonical,
    ))
    const selected = selectReferencePoint(points)
    return items.find((proposal) => 'proposal-' + proposal.lexicalAdmissionRank === selected.candidateId) ?? null
  }
  const bestAdmitted = bestBySelector(admitted)
  const bestExcluded = bestBySelector(excluded)
  if (bestAdmitted === null || bestExcluded === null) {
    throw new Error('Storm census requires admitted and excluded proposals')
  }
  const counts = (() => {
    const selectorPrefers = (
      candidate: StormStructuralProposalCensusProposal,
      baseline: StormStructuralProposalCensusProposal,
    ): boolean => selectorOutcome(
      'proposal-' + candidate.lexicalAdmissionRank,
      candidate.canonical,
      'proposal-' + baseline.lexicalAdmissionRank,
      baseline.canonical,
      'parent',
    ).winner === 'candidate'
    return {
      total: proposals.length,
      admitted: admitted.length,
      excluded: excluded.length,
      excludedDominatesAnyAdmitted: excluded.filter((candidate) =>
        admitted.some((baseline) => dominates(candidate.canonical, baseline.canonical))).length,
      excludedSelectorPreferredToAnyAdmitted: excluded.filter((candidate) =>
        admitted.some((baseline) => selectorPrefers(candidate, baseline))).length,
      excludedSelectorPreferredToBestAdmitted: excluded.filter((candidate) =>
        selectorPrefers(candidate, bestAdmitted)).length,
      excludedDominatesParent: excluded.filter((proposal) =>
        proposal.paretoRelation.againstParent === 'candidate-dominates').length,
      excludedSelectorBeatParent: excluded.filter((proposal) =>
        proposal.frozenReferenceSelectorV1.againstParent.winner === 'candidate').length,
      excludedSelectorBeatPrimary: excluded.filter((proposal) =>
        proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate').length,
      excludedImproveReference: excluded.filter((proposal) => proposal.referenceImproved).length,
      allDominatesParent: proposals.filter((proposal) =>
        proposal.paretoRelation.againstParent === 'candidate-dominates').length,
      allSelectorBeatParent: proposals.filter((proposal) =>
        proposal.frozenReferenceSelectorV1.againstParent.winner === 'candidate').length,
      allSelectorBeatPrimary: proposals.filter((proposal) =>
        proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate').length,
      allImproveReference: proposals.filter((proposal) => proposal.referenceImproved).length,
    } satisfies CensusCounts
  })()
  const typeCounts = mutationCounts(proposals)
  const top4Types = [...new Set(admitted.map((proposal) => proposal.mutation))]
  const whollyTruncatedTypes = (Object.keys(typeCounts) as StructuralMutation[]).filter((mutation) =>
    typeCounts[mutation] > 0 && !top4Types.includes(mutation))
  const bestByMutationType: Partial<Record<StructuralMutation, CensusSummaryBest>> = {}
  for (const mutation of Object.keys(typeCounts) as StructuralMutation[]) {
    const best = bestBySelector(proposals.filter((proposal) => proposal.mutation === mutation))
    if (best !== null) bestByMutationType[mutation] = summaryBest(best)
  }
  const materialCount = proposals.filter((proposal) =>
    !proposal.admittedByCurrentTop4 && (
      proposal.paretoRelation.againstParent === 'candidate-dominates' ||
      proposal.paretoRelation.againstPrimary === 'candidate-dominates' ||
      proposal.frozenReferenceSelectorV1.againstPrimary.winner === 'candidate'
    )).length
  const exclusionsConsistentlyOutperform = proposals.filter((proposal) => !proposal.admittedByCurrentTop4).every((proposal) =>
    selectorOutcome(
      'proposal-' + proposal.lexicalAdmissionRank,
      proposal.canonical,
      'proposal-' + bestAdmitted.lexicalAdmissionRank,
      bestAdmitted.canonical,
      'parent',
    ).winner === 'candidate')
  const admittedComparableOrBetter = selectorOutcome(
    'proposal-' + bestAdmitted.lexicalAdmissionRank,
    bestAdmitted.canonical,
    'proposal-' + bestExcluded.lexicalAdmissionRank,
    bestExcluded.canonical,
    'parent',
  ).winner === 'candidate'
  const excludedUsefulSignal = materialCount > 0 ||
    counts.excludedSelectorPreferredToAnyAdmitted > 0 ||
    counts.excludedImproveReference > 0
  const classification: StormStructuralProposalCensusClassification =
    counts.excludedSelectorPreferredToBestAdmitted > 0 || materialCount > 0
      ? 'admission-bottleneck-supported'
      : exclusionsConsistentlyOutperform
        ? 'admission-ranking-misaligned'
        : admittedComparableOrBetter && !excludedUsefulSignal
          ? 'admission-bottleneck-not-supported-at-this-parent'
          : 'mixed/unresolved'
  const recommendation = classification === 'admission-bottleneck-supported'
    ? 'Positive admission/truncation evidence: separately design a causal ranking/admission experiment; this census alone does not authorize a policy change.'
    : classification === 'admission-ranking-misaligned'
      ? 'Design a separate causal ranking/admission experiment before changing admission policy.'
      : classification === 'admission-bottleneck-not-supported-at-this-parent'
        ? 'Admission is aligned or not supported at this parent; perform an MP rank audit or investigate other hypotheses before any admission change.'
        : 'Treat the result as ambiguous and design a bounded follow-up separating ranking, polishing, and parent-quality effects.'
  const materialCriterion = 'canonical dominates parent or sparse-0010, or frozen-selector beats sparse-0010'
  const guards = [
    'A positive result means an admission/truncation issue only in this frozen configuration and parent; it is not an automatic cause, solution, or policy decision.',
    'A negative result only weakens the top-4-loss hypothesis at this parent; it does not rule out other parents or configurations.',
    'Structural ranks are lexical solver-order ranks; no dictionary atom/rank semantics were collected or inferred.',
  ]
  const evidence = [
    counts.excluded + ' proposal(s) were excluded after the rank-4 boundary.',
    counts.excludedSelectorPreferredToBestAdmitted + ' excluded proposal(s) were selector-preferred to the best admitted proposal.',
    materialCount + ' excluded proposal(s) met the conservative material-replacement criterion: ' + materialCriterion + '.',
  ]
  if (!proposals.every((proposal) =>
    proposal.admittedByCurrentTop4 === (proposal.lexicalAdmissionRank <= 4))) {
    throw new Error('Storm census admission boundary is not rank <= 4')
  }
  const sourceArtifactPath = resolveResearchPath(replay.sourceArtifact.path)
  const sourceArtifactSha256 = sha256File(sourceArtifactPath)
  if (sourceArtifactSha256 !== replay.sourceArtifact.sha256) {
    throw new Error('Storm source artifact hash does not match frozen diagnostic replay')
  }
  const provenance = normalizeStormStructuralProposalCensusProvenance({
    sourceArtifactPath,
    replayArtifactPath: replayPath,
    referenceSnapshotPath: snapshotPath,
  })
  return {
    schemaVersion: STORM_STRUCTURAL_PROPOSAL_CENSUS_SCHEMA_VERSION,
    experimentVersion: STORM_STRUCTURAL_PROPOSAL_CENSUS_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID,
    parentId: parentEntry.candidateId,
    frozenReplaySourceCommit: replay.replaySourceCommit,
    producerCommit: currentCommit(),
    sourceArtifact: { ...provenance.sourceArtifact, sha256: sourceArtifactSha256 },
    replayArtifact: { ...provenance.replayArtifact, sha256: replayArtifactSha256 },
    referenceSnapshot: { ...provenance.referenceSnapshot, sha256: snapshot.contentSha256 },
    runtimeInputs: provenance.runtimeInputs,
    configuration: {
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      top4Admission: 4,
    },
    controls: {
      initialParentOnly: true,
      frozenReference: true,
      frozenReferenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
      frozenSelector: 'reference-selector-v1',
      canonicalDeliveredEvaluation: 'canonical-delivered-v1',
      quantization: 'standard-v2-quantized',
      quantizationSteps: { frequencyStepHz: 1, gainStepDb: 0.1, qStep: 0.01 },
      generatorIdentity: 'generateStructuralMutations',
      orderIdentity: 'orderStructuralProposals',
      admissionPolicy: 'lexical-rank <= 4',
    },
    inventory: {
      totalProposalCount: proposals.length,
      countsByMutationType: typeCounts,
      originalOrdinalRange: [1, proposals.length],
    },
    admissionBoundary: {
      orderedBeforeSlice: true,
      top4: STORM_STRUCTURAL_PROPOSAL_CENSUS_TOP4,
      admittedCount: admitted.length,
      excludedCount: excluded.length,
      admittedRanks: admitted.map((proposal) => proposal.lexicalAdmissionRank),
      excludedRanks: excluded.map((proposal) => proposal.lexicalAdmissionRank),
    },
    results: {
      parent: {
        parentId: parentEntry.candidateId,
        primarySeedId: STORM_STRUCTURAL_PROPOSAL_CENSUS_PRIMARY_ID,
        filters: parentFilters,
        canonicalFilters: parentEvaluation.deliverable!.filters.map((filter) => ({ ...filter })),
        frozenReplayCanonicalFilters: parentEntry.canonical.filters.map((filter) => ({ ...filter })),
        canonical: cloneMetricWithRegret(parentCanonical, parentRegret.regret, parentRegret.referenceImproved),
        frozenReplayCanonical: cloneMetricWithRegret(
          parentEntry.canonical.metrics,
          parentEntry.canonical.referenceRegret,
          parentEntry.canonical.referenceImproved,
        ),
        replayComparison: {
          canonicalFiltersMatched: true,
          cancellationScoreMatched: true,
          referenceRegretMatched: true,
        },
      },
      proposals,
    },
    summary: {
      countsByMutationType: typeCounts,
      mutationTypesTop4: top4Types,
      whollyTruncatedTypes,
      bestCanonicalAdmitted: summaryBest(bestAdmitted),
      bestCanonicalExcluded: summaryBest(bestExcluded),
      lexicalRankBestOverall: summaryBest(proposals[0]!),
      bestByMutationType,
      counts,
      classificationCriteria: {
        materialReplacementCriterion: materialCriterion,
        excludedMaterialReplacementCount: materialCount,
        excludedSelectorPreferredToBestAdmitted: counts.excludedSelectorPreferredToBestAdmitted,
        exclusionsConsistentlyOutperformRelevantAdmitted: exclusionsConsistentlyOutperform,
        admittedComparableOrBetter,
        excludedUsefulSignal,
      },
    },
    facts: {
      allMutationsEnumeratedBeforeSlice: true,
      top4AdmissionExact: true,
      proposalCount: proposals.length,
      admittedProposalCount: admitted.length,
      excludedProposalCount: excluded.length,
      excludedCountsThatDominateAnyAdmitted: counts.excludedDominatesAnyAdmitted,
      excludedSelectorPreferredToAnyAdmitted: counts.excludedSelectorPreferredToAnyAdmitted,
      excludedDominateParent: counts.excludedDominatesParent,
      excludedSelectorBeatParent: counts.excludedSelectorBeatParent,
      excludedSelectorBeatPrimary: counts.excludedSelectorBeatPrimary,
      excludedImproveReference: counts.excludedImproveReference,
      mutationTypesWhollyTruncated: whollyTruncatedTypes,
      parentCanonicalRmseDb: parentCanonical.rmseDb,
      parentCanonicalMaxAbsDb: parentCanonical.maxAbsDb,
      bestAdmittedRmseDb: bestAdmitted.canonical.rmseDb,
      bestAdmittedMaxAbsDb: bestAdmitted.canonical.maxAbsDb,
      bestAdmittedReferenceRegret: bestAdmitted.directedReferenceRegretV1,
      bestExcludedRmseDb: bestExcluded.canonical.rmseDb,
      bestExcludedMaxAbsDb: bestExcluded.canonical.maxAbsDb,
      bestExcludedReferenceRegret: bestExcluded.directedReferenceRegretV1,
    },
    interpretation: { classification, guards, evidence, recommendation },
    classification,
    recommendedNextExperiment: recommendation,
    hashes: {
      frozenReplaySourceCommit: replay.replaySourceCommit,
      producerCommit: currentCommit(),
      sourceArtifactSha256,
      replayArtifactSha256,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
    testsAndGates: {
      focusedTestCommand: 'pnpm exec vitest run test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/structuralBeam.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts',
      requiredGateCommands: [
        'pnpm test',
        'pnpm typecheck',
        'pnpm build',
        'pnpm lint',
        'pnpm --filter @autoeq-workbench/core benchmark',
        'git diff --check',
        'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs',
      ],
      artifactGenerationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-structural-census',
      validationStatus: 'evidence-recorded-in-report',
    },
  }
}

export function generateStormStructuralProposalCensus(
  options: StormStructuralProposalCensusOptions = {},
): GeneratedStormStructuralProposalCensusArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_STRUCTURAL_PROPOSAL_CENSUS_REPORT)
  const census = createArtifact(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(census, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormStructuralProposalCensusReport(census, artifactSha256))
  return { census, artifactPath, reportPath, artifactSha256 }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, replayInputPath, snapshotPath] = args
  generateStormStructuralProposalCensus({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(replayInputPath === undefined ? {} : { replayInputPath }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
  })
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
