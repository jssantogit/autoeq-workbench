import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  cascadeMagnitudeDb,
  calculateErrorMetrics,
  DEFAULT_AUTOEQ_SETTINGS,
  quantizeV2Filters,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  resolveStandardAutoEqV2Config,
  type StandardAutoEqV2Config,
} from '../../src/index.js'
import { resolveScalableEffortConfig } from '../../src/autoeq/v2/scalableStructuralSearch.js'
import type { Filter } from '../../src/types/filter.js'
import { auditCancellations } from '../../src/autoeq/cancellation.js'
import {
  localPolishEvaluationBudget,
  polishFilters,
  referenceSelectorKey,
  retainParetoBeam,
  selectQuotaProposals,
  selectReferencePoint,
  selectResidualFeatures,
  selectShelfEvidence,
  semanticFilterKey,
  structuralFilterDifference,
  structuralSignature,
  proposalKey,
  createStructuralEvidenceProposal,
  type SearchState,
  type StructuralMutation,
  type StructuralProposal,
  type StructuralSearchCandidateSnapshot,
  type StructuralSearchGenerationSnapshot,
  type StructuralSearchPrePolishSnapshot,
  type StructuralSearchStateSnapshot,
} from '../../src/autoeq/v2/structuralSearch.js'
import {
  M3_EFFORT_LEVEL,
  M3_REAL_CASES,
  M3_REPEAT_COUNT,
  M3_STRUCTURAL_CEILING,
  M3_SYNTHETIC_CASES,
} from './structuralSearchVnextM3.js'
import { MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET } from '../../src/autoeq/v2/structuralSearch.js'
import {
  prepareManualRegressionDesired,
} from './manualRegression.js'
import { prepareResearchDesired } from './corpus.js'
import { loadSyntheticGroundTruthCorpus } from './syntheticCorpus.js'

export const M4_FROZEN_BOUNDARY = '956be9ddcea4152276744df3565274352b9a9f80' as const
export const M4_SNAPSHOT_STRIDE = 10 as const
/** Frozen M4 replay envelope: 21 completed generations (0 through 20). */
export const M4_DETERMINISTIC_GENERATION_BOUND = 21 as const
export const M4_TRAJECTORY_SECONDS = 30 as const
export const M4_REPEAT_COUNT = M3_REPEAT_COUNT
export const M4_STRUCTURAL_CEILING = M3_STRUCTURAL_CEILING
export const M4_EFFORT_LEVEL = M3_EFFORT_LEVEL
export const M4_RUNNER_SCHEMA_VERSION = 1 as const
export const M4_DEFAULT_OUTPUT_DIR = resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
  '.research-artifacts/structural-search-m4-candidate-oracle-causal-closeout',
)

export const M4_ORACLE_FAMILIES = Object.freeze([
  'O1_RESIDUAL_EXTREMUM_PK',
  'O2_RESIDUAL_REGION_PK',
  'O3_SHELF_EVIDENCE',
  'O4_TOPOLOGY_SUBSTITUTION',
] as const)

export type M4OracleFamily = (typeof M4_ORACLE_FAMILIES)[number]

export type M4FailureClassification =
  | 'NO_STRUCTURAL_CANDIDATE'
  | 'PREPOLISH_REJECTED'
  | 'POLISH_FAILURE'
  | 'BEAM_REJECTED'
  | 'REFERENCE_NONIMPROVING'
  | 'ORACLE_WIN'

export type M4Conclusion =
  | 'STRUCTURAL_CANDIDATE_SIGNAL_SUPPORTED'
  | 'STRUCTURAL_CANDIDATE_SIGNAL_NOT_SUPPORTED'
  | 'INCONCLUSIVE'

export type M4CausalClassification =
  | 'ORDINARY_ALREADY_GENERATED'
  | 'NOVEL_Q31_REJECTED'
  | 'VISITED_DUPLICATE'
  | 'EXACT_BEAM_REJECTED'
  | 'REFERENCE_NONIMPROVING'
  | 'ONLINE_FEASIBLE_ORACLE_WIN'

export const M4_DECISION_RULE = Object.freeze({
  developmentCaseCount: 3,
  holdoutCaseCount: 3,
  requiredRealCaseCount: 6,
  requiredRealRepeatCount: 3,
  requiredSnapshotPhases: 3,
  minimumDevelopmentWinningCases: 2,
  minimumHoldoutWinningCases: 2,
  minimumOverallWinningCases: 4,
  minimumWinningRepeats: 2,
  minimumWinningGenerations: 2,
  requiredFamilies: [...M4_ORACLE_FAMILIES],
})

export interface M4OracleCandidate {
  family: M4OracleFamily
  proposal: StructuralProposal
  filters: Filter[]
  semanticKey: string
  source: 'residual-extremum' | 'residual-region' | 'shelf-evidence' | 'topology-substitution'
  victimFilterId?: string
  parentCandidateId?: string
}

export interface M4CandidateMetrics {
  rmseDb: number
  maxAbsDb: number
  cancellationScore: number
  filterCount: number
  semanticKey: string
  comparatorKey: readonly (number | string)[]
}

export interface M4CandidateComparison {
  candidateId: string
  family: M4OracleFamily
  semanticKey: string
  prePolish: M4CandidateMetrics
  polished: M4CandidateMetrics
  prePolishBeatsWorstOrdinary: boolean
  prePolishBeatsBestOrdinary: boolean
  polishedBeatsWorstOrdinary: boolean
  polishedBeatsBestOrdinary: boolean
  wouldSurviveFrozenParetoBeam: boolean
  /** Always false: the M4 oracle is shadow-only by construction. */
  enteredBaselineBeam: false
  improvesReferenceRmse: boolean
  improvesReferenceMaxAbs: boolean
  improvesBoth: boolean
  topologySubstitutionWin: boolean
  classification: M4FailureClassification
  /** Causal closeout classification; historical M4 classification remains above. */
  causalClassification: M4CausalClassification
  ordinaryGenerated: boolean
  ordinaryAdmitted: boolean
  parentLocalQ31Admissible: boolean | null
  parentLocalQ31DisplacedProposalKey: string | null
  parentLocalQ31SelectionReason: 'ordinary-generated' | 'q31-selected' | 'q31-rejected' | 'parent-unavailable'
  visitedBeforeGeneration: boolean
  duplicatesOrdinaryNextState: boolean
  semanticallyNovel: boolean
  exactBeamSurvives: boolean
  exactReferenceImproves: boolean
  work: {
    polishEvaluationBudget: number
    coordinateTrials: number
    quantizedFilterCount: number
  }
}

export interface M4FamilyMetrics {
  /** Number of snapshots for which this family produced no candidate. */
  familyLocalCandidateAbsence: number
  candidatesGenerated: number
  semanticDuplicatesRejected: number
  validCandidates: number
  prePolishCandidatesBeatingWorstOrdinary: number
  prePolishCandidatesBeatingBestOrdinary: number
  polishedCandidatesBeatingWorstOrdinary: number
  polishedCandidatesBeatingBestOrdinary: number
  candidatesWouldSurviveFrozenParetoBeam: number
  candidatesImprovingReferenceRmse: number
  candidatesImprovingReferenceMaxAbs: number
  candidatesImprovingBoth: number
  topologySubstitutionWins: number
  /**
   * Candidate-stage classifications plus the legacy NO_STRUCTURAL_CANDIDATE
   * family-local counter.  The latter is not the generation-global
   * decomposition in M4AggregateGroup.decomposition.
   */
  classifications: Record<M4FailureClassification, number>
}

export interface M4GenerationOracleResult {
  generation: number
  baselineResult: {
    referenceBefore: M4CandidateMetrics
    referenceAfter: M4CandidateMetrics
    retainedBeamCutoff: M4CandidateMetrics | null
  }
  candidates: M4CandidateComparison[]
  metrics: {
    candidatesGenerated: number
    semanticDuplicatesRejected: number
    validCandidates: number
    prePolishCandidatesBeatingWorstOrdinary: number
    prePolishCandidatesBeatingBestOrdinary: number
    polishedCandidatesBeatingWorstOrdinary: number
    polishedCandidatesBeatingBestOrdinary: number
    candidatesWouldSurviveFrozenParetoBeam: number
    candidatesImprovingReferenceRmse: number
    candidatesImprovingReferenceMaxAbs: number
    candidatesImprovingBoth: number
    topologySubstitutionWins: number
    casesRepeatsGenerationsWithCompetitiveCandidate: number
  }
  byFamily: Record<M4OracleFamily, M4FamilyMetrics>
  decomposition: Record<M4FailureClassification, number>
}

export interface M4SnapshotObservation {
  caseId: string
  caseLabel?: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  repeatIndex: number
  snapshot: StructuralSearchGenerationSnapshot
  result: M4GenerationOracleResult
  /** True when this is the trajectory's terminal completed generation. */
  isFinal?: boolean
  /** The terminal generation for this case/repeat, when known. */
  terminalGeneration?: number | null
  terminalReason?: 'natural-stop' | 'deterministic-bound'
  samplingReasons?: Array<'first' | 'stride' | 'final'>
}

export interface M4TrajectoryCoverage {
  caseId: string
  caseLabel?: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  repeatIndex: number
  capturedGenerations: number[]
  terminalGeneration: number | null
  terminalReason: 'natural-stop' | 'deterministic-bound' | 'unknown'
  samplingAdequate: boolean
  fingerprint: string
}

export interface M4RepeatIdentity {
  caseId: string
  repeatCount: number
  identical: boolean
  trajectoryFingerprints: string[]
}

export interface M4WinLocation {
  caseId: string
  caseLabel?: string
  split: 'development' | 'holdout' | 'sanity'
  repeatIndex: number
  generation: number
  phase: 'first' | 'middle' | 'final' | 'unscheduled'
  families: M4OracleFamily[]
  oracleWinCount: number
  prePolishQualifiedWins: number
  polishedEmergentWins: number
}

export interface M4AggregateEvidence {
  real: M4AggregateGroup
  synthetic: M4AggregateGroup
  byFamily: Record<M4OracleFamily, M4FamilyMetrics>
  /** Generation-global decomposition; NO_STRUCTURAL_CANDIDATE is per snapshot. */
  generationGlobalDecomposition: Record<M4FailureClassification, number>
  decomposition: Record<M4FailureClassification, number>
  decisionBoundary: M4DecisionBoundary
  causalCloseout: M4CausalCloseout
}

export interface M4CausalFamilyTotals {
  historicalOracleWin: number
  ordinaryGeneratedDuplicates: number
  ordinaryGeneratedNotAdmittedDuplicates: number
  ordinaryAdmittedDuplicates: number
  novelCandidates: number
  parentLocalQ31Admissible: number
  visitedDuplicates: number
  exactBeamSurvivors: number
  exactReferenceImprovers: number
  onlineFeasibleOracleWin: number
}

export interface M4CausalCloseout {
  protocolCount: Record<M4OracleFamily, M4CausalFamilyTotals>
  deterministicCount: Record<M4OracleFamily, M4CausalFamilyTotals>
  classificationTotals: Record<M4CausalClassification, number>
  deterministicClassificationTotals: Record<M4CausalClassification, number>
  onlineCoverage: {
    developmentCases: number
    holdoutCases: number
    overallCases: number
    distinctCaseGenerationCells: number
    conclusion: 'ONLINE_STRUCTURAL_INJECTION_SUPPORTED' | 'ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED' | 'INCONCLUSIVE'
  }
  onlineLocations: Array<{ caseId: string; generation: number; family: M4OracleFamily }>
}

export interface M4AggregateGroup {
  family: 'real' | 'synthetic'
  snapshotCount: number
  caseCount: number
  repeatCount: number
  generationCount: number
  competitiveCaseCount: number
  competitiveRepeatCount: number
  competitiveGenerationCount: number
  winsByCase: string[]
  trajectoryCoverage: M4TrajectoryCoverage[]
  repeatIdentityByCase: Record<string, M4RepeatIdentity>
  winLocations: M4WinLocation[]
  byFamily: Record<M4OracleFamily, M4FamilyMetrics>
  /** Generation-global decomposition; candidate-stage counts are event counts. */
  generationGlobalDecomposition: Record<M4FailureClassification, number>
  decomposition: Record<M4FailureClassification, number>
}

export interface M4DecisionBoundary {
  conclusion: M4Conclusion
  rule: typeof M4_DECISION_RULE
  developmentWinningCases: number
  holdoutWinningCases: number
  overallWinningCases: number
  winningRepeats: number
  winningGenerations: number
  samplingAdequate: boolean
  candidateCoverageSufficient: boolean
  missingInformation: string[]
}

export interface M4RunnerOptions {
  includeReal?: boolean
  includeSynthetic?: boolean
  realCaseIds?: readonly string[]
  syntheticCaseIds?: readonly string[]
  repeats?: number
  deterministicMaxGenerations?: number
  snapshotStride?: number
  outputDir?: string
  writeArtifacts?: boolean
}

export interface M4CampaignResult {
  schemaVersion: typeof M4_RUNNER_SCHEMA_VERSION
  frozenBoundary: typeof M4_FROZEN_BOUNDARY
  protocol: {
    structuralCeiling: number
    effortLevel: number
    trajectorySeconds: number
    executionModel: 'generation-work-bounded-replay'
    deterministicGenerationBound: number
    repeatCount: number
    snapshotSampling: string
    baselinePolicy: 'frozen-ordinary-search'
    oraclePolicy: 'offline-shadow-only'
    noOracleBeamAdmission: true
    config: ReturnType<typeof import('../../src/autoeq/v2/structuralSearch.js').resolveStructuralSearchConfig>
  }
  observations: M4SnapshotObservation[]
  aggregate: M4AggregateEvidence
  conclusion: M4Conclusion
  evidenceSha256: string
  outputDir?: string
}

const EMPTY_CLASSIFICATIONS = (): Record<M4FailureClassification, number> => ({
  NO_STRUCTURAL_CANDIDATE: 0,
  PREPOLISH_REJECTED: 0,
  POLISH_FAILURE: 0,
  BEAM_REJECTED: 0,
  REFERENCE_NONIMPROVING: 0,
  ORACLE_WIN: 0,
})

const emptyFamilyMetrics = (): M4FamilyMetrics => ({
  familyLocalCandidateAbsence: 0,
  candidatesGenerated: 0,
  semanticDuplicatesRejected: 0,
  validCandidates: 0,
  prePolishCandidatesBeatingWorstOrdinary: 0,
  prePolishCandidatesBeatingBestOrdinary: 0,
  polishedCandidatesBeatingWorstOrdinary: 0,
  polishedCandidatesBeatingBestOrdinary: 0,
  candidatesWouldSurviveFrozenParetoBeam: 0,
  candidatesImprovingReferenceRmse: 0,
  candidatesImprovingReferenceMaxAbs: 0,
  candidatesImprovingBoth: 0,
  topologySubstitutionWins: 0,
  classifications: EMPTY_CLASSIFICATIONS(),
})

function emptyFamilyMetricsRecord(): Record<M4OracleFamily, M4FamilyMetrics> {
  return Object.fromEntries(M4_ORACLE_FAMILIES.map((family) => [family, emptyFamilyMetrics()])) as Record<M4OracleFamily, M4FamilyMetrics>
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneProposal(proposal: StructuralProposal): StructuralProposal {
  return { mutation: proposal.mutation, filters: cloneFilters(proposal.filters) }
}

function nextFilterId(filters: readonly Filter[], prefix: string): string {
  const ids = new Set(filters.map((filter) => filter.id))
  if (!ids.has(prefix)) return prefix
  let index = 1
  while (ids.has(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function finiteCandidate(candidate: M4OracleCandidate, bounds: StandardAutoEqV2Config): boolean {
  return candidate.filters.length <= bounds.maxFilters && candidate.filters.every((filter) =>
    Number.isFinite(filter.frequencyHz) &&
    Number.isFinite(filter.gainDb) &&
    Number.isFinite(filter.q) &&
    filter.frequencyHz >= bounds.minFrequencyHz &&
    filter.frequencyHz <= bounds.maxFrequencyHz &&
    filter.gainDb >= bounds.minGainDb &&
    filter.gainDb <= bounds.maxGainDb,
  )
}

function evidenceProposal(
  parentFilters: readonly Filter[],
  mutation: Extract<StructuralMutation, 'add-pk' | 'add-ls' | 'add-hs'>,
  frequencyHz: number,
  residual: number,
  bounds: StandardAutoEqV2Config,
): StructuralProposal {
  return createStructuralEvidenceProposal(parentFilters, mutation, frequencyHz, residual, bounds)
}

function candidateFromProposal(
  family: M4OracleFamily,
  proposal: StructuralProposal,
  source: M4OracleCandidate['source'],
  bounds: StandardAutoEqV2Config,
  victimFilterId?: string,
  parentCandidateId?: string,
): M4OracleCandidate {
  const filters = cloneFilters(proposal.filters)
  return {
    family,
    proposal: cloneProposal(proposal),
    filters,
    semanticKey: semanticFilterKey(filters),
    source,
    ...(victimFilterId === undefined ? {} : { victimFilterId }),
    ...(parentCandidateId === undefined ? {} : { parentCandidateId }),
  }
}

function nearestResidualFeature(
  features: readonly { frequencyHz: number; residual: number }[],
  frequencyHz: number,
): { frequencyHz: number; residual: number } | undefined {
  return features.reduce<{ frequencyHz: number; residual: number } | undefined>((best, feature) =>
    best === undefined || Math.abs(Math.log2(feature.frequencyHz / frequencyHz)) < Math.abs(Math.log2(best.frequencyHz / frequencyHz))
      ? feature
      : best,
  undefined)
}

function buildO1O2O3Candidates(
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config,
): M4OracleCandidate[] {
  const frequencies = snapshot.frequencies
  const candidates: M4OracleCandidate[] = []
  const parents = snapshot.parents.length > 0
    ? snapshot.parents.map((entry) => ({ filters: entry.parent.filters, residual: entry.residualDb, candidateId: entry.parent.candidateId }))
    : [{ filters: snapshot.referenceBefore.filters, residual: snapshot.desiredDb, candidateId: snapshot.referenceBefore.candidateId }]
  for (const parentEntry of parents) {
    const parent = parentEntry.filters
    const residual = parentEntry.residual
    if (parent.length >= bounds.maxFilters) continue
    const extrema = selectResidualFeatures(frequencies, residual, bounds, 1, 0, false)
    const regions = Math.max(2, Math.min(6, Math.floor(Math.log2(bounds.maxFrequencyHz / bounds.minFrequencyHz))))
    const regional = selectResidualFeatures(
      frequencies,
      residual,
      bounds,
      regions,
      Math.max(0.25, Math.log2(bounds.maxFrequencyHz / bounds.minFrequencyHz) / regions),
      true,
    )
    const shelf = selectShelfEvidence(frequencies, residual, bounds)
    const o1 = extrema[0]
    if (o1 !== undefined) {
      candidates.push(candidateFromProposal(
        'O1_RESIDUAL_EXTREMUM_PK',
        evidenceProposal(parent, 'add-pk', o1.frequencyHz, o1.residual, bounds),
        'residual-extremum',
        bounds,
        undefined,
        parentEntry.candidateId,
      ))
    }
    // If the strongest regional feature is the same interior extremum as O1,
    // use the next strongest unresolved region when one exists.  This keeps
    // the family census separable without inventing any new evidence.
    const o2 = regional.find((feature) => o1 === undefined ||
      Math.abs(Math.log2(feature.frequencyHz / o1.frequencyHz)) > 1e-12) ?? regional[0]
    if (o2 !== undefined) {
      candidates.push(candidateFromProposal(
        'O2_RESIDUAL_REGION_PK',
        evidenceProposal(parent, 'add-pk', o2.frequencyHz, o2.residual, bounds),
        'residual-region',
        bounds,
        undefined,
        parentEntry.candidateId,
      ))
    }
    for (const edge of shelf) {
      candidates.push(candidateFromProposal(
        'O3_SHELF_EVIDENCE',
        evidenceProposal(parent, edge.type === 'LS' ? 'add-ls' : 'add-hs', edge.frequencyHz, edge.residual, bounds),
        'shelf-evidence',
        bounds,
        undefined,
        parentEntry.candidateId,
      ))
    }
  }
  return candidates
}

function stateFromFilters(
  filters: readonly Filter[],
  snapshot: StructuralSearchGenerationSnapshot,
  candidateId: string,
): SearchState {
  const quantized = cloneFilters(filters)
  const magnitude = cascadeMagnitudeDb(quantized, snapshot.frequencies, snapshot.sampleRateHz)
  const residual = snapshot.desiredDb.map((desired, index) => desired - magnitude[index]!)
  const metrics = calculateErrorMetrics(residual, snapshot.frequencies)
  return {
    candidateId,
    filters: quantized,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    cancellationScore: auditCancellations(quantized, snapshot.frequencies, snapshot.sampleRateHz).totalScore,
  }
}

function compareKeys(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]!
    const rightValue = right[index]!
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function metricsFromState(state: SearchState): M4CandidateMetrics {
  return {
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore,
    filterCount: state.filters.length,
    semanticKey: semanticFilterKey(state.filters),
    comparatorKey: [...referenceSelectorKey(state)],
  }
}

function metricsFromSnapshot(state: StructuralSearchStateSnapshot): M4CandidateMetrics {
  return {
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore,
    filterCount: state.filters.length,
    semanticKey: state.semanticKey,
    comparatorKey: [...state.comparatorKey],
  }
}

function metricsFromPrePolish(state: StructuralSearchPrePolishSnapshot): M4CandidateMetrics {
  return {
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore,
    filterCount: state.filterCount,
    semanticKey: state.semanticKey,
    comparatorKey: [...state.comparatorKey],
  }
}

function q31ComparatorKey(
  metrics: Pick<M4CandidateMetrics, 'rmseDb' | 'maxAbsDb' | 'filterCount' | 'cancellationScore'>,
  lexicalRank: number,
  semanticKey: string,
): readonly (number | string)[] {
  return [metrics.rmseDb, metrics.maxAbsDb, metrics.filterCount, metrics.cancellationScore, lexicalRank, semanticKey]
}

function prePolishMetrics(
  candidate: M4OracleCandidate,
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config,
): M4CandidateMetrics {
  const quantized = candidate.filters.length === 0
    ? []
    : (requireQuantized(candidate.filters, bounds))
  return metricsFromState(stateFromFilters(quantized, snapshot, `m4-pre-${candidate.family}`))
}

function requireQuantized(filters: readonly Filter[], bounds: StandardAutoEqV2Config): Filter[] {
  // Quantization is deliberately delegated through the same core delivery
  // primitive used by ordinary search.  Keeping this import local avoids any
  // alternate diagnostic quantizer.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return quantizeV2Filters(filters, bounds)
}

function ordinaryPrePolishStates(
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config,
): M4CandidateMetrics[] {
  const states: M4CandidateMetrics[] = []
  for (const parent of snapshot.parents) {
    const admitted = new Set(parent.admittedProposals.map(proposalKeyForComparison))
    for (const candidate of parent.prePolishCandidates) {
      if (admitted.size > 0 && !admitted.has(proposalKeyForComparison(candidate.proposal))) continue
      if (candidate.prePolish !== null) states.push(metricsFromPrePolish(candidate.prePolish))
    }
    if (parent.prePolishCandidates.length === 0) {
      for (const proposal of parent.admittedProposals) {
        const quantized = quantizeV2Filters(proposal.filters, bounds)
        const metrics = metricsFromState(stateFromFilters(quantized, snapshot, 'ordinary-pre-polish'))
        states.push({
          ...metrics,
          comparatorKey: q31ComparatorKey(metrics, Number.MAX_SAFE_INTEGER, semanticFilterKey(quantized)),
        })
      }
    }
  }
  return states
}

function ordinaryPolishedStates(snapshot: StructuralSearchGenerationSnapshot): SearchState[] {
  const states: SearchState[] = []
  for (const parent of snapshot.parents) {
    const admitted = new Set(parent.admittedProposals.map(proposalKeyForComparison))
    for (const candidate of parent.polishedCandidates) {
      if (admitted.size > 0 && !admitted.has(proposalKeyForComparison(candidate.proposal))) continue
      if (candidate.postPolish !== null) states.push({
        candidateId: candidate.postPolish.candidateId,
        filters: cloneFilters(candidate.postPolish.filters),
        rmseDb: candidate.postPolish.rmseDb,
        maxAbsDb: candidate.postPolish.maxAbsDb,
        cancellationScore: candidate.postPolish.cancellationScore,
      })
    }
  }
  return states
}

function snapshotState(state: StructuralSearchStateSnapshot): SearchState {
  return {
    candidateId: state.candidateId,
    filters: cloneFilters(state.filters),
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore,
  }
}

function parentLocalQ31Admission(
  parent: StructuralSearchGenerationSnapshot['parents'][number] | undefined,
  candidate: M4OracleCandidate,
  pre: M4CandidateMetrics,
  targetCount: number,
): { admissible: boolean | null; displacedProposalKey: string | null; reason: M4CandidateComparison['parentLocalQ31SelectionReason'] } {
  if (parent === undefined) return { admissible: null, displacedProposalKey: null, reason: 'parent-unavailable' }
  const ordinary = parent.prePolishCandidates
    .filter((entry) => entry.prePolish !== null)
    .map((entry) => ({
      proposal: entry.proposal,
      key: proposalKey(entry.proposal),
      rmseDb: entry.prePolish!.rmseDb,
      maxAbsDb: entry.prePolish!.maxAbsDb,
      filterCount: entry.prePolish!.filterCount,
      cancellationScore: entry.prePolish!.cancellationScore,
      lexicalRank: entry.prePolish!.lexicalRank,
    }))
  if (ordinary.length === 0) return { admissible: null, displacedProposalKey: null, reason: 'parent-unavailable' }
  const inserted = {
    proposal: candidate.proposal,
    key: proposalKey(candidate.proposal),
    rmseDb: pre.rmseDb,
    maxAbsDb: pre.maxAbsDb,
    filterCount: pre.filterCount,
    cancellationScore: pre.cancellationScore,
    lexicalRank: Number.MAX_SAFE_INTEGER,
  }
  const rank = (left: typeof inserted, right: typeof inserted) =>
    left.rmseDb - right.rmseDb || left.maxAbsDb - right.maxAbsDb || left.filterCount - right.filterCount ||
    left.cancellationScore - right.cancellationScore || left.lexicalRank - right.lexicalRank
  const selectedWithout = selectQuotaProposals(ordinary, [...ordinary].sort(rank), 6, 2, targetCount)
  const withCandidate = [...ordinary, inserted]
  const selectedWith = selectQuotaProposals(withCandidate, [...withCandidate].sort(rank), 6, 2, targetCount)
  const admissible = selectedWith.some((entry) => entry.key === inserted.key)
  const selectedWithKeys = new Set(selectedWith.map((entry) => entry.key))
  const displaced = selectedWithout.find((entry) => !selectedWithKeys.has(entry.key))
  return {
    admissible,
    displacedProposalKey: displaced?.key ?? null,
    reason: admissible ? 'q31-selected' : 'q31-rejected',
  }
}

function causalClass(input: {
  ordinaryGenerated: boolean
  parentLocalQ31Admissible: boolean | null
  semanticallyNovel: boolean
  exactBeamSurvives: boolean
  exactReferenceImproves: boolean
}): M4CausalClassification {
  if (input.ordinaryGenerated) return 'ORDINARY_ALREADY_GENERATED'
  if (input.parentLocalQ31Admissible !== true) return 'NOVEL_Q31_REJECTED'
  if (!input.semanticallyNovel) return 'VISITED_DUPLICATE'
  if (!input.exactBeamSurvives) return 'EXACT_BEAM_REJECTED'
  if (!input.exactReferenceImproves) return 'REFERENCE_NONIMPROVING'
  return 'ONLINE_FEASIBLE_ORACLE_WIN'
}

function proposalKeyForComparison(proposal: StructuralProposal): string {
  return JSON.stringify({
    mutation: proposal.mutation,
    filters: proposal.filters.map(({ id: _id, ...filter }) => filter),
  })
}

function leastDamageVictim(
  snapshot: StructuralSearchGenerationSnapshot,
  parent: readonly Filter[],
): Filter | undefined {
  const candidates = parent.map((filter, index) => {
    const state = stateFromFilters(parent.filter((_, candidateIndex) => candidateIndex !== index), snapshot, `m4-victim-${index}`)
    return { filter, state, index }
  })
  candidates.sort((left, right) =>
    compareKeys(referenceSelectorKey(left.state), referenceSelectorKey(right.state)) ||
    left.index - right.index ||
    left.filter.id.localeCompare(right.filter.id))
  return candidates[0]?.filter
}

function topologySubstitutions(
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config,
  baseCandidates: readonly M4OracleCandidate[],
): M4OracleCandidate[] {
  return baseCandidates.map((candidate) => {
    const parent = snapshot.parents.find((entry) => entry.parent.candidateId === candidate.parentCandidateId)?.parent.filters ?? snapshot.referenceBefore.filters
    if (parent.length === 0) return undefined
    const victim = leastDamageVictim(snapshot, parent)
    if (victim === undefined) return undefined
    const diff = structuralFilterDifference(parent, candidate.filters)
    const added = diff.added[0]
    if (added === undefined) return undefined
    const retained = parent.filter((filter) => filter.id !== victim.id)
    const replacement = {
      ...added,
      id: nextFilterId(retained, `m4-substitution-${candidate.family}`),
    }
    const proposal: StructuralProposal = {
      mutation: candidate.proposal.mutation === 'add-ls' || candidate.proposal.mutation === 'add-hs'
        ? candidate.proposal.mutation
        : 'add-pk',
      filters: [...retained, replacement].map((filter) => ({ ...filter })),
    }
    return candidateFromProposal(
      'O4_TOPOLOGY_SUBSTITUTION',
      proposal,
      'topology-substitution',
      bounds,
      victim.id,
      candidate.parentCandidateId,
    )
  }).filter((candidate): candidate is M4OracleCandidate => candidate !== undefined)
}

/** Deterministic first/every-N/final generation sampling rule, frozen before results. */
export function selectM4SnapshotGeneration(generation: number, isFinal = false): boolean {
  return generation === 0 || generation % M4_SNAPSHOT_STRIDE === 0 || isFinal
}

/** Construct only the bounded O1/O2/O3/O4 oracle alternatives. */
export function generateM4OracleCandidates(
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config,
): M4OracleCandidate[] {
  const direct = buildO1O2O3Candidates(snapshot, bounds)
  const all = [...direct, ...topologySubstitutions(snapshot, bounds, direct)]
  const seen = new Set<string>()
  const unique: M4OracleCandidate[] = []
  for (const candidate of all) {
    if (!finiteCandidate(candidate, bounds)) continue
    if (seen.has(candidate.semanticKey)) continue
    seen.add(candidate.semanticKey)
    unique.push(candidate)
  }
  return unique
}

function quantizedCandidate(
  candidate: M4OracleCandidate,
  bounds: StandardAutoEqV2Config,
): Filter[] {
  return quantizeV2Filters(candidate.filters, bounds)
}

function classifyCandidate(
  prePolishBeatsWorstOrdinary: boolean,
  polishedBeatsWorstOrdinary: boolean,
  wouldSurviveFrozenParetoBeam: boolean,
  improvesReference: boolean,
): M4FailureClassification {
  if (!prePolishBeatsWorstOrdinary) return 'PREPOLISH_REJECTED'
  if (!polishedBeatsWorstOrdinary) return 'POLISH_FAILURE'
  if (!wouldSurviveFrozenParetoBeam) return 'BEAM_REJECTED'
  if (!improvesReference) return 'REFERENCE_NONIMPROVING'
  return 'ORACLE_WIN'
}

function countByComparison(
  candidates: readonly M4CandidateComparison[],
  field: keyof Pick<M4CandidateComparison, 'prePolishBeatsWorstOrdinary' | 'prePolishBeatsBestOrdinary' | 'polishedBeatsWorstOrdinary' | 'polishedBeatsBestOrdinary' | 'wouldSurviveFrozenParetoBeam' | 'improvesReferenceRmse' | 'improvesReferenceMaxAbs' | 'improvesBoth' | 'topologySubstitutionWin'>,
): number {
  return candidates.filter((candidate) => candidate[field]).length
}

function mergeFamilyMetrics(target: M4FamilyMetrics, source: M4FamilyMetrics): void {
  target.familyLocalCandidateAbsence += source.familyLocalCandidateAbsence
  for (const key of [
    'candidatesGenerated',
    'semanticDuplicatesRejected',
    'validCandidates',
    'prePolishCandidatesBeatingWorstOrdinary',
    'prePolishCandidatesBeatingBestOrdinary',
    'polishedCandidatesBeatingWorstOrdinary',
    'polishedCandidatesBeatingBestOrdinary',
    'candidatesWouldSurviveFrozenParetoBeam',
    'candidatesImprovingReferenceRmse',
    'candidatesImprovingReferenceMaxAbs',
    'candidatesImprovingBoth',
    'topologySubstitutionWins',
  ] as const) target[key] += source[key]
  for (const classification of Object.keys(target.classifications) as M4FailureClassification[]) {
    target.classifications[classification] += source.classifications[classification]
  }
}

function trajectorySamplingAdequate(
  generations: readonly number[],
  terminalGeneration: number | null,
): boolean {
  if (terminalGeneration === null) return false
  const unique = [...new Set(generations)].sort((left, right) => left - right)
  return unique.includes(0) &&
    unique.includes(terminalGeneration) &&
    unique.length >= M4_DECISION_RULE.requiredSnapshotPhases &&
    unique.some((generation) => generation > 0 && generation < terminalGeneration && generation % M4_SNAPSHOT_STRIDE === 0)
}

function buildTrajectoryCoverage(
  observations: readonly M4SnapshotObservation[],
  family: 'real' | 'synthetic',
): M4TrajectoryCoverage[] {
  const rows = observations.filter((observation) => observation.family === family)
  const grouped = new Map<string, M4SnapshotObservation[]>()
  for (const row of rows) {
    const key = `${row.caseId}|${row.repeatIndex}`
    const group = grouped.get(key) ?? []
    group.push(row)
    grouped.set(key, group)
  }
  return [...grouped.values()].map((group) => {
    const ordered = [...group].sort((left, right) => left.snapshot.generation - right.snapshot.generation)
    const capturedGenerations = [...new Set(ordered.map((row) => row.snapshot.generation))].sort((left, right) => left - right)
    const finalRow = ordered.find((row) => row.isFinal)
    const terminalGeneration = finalRow?.terminalGeneration ?? ordered.at(-1)?.terminalGeneration ?? capturedGenerations.at(-1) ?? null
    const terminalReason: M4TrajectoryCoverage['terminalReason'] = finalRow?.terminalReason ?? ordered.at(-1)?.terminalReason ?? 'unknown'
    return {
      caseId: ordered[0]!.caseId,
      ...(ordered[0]!.caseLabel === undefined ? {} : { caseLabel: ordered[0]!.caseLabel }),
      family,
      split: ordered[0]!.split,
      repeatIndex: ordered[0]!.repeatIndex,
      capturedGenerations,
      terminalGeneration,
      terminalReason,
      samplingAdequate: trajectorySamplingAdequate(capturedGenerations, terminalGeneration),
      fingerprint: hashM4Evidence(ordered.map((row) => ({ snapshot: row.snapshot, result: row.result }))),
    }
  }).sort((left, right) => left.caseId.localeCompare(right.caseId) || left.repeatIndex - right.repeatIndex)
}

function buildRepeatIdentityByCase(
  trajectories: readonly M4TrajectoryCoverage[],
): Record<string, M4RepeatIdentity> {
  const grouped = new Map<string, M4TrajectoryCoverage[]>()
  for (const trajectory of trajectories) {
    const group = grouped.get(trajectory.caseId) ?? []
    group.push(trajectory)
    grouped.set(trajectory.caseId, group)
  }
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([caseId, group]) => {
    const ordered = [...group].sort((left, right) => left.repeatIndex - right.repeatIndex)
    const trajectoryFingerprints = ordered.map((trajectory) => trajectory.fingerprint)
    return [caseId, {
      caseId,
      repeatCount: ordered.length,
      identical: new Set(trajectoryFingerprints).size <= 1,
      trajectoryFingerprints,
    } satisfies M4RepeatIdentity]
  })) as Record<string, M4RepeatIdentity>
}

function buildWinLocations(
  observations: readonly M4SnapshotObservation[],
  family: 'real' | 'synthetic',
): M4WinLocation[] {
  return observations
    .filter((observation) => observation.family === family)
    .flatMap((observation) => {
      const wins = observation.result.candidates.filter((candidate) => candidate.classification === 'ORACLE_WIN')
      if (wins.length === 0) return []
      const phase: M4WinLocation['phase'] = observation.isFinal
        ? 'final'
        : observation.snapshot.generation === 0
          ? 'first'
          : observation.snapshot.generation % M4_SNAPSHOT_STRIDE === 0
            ? 'middle'
            : 'unscheduled'
      return [{
        caseId: observation.caseId,
        ...(observation.caseLabel === undefined ? {} : { caseLabel: observation.caseLabel }),
        split: observation.split,
        repeatIndex: observation.repeatIndex,
        generation: observation.snapshot.generation,
        phase,
        families: [...new Set(wins.map((candidate) => candidate.family))].sort(),
        oracleWinCount: wins.length,
        prePolishQualifiedWins: wins.filter((candidate) => candidate.prePolishBeatsWorstOrdinary).length,
        polishedEmergentWins: wins.filter((candidate) => !candidate.prePolishBeatsWorstOrdinary).length,
      } satisfies M4WinLocation]
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId) ||
      left.repeatIndex - right.repeatIndex || left.generation - right.generation)
}

/** Evaluate one immutable baseline snapshot; no search state is mutated. */
export function evaluateM4GenerationSnapshot(
  snapshot: StructuralSearchGenerationSnapshot,
  bounds: StandardAutoEqV2Config = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 10 }),
  options: { localPolishEvaluations?: number; beamWidth?: number; proposalsPerParent: number },
): M4GenerationOracleResult {
  const beamWidth = options.beamWidth ?? 4
  const basePolishEvaluations = options.localPolishEvaluations ?? 24
  const rawDirect = buildO1O2O3Candidates(snapshot, bounds)
  const rawCandidates = [...rawDirect, ...topologySubstitutions(snapshot, bounds, rawDirect)]
  const candidates = generateM4OracleCandidates(snapshot, bounds)
  const semanticDuplicatesRejected = rawCandidates.length - candidates.length
  const ordinaryPre = ordinaryPrePolishStates(snapshot, bounds)
  const ordinaryPolished = ordinaryPolishedStates(snapshot)
  const ordinaryPreFallback = ordinaryPre.length > 0 ? ordinaryPre : [metricsFromSnapshot(snapshot.referenceBefore)]
  const ordinaryPolishedFallback = ordinaryPolished.length > 0 ? ordinaryPolished : [
    {
      candidateId: snapshot.referenceBefore.candidateId,
      filters: cloneFilters(snapshot.referenceBefore.filters),
      rmseDb: snapshot.referenceBefore.rmseDb,
      maxAbsDb: snapshot.referenceBefore.maxAbsDb,
      cancellationScore: snapshot.referenceBefore.cancellationScore,
    },
  ]
  const sortedPre = [...ordinaryPreFallback].sort((left, right) => compareKeys(left.comparatorKey, right.comparatorKey))
  const bestPre = sortedPre[0]!
  const worstPre = sortedPre.at(-1)!
  const sortedPolished = [...ordinaryPolishedFallback].sort((left, right) =>
    compareKeys(referenceSelectorKey(left), referenceSelectorKey(right)))
  const bestPolished = sortedPolished[0]!
  const worstPolished = sortedPolished.at(-1)!
  const familyCandidates = emptyFamilyMetricsRecord()
  const comparisons: M4CandidateComparison[] = []
  const rawCounts = emptyFamilyMetricsRecord()
  for (const rawCandidate of rawCandidates) rawCounts[rawCandidate.family].candidatesGenerated += 1
  for (const [index, candidate] of candidates.entries()) {
    const quantized = quantizedCandidate(candidate, bounds)
    if (!finiteCandidate({ ...candidate, filters: quantized }, bounds)) continue
    const preBase = metricsFromState(stateFromFilters(quantized, snapshot, `m4-pre-${index}`))
    const pre = {
      ...preBase,
      // An oracle has no lexical admission rank.  Use the conservative tail
      // rank so exact metric ties cannot be reported as a pre-polish win.
      comparatorKey: q31ComparatorKey(preBase, Number.MAX_SAFE_INTEGER, candidate.semanticKey),
    }
    const polished = polishFilters(
      quantized,
      localPolishEvaluationBudget(basePolishEvaluations, quantized.length),
      bounds,
      snapshot.desiredDb,
      snapshot.frequencies,
      { isExpired: () => false },
      snapshot.sampleRateHz,
    )
    polished.candidateId = `m4:${candidate.family}:${index}`
    const polishedMetrics = metricsFromState(polished)
    const preBeatsWorst = compareKeys(pre.comparatorKey, worstPre.comparatorKey) < 0
    const preBeatsBest = compareKeys(pre.comparatorKey, bestPre.comparatorKey) < 0
    const polishedBeatsWorst = compareKeys(referenceSelectorKey(polished), referenceSelectorKey(worstPolished)) < 0
    const polishedBeatsBest = compareKeys(referenceSelectorKey(polished), referenceSelectorKey(bestPolished)) < 0
    const beamStates = retainParetoBeam([
      ...snapshot.beamBefore.map((state) => ({
        candidateId: state.candidateId,
        filters: cloneFilters(state.filters),
        rmseDb: state.rmseDb,
        maxAbsDb: state.maxAbsDb,
        cancellationScore: state.cancellationScore,
      })),
      ...ordinaryPolished,
      polished,
    ], beamWidth)
    const wouldSurvive = beamStates.some((state) => state.candidateId === polished.candidateId)
    const improvesReferenceRmse = polished.rmseDb < snapshot.referenceAfter.rmseDb - 1e-12
    const improvesReferenceMaxAbs = polished.maxAbsDb < snapshot.referenceAfter.maxAbsDb - 1e-12
    const improvesBoth = improvesReferenceRmse && improvesReferenceMaxAbs
    const improvesReference = compareKeys(referenceSelectorKey(polished), snapshot.referenceAfter.comparatorKey) < 0
    const classification = classifyCandidate(preBeatsWorst, polishedBeatsWorst, wouldSurvive, improvesReference)
    const parent = snapshot.parents.find((entry) => entry.parent.candidateId === candidate.parentCandidateId)
    const ordinaryGenerated = parent?.generatedProposals.some((proposal) =>
      semanticFilterKey(proposal.filters) === candidate.semanticKey) ?? false
    const ordinaryAdmitted = parent?.admittedProposals.some((proposal) =>
      semanticFilterKey(proposal.filters) === candidate.semanticKey) ?? false
    const q31 = parentLocalQ31Admission(parent, candidate, pre, options.proposalsPerParent)
    const polishedSemanticKey = semanticFilterKey(polished.filters)
    const visitedBeforeGeneration = snapshot.visitedSemanticKeysBefore.includes(polishedSemanticKey)
    const duplicatesOrdinaryNextState = snapshot.nextStates.some((state) => state.semanticKey === polishedSemanticKey)
    const semanticallyNovel = !visitedBeforeGeneration && !duplicatesOrdinaryNextState
    const exactBeam = retainParetoBeam([
      ...snapshot.beamBefore.map(snapshotState),
      ...snapshot.nextStates.map(snapshotState),
      polished,
    ], beamWidth)
    const exactBeamSurvives = exactBeam.some((state) => state.candidateId === polished.candidateId)
    const exactReference = selectReferencePoint(exactBeam)
    const exactReferenceImproves = compareKeys(referenceSelectorKey(exactReference), snapshot.referenceAfter.comparatorKey) < 0
    const causalClassification = causalClass({
      ordinaryGenerated,
      parentLocalQ31Admissible: q31.admissible,
      semanticallyNovel,
      exactBeamSurvives,
      exactReferenceImproves,
    })
    const comparison: M4CandidateComparison = {
      candidateId: `m4:${candidate.family}:${index}`,
      family: candidate.family,
      semanticKey: candidate.semanticKey,
      prePolish: pre,
      polished: polishedMetrics,
      prePolishBeatsWorstOrdinary: preBeatsWorst,
      prePolishBeatsBestOrdinary: preBeatsBest,
      polishedBeatsWorstOrdinary: polishedBeatsWorst,
      polishedBeatsBestOrdinary: polishedBeatsBest,
      wouldSurviveFrozenParetoBeam: wouldSurvive,
      enteredBaselineBeam: false,
      improvesReferenceRmse,
      improvesReferenceMaxAbs,
      improvesBoth,
      topologySubstitutionWin: candidate.family === 'O4_TOPOLOGY_SUBSTITUTION' && classification === 'ORACLE_WIN',
      classification,
      causalClassification,
      ordinaryGenerated,
      ordinaryAdmitted,
      parentLocalQ31Admissible: q31.admissible,
      parentLocalQ31DisplacedProposalKey: q31.displacedProposalKey,
      parentLocalQ31SelectionReason: ordinaryGenerated ? 'ordinary-generated' : q31.reason,
      visitedBeforeGeneration,
      duplicatesOrdinaryNextState,
      semanticallyNovel,
      exactBeamSurvives,
      exactReferenceImproves,
      work: {
        polishEvaluationBudget: localPolishEvaluationBudget(basePolishEvaluations, quantized.length),
        coordinateTrials: polished.coordinateTrials ?? 0,
        quantizedFilterCount: quantized.length,
      },
    }
    comparisons.push(comparison)
    const family = familyCandidates[candidate.family]
    family.validCandidates += 1
    family.prePolishCandidatesBeatingWorstOrdinary += Number(preBeatsWorst)
    family.prePolishCandidatesBeatingBestOrdinary += Number(preBeatsBest)
    family.polishedCandidatesBeatingWorstOrdinary += Number(polishedBeatsWorst)
    family.polishedCandidatesBeatingBestOrdinary += Number(polishedBeatsBest)
    family.candidatesWouldSurviveFrozenParetoBeam += Number(wouldSurvive)
    family.candidatesImprovingReferenceRmse += Number(improvesReferenceRmse)
    family.candidatesImprovingReferenceMaxAbs += Number(improvesReferenceMaxAbs)
    family.candidatesImprovingBoth += Number(improvesBoth)
    family.topologySubstitutionWins += Number(comparison.topologySubstitutionWin)
    family.classifications[classification] += 1
  }
  for (const family of M4_ORACLE_FAMILIES) {
    familyCandidates[family].candidatesGenerated = rawCounts[family].candidatesGenerated
    familyCandidates[family].semanticDuplicatesRejected = Math.max(
      0,
      rawCounts[family].candidatesGenerated - candidates.filter((candidate) => candidate.family === family).length,
    )
    if (rawCounts[family].candidatesGenerated === 0) {
      familyCandidates[family].familyLocalCandidateAbsence += 1
      familyCandidates[family].classifications.NO_STRUCTURAL_CANDIDATE += 1
    }
  }

  const decomposition = EMPTY_CLASSIFICATIONS()
  for (const comparison of comparisons) decomposition[comparison.classification] += 1
  if (candidates.length === 0) decomposition.NO_STRUCTURAL_CANDIDATE += 1
  const metrics = {
    candidatesGenerated: rawCandidates.length,
    semanticDuplicatesRejected,
    validCandidates: comparisons.length,
    prePolishCandidatesBeatingWorstOrdinary: countByComparison(comparisons, 'prePolishBeatsWorstOrdinary'),
    prePolishCandidatesBeatingBestOrdinary: countByComparison(comparisons, 'prePolishBeatsBestOrdinary'),
    polishedCandidatesBeatingWorstOrdinary: countByComparison(comparisons, 'polishedBeatsWorstOrdinary'),
    polishedCandidatesBeatingBestOrdinary: countByComparison(comparisons, 'polishedBeatsBestOrdinary'),
    candidatesWouldSurviveFrozenParetoBeam: countByComparison(comparisons, 'wouldSurviveFrozenParetoBeam'),
    candidatesImprovingReferenceRmse: countByComparison(comparisons, 'improvesReferenceRmse'),
    candidatesImprovingReferenceMaxAbs: countByComparison(comparisons, 'improvesReferenceMaxAbs'),
    candidatesImprovingBoth: countByComparison(comparisons, 'improvesBoth'),
    topologySubstitutionWins: countByComparison(comparisons, 'topologySubstitutionWin'),
    casesRepeatsGenerationsWithCompetitiveCandidate: Number(comparisons.some((candidate) => candidate.prePolishBeatsWorstOrdinary)),
  }
  return {
    generation: snapshot.generation,
    baselineResult: {
      referenceBefore: metricsFromSnapshot(snapshot.referenceBefore),
      referenceAfter: metricsFromSnapshot(snapshot.referenceAfter),
      retainedBeamCutoff: snapshot.retainedBeam.at(-1) === undefined ? null : metricsFromSnapshot(snapshot.retainedBeam.at(-1)!),
    },
    candidates: comparisons,
    metrics,
    byFamily: familyCandidates,
    decomposition,
  }
}

function mergeResultsIntoGroup(
  observations: readonly M4SnapshotObservation[],
  family: 'real' | 'synthetic',
): M4AggregateGroup {
  const rows = observations.filter((observation) => observation.family === family)
  const byFamily = emptyFamilyMetricsRecord()
  const decomposition = EMPTY_CLASSIFICATIONS()
  for (const row of rows) {
    for (const oracleFamily of M4_ORACLE_FAMILIES) mergeFamilyMetrics(byFamily[oracleFamily], row.result.byFamily[oracleFamily])
    for (const classification of Object.keys(decomposition) as M4FailureClassification[]) decomposition[classification] += row.result.decomposition[classification]
  }
  const competitiveRows = rows.filter((row) => row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN'))
  const caseIds = new Set(rows.map((row) => row.caseId))
  const repeats = new Set(rows.map((row) => `${row.caseId}|${row.repeatIndex}`))
  const competitiveRepeats = new Set(competitiveRows.map((row) => `${row.caseId}|${row.repeatIndex}`))
  const trajectoryCoverage = buildTrajectoryCoverage(rows, family)
  const winLocations = buildWinLocations(rows, family)
  return {
    family,
    snapshotCount: rows.length,
    caseCount: caseIds.size,
    repeatCount: repeats.size,
    generationCount: new Set(rows.map((row) => `${row.caseId}|${row.repeatIndex}|${row.snapshot.generation}`)).size,
    competitiveCaseCount: new Set(competitiveRows.map((row) => row.caseId)).size,
    competitiveRepeatCount: competitiveRepeats.size,
    competitiveGenerationCount: competitiveRows.length,
    winsByCase: [...new Set(competitiveRows.map((row) => row.caseId))].sort(),
    trajectoryCoverage,
    repeatIdentityByCase: buildRepeatIdentityByCase(trajectoryCoverage),
    winLocations,
    byFamily,
    generationGlobalDecomposition: decomposition,
    decomposition,
  }
}

function emptyCausalFamilyTotals(): M4CausalFamilyTotals {
  return {
    historicalOracleWin: 0, ordinaryGeneratedDuplicates: 0,
    ordinaryGeneratedNotAdmittedDuplicates: 0, ordinaryAdmittedDuplicates: 0,
    novelCandidates: 0, parentLocalQ31Admissible: 0, visitedDuplicates: 0,
    exactBeamSurvivors: 0, exactReferenceImprovers: 0, onlineFeasibleOracleWin: 0,
  }
}

function causalCloseout(observations: readonly M4SnapshotObservation[]): M4CausalCloseout {
  const all = observations
  const families = () => Object.fromEntries(M4_ORACLE_FAMILIES.map((family) => [family, emptyCausalFamilyTotals()])) as Record<M4OracleFamily, M4CausalFamilyTotals>
  const classifications = () => Object.fromEntries([
    'ORDINARY_ALREADY_GENERATED', 'NOVEL_Q31_REJECTED', 'VISITED_DUPLICATE', 'EXACT_BEAM_REJECTED', 'REFERENCE_NONIMPROVING', 'ONLINE_FEASIBLE_ORACLE_WIN',
  ].map((key) => [key, 0])) as Record<M4CausalClassification, number>
  const summarize = (rows: readonly M4SnapshotObservation[]) => {
    const byFamily = families()
    const totals = classifications()
    for (const row of rows) for (const candidate of row.result.candidates) {
      if (candidate.classification !== 'ORACLE_WIN') continue
      const target = byFamily[candidate.family]
      target.historicalOracleWin += 1
      target.ordinaryGeneratedDuplicates += Number(candidate.ordinaryGenerated)
      target.ordinaryGeneratedNotAdmittedDuplicates += Number(
        candidate.ordinaryGenerated && !candidate.ordinaryAdmitted,
      )
      target.ordinaryAdmittedDuplicates += Number(
        candidate.ordinaryGenerated && candidate.ordinaryAdmitted,
      )
      target.novelCandidates += Number(!candidate.ordinaryGenerated)
      target.parentLocalQ31Admissible += Number(candidate.parentLocalQ31Admissible === true)
      target.visitedDuplicates += Number(!candidate.semanticallyNovel)
      target.exactBeamSurvivors += Number(candidate.exactBeamSurvives)
      target.exactReferenceImprovers += Number(candidate.exactReferenceImproves)
      target.onlineFeasibleOracleWin += Number(candidate.causalClassification === 'ONLINE_FEASIBLE_ORACLE_WIN')
      totals[candidate.causalClassification] += 1
    }
    return { byFamily, totals }
  }
  const protocol = summarize(all)
  // Corrected M4 has byte-identical repeats; repeat 0 is the predeclared
  // deterministic representative.  De-duplicate by case×generation before
  // computing the feasibility gate so protocol multiplicity cannot inflate it.
  const deterministicRows = [...new Map([...all]
    .filter((row) => row.repeatIndex === 0)
    .sort((left, right) => left.caseId.localeCompare(right.caseId) ||
      left.snapshot.generation - right.snapshot.generation)
    .map((row) => [`${row.caseId}|${row.snapshot.generation}`, row] as const)).values()]
  const deterministic = summarize(deterministicRows)
  const online = deterministicRows.filter((row) => row.family === 'real').flatMap((row) => row.result.candidates
    .filter((candidate) => candidate.classification === 'ORACLE_WIN' && candidate.causalClassification === 'ONLINE_FEASIBLE_ORACLE_WIN')
    .map((candidate) => ({ caseId: row.caseId, generation: row.snapshot.generation, family: candidate.family, split: row.split })))
  const cells = new Set(online.map((row) => `${row.caseId}|${row.generation}`))
  const developmentCases = new Set(online.filter((row) => row.split === 'development').map((row) => row.caseId)).size
  const holdoutCases = new Set(online.filter((row) => row.split === 'holdout').map((row) => row.caseId)).size
  const overallCases = new Set(online.map((row) => row.caseId)).size
  const conclusion = deterministicRows.every((row) => row.family !== 'real') ? 'INCONCLUSIVE' :
    developmentCases >= 2 && holdoutCases >= 2 && overallCases >= 4 && cells.size >= 2
      ? 'ONLINE_STRUCTURAL_INJECTION_SUPPORTED' : 'ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED'
  return {
    protocolCount: protocol.byFamily,
    deterministicCount: deterministic.byFamily,
    classificationTotals: protocol.totals,
    deterministicClassificationTotals: deterministic.totals,
    onlineCoverage: { developmentCases, holdoutCases, overallCases, distinctCaseGenerationCells: cells.size, conclusion },
    onlineLocations: [...new Map(online.map((row) => [`${row.caseId}|${row.generation}|${row.family}`, row])).values()]
      .map(({ caseId, generation, family }) => ({ caseId, generation, family }))
      .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.generation - right.generation || left.family.localeCompare(right.family)),
  }
}

function decideM4(
  observations: readonly M4SnapshotObservation[],
  aggregate: { real: M4AggregateGroup; synthetic: M4AggregateGroup },
): M4DecisionBoundary {
  const realRows = observations.filter((row) => row.family === 'real')
  const developmentWinningCases = new Set(realRows.filter((row) => row.split === 'development' && row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN')).map((row) => row.caseId)).size
  const holdoutWinningCases = new Set(realRows.filter((row) => row.split === 'holdout' && row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN')).map((row) => row.caseId)).size
  const overallWinningCases = new Set(realRows.filter((row) => row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN')).map((row) => row.caseId)).size
  const winningRepeats = new Set(realRows.filter((row) => row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN')).map((row) => `${row.caseId}|${row.repeatIndex}`)).size
  const winningGenerations = realRows.filter((row) => row.result.candidates.some((candidate) => candidate.classification === 'ORACLE_WIN')).length
  const missingInformation: string[] = []
  const realRuns = aggregate.real.trajectoryCoverage
  const adequatelySampledRuns = realRuns.filter((trajectory) => trajectory.samplingAdequate).length
  const samplingAdequate = realRuns.length >= M4_DECISION_RULE.requiredRealCaseCount * M4_DECISION_RULE.requiredRealRepeatCount &&
    adequatelySampledRuns === realRuns.length
  const coverage = realRows.length > 0 && aggregate.real.generationCount > 0
  if (!coverage) missingInformation.push('real snapshot coverage is empty')
  if (!samplingAdequate) {
    const inadequate = realRuns.filter((trajectory) => !trajectory.samplingAdequate)
      .map((trajectory) => `${trajectory.caseId}#${trajectory.repeatIndex}=[${trajectory.capturedGenerations.join(',')}]`)
    missingInformation.push(`real sampling lacks first/middle/final snapshots for ${inadequate.length} trajectories${inadequate.length === 0 ? '' : `: ${inadequate.join('; ')}`}`)
  }
  const meaningful = coverage &&
    samplingAdequate &&
    developmentWinningCases >= M4_DECISION_RULE.minimumDevelopmentWinningCases &&
    holdoutWinningCases >= M4_DECISION_RULE.minimumHoldoutWinningCases &&
    overallWinningCases >= M4_DECISION_RULE.minimumOverallWinningCases &&
    winningRepeats > 1 &&
    winningGenerations > 1
  const enoughToReject = coverage && aggregate.real.byFamily.O1_RESIDUAL_EXTREMUM_PK.validCandidates +
    aggregate.real.byFamily.O2_RESIDUAL_REGION_PK.validCandidates +
    aggregate.real.byFamily.O3_SHELF_EVIDENCE.validCandidates > 0
  let conclusion: M4Conclusion
  if (meaningful) conclusion = 'STRUCTURAL_CANDIDATE_SIGNAL_SUPPORTED'
  else if (!samplingAdequate || !coverage) conclusion = 'INCONCLUSIVE'
  else if (enoughToReject) conclusion = 'STRUCTURAL_CANDIDATE_SIGNAL_NOT_SUPPORTED'
  else {
    conclusion = 'INCONCLUSIVE'
    if (!enoughToReject) missingInformation.push('no valid real structural candidates were evaluated')
  }
  return {
    conclusion,
    rule: M4_DECISION_RULE,
    developmentWinningCases,
    holdoutWinningCases,
    overallWinningCases,
    winningRepeats,
    winningGenerations,
    samplingAdequate,
    candidateCoverageSufficient: coverage && samplingAdequate,
    missingInformation,
  }
}

export function aggregateM4OracleEvidence(
  observations: readonly M4SnapshotObservation[],
): M4AggregateEvidence {
  const real = mergeResultsIntoGroup(observations, 'real')
  const synthetic = mergeResultsIntoGroup(observations, 'synthetic')
  const byFamily = emptyFamilyMetricsRecord()
  const decomposition = EMPTY_CLASSIFICATIONS()
  for (const group of [real, synthetic]) {
    for (const family of M4_ORACLE_FAMILIES) mergeFamilyMetrics(byFamily[family], group.byFamily[family])
    for (const classification of Object.keys(decomposition) as M4FailureClassification[]) decomposition[classification] += group.decomposition[classification]
  }
  return {
    real,
    synthetic,
    byFamily,
    generationGlobalDecomposition: decomposition,
    decomposition,
    decisionBoundary: decideM4(observations, { real, synthetic }),
    causalCloseout: causalCloseout(observations),
  }
}

export function hashM4Evidence(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

const M4_FAMILY_METRIC_ROWS: readonly [string, keyof M4FamilyMetrics][] = [
  ['generated', 'candidatesGenerated'],
  ['semantic duplicates', 'semanticDuplicatesRejected'],
  ['valid', 'validCandidates'],
  ['pre-polish beats worst admitted', 'prePolishCandidatesBeatingWorstOrdinary'],
  ['pre-polish beats best ordinary', 'prePolishCandidatesBeatingBestOrdinary'],
  ['polished beats worst ordinary', 'polishedCandidatesBeatingWorstOrdinary'],
  ['polished beats best ordinary', 'polishedCandidatesBeatingBestOrdinary'],
  ['would survive frozen beam', 'candidatesWouldSurviveFrozenParetoBeam'],
  ['improves reference RMSE', 'candidatesImprovingReferenceRmse'],
  ['improves reference maxAbs', 'candidatesImprovingReferenceMaxAbs'],
  ['improves both', 'candidatesImprovingBoth'],
  ['topology-substitution wins', 'topologySubstitutionWins'],
  ['family-local absence', 'familyLocalCandidateAbsence'],
]

const M4_CLASSIFICATION_ROWS: readonly [string, M4FailureClassification][] = [
  ['PREPOLISH_REJECTED', 'PREPOLISH_REJECTED'],
  ['POLISH_FAILURE', 'POLISH_FAILURE'],
  ['BEAM_REJECTED', 'BEAM_REJECTED'],
  ['REFERENCE_NONIMPROVING', 'REFERENCE_NONIMPROVING'],
  ['ORACLE_WIN', 'ORACLE_WIN'],
]

function renderFamilyMetricsTable(group: M4AggregateGroup): string[] {
  const lines = [
    `### ${group.family} per-family census`,
    '',
    'Candidate-stage metrics use candidate-event denominators (generated, deduplicated, or valid as applicable). Family-local absence is one count per snapshot and is not the generation-global absence denominator.',
    '',
    `| metric | ${M4_ORACLE_FAMILIES.join(' | ')} |`,
    `| --- | ${M4_ORACLE_FAMILIES.map(() => '---').join(' | ')} |`,
  ]
  for (const [label, key] of M4_FAMILY_METRIC_ROWS) {
    lines.push(`| ${label} | ${M4_ORACLE_FAMILIES.map((family) => String(group.byFamily[family][key] as number)).join(' | ')} |`)
  }
  for (const [label, classification] of M4_CLASSIFICATION_ROWS) {
    lines.push(`| ${label} | ${M4_ORACLE_FAMILIES.map((family) => String(group.byFamily[family].classifications[classification])).join(' | ')} |`)
  }
  return lines
}

function renderGenerationGlobalDecomposition(group: M4AggregateGroup): string[] {
  const decomposition = group.generationGlobalDecomposition ?? group.decomposition
  const candidateEvents = Object.entries(decomposition)
    .filter(([classification]) => classification !== 'NO_STRUCTURAL_CANDIDATE')
    .reduce((total, [, count]) => total + count, 0)
  return [
    `### ${group.family} generation-global decomposition`,
    '',
    `Denominator: ${group.snapshotCount} captured snapshot generations. \`NO_STRUCTURAL_CANDIDATE\` counts generations with no valid candidate across O1–O4 (${decomposition.NO_STRUCTURAL_CANDIDATE}); the remaining stages are candidate-event counts (${candidateEvents}) and therefore are not the same denominator.`,
    '',
    `- ${Object.entries(decomposition).map(([key, value]) => `${key}=${value}`).join('; ')}`,
  ]
}

function renderTrajectoryCoverage(group: M4AggregateGroup): string[] {
  const lines = [
    `### ${group.family} trajectory sampling`,
    '',
    '| case | repeat | captured generations | terminal | adequacy |',
    '| --- | ---: | --- | --- | --- |',
  ]
  for (const trajectory of group.trajectoryCoverage) {
    const label = trajectory.caseLabel ?? trajectory.caseId
    const terminal = trajectory.terminalGeneration === null
      ? 'unknown'
      : `${trajectory.terminalGeneration} (${trajectory.terminalReason})`
    lines.push(`| ${label} | ${trajectory.repeatIndex + 1} | ${trajectory.capturedGenerations.join(', ')} | ${terminal} | ${trajectory.samplingAdequate ? 'yes' : 'no'} |`)
  }
  if (group.trajectoryCoverage.length === 0) lines.push('| none | — | — | — | no |')
  return lines
}

function renderRepeatIdentity(group: M4AggregateGroup): string[] {
  const lines = [
    `### ${group.family} deterministic repeat identity`,
    '',
    'Repeat outputs are compared as trajectory fingerprints. Identical deterministic repeats remain protocol repeats, not independent replication evidence.',
    '',
  ]
  const entries = Object.values(group.repeatIdentityByCase).sort((left, right) => left.caseId.localeCompare(right.caseId))
  if (entries.length === 0) return [...lines, '- none']
  for (const entry of entries) {
    lines.push(`- ${entry.caseId}: ${entry.identical ? 'identical' : 'different'} across ${entry.repeatCount} repeats.`)
  }
  return lines
}

function dominantFailureStage(group: M4AggregateGroup): string {
  const decomposition = group.generationGlobalDecomposition ?? group.decomposition
  const stages: Array<[string, number]> = [
    ['admission', decomposition.PREPOLISH_REJECTED],
    ['polish', decomposition.POLISH_FAILURE],
    ['beam retention', decomposition.BEAM_REJECTED],
    ['reference selection', decomposition.REFERENCE_NONIMPROVING],
  ]
  stages.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  return `${stages[0]![0]} (${stages[0]![1]})`
}

function renderWinLocalization(group: M4AggregateGroup): string[] {
  const familyWins = M4_ORACLE_FAMILIES
    .map((family) => `${family}=${group.byFamily[family].classifications.ORACLE_WIN}`)
    .join('; ')
  const locations = group.winLocations.map((location) =>
    `${location.caseLabel ?? location.caseId}#${location.repeatIndex + 1}@g${location.generation}/${location.phase}[${location.families.join(', ')}]`,
  )
  const prePolishQualifiedWins = group.winLocations.reduce((total, location) => total + location.prePolishQualifiedWins, 0)
  const polishedEmergentWins = group.winLocations.reduce((total, location) => total + location.polishedEmergentWins, 0)
  return [
    `### ${group.family} result localization`,
    '',
    `- ORACLE_WIN by family: ${familyWins}.`,
    `- Win locations (case/repeat/generation/phase): ${locations.length === 0 ? 'none' : locations.join('; ')}.`,
    `- Pre-polish-qualified wins: ${prePolishQualifiedWins}; wins emerging only after equal-work polish: ${polishedEmergentWins}.`,
    `- Candidate-stage failure counts are descriptive only; the largest losing class (${dominantFailureStage(group)}) is not treated as an architectural bottleneck.`,
  ]
}

function renderCausalRecommendation(closeout: M4CausalCloseout): string {
  const deterministic = closeout.deterministicCount
  const ordinaryAdmitted = M4_ORACLE_FAMILIES.reduce(
    (total, family) => total + deterministic[family].ordinaryAdmittedDuplicates,
    0,
  )
  const ordinaryNotAdmitted = M4_ORACLE_FAMILIES.reduce(
    (total, family) => total + deterministic[family].ordinaryGeneratedNotAdmittedDuplicates,
    0,
  )
  const novel = M4_ORACLE_FAMILIES.reduce(
    (total, family) => total + deterministic[family].novelCandidates,
    0,
  )
  const q31Rejected = deterministicClassificationCount(
    closeout.deterministicClassificationTotals,
    'NOVEL_Q31_REJECTED',
  )
  return `- Architectural recommendation: keep the oracle shadow-only and do not start M5 or authorize online structural injection. De-duplicated useful fates are ${novel} novel candidates (${q31Rejected} q31-rejected), ${ordinaryAdmitted} ordinary-generated-and-admitted duplicates, and ${ordinaryNotAdmitted} ordinary-generated-but-not-admitted duplicates; no useful candidate was localized to visited, exact-beam, or reference rejection. The online gate remains ${closeout.onlineCoverage.conclusion} (${closeout.onlineCoverage.developmentCases}/3 development, ${closeout.onlineCoverage.holdoutCases}/3 holdout, ${closeout.onlineCoverage.overallCases}/6 overall, ${closeout.onlineCoverage.distinctCaseGenerationCells} case×generation cells).`
}

function deterministicClassificationCount(
  totals: Record<M4CausalClassification, number>,
  classification: M4CausalClassification,
): number {
  return totals[classification]
}

function renderCausalFamilyTable(
  label: string,
  values: Record<M4OracleFamily, M4CausalFamilyTotals>,
): string[] {
  const rows: Array<[string, keyof M4CausalFamilyTotals]> = [
    ['historical ORACLE_WIN', 'historicalOracleWin'],
    ['ordinary-generated duplicates', 'ordinaryGeneratedDuplicates'],
    ['ordinary-generated + admitted', 'ordinaryAdmittedDuplicates'],
    ['ordinary-generated + not admitted', 'ordinaryGeneratedNotAdmittedDuplicates'],
    ['novel candidates', 'novelCandidates'],
    ['parent-local q31-admissible', 'parentLocalQ31Admissible'],
    ['visited duplicates', 'visitedDuplicates'],
    ['exact beam survivors', 'exactBeamSurvivors'],
    ['exact reference improvers', 'exactReferenceImprovers'],
    ['ONLINE_FEASIBLE_ORACLE_WIN', 'onlineFeasibleOracleWin'],
  ]
  const lines = [
    `### ${label} causal totals by oracle family`,
    '',
    `| metric | ${M4_ORACLE_FAMILIES.join(' | ')} |`,
    `| --- | ${M4_ORACLE_FAMILIES.map(() => '---').join(' | ')} |`,
  ]
  for (const [metric, key] of rows) {
    lines.push(`| ${metric} | ${M4_ORACLE_FAMILIES.map((family) => String(values[family][key])).join(' | ')} |`)
  }
  return lines
}

export function renderM4FinalReport(result: Pick<M4CampaignResult, 'protocol' | 'aggregate' | 'conclusion' | 'evidenceSha256'>): string {
  const rule = result.aggregate.decisionBoundary
  const lines = [
    '# M4 structural-search candidate-oracle census',
    '',
    `- Frozen research boundary: \`${M4_FROZEN_BOUNDARY}\`.`,
    `- Protocol: C${result.protocol.structuralCeiling}/e${result.protocol.effortLevel}, ${result.protocol.repeatCount} repeats; ${result.protocol.snapshotSampling}.`,
    `- Execution model: ${result.protocol.executionModel}; deterministic generation bound ${result.protocol.deterministicGenerationBound}. The 30-second search setting is not used as a live wall-clock capture claim.`,
    '- Baseline trajectory: frozen ordinary search only; oracle candidates are evaluated offline from immutable snapshots.',
    '- Oracle families: O1 residual-extremum PK, O2 residual-region PK, O3 shelf evidence, O4 fixed-count least-damage topology substitution.',
    '- No M4 candidate entered the baseline beam and no baseline decision consumed oracle results.',
    '',
    '## Aggregate evidence',
    '',
    `- Real snapshots/cases: ${result.aggregate.real.snapshotCount}/${result.aggregate.real.caseCount}; synthetic snapshots/cases: ${result.aggregate.synthetic.snapshotCount}/${result.aggregate.synthetic.caseCount}.`,
    `- Real oracle-win coverage: ${rule.developmentWinningCases} development cases, ${rule.holdoutWinningCases} holdout cases, ${rule.overallWinningCases} overall cases, ${rule.winningRepeats} repeats, ${rule.winningGenerations} generations.`,
    `- Sampling adequacy (first/middle/final across six cases and three repeats): **${rule.samplingAdequate ? 'yes' : 'no'}**.`,
    `- Generation-global decomposition (real): ${Object.entries(result.aggregate.real.generationGlobalDecomposition ?? result.aggregate.real.decomposition).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    `- Generation-global decomposition (synthetic): ${Object.entries(result.aggregate.synthetic.generationGlobalDecomposition ?? result.aggregate.synthetic.decomposition).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    `- Aggregate generation-global decomposition (real + synthetic): ${Object.entries(result.aggregate.generationGlobalDecomposition ?? result.aggregate.decomposition).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    '',
    'The committed 331d93c evidence used deterministicGenerationBound=4, so it captured only generation 0 and imposed terminal generation 3 (two snapshots per trajectory) and was sampling-inadequate. Those historical values are not used to tune this corrected census.',
    'The historical partial coverage values (development 2/3, holdout 1/3, overall 3/6) remain incomplete evidence only and are not used to tune M4b.',
    '',
    ...renderTrajectoryCoverage(result.aggregate.real),
    '',
    ...renderRepeatIdentity(result.aggregate.real),
    '',
    ...renderFamilyMetricsTable(result.aggregate.real),
    '',
    ...renderGenerationGlobalDecomposition(result.aggregate.real),
    '',
    ...renderWinLocalization(result.aggregate.real),
    '',
    ...renderTrajectoryCoverage(result.aggregate.synthetic),
    '',
    ...renderRepeatIdentity(result.aggregate.synthetic),
    '',
    ...renderFamilyMetricsTable(result.aggregate.synthetic),
    '',
    ...renderGenerationGlobalDecomposition(result.aggregate.synthetic),
    '',
    ...renderWinLocalization(result.aggregate.synthetic),
    '',
    '## Frozen decision rule',
    '',
    '- Supported requires at least 2/3 development cases, 2/3 holdout cases, 4/6 overall cases, and wins in more than one repeat and generation.',
    `- Decision: **${result.conclusion}**.`,
    `- Evidence hash: \`${result.evidenceSha256}\`.`,
    '',
    '## Causal closeout (shadow-only)',
    '',
    `- Online-feasibility gate: **${result.aggregate.causalCloseout.onlineCoverage.conclusion}**; development/holdout/overall=${result.aggregate.causalCloseout.onlineCoverage.developmentCases}/${result.aggregate.causalCloseout.onlineCoverage.holdoutCases}/${result.aggregate.causalCloseout.onlineCoverage.overallCases}; distinct case×generation cells=${result.aggregate.causalCloseout.onlineCoverage.distinctCaseGenerationCells}.`,
    `- Protocol causal classes (historical ORACLE_WIN events): ${Object.entries(result.aggregate.causalCloseout.classificationTotals).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    `- De-duplicated deterministic causal classes (repeat 0): ${Object.entries(result.aggregate.causalCloseout.deterministicClassificationTotals).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    `- Online-feasible locations: ${result.aggregate.causalCloseout.onlineLocations.length === 0 ? 'none' : result.aggregate.causalCloseout.onlineLocations.map((row) => `${row.caseId}@g${row.generation}[${row.family}]`).join('; ')}.`,
    '',
    ...renderCausalFamilyTable('Protocol', result.aggregate.causalCloseout.protocolCount),
    '',
    ...renderCausalFamilyTable('De-duplicated deterministic', result.aggregate.causalCloseout.deterministicCount),
    '',
    renderCausalRecommendation(result.aggregate.causalCloseout),
    '',
    'This milestone is diagnostic/shadow only. It does not authorize an online M4/M5 search policy.',
  ]
  return `${lines.join('\n')}\n`
}

interface PreparedM4Case {
  id: string
  label: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  frequenciesHz: number[]
  desiredDb: number[]
  sampleRateHz: number
}

function preparedM4Cases(options: M4RunnerOptions): PreparedM4Case[] {
  const includeReal = options.includeReal ?? true
  const includeSynthetic = options.includeSynthetic ?? true
  const realIds = options.realCaseIds ?? M3_REAL_CASES.map((value) => value.id)
  const syntheticIds = options.syntheticCaseIds ?? M3_SYNTHETIC_CASES.map((value) => value.id)
  const prepared: PreparedM4Case[] = []
  if (includeReal) {
    for (const definition of M3_REAL_CASES) {
      if (!realIds.includes(definition.id)) continue
      const desired = definition.id === 'titan-to-rsv' || definition.id === 'titan-to-mystic-8' || definition.id === 'titan-to-s12-ultra'
        ? prepareManualRegressionDesired(definition.id)
        : prepareResearchDesired(definition.id)
      prepared.push({ ...definition, frequenciesHz: [...desired.frequenciesHz], desiredDb: [...desired.desiredDb], sampleRateHz: 48_000 })
    }
  }
  if (includeSynthetic) {
    const corpus = new Map(loadSyntheticGroundTruthCorpus().map((value) => [value.id, value]))
    for (const definition of M3_SYNTHETIC_CASES) {
      if (!syntheticIds.includes(definition.id)) continue
      const value = corpus.get(definition.id)
      if (value === undefined) throw new Error(`Unknown M4 synthetic case: ${definition.id}`)
      prepared.push({ ...definition, frequenciesHz: [...value.frequenciesHz], desiredDb: [...value.desiredDb], sampleRateHz: value.sampleRateHz })
    }
  }
  return prepared
}

/** Run a deterministic, work-bounded M4 capture/evaluation campaign. */
export function runStructuralSearchM4(options: M4RunnerOptions = {}): M4CampaignResult {
  const repeats = options.repeats ?? M4_REPEAT_COUNT
  const maxGenerations = options.deterministicMaxGenerations ?? M4_DETERMINISTIC_GENERATION_BOUND
  const stride = options.snapshotStride ?? M4_SNAPSHOT_STRIDE
  if (!Number.isSafeInteger(repeats) || repeats <= 0) throw new Error('M4 repeats must be a positive integer')
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations <= 0) throw new Error('M4 deterministic generation bound must be a positive integer')
  if (stride !== M4_SNAPSHOT_STRIDE) throw new Error('M4 snapshot stride is frozen at 10')
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: M4_TRAJECTORY_SECONDS,
  })
  const config = resolveScalableEffortConfig(baseConfig, M4_STRUCTURAL_CEILING, M4_EFFORT_LEVEL)
  const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: config.maxFilters })
  const observations: M4SnapshotObservation[] = []
  for (const prepared of preparedM4Cases(options)) {
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const captured: StructuralSearchGenerationSnapshot[] = []
      let imposedBoundaryReached = false
      let naturalStopGeneration: number | null = null
      runStructuralSearch({
        desiredDb: prepared.desiredDb,
        frequencies: prepared.frequenciesHz,
        sampleRateHz: prepared.sampleRateHz,
        config,
        seedFilters: [],
        deadline: {
          isExpired: () => imposedBoundaryReached,
        },
        onTrace: (event) => {
          if (event.type === 'beam-generation' && event.generation !== undefined && event.generation >= maxGenerations - 1) {
            imposedBoundaryReached = true
          }
          if (event.type === 'beam-stop' && event.reason === 'no-next-states') {
            naturalStopGeneration = event.generation ?? null
          }
        },
        // Select the deterministic terminal generation before ordinary work
        // starts so unselected generations do not retain an oracle ledger.
        captureBaselineGeneration: (generation, isFinal) => generation < maxGenerations &&
          (generation === maxGenerations - 1 || selectM4SnapshotGeneration(generation, isFinal)),
        onBaselineSnapshot: (snapshot) => captured.push(snapshot),
      })
      const terminalGeneration = naturalStopGeneration !== null && naturalStopGeneration < maxGenerations - 1
        ? naturalStopGeneration
        : (imposedBoundaryReached ? maxGenerations - 1 : captured.at(-1)?.generation ?? null)
      const terminalReason: M4SnapshotObservation['terminalReason'] =
        naturalStopGeneration !== null && naturalStopGeneration < maxGenerations - 1
          ? 'natural-stop'
          : 'deterministic-bound'
      for (const snapshot of captured) {
        const samplingReasons: M4SnapshotObservation['samplingReasons'] = [
          ...(snapshot.generation === 0 ? ['first' as const] : []),
          ...(snapshot.generation % M4_SNAPSHOT_STRIDE === 0 ? ['stride' as const] : []),
          ...(snapshot.generation === terminalGeneration ? ['final' as const] : []),
        ]
        const result = evaluateM4GenerationSnapshot(snapshot, bounds, {
          localPolishEvaluations: config.localPolishEvaluations,
          beamWidth: config.beamWidth,
          proposalsPerParent: config.proposalsPerParent,
        })
        observations.push({
          caseId: prepared.id,
          caseLabel: prepared.label,
          family: prepared.family,
          split: prepared.split,
          repeatIndex,
          snapshot,
          result,
          isFinal: snapshot.generation === terminalGeneration,
          terminalGeneration,
          terminalReason,
          samplingReasons,
        })
      }
    }
  }
  const aggregate = aggregateM4OracleEvidence(observations)
  const evidence = {
    schemaVersion: M4_RUNNER_SCHEMA_VERSION,
    frozenBoundary: M4_FROZEN_BOUNDARY,
    observations,
    aggregate,
  }
  const evidenceSha256 = hashM4Evidence(evidence)
  const result: M4CampaignResult = {
    schemaVersion: M4_RUNNER_SCHEMA_VERSION,
    frozenBoundary: M4_FROZEN_BOUNDARY,
    protocol: {
      structuralCeiling: M4_STRUCTURAL_CEILING,
      effortLevel: M4_EFFORT_LEVEL,
      trajectorySeconds: M4_TRAJECTORY_SECONDS,
      executionModel: 'generation-work-bounded-replay',
      deterministicGenerationBound: maxGenerations,
      repeatCount: repeats,
      snapshotSampling: 'first completed generation; every 10th completed generation; final completed generation before deadline',
      baselinePolicy: 'frozen-ordinary-search',
      oraclePolicy: 'offline-shadow-only',
      noOracleBeamAdmission: true,
      config,
    },
    observations,
    aggregate,
    conclusion: aggregate.decisionBoundary.conclusion,
    evidenceSha256,
  }
  if (options.writeArtifacts !== false) {
    const outputDir = resolve(options.outputDir ?? M4_DEFAULT_OUTPUT_DIR)
    mkdirSync(outputDir, { recursive: true })
    const aggregatePath = resolve(outputDir, 'aggregate-evidence.json')
    writeFileSync(aggregatePath, JSON.stringify(result.aggregate, null, 2) + '\n')
    writeFileSync(resolve(outputDir, 'manifest.json'), JSON.stringify({
      schemaVersion: M4_RUNNER_SCHEMA_VERSION,
      frozenBoundary: M4_FROZEN_BOUNDARY,
      protocol: result.protocol,
      observationCount: observations.length,
      aggregateSha256: hashM4Evidence(result.aggregate),
      evidenceSha256,
    }, null, 2) + '\n')
    writeFileSync(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`)
    const audit = observations.flatMap((observation) => observation.result.candidates
      .filter((candidate) => candidate.classification === 'ORACLE_WIN' || candidate.causalClassification === 'ONLINE_FEASIBLE_ORACLE_WIN')
      .map((candidate) => {
        const oracle = generateM4OracleCandidates(observation.snapshot, bounds)
          .find((entry) => entry.semanticKey === candidate.semanticKey)
        const parent = observation.snapshot.parents.find((entry) =>
          entry.parent.candidateId === oracle?.parentCandidateId)
        return {
          caseId: observation.caseId,
          ...(observation.caseLabel === undefined ? {} : { caseLabel: observation.caseLabel }),
          split: observation.split,
          repeatIndex: observation.repeatIndex,
          generation: observation.snapshot.generation,
          family: candidate.family,
          parentSemanticKey: parent?.parent.semanticKey ?? null,
          parentCandidateId: parent?.parent.candidateId ?? null,
          proposalSemanticKey: candidate.semanticKey,
          polishedSemanticKey: candidate.polished.semanticKey,
          ordinaryGenerated: candidate.ordinaryGenerated,
          ordinaryAdmitted: candidate.ordinaryAdmitted,
          ordinaryGeneratedNotAdmitted: candidate.ordinaryGenerated && !candidate.ordinaryAdmitted,
          parentLocalQ31Admissible: candidate.parentLocalQ31Admissible,
          parentLocalQ31DisplacedProposalKey: candidate.parentLocalQ31DisplacedProposalKey,
          visitedBeforeGeneration: candidate.visitedBeforeGeneration,
          duplicatesOrdinaryNextState: candidate.duplicatesOrdinaryNextState,
          exactBeamSurvives: candidate.exactBeamSurvives,
          exactReferenceImproves: candidate.exactReferenceImproves,
          historicalClassification: candidate.classification,
          causalClassification: candidate.causalClassification,
        }
      }))
    writeFileSync(resolve(outputDir, 'candidate-win-audit.json'), JSON.stringify(audit, null, 2) + '\n')
    writeFileSync(resolve(outputDir, 'final-report.md'), renderM4FinalReport(result))
    result.outputDir = outputDir
  }
  return result
}

export const runStructuralSearchVnextM4 = runStructuralSearchM4

if (process.argv[1] === fileURLToPath(import.meta.url) && !existsSync(process.env.VITEST_WORKER_ID ?? '')) {
  const result = runStructuralSearchM4()
  process.stdout.write(JSON.stringify({
    conclusion: result.conclusion,
    observationCount: result.observations.length,
    evidenceSha256: result.evidenceSha256,
    outputDir: result.outputDir,
  }) + '\n')
}
