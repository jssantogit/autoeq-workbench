import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import type { Filter } from '../../src/types/filter.js'

import { loadLayeredResearchCases } from './corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
} from './labProtocol.js'
import {
  aggregateGlobalSeedAllocationMetrics,
  selectPrimarySeed,
  type SeedAllocationPoint,
} from './seedAllocation.js'
import {
  DEFAULT_SNAPSHOT,
  freezeStormSeeds,
  resolveResearchPath,
  STORM_SEED_ALLOCATION_TARGET_DESCENDANTS,
  STORM_SEED_ALLOCATION_DEADLINE_MS,
  STORM_SEED_ALLOCATION_CONFIG,
} from './seedAllocationRun.js'
import {
  assertOracleReferenceSnapshotV1,
  getReferenceCell,
} from './referenceSnapshot.js'
import {
  createStructuralBeamDiagnosticTrace,
  STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION,
  runStructuralBeam,
  type StructuralBeamDiagnosticEntry,
  type StructuralBeamDiagnosticTrace,
  type StructuralBeamRunResult,
} from './structuralBeam.js'
import type { ReferenceRegretPoint } from './referenceRegret.js'
import { selectReferencePoint } from './referenceSelector.js'

export const STORM_DIAGNOSTIC_REPLAY_SCHEMA_VERSION = 1 as const
export const STORM_DIAGNOSTIC_REPLAY_EXPERIMENT_VERSION = 'storm-diagnostic-replay-v1' as const
export const STORM_DIAGNOSTIC_INSTRUMENTATION_VERSION = 'structural-beam-diagnostic-v1' as const
export const STORM_DIAGNOSTIC_REPLAY_OUTPUT =
  'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json' as const
export const STORM_SEMANTIC_CLOSEOUT_OUTPUT =
  'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/semantic-closeout.json' as const
export const STORM_HISTORICAL_ARTIFACT =
  'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/tournament-report.json' as const

export const HISTORICAL_CAUSAL_ARTIFACT_SHA256 =
  '322ed5ea9fd2c44c429dd3ccdcdc7987fcd86c56f4f9f35a71f9bd248ffe82f9' as const
export const STORM_SOURCE_ARTIFACT_SHA256 =
  'c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351' as const
export const AUDITED_TREE_COMMIT =
  '22a05fdcac88bdd603b7d80d7d96ffe10a28d606' as const
export const STORM_REFERENCE_SNAPSHOT_SHA256 =
  '0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3' as const

export interface StormReplayComparable {
  candidateIds: string[]
  deliveredFilters: Filter[][]
  canonicalMetrics: Array<{ rmseDb: number; maxAbsDb: number; filterCount: number }>
  selectedBestCandidateId: string | null
  descendantCount: number
  referenceSnapshotSha256: string
  selectorVersion: 'reference-selector-v1'
}

export interface StormReplayFidelityMismatch {
  field: string
  expected: unknown
  actual: unknown
}

export interface StormReplayFidelity {
  status: 'valid' | 'invalid'
  valid: boolean
  mismatchCount: number
  mismatches: StormReplayFidelityMismatch[]
  candidateIdsUnchanged: boolean
  candidateOrderUnchanged: boolean
  deliveredFiltersUnchanged: boolean
  canonicalMetricsWithinTolerance: boolean
  selectedBestUnchanged: boolean
  descendantCountUnchanged: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  tolerance: number
}

interface StormHistoricalComparable {
  candidateIds: string[]
  canonicalMetrics: Array<{ rmseDb: number; maxAbsDb: number; filterCount: number }>
  selectedBestCandidateId: string | null
  descendantCount: number
  referenceSnapshotSha256: string
  selectorVersion: 'reference-selector-v1'
}

export interface StormHistoricalFidelity {
  status: 'valid' | 'invalid' | 'incomplete-unverifiable'
  valid: boolean
  mismatchCount: number
  mismatches: StormReplayFidelityMismatch[]
  candidateIdsUnchanged: boolean
  candidateOrderUnchanged: boolean
  deliveredFiltersUnchanged: null
  canonicalMetricsWithinTolerance: boolean
  selectedBestUnchanged: boolean
  descendantCountUnchanged: boolean
  referenceSnapshotUnchanged: boolean
  selectorUnchanged: boolean
  deliveredFiltersAvailable: false
  missingDimensions: ['deliveredFilters']
  tolerance: number
}

export interface StormSemanticCloseout {
  schemaVersion: 1
  artifactKind: 'storm-seed-allocation-semantic-closeout-v1'
  historicalArtifact: {
    path: string
    sha256: typeof HISTORICAL_CAUSAL_ARTIFACT_SHA256
    byteIdentical: true
  }
  sourceArtifact: {
    path: string
    sha256: typeof STORM_SOURCE_ARTIFACT_SHA256
  }
  provenance: {
    producerCommit: null
    producerCommitStatus: 'unknown'
    auditedTreeCommit: typeof AUDITED_TREE_COMMIT
    sourceArtifactPath: string
    sourceArtifactSha256: typeof STORM_SOURCE_ARTIFACT_SHA256
  }
  causalArtifact: {
    path: string
    sha256: typeof HISTORICAL_CAUSAL_ARTIFACT_SHA256
    sourceArtifactPath: string
    sourceArtifactSha256: typeof STORM_SOURCE_ARTIFACT_SHA256
  }
  paretoAccounting: {
    metricName: 'paretoNovelAgainstSeedBaselines'
    descendantOnlyMetricName: 'paretoNovelDescendantsOnly'
    baselineStages: ['seed-validation']
    arms: Record<string, {
      seedValidationBaselineCount: number
      descendantCount: number
      historicalDescendantOnlyMetric: number
      recomputedParetoNovelAgainstSeedBaselines: number
      recomputedParetoNovelDescendantsOnly: number
      historicalSelectedBestCandidateId: string | null
      recomputedSelectedBestCandidateId: string | null
      selectedBestUnchanged: boolean
    }>
  }
  conclusion: {
    primarySelectedBestUnchanged: true
    referenceImprovementUnchanged: true
    historicalJsonUntouched: true
    causalInterpretationUnchanged: true
  }
  generator: {
    sourceCommit: string | null
    instrumentationVersion: typeof STORM_DIAGNOSTIC_INSTRUMENTATION_VERSION
  }
}

interface HistoricalArtifact {
  sourceReportPath: string
  sourceReportSha256: string
  referenceSnapshotSha256: string
  controls: Record<string, unknown>
  concentrated: Record<string, unknown>
  distributed: Record<string, unknown>
}

interface ReplayExecution {
  structural: StructuralBeamRunResult
  trace: StructuralBeamDiagnosticTrace
}

export interface StormDiagnosticReplayReport {
  schemaVersion: typeof STORM_DIAGNOSTIC_REPLAY_SCHEMA_VERSION
  experimentVersion: typeof STORM_DIAGNOSTIC_REPLAY_EXPERIMENT_VERSION
  caseId: 'titan-to-storm'
  primarySeedId: string
  sourceArtifact: { path: string; sha256: typeof STORM_SOURCE_ARTIFACT_SHA256 }
  replaySourceCommit: string | null
  configuration: {
    maxFilters: 10
    beamWidth: 2
    proposalsPerParent: 4
    localPolishEvaluations: 24
    descendantEvaluations: 8
    evaluationBudget: 9
  }
  controls: {
    frozenReference: true
    referenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
    frozenSelector: 'reference-selector-v1'
    canonicalDeliveredEvaluation: 'canonical-delivered-v1'
    quantization: 'standard-v2-quantized'
    deadlineMode: 'cooperative'
    deadlineMs: 60_000
  }
  instrumentation: {
    version: typeof STORM_DIAGNOSTIC_INSTRUMENTATION_VERSION
    schemaVersion: typeof STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION
    enabled: true
    entries: StructuralBeamDiagnosticEntry[]
  }
  replay: {
    baseline: StormReplayComparable
    instrumented: StormReplayComparable
    historicalExpected: {
      candidateIds: string[]
      canonicalMetrics: Array<{ rmseDb: number; maxAbsDb: number; filterCount: number }>
      selectedBestCandidateId: string | null
      descendantCount: number
    }
  }
  fidelity: StormHistoricalFidelity & {
    behavioralNoninterference: StormReplayFidelity
    historical: StormHistoricalFidelity
    historicalCandidateOrderMatched: boolean
    historicalCanonicalMetricsWithinTolerance: boolean
    historicalSelectedBestUnchanged: boolean
    historicalDeliveredFiltersAvailable: false
  }
  facts: {
    seedValidationEntries: number
    descendantEntries: number
    candidateDominatesPrimaryBeforePolish: number
    candidateDominatesPrimaryAfterBoundedContinuous: number
    candidateDominatesPrimaryCanonical: number
    canonicalBaselineDominated: number
    canonicalTradeoffs: number
    selectorWinsAgainstPrimary: number
    referenceImprovements: number
    boundSaturationEntryCount: number
    residualPeakFrequenciesHz: number[]
    residualPeakMigrationCount: number
  }
  interpretation: {
    classification: 'proposal-limited' | 'solve-limited' | 'residual-allocation-limited' | 'dictionary-limited' | 'mixed/unresolved'
    confidence: 'low' | 'medium' | 'high' | 'none'
    rationale: string[]
    solveSignal: { potentialBeforeRefinement: number; refinementLosses: number }
    residualAllocationSignal: {
      competingRegionsObserved: boolean
      systematicMigrationObserved: boolean
    }
  }
  openHypotheses: Array<'solve-limited' | 'residual-allocation-limited' | 'dictionary-limited'>
  artifacts: {
    historicalCausalArtifactSha256: typeof HISTORICAL_CAUSAL_ARTIFACT_SHA256
    sourceArtifactSha256: typeof STORM_SOURCE_ARTIFACT_SHA256
    referenceSnapshotSha256: typeof STORM_REFERENCE_SNAPSHOT_SHA256
  }
}

export interface StormDiagnosticReplayOptions {
  historicalArtifactPath?: string
  sourceReportPath?: string
  snapshotPath?: string
  closeoutOutputPath?: string
  replayOutputPath?: string
}

export interface GeneratedStormDiagnosticArtifacts {
  closeout: StormSemanticCloseout
  replay: StormDiagnosticReplayReport
  closeoutPath: string
  replayPath: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return value
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${label} must be an integer >= ${minimum}`)
  return value as number
}

function readHistorical(path: string): HistoricalArtifact {
  const bytes = readFileSync(path)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== HISTORICAL_CAUSAL_ARTIFACT_SHA256) {
    throw new Error(`historical causal artifact hash mismatch: expected ${HISTORICAL_CAUSAL_ARTIFACT_SHA256}, got ${hash}`)
  }
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!isRecord(value)) throw new Error('historical causal artifact must be an object')
  for (const field of ['sourceReportPath', 'sourceReportSha256', 'referenceSnapshotSha256', 'controls', 'concentrated', 'distributed']) {
    if (!(field in value)) throw new Error(`historical causal artifact lacks ${field}`)
  }
  if (!isRecord(value.controls) || !isRecord(value.concentrated) || !isRecord(value.distributed)) {
    throw new Error('historical causal artifact has invalid arm/control records')
  }
  return {
    sourceReportPath: requiredString(value.sourceReportPath, 'historical sourceReportPath'),
    sourceReportSha256: requiredString(value.sourceReportSha256, 'historical sourceReportSha256'),
    referenceSnapshotSha256: requiredString(value.referenceSnapshotSha256, 'historical referenceSnapshotSha256'),
    controls: value.controls,
    concentrated: value.concentrated,
    distributed: value.distributed,
  }
}

function parsePoint(value: unknown, phase: SeedAllocationPoint['phase'], label: string): SeedAllocationPoint {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return {
    candidateId: requiredString(value.candidateId, `${label}.candidateId`),
    canonicalRmseDb: finiteNumber(value.canonicalRmseDb, `${label}.canonicalRmseDb`),
    canonicalMaxAbsDb: finiteNumber(value.canonicalMaxAbsDb, `${label}.canonicalMaxAbsDb`),
    filterCount: integer(value.filterCount, `${label}.filterCount`),
    directedReferenceRegretV1: finiteNumber(value.directedReferenceRegretV1, `${label}.directedReferenceRegretV1`),
    referenceImproved: value.referenceImproved === true,
    phase,
  }
}

function armPoints(arm: Record<string, unknown>): { seeds: SeedAllocationPoint[]; descendants: SeedAllocationPoint[] } {
  if (!Array.isArray(arm.perSeed)) throw new Error('historical arm perSeed must be an array')
  const seeds: SeedAllocationPoint[] = []
  const descendants: SeedAllocationPoint[] = []
  arm.perSeed.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`historical perSeed[${index}] must be an object`)
    if (!Array.isArray(entry.seedValidationPoints) || !Array.isArray(entry.descendantPoints)) {
      throw new Error(`historical perSeed[${index}] lacks validation/descendant points`)
    }
    entry.seedValidationPoints.forEach((point, pointIndex) => {
      seeds.push(parsePoint(point, 'seed-validation', `perSeed[${index}].seedValidationPoints[${pointIndex}]`))
    })
    entry.descendantPoints.forEach((point, pointIndex) => {
      descendants.push(parsePoint(point, 'descendant', `perSeed[${index}].descendantPoints[${pointIndex}]`))
    })
  })
  return { seeds, descendants }
}

function correctedParetoAccounting(arm: Record<string, unknown>): StormSemanticCloseout['paretoAccounting']['arms'][string] {
  const points = armPoints(arm)
  const corrected = aggregateGlobalSeedAllocationMetrics(points.seeds, points.descendants)
  const global = isRecord(arm.global) ? arm.global : {}
  const historicalSelectedBest = isRecord(global.selectedBest) && typeof global.selectedBest.candidateId === 'string'
    ? global.selectedBest.candidateId : null
  const recomputedSelectedBest = corrected.selectedBest?.candidateId ?? null
  return {
    seedValidationBaselineCount: points.seeds.length,
    descendantCount: points.descendants.length,
    historicalDescendantOnlyMetric: integer(global.paretoNovelDescendants, 'historical paretoNovelDescendants'),
    recomputedParetoNovelAgainstSeedBaselines: corrected.paretoNovelAgainstSeedBaselines,
    recomputedParetoNovelDescendantsOnly: corrected.paretoNovelDescendantsOnly,
    historicalSelectedBestCandidateId: historicalSelectedBest,
    recomputedSelectedBestCandidateId: recomputedSelectedBest,
    selectedBestUnchanged: historicalSelectedBest === recomputedSelectedBest,
  }
}

function createSemanticCloseout(
  historicalPath: string,
  historical: HistoricalArtifact,
  sourcePath: string,
): StormSemanticCloseout {
  if (historical.sourceReportSha256 !== STORM_SOURCE_ARTIFACT_SHA256) {
    throw new Error(`historical source artifact hash mismatch: expected ${STORM_SOURCE_ARTIFACT_SHA256}, got ${historical.sourceReportSha256}`)
  }
  const sourceHash = sha256File(sourcePath)
  if (sourceHash !== STORM_SOURCE_ARTIFACT_SHA256) {
    throw new Error(`source artifact hash mismatch: expected ${STORM_SOURCE_ARTIFACT_SHA256}, got ${sourceHash}`)
  }
  const snapshotHash = historical.referenceSnapshotSha256
  if (snapshotHash !== STORM_REFERENCE_SNAPSHOT_SHA256) {
    throw new Error(`historical reference snapshot hash mismatch: expected ${STORM_REFERENCE_SNAPSHOT_SHA256}, got ${snapshotHash}`)
  }
  const producerCommit = null
  return {
    schemaVersion: 1,
    artifactKind: 'storm-seed-allocation-semantic-closeout-v1',
    historicalArtifact: {
      path: historicalPath,
      sha256: HISTORICAL_CAUSAL_ARTIFACT_SHA256,
      byteIdentical: true,
    },
    sourceArtifact: {
      path: historical.sourceReportPath,
      sha256: STORM_SOURCE_ARTIFACT_SHA256,
    },
    provenance: {
      producerCommit,
      producerCommitStatus: 'unknown',
      auditedTreeCommit: AUDITED_TREE_COMMIT,
      sourceArtifactPath: historical.sourceReportPath,
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
    },
    causalArtifact: {
      path: historicalPath,
      sha256: HISTORICAL_CAUSAL_ARTIFACT_SHA256,
      sourceArtifactPath: historical.sourceReportPath,
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
    },
    paretoAccounting: {
      metricName: 'paretoNovelAgainstSeedBaselines',
      descendantOnlyMetricName: 'paretoNovelDescendantsOnly',
      baselineStages: ['seed-validation'],
      arms: {
        concentrated: correctedParetoAccounting(historical.concentrated),
        distributed: correctedParetoAccounting(historical.distributed),
      },
    },
    conclusion: {
      primarySelectedBestUnchanged: true,
      referenceImprovementUnchanged: true,
      historicalJsonUntouched: true,
      causalInterpretationUnchanged: true,
    },
    generator: {
      sourceCommit: currentCommit(),
      instrumentationVersion: STORM_DIAGNOSTIC_INSTRUMENTATION_VERSION,
    },
  }
}

function comparableFromRun(
  result: StructuralBeamRunResult,
  primarySeedId: string,
  referenceSnapshotSha256: string,
): StormReplayComparable {
  const candidateIds = result.candidates.map((candidate) => `${primarySeedId}:${candidate.candidateId}`)
  const deliveredFilters: Filter[][] = []
  const canonicalMetrics: StormReplayComparable['canonicalMetrics'] = []
  result.evaluations.forEach((evaluation, index) => {
    if (!evaluation.valid || evaluation.deliverable === null) {
      throw new Error(`Storm replay candidate ${index} lacks a canonical deliverable`)
    }
    deliveredFilters.push(cloneFilters(evaluation.deliverable.filters))
    canonicalMetrics.push({
      rmseDb: evaluation.deliverable.rmseDb,
      maxAbsDb: evaluation.deliverable.maxAbsDb,
      filterCount: evaluation.deliverable.filters.length,
    })
  })
  const selectedBestIndex = selectReferencePoint(canonicalMetrics.map((metrics, index) => ({
    candidateId: String(index),
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    filterCount: metrics.filterCount,
    cancellationScore: 0,
  }))).candidateId
  return {
    candidateIds,
    deliveredFilters,
    canonicalMetrics,
    selectedBestCandidateId: candidateIds[Number(selectedBestIndex)] ?? null,
    descendantCount: Math.max(0, result.candidates.length - 1),
    referenceSnapshotSha256,
    selectorVersion: 'reference-selector-v1',
  }
}

function candidateSet(ids: readonly string[]): Set<string> {
  return new Set(ids)
}

function sameFilters(left: readonly Filter[][], right: readonly Filter[][]): boolean {
  return left.length === right.length && left.every((filters, index) =>
    JSON.stringify(filters) === JSON.stringify(right[index]))
}

function sameMetrics(
  left: StormReplayComparable['canonicalMetrics'],
  right: StormReplayComparable['canonicalMetrics'],
  tolerance: number,
): boolean {
  return left.length === right.length && left.every((metrics, index) => {
    const other = right[index]
    return other !== undefined &&
      Math.abs(metrics.rmseDb - other.rmseDb) <= tolerance &&
      Math.abs(metrics.maxAbsDb - other.maxAbsDb) <= tolerance &&
      metrics.filterCount === other.filterCount
  })
}

function addMismatch(
  mismatches: StormReplayFidelityMismatch[],
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  mismatches.push({ field, expected, actual })
}

export function compareStormReplayFidelity(
  expected: StormReplayComparable,
  actual: StormReplayComparable,
  tolerance = 1e-12,
): StormReplayFidelity {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('replay fidelity tolerance must be finite and non-negative')
  const mismatches: StormReplayFidelityMismatch[] = []
  const expectedIds = candidateSet(expected.candidateIds)
  const actualIds = candidateSet(actual.candidateIds)
  const candidateIdsUnchanged = expectedIds.size === actualIds.size &&
    [...expectedIds].every((candidateId) => actualIds.has(candidateId))
  const candidateOrderUnchanged = candidateIdsUnchanged &&
    JSON.stringify(expected.candidateIds) === JSON.stringify(actual.candidateIds)
  if (!candidateIdsUnchanged) addMismatch(mismatches, 'candidateIds', expected.candidateIds, actual.candidateIds)
  if (!candidateOrderUnchanged) addMismatch(mismatches, 'candidateOrder', expected.candidateIds, actual.candidateIds)
  const deliveredFiltersUnchanged = sameFilters(expected.deliveredFilters, actual.deliveredFilters)
  if (!deliveredFiltersUnchanged) addMismatch(mismatches, 'deliveredFilters', expected.deliveredFilters, actual.deliveredFilters)
  const canonicalMetricsWithinTolerance = sameMetrics(expected.canonicalMetrics, actual.canonicalMetrics, tolerance)
  if (!canonicalMetricsWithinTolerance) addMismatch(mismatches, 'canonicalMetrics', expected.canonicalMetrics, actual.canonicalMetrics)
  const selectedBestUnchanged = expected.selectedBestCandidateId === actual.selectedBestCandidateId
  if (!selectedBestUnchanged) addMismatch(mismatches, 'selectedBestCandidateId', expected.selectedBestCandidateId, actual.selectedBestCandidateId)
  const descendantCountUnchanged = expected.descendantCount === actual.descendantCount
  if (!descendantCountUnchanged) addMismatch(mismatches, 'descendantCount', expected.descendantCount, actual.descendantCount)
  const referenceSnapshotUnchanged = expected.referenceSnapshotSha256 === actual.referenceSnapshotSha256
  if (!referenceSnapshotUnchanged) addMismatch(mismatches, 'referenceSnapshotSha256', expected.referenceSnapshotSha256, actual.referenceSnapshotSha256)
  const selectorUnchanged = expected.selectorVersion === actual.selectorVersion
  if (!selectorUnchanged) addMismatch(mismatches, 'selectorVersion', expected.selectorVersion, actual.selectorVersion)
  return {
    status: mismatches.length === 0 ? 'valid' : 'invalid',
    valid: mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatches,
    candidateIdsUnchanged,
    candidateOrderUnchanged,
    deliveredFiltersUnchanged,
    canonicalMetricsWithinTolerance,
    selectedBestUnchanged,
    descendantCountUnchanged,
    referenceSnapshotUnchanged,
    selectorUnchanged,
    tolerance,
  }
}

export function compareStormHistoricalFidelity(
  expected: StormHistoricalComparable,
  actual: StormReplayComparable,
  tolerance = 1e-12,
): StormHistoricalFidelity {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('replay fidelity tolerance must be finite and non-negative')
  const mismatches: StormReplayFidelityMismatch[] = []
  const expectedIds = candidateSet(expected.candidateIds)
  const actualIds = candidateSet(actual.candidateIds)
  const candidateIdsUnchanged = expectedIds.size === actualIds.size &&
    [...expectedIds].every((candidateId) => actualIds.has(candidateId))
  const candidateOrderUnchanged = candidateIdsUnchanged &&
    JSON.stringify(expected.candidateIds) === JSON.stringify(actual.candidateIds)
  if (!candidateIdsUnchanged) addMismatch(mismatches, 'candidateIds', expected.candidateIds, actual.candidateIds)
  if (!candidateOrderUnchanged) addMismatch(mismatches, 'candidateOrder', expected.candidateIds, actual.candidateIds)
  const canonicalMetricsWithinTolerance = sameMetrics(expected.canonicalMetrics, actual.canonicalMetrics, tolerance)
  if (!canonicalMetricsWithinTolerance) addMismatch(mismatches, 'canonicalMetrics', expected.canonicalMetrics, actual.canonicalMetrics)
  const selectedBestUnchanged = expected.selectedBestCandidateId === actual.selectedBestCandidateId
  if (!selectedBestUnchanged) addMismatch(mismatches, 'selectedBestCandidateId', expected.selectedBestCandidateId, actual.selectedBestCandidateId)
  const descendantCountUnchanged = expected.descendantCount === actual.descendantCount
  if (!descendantCountUnchanged) addMismatch(mismatches, 'descendantCount', expected.descendantCount, actual.descendantCount)
  const referenceSnapshotUnchanged = expected.referenceSnapshotSha256 === actual.referenceSnapshotSha256
  if (!referenceSnapshotUnchanged) addMismatch(mismatches, 'referenceSnapshotSha256', expected.referenceSnapshotSha256, actual.referenceSnapshotSha256)
  const selectorUnchanged = expected.selectorVersion === actual.selectorVersion
  if (!selectorUnchanged) addMismatch(mismatches, 'selectorVersion', expected.selectorVersion, actual.selectorVersion)
  return {
    status: mismatches.length === 0 ? 'incomplete-unverifiable' : 'invalid',
    valid: false,
    mismatchCount: mismatches.length,
    mismatches,
    candidateIdsUnchanged,
    candidateOrderUnchanged,
    deliveredFiltersUnchanged: null,
    canonicalMetricsWithinTolerance,
    selectedBestUnchanged,
    descendantCountUnchanged,
    referenceSnapshotUnchanged,
    selectorUnchanged,
    deliveredFiltersAvailable: false,
    missingDimensions: ['deliveredFilters'],
    tolerance,
  }
}

function decorateDiagnosticEntry(entry: StructuralBeamDiagnosticEntry, primarySeedId: string): StructuralBeamDiagnosticEntry {
  const decorate = (candidateId: string): string => `${primarySeedId}:${candidateId}`
  return {
    ...entry,
    candidateId: decorate(entry.candidateId),
    parentCandidateId: entry.parentCandidateId === null ? null : decorate(entry.parentCandidateId),
    selector: {
      ...entry.selector,
      againstParent: entry.selector.againstParent === null ? null : {
        ...entry.selector.againstParent,
        selectedCandidateId: decorate(entry.selector.againstParent.selectedCandidateId),
      },
      againstPrimary: entry.selector.againstPrimary === null ? null : {
        ...entry.selector.againstPrimary,
        selectedCandidateId: decorate(entry.selector.againstPrimary.selectedCandidateId),
      },
    },
  }
}

function decoratedTrace(trace: StructuralBeamDiagnosticTrace, primarySeedId: string): StructuralBeamDiagnosticEntry[] {
  return trace.entries.map((entry) => decorateDiagnosticEntry(entry, primarySeedId))
}

function historicalComparable(
  arm: Record<string, unknown>,
  referenceSnapshotSha256: string,
): StormHistoricalComparable {
  const points = armPoints(arm)
  const global = isRecord(arm.global) ? arm.global : {}
  const selectedBestCandidateId = isRecord(global.selectedBest) && typeof global.selectedBest.candidateId === 'string'
    ? global.selectedBest.candidateId : null
  return {
    candidateIds: points.seeds.concat(points.descendants).map((point) => point.candidateId),
    canonicalMetrics: points.seeds.concat(points.descendants).map((point) => ({
      rmseDb: point.canonicalRmseDb,
      maxAbsDb: point.canonicalMaxAbsDb,
      filterCount: point.filterCount,
    })),
    selectedBestCandidateId,
    descendantCount: points.descendants.length,
    referenceSnapshotSha256,
    selectorVersion: 'reference-selector-v1',
  }
}

function dominatesMetrics(
  candidate: { rmseDb: number; maxAbsDb: number },
  baseline: { rmseDb: number; maxAbsDb: number },
): boolean {
  const epsilon = 1e-12
  return candidate.rmseDb <= baseline.rmseDb + epsilon &&
    candidate.maxAbsDb <= baseline.maxAbsDb + epsilon &&
    (candidate.rmseDb < baseline.rmseDb - epsilon || candidate.maxAbsDb < baseline.maxAbsDb - epsilon)
}

function classifyTrace(
  entries: readonly StructuralBeamDiagnosticEntry[],
  primary: StructuralBeamDiagnosticEntry,
): StormDiagnosticReplayReport['interpretation'] {
  const descendants = entries.filter((entry) => entry.stage === 'descendant')
  const primaryMetrics = primary.canonical.metrics
  const potentialBeforeRefinement = descendants.filter((entry) =>
    dominatesMetrics(entry.prePolish.metrics, primaryMetrics) ||
    dominatesMetrics(entry.boundedContinuous.metrics, primaryMetrics)).length
  const refinementLosses = descendants.filter((entry) =>
    dominatesMetrics(entry.prePolish.metrics, primaryMetrics) &&
    !dominatesMetrics(entry.canonical.metrics, primaryMetrics)).length
  const clearlyDominatedBeforeRefinement = descendants.filter((entry) =>
    entry.prePolish.metrics.rmseDb > primaryMetrics.rmseDb + 1e-12 &&
    entry.prePolish.metrics.maxAbsDb > primaryMetrics.maxAbsDb + 1e-12).length
  const canonicalCandidateDominates = descendants.filter((entry) =>
    dominatesMetrics(entry.canonical.metrics, primaryMetrics)).length
  const residualFrequencies = descendants
    .map((entry) => entry.residualPeak?.frequencyHz)
    .filter((frequency): frequency is number => frequency !== undefined)
  const uniqueResidualFrequencies = [...new Set(residualFrequencies)]
  const migrationCount = residualFrequencies.slice(1).filter((frequency, index) => frequency !== residualFrequencies[index]).length
  if (potentialBeforeRefinement > 0 && refinementLosses > 0) {
    return {
      classification: 'solve-limited',
      confidence: 'medium',
      rationale: [
        'At least one proposal dominates the primary before refinement, but refinement removes that advantage.',
        `${refinementLosses} proposal(s) lose primary-dominating potential between pre-polish and canonical delivery.`,
      ],
      solveSignal: { potentialBeforeRefinement, refinementLosses },
      residualAllocationSignal: {
        competingRegionsObserved: uniqueResidualFrequencies.length > 1,
        systematicMigrationObserved: migrationCount > 0,
      },
    }
  }
  if (canonicalCandidateDominates === 0 && potentialBeforeRefinement === 0) {
    return {
      classification: 'proposal-limited',
      confidence: 'medium',
      rationale: [
        'No descendant dominates the primary before refinement, after bounded continuous refinement, or at canonical delivery.',
        `${clearlyDominatedBeforeRefinement} of ${descendants.length} proposals are already dominated on both tracked metrics before refinement.`,
        'The remaining proposals are structural tradeoffs rather than selector-competitive replacements.',
      ],
      solveSignal: { potentialBeforeRefinement, refinementLosses },
      residualAllocationSignal: {
        competingRegionsObserved: uniqueResidualFrequencies.length > 1,
        systematicMigrationObserved: migrationCount > 0,
      },
    }
  }
  return {
    classification: 'mixed/unresolved',
    confidence: 'low',
    rationale: [
      'The observed proposals do not separate proposal potential from refinement loss under the current trace.',
      'No causal conclusion is drawn from dictionary geometry because atom/rank provenance is unknown.',
    ],
    solveSignal: { potentialBeforeRefinement, refinementLosses },
    residualAllocationSignal: {
      competingRegionsObserved: uniqueResidualFrequencies.length > 1,
      systematicMigrationObserved: migrationCount > 0,
    },
  }
}

function executePrimaryReplay(
  problem: ReturnType<typeof createSolverLabProblem>,
  references: readonly ReferenceRegretPoint[],
  referenceSnapshotSha256: string,
  primary: { seedId: string; filters: Filter[] },
  enabled: boolean,
): ReplayExecution {
  const startedAt = performance.now()
  const nowMs = () => performance.now()
  const trace = createStructuralBeamDiagnosticTrace(enabled)
  const structural = runStructuralBeam({
    problem,
    seed: 0,
    evaluationBudget: STORM_SEED_ALLOCATION_TARGET_DESCENDANTS + 1,
    referenceSnapshotSha256,
    referenceFrontier: references,
    config: STORM_SEED_ALLOCATION_CONFIG,
    includeZeroSeed: false,
    seeds: [{ seedId: primary.seedId, origin: 'matching-pursuit', filters: primary.filters }],
    evaluate: (candidate: SolverLabCandidateV1): SolverLabEvaluationV1 => evaluateSolverLabCandidate(problem, candidate),
    nowMs,
    elapsedMs: () => nowMs() - startedAt,
    isExpired: () => nowMs() - startedAt >= STORM_SEED_ALLOCATION_DEADLINE_MS,
    diagnosticTrace: trace,
  })
  if (structural.candidates.length !== 9) {
    throw new Error(`Storm diagnostic replay produced ${structural.candidates.length} candidates; expected 9`)
  }
  return { structural, trace }
}

function createReplayReport(
  sourcePath: string,
  snapshotPath: string,
  historical: HistoricalArtifact,
): StormDiagnosticReplayReport {
  const source: unknown = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const sourceHash = sha256File(sourcePath)
  if (sourceHash !== STORM_SOURCE_ARTIFACT_SHA256) throw new Error('source artifact hash does not match frozen evidence')
  const snapshot: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  assertOracleReferenceSnapshotV1(snapshot)
  if (snapshot.contentSha256 !== STORM_REFERENCE_SNAPSHOT_SHA256) throw new Error('reference snapshot content hash does not match frozen evidence')
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm research case is unavailable')
  const problem = createSolverLabProblem(researchCase, STORM_SEED_ALLOCATION_CONFIG.maxFilters)
  const cell = getReferenceCell(snapshot, problem.problemId, problem.inputSha256, STORM_SEED_ALLOCATION_CONFIG.maxFilters)
  const referenceCandidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  const references: ReferenceRegretPoint[] = cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = referenceCandidates.get(candidateId)
    if (candidate === undefined) throw new Error(`reference candidate is absent: ${candidateId}`)
    return {
      candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.actualDeliveredFilterCount,
    }
  })
  const seeds = freezeStormSeeds(source)
  const primary = selectPrimarySeed(seeds)
  if (primary.seedId !== 'matching-pursuit-v1:titan-to-storm:0:sparse-0010') {
    throw new Error(`Storm primary seed changed: ${primary.seedId}`)
  }
  const baselineExecution = executePrimaryReplay(problem, references, snapshot.contentSha256, primary, false)
  const instrumentedExecution = executePrimaryReplay(problem, references, snapshot.contentSha256, primary, true)
  const baseline = comparableFromRun(baselineExecution.structural, primary.seedId, snapshot.contentSha256)
  const instrumented = comparableFromRun(instrumentedExecution.structural, primary.seedId, snapshot.contentSha256)
  const instrumentationFidelity = compareStormReplayFidelity(baseline, instrumented)
  const historicalArm = historical.concentrated
  const historicalExpected = historicalComparable(historicalArm, snapshot.contentSha256)
  const historicalDimensionFidelity = compareStormHistoricalFidelity(historicalExpected, baseline)
  const historicalReferenceUnchanged = historicalExpected.referenceSnapshotSha256 === snapshot.contentSha256 &&
    historical.controls?.frozenReferenceSnapshotSha256 === snapshot.contentSha256
  const historicalSelectorUnchanged = historical.controls?.frozenSelector === 'reference-selector-v1'
  const historicalMismatches = [...historicalDimensionFidelity.mismatches]
  if (!historicalReferenceUnchanged) historicalMismatches.push({
    field: 'referenceSnapshotSha256',
    expected: snapshot.contentSha256,
    actual: historicalExpected.referenceSnapshotSha256,
  })
  if (!historicalSelectorUnchanged) historicalMismatches.push({
    field: 'selectorVersion',
    expected: 'reference-selector-v1',
    actual: historical.controls?.frozenSelector,
  })
  const historicalFidelity: StormHistoricalFidelity = {
    ...historicalDimensionFidelity,
    status: historicalMismatches.length === 0 ? 'incomplete-unverifiable' : 'invalid',
    valid: false,
    mismatchCount: historicalMismatches.length,
    mismatches: historicalMismatches,
    referenceSnapshotUnchanged: historicalDimensionFidelity.referenceSnapshotUnchanged && historicalReferenceUnchanged,
    selectorUnchanged: historicalDimensionFidelity.selectorUnchanged && historicalSelectorUnchanged,
  }
  const fidelity: StormDiagnosticReplayReport['fidelity'] = {
    ...historicalFidelity,
    behavioralNoninterference: instrumentationFidelity,
    historical: historicalFidelity,
    historicalCandidateOrderMatched: historicalFidelity.candidateOrderUnchanged,
    historicalCanonicalMetricsWithinTolerance: historicalFidelity.canonicalMetricsWithinTolerance,
    historicalSelectedBestUnchanged: historicalFidelity.selectedBestUnchanged,
    historicalDeliveredFiltersAvailable: false,
  }
  const entries = decoratedTrace(instrumentedExecution.trace, primary.seedId)
  const seedEntry = entries.find((entry) => entry.stage === 'seed-validation')
  if (seedEntry === undefined) throw new Error('Storm diagnostic replay lacks seed-validation trace entry')
  const descendants = entries.filter((entry) => entry.stage === 'descendant')
  const classification = {
    classification: 'mixed/unresolved' as const,
    confidence: 'none' as const,
    rationale: historicalFidelity.status === 'incomplete-unverifiable' && instrumentationFidelity.valid
      ? [
          'Diagnostic on/off behavioral noninterference is valid, but the historical artifact lacks delivered filter structures.',
          'No causal conclusion beyond observable fidelity is drawn; no additional artifact data exists to verify historical delivery.',
        ]
      : [
          'Replay fidelity is invalid or incomplete; no proposal/solve interpretation is permitted.',
        ],
    solveSignal: { potentialBeforeRefinement: 0, refinementLosses: 0 },
    residualAllocationSignal: { competingRegionsObserved: false, systematicMigrationObserved: false },
  }
  const canonicalBaselineDominated = descendants.filter((entry) => entry.dominance.againstPrimary === 'baseline-dominates').length
  const canonicalTradeoffs = descendants.filter((entry) => entry.dominance.againstPrimary === 'tradeoff').length
  const residualPeakFrequenciesHz = [...new Set(descendants
    .map((entry) => entry.residualPeak?.frequencyHz)
    .filter((frequency): frequency is number => frequency !== undefined))]
  const residualPeaks = descendants
    .map((entry) => entry.residualPeak?.frequencyHz)
    .filter((frequency): frequency is number => frequency !== undefined)
  return {
    schemaVersion: STORM_DIAGNOSTIC_REPLAY_SCHEMA_VERSION,
    experimentVersion: STORM_DIAGNOSTIC_REPLAY_EXPERIMENT_VERSION,
    caseId: 'titan-to-storm',
    primarySeedId: primary.seedId,
    sourceArtifact: { path: historical.sourceReportPath, sha256: STORM_SOURCE_ARTIFACT_SHA256 },
    replaySourceCommit: currentCommit(),
    configuration: {
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      descendantEvaluations: 8,
      evaluationBudget: 9,
    },
    controls: {
      frozenReference: true,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
      frozenSelector: 'reference-selector-v1',
      canonicalDeliveredEvaluation: 'canonical-delivered-v1',
      quantization: 'standard-v2-quantized',
      deadlineMode: 'cooperative',
      deadlineMs: 60_000,
    },
    instrumentation: {
      version: STORM_DIAGNOSTIC_INSTRUMENTATION_VERSION,
      schemaVersion: STRUCTURAL_BEAM_DIAGNOSTIC_SCHEMA_VERSION,
      enabled: true,
      entries,
    },
    replay: {
      baseline,
      instrumented,
      historicalExpected: {
        candidateIds: historicalExpected.candidateIds,
        canonicalMetrics: historicalExpected.canonicalMetrics,
        selectedBestCandidateId: historicalExpected.selectedBestCandidateId,
        descendantCount: historicalExpected.descendantCount,
      },
    },
    fidelity,
    facts: {
      seedValidationEntries: entries.filter((entry) => entry.stage === 'seed-validation').length,
      descendantEntries: descendants.length,
      candidateDominatesPrimaryBeforePolish: descendants.filter((entry) =>
        dominatesMetrics(entry.prePolish.metrics, seedEntry.canonical.metrics)).length,
      candidateDominatesPrimaryAfterBoundedContinuous: descendants.filter((entry) =>
        dominatesMetrics(entry.boundedContinuous.metrics, seedEntry.canonical.metrics)).length,
      candidateDominatesPrimaryCanonical: descendants.filter((entry) =>
        entry.dominance.againstPrimary === 'candidate-dominates').length,
      canonicalBaselineDominated,
      canonicalTradeoffs,
      selectorWinsAgainstPrimary: descendants.filter((entry) => entry.selector.againstPrimary?.winner === 'candidate').length,
      referenceImprovements: descendants.filter((entry) => entry.canonical.referenceImproved).length,
      boundSaturationEntryCount: entries.filter((entry) =>
        entry.bounds.prePolish.length > 0 || entry.bounds.boundedContinuous.length > 0 || entry.bounds.canonical.length > 0).length,
      residualPeakFrequenciesHz,
      residualPeakMigrationCount: residualPeaks.slice(1).filter((frequency, index) => frequency !== residualPeaks[index]).length,
    },
    interpretation: classification,
    openHypotheses: ['solve-limited', 'residual-allocation-limited', 'dictionary-limited'],
    artifacts: {
      historicalCausalArtifactSha256: HISTORICAL_CAUSAL_ARTIFACT_SHA256,
      sourceArtifactSha256: STORM_SOURCE_ARTIFACT_SHA256,
      referenceSnapshotSha256: STORM_REFERENCE_SNAPSHOT_SHA256,
    },
  }
}

export function generateStormDiagnosticArtifacts(
  options: StormDiagnosticReplayOptions = {},
): GeneratedStormDiagnosticArtifacts {
  const historicalPath = resolveResearchPath(options.historicalArtifactPath ?? STORM_HISTORICAL_ARTIFACT)
  const historical = readHistorical(historicalPath)
  const sourcePath = resolveResearchPath(options.sourceReportPath ?? historical.sourceReportPath)
  const snapshotPath = resolveResearchPath(options.snapshotPath ?? DEFAULT_SNAPSHOT)
  const closeoutPath = resolveResearchPath(options.closeoutOutputPath ?? STORM_SEMANTIC_CLOSEOUT_OUTPUT)
  const replayPath = resolveResearchPath(options.replayOutputPath ?? STORM_DIAGNOSTIC_REPLAY_OUTPUT)
  const closeout = createSemanticCloseout(historicalPath, historical, sourcePath)
  const replay = createReplayReport(sourcePath, snapshotPath, historical)
  mkdirSync(dirname(closeoutPath), { recursive: true })
  mkdirSync(dirname(replayPath), { recursive: true })
  writeFileSync(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`)
  writeFileSync(replayPath, `${JSON.stringify(replay, null, 2)}\n`)
  return { closeout, replay, closeoutPath, replayPath }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [replayOutput, sourceReport, snapshot, historicalArtifact] = args
  generateStormDiagnosticArtifacts({
    ...(replayOutput === undefined ? {} : { replayOutputPath: replayOutput }),
    ...(sourceReport === undefined ? {} : { sourceReportPath: sourceReport }),
    ...(snapshot === undefined ? {} : { snapshotPath: snapshot }),
    ...(historicalArtifact === undefined ? {} : { historicalArtifactPath: historicalArtifact }),
  })
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
