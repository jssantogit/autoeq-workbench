import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { calculateBandMetrics } from '../../src/metrics/bandMetrics.js'
import { calculateErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { auditCancellations } from '../../src/autoeq/cancellation.js'
import { createEvaluationGrid } from '../../src/config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../src/curves/derive.js'
import { parseCurveText } from '../../src/io/parseCurve.js'
import type { Filter } from '../../src/types/filter.js'
import type { Curve, Normalization } from '../../src/types/curve.js'
import {
  referenceSelectorKey,
  semanticFilterKey,
  type SearchState,
  type ResolvedStructuralSearchConfig,
} from '../../src/autoeq/v2/structuralSearch.js'
import {
  C3_BATCH_C_CASE_IDS,
  C3_CORPUS_CLASSIFICATION,
  C3_CORPUS_COMMIT,
  C3_CORPUS_EVIDENCE_SHA256,
  C3_NORMALIZATION,
  C3_OLD_STRUCTURAL_VNEXT_CASE_IDS,
  C3_UPSTREAM_COMMIT,
  C3_UPSTREAM_TREE,
  runC3ObserverFidelity,
  runC3DeterministicBaseline,
  resolveC3SearchConfig,
  type C3ObserverFidelity,
  type C3DeterministicTrajectory,
  type C3PreparedSearchGrid,
  type C3ObservedState,
} from './c3FilterKneeCensus.js'

export const C2_FROZEN_BOUNDARY = '04f49e2bd20e1c2928dfef7a1ae52412a12c3eb7' as const
export const C2_C3_EVIDENCE_SHA256 = '6028c10e63deff45b9963e6d914eccd3705a6825267e8d5f0cdb2c811b56d685' as const
export const C2_CORPUS_VERSION = 'fresh-real-corpus-v1.2' as const
export const C2_CORPUS_COMMIT = C3_CORPUS_COMMIT
export const C2_CORPUS_CLASSIFICATION = C3_CORPUS_CLASSIFICATION
export const C2_CORPUS_EVIDENCE_SHA256 = C3_CORPUS_EVIDENCE_SHA256
export const C2_UPSTREAM_COMMIT = C3_UPSTREAM_COMMIT
export const C2_UPSTREAM_TREE = C3_UPSTREAM_TREE

export const C2_BATCH_B_DEVELOPMENT_IDS = Object.freeze([
  'frc1.1-08-0000f6762889',
  'frc1.1-11-000279686a75',
  'frc1.1-07-0000c470a9b3',
] as const)
export const C2_BATCH_B_HOLDOUT_IDS = Object.freeze([
  'frc1.1-14-00025d5729a1',
  'frc1.1-13-000225a01a6d',
  'frc1.1-17-00036da52192',
] as const)
export const C2_BATCH_C_CASE_IDS = Object.freeze([...C3_BATCH_C_CASE_IDS] as const)
export const C2_OLD_STRUCTURAL_VNEXT_CASE_IDS = Object.freeze([...C3_OLD_STRUCTURAL_VNEXT_CASE_IDS] as const)

export const C2_MAX_GENERATIONS = 31 as const
export const C2_STRUCTURAL_CEILING = 43 as const
export const C2_EFFORT_LEVEL = 6 as const
export const C2_NORMALIZATION = C3_NORMALIZATION
export const C2_ARTIFACT_RELATIVE_DIR = '.research-artifacts/objective-c2-robust-loss-dev-census' as const
export const C2_HUBER_DELTA_DB = 0.75 as const
export const C2_DIVERGENCE_CORRELATION_THRESHOLD = 0.995 as const

const C2_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const C2_CORPUS_ARTIFACT_DIR = resolve(C2_REPOSITORY_ROOT, '.research-artifacts/fresh-real-corpus-v1-metadata-repair')
const C2_CACHE_DIR = resolve(C2_REPOSITORY_ROOT, '.research-cache/fresh-real-corpus-v1.2')

type CurveArtifact = {
  collection: string
  form: string
  model: string
  processedName: string
  deviceFamily: string
  rig: string
  sourceUrls: string[]
  path: string
  blobSha: string
  identity: string
  upstreamSha256: string
  byteLength: number
  originalTerminalFrequencyHz: number
  originalTerminalDb: number
  canonicalTerminalFrequencyHz: number
  canonicalTerminalDb: number
  transformation: string | null
  originalParsedPointsSha256: string
  canonicalParsedPointsSha256: string
  parserCanonicalizerVersion: number
}

type CorpusCaseArtifact = {
  id: string
  source: CurveArtifact
  target: CurveArtifact
  pairing: string
  normalization: typeof C2_NORMALIZATION
  batch: 'A' | 'B' | 'C'
  split: 'development' | 'holdout'
}

type FrozenCorpusArtifact = {
  manifest: Record<string, unknown>
  cases: CorpusCaseArtifact[]
  provenance: { cases: CorpusCaseArtifact[]; repository: string; commit: string; tree: string }
  manifestSha256: string
  casesSha256: string
  provenanceSha256: string
}

export type C2LossName = 'CONTROL' | 'MSE' | 'MAE' | 'HUBER-075'
export const C2_LOSS_NAMES = Object.freeze(['CONTROL', 'MSE', 'MAE', 'HUBER-075'] as const)

export type C2Losses = {
  CONTROL: number
  MSE: number
  MAE: number
  'HUBER-075': number
}

export interface C2PreparedCase extends C3PreparedSearchGrid {
  id: string
  batch: string
  split: string
  source: CurveArtifact
  target: CurveArtifact
}

export interface C2ResidualDiagnostics {
  mse: number
  rmseDb: number
  maeDb: number
  huber075: number
  maxAbsDb: number
  normalizedViolation: number
  bands: Record<string, {
    maeDb: number
    rmseDb: number
    maxAbsDb: number
  }>
  outlierConcentration: {
    squaredErrorWorst1Percent: number
    squaredErrorWorst5Percent: number
    absoluteErrorWorst1Percent: number
    absoluteErrorWorst5Percent: number
  }
}

export interface C2StateDiagnostics extends C2ResidualDiagnostics {
  filterCount: number
  cancellationScore: number
  qP50: number
  qP90: number
  qMax: number
  maxAbsGainDb: number
  sumAbsGainDb: number
  opposingNearbyCancellationPairCount: number
}

interface C2StateRecord {
  filterStateKey: string
  filters: Filter[]
  residualDb: number[]
  losses: C2Losses
  diagnostics: C2StateDiagnostics
  stage: C3ObservedState['stage']
  generation: number | undefined
  everAccepted: boolean
  everRetained: boolean
  everFinal: boolean
  rank?: Record<C2LossName, number>
}

export interface C2StateEvidence {
  filterStateKey: string
  filterCount: number
  losses: C2Losses
  rmseDb: number
  maeDb: number
  maxAbsDb: number
  normalizedViolation: number
  provenance: {
    earliestStage: string
    earliestGeneration: number | null
    everAccepted: boolean
    everRetained: boolean
    everFinal: boolean
  }
  ranks: Record<C2LossName, number>
}

export interface C2SelectedWinner {
  loss: C2LossName
  filterStateKey: string
  filterCount: number
  losses: C2Losses
  diagnostics: C2StateDiagnostics
  provenance: C2StateEvidence['provenance']
}

export interface C2ExactNWinner {
  N: number
  stateCount: number
  winners: Record<C2LossName, { filterStateKey: string; loss: number; filterCount: number }>
}

export interface C2DivergenceEvidence {
  globalWinnerDiffersFromMSE: { MAE: boolean; 'HUBER-075': boolean }
  globalWinnerDiffersFromControl: { MAE: boolean; 'HUBER-075': boolean }
  exactN: {
    comparableCount: number
    MAE: { differingCount: number; fraction: number; firstN: number | null; lastN: number | null }
    'HUBER-075': { differingCount: number; fraction: number; firstN: number | null; lastN: number | null }
  }
  lossConditions: {
    MAE: boolean
    'HUBER-075': boolean
  }
  robustLossDivergence: boolean
  huberMseCorrelationBelowThreshold: boolean
}

export interface C2CaseEvidence {
  id: string
  batch: 'B'
  split: 'development'
  source: Pick<CurveArtifact, 'identity' | 'path' | 'upstreamSha256' | 'canonicalParsedPointsSha256' | 'transformation'>
  target: Pick<CurveArtifact, 'identity' | 'path' | 'upstreamSha256' | 'canonicalParsedPointsSha256' | 'transformation'>
  normalization: typeof C2_NORMALIZATION
  trajectory: {
    maxGenerations: number
    completedGenerationCount: number
    terminalGeneration: number
    terminalReason: string
    result: { filterCount: number; rmseDb: number; maxAbsDb: number; maeDb: number; filterStateKey: string }
    traceSha256: string
    observationSha256: string
  }
  observerFidelity: {
    equivalent: boolean
    resultEqual: boolean
    completedGenerationCountEqual: boolean
    retainedBeamSequenceEqual: boolean
    workCountersEqual: boolean
    naturalTerminationEqual: boolean
    ordinaryDecisionTraceEqual: boolean
  }
  uniqueEvaluatedStateCount: number
  states: C2StateEvidence[]
  globalWinners: Record<C2LossName, C2SelectedWinner>
  exactN: C2ExactNWinner[]
  rankCorrelations: {
    MSE_MAE: number
    MSE_HUBER075: number
    MAE_HUBER075: number
    CONTROL_HUBER075: number
  }
  divergence: C2DivergenceEvidence
  developmentGate: 'ROBUST_LOSS_DIVERGENCE' | 'NO_ROBUST_LOSS_DIVERGENCE'
}

export interface C2CensusResult {
  manifest: Record<string, unknown>
  aggregate: Record<string, unknown>
  cases: C2CaseEvidence[]
  evidenceSha256: string
  outputDir: string
}

export type C2aClassification =
  | 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED'
  | 'ROBUST_LOSS_PREFERENCE_SIGNAL_NOT_SUPPORTED'
  | 'INCONCLUSIVE'

export interface C2aGateResult {
  coverage: number
  classification: C2aClassification
  candidateCounts: { MAE: number; 'HUBER-075': number }
  frozenC2bCandidate: 'MAE' | 'HUBER-075' | null
}

type C2aGateInput = {
  divergence: Pick<C2DivergenceEvidence, 'robustLossDivergence' | 'lossConditions' | 'huberMseCorrelationBelowThreshold'>
}

export function classifyC2aGate(
  cases: readonly C2aGateInput[],
  fidelityPass: boolean,
): C2aGateResult {
  const coverage = cases.filter((value) => value.divergence.robustLossDivergence).length
  const classification: C2aClassification = !fidelityPass
    ? 'INCONCLUSIVE'
    : coverage >= 2
      ? 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED'
      : 'ROBUST_LOSS_PREFERENCE_SIGNAL_NOT_SUPPORTED'
  const candidateCounts = {
    MAE: cases.filter((value) => value.divergence.lossConditions.MAE && value.divergence.huberMseCorrelationBelowThreshold).length,
    'HUBER-075': cases.filter((value) => value.divergence.lossConditions['HUBER-075'] && value.divergence.huberMseCorrelationBelowThreshold).length,
  }
  const frozenC2bCandidate = classification === 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED'
    ? candidateCounts['HUBER-075'] >= candidateCounts.MAE ? 'HUBER-075' : 'MAE'
    : null
  return { coverage, classification, candidateCounts, frozenC2bCandidate }
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readFrozenCorpusArtifact(): FrozenCorpusArtifact {
  const manifestBytes = readFileSync(resolve(C2_CORPUS_ARTIFACT_DIR, 'manifest.json'))
  const casesBytes = readFileSync(resolve(C2_CORPUS_ARTIFACT_DIR, 'cases.json'))
  const provenanceBytes = readFileSync(resolve(C2_CORPUS_ARTIFACT_DIR, 'provenance.json'))
  const evidenceSha = readFileSync(resolve(C2_CORPUS_ARTIFACT_DIR, 'evidence-sha256.txt'), 'utf8').trim()
  const manifestSha256 = sha256(manifestBytes)
  if (manifestSha256 !== C2_CORPUS_EVIDENCE_SHA256 || evidenceSha !== C2_CORPUS_EVIDENCE_SHA256) {
    throw new Error('C2 corpus evidence SHA-256 does not match the frozen V1.2 artifact')
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>
  const cases = JSON.parse(casesBytes.toString('utf8')) as CorpusCaseArtifact[]
  const provenance = JSON.parse(provenanceBytes.toString('utf8')) as FrozenCorpusArtifact['provenance']
  const casesSha256 = sha256(JSON.stringify(cases))
  const provenanceSha256 = sha256(JSON.stringify(provenance))
  if (manifest.status !== C2_CORPUS_CLASSIFICATION || manifest.corpusVersion !== C2_CORPUS_VERSION) {
    throw new Error('C2 corpus classification/version mismatch')
  }
  if (manifest.casesSha256 !== casesSha256 || manifest.provenanceSha256 !== provenanceSha256) {
    throw new Error('C2 corpus cases/provenance hash mismatch')
  }
  if (
    provenance.repository !== 'jaakkopasanen/AutoEq' ||
    provenance.commit !== C2_UPSTREAM_COMMIT ||
    provenance.tree !== C2_UPSTREAM_TREE ||
    JSON.stringify(provenance.cases) !== JSON.stringify(cases)
  ) {
    throw new Error('C2 corpus provenance does not match the frozen cases')
  }
  if (cases.length !== 18 || cases.some((value) => value.normalization.frequencyHz !== 500 || value.normalization.levelDb !== 60)) {
    throw new Error('C2 frozen corpus must contain 18 V1.2 cases with the 500 Hz/60 dB normalization')
  }
  return { manifest, cases, provenance, manifestSha256, casesSha256, provenanceSha256 }
}

async function verifyPinnedUpstream(): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/jaakkopasanen/AutoEq/git/commits/${C2_UPSTREAM_COMMIT}`, {
    redirect: 'error',
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`Unable to verify pinned upstream commit: HTTP ${response.status}`)
  const commit = await response.json() as { sha?: string; tree?: { sha?: string } }
  if (commit.sha !== C2_UPSTREAM_COMMIT || commit.tree?.sha !== C2_UPSTREAM_TREE) {
    throw new Error('Pinned upstream commit/tree verification failed')
  }
}

function fetchPinnedRaw(path: string): Promise<{ bytes: Buffer; sha256: string }> {
  const cachePath = resolve(C2_CACHE_DIR, sha256(path))
  if (existsSync(cachePath)) {
    const bytes = readFileSync(cachePath)
    return Promise.resolve({ bytes, sha256: sha256(bytes) })
  }
  const url = `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/${C2_UPSTREAM_COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`
  return fetch(url, { redirect: 'error' }).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to reacquire ${path}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0) throw new Error(`Pinned raw curve is empty: ${path}`)
    mkdirSync(C2_CACHE_DIR, { recursive: true })
    writeFileSync(cachePath, bytes)
    return { bytes, sha256: sha256(bytes) }
  })
}

function pointsAsPairs(curve: Curve): number[][] {
  return curve.rawPoints.map((point) => [point.frequencyHz, point.db])
}

async function reacquireCurve(artifact: CurveArtifact, kind: Curve['kind']): Promise<Curve> {
  const raw = await fetchPinnedRaw(artifact.path)
  if (raw.sha256 !== artifact.upstreamSha256 || raw.bytes.byteLength !== artifact.byteLength) {
    throw new Error(`Raw hash/length mismatch for frozen curve ${artifact.path}`)
  }
  const parsed = parseCurveText(raw.bytes.toString('utf8'), { name: artifact.processedName, kind })
  const original = parsed.rawPoints
  const originalTerminal = original.at(-1)!
  if (
    originalTerminal.frequencyHz !== artifact.originalTerminalFrequencyHz ||
    originalTerminal.db !== artifact.originalTerminalDb ||
    sha256(JSON.stringify(pointsAsPairs(parsed))) !== artifact.originalParsedPointsSha256
  ) {
    throw new Error(`Original parsed-point provenance mismatch for ${artifact.path}`)
  }
  const grid = createEvaluationGrid()
  const penultimate = grid.at(-2)!
  if (originalTerminal.frequencyHz < penultimate) {
    throw new Error(`Frozen curve ${artifact.path} does not cover the V2 terminal closure boundary`)
  }
  const canonical = originalTerminal.frequencyHz >= 20_000
    ? parsed
    : { ...parsed, rawPoints: [...parsed.rawPoints, { frequencyHz: 20_000, db: originalTerminal.db }] }
  const canonicalTerminal = canonical.rawPoints.at(-1)!
  if (
    canonicalTerminal.frequencyHz !== artifact.canonicalTerminalFrequencyHz ||
    canonicalTerminal.db !== artifact.canonicalTerminalDb ||
    (canonical.rawPoints.length !== original.length + (originalTerminal.frequencyHz < 20_000 ? 1 : 0)) ||
    sha256(JSON.stringify(pointsAsPairs(canonical))) !== artifact.canonicalParsedPointsSha256 ||
    artifact.parserCanonicalizerVersion !== 2
  ) {
    throw new Error(`Terminal closure provenance mismatch for ${artifact.path}`)
  }
  const expectedTransformation = originalTerminal.frequencyHz < 20_000 ? 'terminal-flat-hold-to-v2-max' : null
  if (artifact.transformation !== expectedTransformation) throw new Error(`Terminal closure transformation mismatch for ${artifact.path}`)
  return canonical
}

export async function prepareC2Case(artifact: CorpusCaseArtifact): Promise<C2PreparedCase> {
  const sourceCurve = await reacquireCurve(artifact.source, 'fr')
  const targetCurve = await reacquireCurve(artifact.target, 'target')
  const frequenciesHz = createEvaluationGrid()
  const sourcePrepared = prepareCurve(sourceCurve, C2_NORMALIZATION, frequenciesHz)
  const targetPrepared = prepareCurve(targetCurve, C2_NORMALIZATION, frequenciesHz)
  return {
    id: artifact.id,
    batch: artifact.batch,
    split: artifact.split,
    source: artifact.source,
    target: artifact.target,
    frequenciesHz,
    desiredDb: desiredCorrection(sourcePrepared.db, targetPrepared.db),
    sampleRateHz: 48_000,
  }
}

export function resolveC2SearchConfig(): ResolvedStructuralSearchConfig {
  return resolveC3SearchConfig()
}

export function assertC2BatchBDevelopmentCaseIds(caseIds: readonly string[]): void {
  if (caseIds.some((id) => C2_BATCH_B_HOLDOUT_IDS.includes(id as (typeof C2_BATCH_B_HOLDOUT_IDS)[number]))) {
    throw new Error('C2 runner rejects Batch B holdout case IDs')
  }
  if (caseIds.some((id) => C2_BATCH_C_CASE_IDS.includes(id as (typeof C2_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('C2 runner rejects Batch C case IDs')
  }
  if (caseIds.some((id) => C2_OLD_STRUCTURAL_VNEXT_CASE_IDS.includes(id as (typeof C2_OLD_STRUCTURAL_VNEXT_CASE_IDS)[number]))) {
    throw new Error('C2 runner rejects old Structural VNext six-case IDs')
  }
  const expected = [...C2_BATCH_B_DEVELOPMENT_IDS].sort()
  const actual = [...caseIds].sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`C2 runner requires exactly the three Batch B development IDs; received ${caseIds.join(', ')}`)
  }
}

export function runC2ObserverFidelity(
  grid: C2PreparedCase | C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number } = {},
): C3ObserverFidelity {
  return runC3ObserverFidelity(grid, {
    config: options.config ?? resolveC2SearchConfig(),
    maxGenerations: options.maxGenerations ?? C2_MAX_GENERATIONS,
  })
}

export function runC2DeterministicBaseline(
  grid: C2PreparedCase | C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number; observeEvaluations?: boolean } = {},
): C3DeterministicTrajectory {
  return runC3DeterministicBaseline(grid, {
    config: options.config ?? resolveC2SearchConfig(),
    maxGenerations: options.maxGenerations ?? C2_MAX_GENERATIONS,
    observeEvaluations: options.observeEvaluations,
  })
}

export function calculateHuber075(residualDb: readonly number[]): number {
  if (residualDb.length === 0) throw new Error('Huber075 requires a non-empty residual')
  let total = 0
  for (const residual of residualDb) {
    if (!Number.isFinite(residual)) throw new Error('Huber075 requires finite residual values')
    const z = residual / C2_HUBER_DELTA_DB
    const absolute = Math.abs(z)
    total += absolute <= 1 ? 0.5 * z ** 2 : absolute - 0.5
  }
  return total / residualDb.length
}

export function calculateMse(residualDb: readonly number[]): number {
  if (residualDb.length === 0) throw new Error('MSE requires a non-empty residual')
  return residualDb.reduce((sum, residual) => {
    if (!Number.isFinite(residual)) throw new Error('MSE requires finite residual values')
    return sum + residual ** 2
  }, 0) / residualDb.length
}

export function calculateMae(residualDb: readonly number[]): number {
  if (residualDb.length === 0) throw new Error('MAE requires a non-empty residual')
  return residualDb.reduce((sum, residual) => {
    if (!Number.isFinite(residual)) throw new Error('MAE requires finite residual values')
    return sum + Math.abs(residual)
  }, 0) / residualDb.length
}

export function calculateC2Losses(residualDb: readonly number[], rmseDb: number, maxAbsDb: number): C2Losses {
  return {
    CONTROL: Math.max(rmseDb / 0.25, maxAbsDb / 0.75),
    MSE: calculateMse(residualDb),
    MAE: calculateMae(residualDb),
    'HUBER-075': calculateHuber075(residualDb),
  }
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

const C2_BANDS = Object.freeze([
  { id: '20-5kHz', minHz: 20, maxHz: 5_000 },
  { id: '5-8kHz', minHz: 5_000, maxHz: 8_000 },
  { id: '8-12kHz', minHz: 8_000, maxHz: 12_000 },
  { id: '12-16kHz', minHz: 12_000, maxHz: 16_000 },
  { id: '16-20kHz', minHz: 16_000, maxHz: 20_000 },
] as const)

function outlierConcentration(residualDb: readonly number[]): C2ResidualDiagnostics['outlierConcentration'] {
  const absolute = residualDb.map(Math.abs)
  const indices = absolute.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value || left.index - right.index)
  const fraction = (count: number, power: 1 | 2): number => {
    const denominator = residualDb.reduce((sum, residual) => sum + Math.abs(residual) ** power, 0)
    if (denominator === 0) return 0
    return indices.slice(0, Math.max(1, Math.ceil(residualDb.length * count))).reduce((sum, item) => sum + absolute[item.index]! ** power, 0) / denominator
  }
  return {
    squaredErrorWorst1Percent: fraction(0.01, 2),
    squaredErrorWorst5Percent: fraction(0.05, 2),
    absoluteErrorWorst1Percent: fraction(0.01, 1),
    absoluteErrorWorst5Percent: fraction(0.05, 1),
  }
}

function diagnosticsForResidual(
  residualDb: readonly number[],
  grid: C2PreparedCase | C3PreparedSearchGrid,
  filters: readonly Filter[],
  cancellationScore: number,
  rmseDb: number,
  maxAbsDb: number,
): C2StateDiagnostics {
  const metrics = calculateErrorMetrics(residualDb, grid.frequenciesHz)
  const bands = calculateBandMetrics(residualDb, grid.frequenciesHz, C2_BANDS)
  const cancellation = auditCancellations(filters, grid.frequenciesHz, grid.sampleRateHz)
  const qValues = filters.map((filter) => filter.q).filter(Number.isFinite)
  return {
    mse: calculateMse(residualDb),
    rmseDb: metrics.rmseDb,
    maeDb: metrics.maeDb,
    huber075: calculateHuber075(residualDb),
    maxAbsDb: metrics.maxAbsDb,
    normalizedViolation: Math.max(rmseDb / 0.25, maxAbsDb / 0.75),
    bands: Object.fromEntries(bands.map((band) => [band.id, {
      maeDb: band.maeDb,
      rmseDb: band.rmseDb,
      maxAbsDb: band.maxAbsDb,
    }])),
    outlierConcentration: outlierConcentration(residualDb),
    filterCount: filters.length,
    cancellationScore,
    qP50: percentile(qValues, 0.5),
    qP90: percentile(qValues, 0.9),
    qMax: qValues.length === 0 ? 0 : Math.max(...qValues),
    maxAbsGainDb: filters.length === 0 ? 0 : Math.max(...filters.map((filter) => Math.abs(filter.gainDb))),
    sumAbsGainDb: filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0),
    opposingNearbyCancellationPairCount: cancellation.pairs.length,
  }
}

function observedRecord(
  observed: C3ObservedState,
  grid: C2PreparedCase | C3PreparedSearchGrid,
): C2StateRecord {
  const filters = observed.filters.map((filter) => ({ ...filter }))
  const filterStateKey = semanticFilterKey(filters)
  const responseDb = cascadeMagnitudeDb(filters, grid.frequenciesHz, grid.sampleRateHz)
  const residualDb = grid.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const diagnostics = diagnosticsForResidual(residualDb, grid, filters, observed.cancellationScore ?? 0, observed.rmseDb, observed.maxAbsDb)
  return {
    filterStateKey,
    filters,
    residualDb,
    losses: {
      CONTROL: diagnostics.normalizedViolation,
      MSE: diagnostics.mse,
      MAE: diagnostics.maeDb,
      'HUBER-075': diagnostics.huber075,
    },
    diagnostics,
    stage: observed.stage,
    generation: observed.generation,
    everAccepted: observed.stage.endsWith('accepted') || observed.stage === 'ordinary-next-state',
    everRetained: observed.stage === 'retained-beam',
    everFinal: observed.stage === 'final',
  }
}

export function deduplicateObservedStates(
  observations: readonly C3ObservedState[],
  grid: C2PreparedCase | C3PreparedSearchGrid,
): C2StateRecord[] {
  const byKey = new Map<string, C2StateRecord>()
  for (const observed of observations) {
    const candidate = observedRecord(observed, grid)
    const existing = byKey.get(candidate.filterStateKey)
    if (existing === undefined) {
      byKey.set(candidate.filterStateKey, candidate)
      continue
    }
    // The observer emits evaluations in causal execution order.  The first
    // record is therefore the earliest provenance; never replace it with a
    // lexical stage comparison (which would make provenance insertion-order
    // dependent for stages such as `final` and `initial`).
    existing.everAccepted ||= candidate.everAccepted
    existing.everRetained ||= candidate.everRetained
    existing.everFinal ||= candidate.everFinal
  }
  return [...byKey.values()].sort((left, right) => left.filterStateKey.localeCompare(right.filterStateKey))
}

function compareKeys(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === rightValue) continue
    if (leftValue === undefined) return -1
    if (rightValue === undefined) return 1
    return leftValue < rightValue ? -1 : 1
  }
  return 0
}

/** Existing frozen reference ordering, followed by a stable semantic state key. */
export function compareC2ReferenceStates(left: Pick<C2StateRecord, 'filterStateKey' | 'filters' | 'diagnostics'>, right: Pick<C2StateRecord, 'filterStateKey' | 'filters' | 'diagnostics'>): number {
  const toSearchState = (state: Pick<C2StateRecord, 'filters' | 'diagnostics'>): SearchState => ({
    candidateId: '__frozen-reference__',
    filters: state.filters.map((filter) => ({ ...filter })),
    rmseDb: state.diagnostics.rmseDb,
    maxAbsDb: state.diagnostics.maxAbsDb,
    cancellationScore: state.diagnostics.cancellationScore,
  })
  const referenceComparison = compareKeys(referenceSelectorKey(toSearchState(left)), referenceSelectorKey(toSearchState(right)))
  return referenceComparison || left.filterStateKey.localeCompare(right.filterStateKey)
}

function compareLossStates(left: C2StateRecord, right: C2StateRecord, loss: C2LossName): number {
  const leftLoss = left.losses[loss]
  const rightLoss = right.losses[loss]
  if (leftLoss < rightLoss) return -1
  if (leftLoss > rightLoss) return 1
  return compareC2ReferenceStates(left, right)
}

function assignRanks(states: C2StateRecord[]): void {
  for (const loss of C2_LOSS_NAMES) {
    const sorted = [...states].sort((left, right) => compareLossStates(left, right, loss))
    for (let index = 0; index < sorted.length; ) {
      let end = index + 1
      while (end < sorted.length && sorted[end]!.losses[loss] === sorted[index]!.losses[loss]) end += 1
      const rank = (index + 1 + end) / 2
      for (let cursor = index; cursor < end; cursor += 1) {
        sorted[cursor]!.rank = { ...(sorted[cursor]!.rank ?? {}), [loss]: rank } as Record<C2LossName, number>
      }
      index = end
    }
  }
}

export function rankStatesByLoss(states: readonly C2StateRecord[], loss: C2LossName): C2StateRecord[] {
  return [...states].sort((left, right) => compareLossStates(left, right, loss))
}

export function computeExactNPreference(states: readonly C2StateRecord[]): C2ExactNWinner[] {
  const byCount = new Map<number, C2StateRecord[]>()
  for (const state of states) {
    const list = byCount.get(state.filters.length) ?? []
    list.push(state)
    byCount.set(state.filters.length, list)
  }
  return [...byCount.entries()].sort(([left], [right]) => left - right).map(([N, candidates]) => {
    const winners = {} as Record<C2LossName, { filterStateKey: string; loss: number; filterCount: number }>
    for (const loss of C2_LOSS_NAMES) {
      const winner = rankStatesByLoss(candidates, loss)[0]!
      winners[loss] = { filterStateKey: winner.filterStateKey, loss: winner.losses[loss], filterCount: winner.filters.length }
    }
    return { N, stateCount: candidates.length, winners }
  })
}

export function spearmanRankCorrelation(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error('Spearman inputs must have equal non-empty lengths')
  const rank = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index)
    const ranks = Array<number>(values.length)
    for (let index = 0; index < order.length; ) {
      let end = index + 1
      while (end < order.length && order[end]!.value === order[index]!.value) end += 1
      const average = (index + 1 + end) / 2
      for (let cursor = index; cursor < end; cursor += 1) ranks[order[cursor]!.index] = average
      index = end
    }
    return ranks
  }
  const leftRanks = rank(left)
  const rightRanks = rank(right)
  const leftMean = leftRanks.reduce((sum, value) => sum + value, 0) / leftRanks.length
  const rightMean = rightRanks.reduce((sum, value) => sum + value, 0) / rightRanks.length
  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0
  for (let index = 0; index < leftRanks.length; index += 1) {
    const leftDelta = leftRanks[index]! - leftMean
    const rightDelta = rightRanks[index]! - rightMean
    numerator += leftDelta * rightDelta
    leftVariance += leftDelta ** 2
    rightVariance += rightDelta ** 2
  }
  if (leftVariance === 0 && rightVariance === 0) return left.every((value, index) => value === right[index]) ? 1 : 0
  if (leftVariance === 0 || rightVariance === 0) return 0
  return numerator / Math.sqrt(leftVariance * rightVariance)
}

function stateEvidence(state: C2StateRecord): C2StateEvidence {
  return {
    filterStateKey: state.filterStateKey,
    filterCount: state.filters.length,
    losses: state.losses,
    rmseDb: state.diagnostics.rmseDb,
    maeDb: state.diagnostics.maeDb,
    maxAbsDb: state.diagnostics.maxAbsDb,
    normalizedViolation: state.diagnostics.normalizedViolation,
    provenance: {
      earliestStage: state.stage,
      earliestGeneration: state.generation ?? null,
      everAccepted: state.everAccepted,
      everRetained: state.everRetained,
      everFinal: state.everFinal,
    },
    ranks: state.rank!,
  }
}

function selectedWinner(state: C2StateRecord, loss: C2LossName): C2SelectedWinner {
  return {
    loss,
    filterStateKey: state.filterStateKey,
    filterCount: state.filters.length,
    losses: state.losses,
    diagnostics: state.diagnostics,
    provenance: stateEvidence(state).provenance,
  }
}

function traceHash(fidelity: C3ObserverFidelity): { traceSha256: string; observationSha256: string } {
  return {
    traceSha256: sha256(JSON.stringify(fidelity.on.trace)),
    observationSha256: sha256(JSON.stringify(fidelity.on.observations.map((state) => ({
      filterStateKey: semanticFilterKey(state.filters),
      rmseDb: state.rmseDb,
      maxAbsDb: state.maxAbsDb,
      maeDb: state.maeDb,
      stage: state.stage,
      generation: state.generation,
    })))),
  }
}

function resultMetrics(fidelity: C3ObserverFidelity, grid: C2PreparedCase): { filterCount: number; rmseDb: number; maxAbsDb: number; maeDb: number; filterStateKey: string } {
  const filters = fidelity.on.result.filters.map((filter) => ({ ...filter }))
  const responseDb = cascadeMagnitudeDb(filters, grid.frequenciesHz, grid.sampleRateHz)
  const residualDb = grid.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, grid.frequenciesHz)
  return { filterCount: filters.length, rmseDb: metrics.rmseDb, maxAbsDb: metrics.maxAbsDb, maeDb: metrics.maeDb, filterStateKey: semanticFilterKey(filters) }
}

function computeCaseEvidence(artifact: CorpusCaseArtifact, prepared: C2PreparedCase, fidelity: C3ObserverFidelity): C2CaseEvidence {
  const states = deduplicateObservedStates(fidelity.on.observations, prepared)
  if (states.length === 0) throw new Error(`C2 observer returned no states for ${artifact.id}`)
  assignRanks(states)
  const exactN = computeExactNPreference(states)
  const globalWinners = {} as Record<C2LossName, C2SelectedWinner>
  for (const loss of C2_LOSS_NAMES) globalWinners[loss] = selectedWinner(rankStatesByLoss(states, loss)[0]!, loss)
  const stateByKey = new Map(states.map((state) => [state.filterStateKey, state]))
  const comparable = exactN.filter((point) => point.stateCount >= 2)
  const exactDivergence = (loss: 'MAE' | 'HUBER-075') => {
    const differing = comparable.filter((point) => point.winners[loss].filterStateKey !== point.winners.MSE.filterStateKey)
    return {
      differingCount: differing.length,
      fraction: comparable.length === 0 ? 0 : differing.length / comparable.length,
      firstN: differing[0]?.N ?? null,
      lastN: differing.at(-1)?.N ?? null,
    }
  }
  const exactMae = exactDivergence('MAE')
  const exactHuber = exactDivergence('HUBER-075')
  const globalWinnerDiffersFromMSE = {
    MAE: globalWinners.MAE.filterStateKey !== globalWinners.MSE.filterStateKey,
    'HUBER-075': globalWinners['HUBER-075'].filterStateKey !== globalWinners.MSE.filterStateKey,
  }
  const globalWinnerDiffersFromControl = {
    MAE: globalWinners.MAE.filterStateKey !== globalWinners.CONTROL.filterStateKey,
    'HUBER-075': globalWinners['HUBER-075'].filterStateKey !== globalWinners.CONTROL.filterStateKey,
  }
  const lossConditions = {
    MAE: globalWinnerDiffersFromMSE.MAE || exactMae.fraction >= 0.25,
    'HUBER-075': globalWinnerDiffersFromMSE['HUBER-075'] || exactHuber.fraction >= 0.25,
  }
  const rankCorrelations = {
    MSE_MAE: spearmanRankCorrelation(states.map((state) => state.losses.MSE), states.map((state) => state.losses.MAE)),
    MSE_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.MSE), states.map((state) => state.losses['HUBER-075'])),
    MAE_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.MAE), states.map((state) => state.losses['HUBER-075'])),
    CONTROL_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.CONTROL), states.map((state) => state.losses['HUBER-075'])),
  }
  const huberMseCorrelationBelowThreshold = rankCorrelations.MSE_HUBER075 < C2_DIVERGENCE_CORRELATION_THRESHOLD
  const robustLossDivergence = (lossConditions.MAE || lossConditions['HUBER-075']) && huberMseCorrelationBelowThreshold
  const hashes = traceHash(fidelity)
  const result = resultMetrics(fidelity, prepared)
  return {
    id: artifact.id,
    batch: 'B',
    split: 'development',
    source: { identity: artifact.source.identity, path: artifact.source.path, upstreamSha256: artifact.source.upstreamSha256, canonicalParsedPointsSha256: artifact.source.canonicalParsedPointsSha256, transformation: artifact.source.transformation },
    target: { identity: artifact.target.identity, path: artifact.target.path, upstreamSha256: artifact.target.upstreamSha256, canonicalParsedPointsSha256: artifact.target.canonicalParsedPointsSha256, transformation: artifact.target.transformation },
    normalization: C2_NORMALIZATION,
    trajectory: {
      maxGenerations: C2_MAX_GENERATIONS,
      completedGenerationCount: fidelity.on.completedGenerationCount,
      terminalGeneration: fidelity.on.terminalGeneration,
      terminalReason: fidelity.on.terminalReason,
      result,
      ...hashes,
    },
    observerFidelity: {
      equivalent: fidelity.equivalent,
      resultEqual: fidelity.resultEqual,
      completedGenerationCountEqual: fidelity.completedGenerationCountEqual,
      retainedBeamSequenceEqual: fidelity.retainedBeamSequenceEqual,
      workCountersEqual: fidelity.workCountersEqual,
      naturalTerminationEqual: fidelity.naturalTerminationEqual,
      ordinaryDecisionTraceEqual: fidelity.traceEqual,
    },
    uniqueEvaluatedStateCount: states.length,
    states: states.map(stateEvidence),
    globalWinners,
    exactN,
    rankCorrelations,
    divergence: {
      globalWinnerDiffersFromMSE,
      globalWinnerDiffersFromControl,
      exactN: { comparableCount: comparable.length, MAE: exactMae, 'HUBER-075': exactHuber },
      lossConditions,
      robustLossDivergence,
      huberMseCorrelationBelowThreshold,
    },
    developmentGate: robustLossDivergence ? 'ROBUST_LOSS_DIVERGENCE' : 'NO_ROBUST_LOSS_DIVERGENCE',
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function hashEvidenceFiles(outputDir: string, relativePaths: readonly string[]): string {
  const hash = createHash('sha256')
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(`${relativePath}\n`)
    hash.update(readFileSync(resolve(outputDir, relativePath)))
    hash.update('\n')
  }
  return hash.digest('hex')
}

function renderReport(cases: readonly C2CaseEvidence[], classification: string, candidate: string | null, coverage: number): string {
  const f = (value: number): string => value.toFixed(6)
  const lines = [
    '# C2a robust fit-loss development census — Fresh Real Corpus V1.2',
    '',
    `- Frozen search boundary: \`${C2_FROZEN_BOUNDARY}\`.`,
    `- Audited C3 evidence SHA-256: \`${C2_C3_EVIDENCE_SHA256}\` (interpretation: \`KNEE_SIGNAL_SUPPORTED\`; no geometric knee selector is implemented).`,
    `- Corpus commit: \`${C2_CORPUS_COMMIT}\`; corpus evidence SHA-256: \`${C2_CORPUS_EVIDENCE_SHA256}\`.`,
    '- Algorithm: **FROZEN_BASELINE** unchanged; this is an offline census over observer-only evaluated states.',
    `- Envelope: C${C2_STRUCTURAL_CEILING}/e${C2_EFFORT_LEVEL}, preset \`max10-q31-b4-p8-experimental\`, beam 16, proposals/parent 32, polish 120, q31-b4-p8, full profile, maximum 31 ordinary generations.`,
    '',
    '## Development cases',
    '',
    '| Case | unique states | control | MSE | MAE | Huber075 | MSE↔MAE exact-N | MSE↔Huber exact-N | ρ(MSE,Huber) | gate |',
    '| --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ...cases.map((value) => `| ${value.id} | ${value.uniqueEvaluatedStateCount} | ${value.globalWinners.CONTROL.filterStateKey} (${value.globalWinners.CONTROL.filterCount}) | ${value.globalWinners.MSE.filterStateKey} (${value.globalWinners.MSE.filterCount}) | ${value.globalWinners.MAE.filterStateKey} (${value.globalWinners.MAE.filterCount}) | ${value.globalWinners['HUBER-075'].filterStateKey} (${value.globalWinners['HUBER-075'].filterCount}) | ${f(value.divergence.exactN.MAE.fraction * 100)}% | ${f(value.divergence.exactN['HUBER-075'].fraction * 100)}% | ${f(value.rankCorrelations.MSE_HUBER075)} | ${value.developmentGate} |`),
    '',
    '## Gate',
    '',
    `- Development ROBUST_LOSS_DIVERGENCE coverage: ${coverage}/3.`,
    `- Final C2a classification: **${classification}**.`,
    `- Frozen C2b candidate: **${candidate ?? 'none'}**.`,
    '- The classification is a preference signal only; it does not claim robust loss is better and does not authorize holdout execution.',
    '',
    '## Rejected execution',
    '',
    '- Batch B holdout IDs and all Batch C IDs are explicitly rejected by the runner and were not executed.',
    '- Old Structural VNext cases are explicitly rejected and were not executed.',
    '',
  ]
  return `${lines.join('\n').trimEnd()}\n`
}

/** Execute the C2a development-only robust-loss preference census. */
export async function runC2Census(
  outputDir = resolve(C2_REPOSITORY_ROOT, C2_ARTIFACT_RELATIVE_DIR),
): Promise<C2CensusResult> {
  const corpus = readFrozenCorpusArtifact()
  const selectedIds = [...C2_BATCH_B_DEVELOPMENT_IDS]
  assertC2BatchBDevelopmentCaseIds(selectedIds)
  const selected = corpus.cases.filter((value) => selectedIds.includes(value.id as (typeof C2_BATCH_B_DEVELOPMENT_IDS)[number]))
  if (selected.length !== 3 || selected.some((value) => value.batch !== 'B' || value.split !== 'development')) {
    throw new Error('Frozen corpus Batch B development selection is incomplete or contaminated')
  }
  if (selected.some((value) => C2_BATCH_B_HOLDOUT_IDS.includes(value.id as (typeof C2_BATCH_B_HOLDOUT_IDS)[number]) || C2_BATCH_C_CASE_IDS.includes(value.id as (typeof C2_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('C2 selected corpus contains a forbidden holdout or Batch C ID')
  }
  await verifyPinnedUpstream()
  const config = resolveC2SearchConfig()
  const cases: C2CaseEvidence[] = []
  for (const artifact of selected) {
    console.log(`C2a real dev case ${artifact.id}`)
    const prepared = await prepareC2Case(artifact)
    const fidelity = runC2ObserverFidelity(prepared, { config, maxGenerations: C2_MAX_GENERATIONS })
    if (!fidelity.equivalent) throw new Error(`C2 observer fidelity failed for ${artifact.id}`)
    cases.push(computeCaseEvidence(artifact, prepared, fidelity))
  }
  if (cases.length !== 3 || new Set(cases.map((value) => value.id)).size !== 3) throw new Error('C2 artifact must contain exactly three distinct Batch B development cases')
  const fidelityPass = cases.every((value) => Object.values(value.observerFidelity).every(Boolean))
  const gate = classifyC2aGate(cases, fidelityPass)
  const coverage = gate.coverage
  const classification = gate.classification
  const candidateCounts = gate.candidateCounts
  const candidate = gate.frozenC2bCandidate
  mkdirSync(outputDir, { recursive: true })
  const perCasePaths: string[] = []
  for (const value of cases) {
    const relativePath = `loss-census/${value.id}.json`
    mkdirSync(resolve(outputDir, 'loss-census'), { recursive: true })
    writeJson(resolve(outputDir, relativePath), value)
    perCasePaths.push(relativePath)
  }
  const aggregate: Record<string, unknown> = {
    schemaVersion: 1,
    artifact: 'objective-c2-robust-loss-dev-census',
    corpus: { commit: C2_CORPUS_COMMIT, classification: C2_CORPUS_CLASSIFICATION, evidenceSha256: C2_CORPUS_EVIDENCE_SHA256, casesSha256: corpus.casesSha256, provenanceSha256: corpus.provenanceSha256, upstream: { repository: 'jaakkopasanen/AutoEq', commit: C2_UPSTREAM_COMMIT, tree: C2_UPSTREAM_TREE } },
    frozenBoundary: C2_FROZEN_BOUNDARY,
    c3: { evidenceSha256: C2_C3_EVIDENCE_SHA256, finalInterpretation: 'KNEE_SIGNAL_SUPPORTED', geometricKneeSelectorImplemented: false },
    protocol: {
      selectedAlgorithm: 'FROZEN_BASELINE',
      caseIds: selectedIds,
      batchBDevelopmentCaseIds: [...C2_BATCH_B_DEVELOPMENT_IDS],
      batchBHoldoutCaseIds: [...C2_BATCH_B_HOLDOUT_IDS],
      batchCCaseIds: [...C2_BATCH_C_CASE_IDS],
      deterministicGenerationBound: C2_MAX_GENERATIONS,
      naturalTermination: 'allowed-earlier-than-generation-bound',
      trajectoryCount: 3,
      observerMode: 'C3-observer-off-on-fidelity-per-case',
      wallClockTermination: false,
      batchBHoldoutExecuted: false,
      batchCExecuted: false,
      oldStructuralVNextCasesExecuted: false,
      searchPolicyChanged: false,
      lossesAffectSearch: false,
    },
    normalization: C2_NORMALIZATION,
    resolvedSearchConfig: config,
    predeclaredLosses: ['CONTROL', 'MSE', 'MAE', 'HUBER-075'],
    huber: { deltaDb: C2_HUBER_DELTA_DB, definition: 'rho(z)=0.5*z^2 for |z|<=1; |z|-0.5 otherwise; z=r/0.75' },
    divergenceThreshold: C2_DIVERGENCE_CORRELATION_THRESHOLD,
    cases: cases.map((value) => ({ id: value.id, uniqueEvaluatedStateCount: value.uniqueEvaluatedStateCount, globalWinners: Object.fromEntries(C2_LOSS_NAMES.map((loss) => [loss, { filterStateKey: value.globalWinners[loss].filterStateKey, filterCount: value.globalWinners[loss].filterCount, losses: value.globalWinners[loss].losses }])), exactN: value.exactN, rankCorrelations: value.rankCorrelations, divergence: value.divergence, developmentGate: value.developmentGate, observerFidelity: value.observerFidelity, lossCensusPath: `loss-census/${value.id}.json` })),
    developmentCoverage: { robustLossDivergence: coverage, total: 3 },
    candidateCounts,
    classification,
    frozenC2bCandidate: candidate,
  }
  writeJson(resolve(outputDir, 'aggregate-evidence.json'), aggregate)
  const evidencePaths = ['aggregate-evidence.json', ...perCasePaths]
  const evidenceSha256 = hashEvidenceFiles(outputDir, evidencePaths)
  const report = renderReport(cases, classification, candidate, coverage)
  writeFileSync(resolve(outputDir, 'final-report.md'), report, 'utf8')
  writeFileSync(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    artifact: 'objective-c2-robust-loss-dev-census',
    status: classification,
    researchQuestion: 'Does robust fit loss materially change preference among already evaluated FROZEN_BASELINE states on Batch B development cases?',
    frozenBoundary: C2_FROZEN_BOUNDARY,
    c3EvidenceSha256: C2_C3_EVIDENCE_SHA256,
    corpus: { commit: C2_CORPUS_COMMIT, classification: C2_CORPUS_CLASSIFICATION, evidenceSha256: C2_CORPUS_EVIDENCE_SHA256, casesSha256: corpus.casesSha256, provenanceSha256: corpus.provenanceSha256 },
    caseIds: selectedIds,
    caseCount: 3,
    split: { batchBDevelopment: [...C2_BATCH_B_DEVELOPMENT_IDS], batchBHoldout: [...C2_BATCH_B_HOLDOUT_IDS], batchC: [...C2_BATCH_C_CASE_IDS] },
    resolvedSearchConfig: config,
    protocol: aggregate.protocol,
    developmentCoverage: aggregate.developmentCoverage,
    classification,
    frozenC2bCandidate: candidate,
    evidenceSha256,
    evidenceHashScope: evidencePaths,
    files: ['manifest.json', 'aggregate-evidence.json', ...perCasePaths, 'evidence-sha256.txt', 'final-report.md'],
  }
  writeJson(resolve(outputDir, 'manifest.json'), manifest)
  return { manifest, aggregate, cases, evidenceSha256, outputDir }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC2Census().then((result) => {
    console.log(JSON.stringify({ outputDir: result.outputDir, evidenceSha256: result.evidenceSha256, classification: result.manifest.status, frozenC2bCandidate: result.manifest.frozenC2bCandidate }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
}
