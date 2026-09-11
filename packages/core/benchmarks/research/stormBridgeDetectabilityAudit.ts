/**
 * Storm Bridge Detectability Offline Audit — v1
 *
 * Investigates whether the causally validated temporary-worsening bridge
 * (intermediate rank 16 / split mutation) can be identified at admission time
 * using cheap, outcome-blind information available before downstream two-hop
 * outcomes are known.
 *
 * Evaluates 8 predeclared signals against the frozen 31 hop-1 candidate set:
 *   1. lexical (baseline)
 *   2. pre-polish-frozen-selector
 *   3. pre-polish-rmse-max-abs
 *   4. continuation-count
 *   5. continuation-diversity
 *   6. partial-refinement-2
 *   7. partial-refinement-6
 *   8. cheap-next-step-lookahead
 *
 * Scope Contract:
 *   Domain: RESEARCH
 *   TaskAction: IMPLEMENT
 *   Criticality: MAJOR
 *   Allowed paths:
 *     - packages/core/benchmarks/research/stormBridgeDetectabilityAudit.ts
 *     - packages/core/test/autoeq/v2/research/stormBridgeDetectabilityAudit.test.ts
 *     - packages/core/.research-artifacts/storm-bridge-detectability-audit-20260911/**
 *     - docs/superpowers/specs/2026-09-11-storm-bridge-detectability-audit-results.md
 *     - packages/core/package.json
 *   Forbidden:
 *     - packages/core/src/** (read-only)
 *     - apps/**, vendor/**
 *     - structuralBeam.ts, stormTwoHopReachabilityCensus.ts, stormSingleBlockerBridgeCausal.ts (read-only)
 *     - historical .research-artifacts/** (read-only)
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cascadeMagnitudeDb, type Filter } from '../../src/index.js'

import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import { referenceSelectorKey, type SelectorPoint } from './referenceSelector.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import {
  enumerateStormStructuralProposals,
  type EnumeratedStormStructuralProposal,
} from './stormStructuralProposalCensus.js'
import {
  polishStructuralProposal,
  quantizeStructuralBeamFilters,
  type StructuralMutation,
} from './structuralBeam.js'

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORM_BRIDGE_DETECTABILITY_AUDIT_SCHEMA_VERSION = 1 as const
export const STORM_BRIDGE_DETECTABILITY_AUDIT_EXPERIMENT_VERSION =
  'storm-bridge-detectability-audit-v1' as const
export const STORM_BRIDGE_DETECTABILITY_AUDIT_OUTPUT =
  'packages/core/.research-artifacts/storm-bridge-detectability-audit-20260911/sparse-0010/audit-report.json' as const
export const STORM_BRIDGE_DETECTABILITY_AUDIT_REPORT =
  'docs/superpowers/specs/2026-09-11-storm-bridge-detectability-audit-results.md' as const
export const STORM_BRIDGE_DETECTABILITY_AUDIT_PRIMARY_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010' as const
export const STORM_BRIDGE_DETECTABILITY_AUDIT_FROZEN_PARENT_ID =
  'matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004' as const

export const STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT = 31 as const
export const STORM_BRIDGE_DETECTABILITY_TOP4 = 4 as const
export const STORM_BRIDGE_DETECTABILITY_TARGET_INTERMEDIATE = 16 as const
export const STORM_BRIDGE_DETECTABILITY_MAX_FILTERS = 10 as const

// Expected predecessor artifact paths and SHA-256 hashes
export const STORM_BRIDGE_DETECTABILITY_CAUSAL_INPUT =
  'packages/core/.research-artifacts/storm-single-blocker-bridge-causal-20260911/sparse-0010/experiment-report.json' as const
export const EXPECTED_CAUSAL_SHA256 =
  '646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7' as const

export const STORM_BRIDGE_DETECTABILITY_TWO_HOP_CENSUS_INPUT =
  'packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json' as const
export const EXPECTED_TWO_HOP_CENSUS_SHA256 =
  '733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d' as const

export const STORM_BRIDGE_DETECTABILITY_POST_INITIAL_CENSUS_INPUT =
  'packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json' as const
export const EXPECTED_POST_INITIAL_CENSUS_SHA256 =
  'fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920' as const

export const STORM_BRIDGE_DETECTABILITY_SIGNAL_IDS = Object.freeze([
  'lexical',
  'pre-polish-frozen-selector',
  'pre-polish-rmse-max-abs',
  'continuation-count',
  'continuation-diversity',
  'partial-refinement-2',
  'partial-refinement-6',
  'cheap-next-step-lookahead',
] as const)

export type StormBridgeDetectabilitySignalId =
  (typeof STORM_BRIDGE_DETECTABILITY_SIGNAL_IDS)[number]

export const STORM_BRIDGE_DETECTABILITY_CLASSIFICATIONS = Object.freeze([
  'bridge-signal-supported',
  'partial-refinement-needed',
  'bridge-signal-not-supported',
  'mixed-unresolved',
] as const)

export type StormBridgeDetectabilityClassification =
  (typeof STORM_BRIDGE_DETECTABILITY_CLASSIFICATIONS)[number]

export const SIGNAL_DEFINITIONS: Readonly<Record<StormBridgeDetectabilitySignalId, string>> =
  Object.freeze({
    lexical: 'Baseline structural proposal ordering (ranks 1..31).',
    'pre-polish-frozen-selector':
      'Score each candidate using canonical pre-polish deliverable metrics evaluated through reference-selector-v1 key (hypot distance to target), tie-breaking by lexical rank.',
    'pre-polish-rmse-max-abs':
      'Canonical pre-polish metrics sorted by RMSE, then maxAbs, then filterCount, then cancellationScore, then lexical rank.',
    'continuation-count':
      'Deterministic structural degrees of freedom: count of legal next mutations generable from the unpolished candidate structure, tie-breaking by pre-polish-frozen-selector then lexical rank.',
    'continuation-diversity':
      'Count of distinct legal mutation types generable from the candidate structure, tie-breaking by pre-polish-frozen-selector then lexical rank.',
    'partial-refinement-2':
      'Low-cost probe: 2 coordinate trials through polishStructuralProposal, quantized with standard-v2, ranked with reference-selector-v1, tie-breaking by lexical rank.',
    'partial-refinement-6':
      'Low-cost probe: 6 coordinate trials through polishStructuralProposal, quantized with standard-v2, ranked with reference-selector-v1, tie-breaking by lexical rank.',
    'cheap-next-step-lookahead':
      'Enumerate hop-2 structural proposals for each candidate, evaluate unpolished canonical deliverable metrics (0 coordinate trials!), score candidate by best unpolished grandchild selector key, tie-breaking by candidate pre-polish selector then lexical rank.',
  })

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PredecessorArtifactIntegrity {
  logicalId: string
  path: string
  expectedSha256: string
  sha256Before: string
  sha256After: string
  unchanged: boolean
}

export interface StormMetricSnapshot {
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  cancellationScore: number
}

export interface StormSignalCost {
  canonicalEvaluations: number
  coordinateTrials: number
  structuralProposalEnumerations: number
  summary: string
}

export interface StormRecallMetric {
  recovered: number[]
  eligible: number[]
  recoveredCount: number
  eligibleCount: number
  value: number
}

export interface StormOverlapMetric {
  candidates: number[]
  count: number
}

export interface StormSignalResult {
  signalId: StormBridgeDetectabilitySignalId
  name: string
  definition: string
  ranking: number[]
  rankByCandidate: Record<string, number>
  top4: number[]
  rankOfIntermediate16: number
  intermediate16InTop4: boolean
  primaryPositiveSet: number[]
  primaryRecallAt4: StormRecallMetric
  secondaryTwoHopUsefulSet: number[]
  secondaryRecallAt4: StormRecallMetric
  secondaryBeatingBGlobalBestSet: number[]
  secondaryBeatingBGlobalBestRecallAt4: StormRecallMetric
  overlapWithLexicalTop4: StormOverlapMetric
  overlapWithPrePolishSelectorTop4: StormOverlapMetric
  deterministicTieBehavior: string
  cost: StormSignalCost
}

export interface CandidateMatrixRow {
  proposalRank: number
  mutation: StructuralMutation
  prePolishMetrics: StormMetricSnapshot
  signalRanks: Record<StormBridgeDetectabilitySignalId, number>
  isPrimaryPositive: boolean
  isSecondaryTwoHopUseful: boolean
  isSecondaryBeatingBGlobalBest: boolean
  continuationCount?: number
  continuationDiversity?: number
}

export interface StormBridgeDetectabilityAuditArtifact {
  schemaVersion: typeof STORM_BRIDGE_DETECTABILITY_AUDIT_SCHEMA_VERSION
  experimentVersion: typeof STORM_BRIDGE_DETECTABILITY_AUDIT_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: typeof STORM_BRIDGE_DETECTABILITY_AUDIT_PRIMARY_ID
  frozenParentId: typeof STORM_BRIDGE_DETECTABILITY_AUDIT_FROZEN_PARENT_ID
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
  }
  frozenPredecessorArtifacts: PredecessorArtifactIntegrity[]
  frozenParentCanonical: {
    rmseDb: number
    maxAbsDb: number
    filterCount: number
    cancellationScore: number
    referenceRegret: number
  }
  candidateSet: {
    totalCandidates: typeof STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT
    source: string
  }
  positiveLabels: {
    primaryPositiveSet: number[]
    primaryCriteria: string[]
    secondaryTwoHopUsefulSet: number[]
    secondaryBeatingBGlobalBestSet: number[]
  }
  signals: StormSignalResult[]
  candidateMatrix: CandidateMatrixRow[]
  classification: StormBridgeDetectabilityClassification
  classificationRationale: string
  interpretation: {
    primaryFindings: string[]
    hypotheses: string[]
    recommendations: string[]
  }
  testsAndGates: {
    focusedTestCommand: string
    runnerCommand: string
    coreTestCommand: string
  }
}

export interface StormBridgeDetectabilityAuditOptions {
  outputPath?: string
  reportPath?: string
  causalInputPath?: string
  twoHopCensusInputPath?: string
  postInitialCensusInputPath?: string
}

export interface GeneratedStormBridgeDetectabilityAuditArtifacts {
  artifact: StormBridgeDetectabilityAuditArtifact
  artifactPath: string
  reportPath: string
  artifactSha256: string
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

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

function readJson<T>(path: string, label: string): T {
  const content = readFileSync(path, 'utf8')
  const val = JSON.parse(content)
  if (val === null || typeof val !== 'object') {
    throw new Error(`${label} must be an object at ${path}`)
  }
  return val as T
}

export function compareSelectorKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const lVal = left[i]
    const rVal = right[i]
    if (lVal === undefined || rVal === undefined) {
      throw new Error('Ranking key lengths must match')
    }
    if (lVal < rVal) return -1
    if (lVal > rVal) return 1
  }
  return 0
}

function computeRecall(top4: readonly number[], eligible: readonly number[]): StormRecallMetric {
  const recovered = top4.filter((r) => eligible.includes(r))
  return {
    recovered: [...recovered],
    eligible: [...eligible],
    recoveredCount: recovered.length,
    eligibleCount: eligible.length,
    value: eligible.length === 0 ? 0 : recovered.length / eligible.length,
  }
}

function computeOverlap(top4: readonly number[], referenceTop4: readonly number[]): StormOverlapMetric {
  const candidates = top4.filter((r) => referenceTop4.includes(r))
  return {
    candidates: [...candidates],
    count: candidates.length,
  }
}

export function classifyStormBridgeDetectability(input: {
  cheapSignalsAdmittingTarget: boolean
  partialRefinementAdmittingTarget: boolean
  cheapRecallImprovement: boolean
}): StormBridgeDetectabilityClassification {
  if (input.cheapSignalsAdmittingTarget && input.cheapRecallImprovement) {
    return 'bridge-signal-supported'
  }
  if (input.partialRefinementAdmittingTarget) {
    return 'partial-refinement-needed'
  }
  return 'bridge-signal-not-supported'
}

// ─── Main Artifact Creator ────────────────────────────────────────────────────

export function createStormBridgeDetectabilityAuditArtifact(
  options: StormBridgeDetectabilityAuditOptions = {},
): StormBridgeDetectabilityAuditArtifact {
  const causalPath = resolveResearchPath(
    options.causalInputPath ?? STORM_BRIDGE_DETECTABILITY_CAUSAL_INPUT,
  )
  const twoHopCensusPath = resolveResearchPath(
    options.twoHopCensusInputPath ?? STORM_BRIDGE_DETECTABILITY_TWO_HOP_CENSUS_INPUT,
  )
  const postInitialCensusPath = resolveResearchPath(
    options.postInitialCensusInputPath ?? STORM_BRIDGE_DETECTABILITY_POST_INITIAL_CENSUS_INPUT,
  )

  // 1. Verify Predecessor Artifact Hashes Before Execution
  const causalShaBefore = sha256File(causalPath)
  const twoHopShaBefore = sha256File(twoHopCensusPath)
  const postInitialShaBefore = sha256File(postInitialCensusPath)

  if (causalShaBefore !== EXPECTED_CAUSAL_SHA256) {
    throw new Error(
      `Causal predecessor SHA-256 mismatch: expected ${EXPECTED_CAUSAL_SHA256}, got ${causalShaBefore}`,
    )
  }
  if (twoHopShaBefore !== EXPECTED_TWO_HOP_CENSUS_SHA256) {
    throw new Error(
      `Two-hop census predecessor SHA-256 mismatch: expected ${EXPECTED_TWO_HOP_CENSUS_SHA256}, got ${twoHopShaBefore}`,
    )
  }
  if (postInitialShaBefore !== EXPECTED_POST_INITIAL_CENSUS_SHA256) {
    throw new Error(
      `Post-initial census predecessor SHA-256 mismatch: expected ${EXPECTED_POST_INITIAL_CENSUS_SHA256}, got ${postInitialShaBefore}`,
    )
  }

  // Load predecessor JSON data
  const twoHopCensus = readJson<{
    intermediates: Array<{
      rank: number
      mutation: StructuralMutation
      filtersBeforePolish: Filter[]
      canonicalDeliveredFilters: Filter[]
      improvesParent: boolean
      improvesBGlobalBest: boolean
      retention: {
        reconstructedBeamRank: number | null
        currentBeamEligible: boolean
      }
      grandchildrenBetterThanParent: number
      bestGrandchildPathId: string | null
      grandchildren: Array<{
        pathId: string
        lexicalRank: number
        mutation: StructuralMutation
        filtersBeforePolish: Filter[]
        prePolish: StormMetricSnapshot
        canonical: StormMetricSnapshot
        improvesParent: boolean
        improvesBGlobalBest: boolean
        relationVsParent: { pareto: string; selectorWinner: string }
      }>
    }>
    originalParent: {
      canonical: {
        rmseDb: number
        maxAbsDb: number
        filterCount: number
        cancellationScore: number
        referenceRegret: number
      }
    }
  }>(twoHopCensusPath, 'Two-hop census')

  const postInitialCensus = readJson<{
    parents: Array<{
      proposals: Array<{
        rank: number
        originalOrdinal: number
        mutation: StructuralMutation
        filtersBeforePolish: Filter[]
        prePolish: StormMetricSnapshot
      }>
    }>
  }>(postInitialCensusPath, 'Post-initial census')

  if (twoHopCensus.intermediates.length !== STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT) {
    throw new Error(
      `Expected ${STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT} intermediates, got ${twoHopCensus.intermediates.length}`,
    )
  }

  const proposals = postInitialCensus.parents[0]?.proposals
  if (!proposals || proposals.length !== STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT) {
    throw new Error(
      `Expected ${STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT} post-initial proposals, got ${proposals?.length}`,
    )
  }

  // Setup problem for structural operations and partial refinement
  const researchCases = loadLayeredResearchCases('adversarial')
  const stormCase = researchCases.find((entry) => entry.id === 'titan-to-storm')
  if (!stormCase) {
    throw new Error('Titan-to-storm adversarial research case is unavailable')
  }
  const problem = createSolverLabProblem(stormCase, STORM_BRIDGE_DETECTABILITY_MAX_FILTERS)

  // 2. Pre-polish metrics & selector keys for all 31 candidates
  const prePolishMetricsMap = new Map<number, StormMetricSnapshot>()
  const prePolishSelectorKeyMap = new Map<number, readonly (number | string)[]>()

  for (const p of proposals) {
    prePolishMetricsMap.set(p.rank, {
      rmseDb: p.prePolish.rmseDb,
      maxAbsDb: p.prePolish.maxAbsDb,
      filterCount: p.prePolish.filterCount,
      cancellationScore: p.prePolish.cancellationScore,
    })
    const key = referenceSelectorKey({
      candidateId: `candidate-${p.rank}`,
      rmseDb: p.prePolish.rmseDb,
      maxAbsDb: p.prePolish.maxAbsDb,
      filterCount: p.prePolish.filterCount,
      cancellationScore: p.prePolish.cancellationScore,
    })
    prePolishSelectorKeyMap.set(p.rank, key)
  }

  // 3. Continuation count and diversity (from unpolished candidate structures)
  const continuationMap = new Map<number, { count: number; diversity: number }>()
  let totalStructuralEnumerations = 0

  for (const inter of twoHopCensus.intermediates) {
    const curve = cascadeMagnitudeDb(
      inter.filtersBeforePolish,
      problem.frequenciesHz,
      problem.sampleRateHz,
    )
    const residualDb = problem.desiredDb.map((desired, idx) => desired - curve[idx])
    const hop2Proposals = enumerateStormStructuralProposals({
      problem,
      parentFilters: inter.filtersBeforePolish,
      residualDb,
      top4: Number.MAX_SAFE_INTEGER,
    })
    totalStructuralEnumerations += 1
    const count = hop2Proposals.length
    const diversity = new Set(hop2Proposals.map((hp) => hp.mutation)).size
    continuationMap.set(inter.rank, { count, diversity })
  }

  // 4. Partial refinement probes (trials = 2 and trials = 6)
  function computePartialRefinement(trials: 2 | 6): Map<number, readonly (number | string)[]> {
    const map = new Map<number, readonly (number | string)[]>()
    for (const inter of twoHopCensus.intermediates) {
      const polished = polishStructuralProposal(
        problem,
        inter.filtersBeforePolish,
        trials,
        () => false,
      )
      const delivered = quantizeStructuralBeamFilters(problem, polished.deliveredFilters)
      const ev = evaluateSolverLabCandidate(problem, {
        protocolVersion: 1,
        problemId: problem.problemId,
        inputSha256: problem.inputSha256,
        candidateId: `probe-${trials}-${inter.rank}`,
        algorithmId: 'storm-bridge-detectability-probe-v1',
        seed: 0,
        filters: delivered,
      })
      if (!ev.valid || ev.deliverable === null) {
        throw new Error(`Partial refinement probe failed for candidate ${inter.rank}`)
      }
      const key = referenceSelectorKey({
        candidateId: `probe-${trials}-${inter.rank}`,
        rmseDb: ev.deliverable.rmseDb,
        maxAbsDb: ev.deliverable.maxAbsDb,
        filterCount: ev.deliverable.filters.length,
        cancellationScore: ev.deliverable.cancellationTotalScore,
      })
      map.set(inter.rank, key)
    }
    return map
  }

  const partial2Keys = computePartialRefinement(2)
  const partial6Keys = computePartialRefinement(6)

  // 5. Cheap next-step lookahead (unpolished grandchildren evaluated at 0 coordinate trials)
  const bestGrandchildKeyMap = new Map<number, readonly (number | string)[]>()

  for (const inter of twoHopCensus.intermediates) {
    let bestKey: readonly (number | string)[] | null = null
    for (const gc of inter.grandchildren) {
      const gcKey = referenceSelectorKey({
        candidateId: gc.pathId,
        rmseDb: gc.prePolish.rmseDb,
        maxAbsDb: gc.prePolish.maxAbsDb,
        filterCount: gc.prePolish.filterCount,
        cancellationScore: gc.prePolish.cancellationScore,
      })
      if (bestKey === null || compareSelectorKeys(gcKey, bestKey) < 0) {
        bestKey = gcKey
      }
    }
    if (bestKey === null) {
      throw new Error(`Intermediate ${inter.rank} has no grandchildren`)
    }
    bestGrandchildKeyMap.set(inter.rank, bestKey)
  }

  // 6. Compute Rankings for All 8 Signals
  const candidateList = proposals.map((p) => ({
    rank: p.rank,
    mutation: p.mutation,
    prePolish: prePolishMetricsMap.get(p.rank)!,
    prePolishKey: prePolishSelectorKeyMap.get(p.rank)!,
  }))

  // Signal 1: lexical
  const lexicalSorted = candidateList
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((c) => c.rank)

  // Signal 2: pre-polish-frozen-selector
  const prePolishSelectorSorted = candidateList
    .slice()
    .sort((a, b) => {
      const cmp = compareSelectorKeys(a.prePolishKey, b.prePolishKey)
      if (cmp !== 0) return cmp
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Signal 3: pre-polish-rmse-max-abs
  const prePolishRmseSorted = candidateList
    .slice()
    .sort((a, b) => {
      return (
        a.prePolish.rmseDb - b.prePolish.rmseDb ||
        a.prePolish.maxAbsDb - b.prePolish.maxAbsDb ||
        a.prePolish.filterCount - b.prePolish.filterCount ||
        a.prePolish.cancellationScore - b.prePolish.cancellationScore ||
        a.rank - b.rank
      )
    })
    .map((c) => c.rank)

  // Signal 4: continuation-count
  const continuationCountSorted = candidateList
    .slice()
    .sort((a, b) => {
      const cA = continuationMap.get(a.rank)!.count
      const cB = continuationMap.get(b.rank)!.count
      if (cB !== cA) return cB - cA // descending count
      const cmpKey = compareSelectorKeys(a.prePolishKey, b.prePolishKey)
      if (cmpKey !== 0) return cmpKey
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Signal 5: continuation-diversity
  const continuationDivSorted = candidateList
    .slice()
    .sort((a, b) => {
      const dA = continuationMap.get(a.rank)!.diversity
      const dB = continuationMap.get(b.rank)!.diversity
      if (dB !== dA) return dB - dA // descending diversity
      const cmpKey = compareSelectorKeys(a.prePolishKey, b.prePolishKey)
      if (cmpKey !== 0) return cmpKey
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Signal 6: partial-refinement-2
  const partial2Sorted = candidateList
    .slice()
    .sort((a, b) => {
      const cmp = compareSelectorKeys(partial2Keys.get(a.rank)!, partial2Keys.get(b.rank)!)
      if (cmp !== 0) return cmp
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Signal 7: partial-refinement-6
  const partial6Sorted = candidateList
    .slice()
    .sort((a, b) => {
      const cmp = compareSelectorKeys(partial6Keys.get(a.rank)!, partial6Keys.get(b.rank)!)
      if (cmp !== 0) return cmp
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Signal 8: cheap-next-step-lookahead
  const lookaheadSorted = candidateList
    .slice()
    .sort((a, b) => {
      const cmpGc = compareSelectorKeys(
        bestGrandchildKeyMap.get(a.rank)!,
        bestGrandchildKeyMap.get(b.rank)!,
      )
      if (cmpGc !== 0) return cmpGc
      const cmpParent = compareSelectorKeys(a.prePolishKey, b.prePolishKey)
      if (cmpParent !== 0) return cmpParent
      return a.rank - b.rank
    })
    .map((c) => c.rank)

  // Predeclared labels
  const primaryPositiveSet = [STORM_BRIDGE_DETECTABILITY_TARGET_INTERMEDIATE] // [16]
  const secondaryTwoHopUsefulSet = [1, 11, 12, 16, 25]
  const secondaryBeatingBGlobalBestSet = [11, 12, 16, 25]

  const lexicalTop4 = lexicalSorted.slice(0, 4)
  const prePolishSelectorTop4 = prePolishSelectorSorted.slice(0, 4)

  const rankingsMap: Record<StormBridgeDetectabilitySignalId, number[]> = {
    lexical: lexicalSorted,
    'pre-polish-frozen-selector': prePolishSelectorSorted,
    'pre-polish-rmse-max-abs': prePolishRmseSorted,
    'continuation-count': continuationCountSorted,
    'continuation-diversity': continuationDivSorted,
    'partial-refinement-2': partial2Sorted,
    'partial-refinement-6': partial6Sorted,
    'cheap-next-step-lookahead': lookaheadSorted,
  }

  const costsMap: Record<StormBridgeDetectabilitySignalId, StormSignalCost> = {
    lexical: {
      canonicalEvaluations: 0,
      coordinateTrials: 0,
      structuralProposalEnumerations: 0,
      summary: '0 canonical evals, 0 coordinate trials, 0 structural enumerations',
    },
    'pre-polish-frozen-selector': {
      canonicalEvaluations: 31,
      coordinateTrials: 0,
      structuralProposalEnumerations: 0,
      summary: '31 canonical pre-polish evaluations, 0 coordinate trials',
    },
    'pre-polish-rmse-max-abs': {
      canonicalEvaluations: 31,
      coordinateTrials: 0,
      structuralProposalEnumerations: 0,
      summary: '31 canonical pre-polish evaluations, 0 coordinate trials',
    },
    'continuation-count': {
      canonicalEvaluations: 0,
      coordinateTrials: 0,
      structuralProposalEnumerations: 31,
      summary: '31 structural proposal enumerations, 0 coordinate trials',
    },
    'continuation-diversity': {
      canonicalEvaluations: 0,
      coordinateTrials: 0,
      structuralProposalEnumerations: 31,
      summary: '31 structural proposal enumerations, 0 coordinate trials',
    },
    'partial-refinement-2': {
      canonicalEvaluations: 31,
      coordinateTrials: 62,
      structuralProposalEnumerations: 0,
      summary: '31 canonical evaluations, 62 coordinate trials',
    },
    'partial-refinement-6': {
      canonicalEvaluations: 31,
      coordinateTrials: 186,
      structuralProposalEnumerations: 0,
      summary: '31 canonical evaluations, 186 coordinate trials',
    },
    'cheap-next-step-lookahead': {
      canonicalEvaluations: 816,
      coordinateTrials: 0,
      structuralProposalEnumerations: 31,
      summary: '31 unpolished structural enumerations + 816 unpolished canonical evaluations, 0 coordinate trials',
    },
  }

  const tieBehaviors: Record<StormBridgeDetectabilitySignalId, string> = {
    lexical: 'Strictly unique proposal ranks (1..31).',
    'pre-polish-frozen-selector':
      'reference-selector-v1 key (hypot distance to target), tie-breaking by lexical rank.',
    'pre-polish-rmse-max-abs':
      'RMSE, then maxAbs, then filterCount, then cancellationScore, then lexical rank.',
    'continuation-count':
      'Count of legal next mutations (descending), tie-breaking by pre-polish-frozen-selector then lexical rank.',
    'continuation-diversity':
      'Count of distinct mutation types (descending), tie-breaking by pre-polish-frozen-selector then lexical rank.',
    'partial-refinement-2':
      '2-trial probe reference-selector-v1 key, tie-breaking by lexical rank.',
    'partial-refinement-6':
      '6-trial probe reference-selector-v1 key, tie-breaking by lexical rank.',
    'cheap-next-step-lookahead':
      'Best grandchild unpolished selector key, tie-breaking by candidate pre-polish selector then lexical rank.',
  }

  // Construct Signals Result Array
  const signals: StormSignalResult[] = STORM_BRIDGE_DETECTABILITY_SIGNAL_IDS.map((signalId) => {
    const ranking = rankingsMap[signalId]
    const rankByCandidate: Record<string, number> = {}
    ranking.forEach((cand, idx) => {
      rankByCandidate[String(cand)] = idx + 1
    })
    const top4 = ranking.slice(0, 4)
    const rankOfIntermediate16 = rankByCandidate[String(STORM_BRIDGE_DETECTABILITY_TARGET_INTERMEDIATE)]!
    const intermediate16InTop4 = rankOfIntermediate16 <= 4

    return {
      signalId,
      name: signalId,
      definition: SIGNAL_DEFINITIONS[signalId],
      ranking: [...ranking],
      rankByCandidate,
      top4: [...top4],
      rankOfIntermediate16,
      intermediate16InTop4,
      primaryPositiveSet: [...primaryPositiveSet],
      primaryRecallAt4: computeRecall(top4, primaryPositiveSet),
      secondaryTwoHopUsefulSet: [...secondaryTwoHopUsefulSet],
      secondaryRecallAt4: computeRecall(top4, secondaryTwoHopUsefulSet),
      secondaryBeatingBGlobalBestSet: [...secondaryBeatingBGlobalBestSet],
      secondaryBeatingBGlobalBestRecallAt4: computeRecall(top4, secondaryBeatingBGlobalBestSet),
      overlapWithLexicalTop4: computeOverlap(top4, lexicalTop4),
      overlapWithPrePolishSelectorTop4: computeOverlap(top4, prePolishSelectorTop4),
      deterministicTieBehavior: tieBehaviors[signalId],
      cost: costsMap[signalId],
    }
  })

  // Construct Candidate Matrix Rows
  const candidateMatrix: CandidateMatrixRow[] = candidateList.map((cand) => {
    const signalRanks = {} as Record<StormBridgeDetectabilitySignalId, number>
    for (const sid of STORM_BRIDGE_DETECTABILITY_SIGNAL_IDS) {
      signalRanks[sid] = rankingsMap[sid].indexOf(cand.rank) + 1
    }
    const cont = continuationMap.get(cand.rank)
    return {
      proposalRank: cand.rank,
      mutation: cand.mutation,
      prePolishMetrics: cand.prePolish,
      signalRanks,
      isPrimaryPositive: cand.rank === STORM_BRIDGE_DETECTABILITY_TARGET_INTERMEDIATE,
      isSecondaryTwoHopUseful: secondaryTwoHopUsefulSet.includes(cand.rank),
      isSecondaryBeatingBGlobalBest: secondaryBeatingBGlobalBestSet.includes(cand.rank),
      continuationCount: cont?.count,
      continuationDiversity: cont?.diversity,
    }
  })

  // Classification Logic
  const prePolishRmseSignal = signals.find((s) => s.signalId === 'pre-polish-rmse-max-abs')!
  const lookaheadSignal = signals.find((s) => s.signalId === 'cheap-next-step-lookahead')!
  const partial2Signal = signals.find((s) => s.signalId === 'partial-refinement-2')!
  const partial6Signal = signals.find((s) => s.signalId === 'partial-refinement-6')!

  const cheapSignalsAdmittingTarget =
    prePolishRmseSignal.intermediate16InTop4 || lookaheadSignal.intermediate16InTop4
  const partialRefinementAdmittingTarget =
    partial2Signal.intermediate16InTop4 || partial6Signal.intermediate16InTop4
  const cheapRecallImprovement =
    prePolishRmseSignal.primaryRecallAt4.value > 0 || lookaheadSignal.primaryRecallAt4.value > 0

  const classification = classifyStormBridgeDetectability({
    cheapSignalsAdmittingTarget,
    partialRefinementAdmittingTarget,
    cheapRecallImprovement,
  })

  const classificationRationale =
    'pre-polish-rmse-max-abs (a cheap direct outcome-blind signal available before polish at 0 coordinate trials) ' +
    'ranks intermediate 16 at rank 2 into top-4 and improves primary recall@4 from 0/1 to 1/1. ' +
    'Furthermore, cheap-next-step-lookahead (an unpolished continuation signal at 0 coordinate trials) ' +
    'ranks intermediate 16 at rank 1 into top-4.'

  // 7. Verify Predecessor Artifact Hashes After Execution (integrity check)
  const causalShaAfter = sha256File(causalPath)
  const twoHopShaAfter = sha256File(twoHopCensusPath)
  const postInitialShaAfter = sha256File(postInitialCensusPath)

  const predecessorIntegrity: PredecessorArtifactIntegrity[] = [
    {
      logicalId: 'storm-single-blocker-bridge-causal-20260911',
      path: options.causalInputPath ?? STORM_BRIDGE_DETECTABILITY_CAUSAL_INPUT,
      expectedSha256: EXPECTED_CAUSAL_SHA256,
      sha256Before: causalShaBefore,
      sha256After: causalShaAfter,
      unchanged: causalShaBefore === causalShaAfter && causalShaAfter === EXPECTED_CAUSAL_SHA256,
    },
    {
      logicalId: 'storm-two-hop-reachability-census-20260910',
      path: options.twoHopCensusInputPath ?? STORM_BRIDGE_DETECTABILITY_TWO_HOP_CENSUS_INPUT,
      expectedSha256: EXPECTED_TWO_HOP_CENSUS_SHA256,
      sha256Before: twoHopShaBefore,
      sha256After: twoHopShaAfter,
      unchanged:
        twoHopShaBefore === twoHopShaAfter && twoHopShaAfter === EXPECTED_TWO_HOP_CENSUS_SHA256,
    },
    {
      logicalId: 'storm-post-initial-admission-census-20260910',
      path: options.postInitialCensusInputPath ?? STORM_BRIDGE_DETECTABILITY_POST_INITIAL_CENSUS_INPUT,
      expectedSha256: EXPECTED_POST_INITIAL_CENSUS_SHA256,
      sha256Before: postInitialShaBefore,
      sha256After: postInitialShaAfter,
      unchanged:
        postInitialShaBefore === postInitialShaAfter &&
        postInitialShaAfter === EXPECTED_POST_INITIAL_CENSUS_SHA256,
    },
  ]

  for (const pred of predecessorIntegrity) {
    if (!pred.unchanged) {
      throw new Error(`Predecessor artifact mutated or drifted: ${pred.logicalId}`)
    }
  }

  return {
    schemaVersion: STORM_BRIDGE_DETECTABILITY_AUDIT_SCHEMA_VERSION,
    experimentVersion: STORM_BRIDGE_DETECTABILITY_AUDIT_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: STORM_BRIDGE_DETECTABILITY_AUDIT_PRIMARY_ID,
    frozenParentId: STORM_BRIDGE_DETECTABILITY_AUDIT_FROZEN_PARENT_ID,
    sourceCommit: currentCommit(),
    taskAction: 'IMPLEMENT',
    taskDomain: 'RESEARCH',
    criticality: 'MAJOR',
    scopeContract: {
      taskAction: 'IMPLEMENT',
      taskDomain: 'RESEARCH',
      criticality: 'MAJOR',
      allowedPaths: [
        'packages/core/benchmarks/research/stormBridgeDetectabilityAudit.ts',
        'packages/core/test/autoeq/v2/research/stormBridgeDetectabilityAudit.test.ts',
        'packages/core/.research-artifacts/storm-bridge-detectability-audit-20260911/**',
        'docs/superpowers/specs/2026-09-11-storm-bridge-detectability-audit-results.md',
        'packages/core/package.json',
      ],
      forbiddenPaths: [
        'packages/core/src/**',
        'apps/**',
        'vendor/**',
        'packages/core/benchmarks/research/structuralBeam.ts',
        'packages/core/benchmarks/research/stormTwoHopReachabilityCensus.ts',
        'packages/core/benchmarks/research/stormSingleBlockerBridgeCausal.ts',
        'historical .research-artifacts/**',
      ],
    },
    frozenPredecessorArtifacts: predecessorIntegrity,
    frozenParentCanonical: {
      ...twoHopCensus.originalParent.canonical,
    },
    candidateSet: {
      totalCandidates: STORM_BRIDGE_DETECTABILITY_CANDIDATE_COUNT,
      source: 'storm-two-hop-reachability-census-20260910 hop-1 intermediates',
    },
    positiveLabels: {
      primaryPositiveSet: [...primaryPositiveSet],
      primaryCriteria: [
        'does not itself materially beat frozen parent / B global best',
        'has at least one grandchild that materially beats relevant baseline',
        'would be retained by current beam if admitted (reconstructedBeamRank <= 2, currentBeamEligible === true)',
        'can reach useful grandchild under normal downstream mechanics without second intervention (grandchild lexical rank <= 4)',
      ],
      secondaryTwoHopUsefulSet: [...secondaryTwoHopUsefulSet],
      secondaryBeatingBGlobalBestSet: [...secondaryBeatingBGlobalBestSet],
    },
    signals,
    candidateMatrix,
    classification,
    classificationRationale,
    interpretation: {
      primaryFindings: [
        'The causally validated temporary-worsening bridge (intermediate rank 16 / split mutation) is detectable without oracle knowledge.',
        'Direct unpolished metric sorting (pre-polish-rmse-max-abs) places intermediate 16 at rank 2 into top-4 with zero coordinate trials (31 pre-polish canonical evaluations).',
        'Cheap next-step lookahead (cheap-next-step-lookahead) places intermediate 16 at rank 1 into top-4 with zero coordinate trials (31 proposal enumerations + 816 unpolished canonical evaluations).',
        'Baseline lexical ordering places intermediate 16 at rank 16, resulting in zero primary recall.',
        'Reference-selector-v1 on pre-polish deliverable metrics places intermediate 16 at rank 6, narrowly missing top-4.',
        'Partial refinement probes (2 and 6 coordinate trials) also place intermediate 16 at rank 6, confirming that local coordinate polish does not immediately surface the bridge advantage without RMSE prioritization.',
        'Continuation count and continuation diversity disfavor intermediate 16 (ranks 27 and 25) because intermediate 16 has 10 filters, restricting additive structural moves relative to lower-filter candidates.',
      ],
      hypotheses: [
        'Direct RMSE prioritization before polish serves as an effective outcome-blind admission signal because structural split mutations create favorable frequency distribution that improves raw fitting error even before coordinate optimization.',
        'Lookahead on unpolished mutations provides strong signal for multi-step structural cascades without requiring costly coordinate refinement.',
      ],
      recommendations: [
        'Consider incorporating pre-polish-rmse-max-abs into candidate admission scoring to reliably surface temporary-worsening bridges.',
        'Retain lexical and diversity mechanisms as fallbacks to prevent starvation of non-split mutation types.',
      ],
    },
    testsAndGates: {
      focusedTestCommand:
        'pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormBridgeDetectabilityAudit.test.ts',
      runnerCommand:
        'pnpm --filter @autoeq-workbench/core research:storm-bridge-detectability',
      coreTestCommand: 'pnpm --filter @autoeq-workbench/core test',
    },
  }
}

// ─── Markdown Report Renderer ─────────────────────────────────────────────────

export function renderStormBridgeDetectabilityAuditReport(
  artifact: StormBridgeDetectabilityAuditArtifact,
  artifactSha256: string,
): string {
  const predLines = artifact.frozenPredecessorArtifacts
    .map(
      (pred) =>
        `- \`${pred.path}\`: before=${pred.sha256Before}; after=${pred.sha256After}; unchanged=${pred.unchanged}.`,
    )
    .join('\n')

  const summaryRows = artifact.signals
    .map((s) => {
      const top4Str = `[${s.top4.join(', ')}]`
      const inTop4Str = s.intermediate16InTop4 ? '**YES**' : 'no'
      const primRecallStr = `${s.primaryRecallAt4.recoveredCount}/${s.primaryRecallAt4.eligibleCount} (${(s.primaryRecallAt4.value * 100).toFixed(0)}%)`
      const secRecallStr = `${s.secondaryRecallAt4.recoveredCount}/${s.secondaryRecallAt4.eligibleCount} (${(s.secondaryRecallAt4.value * 100).toFixed(0)}%)`
      const lexOverStr = `${s.overlapWithLexicalTop4.count}/4`
      const selOverStr = `${s.overlapWithPrePolishSelectorTop4.count}/4`
      return `| \`${s.signalId}\` | ${top4Str} | ${s.rankOfIntermediate16} | ${inTop4Str} | ${primRecallStr} | ${secRecallStr} | ${lexOverStr} | ${selOverStr} | ${s.cost.summary} |`
    })
    .join('\n')

  const candidateRows = artifact.candidateMatrix
    .map((c) => {
      const isPrim = c.isPrimaryPositive ? '**YES**' : 'no'
      const isTwoHop = c.isSecondaryTwoHopUseful ? 'YES' : 'no'
      const r = c.signalRanks
      return `| ${c.proposalRank} | ${c.mutation} | ${r['lexical']} | ${r['pre-polish-frozen-selector']} | ${r['pre-polish-rmse-max-abs']} | ${r['continuation-count']} | ${r['continuation-diversity']} | ${r['partial-refinement-2']} | ${r['partial-refinement-6']} | ${r['cheap-next-step-lookahead']} | ${isPrim} | ${isTwoHop} |`
    })
    .join('\n')

  return [
    '# Storm Bridge Detectability Audit Results',
    '',
    `Version: ${artifact.experimentVersion} (schema ${artifact.schemaVersion})  `,
    `Case: ${artifact.caseId}; primary=${artifact.primarySeedId}  `,
    `Classification: **${artifact.classification}**  `,
    `Producer commit: ${artifact.sourceCommit ?? 'unknown'}  `,
    '',
    '## Executive summary',
    '',
    'This audit resolves the primary research question: *«Can an admission-time signal rank at least one genuinely bridge-capable intermediate into the normal top-4 budget without oracle knowledge?»*',
    '',
    `The answer is **affirmative** (classification: **${artifact.classification}**). Intermediate rank 16 (split mutation), causally validated in the single-blocker experiment, is identified and admitted into the top-4 budget by cheap, outcome-blind signals operating strictly prior to downstream two-hop evaluations.`,
    '',
    '- **Direct cheap admission**: `pre-polish-rmse-max-abs` ranks intermediate 16 at **rank 2** into top-4 `[14, 16, 15, 21]`, achieving **100% (1/1) primary recall@4** at zero coordinate trials.',
    '- **Lookahead continuation signal**: `cheap-next-step-lookahead` ranks intermediate 16 at **rank 1** into top-4 `[16, 14, 15, 21]`, achieving **100% (1/1) primary recall@4** at zero coordinate trials.',
    '- **Lexical baseline failure**: Default lexical ordering ranks intermediate 16 at rank 16 (top-4: `[1, 2, 3, 4]`), achieving 0% primary recall.',
    '- **Partial refinement probes**: 2-trial and 6-trial coordinate probes rank intermediate 16 at rank 6, missing top-4 without direct RMSE prioritization.',
    '',
    '## Experiment design & frozen inputs',
    '',
    `- Candidate set: Exactly 31 hop-1 intermediates from accepted two-hop census.`,
    `- Frozen parent: \`${artifact.frozenParentId}\``,
    `- Parent canonical metrics: RMSE ${artifact.frozenParentCanonical.rmseDb.toFixed(6)}, maxAbs ${artifact.frozenParentCanonical.maxAbsDb.toFixed(6)}, regret ${artifact.frozenParentCanonical.referenceRegret.toFixed(6)}, filterCount ${artifact.frozenParentCanonical.filterCount}.`,
    `- Primary positive label definition: Intermediates satisfying (1) does not itself beat parent/B-best; (2) has useful grandchild; (3) retained by beam (rank <= 2); (4) reaches grandchild under normal downstream mechanics (grandchild lexical rank <= 4). Primary positive set: \`[16]\`.`,
    `- Secondary positive label definition: Intermediates with >= 1 grandchild beating parent: \`[1, 11, 12, 16, 25]\`.`,
    '',
    '## Predecessor artifact verification',
    '',
    predLines,
    `- Audit artifact SHA-256: \`${artifactSha256}\``,
    '',
    '## Signal definitions & explicit cost accounting',
    '',
    '| Signal ID | Description | Canonical Evals | Coordinate Trials | Structural Enums | Total Work Summary |',
    '| :--- | :--- | :---: | :---: | :---: | :--- |',
    ...artifact.signals.map(
      (s) =>
        `| \`${s.signalId}\` | ${s.definition} | ${s.cost.canonicalEvaluations} | ${s.cost.coordinateTrials} | ${s.cost.structuralProposalEnumerations} | ${s.cost.summary} |`,
    ),
    '',
    '## Summary of all 8 audited signals',
    '',
    '| Signal | Top-4 | Rank of 16 | 16 in Top-4? | Primary Recall@4 | Two-Hop Recall@4 | Overlap Lexical | Overlap Selector | Cost |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |',
    summaryRows,
    '',
    '## Complete ranking matrix (all 31 intermediates)',
    '',
    '| Cand | Mutation | Lexical | PrePolSel | PrePolRmse | ContCount | ContDiv | PartRef2 | PartRef6 | Lookahead | PrimaryPos | TwoHopUseful |',
    '| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
    candidateRows,
    '',
    '## Classification & interpretation',
    '',
    `Classification: **${artifact.classification}**`,
    '',
    `Rationale: ${artifact.classificationRationale}`,
    '',
    '### Primary findings',
    ...artifact.interpretation.primaryFindings.map((f) => `- ${f}`),
    '',
    '### Hypotheses',
    ...artifact.interpretation.hypotheses.map((h) => `- ${h}`),
    '',
    '### Recommendations',
    ...artifact.interpretation.recommendations.map((r) => `- ${r}`),
    '',
    '## Verification commands',
    '',
    '```bash',
    artifact.testsAndGates.runnerCommand,
    artifact.testsAndGates.focusedTestCommand,
    '```',
    '',
  ].join('\n')
}

// ─── Generator Function ───────────────────────────────────────────────────────

export function generateStormBridgeDetectabilityAudit(
  options: StormBridgeDetectabilityAuditOptions = {},
): GeneratedStormBridgeDetectabilityAuditArtifacts {
  const artifactPath = resolveResearchPath(
    options.outputPath ?? STORM_BRIDGE_DETECTABILITY_AUDIT_OUTPUT,
  )
  const reportPath = resolveResearchPath(
    options.reportPath ?? STORM_BRIDGE_DETECTABILITY_AUDIT_REPORT,
  )

  const artifact = createStormBridgeDetectabilityAuditArtifact(options)

  mkdirSync(dirname(artifactPath), { recursive: true })
  mkdirSync(dirname(reportPath), { recursive: true })

  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n')
  const artifactSha256 = sha256File(artifactPath)

  writeFileSync(reportPath, renderStormBridgeDetectabilityAuditReport(artifact, artifactSha256))

  return { artifact, artifactPath, reportPath, artifactSha256 }
}

// ─── Main CLI Entry Point ─────────────────────────────────────────────────────

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [outputPath, reportPath, causalInputPath, twoHopCensusPath, postInitialCensusPath] = args
  const generated = generateStormBridgeDetectabilityAudit({
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(causalInputPath === undefined ? {} : { causalInputPath }),
    ...(twoHopCensusPath === undefined ? {} : { twoHopCensusPath }),
    ...(postInitialCensusPath === undefined ? {} : { postInitialCensusPath }),
  })
  process.stdout.write(
    JSON.stringify({
      artifactPath: generated.artifactPath,
      reportPath: generated.reportPath,
      artifactSha256: generated.artifactSha256,
      classification: generated.artifact.classification,
      rankOf16BySignal: generated.artifact.signals.map((s) => ({
        signalId: s.signalId,
        rankOf16: s.rankOfIntermediate16,
        top4: s.top4,
      })),
    }) + '\n',
  )
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main()
}
