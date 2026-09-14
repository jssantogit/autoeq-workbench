import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { calculateErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { auditCancellations } from '../../src/autoeq/cancellation.js'
import { createEvaluationGrid } from '../../src/config/numericPolicy.js'
import { desiredCorrection, prepareCurve } from '../../src/curves/derive.js'
import { parseCurveText } from '../../src/io/parseCurve.js'
import type { Filter } from '../../src/types/filter.js'
import type { Curve, Normalization } from '../../src/types/curve.js'
import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  referenceSelectorKey,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
  type ResolvedStructuralSearchConfig,
  type StructuralSearchBaselineEvaluation,
  type SearchState,
} from '../../src/autoeq/v2/structuralSearch.js'
import { resolveScalableEffortConfig } from '../../src/autoeq/v2/scalableStructuralSearch.js'

export const C3_CORPUS_VERSION = 'fresh-real-corpus-v1.2' as const
export const C3_CORPUS_COMMIT = 'fc3932c72e3c3931dc062c523c2205389639264b' as const
export const C3_CORPUS_CLASSIFICATION = 'CORPUS_V1_2_READY' as const
export const C3_CORPUS_EVIDENCE_SHA256 = '13c7ff43614d7e257b0231f9238102afff5413964077017a2db7741d87b659b1' as const
export const C3_UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7' as const
export const C3_UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96' as const

export const C3_BATCH_A_CASE_IDS = Object.freeze([
  'frc1.1-12-0002977aa8bc',
  'frc1.1-09-0001b6618e24',
  'frc1.1-10-00027122c3ce',
  'frc1.1-03-00003906daac',
  'frc1.1-15-000323cd8787',
  'frc1.1-06-0000c6497763',
] as const)

export const C3_BATCH_A_DEVELOPMENT_IDS = Object.freeze(C3_BATCH_A_CASE_IDS.slice(0, 3))
export const C3_BATCH_A_HOLDOUT_IDS = Object.freeze(C3_BATCH_A_CASE_IDS.slice(3))

export const C3_BATCH_B_CASE_IDS = Object.freeze([
  'frc1.1-08-0000f6762889',
  'frc1.1-11-000279686a75',
  'frc1.1-07-0000c470a9b3',
  'frc1.1-14-00025d5729a1',
  'frc1.1-13-000225a01a6d',
  'frc1.1-17-00036da52192',
] as const)

export const C3_BATCH_C_CASE_IDS = Object.freeze([
  'frc1.1-05-0000a93dae04',
  'frc1.1-18-0003c77fd5b4',
  'frc1.1-01-000013d2c2cd',
  'frc1.1-16-0003622f8ec5',
  'frc1.1-02-00002f5caf38',
  'frc1.1-04-00007c13a25b',
] as const)

/** Historical Structural VNext six-case IDs; never admissible for C3. */
export const C3_OLD_STRUCTURAL_VNEXT_CASE_IDS = Object.freeze([
  'titan-to-rsv',
  'titan-to-mystic-8',
  'titan-to-s12-ultra',
  'titan-to-storm',
  'titan-to-u12t',
  'titan-to-trio',
] as const)

export const C3_MAX_GENERATIONS = 31 as const
export const C3_STRUCTURAL_CEILING = 43 as const
export const C3_EFFORT_LEVEL = 6 as const
export const C3_NORMALIZATION = Object.freeze({
  mode: 'hz',
  frequencyHz: 500,
  levelDb: 60,
} as const satisfies Normalization)
export const C3_ARTIFACT_RELATIVE_DIR = '.research-artifacts/objective-c3-filter-knee-census-v1.2' as const
const C3_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const C3_CORPUS_ARTIFACT_DIR = resolve(C3_REPOSITORY_ROOT, '.research-artifacts/fresh-real-corpus-v1-metadata-repair')
const C3_CACHE_DIR = resolve(C3_REPOSITORY_ROOT, '.research-cache/fresh-real-corpus-v1.2')

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
  normalization: typeof C3_NORMALIZATION
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

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readFrozenCorpusArtifact(): FrozenCorpusArtifact {
  const manifestBytes = readFileSync(resolve(C3_CORPUS_ARTIFACT_DIR, 'manifest.json'))
  const casesBytes = readFileSync(resolve(C3_CORPUS_ARTIFACT_DIR, 'cases.json'))
  const provenanceBytes = readFileSync(resolve(C3_CORPUS_ARTIFACT_DIR, 'provenance.json'))
  const evidenceSha = readFileSync(resolve(C3_CORPUS_ARTIFACT_DIR, 'evidence-sha256.txt'), 'utf8').trim()
  const manifestSha256 = sha256(manifestBytes)
  if (manifestSha256 !== C3_CORPUS_EVIDENCE_SHA256 || evidenceSha !== C3_CORPUS_EVIDENCE_SHA256) {
    throw new Error('C3 corpus evidence SHA-256 does not match the frozen V1.2 artifact')
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>
  const cases = JSON.parse(casesBytes.toString('utf8')) as CorpusCaseArtifact[]
  const provenance = JSON.parse(provenanceBytes.toString('utf8')) as FrozenCorpusArtifact['provenance']
  const casesSha256 = sha256(JSON.stringify(cases))
  const provenanceSha256 = sha256(JSON.stringify(provenance))
  if (manifest.status !== C3_CORPUS_CLASSIFICATION || manifest.corpusVersion !== C3_CORPUS_VERSION) {
    throw new Error('C3 corpus classification/version mismatch')
  }
  if (manifest.casesSha256 !== casesSha256 || manifest.provenanceSha256 !== provenanceSha256) {
    throw new Error('C3 corpus cases/provenance hash mismatch')
  }
  if (
    provenance.repository !== 'jaakkopasanen/AutoEq' ||
    provenance.commit !== C3_UPSTREAM_COMMIT ||
    provenance.tree !== C3_UPSTREAM_TREE ||
    JSON.stringify(provenance.cases) !== JSON.stringify(cases)
  ) {
    throw new Error('C3 corpus provenance does not match the frozen cases')
  }
  if (cases.length !== 18 || cases.some((value) => value.normalization.frequencyHz !== 500 || value.normalization.levelDb !== 60)) {
    throw new Error('C3 frozen corpus must contain 18 V1.2 cases with the 500 Hz/60 dB normalization')
  }
  return { manifest, cases, provenance, manifestSha256, casesSha256, provenanceSha256 }
}

async function verifyPinnedUpstream(): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/jaakkopasanen/AutoEq/git/commits/${C3_UPSTREAM_COMMIT}`, {
    redirect: 'error',
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`Unable to verify pinned upstream commit: HTTP ${response.status}`)
  const commit = await response.json() as { sha?: string; tree?: { sha?: string } }
  if (commit.sha !== C3_UPSTREAM_COMMIT || commit.tree?.sha !== C3_UPSTREAM_TREE) {
    throw new Error('Pinned upstream commit/tree verification failed')
  }
}

async function fetchPinnedRaw(path: string): Promise<{ bytes: Buffer; sha256: string }> {
  const cachePath = resolve(C3_CACHE_DIR, sha256(path))
  let bytes: Buffer
  if (existsSync(cachePath)) {
    bytes = readFileSync(cachePath)
  } else {
    const url = `https://raw.githubusercontent.com/${'jaakkopasanen/AutoEq'}/${C3_UPSTREAM_COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`
    const response = await fetch(url, { redirect: 'error' })
    if (!response.ok) throw new Error(`Unable to reacquire ${path}: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0) throw new Error(`Pinned raw curve is empty: ${path}`)
    mkdirSync(C3_CACHE_DIR, { recursive: true })
    writeFileSync(cachePath, bytes)
  }
  return { bytes, sha256: sha256(bytes) }
}

function pointsAsPairs(curve: Curve): number[][] {
  return curve.rawPoints.map((point) => [point.frequencyHz, point.db])
}

function verifyCurveMetadata(curve: Curve, artifact: CurveArtifact, raw: { bytes: Buffer; sha256: string }): Curve {
  if (raw.sha256 !== artifact.upstreamSha256 || raw.bytes.byteLength !== artifact.byteLength) {
    throw new Error(`Raw hash/length mismatch for frozen curve ${artifact.path}`)
  }
  const original = curve.rawPoints
  const originalTerminal = original.at(-1)!
  if (
    originalTerminal.frequencyHz !== artifact.originalTerminalFrequencyHz ||
    originalTerminal.db !== artifact.originalTerminalDb ||
    sha256(JSON.stringify(pointsAsPairs(curve))) !== artifact.originalParsedPointsSha256
  ) {
    throw new Error(`Original parsed-point provenance mismatch for ${artifact.path}`)
  }
  const grid = createEvaluationGrid()
  const penultimate = grid.at(-2)!
  if (originalTerminal.frequencyHz < penultimate) {
    throw new Error(`Frozen curve ${artifact.path} does not cover the V2 terminal closure boundary`)
  }
  const canonical = originalTerminal.frequencyHz >= 20_000
    ? curve
    : {
        ...curve,
        rawPoints: [...curve.rawPoints, { frequencyHz: 20_000, db: originalTerminal.db }],
      }
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
  if (artifact.transformation !== expectedTransformation) {
    throw new Error(`Terminal closure transformation mismatch for ${artifact.path}`)
  }
  return canonical
}

async function reacquireCurve(artifact: CurveArtifact, kind: Curve['kind']): Promise<Curve> {
  const raw = await fetchPinnedRaw(artifact.path)
  const parsed = parseCurveText(raw.bytes.toString('utf8'), { name: artifact.processedName, kind })
  return verifyCurveMetadata(parsed, artifact, raw)
}

async function prepareFrozenCase(artifact: CorpusCaseArtifact): Promise<C3PreparedSearchGrid & { id: string; batch: string; split: string; source: CurveArtifact; target: CurveArtifact }> {
  const source = await reacquireCurve(artifact.source, 'fr')
  const target = await reacquireCurve(artifact.target, 'target')
  const frequenciesHz = createEvaluationGrid()
  const sourcePrepared = prepareCurve(source, C3_NORMALIZATION, frequenciesHz)
  const targetPrepared = prepareCurve(target, C3_NORMALIZATION, frequenciesHz)
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

export function resolveC3SearchConfig(): ResolvedStructuralSearchConfig {
  const base = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  })
  return resolveScalableEffortConfig(base, C3_STRUCTURAL_CEILING, C3_EFFORT_LEVEL)
}

export function assertC3BatchACaseIds(caseIds: readonly string[]): void {
  if (caseIds.some((id) => C3_BATCH_B_CASE_IDS.includes(id as (typeof C3_BATCH_B_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects Batch B case IDs')
  }
  if (caseIds.some((id) => C3_BATCH_C_CASE_IDS.includes(id as (typeof C3_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects Batch C case IDs')
  }
  if (caseIds.some((id) => C3_OLD_STRUCTURAL_VNEXT_CASE_IDS.includes(id as (typeof C3_OLD_STRUCTURAL_VNEXT_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects old Structural VNext six-case IDs')
  }
  const expected = [...C3_BATCH_A_CASE_IDS].sort()
  const actual = [...caseIds].sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`C3 runner requires exactly Batch A six case IDs; received ${caseIds.join(', ')}`)
  }
}

export interface C3ObservedState {
  filterStateKey: string
  filters: readonly Filter[]
  rmseDb: number
  maxAbsDb: number
  maeDb: number
  cancellationScore?: number
  stage: string
  generation?: number
}

export interface C3PreparedSearchGrid {
  frequenciesHz: readonly number[]
  desiredDb: readonly number[]
  sampleRateHz: number
}

/** Convert the structural observer's quantized state into C3 evidence. */
export function observedStateFromBaselineEvaluation(
  event: StructuralSearchBaselineEvaluation,
  grid: C3PreparedSearchGrid,
): C3ObservedState {
  const filters = event.state.filters.map((filter) => ({ ...filter }))
  const responseDb = cascadeMagnitudeDb(filters, grid.frequenciesHz, grid.sampleRateHz)
  const residualDb = grid.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, grid.frequenciesHz)
  return {
    filterStateKey: JSON.stringify(filters.map(({ id: _id, ...filter }) => filter)),
    filters,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    maeDb: metrics.maeDb,
    cancellationScore: event.state.cancellationScore,
    stage: event.stage,
    generation: event.generation,
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function workCounters(trace: readonly StructuralSearchTraceEvent[]): Record<string, number> {
  const counters = {
    beamGenerations: 0,
    proposalsGenerated: 0,
    proposalsAdmitted: 0,
    proposalsPolished: 0,
    duplicateStates: 0,
    rescueAttempts: 0,
    pairAddAttempts: 0,
    capSwapAttempts: 0,
  }
  for (const event of trace) {
    if (event.type === 'beam-generation') {
      counters.beamGenerations += 1
      counters.proposalsGenerated += event.generatedProposals ?? 0
      counters.proposalsAdmitted += event.admittedProposals ?? 0
      counters.proposalsPolished += event.polishedProposals ?? 0
      counters.duplicateStates += event.duplicateStates ?? 0
    }
    if (event.type === 'phase') {
      const attempts = event.attempts ?? event.acceptedSteps ?? 0
      if (event.phase === 'rescue') counters.rescueAttempts += attempts
      if (event.phase === 'pair-add') counters.pairAddAttempts += attempts
      if (event.phase === 'cap-swap') counters.capSwapAttempts += attempts
    }
  }
  return counters
}

/** Run one deterministic C3 trajectory; no wall-clock deadline is consulted. */
export function runC3DeterministicBaseline(
  grid: C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number; observeEvaluations?: boolean } = {},
): C3DeterministicTrajectory {
  const config = options.config ?? resolveC3SearchConfig()
  const maxGenerations = options.maxGenerations ?? C3_MAX_GENERATIONS
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations <= 0) {
    throw new Error('C3 deterministic generation bound must be a positive integer')
  }
  const observations: C3ObservedState[] = []
  const trace: StructuralSearchTraceEvent[] = []
  const retainedBeamSequence: C3DeterministicTrajectory['retainedBeamSequence'] = []
  let imposedBoundaryReached = false
  let naturalStopGeneration: number | null = null
  const result = runStructuralSearch({
    desiredDb: [...grid.desiredDb],
    frequencies: [...grid.frequenciesHz],
    sampleRateHz: grid.sampleRateHz,
    config: { ...config },
    seedFilters: [],
    deadline: { isExpired: () => imposedBoundaryReached },
    onTrace: (event) => {
      trace.push({
        ...event,
        ...(event.capacityPressure === undefined ? {} : { capacityPressure: { ...event.capacityPressure } }),
        ...(event.frontierUtilization === undefined ? {} : { frontierUtilization: { ...event.frontierUtilization } }),
      })
      if (event.type === 'beam-generation' && event.generation !== undefined && event.generation >= maxGenerations - 1) {
        imposedBoundaryReached = true
      }
      if (event.type === 'beam-stop' && event.reason === 'no-next-states') {
        naturalStopGeneration = event.generation ?? null
      }
    },
    ...(options.observeEvaluations === false ? {} : {
      onBaselineEvaluation: (event: StructuralSearchBaselineEvaluation) => {
        observations.push(observedStateFromBaselineEvaluation(event, grid))
      },
    }),
    onBaselineState: (event) => {
      retainedBeamSequence.push(event.retainedBeam.map((state) => ({
        filterStateKey: JSON.stringify(state.filters.map(({ id: _id, ...filter }) => filter)),
        filterCount: state.filters.length,
      })))
    },
  })
  const completedGenerationCount = trace.filter((event) => event.type === 'beam-generation').length
  const terminalGeneration = naturalStopGeneration ?? Math.max(0, completedGenerationCount - 1)
  return {
    result,
    observations,
    trace,
    retainedBeamSequence,
    completedGenerationCount,
    naturalStopGeneration,
    terminalGeneration,
    terminalReason: naturalStopGeneration === null ? 'generation-bound' : 'natural-stop',
  }
}

export function runC3ObserverFidelity(
  grid: C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number } = {},
): C3ObserverFidelity {
  const config = options.config ?? resolveC3SearchConfig()
  const maxGenerations = options.maxGenerations ?? C3_MAX_GENERATIONS
  const off = runC3DeterministicBaseline(grid, { config, maxGenerations, observeEvaluations: false })
  const on = runC3DeterministicBaseline(grid, { config, maxGenerations, observeEvaluations: true })
  const resultEqual = stableJson(off.result) === stableJson(on.result)
  const completedGenerationCountEqual = off.completedGenerationCount === on.completedGenerationCount
  const retainedBeamSequenceEqual = stableJson(off.retainedBeamSequence) === stableJson(on.retainedBeamSequence)
  const workCountersEqual = stableJson(workCounters(off.trace)) === stableJson(workCounters(on.trace))
  const naturalTerminationEqual = off.naturalStopGeneration === on.naturalStopGeneration &&
    off.terminalGeneration === on.terminalGeneration
  const traceEqual = stableJson(off.trace) === stableJson(on.trace)
  return {
    equivalent: resultEqual && completedGenerationCountEqual && retainedBeamSequenceEqual &&
      workCountersEqual && naturalTerminationEqual && traceEqual,
    resultEqual,
    completedGenerationCountEqual,
    retainedBeamSequenceEqual,
    workCountersEqual,
    naturalTerminationEqual,
    traceEqual,
    off,
    on,
  }
}

export interface C3ExactFrontierPoint extends C3ObservedState {
  N: number
  normalizedViolation: number
}

export interface C3FrontierPoint extends C3ExactFrontierPoint {
  representativeFilterCount: number
}

export interface C3KneeResult {
  status: 'UNIQUE_KNEE' | 'NO_UNIQUE_KNEE'
  reason?: 'NO_POSITIVE_INTERIOR_DISTANCE' | 'TIED_MAXIMUM' | 'INSUFFICIENT_FRONTIER' | 'INSUFFICIENT_SPAN'
  N_knee?: number
  distance?: number
}

export interface C3PrefixKnee {
  prefix: 'g10' | 'g20' | 'g30-final'
  frontier: C3FrontierPoint[]
  knee: C3KneeResult
}

export interface C3StateSecondaryMetrics {
  cancellationScore: number
  qP50: number
  qP90: number
  qMax: number
  maxAbsGainDb: number
  sumAbsGainDb: number
  opposingNearbyCancellationPairCount: number
}

export interface C3KneeVsFinalMetrics {
  N_knee: number | null
  N_final: number
  filtersSaved: number | null
  violationKnee: number | null
  violationFinal: number
  rmseKnee: number | null
  rmseFinal: number
  maxAbsKnee: number | null
  maxAbsFinal: number
  maeKnee: number | null
  maeFinal: number
  fractionFrontierImprovementCapturedAtKnee: number | null
  residualImprovementAfterKnee: number | null
  kneeSecondary: C3StateSecondaryMetrics | null
  finalSecondary: C3StateSecondaryMetrics
}

export interface C3DeterministicTrajectory {
  result: StructuralSearchResult
  observations: C3ObservedState[]
  trace: StructuralSearchTraceEvent[]
  retainedBeamSequence: Array<Array<{ filterStateKey: string; filterCount: number }>>
  completedGenerationCount: number
  naturalStopGeneration: number | null
  terminalGeneration: number
  terminalReason: 'natural-stop' | 'generation-bound'
}

export interface C3ObserverFidelity {
  equivalent: boolean
  resultEqual: boolean
  completedGenerationCountEqual: boolean
  retainedBeamSequenceEqual: boolean
  workCountersEqual: boolean
  naturalTerminationEqual: boolean
  traceEqual: boolean
  off: C3DeterministicTrajectory
  on: C3DeterministicTrajectory
}

function cloneObservedState(state: C3ObservedState): C3ObservedState {
  return {
    ...state,
    filters: state.filters.map((filter) => ({ ...filter })),
  }
}

function compareKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined || rightValue === undefined) {
      if (leftValue === rightValue) continue
      return leftValue === undefined ? -1 : 1
    }
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

/** Compare observations with the frozen structural reference ordering. */
function compareFrozenQuality(left: C3ObservedState, right: C3ObservedState): number {
  const toSearchState = (state: C3ObservedState): SearchState => ({
    candidateId: state.filterStateKey,
    filters: state.filters.map((filter) => ({ ...filter })),
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore ?? 0,
  })
  return compareKeys(
    referenceSelectorKey(toSearchState(left)),
    referenceSelectorKey(toSearchState(right)),
  )
}

export function computeExactCountSeries(states: readonly C3ObservedState[]): C3ExactFrontierPoint[] {
  const bestByCount = new Map<number, C3ObservedState>()
  for (const state of states) {
    const copy = cloneObservedState(state)
    const N = copy.filters.length
    const incumbent = bestByCount.get(N)
    if (incumbent === undefined || compareFrozenQuality(copy, incumbent) < 0) {
      bestByCount.set(N, copy)
    }
  }
  return [...bestByCount.entries()]
    .sort(([left], [right]) => left - right)
    .map(([N, state]) => ({
      ...state,
      N,
      normalizedViolation: Math.max(state.rmseDb / 0.25, state.maxAbsDb / 0.75),
    }))
}

export function computeCumulativeFrontier(exact: readonly C3ExactFrontierPoint[]): C3FrontierPoint[] {
  const sorted = [...exact].sort((left, right) => left.N - right.N)
  let representative: C3ExactFrontierPoint | undefined
  return sorted.map((point) => {
    if (
      representative === undefined ||
      point.normalizedViolation < representative.normalizedViolation ||
      (point.normalizedViolation === representative.normalizedViolation &&
        compareFrozenQuality(point, representative) < 0)
    ) {
      representative = point
    }
    return {
      ...cloneObservedState(representative),
      N: point.N,
      normalizedViolation: representative.normalizedViolation,
      representativeFilterCount: representative.N,
    }
  })
}

export function computePrefixKnee(
  states: readonly C3ObservedState[],
  prefix: 'g10' | 'g20' | 'g30-final',
): C3PrefixKnee {
  const maximumGeneration = prefix === 'g10' ? 10 : prefix === 'g20' ? 20 : Number.POSITIVE_INFINITY
  const prefixStates = states.filter((state) =>
    state.generation === undefined || state.generation <= maximumGeneration)
  const frontier = computeCumulativeFrontier(computeExactCountSeries(prefixStates))
  return { prefix, frontier, knee: selectGeometricKnee(frontier) }
}

export function classifyC3Case(
  finalFrontier: readonly C3FrontierPoint[],
  finalFilterCount: number,
): 'KNEE_CASE' | 'NO_KNEE_CASE' {
  const knee = selectGeometricKnee(finalFrontier)
  return knee.status === 'UNIQUE_KNEE' && knee.N_knee! < finalFilterCount
    ? 'KNEE_CASE'
    : 'NO_KNEE_CASE'
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

export function secondaryMetricsForState(
  state: Pick<C3ObservedState, 'filters' | 'cancellationScore'>,
  grid: C3PreparedSearchGrid,
): C3StateSecondaryMetrics {
  const filters = state.filters
  const qValues = filters.map((filter) => filter.q).filter(Number.isFinite)
  const cancellation = auditCancellations(filters, grid.frequenciesHz, grid.sampleRateHz)
  return {
    cancellationScore: state.cancellationScore ?? cancellation.totalScore,
    qP50: percentile(qValues, 0.5),
    qP90: percentile(qValues, 0.9),
    qMax: qValues.length === 0 ? 0 : Math.max(...qValues),
    maxAbsGainDb: filters.length === 0 ? 0 : Math.max(...filters.map((filter) => Math.abs(filter.gainDb))),
    sumAbsGainDb: filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0),
    opposingNearbyCancellationPairCount: cancellation.pairs.length,
  }
}

export function summarizeKneeVsFinal(
  frontier: readonly C3FrontierPoint[],
  knee: C3KneeResult,
  finalFilterCount: number,
  grid: C3PreparedSearchGrid,
): C3KneeVsFinalMetrics {
  const finalPoint = frontier.at(-1)
  if (finalPoint === undefined) throw new Error('C3 final frontier must not be empty')
  const kneePoint = knee.status === 'UNIQUE_KNEE'
    ? frontier.find((point) => point.N === knee.N_knee) ?? null
    : null
  const totalImprovement = frontier[0]!.normalizedViolation - finalPoint.normalizedViolation
  const kneeImprovement = kneePoint === null
    ? null
    : frontier[0]!.normalizedViolation - kneePoint.normalizedViolation
  return {
    N_knee: kneePoint?.N ?? null,
    N_final: finalFilterCount,
    filtersSaved: kneePoint === null ? null : finalFilterCount - kneePoint.N,
    violationKnee: kneePoint?.normalizedViolation ?? null,
    violationFinal: finalPoint.normalizedViolation,
    rmseKnee: kneePoint?.rmseDb ?? null,
    rmseFinal: finalPoint.rmseDb,
    maxAbsKnee: kneePoint?.maxAbsDb ?? null,
    maxAbsFinal: finalPoint.maxAbsDb,
    maeKnee: kneePoint?.maeDb ?? null,
    maeFinal: finalPoint.maeDb,
    fractionFrontierImprovementCapturedAtKnee: kneePoint === null || totalImprovement === 0
      ? null
      : kneeImprovement! / totalImprovement,
    residualImprovementAfterKnee: kneePoint === null ? null : kneePoint.normalizedViolation - finalPoint.normalizedViolation,
    kneeSecondary: kneePoint === null ? null : secondaryMetricsForState(kneePoint, grid),
    finalSecondary: secondaryMetricsForState(finalPoint, grid),
  }
}

export function selectGeometricKnee(frontier: readonly C3FrontierPoint[]): C3KneeResult {
  if (frontier.length < 3) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'INSUFFICIENT_FRONTIER' }
  }

  const N_min = frontier[0]!.N
  const N_max = frontier.at(-1)!.N
  const E_max = frontier[0]!.normalizedViolation
  const E_min = frontier.at(-1)!.normalizedViolation
  const N_span = N_max - N_min
  const E_span = E_max - E_min
  if (N_span === 0 || E_span === 0) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'INSUFFICIENT_SPAN' }
  }

  let bestN: number | undefined
  let bestDistance: number | undefined
  let tied = false
  for (let index = 1; index < frontier.length - 1; index += 1) {
    const point = frontier[index]!
    const x = (point.N - N_min) / N_span
    const y = (point.normalizedViolation - E_min) / E_span
    const distance = (1 - x) - y
    if (!(distance > 0)) continue
    if (bestDistance === undefined || distance > bestDistance) {
      bestDistance = distance
      bestN = point.N
      tied = false
    } else if (distance === bestDistance) {
      tied = true
    }
  }

  if (bestDistance === undefined || bestN === undefined) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'NO_POSITIVE_INTERIOR_DISTANCE' }
  }
  if (tied) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'TIED_MAXIMUM' }
  }
  return { status: 'UNIQUE_KNEE', N_knee: bestN, distance: bestDistance }
}

export interface C3CaseEvidence {
  id: string
  split: 'development' | 'holdout'
  batch: 'A'
  source: Pick<CurveArtifact, 'identity' | 'path' | 'upstreamSha256' | 'canonicalParsedPointsSha256' | 'transformation'>
  target: Pick<CurveArtifact, 'identity' | 'path' | 'upstreamSha256' | 'canonicalParsedPointsSha256' | 'transformation'>
  normalization: typeof C3_NORMALIZATION
  trajectory: {
    maxGenerations: number
    completedGenerationCount: number
    terminalGeneration: number
    terminalReason: 'natural-stop' | 'generation-bound'
    result: {
      filterCount: number
      rmseDb: number
      maxAbsDb: number
      maeDb: number
      filterStateKey: string
    }
    traceSha256: string
    observationSha256: string
    workCounters: Record<string, number>
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
  finalFrontier: {
    exactCountSeries: C3FrontierPoint[]
    cumulative: C3FrontierPoint[]
  }
  temporalDiagnostic: {
    g10: C3KneeResult
    g20: C3KneeResult
    g30Final: C3KneeResult
    finalKneeRepresentedAtG10: boolean
    finalKneeRepresentedAtG20: boolean
    movementN: { g10ToG20: number | null; g20ToFinal: number | null }
  }
  knee: C3KneeResult
  classification: 'KNEE_CASE' | 'NO_KNEE_CASE'
  secondary: C3KneeVsFinalMetrics
  frontierInvariants: { exactCountsUnique: boolean; sortedCounts: boolean; cumulativeMonotone: boolean; representativesEvaluated: boolean }
}

export interface C3SyntheticSanityEvidence {
  id: string
  knownGeneratingComplexity: number
  N_knee: number | null
  N_final: number
  uniqueKnee: boolean
}

export interface C3CensusResult {
  manifest: Record<string, unknown>
  aggregate: Record<string, unknown>
  cases: C3CaseEvidence[]
  synthetic: C3SyntheticSanityEvidence[]
  evidenceSha256: string
  outputDir: string
}

function compactState(state: C3ObservedState): C3FrontierPoint {
  return {
    N: state.filters.length,
    normalizedViolation: Math.max(state.rmseDb / 0.25, state.maxAbsDb / 0.75),
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    maeDb: state.maeDb,
    filterStateKey: state.filterStateKey,
    stage: state.stage,
    generation: state.generation,
    filters: [],
    representativeFilterCount: state.filters.length,
  }
}

function compactFrontier(frontier: readonly (C3ExactFrontierPoint | C3FrontierPoint)[]): C3FrontierPoint[] {
  return frontier.map((point) => ({
    N: point.N,
    normalizedViolation: point.normalizedViolation,
    rmseDb: point.rmseDb,
    maxAbsDb: point.maxAbsDb,
    maeDb: point.maeDb,
    filterStateKey: point.filterStateKey,
    stage: point.stage,
    generation: point.generation,
    filters: [],
    representativeFilterCount: 'representativeFilterCount' in point ? point.representativeFilterCount : point.N,
  }))
}

function verifyFrontierInvariants(
  exact: readonly C3ExactFrontierPoint[],
  cumulative: readonly C3FrontierPoint[],
): C3CaseEvidence['frontierInvariants'] {
  const exactCounts = exact.map((point) => point.N)
  const cumulativeCounts = cumulative.map((point) => point.N)
  const exactCountsUnique = new Set(exactCounts).size === exactCounts.length
  const sortedCounts = exactCounts.every((N, index) => index === 0 || N > exactCounts[index - 1]!) &&
    cumulativeCounts.every((N, index) => index === 0 || N > cumulativeCounts[index - 1]!)
  const cumulativeMonotone = cumulative.every((point, index) =>
    index === 0 || point.normalizedViolation <= cumulative[index - 1]!.normalizedViolation)
  const exactKeys = new Set(exact.map((point) => point.filterStateKey))
  const representativesEvaluated = cumulative.every((point) =>
    point.representativeFilterCount <= point.N && exactKeys.has(point.filterStateKey))
  return { exactCountsUnique, sortedCounts, cumulativeMonotone, representativesEvaluated }
}

function stateResultMetrics(result: StructuralSearchResult, grid: C3PreparedSearchGrid): C3CaseEvidence['trajectory']['result'] {
  const filters = result.filters.map((filter) => ({ ...filter }))
  const response = cascadeMagnitudeDb(filters, grid.frequenciesHz, grid.sampleRateHz)
  const metrics = calculateErrorMetrics(grid.desiredDb.map((desired, index) => desired - response[index]!), grid.frequenciesHz)
  return {
    filterCount: filters.length,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    maeDb: metrics.maeDb,
    filterStateKey: JSON.stringify(filters.map(({ id: _id, ...filter }) => filter)),
  }
}

function trajectoryHash(trajectory: C3DeterministicTrajectory): { traceSha256: string; observationSha256: string } {
  return {
    traceSha256: sha256(JSON.stringify(trajectory.trace)),
    observationSha256: sha256(JSON.stringify(trajectory.observations.map((state) => ({
      filterStateKey: state.filterStateKey,
      rmseDb: state.rmseDb,
      maxAbsDb: state.maxAbsDb,
      maeDb: state.maeDb,
      stage: state.stage,
      generation: state.generation,
    })))),
  }
}

function movementN(
  first: C3KneeResult,
  second: C3KneeResult,
): number | null {
  return first.status === 'UNIQUE_KNEE' && second.status === 'UNIQUE_KNEE'
    ? second.N_knee! - first.N_knee!
    : null
}

async function runOneC3Case(
  artifact: CorpusCaseArtifact,
  config: ResolvedStructuralSearchConfig,
): Promise<C3CaseEvidence> {
  const prepared = await prepareFrozenCase(artifact)
  const fidelity = runC3ObserverFidelity(prepared, { config, maxGenerations: C3_MAX_GENERATIONS })
  if (!fidelity.equivalent) throw new Error(`C3 observer fidelity failed for ${artifact.id}`)
  const trajectory = fidelity.on
  const exact = computeExactCountSeries(trajectory.observations)
  const cumulative = computeCumulativeFrontier(exact)
  const knee = selectGeometricKnee(cumulative)
  const g10 = computePrefixKnee(trajectory.observations, 'g10')
  const g20 = computePrefixKnee(trajectory.observations, 'g20')
  const g30Final = computePrefixKnee(trajectory.observations, 'g30-final')
  const finalMetrics = stateResultMetrics(trajectory.result, prepared)
  const secondary = summarizeKneeVsFinal(cumulative, knee, finalMetrics.filterCount, prepared)
  const invariants = verifyFrontierInvariants(exact, cumulative)
  if (!Object.values(invariants).every(Boolean)) throw new Error(`C3 frontier invariants failed for ${artifact.id}`)
  const hashes = trajectoryHash(trajectory)
  return {
    id: artifact.id,
    split: artifact.split,
    batch: 'A',
    source: {
      identity: artifact.source.identity,
      path: artifact.source.path,
      upstreamSha256: artifact.source.upstreamSha256,
      canonicalParsedPointsSha256: artifact.source.canonicalParsedPointsSha256,
      transformation: artifact.source.transformation,
    },
    target: {
      identity: artifact.target.identity,
      path: artifact.target.path,
      upstreamSha256: artifact.target.upstreamSha256,
      canonicalParsedPointsSha256: artifact.target.canonicalParsedPointsSha256,
      transformation: artifact.target.transformation,
    },
    normalization: C3_NORMALIZATION,
    trajectory: {
      maxGenerations: C3_MAX_GENERATIONS,
      completedGenerationCount: trajectory.completedGenerationCount,
      terminalGeneration: trajectory.terminalGeneration,
      terminalReason: trajectory.terminalReason,
      result: finalMetrics,
      ...hashes,
      workCounters: workCounters(trajectory.trace),
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
    finalFrontier: {
      exactCountSeries: compactFrontier(exact),
      cumulative: compactFrontier(cumulative),
    },
    temporalDiagnostic: {
      g10: g10.knee,
      g20: g20.knee,
      g30Final: g30Final.knee,
      finalKneeRepresentedAtG10: knee.status === 'UNIQUE_KNEE' && g10.frontier.some((point) => point.N === knee.N_knee),
      finalKneeRepresentedAtG20: knee.status === 'UNIQUE_KNEE' && g20.frontier.some((point) => point.N === knee.N_knee),
      movementN: { g10ToG20: movementN(g10.knee, g20.knee), g20ToFinal: movementN(g20.knee, g30Final.knee) },
    },
    knee,
    classification: knee.status === 'UNIQUE_KNEE' && knee.N_knee! < finalMetrics.filterCount ? 'KNEE_CASE' : 'NO_KNEE_CASE',
    secondary,
    frontierInvariants: invariants,
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

function renderC3Report(
  config: ResolvedStructuralSearchConfig,
  cases: readonly C3CaseEvidence[],
  synthetic: readonly C3SyntheticSanityEvidence[],
  classification: string,
  coverage: { development: number; holdout: number; overall: number },
): string {
  const format = (value: number | null | undefined): string => value === null || value === undefined ? 'none' : value.toFixed(6)
  const lines = [
    '# C3 filter-count/error knee census — Fresh Real Corpus V1.2',
    '',
    `- Frozen corpus commit: \`${C3_CORPUS_COMMIT}\` (${C3_CORPUS_CLASSIFICATION}).`,
    `- Corpus evidence SHA-256: \`${C3_CORPUS_EVIDENCE_SHA256}\`.`,
    `- Upstream: \`jaakkopasanen/AutoEq\` commit \`${C3_UPSTREAM_COMMIT}\`, tree \`${C3_UPSTREAM_TREE}\`.`,
    '- Selected algorithm: **FROZEN_BASELINE**; this census adds observation only and does not implement a production knee selector.',
    `- Resolved envelope: C${config.maxFilters}/e${C3_EFFORT_LEVEL}, preset \`${config.preset}\`, beam ${config.beamWidth}, proposals/parent ${config.proposalsPerParent}, polish ${config.localPolishEvaluations}, admission \`${config.admission}\`, work profile \`${config.workProfile}\`.`,
    '- Execution: one deterministic generation-work-bounded trajectory per case, maximum 31 completed ordinary generations (natural termination is retained).',
    '',
    '## Batch A cases',
    '',
    '| Case | Split | N_min | N_knee | N_final | Filters saved | Violation knee/final | RMSE knee/final | maxAbs knee/final | MAE knee/final | Classification |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...cases.map((value) => {
      const first = value.finalFrontier.cumulative[0]
      return `| ${value.id} | ${value.split} | ${first?.N ?? 'none'} | ${value.secondary.N_knee ?? 'none'} | ${value.secondary.N_final} | ${value.secondary.filtersSaved ?? 'none'} | ${format(value.secondary.violationKnee)} / ${format(value.secondary.violationFinal)} | ${format(value.secondary.rmseKnee)} / ${format(value.secondary.rmseFinal)} | ${format(value.secondary.maxAbsKnee)} / ${format(value.secondary.maxAbsFinal)} | ${format(value.secondary.maeKnee)} / ${format(value.secondary.maeFinal)} | ${value.classification} |`
    }),
    '',
    '## Temporal diagnostic',
    '',
    '| Case | g10 knee | g20 knee | final knee | movement g10→g20 | movement g20→final | final N represented at g10 | final N represented at g20 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...cases.map((value) => `| ${value.id} | ${value.temporalDiagnostic.g10.N_knee ?? 'none'} | ${value.temporalDiagnostic.g20.N_knee ?? 'none'} | ${value.knee.N_knee ?? 'none'} | ${value.temporalDiagnostic.movementN.g10ToG20 ?? 'none'} | ${value.temporalDiagnostic.movementN.g20ToFinal ?? 'none'} | ${value.temporalDiagnostic.finalKneeRepresentedAtG10 ? 'yes' : 'no'} | ${value.temporalDiagnostic.finalKneeRepresentedAtG20 ? 'yes' : 'no'} |`),
    '',
    '## Gate',
    '',
    `- Development KNEE_CASE coverage: ${coverage.development}/3.`,
    `- Holdout KNEE_CASE coverage: ${coverage.holdout}/3.`,
    `- Overall KNEE_CASE coverage: ${coverage.overall}/6.`,
    `- Final C3 classification: **${classification}**.`,
    '- Gate: supported requires development ≥2/3, holdout ≥2/3, overall ≥4/6, observer OFF/ON equivalence, and all frontier invariants.',
    '',
    '## Synthetic sanity (D/E/F/H)',
    '',
    '| Case | Known generating complexity | N_knee | N_final | Unique knee |',
    '| --- | ---: | ---: | ---: | --- |',
    ...synthetic.map((value) => `| ${value.id} | ${value.knownGeneratingComplexity} | ${value.N_knee ?? 'none'} | ${value.N_final} | ${value.uniqueKnee ? 'yes' : 'no'} |`),
    '',
    '- Synthetic results are sanity checks only and do not move the real-case gate.',
    '- Secondary cancellation/Q/gain metrics are recorded in each per-case frontier artifact and do not move the knee.',
    '',
    `- Interpretation: ${classification === 'KNEE_SIGNAL_SUPPORTED' ? 'stop after the census; a later milestone may implement exactly this geometric selector for a direct frozen-baseline benchmark.' : classification === 'KNEE_SIGNAL_NOT_SUPPORTED' ? 'close C3 immediately; next research hypothesis is C2 objective/loss research using untouched Batch B.' : 'evidence is inconclusive; report the exact instrumentation/evidence limitation and do not automatically rerun.'}`,
    '',
  ]
  return `${lines.join('\n').trimEnd()}\n`
}

function assertC3CaseEvidence(caseEvidence: readonly C3CaseEvidence[]): void {
  assertC3BatchACaseIds(caseEvidence.map((value) => value.id))
  if (caseEvidence.length !== 6 || new Set(caseEvidence.map((value) => value.id)).size !== 6) {
    throw new Error('C3 artifact must contain exactly six distinct Batch A cases')
  }
  if (caseEvidence.some((value) => value.batch !== 'A')) throw new Error('C3 artifact contains a non-Batch-A case')
}

/** Execute and commit the complete C3 V1.2 census artifact set. */
export async function runC3Census(
  outputDir = resolve(C3_REPOSITORY_ROOT, C3_ARTIFACT_RELATIVE_DIR),
): Promise<C3CensusResult> {
  const corpus = readFrozenCorpusArtifact()
  const selectedIds = [...C3_BATCH_A_CASE_IDS]
  assertC3BatchACaseIds(selectedIds)
  const selected = corpus.cases.filter((value) => selectedIds.includes(value.id as (typeof C3_BATCH_A_CASE_IDS)[number]))
  if (selected.length !== 6 || selected.some((value) => value.batch !== 'A')) {
    throw new Error('Frozen corpus Batch A selection is incomplete or contaminated')
  }
  await verifyPinnedUpstream()
  const config = resolveC3SearchConfig()
  const cases: C3CaseEvidence[] = []
  for (const artifact of selected) {
    console.log(`C3 real case ${artifact.id} (${artifact.split})`)
    cases.push(await runOneC3Case(artifact, config))
  }
  assertC3CaseEvidence(cases)
  // Freeze the complete real result before beginning the synthetic sanity pass.
  const frozenRealEvidence = JSON.parse(JSON.stringify(cases)) as C3CaseEvidence[]

  const syntheticIds = new Set([
    'synthetic-d-dense-known-structure',
    'synthetic-e-high-q-valid',
    'synthetic-f-upper-frequency-structure',
    'synthetic-h-alternating-structure',
  ])
  const { loadSyntheticGroundTruthCorpus } = await import('./syntheticCorpus.js')
  const synthetic: C3SyntheticSanityEvidence[] = []
  for (const value of loadSyntheticGroundTruthCorpus().filter((candidate) => syntheticIds.has(candidate.id))) {
    const trajectory = runC3DeterministicBaseline({
      frequenciesHz: value.frequenciesHz,
      desiredDb: value.desiredDb,
      sampleRateHz: value.sampleRateHz,
    }, { config, maxGenerations: C3_MAX_GENERATIONS })
    const frontier = computeCumulativeFrontier(computeExactCountSeries(trajectory.observations))
    const knee = selectGeometricKnee(frontier)
    synthetic.push({
      id: value.id,
      knownGeneratingComplexity: value.knownStructuralComplexity,
      N_knee: knee.N_knee ?? null,
      N_final: trajectory.result.filters.length,
      uniqueKnee: knee.status === 'UNIQUE_KNEE',
    })
  }
  synthetic.sort((left, right) => left.id.localeCompare(right.id))

  const development = frozenRealEvidence.filter((value) => value.split === 'development')
  const holdout = frozenRealEvidence.filter((value) => value.split === 'holdout')
  const developmentCoverage = development.filter((value) => value.classification === 'KNEE_CASE').length
  const holdoutCoverage = holdout.filter((value) => value.classification === 'KNEE_CASE').length
  const overallCoverage = frozenRealEvidence.filter((value) => value.classification === 'KNEE_CASE').length
  const fidelityPass = frozenRealEvidence.every((value) => Object.values(value.observerFidelity).every(Boolean))
  const invariantsPass = frozenRealEvidence.every((value) => Object.values(value.frontierInvariants).every(Boolean))
  const evidenceValid = fidelityPass && invariantsPass
  const classification = !evidenceValid
    ? 'INCONCLUSIVE'
    : developmentCoverage >= 2 && holdoutCoverage >= 2 && overallCoverage >= 4
      ? 'KNEE_SIGNAL_SUPPORTED'
      : 'KNEE_SIGNAL_NOT_SUPPORTED'

  const caseSummaries = frozenRealEvidence.map((value) => ({
    id: value.id,
    split: value.split,
    N_min: value.finalFrontier.cumulative[0]?.N ?? null,
    N_knee: value.secondary.N_knee,
    N_final: value.secondary.N_final,
    filtersSaved: value.secondary.filtersSaved,
    violationKnee: value.secondary.violationKnee,
    violationFinal: value.secondary.violationFinal,
    rmseKnee: value.secondary.rmseKnee,
    rmseFinal: value.secondary.rmseFinal,
    maxAbsKnee: value.secondary.maxAbsKnee,
    maxAbsFinal: value.secondary.maxAbsFinal,
    maeKnee: value.secondary.maeKnee,
    maeFinal: value.secondary.maeFinal,
    classification: value.classification,
    observerFidelity: value.observerFidelity,
    frontierInvariants: value.frontierInvariants,
    frontierPath: `frontiers/${value.id}.json`,
  }))
  const aggregate: Record<string, unknown> = {
    schemaVersion: 1,
    artifact: 'objective-c3-filter-knee-census-v1.2',
    corpus: {
      commit: C3_CORPUS_COMMIT,
      classification: C3_CORPUS_CLASSIFICATION,
      evidenceSha256: C3_CORPUS_EVIDENCE_SHA256,
      casesSha256: corpus.casesSha256,
      provenanceSha256: corpus.provenanceSha256,
      upstream: { repository: 'jaakkopasanen/AutoEq', commit: C3_UPSTREAM_COMMIT, tree: C3_UPSTREAM_TREE },
    },
    protocol: {
      selectedAlgorithm: 'FROZEN_BASELINE',
      caseIds: selectedIds,
      developmentCaseIds: [...C3_BATCH_A_DEVELOPMENT_IDS],
      holdoutCaseIds: [...C3_BATCH_A_HOLDOUT_IDS],
      deterministicGenerationBound: C3_MAX_GENERATIONS,
      naturalTermination: 'allowed-earlier-than-generation-bound',
      trajectoryCount: 6,
      observerMode: 'frontier-observer-on-primary-with-off-on-fidelity-per-case',
      wallClockTermination: false,
      batchBExecuted: false,
      batchCExecuted: false,
      oldStructuralVNextCasesExecuted: false,
    },
    normalization: C3_NORMALIZATION,
    resolvedSearchConfig: config,
    cases: caseSummaries,
    synthetic,
    coverage: { development: developmentCoverage, holdout: holdoutCoverage, overall: overallCoverage },
    observerFidelity: { pass: fidelityPass, allCases: frozenRealEvidence.map((value) => ({ id: value.id, ...value.observerFidelity })) },
    frontierInvariants: { pass: invariantsPass },
    classification,
  }

  mkdirSync(outputDir, { recursive: true })
  mkdirSync(resolve(outputDir, 'frontiers'), { recursive: true })
  for (const value of frozenRealEvidence) {
    writeJson(resolve(outputDir, 'frontiers', `${value.id}.json`), {
      schemaVersion: 1,
      caseId: value.id,
      split: value.split,
      batch: value.batch,
      source: value.source,
      target: value.target,
      normalization: value.normalization,
      trajectory: value.trajectory,
      observerFidelity: value.observerFidelity,
      finalFrontier: value.finalFrontier,
      temporalDiagnostic: value.temporalDiagnostic,
      knee: value.knee,
      classification: value.classification,
      secondary: value.secondary,
      frontierInvariants: value.frontierInvariants,
    })
  }
  writeJson(resolve(outputDir, 'aggregate-evidence.json'), aggregate)
  const evidencePaths = [
    'aggregate-evidence.json',
    ...frozenRealEvidence.map((value) => `frontiers/${value.id}.json`),
  ]
  const evidenceSha256 = hashEvidenceFiles(outputDir, evidencePaths)
  const report = renderC3Report(config, frozenRealEvidence, synthetic, classification, {
    development: developmentCoverage,
    holdout: holdoutCoverage,
    overall: overallCoverage,
  })
  writeFileSync(resolve(outputDir, 'final-report.md'), report, 'utf8')
  writeFileSync(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    artifact: 'objective-c3-filter-knee-census-v1.2',
    status: classification,
    researchQuestion: 'Does the frozen structural baseline exhibit a reproducible, parameter-free filter-count/error knee on fresh real cases?',
    corpus: {
      commit: C3_CORPUS_COMMIT,
      classification: C3_CORPUS_CLASSIFICATION,
      evidenceSha256: C3_CORPUS_EVIDENCE_SHA256,
      casesSha256: corpus.casesSha256,
      provenanceSha256: corpus.provenanceSha256,
    },
    upstream: { repository: 'jaakkopasanen/AutoEq', commit: C3_UPSTREAM_COMMIT, tree: C3_UPSTREAM_TREE },
    normalization: C3_NORMALIZATION,
    caseIds: selectedIds,
    caseCount: 6,
    split: { development: [...C3_BATCH_A_DEVELOPMENT_IDS], holdout: [...C3_BATCH_A_HOLDOUT_IDS] },
    resolvedSearchConfig: config,
    protocol: aggregate.protocol,
    coverage: aggregate.coverage,
    synthetic,
    evidenceSha256,
    evidenceHashScope: evidencePaths,
    files: ['manifest.json', 'aggregate-evidence.json', ...evidencePaths.slice(1), 'evidence-sha256.txt', 'final-report.md'],
  }
  writeJson(resolve(outputDir, 'manifest.json'), manifest)
  return { manifest, aggregate, cases: frozenRealEvidence, synthetic, evidenceSha256, outputDir }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC3Census().then((result) => {
    console.log(JSON.stringify({
      outputDir: result.outputDir,
      evidenceSha256: result.evidenceSha256,
      classification: result.manifest.status,
    }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
}
