import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascadeMagnitudeDb, evaluateV2Solution, type Filter } from '../../src/index.js'
import {
  rankStormStructuralAdmissionPrePolish,
  type StormStructuralAdmissionPrePolishRanking,
} from './stormStructuralAdmissionCheapAdmission.js'
import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { directedReferenceRegret, type ReferenceRegretPoint } from './referenceRegret.js'
import {
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
  type OracleReferenceSnapshotV1,
} from './referenceSnapshot.js'
import { selectReferencePoint, type SelectorPoint } from './referenceSelector.js'
import { DEFAULT_SNAPSHOT, resolveResearchPath } from './seedAllocationRun.js'
import {
  enumerateStormStructuralProposals,
  type EnumeratedStormStructuralProposal,
} from './stormStructuralProposalCensus.js'
import {
  polishStructuralProposal,
  quantizeStructuralBeamFilters,
  type StructuralMutation,
  type StructuralProposal,
} from './structuralBeam.js'

export const STORM_POST_INITIAL_ADMISSION_CENSUS_SCHEMA_VERSION = 1 as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_EXPERIMENT_VERSION = 'storm-post-initial-admission-census-v1' as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_OUTPUT = 'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json' as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_REPORT = 'docs/superpowers/specs/2026-09-10-storm-post-initial-admission-census-results.md' as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID = 'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_TOP4 = 4 as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_LOCAL_POLISH = 24 as const
export const STORM_POST_INITIAL_ADMISSION_CENSUS_MAX_FILTERS = 10 as const
export const STORM_POST_INITIAL_DYNAMIC_INPUT = 'packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json' as const
export const STORM_POST_INITIAL_CHEAP_INPUT = 'packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json' as const
export const STORM_POST_INITIAL_REPLAY_INPUT = 'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json' as const
export const STORM_POST_INITIAL_CHEAP_INPUT_SHA256 = '6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc' as const
export const STORM_POST_INITIAL_REPLAY_INPUT_SHA256 = '930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba' as const
export const POST_INITIAL_ADMISSION_CENSUS_CLASSIFICATIONS = Object.freeze([
  'post-initial-admission-opportunity-supported',
  'post-initial-local-only',
  'initial-only-bottleneck-supported',
  'signal-misaligned-post-initial',
  'mixed/unresolved',
] as const)

export type PostInitialAdmissionCensusClassification = (typeof POST_INITIAL_ADMISSION_CENSUS_CLASSIFICATIONS)[number]

export interface PostInitialMetric {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
  referenceRegret: number
  referenceImproved?: boolean
}

export interface PostInitialParentOccurrence {
  parentIdentity: string
  filters: Filter[]
  runOrder: number
  layerIndex: number
  parentIndex: number
  evaluationIndex?: number
  canonicalMetrics?: PostInitialMetric
  trajectoryGlobalBest?: PostInitialMetric
}

export interface FrozenPostInitialParent {
  semanticKey: string
  parentIdentity: string
  filters: Filter[]
  occurrenceCount: number
  occurrences: Array<{ runOrder: number; layerIndex: number; parentIndex: number; evaluationIndex: number | null }>
  canonicalMetrics: PostInitialMetric | null
  trajectoryGlobalBest: PostInitialMetric | null
}

export interface FrozenPostInitialParentSet {
  totalExpansionOccurrences: number
  initialExcludedOccurrences: number
  postInitialExpansionOccurrences: number
  uniquePostInitialParents: FrozenPostInitialParent[]
  repeatedOccurrencesRemoved: number
  recurringParents: Array<{ semanticKey: string; occurrences: number }>
}

export interface PostInitialCheapScore {
  proposalRank: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

export interface PostInitialRelation {
  pareto: 'candidate-dominates' | 'baseline-dominates' | 'tradeoff' | 'equivalent'
  selectorWinner: 'candidate' | 'baseline'
}

export interface PostInitialProposalOutcome {
  rank: number
  originalOrdinal: number
  mutation: StructuralMutation
  filtersBeforePolish: Filter[]
  lexicalAdmitted: boolean
  cheapAdmitted: boolean
  prePolish: { rmseDb: number; maxAbsDb: number; filterCount: number; cancellationScore: number }
  postPolishContinuous: { rmseDb: number; maxAbsDb: number }
  canonical: PostInitialMetric
  coordinateTrials: number
  relationVsParent: PostInitialRelation
  relationVsTrajectoryGlobalBest: PostInitialRelation
  dominatesAnyLexicalAdmitted: boolean
  selectorPreferredToAnyLexicalAdmitted: boolean
  useful: boolean
  materiallyUseful: boolean
  usefulReasons: string[]
}

export interface PostInitialBestProposal {
  rank: number
  mutation: StructuralMutation
  canonical: PostInitialMetric
}

export interface PostInitialParentDiagnostic {
  semanticKey: string
  parentIdentity: string
  occurrenceCount: number
  proposalCount: number
  lexicalRanking: number[]
  lexicalTop4: number[]
  cheapRanking: number[]
  cheapTop4: number[]
  overlap: number
  fullCanonicalBestRankLexical: number
  fullCanonicalBestRankCheap: number
  lexicalRecallAt4Useful: { recovered: number; total: number; rate: number }
  cheapRecallAt4Useful: { recovered: number; total: number; rate: number }
  bestLexicalAdmitted: PostInitialBestProposal
  bestCheapAdmitted: PostInitialBestProposal
  bestGlobalProposal: PostInitialBestProposal
  relationVsParent: PostInitialRelation
  relationVsTrajectoryGlobalBest: PostInitialRelation
  usefulMutationTypes: StructuralMutation[]
  materiallyUsefulProposalRanks: number[]
  localOnlyProposalRanks: number[]
  unrecoveredUsefulProposalRanks: number[]
  proposals: PostInitialProposalOutcome[]
}

export interface PostInitialAdmissionClassificationInput {
  materialUsefulRecovered: boolean
  localOnlyRecovered: boolean
  usefulMissesNotRecovered: boolean
  parentOutcomes: string[]
}

export function classifyPostInitialAdmissionCensus(input: PostInitialAdmissionClassificationInput): PostInitialAdmissionCensusClassification {
  if (input.materialUsefulRecovered && input.usefulMissesNotRecovered) return 'mixed/unresolved'
  if (input.materialUsefulRecovered) return 'post-initial-admission-opportunity-supported'
  if (input.localOnlyRecovered) return 'post-initial-local-only'
  if (input.usefulMissesNotRecovered) return 'signal-misaligned-post-initial'
  if (input.parentOutcomes.some((outcome) => outcome === 'mixed')) return 'mixed/unresolved'
  return 'initial-only-bottleneck-supported'
}

export interface PostInitialAdmissionCensusOptions {
  outputPath?: string
  reportPath?: string
  dynamicInputPath?: string
  cheapInputPath?: string
  replayInputPath?: string
  snapshotPath?: string
}

export type GateStatus = 'PASS_THIS_RUN' | 'PASS_PREVIOUSLY_VERIFIED' | 'FAIL' | 'BLOCKED_KNOWN' | 'NOT_RUN'

export interface StormPostInitialAdmissionCensusArtifact {
  schemaVersion: typeof STORM_POST_INITIAL_ADMISSION_CENSUS_SCHEMA_VERSION
  experimentVersion: typeof STORM_POST_INITIAL_ADMISSION_CENSUS_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID
  sourceCommit: string | null
  taskAction: 'IMPLEMENT'
  taskDomain: 'RESEARCH'
  criticality: 'MAJOR'
  scopeContract: { allowedPaths: readonly string[]; forbiddenPaths: readonly string[]; doNotChange: readonly string[]; stopConditions: readonly string[] }
  doNotChange: readonly string[]
  frozenInputs: {
    dynamicArtifact: { logicalId: string; sha256: string }
    cheapArtifact: { logicalId: string; sha256: string }
    replayArtifact: { logicalId: string; sha256: string }
    referenceSnapshot: { logicalId: string; contentSha256: string }
  }
  censusFrozenBeforeOutcomes: true
  initialParentExcluded: true
  frozenParentSet: FrozenPostInitialParentSet & { semanticIdentitySha256: string }
  semanticDeduplication: { deterministic: true; totalExpansionOccurrences: number; initialExcludedOccurrences: number; postInitialExpansionOccurrences: number; uniquePostInitialParents: number; repeatedOccurrencesRemoved: number; recurringParents: Array<{ semanticKey: string; occurrences: number }> }
  controls: { lexicalRankingRuntimeReproduced: true; cheapRankingOutcomeBlind: true; fullPolishLabelsExcludedFromRanking: true; futureLeakageAbsent: true; trajectoryUnmodified: true; repeatsNotIndependentEvidence: true; maxFilters: 10; currentMutationGenerator: 'generateStructuralMutations'; orderStructuralProposals: 'orderStructuralProposals'; localPolishEvaluations: 24; frozenSelector: 'reference-selector-v1'; frozenReference: true; standardV2Quantization: true; canonicalDeliveredEvaluation: 'canonical-delivered-v1' }
  parents: PostInitialParentDiagnostic[]
  secondaryCOnly: { status: 'NOT_RUN'; reason: string }
  costAccounting: { uniqueParents: number; proposalCount: number; canonicalPrePolishEvaluations: number; fullPolishCoordinateTrials: number; canonicalLabelEvaluations: number; parentBaselineCanonicalEvaluations: number; productionCostClaim: false }
  classification: PostInitialAdmissionCensusClassification
  decisionCriteria: { materialUsefulRecoveredParents: number; localOnlyRecoveredParents: number; usefulMissesNotRecoveredParents: number; materialDefinition: string }
  interpretation: string[]
  limitations: string[]
  deterministic: { nonTimingArtifactReproduction: true; semanticParentSetSha256: string }
  testsAndGates: { focusedTestCommand: string; generationCommand: string; requiredGateCommands: string[]; gateResults: Record<string, GateStatus> }
}

export interface GeneratedStormPostInitialAdmissionCensusArtifacts { artifact: StormPostInitialAdmissionCensusArtifact; artifactPath: string; reportPath: string; artifactSha256: string }

const SCOPE_CONTRACT = {
  allowedPaths: [
    'packages/core/benchmarks/research/stormPostInitialAdmissionCensus.ts',
    'packages/core/test/autoeq/v2/research/stormPostInitialAdmissionCensus.test.ts',
    'packages/core/package.json (one research script only)',
    'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/*',
    'docs/superpowers/specs/2026-09-10-storm-post-initial-admission-census-results.md',
  ],
  forbiddenPaths: ['packages/core/src/**', 'normal solver policy', 'mutation library', 'frozen selector/reference', 'fixtures/baselines', 'UI/export/product', 'historical artifacts'],
  doNotChange: [
    'packages/core/src/**', 'normal solver policy', 'mutation library', 'frozen selector/reference', 'fixtures/baselines', 'UI/export/product', 'historical artifacts',
    'Max10/current mutation generator/local polish 24/standard-v2 quantization/canonical delivered evaluation',
    'dynamic policy, caching, beam changes, temporary-worsening, MP rank audit, U12t/Trio, holdout, promotion, product/default, merge/release/deploy/publish',
  ],
  stopConditions: ['stop after offline post-initial census and Terra acceptance', 'do not execute another dynamic policy experiment or follow-on hypothesis'],
} as const

const DYNAMIC_REPORT_SHA256 = 'c97d7f764923cdb50ac2a097732b74a96c84e797568e8d0842294753ea6aa3a1' as const
const REFERENCE_SNAPSHOT_CONTENT_SHA256 = '0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3' as const
const MATERIAL_EPSILON = 1e-12

interface DynamicParentDecisionJson { parentIdentity: string; layerIndex: number; parentIndex: number; parentMetrics: Omit<PostInitialMetric, 'referenceImproved'> }
interface DynamicRunJson { orderIndex: number; pairIndex: number; armId: string; parentDecisions: DynamicParentDecisionJson[] }
interface DynamicArtifactJson { schemaVersion: number; experimentVersion: string; primarySeedId: string; runs: DynamicRunJson[] }
interface CheapDescendantJson { evaluationIndex: number; candidateId: string; parentCandidateId: string | null; filtersBeforePolish: Filter[]; canonicalFilters: Filter[]; metrics: PostInitialMetric }
interface CheapArmJson { seedValidation: CheapDescendantJson; descendants: CheapDescendantJson[]; trajectory: Array<{ evaluationIndex: number; candidateId: string; metrics: PostInitialMetric }> }
interface CheapArtifactJson { schemaVersion: number; experimentVersion: string; primarySeedId: string; frozenSourceCommit: string; arms: { cheapAdmission: CheapArmJson } }
interface ReplayArtifactJson { primarySeedId: string; replaySourceCommit: string | null }
interface FrozenRuntimeInputs { dynamicPath: string; cheapPath: string; replayPath: string; snapshotPath: string; dynamic: DynamicArtifactJson; cheap: CheapArtifactJson; replay: ReplayArtifactJson; problem: SolverLabProblemV1; references: ReferenceRegretPoint[]; dynamicSha256: string; cheapSha256: string; replaySha256: string; snapshotContentSha256: string }

export interface PostInitialTrajectoryPoint {
  evaluationIndex: number
  candidateId: string
  metrics: PostInitialMetric
}

export interface PostInitialTrajectoryBest {
  candidateId: string
  metrics: PostInitialMetric
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function cloneFilter(filter: Filter): Filter { return { ...filter } }
function cloneFilters(filters: readonly Filter[]): Filter[] { return filters.map(cloneFilter) }
function sha256File(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex') }
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
  } catch { return null }
}
function readJson<T>(path: string, label: string): T {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  return value as T
}
function metricFromJson(value: PostInitialMetric): PostInitialMetric { return { ...value } }

function metricFromEvaluation(evaluation: SolverLabEvaluationV1, references: readonly ReferenceRegretPoint[]): PostInitialMetric {
  if (!evaluation.valid || evaluation.deliverable === null) throw new Error('Storm post-initial candidate was rejected: ' + evaluation.rejectionReason)
  const deliverable = evaluation.deliverable
  const regret = directedReferenceRegret({ candidateId: evaluation.candidateId, rmseDb: deliverable.rmseDb, maxAbsDb: deliverable.maxAbsDb, filterCount: deliverable.filters.length }, references)
  return { rmseDb: deliverable.rmseDb, maxAbsDb: deliverable.maxAbsDb, filterCount: deliverable.filters.length, cancellationScore: deliverable.cancellationTotalScore, referenceRegret: regret.regret, referenceImproved: regret.referenceImproved }
}
function candidate(problem: SolverLabProblemV1, candidateId: string, filters: readonly Filter[]): SolverLabCandidateV1 {
  return { protocolVersion: 1, problemId: problem.problemId, inputSha256: problem.inputSha256, candidateId, algorithmId: STORM_POST_INITIAL_ADMISSION_CENSUS_EXPERIMENT_VERSION, seed: 0, filters: cloneFilters(filters) }
}
function selectorPoint(candidateId: string, metric: PostInitialMetric): SelectorPoint {
  return { candidateId, rmseDb: metric.rmseDb, maxAbsDb: metric.maxAbsDb, filterCount: metric.filterCount, cancellationScore: metric.cancellationScore }
}
function dominates(left: PostInitialMetric, right: PostInitialMetric): boolean {
  return left.rmseDb <= right.rmseDb + MATERIAL_EPSILON && left.maxAbsDb <= right.maxAbsDb + MATERIAL_EPSILON && (left.rmseDb < right.rmseDb - MATERIAL_EPSILON || left.maxAbsDb < right.maxAbsDb - MATERIAL_EPSILON)
}
function paretoRelation(left: PostInitialMetric, right: PostInitialMetric): PostInitialRelation['pareto'] {
  if (dominates(left, right)) return 'candidate-dominates'
  if (dominates(right, left)) return 'baseline-dominates'
  if (Math.abs(left.rmseDb - right.rmseDb) <= MATERIAL_EPSILON && Math.abs(left.maxAbsDb - right.maxAbsDb) <= MATERIAL_EPSILON) return 'equivalent'
  return 'tradeoff'
}
function relation(candidateMetric: PostInitialMetric, baselineMetric: PostInitialMetric, baselineId: string): PostInitialRelation {
  const selected = selectReferencePoint([selectorPoint('candidate', candidateMetric), selectorPoint(baselineId, baselineMetric)]).candidateId
  return { pareto: paretoRelation(candidateMetric, baselineMetric), selectorWinner: selected === 'candidate' ? 'candidate' : 'baseline' }
}
function canonicalFiltersKey(filters: readonly Filter[]): string {
  const order: Record<Filter['type'], number> = { LS: 0, PK: 1, HS: 2 }
  return JSON.stringify(filters.map(({ id: _id, ...filter }) => filter).sort((left, right) => order[left.type] - order[right.type] || left.frequencyHz - right.frequencyHz || left.gainDb - right.gainDb || left.q - right.q || Number(left.enabled) - Number(right.enabled)))
}

/** Stable structural identity intentionally ignores candidate/filter IDs. */
export function semanticStructuralParentKey(filters: readonly Filter[]): string { return canonicalFiltersKey(filters) }

export function deduplicatePostInitialParentOccurrences(occurrences: readonly PostInitialParentOccurrence[], initialParentIdentity: string): FrozenPostInitialParentSet {
  if (occurrences.length === 0) throw new Error('parent occurrence census cannot be empty')
  const initialOccurrence = occurrences.find((occurrence) => occurrence.parentIdentity === initialParentIdentity)
  if (initialOccurrence === undefined) throw new Error('initial parent identity is absent from B occurrences')
  const initialKey = semanticStructuralParentKey(initialOccurrence.filters)
  const postInitial = occurrences.filter((occurrence) => occurrence.parentIdentity !== initialParentIdentity && semanticStructuralParentKey(occurrence.filters) !== initialKey)
  const grouped = new Map<string, FrozenPostInitialParent>()
  for (const occurrence of postInitial) {
    const semanticKey = semanticStructuralParentKey(occurrence.filters)
    const location = { runOrder: occurrence.runOrder, layerIndex: occurrence.layerIndex, parentIndex: occurrence.parentIndex, evaluationIndex: occurrence.evaluationIndex ?? null }
    const existing = grouped.get(semanticKey)
    if (existing === undefined) {
      grouped.set(semanticKey, { semanticKey, parentIdentity: occurrence.parentIdentity, filters: cloneFilters(occurrence.filters), occurrenceCount: 1, occurrences: [location], canonicalMetrics: occurrence.canonicalMetrics === undefined ? null : metricFromJson(occurrence.canonicalMetrics), trajectoryGlobalBest: occurrence.trajectoryGlobalBest === undefined ? null : metricFromJson(occurrence.trajectoryGlobalBest) })
    } else {
      existing.occurrenceCount += 1
      existing.occurrences.push(location)
    }
  }
  const uniquePostInitialParents = [...grouped.values()]
  return { totalExpansionOccurrences: occurrences.length, initialExcludedOccurrences: occurrences.length - postInitial.length, postInitialExpansionOccurrences: postInitial.length, uniquePostInitialParents, repeatedOccurrencesRemoved: postInitial.length - uniquePostInitialParents.length, recurringParents: uniquePostInitialParents.filter((parent) => parent.occurrenceCount > 1).map((parent) => ({ semanticKey: parent.semanticKey, occurrences: parent.occurrenceCount })) }
}

/** This API accepts only pre-polish metrics; full-polish labels are not rank inputs. */
export function rankPostInitialCheapAdmission(scores: readonly PostInitialCheapScore[]): StormStructuralAdmissionPrePolishRanking {
  return rankStormStructuralAdmissionPrePolish(scores)
}

function residualForParent(problem: SolverLabProblemV1, filters: readonly Filter[]): number[] {
  const actual = cascadeMagnitudeDb(filters, problem.frequenciesHz, problem.sampleRateHz)
  return problem.desiredDb.map((desired, index) => desired - actual[index]!)
}

function continuousMetrics(filters: readonly Filter[], problem: SolverLabProblemV1): { rmseDb: number; maxAbsDb: number } {
  const solution = evaluateV2Solution(filters, problem.desiredDb, problem.frequenciesHz, problem.sampleRateHz)
  return { rmseDb: solution.metrics.rmseDb, maxAbsDb: solution.metrics.maxAbsDb }
}

function metricBestId(prefix: string, rank: number): string { return `${prefix}-${String(rank).padStart(4, '0')}` }

function selectBestProposal(proposals: readonly PostInitialProposalOutcome[], label: string): PostInitialProposalOutcome {
  if (proposals.length === 0) throw new Error(label + ' proposal set is empty')
  const selected = selectReferencePoint(proposals.map((proposal) => selectorPoint(metricBestId(label, proposal.rank), proposal.canonical)))
  const winner = proposals.find((proposal) => metricBestId(label, proposal.rank) === selected.candidateId)
  if (winner === undefined) throw new Error(label + ' selector winner is absent')
  return winner
}

function parseReferences(snapshot: OracleReferenceSnapshotV1, problem: SolverLabProblemV1): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, STORM_POST_INITIAL_ADMISSION_CENSUS_MAX_FILTERS)
  const candidates = new Map(cell.candidates.map((entry) => [entry.candidateId, entry]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const entry = candidates.get(candidateId)
    if (entry === undefined) throw new Error('reference frontier candidate is absent: ' + candidateId)
    return { candidateId, rmseDb: entry.canonicalRmseDb, maxAbsDb: entry.canonicalMaxAbsDb, filterCount: entry.actualDeliveredFilterCount }
  })
}

function loadRuntimeInputs(options: PostInitialAdmissionCensusOptions): FrozenRuntimeInputs {
  const dynamicPath = resolveResearchPath(options.dynamicInputPath ?? STORM_POST_INITIAL_DYNAMIC_INPUT)
  const cheapPath = resolveResearchPath(options.cheapInputPath ?? STORM_POST_INITIAL_CHEAP_INPUT)
  const replayPath = resolveResearchPath(options.replayInputPath ?? STORM_POST_INITIAL_REPLAY_INPUT)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const dynamicSha256 = sha256File(dynamicPath)
  const cheapSha256 = sha256File(cheapPath)
  const replaySha256 = sha256File(replayPath)
  if (dynamicSha256 !== DYNAMIC_REPORT_SHA256) throw new Error('frozen dynamic B/C artifact hash drifted')
  if (cheapSha256 !== STORM_POST_INITIAL_CHEAP_INPUT_SHA256) throw new Error('frozen B cheap artifact hash drifted')
  if (replaySha256 !== STORM_POST_INITIAL_REPLAY_INPUT_SHA256) throw new Error('frozen replay artifact hash drifted')
  const snapshotValue: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshotValue)
  if (snapshotValue.contentSha256 !== REFERENCE_SNAPSHOT_CONTENT_SHA256) throw new Error('frozen reference content hash drifted')
  const dynamic = readJson<DynamicArtifactJson>(dynamicPath, 'dynamic artifact')
  const cheap = readJson<CheapArtifactJson>(cheapPath, 'cheap artifact')
  const replay = readJson<ReplayArtifactJson>(replayPath, 'replay artifact')
  if (dynamic.schemaVersion !== 1 || dynamic.experimentVersion !== 'storm-cheap-admission-dynamic-all-parents-v1' || dynamic.primarySeedId !== STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID) throw new Error('dynamic artifact identity drifted')
  if (cheap.schemaVersion !== 1 || cheap.experimentVersion !== 'storm-cheap-admission-causal-v1' || cheap.primarySeedId !== STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID) throw new Error('cheap B artifact identity drifted')
  if (replay.primarySeedId !== STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID) throw new Error('replay identity drifted')
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm adversarial research case is unavailable')
  const problem = createSolverLabProblem(researchCase, STORM_POST_INITIAL_ADMISSION_CENSUS_MAX_FILTERS)
  return { dynamicPath, cheapPath, replayPath, snapshotPath, dynamic, cheap, replay, problem, references: parseReferences(snapshotValue, problem), dynamicSha256, cheapSha256, replaySha256, snapshotContentSha256: snapshotValue.contentSha256 }
}

function cheapStateForIdentity(cheap: CheapArtifactJson, identity: string): CheapDescendantJson {
  const states = [cheap.arms.cheapAdmission.seedValidation, ...cheap.arms.cheapAdmission.descendants]
  const state = states.find((entry) => entry.candidateId.endsWith(identity))
  if (state === undefined) throw new Error('B artifact lacks filters for parent identity: ' + identity)
  return state
}

export function selectTrajectoryGlobalBestAtEvaluation(
  trajectory: readonly PostInitialTrajectoryPoint[],
  evaluationIndex: number,
): PostInitialTrajectoryBest {
  if (!Number.isSafeInteger(evaluationIndex) || evaluationIndex < 0) throw new Error('trajectory evaluation index must be a non-negative integer')
  const prefix = trajectory.filter((point) => point.evaluationIndex <= evaluationIndex)
  if (prefix.length === 0) throw new Error('B trajectory prefix is empty')
  const selected = selectReferencePoint(prefix.map((point) => selectorPoint(point.candidateId, point.metrics)))
  const point = prefix.find((entry) => entry.candidateId === selected.candidateId)
  if (point === undefined) throw new Error('B trajectory global-best selector winner is absent')
  return { candidateId: point.candidateId, metrics: metricFromJson(point.metrics) }
}

function trajectoryGlobalBestFor(trajectory: CheapArmJson['trajectory'], evaluationIndex: number): PostInitialMetric {
  return selectTrajectoryGlobalBestAtEvaluation(trajectory, evaluationIndex).metrics
}

function buildOccurrences(inputs: FrozenRuntimeInputs): { occurrences: PostInitialParentOccurrence[]; initialParentIdentity: string } {
  const bRuns = inputs.dynamic.runs.filter((run) => run.armId === 'cheap-initial-only')
  if (bRuns.length !== 4) throw new Error('frozen B trajectory must contain four runs')
  const occurrences: PostInitialParentOccurrence[] = []
  let initialParentIdentity: string | undefined
  for (const run of bRuns) {
    if (run.parentDecisions.length !== 5) throw new Error('frozen B run must contain five parent occurrences')
    for (const decision of run.parentDecisions) {
      if (decision.layerIndex === 1 && initialParentIdentity === undefined) initialParentIdentity = decision.parentIdentity
      const state = cheapStateForIdentity(inputs.cheap, decision.parentIdentity)
      const metrics = metricFromJson({ ...decision.parentMetrics, referenceImproved: false })
      if (Math.abs(metrics.rmseDb - state.metrics.rmseDb) > MATERIAL_EPSILON || Math.abs(metrics.maxAbsDb - state.metrics.maxAbsDb) > MATERIAL_EPSILON || metrics.filterCount !== state.metrics.filterCount) throw new Error('B parent metrics drift from frozen cheap artifact: ' + decision.parentIdentity)
      occurrences.push({ parentIdentity: decision.parentIdentity, filters: cloneFilters(state.canonicalFilters), runOrder: run.orderIndex, layerIndex: decision.layerIndex, parentIndex: decision.parentIndex, evaluationIndex: state.evaluationIndex, canonicalMetrics: metrics, trajectoryGlobalBest: trajectoryGlobalBestFor(inputs.cheap.arms.cheapAdmission.trajectory, state.evaluationIndex) })
    }
  }
  if (initialParentIdentity === undefined) throw new Error('frozen B runs lack initial parent')
  return { occurrences, initialParentIdentity }
}

function bestSummary(proposal: PostInitialProposalOutcome): PostInitialBestProposal {
  return { rank: proposal.rank, mutation: proposal.mutation, canonical: metricFromJson(proposal.canonical) }
}

function proposalDiagnostic(parent: FrozenPostInitialParent, problem: SolverLabProblemV1, references: readonly ReferenceRegretPoint[]): PostInitialParentDiagnostic {
  if (parent.canonicalMetrics === null || parent.trajectoryGlobalBest === null) throw new Error('frozen parent must carry canonical and global-best metrics')
  const residualDb = residualForParent(problem, parent.filters)
  const orderedProposals: EnumeratedStormStructuralProposal[] = enumerateStormStructuralProposals({ problem, parentFilters: parent.filters, residualDb, top4: STORM_POST_INITIAL_ADMISSION_CENSUS_TOP4 })
  const cheapInputs: PostInitialCheapScore[] = []
  for (const proposal of orderedProposals) {
    const preEvaluation = evaluateSolverLabCandidate(problem, candidate(problem, `storm-post-initial-pre-polish-${String(proposal.rank).padStart(4, '0')}`, proposal.filters))
    if (!preEvaluation.valid || preEvaluation.deliverable === null) throw new Error('pre-polish proposal rejected')
    cheapInputs.push({ proposalRank: proposal.rank, rmseDb: preEvaluation.deliverable.rmseDb, maxAbsDb: preEvaluation.deliverable.maxAbsDb, filterCount: preEvaluation.deliverable.filters.length, cancellationScore: preEvaluation.deliverable.cancellationTotalScore })
  }
  const cheapRanking = rankPostInitialCheapAdmission(cheapInputs)
  const outcomes: PostInitialProposalOutcome[] = []
  for (const proposal of orderedProposals) {
    const cheapInput = cheapInputs[proposal.rank - 1]!
    const filtersBeforePolish = cloneFilters(proposal.filters)
    const polished = polishStructuralProposal(problem, filtersBeforePolish, STORM_POST_INITIAL_ADMISSION_CENSUS_LOCAL_POLISH, () => false)
    const postPolishContinuous = continuousMetrics(polished.refinedFilters, problem)
    const deliveredFilters = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
    const evaluation = evaluateSolverLabCandidate(problem, candidate(problem, `storm-post-initial-canonical-${String(proposal.rank).padStart(4, '0')}`, deliveredFilters))
    const canonical = metricFromEvaluation(evaluation, references)
    outcomes.push({ rank: proposal.rank, originalOrdinal: proposal.originalOrdinal, mutation: proposal.mutation, filtersBeforePolish, lexicalAdmitted: proposal.rank <= STORM_POST_INITIAL_ADMISSION_CENSUS_TOP4, cheapAdmitted: cheapRanking.top4.includes(proposal.rank), prePolish: { rmseDb: cheapInput.rmseDb, maxAbsDb: cheapInput.maxAbsDb, filterCount: cheapInput.filterCount, cancellationScore: cheapInput.cancellationScore }, postPolishContinuous, canonical, coordinateTrials: polished.coordinateTrials, relationVsParent: relation(canonical, parent.canonicalMetrics, 'parent'), relationVsTrajectoryGlobalBest: relation(canonical, parent.trajectoryGlobalBest, 'trajectory-global-best'), dominatesAnyLexicalAdmitted: false, selectorPreferredToAnyLexicalAdmitted: false, useful: false, materiallyUseful: false, usefulReasons: [] })
  }
  const lexicalAdmitted = outcomes.filter((proposal) => proposal.lexicalAdmitted)
  for (const proposal of outcomes) {
    proposal.dominatesAnyLexicalAdmitted = !proposal.lexicalAdmitted && lexicalAdmitted.some((admitted) => dominates(proposal.canonical, admitted.canonical))
    proposal.selectorPreferredToAnyLexicalAdmitted = !proposal.lexicalAdmitted && lexicalAdmitted.some((admitted) => relation(proposal.canonical, admitted.canonical, 'lexical-admitted').selectorWinner === 'candidate')
    if (proposal.dominatesAnyLexicalAdmitted) proposal.usefulReasons.push('dominates-lexical-admitted')
    if (proposal.selectorPreferredToAnyLexicalAdmitted) proposal.usefulReasons.push('selector-preferred-to-lexical-admitted')
    if (!proposal.lexicalAdmitted && proposal.relationVsParent.selectorWinner === 'candidate') proposal.usefulReasons.push('selector-beats-parent')
    if (!proposal.lexicalAdmitted && proposal.relationVsTrajectoryGlobalBest.selectorWinner === 'candidate') proposal.usefulReasons.push('selector-beats-trajectory-global-best')
    proposal.useful = proposal.usefulReasons.length > 0
    proposal.materiallyUseful = !proposal.lexicalAdmitted && proposal.cheapAdmitted && (proposal.relationVsParent.selectorWinner === 'candidate' || proposal.relationVsTrajectoryGlobalBest.selectorWinner === 'candidate')
  }
  const bestGlobalProposal = selectBestProposal(outcomes, 'global')
  const bestLexicalProposal = selectBestProposal(lexicalAdmitted, 'lexical')
  const cheapAdmitted = outcomes.filter((proposal) => proposal.cheapAdmitted)
  const bestCheapProposal = selectBestProposal(cheapAdmitted, 'cheap')
  const useful = outcomes.filter((proposal) => proposal.useful)
  const materiallyUseful = outcomes.filter((proposal) => proposal.materiallyUseful)
  const localOnly = useful.filter((proposal) => !proposal.materiallyUseful && proposal.cheapAdmitted)
  const unrecovered = useful.filter((proposal) => !proposal.cheapAdmitted)
  const cheapRankByProposal = new Map(cheapRanking.ranking.map((rank, index) => [rank, index + 1]))
  const bestGlobalRankCheap = cheapRankByProposal.get(bestGlobalProposal.rank)
  if (bestGlobalRankCheap === undefined) throw new Error('cheap rank for global winner is absent')
  return {
    semanticKey: parent.semanticKey,
    parentIdentity: parent.parentIdentity,
    occurrenceCount: parent.occurrenceCount,
    proposalCount: outcomes.length,
    lexicalRanking: outcomes.map((proposal) => proposal.rank),
    lexicalTop4: outcomes.slice(0, STORM_POST_INITIAL_ADMISSION_CENSUS_TOP4).map((proposal) => proposal.rank),
    cheapRanking: cheapRanking.ranking,
    cheapTop4: cheapRanking.top4,
    overlap: cheapRanking.top4.filter((rank) => rank <= STORM_POST_INITIAL_ADMISSION_CENSUS_TOP4).length,
    fullCanonicalBestRankLexical: bestGlobalProposal.rank,
    fullCanonicalBestRankCheap: bestGlobalRankCheap,
    lexicalRecallAt4Useful: { recovered: useful.filter((proposal) => proposal.lexicalAdmitted).length, total: useful.length, rate: useful.length === 0 ? 1 : useful.filter((proposal) => proposal.lexicalAdmitted).length / useful.length },
    cheapRecallAt4Useful: { recovered: useful.filter((proposal) => proposal.cheapAdmitted).length, total: useful.length, rate: useful.length === 0 ? 1 : useful.filter((proposal) => proposal.cheapAdmitted).length / useful.length },
    bestLexicalAdmitted: bestSummary(bestLexicalProposal),
    bestCheapAdmitted: bestSummary(bestCheapProposal),
    bestGlobalProposal: bestSummary(bestGlobalProposal),
    relationVsParent: relation(bestGlobalProposal.canonical, parent.canonicalMetrics, 'parent'),
    relationVsTrajectoryGlobalBest: relation(bestGlobalProposal.canonical, parent.trajectoryGlobalBest, 'trajectory-global-best'),
    usefulMutationTypes: [...new Set(useful.map((proposal) => proposal.mutation))],
    materiallyUsefulProposalRanks: materiallyUseful.map((proposal) => proposal.rank),
    localOnlyProposalRanks: localOnly.map((proposal) => proposal.rank),
    unrecoveredUsefulProposalRanks: unrecovered.map((proposal) => proposal.rank),
    proposals: outcomes,
  }
}

function gateStatus(name: string): GateStatus {
  const value = process.env[name]
  return value === 'PASS_THIS_RUN' || value === 'PASS_PREVIOUSLY_VERIFIED' || value === 'FAIL' || value === 'BLOCKED_KNOWN' || value === 'NOT_RUN'
    ? value
    : 'NOT_RUN'
}

function gateResults(): Record<string, GateStatus> {
  return {
    focused_test: gateStatus('STORM_POST_INITIAL_GATE_FOCUSED_TEST'),
    pnpm_test: gateStatus('STORM_POST_INITIAL_GATE_PNPM_TEST'),
    pnpm_typecheck: gateStatus('STORM_POST_INITIAL_GATE_TYPECHECK'),
    pnpm_build: gateStatus('STORM_POST_INITIAL_GATE_BUILD'),
    pnpm_lint: gateStatus('STORM_POST_INITIAL_GATE_LINT'),
    core_benchmark: gateStatus('STORM_POST_INITIAL_GATE_CORE_BENCHMARK'),
    git_diff_check: gateStatus('STORM_POST_INITIAL_GATE_DIFF_CHECK'),
    routing_policy: gateStatus('STORM_POST_INITIAL_GATE_ROUTING_POLICY'),
    deterministic_reproduction: gateStatus('STORM_POST_INITIAL_GATE_DETERMINISTIC'),
  }
}

export function createStormPostInitialAdmissionCensusArtifact(options: PostInitialAdmissionCensusOptions = {}): StormPostInitialAdmissionCensusArtifact {
  const inputs = loadRuntimeInputs(options)
  const { occurrences, initialParentIdentity } = buildOccurrences(inputs)
  const frozen = deduplicatePostInitialParentOccurrences(occurrences, initialParentIdentity)
  if (frozen.uniquePostInitialParents.length === 0) throw new Error('post-initial B census has no unique parents')
  const semanticIdentitySha256 = createHash('sha256').update(canonicalJson(frozen.uniquePostInitialParents.map((parent) => ({ semanticKey: parent.semanticKey, parentIdentity: parent.parentIdentity, filters: parent.filters, occurrenceCount: parent.occurrenceCount, occurrences: parent.occurrences })))).digest('hex')
  const parents = frozen.uniquePostInitialParents.map((parent) => proposalDiagnostic(parent, inputs.problem, inputs.references))
  const materialUsefulRecoveredParents = parents.filter((parent) => parent.materiallyUsefulProposalRanks.length > 0).length
  const localOnlyRecoveredParents = parents.filter((parent) => parent.materiallyUsefulProposalRanks.length === 0 && parent.localOnlyProposalRanks.length > 0).length
  const usefulMissesNotRecoveredParents = parents.filter((parent) => parent.unrecoveredUsefulProposalRanks.length > 0 && parent.materiallyUsefulProposalRanks.length === 0).length
  const classification = classifyPostInitialAdmissionCensus({
    materialUsefulRecovered: materialUsefulRecoveredParents > 0,
    localOnlyRecovered: localOnlyRecoveredParents > 0,
    usefulMissesNotRecovered: usefulMissesNotRecoveredParents > 0,
    parentOutcomes: parents.map((parent) => parent.materiallyUsefulProposalRanks.length > 0 ? 'material' : parent.localOnlyProposalRanks.length > 0 ? 'local-only' : parent.unrecoveredUsefulProposalRanks.length > 0 ? 'misaligned' : 'no-opportunity'),
  })
  const proposalCount = parents.reduce((sum, parent) => sum + parent.proposalCount, 0)
  const fullPolishCoordinateTrials = parents.reduce((sum, parent) => sum + parent.proposals.reduce((inner, proposal) => inner + proposal.coordinateTrials, 0), 0)
  const interpretation = classification === 'initial-only-bottleneck-supported'
    ? ['No post-initial semantic parent contained a material lexical miss recovered by cheap admission under the frozen selector.', 'This strengthens the bounded hypothesis that the material admission bottleneck is concentrated at entry/seed transition for this trajectory and budget.', 'Do not run another dynamic-all-parent experiment from this result; generalization is still required before policy change.']
    : classification === 'post-initial-admission-opportunity-supported'
      ? ['At least one post-initial semantic parent had a lexical-excluded proposal recovered by cheap admission that improved the parent or point-in-time B global best by the frozen selector.', 'The B/C final tie therefore does not rule out local headroom; next diagnosis belongs to beam retention, monotonic/Pareto barriers, revisitation, visited-state semantics, or trajectory interaction.', 'No such mechanism was changed in this census.']
      : classification === 'post-initial-local-only'
        ? ['Cheap admission recovered a post-initial proposal better than lexical-admitted proposals, but no recovered proposal improved the parent or point-in-time B global best materially.', 'The finding is local-only and does not establish useful trajectory headroom.']
        : classification === 'signal-misaligned-post-initial'
          ? ['Post-initial useful lexical misses were observed, but cheap admission did not recover them adequately.', 'The pre-polish frozen-selector signal must not be used globally; Terra should choose another signal or an MP rank audit.']
          : ['Post-initial outcomes vary materially across semantic parents and do not support one defensible interpretation.', 'Keep policy and search mechanisms frozen pending Terra replan.']
  const limitations = ['This is an offline census over the frozen B cheap-initial-only trajectory; it is not a new competitive trajectory.', 'The primary post-initial set contains one semantic parent after excluding sparse-0010; repeated B occurrences are descriptive overhead only.', 'Useful is defined from full-canonical relations to lexical-admitted proposals, the parent, and the point-in-time B global best; it does not imply global causal impact.', 'C-only parents are recorded as NOT_RUN and are not mixed into the primary census.']
  return {
    schemaVersion: STORM_POST_INITIAL_ADMISSION_CENSUS_SCHEMA_VERSION,
    experimentVersion: STORM_POST_INITIAL_ADMISSION_CENSUS_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm', primarySeedId: STORM_POST_INITIAL_ADMISSION_CENSUS_PRIMARY_ID,
    sourceCommit: currentCommit(), taskAction: 'IMPLEMENT', taskDomain: 'RESEARCH', criticality: 'MAJOR', scopeContract: SCOPE_CONTRACT, doNotChange: SCOPE_CONTRACT.doNotChange,
    frozenInputs: {
      dynamicArtifact: { logicalId: STORM_POST_INITIAL_DYNAMIC_INPUT, sha256: inputs.dynamicSha256 },
      cheapArtifact: { logicalId: STORM_POST_INITIAL_CHEAP_INPUT, sha256: inputs.cheapSha256 },
      replayArtifact: { logicalId: STORM_POST_INITIAL_REPLAY_INPUT, sha256: inputs.replaySha256 },
      referenceSnapshot: { logicalId: 'external:OracleReferenceSnapshotV1.json', contentSha256: inputs.snapshotContentSha256 },
    },
    censusFrozenBeforeOutcomes: true, initialParentExcluded: true,
    frozenParentSet: { ...frozen, semanticIdentitySha256 },
    semanticDeduplication: { deterministic: true, totalExpansionOccurrences: frozen.totalExpansionOccurrences, initialExcludedOccurrences: frozen.initialExcludedOccurrences, postInitialExpansionOccurrences: frozen.postInitialExpansionOccurrences, uniquePostInitialParents: frozen.uniquePostInitialParents.length, repeatedOccurrencesRemoved: frozen.repeatedOccurrencesRemoved, recurringParents: frozen.recurringParents },
    controls: {
      lexicalRankingRuntimeReproduced: true, cheapRankingOutcomeBlind: true, fullPolishLabelsExcludedFromRanking: true, futureLeakageAbsent: true, trajectoryUnmodified: true, repeatsNotIndependentEvidence: true,
      maxFilters: 10, currentMutationGenerator: 'generateStructuralMutations', orderStructuralProposals: 'orderStructuralProposals', localPolishEvaluations: 24, frozenSelector: 'reference-selector-v1', frozenReference: true, standardV2Quantization: true, canonicalDeliveredEvaluation: 'canonical-delivered-v1',
    },
    parents,
    secondaryCOnly: { status: 'NOT_RUN', reason: 'Optional descriptive C-only set was not needed after the single-parent B census was frozen.' },
    costAccounting: { uniqueParents: frozen.uniquePostInitialParents.length, proposalCount, canonicalPrePolishEvaluations: proposalCount, fullPolishCoordinateTrials, canonicalLabelEvaluations: proposalCount, parentBaselineCanonicalEvaluations: frozen.uniquePostInitialParents.length, productionCostClaim: false },
    classification,
    decisionCriteria: { materialUsefulRecoveredParents, localOnlyRecoveredParents, usefulMissesNotRecoveredParents, materialDefinition: 'Lexical-excluded and cheap-admitted proposal whose full canonical result wins parent or frozen point-in-time B global best by selector, or dominates it in both RMSE and maxAbs.' },
    interpretation, limitations,
    deterministic: { nonTimingArtifactReproduction: true, semanticParentSetSha256: semanticIdentitySha256 },
    testsAndGates: {
      focusedTestCommand: 'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormPostInitialAdmissionCensus.test.ts',
      generationCommand: 'pnpm --filter @autoeq-workbench/core research:storm-post-initial-census',
      requiredGateCommands: ['pnpm test', 'pnpm typecheck', 'pnpm build', 'pnpm lint', 'git diff --check', 'node --test .agents/skills/astra-orchestra/routing-policy.test.mjs'],
      gateResults: gateResults(),
    },
  }
}

function metricSummary(proposal: PostInitialBestProposal): string {
  return `rank ${proposal.rank} (${proposal.mutation}), RMSE ${proposal.canonical.rmseDb}, maxAbs ${proposal.canonical.maxAbsDb}, regret ${proposal.canonical.referenceRegret}`
}

export function renderStormPostInitialAdmissionCensusReport(artifact: StormPostInitialAdmissionCensusArtifact, artifactSha256 = '<generated-after-writing-artifact>'): string {
  const parentLines = artifact.parents.flatMap((parent) => [
    `### Parent ${parent.parentIdentity}`,
    '',
    `- Semantic key: \`${parent.semanticKey}\`; occurrences: ${parent.occurrenceCount}; proposal count: ${parent.proposalCount}.`,
    `- Reappearance locations: ${artifact.frozenParentSet.uniquePostInitialParents.find((entry) => entry.semanticKey === parent.semanticKey)?.occurrences.map((entry) => `run=${entry.runOrder}/layer=${entry.layerIndex}/parent=${entry.parentIndex}`).join(', ') ?? 'unavailable'}.`,
    `- Lexical top-4: ${JSON.stringify(parent.lexicalTop4)}; cheap top-4: ${JSON.stringify(parent.cheapTop4)}; overlap: ${parent.overlap}.`,
    `- Full-canonical best rank lexical=${parent.fullCanonicalBestRankLexical}; cheap=${parent.fullCanonicalBestRankCheap}.`,
    `- Useful recall@4 lexical=${parent.lexicalRecallAt4Useful.recovered}/${parent.lexicalRecallAt4Useful.total} (${parent.lexicalRecallAt4Useful.rate}); cheap=${parent.cheapRecallAt4Useful.recovered}/${parent.cheapRecallAt4Useful.total} (${parent.cheapRecallAt4Useful.rate}).`,
    `- Best lexical-admitted: ${metricSummary(parent.bestLexicalAdmitted)}.`,
    `- Best cheap-admitted: ${metricSummary(parent.bestCheapAdmitted)}.`,
    `- Best full-canonical proposal: ${metricSummary(parent.bestGlobalProposal)}.`,
    `- Best full-canonical relation vs parent: Pareto=${parent.relationVsParent.pareto}, selector=${parent.relationVsParent.selectorWinner}; vs trajectory-global-best: Pareto=${parent.relationVsTrajectoryGlobalBest.pareto}, selector=${parent.relationVsTrajectoryGlobalBest.selectorWinner}.`,
    `- Useful mutation types: ${parent.usefulMutationTypes.length === 0 ? 'none' : parent.usefulMutationTypes.join(', ')}.`,
    `- Materially useful ranks: ${JSON.stringify(parent.materiallyUsefulProposalRanks)}; local-only ranks: ${JSON.stringify(parent.localOnlyProposalRanks)}; unrecovered useful ranks: ${JSON.stringify(parent.unrecoveredUsefulProposalRanks)}.`,
    '',
    '| Rank | Mutation | Lexical | Cheap | Pre-polish RMSE/maxAbs | Canonical RMSE/maxAbs/regret | vs parent | vs B global | Useful |',
    '| ---: | --- | :---: | :---: | --- | --- | --- | --- | :---: |',
    ...parent.proposals.map((proposal) => `| ${proposal.rank} | ${proposal.mutation} | ${proposal.lexicalAdmitted ? 'yes' : 'no'} | ${proposal.cheapAdmitted ? 'yes' : 'no'} | ${proposal.prePolish.rmseDb} / ${proposal.prePolish.maxAbsDb} | ${proposal.canonical.rmseDb} / ${proposal.canonical.maxAbsDb} / ${proposal.canonical.referenceRegret} | ${proposal.relationVsParent.pareto}/${proposal.relationVsParent.selectorWinner} | ${proposal.relationVsTrajectoryGlobalBest.pareto}/${proposal.relationVsTrajectoryGlobalBest.selectorWinner} | ${proposal.useful ? 'yes' : 'no'} |`),
    '',
  ])
  const gateLines = Object.entries(artifact.testsAndGates.gateResults).map(([name, status]) => `- ${name}: ${status}.`)
  return [
    '# Storm post-initial admission census results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})  `,
    `Case: ${artifact.caseId}  `,
    `Primary: ${artifact.primarySeedId}  `,
    `Classification: **${artifact.classification}**  `,
    `Producer commit: ${artifact.sourceCommit ?? 'unproven'}`,
    '',
    '## Scope and frozen census',
    '',
    'This is an observational offline census over semantic-unique post-initial parents in frozen trajectory B (`cheap-initial-only`). The initial `sparse-0010` parent is excluded. Parent identities are deduplicated by deterministic canonical structure with filter IDs removed; the parent set is frozen before any proposal outcomes are evaluated.',
    '',
    `- Total B expansion occurrences: ${artifact.semanticDeduplication.totalExpansionOccurrences}.`,
    `- Initial parent occurrences excluded: ${artifact.semanticDeduplication.initialExcludedOccurrences}.`,
    `- Post-initial occurrences: ${artifact.semanticDeduplication.postInitialExpansionOccurrences}.`,
    `- Semantic-unique post-initial parents: ${artifact.semanticDeduplication.uniquePostInitialParents}; repeated occurrences removed: ${artifact.semanticDeduplication.repeatedOccurrencesRemoved}.`,
    `- Recurring parent groups: ${artifact.semanticDeduplication.recurringParents.length === 0 ? 'none' : artifact.semanticDeduplication.recurringParents.map((entry) => `${entry.occurrences}×${entry.semanticKey}`).join('; ')}.`,
    `- Frozen parent-set SHA-256: ${artifact.deterministic.semanticParentSetSha256}.`,
    '',
    '## Contracts and controls',
    '',
    '- Max10; current mutation generator; `orderStructuralProposals`; local polish 24; frozen reference-selector-v1; standard-v2 quantization; canonical delivered evaluation.',
    '- Cheap top-4 uses only canonical pre-polish metrics and lexical rank tie-breaks. Full-polish/canonical labels are computed only after both rankings are frozen.',
    '- Residuals and proposal generation are recomputed exactly from each frozen parent. No beam/search feedback or trajectory mutation occurs.',
    '- The trajectory-global-best comparator is reconstructed from B prefix data through each parent occurrence; future child outcomes are not used.',
    '',
    ...parentLines,
    '## Cost accounting',
    '',
    `- Unique parents=${artifact.costAccounting.uniqueParents}; proposals=${artifact.costAccounting.proposalCount}; canonical pre-polish evaluations=${artifact.costAccounting.canonicalPrePolishEvaluations}; full-polish coordinate trials=${artifact.costAccounting.fullPolishCoordinateTrials}; canonical labels=${artifact.costAccounting.canonicalLabelEvaluations}; parent baseline canonical evaluations=${artifact.costAccounting.parentBaselineCanonicalEvaluations}.`,
    '- These are offline diagnostic counts, not production cost.',
    '',
    '## Decision',
    '',
    `- Classification: **${artifact.classification}**.`,
    `- Materially useful recovered parents: ${artifact.decisionCriteria.materialUsefulRecoveredParents}; local-only recovered parents: ${artifact.decisionCriteria.localOnlyRecoveredParents}; useful misses not recovered: ${artifact.decisionCriteria.usefulMissesNotRecoveredParents}.`,
    `- Material definition: ${artifact.decisionCriteria.materialDefinition}`,
    ...artifact.interpretation.map((line) => `- ${line}`),
    '',
    '## Invariants and limitations',
    '',
    ...artifact.scopeContract.doNotChange.map((line) => `- doNotChange: ${line}`),
    ...artifact.limitations.map((line) => `- ${line}`),
    `- Secondary C-only descriptive set: ${artifact.secondaryCOnly.status} (${artifact.secondaryCOnly.reason})`,
    '',
    '## Hashes and gate status',
    '',
    `- Artifact SHA-256: ${artifactSha256}.`,
    `- Frozen dynamic artifact SHA-256: ${artifact.frozenInputs.dynamicArtifact.sha256}.`,
    `- Frozen B cheap artifact SHA-256: ${artifact.frozenInputs.cheapArtifact.sha256}.`,
    `- Frozen replay artifact SHA-256: ${artifact.frozenInputs.replayArtifact.sha256}.`,
    `- Frozen reference snapshot content SHA-256: ${artifact.frozenInputs.referenceSnapshot.contentSha256}.`,
    `- Non-timing deterministic reproduction: ${artifact.deterministic.nonTimingArtifactReproduction}.`,
    ...gateLines,
    `- Focused test: ${artifact.testsAndGates.focusedTestCommand}.`,
    `- Generation: ${artifact.testsAndGates.generationCommand}.`,
    `- Required gates: ${artifact.testsAndGates.requiredGateCommands.join('; ')}.`,
    '',
    'This artifact stops after the post-initial census and Terra acceptance. It does not run a new dynamic policy, caching, beam change, temporary-worsening experiment, MP rank audit, U12t/Trio, holdout, promotion, product/default change, merge, release, deploy, or publish.',
    '',
  ].join('\n')
}

export function generateStormPostInitialAdmissionCensus(options: PostInitialAdmissionCensusOptions = {}): GeneratedStormPostInitialAdmissionCensusArtifacts {
  const artifactPath = resolveResearchPath(options.outputPath ?? STORM_POST_INITIAL_ADMISSION_CENSUS_OUTPUT)
  const reportPath = resolveResearchPath(options.reportPath ?? STORM_POST_INITIAL_ADMISSION_CENSUS_REPORT)
  const artifact = createStormPostInitialAdmissionCensusArtifact(options)
  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)
  writeFileSync(reportPath, renderStormPostInitialAdmissionCensusReport(artifact, artifactSha256))
  return { artifact, artifactPath, reportPath, artifactSha256 }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, dynamicInputPath, cheapInputPath, replayInputPath, snapshotPath] = args
  const generated = generateStormPostInitialAdmissionCensus({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(dynamicInputPath === undefined ? {} : { dynamicInputPath }),
    ...(cheapInputPath === undefined ? {} : { cheapInputPath }),
    ...(replayInputPath === undefined ? {} : { replayInputPath }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
  })
  process.stdout.write(JSON.stringify({ artifactPath: generated.artifactPath, reportPath: generated.reportPath, artifactSha256: generated.artifactSha256, classification: generated.artifact.classification }) + '\n')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
