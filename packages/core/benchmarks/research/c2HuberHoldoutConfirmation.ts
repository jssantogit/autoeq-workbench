import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { calculateErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { semanticFilterKey } from '../../src/autoeq/v2/structuralSearch.js'
import {
  C2_BATCH_B_DEVELOPMENT_IDS,
  C2_BATCH_B_HOLDOUT_IDS,
  C2_BATCH_C_CASE_IDS,
  C2_C3_EVIDENCE_SHA256,
  C2_CORPUS_CLASSIFICATION,
  C2_CORPUS_COMMIT,
  C2_CORPUS_EVIDENCE_SHA256,
  C2_FROZEN_BOUNDARY,
  C2_HUBER_DELTA_DB,
  C2_LOSS_NAMES,
  C2_MAX_GENERATIONS,
  C2_NORMALIZATION,
  C2_OLD_STRUCTURAL_VNEXT_CASE_IDS,
  C2_UPSTREAM_COMMIT,
  C2_UPSTREAM_TREE,
  calculateHuber075,
  deduplicateObservedStates,
  prepareC2Case,
  rankStatesByLoss,
  resolveC2SearchConfig,
  runC2ObserverFidelity,
  spearmanRankCorrelation,
  type C2LossName,
  type C2PreparedCase,
  type C2SelectedWinner,
  type C2StateEvidence,
  type C2StateDiagnostics,
} from './c2RobustLossDevCensus.js'
import type { C3ObserverFidelity } from './c3FilterKneeCensus.js'

// Re-export the sealed corpus IDs and trajectory resolver so protocol tests and
// callers cannot accidentally substitute a different split/profile.
export {
  C2_BATCH_B_DEVELOPMENT_IDS,
  C2_BATCH_B_HOLDOUT_IDS,
  C2_BATCH_C_CASE_IDS,
  resolveC2SearchConfig,
} from './c2RobustLossDevCensus.js'

export const C2B_AUDITED_C2A_COMMIT = 'e042f312d414308c09819bef6ab45567846e959f' as const
export const C2B_AUDITED_C2A_EVIDENCE_SHA256 = '7678c3c0ba37fc35e46ba5ed9644552b4262334e8561f2dc4e03e885f87ccfd8' as const
export const C2B_CANDIDATE = 'HUBER-075' as const
export const C2B_DIVERGENCE_EXACT_N_THRESHOLD = 0.25 as const
export const C2B_DIVERGENCE_CORRELATION_THRESHOLD = 0.995 as const
export const C2B_ARTIFACT_RELATIVE_DIR = '.research-artifacts/objective-c2-huber-holdout-confirmation' as const

export const C2B_PROTOCOL_SCHEMA_VERSION = 1 as const
export const C2B_CORPUS_VERSION = 'fresh-real-corpus-v1.2' as const

const C2B_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const C2B_CORPUS_ARTIFACT_DIR = resolve(C2B_REPOSITORY_ROOT, '.research-artifacts/fresh-real-corpus-v1-metadata-repair')

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

export type C2bCorpusCase = {
  id: string
  source: CurveArtifact
  target: CurveArtifact
  pairing: string
  normalization: typeof C2_NORMALIZATION
  batch: 'A' | 'B' | 'C'
  split: 'development' | 'holdout'
}

type C2bFrozenCorpus = {
  manifest: Record<string, unknown>
  cases: C2bCorpusCase[]
  provenance: { cases: C2bCorpusCase[]; repository: string; commit: string; tree: string }
  casesSha256: string
  provenanceSha256: string
}

// The imported C2a helpers intentionally remain the sole implementation of
// reacquisition, V2 grid preparation, and the audited observer. C2b only
// changes the admissible split and the reporting/gate around that observer.
type C2PreparedCaseInput = Parameters<typeof prepareC2Case>[0]
type C2State = ReturnType<typeof deduplicateObservedStates>[number]

export type C2bHoldoutClassification =
  | 'HUBER_PREFERENCE_GENERALIZES'
  | 'HUBER_PREFERENCE_NOT_CONFIRMED'
  | 'INCONCLUSIVE'

export type C2bCombinedInterpretation =
  | 'ROBUST_LOSS_PREFERENCE_GENERALIZED'
  | 'C2_CLOSED_HOLDOUT_NOT_CONFIRMED'
  | 'INCONCLUSIVE'

export interface C2bExactNPreference {
  N: number
  stateCount: number
  winners: Record<C2LossName, { filterStateKey: string; loss: number; filterCount: number }>
}

export interface C2bStateEvidence extends C2StateEvidence {
  diagnostics: Pick<C2StateDiagnostics, 'bands' | 'outlierConcentration'>
}

export interface C2bDivergenceEvidence {
  globalWinnerDiffersFromMSE: boolean
  globalWinnerDiffersFromControl: boolean
  exactN: {
    comparableCount: number
    differingCount: number
    fraction: number
    firstN: number | null
    lastN: number | null
  }
  conditionA: boolean
  conditionB: boolean
  huberPreferenceDivergence: boolean
}

export interface C2bDivergenceDecision {
  conditionA: boolean
  conditionB: boolean
  huberPreferenceDivergence: boolean
}

export interface C2bCaseEvidence {
  id: string
  batch: 'B'
  split: 'holdout'
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
  states: C2bStateEvidence[]
  globalWinners: Record<C2LossName, C2SelectedWinner>
  exactN: C2bExactNPreference[]
  rankCorrelations: {
    MSE_HUBER075: number
    CONTROL_HUBER075: number
    MSE_MAE: number
    MAE_HUBER075: number
  }
  divergence: C2bDivergenceEvidence
  holdoutGate: 'HUBER_PREFERENCE_DIVERGENCE' | 'NO_HUBER_PREFERENCE_DIVERGENCE'
}

export interface C2bGateResult {
  coverage: number
  total: number
  classification: C2bHoldoutClassification
}

export interface C2bHoldoutResult {
  manifest: Record<string, unknown>
  aggregate: Record<string, unknown>
  cases: C2bCaseEvidence[]
  evidenceSha256: string
  outputDir: string
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readFrozenCorpus(): C2bFrozenCorpus {
  const manifestBytes = readFileSync(resolve(C2B_CORPUS_ARTIFACT_DIR, 'manifest.json'))
  const casesBytes = readFileSync(resolve(C2B_CORPUS_ARTIFACT_DIR, 'cases.json'))
  const provenanceBytes = readFileSync(resolve(C2B_CORPUS_ARTIFACT_DIR, 'provenance.json'))
  if (sha256(manifestBytes) !== C2_CORPUS_EVIDENCE_SHA256) {
    throw new Error('C2b corpus manifest SHA-256 does not match Fresh Real Corpus V1.2')
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>
  const cases = JSON.parse(casesBytes.toString('utf8')) as C2bCorpusCase[]
  const provenance = JSON.parse(provenanceBytes.toString('utf8')) as C2bFrozenCorpus['provenance']
  const casesSha256 = sha256(JSON.stringify(cases))
  const provenanceSha256 = sha256(JSON.stringify(provenance))
  if (manifest.status !== C2_CORPUS_CLASSIFICATION || manifest.corpusVersion !== C2B_CORPUS_VERSION) {
    throw new Error('C2b corpus classification/version mismatch')
  }
  if (manifest.casesSha256 !== casesSha256 || manifest.provenanceSha256 !== provenanceSha256) {
    throw new Error('C2b corpus cases/provenance hash mismatch')
  }
  if (
    provenance.repository !== 'jaakkopasanen/AutoEq' ||
    provenance.commit !== C2_UPSTREAM_COMMIT ||
    provenance.tree !== C2_UPSTREAM_TREE ||
    JSON.stringify(provenance.cases) !== JSON.stringify(cases)
  ) {
    throw new Error('C2b corpus provenance does not match the frozen V1.2 cases')
  }
  if (cases.length !== 18 || cases.some((value) => value.normalization.frequencyHz !== 500 || value.normalization.levelDb !== 60)) {
    throw new Error('C2b frozen corpus must contain 18 V1.2 cases with 500 Hz/60 dB normalization')
  }
  return { manifest, cases, provenance, casesSha256, provenanceSha256 }
}

/** Exported for provenance tests without exposing raw curve data in artifacts. */
export function assertC2bCorpusProvenance(): void {
  readFrozenCorpus()
}

export function assertC2bBatchBHoldoutCaseIds(caseIds: readonly string[]): void {
  if (caseIds.some((id) => C2_BATCH_C_CASE_IDS.includes(id as (typeof C2_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('C2b runner rejects Batch C case IDs; Batch C execution is sealed')
  }
  if (caseIds.some((id) => C2_BATCH_B_DEVELOPMENT_IDS.includes(id as (typeof C2_BATCH_B_DEVELOPMENT_IDS)[number]))) {
    throw new Error('C2b runner rejects already-observed Batch B development case IDs')
  }
  if (caseIds.some((id) => C2_OLD_STRUCTURAL_VNEXT_CASE_IDS.includes(id as (typeof C2_OLD_STRUCTURAL_VNEXT_CASE_IDS)[number]))) {
    throw new Error('C2b runner rejects old Structural VNext case IDs')
  }
  const expected = [...C2_BATCH_B_HOLDOUT_IDS].sort()
  const actual = [...caseIds].sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`C2b runner requires exactly the three Batch B holdout IDs; received ${caseIds.join(', ')}`)
  }
}

/** Explicit fail-closed assertion used by the holdout runner and tests. */
export function assertC2bBatchCRejected(caseIds: readonly string[]): void {
  if (caseIds.some((id) => C2_BATCH_C_CASE_IDS.includes(id as (typeof C2_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('Batch C execution is explicitly rejected by C2b')
  }
}

export function calculateC2bHuber075(residualDb: readonly number[]): number {
  return calculateHuber075(residualDb)
}

export function exactNHuberDivergence(
  exactN: readonly C2bExactNPreference[],
): C2bDivergenceEvidence['exactN'] {
  const comparable = exactN.filter((point) => point.stateCount >= 2)
  const differing = comparable.filter((point) => point.winners[C2B_CANDIDATE].filterStateKey !== point.winners.MSE.filterStateKey)
  return {
    comparableCount: comparable.length,
    differingCount: differing.length,
    fraction: comparable.length === 0 ? 0 : differing.length / comparable.length,
    firstN: differing[0]?.N ?? null,
    lastN: differing.at(-1)?.N ?? null,
  }
}

/** Apply the frozen two-condition holdout rule without changing thresholds. */
export function classifyC2bDivergence(input: {
  globalWinnerDiffersFromMSE: boolean
  exactNDivergenceFraction: number
  mseHuberCorrelation: number
}): C2bDivergenceDecision {
  const conditionA = input.globalWinnerDiffersFromMSE || input.exactNDivergenceFraction >= C2B_DIVERGENCE_EXACT_N_THRESHOLD
  const conditionB = input.mseHuberCorrelation < C2B_DIVERGENCE_CORRELATION_THRESHOLD
  return { conditionA, conditionB, huberPreferenceDivergence: conditionA && conditionB }
}

export function classifyC2bGate(
  divergentCases: readonly { huberPreferenceDivergence: boolean }[],
  fidelityPass: boolean,
  provenancePass = true,
): C2bGateResult {
  const coverage = divergentCases.filter((value) => value.huberPreferenceDivergence).length
  const total = divergentCases.length
  const classification: C2bHoldoutClassification = !fidelityPass || !provenancePass
    ? 'INCONCLUSIVE'
    : coverage >= 2
      ? 'HUBER_PREFERENCE_GENERALIZES'
      : 'HUBER_PREFERENCE_NOT_CONFIRMED'
  return { coverage, total, classification }
}

function assignRanks(states: C2State[]): void {
  for (const loss of C2_LOSS_NAMES) {
    const sorted = rankStatesByLoss(states, loss)
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

function stateEvidence(state: C2State): C2bStateEvidence {
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
    diagnostics: {
      bands: state.diagnostics.bands,
      outlierConcentration: state.diagnostics.outlierConcentration,
    },
  }
}

function selectedWinner(state: C2State, loss: C2LossName): C2SelectedWinner {
  return {
    loss,
    filterStateKey: state.filterStateKey,
    filterCount: state.filters.length,
    losses: state.losses,
    diagnostics: state.diagnostics,
    provenance: stateEvidence(state).provenance,
  }
}

function exactNPreference(states: readonly C2State[]): C2bExactNPreference[] {
  const byCount = new Map<number, C2State[]>()
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

function traceHash(fidelity: C3ObserverFidelity): { traceSha256: string; observationSha256: string } {
  return {
    traceSha256: sha256(JSON.stringify(fidelity.on.trace)),
    observationSha256: sha256(JSON.stringify(fidelity.on.observations.map((state) => ({
      filterStateKey: state.filterStateKey,
      rmseDb: state.rmseDb,
      maxAbsDb: state.maxAbsDb,
      maeDb: state.maeDb,
      stage: state.stage,
      generation: state.generation,
    })))),
  }
}

function resultMetrics(fidelity: C3ObserverFidelity, grid: C2PreparedCase): C2CaseResultMetrics {
  const result = fidelity.on.result
  const filterStateKey = semanticFilterKey(result.filters)
  const responseDb = cascadeMagnitudeDb(result.filters, grid.frequenciesHz, grid.sampleRateHz)
  const residualDb = grid.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, grid.frequenciesHz)
  return {
    filterCount: result.filters.length,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    maeDb: metrics.maeDb,
    filterStateKey,
  }
}

type C2CaseResultMetrics = { filterCount: number; rmseDb: number; maxAbsDb: number; maeDb: number; filterStateKey: string }

function computeCaseEvidence(artifact: C2bCorpusCase, prepared: C2PreparedCase, fidelity: C3ObserverFidelity): C2bCaseEvidence {
  const states = deduplicateObservedStates(fidelity.on.observations, prepared)
  if (states.length === 0) throw new Error(`C2b observer returned no states for ${artifact.id}`)
  assignRanks(states)
  const exactN = exactNPreference(states)
  const globalWinners = {} as Record<C2LossName, C2SelectedWinner>
  for (const loss of C2_LOSS_NAMES) globalWinners[loss] = selectedWinner(rankStatesByLoss(states, loss)[0]!, loss)
  const exactDivergence = exactNHuberDivergence(exactN)
  const globalWinnerDiffersFromMSE = globalWinners[C2B_CANDIDATE].filterStateKey !== globalWinners.MSE.filterStateKey
  const globalWinnerDiffersFromControl = globalWinners[C2B_CANDIDATE].filterStateKey !== globalWinners.CONTROL.filterStateKey
  const rankCorrelations = {
    MSE_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.MSE), states.map((state) => state.losses[C2B_CANDIDATE])),
    CONTROL_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.CONTROL), states.map((state) => state.losses[C2B_CANDIDATE])),
    MSE_MAE: spearmanRankCorrelation(states.map((state) => state.losses.MSE), states.map((state) => state.losses.MAE)),
    MAE_HUBER075: spearmanRankCorrelation(states.map((state) => state.losses.MAE), states.map((state) => state.losses[C2B_CANDIDATE])),
  }
  const divergence = classifyC2bDivergence({
    globalWinnerDiffersFromMSE,
    exactNDivergenceFraction: exactDivergence.fraction,
    mseHuberCorrelation: rankCorrelations.MSE_HUBER075,
  })
  const hashes = traceHash(fidelity)
  const result = resultMetrics(fidelity, prepared)
  return {
    id: artifact.id,
    batch: 'B',
    split: 'holdout',
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
      exactN: exactDivergence,
      conditionA: divergence.conditionA,
      conditionB: divergence.conditionB,
      huberPreferenceDivergence: divergence.huberPreferenceDivergence,
    },
    holdoutGate: divergence.huberPreferenceDivergence ? 'HUBER_PREFERENCE_DIVERGENCE' : 'NO_HUBER_PREFERENCE_DIVERGENCE',
  }
}

function verifyPinnedUpstream(): Promise<void> {
  return fetch(`https://api.github.com/repos/jaakkopasanen/AutoEq/git/commits/${C2_UPSTREAM_COMMIT}`, {
    redirect: 'error',
    headers: { Accept: 'application/vnd.github+json' },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to verify pinned upstream commit: HTTP ${response.status}`)
    const commit = await response.json() as { sha?: string; tree?: { sha?: string } }
    if (commit.sha !== C2_UPSTREAM_COMMIT || commit.tree?.sha !== C2_UPSTREAM_TREE) {
      throw new Error('Pinned upstream commit/tree verification failed')
    }
  })
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

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function currentProtocolCommit(): string {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: C2B_REPOSITORY_ROOT, encoding: 'utf8' }).trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Unable to determine the protocol-freeze commit')
  return commit
}

function report(cases: readonly C2bCaseEvidence[], gate: C2bGateResult, protocolCommit: string, evidenceSha256: string, combined: C2bCombinedInterpretation): string {
  const pct = (value: number): string => `${(value * 100).toFixed(2)}%`
  const lines = [
    '# C2b Huber preference holdout confirmation — Fresh Real Corpus V1.2',
    '',
    `- C2a protocol boundary: \`${C2B_AUDITED_C2A_COMMIT}\`; C2a evidence SHA-256: \`${C2B_AUDITED_C2A_EVIDENCE_SHA256}\`.`,
    `- Protocol-freeze commit: \`${protocolCommit}\`; evidence SHA-256: \`${evidenceSha256}\`.`,
    `- Frozen candidate: **${C2B_CANDIDATE}**, delta **${C2_HUBER_DELTA_DB} dB**; no search decision used either loss.`,
    `- Corpus: \`${C2_CORPUS_COMMIT}\`, evidence SHA-256 \`${C2_CORPUS_EVIDENCE_SHA256}\`; Batch C executed: **false**.`,
    '',
    '## Holdout census',
    '',
    '| Case | unique states | MSE winner N | Huber winner N | comparable N | divergent N | exact-N divergence | ρ(MSE,Huber) | gate |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...cases.map((value) => `| ${value.id} | ${value.uniqueEvaluatedStateCount} | ${value.globalWinners.MSE.filterCount} | ${value.globalWinners[C2B_CANDIDATE].filterCount} | ${value.divergence.exactN.comparableCount} | ${value.divergence.exactN.differingCount} | ${pct(value.divergence.exactN.fraction)} | ${value.rankCorrelations.MSE_HUBER075.toFixed(6)} | ${value.holdoutGate} |`),
    '',
    '## Gate',
    '',
    `- Holdout divergence coverage: **${gate.coverage}/${gate.total}**.`,
    `- Final C2b classification: **${gate.classification}**.`,
    `- Combined C2 interpretation: **${combined}**.`,
    '- The result is preference evidence only. It does not prove Huber improves an online optimizer; a passing holdout authorizes only one later C2c Batch C implementation/benchmark.',
    '',
    '## Sealed execution',
    '',
    `- Exact holdouts: ${C2_BATCH_B_HOLDOUT_IDS.map((id) => `\`${id}\``).join(', ')}.`,
    '- Batch B development was not rerun; Batch C and all old Structural VNext cases were not executed.',
    '',
  ]
  return `${lines.join('\n').trimEnd()}\n`
}

/** Execute only the frozen Batch B holdout confirmation after protocol freeze. */
export async function runC2bHoldoutConfirmation(
  outputDir = resolve(C2B_REPOSITORY_ROOT, C2B_ARTIFACT_RELATIVE_DIR),
): Promise<C2bHoldoutResult> {
  const selectedIds = [...C2_BATCH_B_HOLDOUT_IDS]
  assertC2bBatchBHoldoutCaseIds(selectedIds)
  assertC2bBatchCRejected(selectedIds)
  const corpus = readFrozenCorpus()
  const selected = corpus.cases.filter((value) => selectedIds.includes(value.id as (typeof C2_BATCH_B_HOLDOUT_IDS)[number]))
  if (selected.length !== 3 || selected.some((value) => value.batch !== 'B' || value.split !== 'holdout')) {
    throw new Error('C2b frozen corpus holdout selection is incomplete or contaminated')
  }
  await verifyPinnedUpstream()
  const protocolCommit = currentProtocolCommit()
  const config = resolveC2SearchConfig()
  const cases: C2bCaseEvidence[] = []
  for (const artifact of selected) {
    console.log(`C2b real holdout case ${artifact.id}`)
    const prepared = await prepareC2Case(artifact as C2PreparedCaseInput)
    const fidelity = runC2ObserverFidelity(prepared, { config, maxGenerations: C2_MAX_GENERATIONS })
    if (!fidelity.equivalent) throw new Error(`C2b observer fidelity failed for ${artifact.id}`)
    cases.push(computeCaseEvidence(artifact, prepared, fidelity))
  }
  const fidelityPass = cases.every((value) => Object.values(value.observerFidelity).every(Boolean))
  const provenancePass = cases.length === 3 && new Set(cases.map((value) => value.id)).size === 3 &&
    cases.every((value) => value.batch === 'B' && value.split === 'holdout')
  const gate = classifyC2bGate(cases.map((value) => value.divergence), fidelityPass, provenancePass)
  const combined: C2bCombinedInterpretation = gate.classification === 'HUBER_PREFERENCE_GENERALIZES'
    ? 'ROBUST_LOSS_PREFERENCE_GENERALIZED'
    : gate.classification === 'HUBER_PREFERENCE_NOT_CONFIRMED'
      ? 'C2_CLOSED_HOLDOUT_NOT_CONFIRMED'
      : 'INCONCLUSIVE'

  mkdirSync(outputDir, { recursive: true })
  mkdirSync(resolve(outputDir, 'loss-census'), { recursive: true })
  const perCasePaths: string[] = []
  for (const value of cases) {
    const relativePath = `loss-census/${value.id}.json`
    writeJson(resolve(outputDir, relativePath), value)
    perCasePaths.push(relativePath)
  }
  const aggregate: Record<string, unknown> = {
    schemaVersion: C2B_PROTOCOL_SCHEMA_VERSION,
    artifact: 'objective-c2-huber-holdout-confirmation',
    c2a: { commit: C2B_AUDITED_C2A_COMMIT, evidenceSha256: C2B_AUDITED_C2A_EVIDENCE_SHA256, classification: 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED', developmentCoverage: '2/3', frozenCandidate: C2B_CANDIDATE },
    protocolFreezeCommit: protocolCommit,
    frozenBoundary: C2_FROZEN_BOUNDARY,
    c3: { evidenceSha256: C2_C3_EVIDENCE_SHA256, finalInterpretation: 'KNEE_SIGNAL_SUPPORTED', geometricKneeSelectorImplemented: false },
    corpus: { version: C2B_CORPUS_VERSION, commit: C2_CORPUS_COMMIT, classification: C2_CORPUS_CLASSIFICATION, evidenceSha256: C2_CORPUS_EVIDENCE_SHA256, casesSha256: corpus.casesSha256, provenanceSha256: corpus.provenanceSha256, upstream: { repository: 'jaakkopasanen/AutoEq', commit: C2_UPSTREAM_COMMIT, tree: C2_UPSTREAM_TREE } },
    protocol: {
      selectedAlgorithm: 'FROZEN_BASELINE',
      caseIds: selectedIds,
      batchBDevelopmentCaseIds: [...C2_BATCH_B_DEVELOPMENT_IDS],
      batchBHoldoutCaseIds: [...C2_BATCH_B_HOLDOUT_IDS],
      batchCCaseIds: [...C2_BATCH_C_CASE_IDS],
      batchBDevelopmentExecuted: false,
      batchBHoldoutExecuted: true,
      batchCExecuted: false,
      oldStructuralVNextCasesExecuted: false,
      maxGenerations: C2_MAX_GENERATIONS,
      naturalTermination: 'allowed-earlier-than-generation-bound',
      observerMode: 'C3-observer-off-on-fidelity-per-case',
      wallClockTermination: false,
      searchPolicyChanged: false,
      lossesAffectSearch: false,
      statePool: 'all observer-evaluated states; semantic quantized filter-state key deduplication; no extra polish/evaluation',
    },
    normalization: C2_NORMALIZATION,
    resolvedSearchConfig: config,
    losses: { primary: ['MSE', C2B_CANDIDATE, 'CONTROL'], diagnostic: ['MAE'], controlDefinition: 'max(RMSE/0.25,MaxAbs/0.75)', mseDefinition: 'mean(r^2)', huber: { deltaDb: C2_HUBER_DELTA_DB, definition: 'z=r/0.75; rho(z)=0.5*z^2 for |z|<=1; |z|-0.5 otherwise; mean(rho(z))' } },
    thresholds: { exactN: C2B_DIVERGENCE_EXACT_N_THRESHOLD, correlationStrictUpperBound: C2B_DIVERGENCE_CORRELATION_THRESHOLD },
    cases: cases.map((value) => ({ id: value.id, uniqueEvaluatedStateCount: value.uniqueEvaluatedStateCount, globalWinners: Object.fromEntries(C2_LOSS_NAMES.map((loss) => [loss, { filterStateKey: value.globalWinners[loss].filterStateKey, filterCount: value.globalWinners[loss].filterCount, losses: value.globalWinners[loss].losses, diagnostics: value.globalWinners[loss].diagnostics }])), exactN: value.exactN, rankCorrelations: value.rankCorrelations, divergence: value.divergence, holdoutGate: value.holdoutGate, observerFidelity: value.observerFidelity, lossCensusPath: `loss-census/${value.id}.json` })),
    holdoutCoverage: { huberPreferenceDivergence: gate.coverage, total: gate.total },
    fidelityPass,
    provenancePass,
    classification: gate.classification,
    combinedInterpretation: combined,
    batchCExecuted: false,
  }
  writeJson(resolve(outputDir, 'aggregate-evidence.json'), aggregate)
  const evidencePaths = ['aggregate-evidence.json', ...perCasePaths]
  const evidenceSha256 = hashEvidenceFiles(outputDir, evidencePaths)
  writeFileSync(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'final-report.md'), report(cases, gate, protocolCommit, evidenceSha256, combined), 'utf8')
  const manifest: Record<string, unknown> = {
    schemaVersion: C2B_PROTOCOL_SCHEMA_VERSION,
    artifact: 'objective-c2-huber-holdout-confirmation',
    status: gate.classification,
    combinedInterpretation: combined,
    researchQuestion: 'Does the frozen HUBER-075 preference signal generalize to untouched Batch B holdout under the exact frozen baseline state-pool census?',
    c2a: { commit: C2B_AUDITED_C2A_COMMIT, evidenceSha256: C2B_AUDITED_C2A_EVIDENCE_SHA256, classification: 'ROBUST_LOSS_PREFERENCE_SIGNAL_SUPPORTED', developmentCoverage: '2/3', frozenCandidate: C2B_CANDIDATE },
    protocolFreezeCommit: protocolCommit,
    frozenBoundary: C2_FROZEN_BOUNDARY,
    c3EvidenceSha256: C2_C3_EVIDENCE_SHA256,
    corpus: { version: C2B_CORPUS_VERSION, commit: C2_CORPUS_COMMIT, classification: C2_CORPUS_CLASSIFICATION, evidenceSha256: C2_CORPUS_EVIDENCE_SHA256, casesSha256: corpus.casesSha256, provenanceSha256: corpus.provenanceSha256 },
    caseIds: selectedIds,
    caseCount: 3,
    split: { batchBDevelopment: [...C2_BATCH_B_DEVELOPMENT_IDS], batchBHoldout: [...C2_BATCH_B_HOLDOUT_IDS], batchC: [...C2_BATCH_C_CASE_IDS] },
    huber: { candidate: C2B_CANDIDATE, deltaDb: C2_HUBER_DELTA_DB },
    protocol: aggregate.protocol,
    thresholds: aggregate.thresholds,
    holdoutCoverage: aggregate.holdoutCoverage,
    fidelityPass,
    provenancePass,
    classification: gate.classification,
    batchCExecuted: false,
    evidenceSha256,
    evidenceHashScope: evidencePaths,
    files: ['manifest.json', 'aggregate-evidence.json', ...perCasePaths, 'evidence-sha256.txt', 'final-report.md'],
  }
  writeJson(resolve(outputDir, 'manifest.json'), manifest)
  return { manifest, aggregate, cases, evidenceSha256, outputDir }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC2bHoldoutConfirmation().then((result) => {
    console.log(JSON.stringify({ outputDir: result.outputDir, evidenceSha256: result.evidenceSha256, classification: result.manifest.status, combinedInterpretation: result.manifest.combinedInterpretation }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
}
