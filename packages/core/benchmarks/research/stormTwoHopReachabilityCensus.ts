import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascadeMagnitudeDb, evaluateV2Solution, type Filter } from '../../src/index.js'

import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { rankStormStructuralAdmissionPrePolish, type StormStructuralAdmissionPrePolishRanking } from './stormStructuralAdmissionCheapAdmission.js'
import { enumerateStormStructuralProposals, type EnumeratedStormStructuralProposal } from './stormStructuralProposalCensus.js'
import { directedReferenceRegret, type ReferenceRegretPoint } from './referenceRegret.js'
import { assertOracleReferenceSnapshotV1, getReferenceCell, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { selectReferencePoint, type SelectorPoint } from './referenceSelector.js'
import { DEFAULT_SNAPSHOT, resolveResearchPath } from './seedAllocationRun.js'
import {
  polishStructuralProposal,
  quantizeStructuralBeamFilters,
  type StructuralMutation,
} from './structuralBeam.js'

export const STORM_TWO_HOP_REACHABILITY_SCHEMA_VERSION = 1 as const
export const STORM_TWO_HOP_REACHABILITY_EXPERIMENT_VERSION = 'storm-two-hop-reachability-census-v1' as const
export const STORM_TWO_HOP_REACHABILITY_OUTPUT = 'packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json' as const
export const STORM_TWO_HOP_REACHABILITY_REPORT = 'docs/superpowers/specs/2026-09-10-storm-two-hop-reachability-census-results.md' as const
export const STORM_TWO_HOP_REACHABILITY_PRIMARY_ID = 'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_TWO_HOP_REACHABILITY_TOP4 = 4 as const
export const STORM_TWO_HOP_REACHABILITY_LOCAL_POLISH = 24 as const
export const STORM_TWO_HOP_REACHABILITY_MAX_FILTERS = 10 as const
export const STORM_TWO_HOP_REACHABILITY_MAX_DEPTH_EDGES = 2 as const

export const STORM_TWO_HOP_REACHABILITY_CLASSIFICATIONS = Object.freeze([
  'temporary-worsening-bridge-supported',
  'two-hop-opportunity-reachable-currently',
  'two-hop-local-only',
  'two-hop-no-headroom',
  'mixed/unresolved',
] as const)

export type StormTwoHopReachabilityClassification = (typeof STORM_TWO_HOP_REACHABILITY_CLASSIFICATIONS)[number]
export type GateStatus = 'PASS_THIS_RUN' | 'PASS_PREVIOUSLY_VERIFIED' | 'FAIL' | 'BLOCKED_KNOWN' | 'NOT_RUN'

export interface StormTwoHopMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
  referenceRegret: number
  referenceImproved?: boolean
}

export type StormTwoHopParetoRelation = 'candidate-dominates' | 'baseline-dominates' | 'tradeoff' | 'equivalent'

export interface StormTwoHopRelation {
  pareto: StormTwoHopParetoRelation
  selectorWinner: 'candidate' | 'baseline'
}

export interface StormTwoHopClassificationInput {
  bridgeSupported: boolean
  reachableCurrently: boolean
  localOnly: boolean
  noHeadroom: boolean
  unresolved: boolean
  maxDepthEdges?: number
}

/** Classifies only the five approved outcomes; depth is always exactly two edges. */
export function classifyStormTwoHopReachability(input: StormTwoHopClassificationInput): StormTwoHopReachabilityClassification {
  if (input.maxDepthEdges !== undefined && input.maxDepthEdges !== STORM_TWO_HOP_REACHABILITY_MAX_DEPTH_EDGES) {
    throw new Error('two-hop census depth must be exactly two structural edges')
  }
  const signals = [input.bridgeSupported, input.reachableCurrently, input.localOnly, input.noHeadroom, input.unresolved].filter(Boolean).length
  if (signals === 0) throw new Error('two-hop census has no classification signal')
  if (input.unresolved || (input.bridgeSupported && input.reachableCurrently)) return 'mixed/unresolved'
  if (input.bridgeSupported) return 'temporary-worsening-bridge-supported'
  if (input.reachableCurrently) return 'two-hop-opportunity-reachable-currently'
  if (input.localOnly) return 'two-hop-local-only'
  return 'two-hop-no-headroom'
}

export interface StormTwoHopCheapScore {
  proposalRank: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

/** Ranking consumes only canonical pre-polish scores; full-polish labels cannot enter this API. */
export function rankStormTwoHopCheapAdmission(scores: readonly StormTwoHopCheapScore[]): StormStructuralAdmissionPrePolishRanking {
  return rankStormStructuralAdmissionPrePolish(scores)
}

interface FrozenPostInitialProposal {
  rank: number
  originalOrdinal: number
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
  canonical: StormTwoHopMetric
}

interface FrozenPostInitialParent {
  semanticKey: string
  parentIdentity: string
  occurrenceCount: number
  filters: Filter[]
  canonicalMetrics: StormTwoHopMetric
  trajectoryGlobalBest: StormTwoHopMetric
  occurrences: Array<{ runOrder: number; layerIndex: number; parentIndex: number; evaluationIndex: number | null }>
}

interface FrozenPostInitialArtifact {
  schemaVersion: number
  experimentVersion: string
  caseId: string
  primarySeedId: string
  parents: Array<{
    semanticKey: string
    parentIdentity: string
    occurrenceCount: number
    proposalCount: number
    lexicalRanking: number[]
    lexicalTop4: number[]
    cheapRanking: number[]
    cheapTop4: number[]
    overlap: number
    proposals: FrozenPostInitialProposal[]
  }>
  frozenParentSet: {
    totalExpansionOccurrences: number
    initialExcludedOccurrences: number
    postInitialExpansionOccurrences: number
    uniquePostInitialParents: FrozenPostInitialParent[]
    repeatedOccurrencesRemoved: number
  }
}

interface DynamicParentDecision {
  parentIdentity: string
  layerIndex: number
  parentIndex: number
  admittedProposalRanks: number[]
  admittedChildSet: string[]
}

interface DynamicRun {
  orderIndex: number
  armId: string
  parentDecisions: DynamicParentDecision[]
}

interface DynamicArtifact {
  schemaVersion: number
  experimentVersion: string
  primarySeedId: string
  runs: DynamicRun[]
}

interface CheapState {
  evaluationIndex: number
  candidateId: string
  parentCandidateId: string | null
  canonicalFilters: Filter[]
  metrics: StormTwoHopMetric
}

interface CheapArtifact {
  schemaVersion: number
  experimentVersion: string
  primarySeedId: string
  arms: { cheapAdmission: { seedValidation: CheapState; descendants: CheapState[]; trajectory: Array<{ evaluationIndex: number; candidateId: string; metrics: StormTwoHopMetric }> } }
}

interface ReplayArtifact {
  primarySeedId: string
  replaySourceCommit: string | null
}

interface PredecessorArtifactHash {
  logicalId: string
  sha256Before: string
  sha256After: string
  unchanged: true
}

interface FrozenRuntimeInputs {
  postInitialPath: string
  dynamicPath: string
  cheapPath: string
  replayPath: string
  snapshotPath: string
  postInitial: FrozenPostInitialArtifact
  dynamic: DynamicArtifact
  cheap: CheapArtifact
  replay: ReplayArtifact
  problem: SolverLabProblemV1
  references: ReferenceRegretPoint[]
  predecessorHashesBefore: PredecessorArtifactHash[]
  snapshotContentSha256: string
  bInitial: StormTwoHopMetric
  bGlobalBestCandidateId: string
  bGlobalBest: StormTwoHopMetric
  bGlobalBestFilters: Filter[]
}

export interface StormTwoHopAdmissionStatus {
  lexicalRank: number
  lexicalTop4: boolean
  cheapRank: number
  cheapTop4: boolean
}

export interface StormTwoHopRetentionStatus {
  applicableCompetitorIds: string[]
  paretoAgainstCompetitors: Array<{ competitorId: string; relation: StormTwoHopRelation }>
  frozenSelectorPreference: StormTwoHopRelation
  frontierEligible: boolean
  currentBeamEligible: boolean
  reconstructedBeamRank: number | null
  status: 'hop1-admission-blocked' | 'beam-retention-blocked' | 'retained-observed' | 'retained-inferred'
  observedInFrozenB: boolean
  observedInFrozenC: boolean
  expandedAsParentInFrozenB: boolean
  expandedAsParentInFrozenC: boolean
  evidenceBasis: 'direct-frozen-trajectory' | 'inferred-from-frozen-competitive-set'
}

export interface StormTwoHopIntermediate {
  rank: number
  originalOrdinal: number
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
  polishedContinuousFilters: Filter[]
  canonicalDeliveredFilters: Filter[]
  censusCanonical: StormTwoHopMetric
  reconstructedCanonical: StormTwoHopMetric
  reconstructionFidelity: { exactWithinTolerance: true; rmseDelta: number; maxAbsDelta: number; regretDelta: number }
  canonical: StormTwoHopMetric
  admission: StormTwoHopAdmissionStatus
  relationVsParent: StormTwoHopRelation
  relationVsBGlobalBest: StormTwoHopRelation
  improvesParent: boolean
  improvesBGlobalBest: boolean
  retention: StormTwoHopRetentionStatus
  /** The exact delivered intermediate state from which hop-2 residual generation starts. */
  hop2ResidualSourceSemanticKey: string
  hop2ProposalCount: number
  hop2UniqueSemanticGrandchildren: number
  hop2DuplicateSemanticGrandchildren: number
  hop2MutationCounts: Record<StructuralMutation, number>
  grandchildrenBetterThanIntermediate: number
  grandchildrenBetterThanParent: number
  grandchildrenBetterThanBGlobalBest: number
  grandchildrenImproveFrozenReference: number
  bestGrandchildPathId: string | null
  bestGrandchild: StormTwoHopMetric | null
  grandchildren: StormTwoHopGrandchild[]
}

export interface StormTwoHopGrandchild {
  pathId: string
  depthEdges: 2
  intermediateRank: number
  intermediateMutation: StructuralMutation
  lexicalRank: number
  cheapRank: number
  admission: StormTwoHopAdmissionStatus
  originalOrdinal: number
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
  polishedContinuousFilters: Filter[]
  canonicalDeliveredFilters: Filter[]
  prePolish: { rmseDb: number; maxAbsDb: number; filterCount: number; cancellationScore: number }
  postPolishContinuous: { rmseDb: number; maxAbsDb: number }
  canonical: StormTwoHopMetric
  relationVsIntermediate: StormTwoHopRelation
  relationVsParent: StormTwoHopRelation
  relationVsBGlobalBest: StormTwoHopRelation
  improvesIntermediate: boolean
  improvesParent: boolean
  improvesBGlobalBest: boolean
  improvesFrozenReference: boolean
  improvesLexicalAlternative: boolean
  semanticKey: string
  semanticGroupId: string
  semanticOccurrenceIndex: number
  bridge: boolean
  mechanismBlocker: StormTwoHopMechanismBlocker
}

export type StormTwoHopMechanismBlocker = 'hop1-admission-blocked' | 'beam-retention-blocked' | 'hop2-admission-blocked' | 'reachable-under-current-mechanism' | 'mechanism-unresolved'

export interface StormTwoHopSemanticGrandchild {
  semanticGroupId: string
  semanticKey: string
  representativeCanonicalFilters: Filter[]
  representativeCanonical: StormTwoHopMetric
  pathIds: string[]
  intermediateRanks: number[]
  occurrenceCount: number
}

export interface StormTwoHopBridgePath {
  pathId: string
  intermediateRank: number
  grandchildLexicalRank: number
  grandchildCheapRank: number
  intermediateAdmission: StormTwoHopAdmissionStatus
  intermediateRetention: StormTwoHopRetentionStatus
  grandchildAdmission: StormTwoHopAdmissionStatus
  blocker: StormTwoHopMechanismBlocker
  evidence: 'direct-frozen-trajectory' | 'inferred-offline-oracle'
}

export interface StormTwoHopReachabilityArtifact {
  schemaVersion: typeof STORM_TWO_HOP_REACHABILITY_SCHEMA_VERSION
  experimentVersion: typeof STORM_TWO_HOP_REACHABILITY_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_TWO_HOP_REACHABILITY_PRIMARY_ID
  sourceCommit: string | null
  taskAction: 'IMPLEMENT'
  taskDomain: 'RESEARCH'
  criticality: 'MAJOR'
  scopeContract: {
    taskAction: 'IMPLEMENT'
    taskDomain: 'RESEARCH'
    criticality: 'MAJOR'
    allowedPaths: readonly string[]
    forbiddenPaths: readonly string[]
    dependencies: readonly string[]
    plan: readonly string[]
    acceptanceCriteria: readonly string[]
    tests: readonly string[]
    retryBudget: { maxAttempts: 3; attempt: 1; remainingAttempts: 2 }
    stopConditions: readonly string[]
    doNotChange: readonly string[]
  }
  doNotChange: readonly string[]
  frozenPredecessorArtifacts: PredecessorArtifactHash[]
  validationIncidents: string[]
  frozenInputs: {
    postInitialCensus: { logicalId: string; sha256: string }
    dynamicAllParents: { logicalId: string; sha256: string }
    cheapAdmission: { logicalId: string; sha256: string }
    replay: { logicalId: string; sha256: string }
    referenceSnapshot: { logicalId: string; contentSha256: string; fileSha256: string }
  }
  controls: {
    storm: true
    maxFilters: 10
    localPolishEvaluations: 24
    standardV2Quantization: true
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    frozenSelector: 'reference-selector-v1'
    frozenReference: true
    currentStructuralMutationGenerator: 'generateStructuralMutations'
    lexicalOrder: 'orderStructuralProposals'
    noMpDictionary: true
    noTeacherMax20Max40Max64: true
    noNormalBeamOrSearchExecution: true
    fullPolishLabelsExcludedFromAdmission: true
    outcomeBlindCheapRanking: true
    baselineComparatorsFrozen: true
    futureLeakageAbsent: true
    maxDepthEdges: 2
  }
  frozenCensus: {
    totalExpansionOccurrences: number
    initialExcludedOccurrences: number
    postInitialExpansionOccurrences: number
    uniquePostInitialParents: number
    repeatedOccurrencesRemoved: number
    parentSemanticKey: string
    parentIdentity: string
    parentOccurrenceCount: number
    proposalCount: 31
    lexicalTop4: number[]
    cheapTop4: number[]
    overlap: number
  }
  originalParent: { filters: Filter[]; canonical: StormTwoHopMetric }
  bGlobalBest: { candidateId: string; filters: Filter[]; canonical: StormTwoHopMetric }
  intermediates: StormTwoHopIntermediate[]
  semanticGrandchildren: StormTwoHopSemanticGrandchild[]
  bridgePaths: StormTwoHopBridgePath[]
  mechanismAttribution: {
    counts: Record<StormTwoHopMechanismBlocker, number>
    evidenceBoundary: string[]
    bridgePaths: StormTwoHopBridgePath[]
  }
  totals: {
    intermediateCount: 31
    hop2ProposalCount: number
    hop2GrandchildrenPathCount: number
    uniqueSemanticGrandchildren: number
    duplicateSemanticGrandchildPathCount: number
    intermediatesWithGrandchildBetterThanIntermediate: number
    intermediatesWithGrandchildBetterThanParent: number
    intermediatesWithGrandchildBetterThanBGlobalBest: number
    intermediatesWithGrandchildImprovingFrozenReference: number
    directIntermediateImprovementCount: number
  }
  mutationCounts: {
    hop1: Record<StructuralMutation, number>
    hop2: Record<StructuralMutation, number>
  }
  bestTwoHopPath: {
    pathId: string
    intermediateRank: number
    intermediateMutation: StructuralMutation
    grandchildLexicalRank: number
    grandchildCheapRank: number
    grandchildMutation: StructuralMutation
    originalParent: StormTwoHopMetric
    intermediate: StormTwoHopMetric
    grandchild: StormTwoHopMetric
    relationVsParent: StormTwoHopRelation
    relationVsBGlobalBest: StormTwoHopRelation
    improvesFrozenReference: boolean
  }
  costAccounting: {
    intermediateCount: number
    intermediateFullPolishCoordinateTrials: number
    intermediateCanonicalLabelEvaluations: number
    hop2ProposalCount: number
    prePolishCanonicalEvaluations: number
    fullPolishCoordinateTrials: number
    canonicalLabelEvaluations: number
    duplicateSemanticStates: number
    uniqueSemanticGrandchildren: number
    parentBaselineCanonicalEvaluations: number
    productionCostClaim: false
  }
  classification: StormTwoHopReachabilityClassification
  decisionCriteria: {
    materialDefinition: string
    bridgePaths: number
    bridgePathsBlockedByCurrentMechanism: number
    bridgePathsReachableUnderCurrentMechanism: number
    unresolvedBridgePaths: number
    localOnlyPaths: number
    noHeadroom: boolean
    directIntermediateImprovementCount: number
    frozenReferenceImprovementPathCount: number
  }
  interpretation: string[]
  limitations: string[]
  deterministic: { nonTimingArtifactReproduction: boolean; depthEdges: 2; predecessorArtifactsUnchanged: boolean }
  testsAndGates: {
    focusedTestCommand: string
    generationCommand: string
    requiredGateCommands: string[]
    gateResults: Record<string, GateStatus>
  }
}

export interface StormTwoHopReachabilityOptions {
  outputPath?: string
  reportPath?: string
  postInitialInputPath?: string
  dynamicInputPath?: string
  cheapInputPath?: string
  replayInputPath?: string
  snapshotPath?: string
  gateResults?: Record<string, GateStatus>
}

export interface GeneratedStormTwoHopReachabilityArtifacts {
  artifact: StormTwoHopReachabilityArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

const SCOPE_CONTRACT: StormTwoHopReachabilityArtifact['scopeContract'] = {
  taskAction: 'IMPLEMENT',
  taskDomain: 'RESEARCH',
  criticality: 'MAJOR',
  allowedPaths: [
    'packages/core/benchmarks/research/** (new two-hop runner/helper only)',
    'packages/core/test/autoeq/v2/research/** (focused tests)',
    'packages/core/package.json (one research script)',
    'packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/**',
    'docs/superpowers/specs/2026-09-10-storm-two-hop-reachability-census-results.md',
  ],
  forbiddenPaths: [
    'packages/core/src/**', 'normal/default solver behavior', 'mutation library', 'selector/reference implementation',
    'fixtures/baselines', 'UI/export/product', 'historical artifacts', 'unrelated WIP',
  ],
  dependencies: [
    'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json',
    'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json',
    'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json',
    'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
    'external:OracleReferenceSnapshotV1.json',
  ],
  plan: [
    'Freeze exactly the prior census unique parent and all 31 proposal outcomes before evaluating hop 2.',
    'Reconstruct every full-polished canonical-delivered intermediate and verify metric fidelity.',
    'Derive residuals from each delivered intermediate, enumerate every current structural mutation in lexical order, rank cheap pre-polish outcomes, and full-polish/canonical-evaluate every grandchild offline.',
    'Preserve path provenance while deduplicating semantic grandchildren for quantity metrics, then classify reachability and mechanism attribution.',
  ],
  acceptanceCriteria: [
    'All 31 frozen intermediates are covered; no cherry-picking.',
    'Depth is exactly two structural edges and no normal beam/search is run.',
    'Baseline and B global-best comparators are frozen without future leakage.',
    'Classification uses the five literal decision outcomes and distinguishes evidence from inference.',
    'Predecessor artifacts have identical before/after hashes and deterministic output reproduces.',
  ],
  tests: [
    'focused Vitest covering 31 intermediates, residual provenance, ranking isolation, depth, duplicate provenance, deterministic reproduction, and predecessor hashes',
    'runner generation twice with non-timing artifact comparison',
    'git diff --check and repository gates after the diff stabilizes',
  ],
  retryBudget: { maxAttempts: 3, attempt: 1, remainingAttempts: 2 },
  stopConditions: [
    'stop after Luna IMPLEMENTATION_COMPLETE → Terra acceptance of this two-hop census',
    'do not execute great-grandchildren, causal worsening intervention, policy changes, MP audit, holdout, promotion, merge, release, deploy, or publish',
  ],
  doNotChange: [
    'packages/core/src/**', 'normal/default solver behavior', 'beam/admission/mutation/selector/reference policy',
    'fixtures/baselines', 'UI/export/product', 'historical artifacts', 'Storm/Max10/current structural generator/local polish 24/standard-v2/canonical delivered controls',
  ],
}

const POST_INITIAL_INPUT = 'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json' as const
const DYNAMIC_INPUT = 'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json' as const
const CHEAP_INPUT = 'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json' as const
const REPLAY_INPUT = 'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json' as const
const EXPECTED_POST_INITIAL_SHA256 = 'fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920' as const
const EXPECTED_DYNAMIC_SHA256 = 'c97d7f764923cdb50ac2a097732b74a96c84e797568e8d0842294753ea6aa3a1' as const
const EXPECTED_CHEAP_SHA256 = '6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc' as const
const EXPECTED_REPLAY_SHA256 = '930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba' as const
const EXPECTED_REFERENCE_CONTENT_SHA256 = '0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3' as const
const EXPECTED_REFERENCE_FILE_SHA256 = 'a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd' as const
const EPSILON = 1e-12

const MUTATIONS: StructuralMutation[] = ['add-pk', 'add-ls', 'add-hs', 'remove', 'type-mutation', 'split', 'merge']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(label + ' is required')
  return value
}

function cloneFilter(value: unknown, label: string): Filter {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  if (value.type !== 'PK' && value.type !== 'LS' && value.type !== 'HS') throw new Error(label + '.type is invalid')
  if (typeof value.id !== 'string' || value.id.length === 0 || typeof value.enabled !== 'boolean' ||
      typeof value.frequencyHz !== 'number' || !Number.isFinite(value.frequencyHz) ||
      typeof value.gainDb !== 'number' || !Number.isFinite(value.gainDb) ||
      typeof value.q !== 'number' || !Number.isFinite(value.q)) throw new Error(label + ' contains invalid filter values')
  return { id: value.id, enabled: value.enabled, type: value.type, frequencyHz: value.frequencyHz, gainDb: value.gainDb, q: value.q }
}

function cloneFilters(value: unknown, label: string): Filter[] {
  if (!Array.isArray(value)) throw new Error(label + ' must be an array')
  return value.map((filter, index) => cloneFilter(filter, `${label}[${index}]`))
}

function cloneMetric(value: unknown, label: string): StormTwoHopMetric {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  const numeric = ['rmseDb', 'maxAbsDb', 'filterCount', 'cancellationScore', 'referenceRegret'] as const
  for (const field of numeric) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) throw new Error(`${label}.${field} must be finite`)
  }
  const rmseDb = value.rmseDb as number
  const maxAbsDb = value.maxAbsDb as number
  const filterCount = value.filterCount as number
  const cancellationScore = value.cancellationScore as number
  const referenceRegret = value.referenceRegret as number
  if (!Number.isSafeInteger(filterCount) || filterCount < 0) throw new Error(label + '.filterCount must be a non-negative integer')
  return {
    rmseDb,
    maxAbsDb,
    filterCount,
    cancellationScore,
    referenceRegret,
    ...(typeof value.referenceImproved === 'boolean' ? { referenceImproved: value.referenceImproved } : {}),
  }
}

function cloneMutation(value: unknown, label: string): StructuralMutation {
  if (typeof value !== 'string' || !MUTATIONS.includes(value as StructuralMutation)) throw new Error(label + ' is not a structural mutation')
  return value as StructuralMutation
}

function cloneFrozenProposal(value: unknown, index: number): FrozenPostInitialProposal {
  if (!isRecord(value)) throw new Error('frozen intermediate ' + index + ' must be an object')
  const rank = value.rank as number
  const originalOrdinal = value.originalOrdinal as number
  if (!Number.isSafeInteger(rank) || rank <= 0 || !Number.isSafeInteger(originalOrdinal) || originalOrdinal <= 0) throw new Error('frozen intermediate rank is invalid')
  return {
    rank,
    originalOrdinal,
    mutation: cloneMutation(value.mutation, `frozen intermediate ${index}.mutation`),
    filtersBeforePolish: cloneFilters(value.filtersBeforePolish, `frozen intermediate ${index}.filtersBeforePolish`),
    canonical: cloneMetric(value.canonical, `frozen intermediate ${index}.canonical`),
  }
}

function readJson<T>(path: string, label: string): T {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  return value as T
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (isRecord(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('cannot serialize undefined')
  return serialized
}

function currentCommit(): string | null {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), encoding: 'utf8' }).trim()
    return /^[a-f0-9]{40,64}$/.test(commit) ? commit : null
  } catch {
    return null
  }
}

function cloneFilterList(filters: readonly Filter[]): Filter[] { return filters.map((filter) => ({ ...filter })) }

export function stormTwoHopSemanticFilterKey(filters: readonly Filter[]): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return JSON.stringify(filters.map(({ id: _id, ...filter }) => filter).sort((left, right) =>
    order[left.type] - order[right.type] || left.frequencyHz - right.frequencyHz || left.gainDb - right.gainDb ||
    left.q - right.q || Number(left.enabled) - Number(right.enabled)))
}

function selectorPoint(candidateId: string, metric: StormTwoHopMetric): SelectorPoint {
  return { candidateId, rmseDb: metric.rmseDb, maxAbsDb: metric.maxAbsDb, filterCount: metric.filterCount, cancellationScore: metric.cancellationScore }
}

function dominates(left: StormTwoHopMetric, right: StormTwoHopMetric): boolean {
  return left.rmseDb <= right.rmseDb + EPSILON && left.maxAbsDb <= right.maxAbsDb + EPSILON &&
    (left.rmseDb < right.rmseDb - EPSILON || left.maxAbsDb < right.maxAbsDb - EPSILON)
}

function paretoRelation(left: StormTwoHopMetric, right: StormTwoHopMetric): StormTwoHopParetoRelation {
  if (dominates(left, right)) return 'candidate-dominates'
  if (dominates(right, left)) return 'baseline-dominates'
  if (Math.abs(left.rmseDb - right.rmseDb) <= EPSILON && Math.abs(left.maxAbsDb - right.maxAbsDb) <= EPSILON) return 'equivalent'
  return 'tradeoff'
}

function relation(candidateMetric: StormTwoHopMetric, baselineMetric: StormTwoHopMetric, baselineId: string): StormTwoHopRelation {
  const selected = selectReferencePoint([selectorPoint('candidate', candidateMetric), selectorPoint(baselineId, baselineMetric)])
  return { pareto: paretoRelation(candidateMetric, baselineMetric), selectorWinner: selected.candidateId === 'candidate' ? 'candidate' : 'baseline' }
}

function materiallyImproves(candidateMetric: StormTwoHopMetric, baselineMetric: StormTwoHopMetric, baselineId: string): boolean {
  const compared = relation(candidateMetric, baselineMetric, baselineId)
  return compared.selectorWinner === 'candidate' || compared.pareto === 'candidate-dominates'
}

function metricFromEvaluation(evaluation: SolverLabEvaluationV1, references: readonly ReferenceRegretPoint[]): StormTwoHopMetric {
  if (!evaluation.valid || evaluation.deliverable === null) throw new Error('Storm two-hop candidate was rejected: ' + evaluation.rejectionReason)
  const delivered = evaluation.deliverable
  const regret = directedReferenceRegret({ candidateId: evaluation.candidateId, rmseDb: delivered.rmseDb, maxAbsDb: delivered.maxAbsDb, filterCount: delivered.filters.length }, references)
  return { rmseDb: delivered.rmseDb, maxAbsDb: delivered.maxAbsDb, filterCount: delivered.filters.length, cancellationScore: delivered.cancellationTotalScore, referenceRegret: regret.regret, referenceImproved: regret.referenceImproved }
}

function candidate(problem: SolverLabProblemV1, candidateId: string, filters: readonly Filter[]): SolverLabCandidateV1 {
  return { protocolVersion: 1, problemId: problem.problemId, inputSha256: problem.inputSha256, candidateId, algorithmId: STORM_TWO_HOP_REACHABILITY_EXPERIMENT_VERSION, seed: 0, filters: cloneFilterList(filters) }
}

function residualFor(problem: SolverLabProblemV1, filters: readonly Filter[]): number[] {
  const actual = cascadeMagnitudeDb(filters, problem.frequenciesHz, problem.sampleRateHz)
  return problem.desiredDb.map((desired, index) => desired - actual[index]!)
}

function continuousMetrics(filters: readonly Filter[], problem: SolverLabProblemV1): { rmseDb: number; maxAbsDb: number } {
  const solution = evaluateV2Solution(filters, problem.desiredDb, problem.frequenciesHz, problem.sampleRateHz)
  return { rmseDb: solution.metrics.rmseDb, maxAbsDb: solution.metrics.maxAbsDb }
}

function metricDelta(left: StormTwoHopMetric, right: StormTwoHopMetric): { rmseDelta: number; maxAbsDelta: number; regretDelta: number } {
  return { rmseDelta: Math.abs(left.rmseDb - right.rmseDb), maxAbsDelta: Math.abs(left.maxAbsDb - right.maxAbsDb), regretDelta: Math.abs(left.referenceRegret - right.referenceRegret) }
}

function metricEqual(left: StormTwoHopMetric, right: StormTwoHopMetric): boolean {
  return metricDelta(left, right).rmseDelta <= EPSILON && metricDelta(left, right).maxAbsDelta <= EPSILON &&
    left.filterCount === right.filterCount && Math.abs(left.cancellationScore - right.cancellationScore) <= EPSILON &&
    Math.abs(left.referenceRegret - right.referenceRegret) <= EPSILON
}

function emptyMutationCounts(): Record<StructuralMutation, number> {
  return { 'add-pk': 0, 'add-ls': 0, 'add-hs': 0, remove: 0, 'type-mutation': 0, split: 0, merge: 0 }
}

function parseReferences(snapshot: OracleReferenceSnapshotV1, problem: SolverLabProblemV1): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, STORM_TWO_HOP_REACHABILITY_MAX_FILTERS)
  const candidates = new Map(cell.candidates.map((entry) => [entry.candidateId, entry]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const entry = candidates.get(candidateId)
    if (entry === undefined) throw new Error('reference frontier candidate is absent: ' + candidateId)
    return { candidateId, rmseDb: entry.canonicalRmseDb, maxAbsDb: entry.canonicalMaxAbsDb, filterCount: entry.actualDeliveredFilterCount }
  })
}

function logicalPredecessors(paths: { postInitialPath: string; dynamicPath: string; cheapPath: string; replayPath: string; snapshotPath: string }): Array<{ logicalId: string; path: string }> {
  return [
    { logicalId: POST_INITIAL_INPUT, path: paths.postInitialPath },
    { logicalId: DYNAMIC_INPUT, path: paths.dynamicPath },
    { logicalId: CHEAP_INPUT, path: paths.cheapPath },
    { logicalId: REPLAY_INPUT, path: paths.replayPath },
    { logicalId: 'external:OracleReferenceSnapshotV1.json', path: paths.snapshotPath },
  ]
}

function snapshotHashes(paths: { postInitialPath: string; dynamicPath: string; cheapPath: string; replayPath: string; snapshotPath: string }): PredecessorArtifactHash[] {
  return logicalPredecessors(paths).map(({ logicalId, path }) => {
    const sha = sha256File(path)
    return { logicalId, sha256Before: sha, sha256After: sha, unchanged: true }
  })
}

function assertPredecessorHashesUnchanged(input: FrozenRuntimeInputs): PredecessorArtifactHash[] {
  return input.predecessorHashesBefore.map((entry) => {
    const path = logicalPredecessors(input).find((candidatePath) => candidatePath.logicalId === entry.logicalId)?.path
    if (path === undefined) throw new Error('predecessor logical path disappeared: ' + entry.logicalId)
    const after = sha256File(path)
    if (after !== entry.sha256Before) throw new Error('frozen predecessor artifact changed during two-hop census: ' + entry.logicalId)
    return { ...entry, sha256After: after, unchanged: true }
  })
}

function trajectoryGlobalBestAtEvaluation(
  trajectory: ReadonlyArray<{ evaluationIndex: number; candidateId: string; metrics: StormTwoHopMetric }>,
  evaluationIndex: number,
): { candidateId: string; metrics: StormTwoHopMetric } {
  const prefix = trajectory.filter((point) => point.evaluationIndex <= evaluationIndex)
  if (prefix.length === 0) throw new Error('B trajectory prefix is empty')
  const selected = selectReferencePoint(prefix.map((point) => selectorPoint(point.candidateId, point.metrics)))
  const point = prefix.find((entry) => entry.candidateId === selected.candidateId)
  if (point === undefined) throw new Error('B trajectory selector winner is absent')
  return { candidateId: point.candidateId, metrics: { ...point.metrics } }
}

function cheapStates(cheap: CheapArtifact): CheapState[] {
  return [cheap.arms.cheapAdmission.seedValidation, ...cheap.arms.cheapAdmission.descendants]
}

function stateForIdentity(cheap: CheapArtifact, identity: string): CheapState {
  const state = cheapStates(cheap).find((entry) => entry.candidateId.endsWith(identity))
  if (state === undefined) throw new Error('cheap frozen artifact lacks state for identity: ' + identity)
  return state
}

function loadRuntimeInputs(options: StormTwoHopReachabilityOptions): FrozenRuntimeInputs {
  const postInitialPath = resolveResearchPath(options.postInitialInputPath ?? POST_INITIAL_INPUT)
  const dynamicPath = resolveResearchPath(options.dynamicInputPath ?? DYNAMIC_INPUT)
  const cheapPath = resolveResearchPath(options.cheapInputPath ?? CHEAP_INPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? REPLAY_INPUT)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const paths = { postInitialPath, dynamicPath, cheapPath, replayPath, snapshotPath }
  const hashes = snapshotHashes(paths)
  const byId = new Map(hashes.map((entry) => [entry.logicalId, entry.sha256Before]))
  if (byId.get(POST_INITIAL_INPUT) !== EXPECTED_POST_INITIAL_SHA256) throw new Error('frozen post-initial census artifact hash drifted')
  if (byId.get(DYNAMIC_INPUT) !== EXPECTED_DYNAMIC_SHA256) throw new Error('frozen dynamic artifact hash drifted')
  if (byId.get(CHEAP_INPUT) !== EXPECTED_CHEAP_SHA256) throw new Error('frozen cheap artifact hash drifted')
  if (byId.get(REPLAY_INPUT) !== EXPECTED_REPLAY_SHA256) throw new Error('frozen replay artifact hash drifted')
  if (byId.get('external:OracleReferenceSnapshotV1.json') !== EXPECTED_REFERENCE_FILE_SHA256) throw new Error('frozen reference snapshot file hash drifted')

  const postValue = readJson<FrozenPostInitialArtifact>(postInitialPath, 'post-initial census artifact')
  const dynamic = readJson<DynamicArtifact>(dynamicPath, 'dynamic artifact')
  const cheap = readJson<CheapArtifact>(cheapPath, 'cheap artifact')
  const replay = readJson<ReplayArtifact>(replayPath, 'replay artifact')
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  if (snapshotValue.contentSha256 !== EXPECTED_REFERENCE_CONTENT_SHA256) throw new Error('frozen reference snapshot content hash drifted')
  if (postValue.schemaVersion !== 1 || postValue.experimentVersion !== 'storm-post-initial-admission-census-v1' || postValue.caseId !== 'titan-to-storm' || postValue.primarySeedId !== STORM_TWO_HOP_REACHABILITY_PRIMARY_ID) throw new Error('post-initial census identity drifted')
  if (postValue.parents.length !== 1 || postValue.parents[0] === undefined) throw new Error('post-initial census must contain one parent')
  const frozenParent = postValue.frozenParentSet.uniquePostInitialParents[0]
  const parent = postValue.parents[0]
  if (frozenParent === undefined || parent.proposalCount !== 31 || parent.proposals.length !== 31) throw new Error('post-initial census must contain exactly 31 frozen proposals')
  if (JSON.stringify(parent.lexicalTop4) !== JSON.stringify([1, 2, 3, 4]) || JSON.stringify(parent.cheapTop4) !== JSON.stringify([14, 15, 21, 22]) || parent.overlap !== 0) throw new Error('frozen post-initial rank census facts drifted')
  if (postValue.frozenParentSet.totalExpansionOccurrences !== 20 || postValue.frozenParentSet.initialExcludedOccurrences !== 12 || postValue.frozenParentSet.postInitialExpansionOccurrences !== 8 || postValue.frozenParentSet.repeatedOccurrencesRemoved !== 7 || postValue.frozenParentSet.uniquePostInitialParents.length !== 1 || frozenParent.occurrenceCount !== 8) throw new Error('frozen post-initial parent census facts drifted')
  if (parent.proposals.some((proposal, index) => proposal.rank !== index + 1)) throw new Error('frozen 31 intermediate ranks are not lexical and contiguous')
  if (dynamic.schemaVersion !== 1 || dynamic.primarySeedId !== STORM_TWO_HOP_REACHABILITY_PRIMARY_ID) throw new Error('dynamic artifact identity drifted')
  if (cheap.schemaVersion !== 1 || cheap.experimentVersion !== 'storm-cheap-admission-causal-v1' || cheap.primarySeedId !== STORM_TWO_HOP_REACHABILITY_PRIMARY_ID) throw new Error('cheap artifact identity drifted')
  if (replay.primarySeedId !== STORM_TWO_HOP_REACHABILITY_PRIMARY_ID) throw new Error('replay artifact identity drifted')
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm adversarial research case is unavailable')
  const problem = createSolverLabProblem(researchCase, STORM_TWO_HOP_REACHABILITY_MAX_FILTERS)
  const references = parseReferences(snapshotValue, problem)
  const bInitialState = cheap.arms.cheapAdmission.seedValidation
  const bInitial = cloneMetric(bInitialState.metrics, 'B initial metrics')
  const trajectory = cheap.arms.cheapAdmission.trajectory.map((point) => ({ evaluationIndex: point.evaluationIndex, candidateId: point.candidateId, metrics: cloneMetric(point.metrics, 'B trajectory metrics') }))
  const evaluationIndex = frozenParent.occurrences[0]?.evaluationIndex
  if (evaluationIndex !== 4) throw new Error('frozen parent evaluation index must be 4')
  const global = trajectoryGlobalBestAtEvaluation(trajectory, evaluationIndex)
  if (!metricEqual(global.metrics, frozenParent.trajectoryGlobalBest)) throw new Error('B global-best comparator is not frozen to the parent prefix')
  const bGlobalState = stateForIdentity(cheap, global.candidateId)
  return {
    ...paths,
    postInitial: {
      ...postValue,
      parents: [{ ...parent, proposals: parent.proposals.map(cloneFrozenProposal) }],
      frozenParentSet: { ...postValue.frozenParentSet, uniquePostInitialParents: [{ ...frozenParent, filters: cloneFilters(frozenParent.filters, 'frozen parent filters'), canonicalMetrics: cloneMetric(frozenParent.canonicalMetrics, 'frozen parent canonical metrics'), trajectoryGlobalBest: cloneMetric(frozenParent.trajectoryGlobalBest, 'frozen parent trajectory global best') }] },
    },
    dynamic,
    cheap,
    replay,
    problem,
    references,
    predecessorHashesBefore: hashes,
    snapshotContentSha256: snapshotValue.contentSha256,
    bInitial,
    bGlobalBestCandidateId: global.candidateId,
    bGlobalBest: global.metrics,
    bGlobalBestFilters: cloneFilters(bGlobalState.canonicalFilters, 'B global-best filters'),
  }
}

interface FrozenExpansionEvidence {
  bRanks: number[]
  cRanks: number[]
  bExpandedRanks: number[]
  cExpandedRanks: number[]
}

function expansionEvidence(dynamic: DynamicArtifact, parentIdentity: string): FrozenExpansionEvidence {
  const bRanks = new Set<number>()
  const cRanks = new Set<number>()
  const bChildren = new Map<string, number>()
  const cChildren = new Map<string, number>()
  for (const run of dynamic.runs) {
    const target = run.armId === 'cheap-initial-only' ? bRanks : run.armId === 'cheap-all-parents' ? cRanks : null
    const childMap = run.armId === 'cheap-initial-only' ? bChildren : run.armId === 'cheap-all-parents' ? cChildren : null
    if (target === null || childMap === null) continue
    for (const decision of run.parentDecisions) {
      if (decision.parentIdentity === parentIdentity) decision.admittedProposalRanks.forEach((rank) => target.add(rank))
      decision.admittedChildSet.forEach((childId, index) => {
        const rank = decision.admittedProposalRanks[index]
        if (rank !== undefined) childMap.set(childId, rank)
      })
    }
  }
  const bExpanded = new Set<number>()
  const cExpanded = new Set<number>()
  for (const run of dynamic.runs) {
    const childMap = run.armId === 'cheap-initial-only' ? bChildren : run.armId === 'cheap-all-parents' ? cChildren : null
    const expanded = run.armId === 'cheap-initial-only' ? bExpanded : run.armId === 'cheap-all-parents' ? cExpanded : null
    if (childMap === null || expanded === null) continue
    for (const decision of run.parentDecisions) {
      const rank = childMap.get(decision.parentIdentity)
      if (rank !== undefined) expanded.add(rank)
    }
  }
  return { bRanks: [...bRanks].sort((a, b) => a - b), cRanks: [...cRanks].sort((a, b) => a - b), bExpandedRanks: [...bExpanded].sort((a, b) => a - b), cExpandedRanks: [...cExpanded].sort((a, b) => a - b) }
}

function reconstructRetention(
  intermediate: StormTwoHopMetric,
  rank: number,
  parent: StormTwoHopMetric,
  initial: StormTwoHopMetric,
  frozenProposals: readonly FrozenPostInitialProposal[],
  evidence: FrozenExpansionEvidence,
): StormTwoHopRetentionStatus {
  const candidateId = `intermediate-${String(rank).padStart(4, '0')}`
  const lexical = frozenProposals.filter((proposal) => proposal.rank <= STORM_TWO_HOP_REACHABILITY_TOP4)
  const states: Array<{ candidateId: string; metric: StormTwoHopMetric }> = [
    { candidateId: 'initial-parent', metric: initial },
    { candidateId: 'frozen-parent', metric: parent },
    ...lexical.map((proposal) => ({ candidateId: candidateIdForRank(proposal.rank), metric: proposal.canonical })),
  ]
  if (!states.some((state) => state.candidateId === candidateId)) states.push({ candidateId, metric: intermediate })
  const self = states.find((state) => state.candidateId === candidateId)
  if (self === undefined) throw new Error('intermediate state missing from retention reconstruction')
  const competitors = states.filter((state) => state.candidateId !== candidateId)
  const paretoAgainstCompetitors = competitors.map((competitor) => ({ competitorId: competitor.candidateId, relation: relation(intermediate, competitor.metric, competitor.candidateId) }))
  const dominatedBy = competitors.some((competitor) => dominates(competitor.metric, intermediate))
  const frontier = states.filter((state, stateIndex) => !states.some((other, otherIndex) => stateIndex !== otherIndex && dominates(other.metric, state.metric)))
  const frontierEligible = frontier.some((state) => state.candidateId === candidateId)
  let selected = frontier.slice()
  const selectedIds: string[] = []
  while (selected.length > 0 && selectedIds.length < 2) {
    const choice = selectReferencePoint(selected.map((state) => selectorPoint(state.candidateId, state.metric))).candidateId
    selectedIds.push(choice)
    selected = selected.filter((state) => state.candidateId !== choice)
  }
  const currentBeamEligible = !dominatedBy && selectedIds.includes(candidateId)
  const rankInBeam = currentBeamEligible ? selectedIds.indexOf(candidateId) + 1 : null
  const observedInFrozenB = evidence.bRanks.includes(rank)
  const observedInFrozenC = evidence.cRanks.includes(rank)
  const status: StormTwoHopRetentionStatus['status'] = rank > STORM_TWO_HOP_REACHABILITY_TOP4
    ? 'hop1-admission-blocked'
    : !currentBeamEligible
      ? 'beam-retention-blocked'
      : observedInFrozenB || observedInFrozenC ? 'retained-observed' : 'retained-inferred'
  return {
    applicableCompetitorIds: competitors.map((competitor) => competitor.candidateId),
    paretoAgainstCompetitors,
    frozenSelectorPreference: relation(intermediate, parent, 'frozen-parent'),
    frontierEligible,
    currentBeamEligible,
    reconstructedBeamRank: rankInBeam,
    status,
    observedInFrozenB,
    observedInFrozenC,
    expandedAsParentInFrozenB: evidence.bExpandedRanks.includes(rank),
    expandedAsParentInFrozenC: evidence.cExpandedRanks.includes(rank),
    evidenceBasis: observedInFrozenB || observedInFrozenC ? 'direct-frozen-trajectory' : 'inferred-from-frozen-competitive-set',
  }
}

function candidateIdForRank(rank: number): string { return `intermediate-${String(rank).padStart(4, '0')}` }

function reconstructIntermediate(
  problem: SolverLabProblemV1,
  proposal: FrozenPostInitialProposal,
  parentMetric: StormTwoHopMetric,
  bGlobalBest: StormTwoHopMetric,
  bInitial: StormTwoHopMetric,
  references: readonly ReferenceRegretPoint[],
  cheapRankByProposal: ReadonlyMap<number, number>,
  expansion: FrozenExpansionEvidence,
  frozenProposals: readonly FrozenPostInitialProposal[],
): StormTwoHopIntermediate {
  const polished = polishStructuralProposal(problem, proposal.filtersBeforePolish, STORM_TWO_HOP_REACHABILITY_LOCAL_POLISH, () => false)
  const delivered = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
  const evaluation = evaluateSolverLabCandidate(problem, candidate(problem, `storm-two-hop-intermediate-${String(proposal.rank).padStart(4, '0')}`, delivered))
  const canonical = metricFromEvaluation(evaluation, references)
  const deltas = metricDelta(canonical, proposal.canonical)
  if (!metricEqual(canonical, proposal.canonical)) throw new Error('reconstructed intermediate does not match frozen census rank ' + proposal.rank)
  const cheapRank = cheapRankByProposal.get(proposal.rank)
  if (cheapRank === undefined) throw new Error('frozen intermediate cheap rank is absent: ' + proposal.rank)
  const retention = reconstructRetention(canonical, proposal.rank, parentMetric, bInitial, frozenProposals, expansion)
  return {
    rank: proposal.rank,
    originalOrdinal: proposal.originalOrdinal,
    mutation: proposal.mutation,
    filtersBeforePolish: cloneFilterList(proposal.filtersBeforePolish),
    polishedContinuousFilters: cloneFilterList(polished.refinedFilters),
    canonicalDeliveredFilters: cloneFilterList(evaluation.deliverable?.filters ?? delivered),
    censusCanonical: { ...proposal.canonical },
    reconstructedCanonical: { ...canonical },
    reconstructionFidelity: { exactWithinTolerance: true, ...deltas },
    canonical,
    admission: { lexicalRank: proposal.rank, lexicalTop4: proposal.rank <= STORM_TWO_HOP_REACHABILITY_TOP4, cheapRank, cheapTop4: cheapRank <= STORM_TWO_HOP_REACHABILITY_TOP4 },
    relationVsParent: relation(canonical, parentMetric, 'frozen-parent'),
    relationVsBGlobalBest: relation(canonical, bGlobalBest, 'B-global-best'),
    improvesParent: materiallyImproves(canonical, parentMetric, 'frozen-parent'),
    improvesBGlobalBest: materiallyImproves(canonical, bGlobalBest, 'B-global-best'),
    retention,
    hop2ResidualSourceSemanticKey: stormTwoHopSemanticFilterKey(evaluation.deliverable?.filters ?? delivered),
    hop2ProposalCount: 0,
    hop2UniqueSemanticGrandchildren: 0,
    hop2DuplicateSemanticGrandchildren: 0,
    hop2MutationCounts: emptyMutationCounts(),
    grandchildrenBetterThanIntermediate: 0,
    grandchildrenBetterThanParent: 0,
    grandchildrenBetterThanBGlobalBest: 0,
    grandchildrenImproveFrozenReference: 0,
    bestGrandchildPathId: null,
    bestGrandchild: null,
    grandchildren: [],
  }
}

interface GrandchildEvaluationResult {
  grandchildren: StormTwoHopGrandchild[]
  semanticGrandchildren: StormTwoHopSemanticGrandchild[]
  hop2MutationCounts: Record<StructuralMutation, number>
  hop2ProposalCount: number
  prePolishCanonicalEvaluations: number
  fullPolishCoordinateTrials: number
}

function evaluateGrandchildren(
  problem: SolverLabProblemV1,
  intermediates: StormTwoHopIntermediate[],
  parentMetric: StormTwoHopMetric,
  bGlobalBest: StormTwoHopMetric,
  references: readonly ReferenceRegretPoint[],
): GrandchildEvaluationResult {
  const allGrandchildren: StormTwoHopGrandchild[] = []
  const hop2MutationCounts = emptyMutationCounts()
  let prePolishCanonicalEvaluations = 0
  let fullPolishCoordinateTrials = 0
  for (const intermediate of intermediates) {
    const residual = residualFor(problem, intermediate.canonicalDeliveredFilters)
    const proposals = enumerateStormStructuralProposals({ problem, parentFilters: intermediate.canonicalDeliveredFilters, residualDb: residual, top4: Number.MAX_SAFE_INTEGER })
    if (proposals.length === 0) throw new Error('intermediate has no structural grandchildren: ' + intermediate.rank)
    const cheapScores: StormTwoHopCheapScore[] = []
    for (const proposal of proposals) {
      const evaluation = evaluateSolverLabCandidate(problem, candidate(problem, `storm-two-hop-pre-polish-${String(intermediate.rank).padStart(4, '0')}-${String(proposal.rank).padStart(4, '0')}`, proposal.filters))
      const metric = metricFromEvaluation(evaluation, references)
      cheapScores.push({ proposalRank: proposal.rank, rmseDb: metric.rmseDb, maxAbsDb: metric.maxAbsDb, filterCount: metric.filterCount, cancellationScore: metric.cancellationScore })
      prePolishCanonicalEvaluations += 1
    }
    const cheapRanking = rankStormTwoHopCheapAdmission(cheapScores)
    const cheapRankByProposal = new Map(cheapRanking.ranking.map((rank, index) => [rank, index + 1]))
    for (const proposal of proposals) {
      const cheapRank = cheapRankByProposal.get(proposal.rank)
      if (cheapRank === undefined) throw new Error('grandchild cheap rank is absent: ' + proposal.rank)
      const mutation = proposal.mutation
      hop2MutationCounts[mutation] += 1
      const cheapMetric = cheapScores[proposal.rank - 1]
      if (cheapMetric === undefined) throw new Error('grandchild pre-polish metric is absent: ' + proposal.rank)
      const polished = polishStructuralProposal(problem, proposal.filters, STORM_TWO_HOP_REACHABILITY_LOCAL_POLISH, () => false)
      fullPolishCoordinateTrials += polished.coordinateTrials
      const delivered = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
      const evaluation = evaluateSolverLabCandidate(problem, candidate(problem, `storm-two-hop-grandchild-${String(intermediate.rank).padStart(4, '0')}-${String(proposal.rank).padStart(4, '0')}`, delivered))
      const canonical = metricFromEvaluation(evaluation, references)
      const pathId = `parent-intermediate-${String(intermediate.rank).padStart(4, '0')}-grandchild-${String(proposal.rank).padStart(4, '0')}`
      allGrandchildren.push({
        pathId,
        depthEdges: 2,
        intermediateRank: intermediate.rank,
        intermediateMutation: intermediate.mutation,
        lexicalRank: proposal.rank,
        cheapRank,
        admission: { lexicalRank: proposal.rank, lexicalTop4: proposal.rank <= STORM_TWO_HOP_REACHABILITY_TOP4, cheapRank, cheapTop4: cheapRank <= STORM_TWO_HOP_REACHABILITY_TOP4 },
        originalOrdinal: proposal.originalOrdinal,
        mutation,
        filtersBeforePolish: cloneFilterList(proposal.filters),
        polishedContinuousFilters: cloneFilterList(polished.refinedFilters),
        canonicalDeliveredFilters: cloneFilterList(evaluation.deliverable?.filters ?? delivered),
        prePolish: { rmseDb: cheapMetric.rmseDb, maxAbsDb: cheapMetric.maxAbsDb, filterCount: cheapMetric.filterCount, cancellationScore: cheapMetric.cancellationScore },
        postPolishContinuous: continuousMetrics(polished.refinedFilters, problem),
        canonical,
        relationVsIntermediate: relation(canonical, intermediate.canonical, candidateIdForRank(intermediate.rank)),
        relationVsParent: relation(canonical, parentMetric, 'frozen-parent'),
        relationVsBGlobalBest: relation(canonical, bGlobalBest, 'B-global-best'),
        improvesIntermediate: materiallyImproves(canonical, intermediate.canonical, candidateIdForRank(intermediate.rank)),
        improvesParent: materiallyImproves(canonical, parentMetric, 'frozen-parent'),
        improvesBGlobalBest: materiallyImproves(canonical, bGlobalBest, 'B-global-best'),
        improvesFrozenReference: canonical.referenceImproved === true,
        improvesLexicalAlternative: false,
        semanticKey: stormTwoHopSemanticFilterKey(evaluation.deliverable?.filters ?? delivered),
        semanticGroupId: '',
        semanticOccurrenceIndex: 0,
        bridge: false,
        mechanismBlocker: 'mechanism-unresolved',
      })
    }
  }
  const lexicalIntermediates = intermediates.filter((intermediate) => intermediate.admission.lexicalTop4)
  const groups = new Map<string, StormTwoHopSemanticGrandchild>()
  for (const grandchild of allGrandchildren) {
    grandchild.improvesLexicalAlternative = lexicalIntermediates.some((alternative) => materiallyImproves(grandchild.canonical, alternative.canonical, candidateIdForRank(alternative.rank)))
    const existing = groups.get(grandchild.semanticKey)
    if (existing === undefined) {
      const semanticGroupId = `semantic-grandchild-${String(groups.size + 1).padStart(4, '0')}`
      grandchild.semanticGroupId = semanticGroupId
      grandchild.semanticOccurrenceIndex = 1
      groups.set(grandchild.semanticKey, { semanticGroupId, semanticKey: grandchild.semanticKey, representativeCanonicalFilters: cloneFilterList(grandchild.canonicalDeliveredFilters), representativeCanonical: { ...grandchild.canonical }, pathIds: [grandchild.pathId], intermediateRanks: [grandchild.intermediateRank], occurrenceCount: 1 })
    } else {
      grandchild.semanticGroupId = existing.semanticGroupId
      grandchild.semanticOccurrenceIndex = existing.occurrenceCount + 1
      existing.pathIds.push(grandchild.pathId)
      if (!existing.intermediateRanks.includes(grandchild.intermediateRank)) existing.intermediateRanks.push(grandchild.intermediateRank)
      existing.occurrenceCount += 1
      if (!metricEqual(existing.representativeCanonical, grandchild.canonical)) throw new Error('semantic duplicate canonical metrics diverged')
    }
  }
  for (const grandchild of allGrandchildren) {
    const intermediate = intermediates[grandchild.intermediateRank - 1]
    if (intermediate === undefined) throw new Error('grandchild intermediate provenance is absent')
    grandchild.bridge = !intermediate.improvesParent && !intermediate.improvesBGlobalBest && (grandchild.improvesParent || grandchild.improvesBGlobalBest)
  }
  const semanticGrandchildren = [...groups.values()].map((group) => ({ ...group, pathIds: [...group.pathIds], intermediateRanks: [...group.intermediateRanks] }))
  return { grandchildren: allGrandchildren, semanticGrandchildren, hop2MutationCounts, hop2ProposalCount: allGrandchildren.length, prePolishCanonicalEvaluations, fullPolishCoordinateTrials }
}

function chooseBestGrandchild(grandchildren: readonly StormTwoHopGrandchild[]): StormTwoHopGrandchild {
  if (grandchildren.length === 0) throw new Error('grandchild set is empty')
  const selected = selectReferencePoint(grandchildren.map((grandchild) => selectorPoint(grandchild.pathId, grandchild.canonical)))
  const winner = grandchildren.find((grandchild) => grandchild.pathId === selected.candidateId)
  if (winner === undefined) throw new Error('best grandchild selector winner is absent')
  return winner
}

function mechanismBlocker(intermediate: StormTwoHopIntermediate, grandchild: StormTwoHopGrandchild): StormTwoHopMechanismBlocker {
  if (!intermediate.admission.lexicalTop4) return 'hop1-admission-blocked'
  if (intermediate.retention.status === 'beam-retention-blocked') return 'beam-retention-blocked'
  if (intermediate.retention.status !== 'retained-observed' && intermediate.retention.status !== 'retained-inferred') return 'mechanism-unresolved'
  if (!grandchild.admission.lexicalTop4) return 'hop2-admission-blocked'
  return 'reachable-under-current-mechanism'
}

function gateStatus(name: string): GateStatus | undefined {
  const value = process.env[name]
  if (value === undefined) return undefined
  return value === 'PASS_THIS_RUN' || value === 'PASS_PREVIOUSLY_VERIFIED' || value === 'FAIL' || value === 'BLOCKED_KNOWN' || value === 'NOT_RUN' ? value : undefined
}

function gateResults(options?: StormTwoHopReachabilityOptions): Record<string, GateStatus> {
  const artifactPath = resolveResearchPath(options?.outputPath ?? STORM_TWO_HOP_REACHABILITY_OUTPUT)
  let existing: Record<string, GateStatus> | undefined
  try {
    if (existsSync(artifactPath)) {
      const parsed = JSON.parse(readFileSync(artifactPath, 'utf8')) as { testsAndGates?: { gateResults?: Record<string, GateStatus> } }
      if (parsed?.testsAndGates?.gateResults && typeof parsed.testsAndGates.gateResults === 'object') {
        existing = parsed.testsAndGates.gateResults
      }
    }
  } catch {
    existing = undefined
  }

  const resolveGate = (name: string, key: string): GateStatus => {
    const envVal = gateStatus(name)
    return envVal ?? options?.gateResults?.[key] ?? existing?.[key] ?? 'NOT_RUN'
  }

  return {
    focused_test: resolveGate('STORM_TWO_HOP_GATE_FOCUSED_TEST', 'focused_test'),
    runner_reproduction: resolveGate('STORM_TWO_HOP_GATE_REPRODUCTION', 'runner_reproduction'),
    predecessor_hashes: resolveGate('STORM_TWO_HOP_GATE_PREDECESSOR_HASHES', 'predecessor_hashes'),
    pnpm_test: resolveGate('STORM_TWO_HOP_GATE_PNPM_TEST', 'pnpm_test'),
    pnpm_typecheck: resolveGate('STORM_TWO_HOP_GATE_TYPECHECK', 'pnpm_typecheck'),
    pnpm_build: resolveGate('STORM_TWO_HOP_GATE_BUILD', 'pnpm_build'),
    pnpm_lint: resolveGate('STORM_TWO_HOP_GATE_LINT', 'pnpm_lint'),
    core_benchmark: resolveGate('STORM_TWO_HOP_GATE_CORE_BENCHMARK', 'core_benchmark'),
    git_diff_check: resolveGate('STORM_TWO_HOP_GATE_DIFF_CHECK', 'git_diff_check'),
    routing_policy: resolveGate('STORM_TWO_HOP_GATE_ROUTING_POLICY', 'routing_policy'),
    depth_limit: resolveGate('STORM_TWO_HOP_GATE_DEPTH', 'depth_limit'),
    no_normal_search: resolveGate('STORM_TWO_HOP_GATE_NO_NORMAL_SEARCH', 'no_normal_search'),
    deterministic_reproduction: resolveGate('STORM_TWO_HOP_GATE_DETERMINISTIC', 'deterministic_reproduction'),
  }
}

function buildMechanismEvidence(
  intermediates: readonly StormTwoHopIntermediate[],
  grandchildren: readonly StormTwoHopGrandchild[],
): { bridgePaths: StormTwoHopBridgePath[]; counts: Record<StormTwoHopMechanismBlocker, number> } {
  const counts: Record<StormTwoHopMechanismBlocker, number> = {
    'hop1-admission-blocked': 0,
    'beam-retention-blocked': 0,
    'hop2-admission-blocked': 0,
    'reachable-under-current-mechanism': 0,
    'mechanism-unresolved': 0,
  }
  const bridgePaths: StormTwoHopBridgePath[] = []
  for (const grandchild of grandchildren.filter((entry) => entry.bridge)) {
    const intermediate = intermediates[grandchild.intermediateRank - 1]
    if (intermediate === undefined) throw new Error('bridge intermediate is absent')
    const blocker = mechanismBlocker(intermediate, grandchild)
    grandchild.mechanismBlocker = blocker
    counts[blocker] += 1
    bridgePaths.push({ pathId: grandchild.pathId, intermediateRank: intermediate.rank, grandchildLexicalRank: grandchild.lexicalRank, grandchildCheapRank: grandchild.cheapRank, intermediateAdmission: intermediate.admission, intermediateRetention: intermediate.retention, grandchildAdmission: grandchild.admission, blocker, evidence: blocker === 'reachable-under-current-mechanism' ? 'direct-frozen-trajectory' : 'inferred-offline-oracle' })
  }
  for (const grandchild of grandchildren.filter((entry) => !entry.bridge)) {
    const intermediate = intermediates[grandchild.intermediateRank - 1]
    if (intermediate !== undefined) grandchild.mechanismBlocker = mechanismBlocker(intermediate, grandchild)
  }
  return { bridgePaths, counts }
}

export function createStormTwoHopReachabilityArtifact(options: StormTwoHopReachabilityOptions = {}): StormTwoHopReachabilityArtifact {
  const inputs = loadRuntimeInputs(options)
  const postParent = inputs.postInitial.parents[0]!
  const frozenParent = inputs.postInitial.frozenParentSet.uniquePostInitialParents[0]!
  const cheapRankByProposal = new Map(postParent.cheapRanking.map((rank, index) => [rank, index + 1]))
  const expansion = expansionEvidence(inputs.dynamic, frozenParent.parentIdentity)
  const hop1MutationCounts = emptyMutationCounts()
  const intermediates: StormTwoHopIntermediate[] = []
  for (const proposal of postParent.proposals) {
    hop1MutationCounts[proposal.mutation] += 1
    const intermediate = reconstructIntermediate(inputs.problem, proposal, frozenParent.canonicalMetrics, inputs.bGlobalBest, inputs.bInitial, inputs.references, cheapRankByProposal, expansion, postParent.proposals)
    intermediates.push(intermediate)
  }
  if (intermediates.length !== 31) throw new Error('two-hop census did not cover exactly 31 intermediates')
  const intermediateFullPolishCoordinateTrials = intermediates.length * STORM_TWO_HOP_REACHABILITY_LOCAL_POLISH
  const intermediateCanonicalLabelEvaluations = intermediates.length
  const grandchildEvaluation = evaluateGrandchildren(inputs.problem, intermediates, frozenParent.canonicalMetrics, inputs.bGlobalBest, inputs.references)
  const mechanism = buildMechanismEvidence(intermediates, grandchildEvaluation.grandchildren)
  for (const intermediate of intermediates) {
    const grandchildren = grandchildEvaluation.grandchildren.filter((grandchild) => grandchild.intermediateRank === intermediate.rank)
    const unique = new Set(grandchildren.map((grandchild) => grandchild.semanticKey)).size
    const best = chooseBestGrandchild(grandchildren)
    intermediate.grandchildren = grandchildren
    intermediate.hop2ProposalCount = grandchildren.length
    intermediate.hop2UniqueSemanticGrandchildren = unique
    intermediate.hop2DuplicateSemanticGrandchildren = grandchildren.length - unique
    intermediate.hop2MutationCounts = emptyMutationCounts()
    grandchildren.forEach((grandchild) => { intermediate.hop2MutationCounts[grandchild.mutation] += 1 })
    intermediate.grandchildrenBetterThanIntermediate = grandchildren.filter((grandchild) => grandchild.improvesIntermediate).length
    intermediate.grandchildrenBetterThanParent = grandchildren.filter((grandchild) => grandchild.improvesParent).length
    intermediate.grandchildrenBetterThanBGlobalBest = grandchildren.filter((grandchild) => grandchild.improvesBGlobalBest).length
    intermediate.grandchildrenImproveFrozenReference = grandchildren.filter((grandchild) => grandchild.improvesFrozenReference).length
    intermediate.bestGrandchildPathId = best.pathId
    intermediate.bestGrandchild = { ...best.canonical }
  }
  const directIntermediateImprovementCount = intermediates.filter((intermediate) => intermediate.improvesParent || intermediate.improvesBGlobalBest).length
  const bridgePaths = mechanism.bridgePaths
  const blockedBridgeCount = bridgePaths.filter((path) => path.blocker !== 'reachable-under-current-mechanism' && path.blocker !== 'mechanism-unresolved').length
  const reachableBridgeCount = bridgePaths.filter((path) => path.blocker === 'reachable-under-current-mechanism').length
  const unresolvedBridgeCount = bridgePaths.filter((path) => path.blocker === 'mechanism-unresolved').length
  const materialGrandchildren = grandchildEvaluation.grandchildren.filter((grandchild) => grandchild.improvesParent || grandchild.improvesBGlobalBest)
  const localOnlyGrandchildren = grandchildEvaluation.grandchildren.filter((grandchild) => !grandchild.improvesParent && !grandchild.improvesBGlobalBest && (grandchild.improvesIntermediate || grandchild.improvesLexicalAlternative))
  const classification = classifyStormTwoHopReachability({
    bridgeSupported: blockedBridgeCount > 0 && reachableBridgeCount === 0 && unresolvedBridgeCount === 0,
    reachableCurrently: reachableBridgeCount > 0 || (materialGrandchildren.length > 0 && blockedBridgeCount === 0 && unresolvedBridgeCount === 0),
    localOnly: materialGrandchildren.length === 0 && localOnlyGrandchildren.length > 0,
    noHeadroom: materialGrandchildren.length === 0 && localOnlyGrandchildren.length === 0,
    unresolved: unresolvedBridgeCount > 0 || (blockedBridgeCount > 0 && reachableBridgeCount > 0),
    maxDepthEdges: STORM_TWO_HOP_REACHABILITY_MAX_DEPTH_EDGES,
  })
  const best = chooseBestGrandchild(grandchildEvaluation.grandchildren)
  const predecessorHashes = assertPredecessorHashesUnchanged(inputs)
  const semanticGrandchildren = grandchildEvaluation.semanticGrandchildren
  const duplicateSemanticStates = grandchildEvaluation.grandchildren.length - semanticGrandchildren.length
  const interpretation = classification === 'temporary-worsening-bridge-supported'
    ? ['A grandchild improves the parent/B global-best while its intermediate does not; this supports a two-edge temporary-worsening bridge in the frozen neighborhood.', 'The blocker attribution is based on frozen lexical admission and reconstructed beam evidence; it does not authorize a worsening allowance, wider beam, or ranking-policy change.', 'Terra should design the smallest equal-budget causal intervention for the identified bridge before any policy decision.']
    : classification === 'two-hop-opportunity-reachable-currently'
      ? ['A material grandchild exists on a path that is admissible/retainable under the current mechanism, so the issue is reachability/execution semantics rather than automatically a temporary-worsening barrier.', 'Investigate frozen budget, scheduling, visited-state, or execution semantics before changing admission or beam policy.']
      : classification === 'two-hop-local-only'
        ? ['Some grandchildren improve their intermediate or lexical alternatives, but none improves the parent or B global-best materially.', 'This neighborhood supplies local headroom only; reduce priority of the temporary-worsening hypothesis and consider the next approved diagnostic.']
        : classification === 'two-hop-no-headroom'
          ? ['No grandchild produces a material signal against the intermediate, parent, or B global-best across the exhaustive two-hop census.', 'The temporary-worsening hypothesis has no headroom in this neighborhood at this budget.']
          : ['Results include contradictory or unresolved reachability evidence; do not attribute a structural barrier without a new bounded experiment.']
  const limitations = [
    'This is an exhaustive offline oracle over exactly two structural edges from one frozen post-initial B parent; it is not a competitive runtime trajectory.',
    'The 31 hop-1 outcomes are reconstructed from the prior census and checked against its canonical delivered metrics; no future outcome enters generation or ranking.',
    'Retention is directly evidenced only where frozen B/C trajectories expose a child/parent relationship; local competitive-set reconstruction is marked inference and may not prove the complete historical beam context.',
    'Directed Reference Regret v1 is reported separately as additional evidence and is not required for relative material improvement.',
  ]
  const gateStatuses = gateResults(options)
  return {
    schemaVersion: STORM_TWO_HOP_REACHABILITY_SCHEMA_VERSION,
    experimentVersion: STORM_TWO_HOP_REACHABILITY_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_TWO_HOP_REACHABILITY_PRIMARY_ID,
    sourceCommit: currentCommit(),
    taskAction: 'IMPLEMENT',
    taskDomain: 'RESEARCH',
    criticality: 'MAJOR',
    scopeContract: SCOPE_CONTRACT,
    doNotChange: SCOPE_CONTRACT.doNotChange,
    frozenPredecessorArtifacts: predecessorHashes,
    validationIncidents: process.env.STORM_TWO_HOP_VALIDATION_INCIDENT === undefined
      ? []
      : [process.env.STORM_TWO_HOP_VALIDATION_INCIDENT],
    frozenInputs: {
      postInitialCensus: { logicalId: POST_INITIAL_INPUT, sha256: inputs.predecessorHashesBefore.find((entry) => entry.logicalId === POST_INITIAL_INPUT)!.sha256Before },
      dynamicAllParents: { logicalId: DYNAMIC_INPUT, sha256: inputs.predecessorHashesBefore.find((entry) => entry.logicalId === DYNAMIC_INPUT)!.sha256Before },
      cheapAdmission: { logicalId: CHEAP_INPUT, sha256: inputs.predecessorHashesBefore.find((entry) => entry.logicalId === CHEAP_INPUT)!.sha256Before },
      replay: { logicalId: REPLAY_INPUT, sha256: inputs.predecessorHashesBefore.find((entry) => entry.logicalId === REPLAY_INPUT)!.sha256Before },
      referenceSnapshot: { logicalId: 'external:OracleReferenceSnapshotV1.json', contentSha256: inputs.snapshotContentSha256, fileSha256: inputs.predecessorHashesBefore.find((entry) => entry.logicalId === 'external:OracleReferenceSnapshotV1.json')!.sha256Before },
    },
    controls: {
      storm: true, maxFilters: 10, localPolishEvaluations: 24, standardV2Quantization: true, canonicalDeliveredEvaluation: 'canonical-delivered-v1', frozenSelector: 'reference-selector-v1', frozenReference: true,
      currentStructuralMutationGenerator: 'generateStructuralMutations', lexicalOrder: 'orderStructuralProposals', noMpDictionary: true, noTeacherMax20Max40Max64: true, noNormalBeamOrSearchExecution: true,
      fullPolishLabelsExcludedFromAdmission: true, outcomeBlindCheapRanking: true, baselineComparatorsFrozen: true, futureLeakageAbsent: true, maxDepthEdges: 2,
    },
    frozenCensus: { totalExpansionOccurrences: 20, initialExcludedOccurrences: 12, postInitialExpansionOccurrences: 8, uniquePostInitialParents: 1, repeatedOccurrencesRemoved: 7, parentSemanticKey: frozenParent.semanticKey, parentIdentity: frozenParent.parentIdentity, parentOccurrenceCount: frozenParent.occurrenceCount, proposalCount: 31, lexicalTop4: [...postParent.lexicalTop4], cheapTop4: [...postParent.cheapTop4], overlap: 0 },
    originalParent: { filters: cloneFilterList(frozenParent.filters), canonical: { ...frozenParent.canonicalMetrics } },
    bGlobalBest: { candidateId: inputs.bGlobalBestCandidateId, filters: cloneFilterList(inputs.bGlobalBestFilters), canonical: { ...inputs.bGlobalBest } },
    intermediates,
    semanticGrandchildren,
    bridgePaths,
    mechanismAttribution: {
      counts: mechanism.counts,
      evidenceBoundary: ['Direct evidence: B/C admittedProposalRanks and child-to-parent identities from frozen dynamic artifacts.', 'Inference: reconstructed Pareto/frozen-selector retention using the frozen parent, B initial state, and frozen lexical top-4 outcomes.', 'Offline oracle outcomes are not search feedback and never alter beam/search state.'],
      bridgePaths,
    },
    totals: {
      intermediateCount: 31,
      hop2ProposalCount: grandchildEvaluation.hop2ProposalCount,
      hop2GrandchildrenPathCount: grandchildEvaluation.grandchildren.length,
      uniqueSemanticGrandchildren: semanticGrandchildren.length,
      duplicateSemanticGrandchildPathCount: duplicateSemanticStates,
      intermediatesWithGrandchildBetterThanIntermediate: intermediates.filter((intermediate) => intermediate.grandchildrenBetterThanIntermediate > 0).length,
      intermediatesWithGrandchildBetterThanParent: intermediates.filter((intermediate) => intermediate.grandchildrenBetterThanParent > 0).length,
      intermediatesWithGrandchildBetterThanBGlobalBest: intermediates.filter((intermediate) => intermediate.grandchildrenBetterThanBGlobalBest > 0).length,
      intermediatesWithGrandchildImprovingFrozenReference: intermediates.filter((intermediate) => intermediate.grandchildrenImproveFrozenReference > 0).length,
      directIntermediateImprovementCount,
    },
    mutationCounts: { hop1: hop1MutationCounts, hop2: grandchildEvaluation.hop2MutationCounts },
    bestTwoHopPath: {
      pathId: best.pathId, intermediateRank: best.intermediateRank, intermediateMutation: best.intermediateMutation, grandchildLexicalRank: best.lexicalRank, grandchildCheapRank: best.cheapRank, grandchildMutation: best.mutation,
      originalParent: { ...frozenParent.canonicalMetrics }, intermediate: { ...intermediates[best.intermediateRank - 1]!.canonical }, grandchild: { ...best.canonical }, relationVsParent: best.relationVsParent, relationVsBGlobalBest: best.relationVsBGlobalBest, improvesFrozenReference: best.improvesFrozenReference,
    },
    costAccounting: {
      intermediateCount: 31,
      intermediateFullPolishCoordinateTrials,
      intermediateCanonicalLabelEvaluations,
      hop2ProposalCount: grandchildEvaluation.hop2ProposalCount,
      prePolishCanonicalEvaluations: grandchildEvaluation.prePolishCanonicalEvaluations,
      fullPolishCoordinateTrials: intermediateFullPolishCoordinateTrials + grandchildEvaluation.fullPolishCoordinateTrials,
      canonicalLabelEvaluations: intermediateCanonicalLabelEvaluations + grandchildEvaluation.hop2ProposalCount,
      duplicateSemanticStates,
      uniqueSemanticGrandchildren: semanticGrandchildren.length,
      parentBaselineCanonicalEvaluations: 1,
      productionCostClaim: false,
    },
    classification,
    decisionCriteria: {
      materialDefinition: 'A candidate is materially better when frozen selector prefers it to the baseline or it dominates the baseline in RMSE and maxAbs; Directed Reference Regret v1 is additional evidence, not a requirement.',
      bridgePaths: bridgePaths.length,
      bridgePathsBlockedByCurrentMechanism: blockedBridgeCount,
      bridgePathsReachableUnderCurrentMechanism: reachableBridgeCount,
      unresolvedBridgePaths: unresolvedBridgeCount,
      localOnlyPaths: localOnlyGrandchildren.length,
      noHeadroom: materialGrandchildren.length === 0 && localOnlyGrandchildren.length === 0,
      directIntermediateImprovementCount,
      frozenReferenceImprovementPathCount: grandchildEvaluation.grandchildren.filter((grandchild) => grandchild.improvesFrozenReference).length,
    },
    interpretation,
    limitations,
    deterministic: { nonTimingArtifactReproduction: true, depthEdges: 2, predecessorArtifactsUnchanged: predecessorHashes.every((entry) => entry.unchanged) },
    testsAndGates: { focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormTwoHopReachabilityCensus.test.ts', generationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-two-hop-reachability', requiredGateCommands: ['pnpm test', 'pnpm typecheck', 'pnpm build', 'pnpm lint', 'pnpm --filter @autoeq-workbench/core benchmark', 'git diff --check', 'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs'], gateResults: gateStatuses },
  }
}

function formatMetric(metric: StormTwoHopMetric | null): string {
  return metric === null ? 'none' : `RMSE ${metric.rmseDb.toFixed(6)}, maxAbs ${metric.maxAbsDb.toFixed(6)}, regret ${metric.referenceRegret.toFixed(6)}`
}

function mutationSummary(counts: Record<StructuralMutation, number>): string {
  return MUTATIONS.filter((mutation) => counts[mutation] > 0).map((mutation) => `${mutation}=${counts[mutation]}`).join(', ') || 'none'
}

export function renderStormTwoHopReachabilityReport(artifact: StormTwoHopReachabilityArtifact, artifactSha256 = '<generated-after-writing-artifact>'): string {
  const gateLines = Object.entries(artifact.testsAndGates.gateResults).map(([name, status]) => `- ${name}: ${status}.`)
  const table = artifact.intermediates.map((intermediate) => {
    const best = intermediate.bestGrandchild
    const bestPath = intermediate.bestGrandchildPathId === null ? 'none' : intermediate.bestGrandchildPathId
    const blockers = [...new Set(intermediate.grandchildren.map((grandchild) => grandchild.mechanismBlocker))].join(', ')
    return `| ${intermediate.rank} | ${intermediate.mutation} | ${intermediate.admission.lexicalRank}/${intermediate.admission.lexicalTop4 ? 'yes' : 'no'} | ${intermediate.admission.cheapRank}/${intermediate.admission.cheapTop4 ? 'yes' : 'no'} | ${formatMetric(intermediate.canonical)} | ${intermediate.improvesParent ? 'yes' : 'no'}/${intermediate.improvesBGlobalBest ? 'yes' : 'no'} | ${intermediate.retention.status} | ${intermediate.hop2ProposalCount} | ${intermediate.grandchildrenBetterThanIntermediate} | ${intermediate.grandchildrenBetterThanParent} | ${intermediate.grandchildrenBetterThanBGlobalBest} | ${intermediate.grandchildrenImproveFrozenReference} | ${bestPath}; ${formatMetric(best)} | ${blockers}`
  })
  const duplicateGroups = artifact.semanticGrandchildren.filter((group) => group.occurrenceCount > 1).map((group) => `- ${group.semanticGroupId}: ${group.occurrenceCount} paths converge on the same semantic state; provenance=${group.pathIds.join(', ')}.`)
  const bridgeLines = artifact.bridgePaths.length === 0 ? ['- none'] : artifact.bridgePaths.map((path) => `- ${path.pathId}: hop-1 lexical=${path.intermediateAdmission.lexicalRank}/${path.intermediateAdmission.lexicalTop4 ? 'top4' : 'excluded'}, cheap=${path.intermediateAdmission.cheapRank}/${path.intermediateAdmission.cheapTop4 ? 'top4' : 'excluded'}; hop-2 lexical=${path.grandchildAdmission.lexicalRank}/${path.grandchildAdmission.lexicalTop4 ? 'top4' : 'excluded'}, cheap=${path.grandchildAdmission.cheapRank}/${path.grandchildAdmission.cheapTop4 ? 'top4' : 'excluded'}; blocker=${path.blocker}; evidence=${path.evidence}.`)
  return [
    '# Storm two-hop reachability census results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})`,
    `Case: ${artifact.caseId}; primary=${artifact.primarySeedId}`,
    `Classification: **${artifact.classification}**`,
    `Producer commit: ${artifact.sourceCommit ?? 'unproven'}`,
    '',
    '## Scope, frozen parent, and controls',
    '',
    'This is a deterministic offline oracle for exactly `parent → intermediate → grandchild` (2 structural edges). It freezes the single semantic post-initial B parent and all 31 predecessor outcomes before any hop-2 outcome is evaluated.',
    '',
    `- Frozen B census: total occurrences=${artifact.frozenCensus.totalExpansionOccurrences}; initial excluded=${artifact.frozenCensus.initialExcludedOccurrences}; post-initial=${artifact.frozenCensus.postInitialExpansionOccurrences}; unique parent=${artifact.frozenCensus.uniquePostInitialParents}; repeats removed=${artifact.frozenCensus.repeatedOccurrencesRemoved}.`,
    `- Parent: ${artifact.frozenCensus.parentIdentity}; occurrences=${artifact.frozenCensus.parentOccurrenceCount}; proposals=${artifact.frozenCensus.proposalCount}; lexical top-4=${JSON.stringify(artifact.frozenCensus.lexicalTop4)}; cheap top-4=${JSON.stringify(artifact.frozenCensus.cheapTop4)}; overlap=${artifact.frozenCensus.overlap}.`,
    '- Controls: Storm, Max10, current structural mutation generator, lexical order, local polish 24, standard-v2 quantization, canonical delivered evaluator, frozen selector/reference; no MP dictionary, teacher/Max20/40/64, or normal beam/search execution.',
    '- Cheap ranking is reconstructed from canonical pre-polish metrics only. Full-polish labels are excluded from both lexical and cheap admission ranks.',
    '- Hop-2 residuals are derived from each intermediate canonical delivered state, never from the original parent; future outcomes do not feed generation or ranking.',
    '',
    '## Primary table: every frozen intermediate',
    '',
    '| Hop 1 rank | Mutation | Lexical rank/top-4 | Cheap rank/top-4 | Intermediate RMSE/maxAbs/regret | Direct vs parent/B | Retention | Hop-2 proposals | > intermediate | > parent | > B global | Improve frozen reference | Best grandchild path / metrics | Mechanism signals |',
    '| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...table,
    '',
    'The primary table remains populated for all 31 intermediates even when no bridge exists.',
    '',
    '## Hop-2 mutation and rank evidence',
    '',
    `- Hop-1 mutation counts: ${mutationSummary(artifact.mutationCounts.hop1)}.`,
    `- Hop-2 mutation counts: ${mutationSummary(artifact.mutationCounts.hop2)}.`,
    '- Each intermediate artifact row contains every hop-2 path with mutation, lexical rank, cheap rank, pre-polish metrics, full-polish labels, canonical delivered filters, and provenance.',
    '',
    '## Best path and decision criteria',
    '',
    `- Best two-hop path by frozen selector: ${artifact.bestTwoHopPath.pathId}; hop-1 rank=${artifact.bestTwoHopPath.intermediateRank} (${artifact.bestTwoHopPath.intermediateMutation}); hop-2 lexical rank=${artifact.bestTwoHopPath.grandchildLexicalRank}, cheap rank=${artifact.bestTwoHopPath.grandchildCheapRank}, mutation=${artifact.bestTwoHopPath.grandchildMutation}.`,
    `- Original parent: ${formatMetric(artifact.bestTwoHopPath.originalParent)}.`,
    `- Intermediate: ${formatMetric(artifact.bestTwoHopPath.intermediate)}.`,
    `- Grandchild: ${formatMetric(artifact.bestTwoHopPath.grandchild)}; vs parent selector=${artifact.bestTwoHopPath.relationVsParent.selectorWinner}, Pareto=${artifact.bestTwoHopPath.relationVsParent.pareto}; vs B global selector=${artifact.bestTwoHopPath.relationVsBGlobalBest.selectorWinner}, Pareto=${artifact.bestTwoHopPath.relationVsBGlobalBest.pareto}; referenceImproved=${artifact.bestTwoHopPath.improvesFrozenReference}.`,
    `- Totals: intermediates=${artifact.totals.intermediateCount}; hop-2 proposal paths=${artifact.totals.hop2ProposalCount}; unique semantic grandchildren=${artifact.totals.uniqueSemanticGrandchildren}; duplicate semantic paths=${artifact.totals.duplicateSemanticGrandchildPathCount}.`,
    `- Intermediate counts with at least one grandchild: > intermediate=${artifact.totals.intermediatesWithGrandchildBetterThanIntermediate}; > parent=${artifact.totals.intermediatesWithGrandchildBetterThanParent}; > B global=${artifact.totals.intermediatesWithGrandchildBetterThanBGlobalBest}; improve frozen reference=${artifact.totals.intermediatesWithGrandchildImprovingFrozenReference}.`,
    `- Direct improvement fidelity: ${artifact.totals.directIntermediateImprovementCount} of 31 intermediates improve parent/B global materially after reconstructed canonical delivery.`,
    `- Material definition: ${artifact.decisionCriteria.materialDefinition}`,
    '',
    '## Mechanism attribution',
    '',
    `- Bridge paths=${artifact.decisionCriteria.bridgePaths}; blocked by current mechanism=${artifact.decisionCriteria.bridgePathsBlockedByCurrentMechanism}; reachable under current mechanism=${artifact.decisionCriteria.bridgePathsReachableUnderCurrentMechanism}; unresolved=${artifact.decisionCriteria.unresolvedBridgePaths}.`,
    ...bridgeLines,
    '- Direct evidence covers frozen B/C admitted ranks and child-to-parent identities. Reconstructed Pareto/frozen-selector retention is explicitly inference from the frozen competitive set; it is not inferred from candidate names.',
    '- `hop1-admission-blocked`, `beam-retention-blocked`, and `hop2-admission-blocked` describe where the current contracts would stop a path. `reachable-under-current-mechanism` means investigate budget/scheduling/visited/execution semantics before calling it a temporary-worsening barrier.',
    '',
    '## Duplicate handling and cost accounting',
    '',
    `- Intermediate count=${artifact.costAccounting.intermediateCount}; hop-2 proposal paths=${artifact.costAccounting.hop2ProposalCount}; pre-polish canonical evaluations=${artifact.costAccounting.prePolishCanonicalEvaluations}; full-polish coordinate trials=${artifact.costAccounting.fullPolishCoordinateTrials}; canonical labels=${artifact.costAccounting.canonicalLabelEvaluations}; duplicate semantic states=${artifact.costAccounting.duplicateSemanticStates}; unique semantic grandchildren=${artifact.costAccounting.uniqueSemanticGrandchildren}; parent baseline canonical evaluations=${artifact.costAccounting.parentBaselineCanonicalEvaluations}.`,
    '- Every convergent path remains in provenance; semantic deduplication is used only for quantity metrics. Duplicate groups:',
    ...duplicateGroups,
    '- exhaustive two-hop evaluation is diagnostic oracle work, not runtime cost or deployable search behavior.',
    '',
    '## Interpretation and boundaries',
    '',
    ...artifact.interpretation.map((line) => `- ${line}`),
    ...artifact.limitations.map((line) => `- ${line}`),
    '- Directed Reference Regret v1 is reported separately as additional evidence, not a requirement for relative improvement.',
    '- This round does not implement worsening allowance, tabu/search temperature, wider beam, simulated annealing, dominated-state acceptance, new ranking policy, causal intervention, policy audit, MP audit, holdout, promotion, merge, release, deploy, or publish.',
    '',
    '## Frozen predecessor hashes and gates',
    '',
    ...artifact.frozenPredecessorArtifacts.map((entry) => `- ${entry.logicalId}: before=${entry.sha256Before}; after=${entry.sha256After}; unchanged=${entry.unchanged}.`),
    ...(artifact.validationIncidents.length === 0
      ? ['- Validation incidents: none recorded.']
      : ['- Validation incidents (restored exactly before acceptance):', ...artifact.validationIncidents.map((incident) => `  - ${incident}`)]),
    `- Artifact SHA-256: ${artifactSha256}.`,
    `- Non-timing deterministic reproduction: ${artifact.deterministic.nonTimingArtifactReproduction}.`,
    ...gateLines,
    `- Focused test: ${artifact.testsAndGates.focusedTestCommand}.`,
    `- Generation: ${artifact.testsAndGates.generationCommand}.`,
    `- Required gates: ${artifact.testsAndGates.requiredGateCommands.join('; ')}.`,
    '',
    'The artifact stops after Luna IMPLEMENTATION_COMPLETE → Terra acceptance of this two-hop census.',
    '',
  ].join('\n')
}

export function generateStormTwoHopReachability(options: StormTwoHopReachabilityOptions = {}): GeneratedStormTwoHopReachabilityArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_TWO_HOP_REACHABILITY_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_TWO_HOP_REACHABILITY_REPORT)
  const artifact = createStormTwoHopReachabilityArtifact(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormTwoHopReachabilityReport(artifact, artifactSha256))
  return { artifact, artifactPath, reportPath, artifactSha256 }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, postInitialInputPath, dynamicInputPath, cheapInputPath, replayInputPath, snapshotPath] = args
  const generated = generateStormTwoHopReachability({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(postInitialInputPath === undefined ? {} : { postInitialInputPath }),
    ...(dynamicInputPath === undefined ? {} : { dynamicInputPath }),
    ...(cheapInputPath === undefined ? {} : { cheapInputPath }),
    ...(replayInputPath === undefined ? {} : { replayInputPath }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
  })
  process.stdout.write(JSON.stringify({ artifactPath: generated.artifactPath, reportPath: generated.reportPath, artifactSha256: generated.artifactSha256, classification: generated.artifact.classification }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
