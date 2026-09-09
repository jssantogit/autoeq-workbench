import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import type { Filter } from '../../src/types/filter.js'

import { loadLayeredResearchCases } from './corpus.js'
import { createSolverLabProblem, type SolverLabEvaluationV1 } from './labProtocol.js'
import { directedReferenceRegret, type ReferenceRegretPoint } from './referenceRegret.js'
import { getReferenceCell, assertOracleReferenceSnapshotV1, type OracleReferenceSnapshotV1 } from './referenceSnapshot.js'
import { selectReferencePoint } from './referenceSelector.js'
import { freezeSeedPool, runEqualizedSeedAllocation, type SeedAllocationSeed } from './seedAllocation.js'
import { runStructuralBeam } from './structuralBeam.js'

export const DEFAULT_SOURCE_REPORT = 'packages/core/.research-artifacts/mp-reallocation-corrective-20260909/storm-rerun1/tournament-report.json'
export const DEFAULT_SNAPSHOT = '/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json'
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
export const EQUALIZED_SEED_ALLOCATION_TARGET = 5
export const EQUALIZED_SEED_ALLOCATION_DISTRIBUTED_SEEDS = 3
export const EQUALIZED_SEED_ALLOCATION_DEADLINE_MS = 60_000
export const EQUALIZED_SEED_ALLOCATION_CONFIG = Object.freeze({
  beamWidth: 2,
  proposalsPerParent: 4,
  localPolishEvaluations: 24,
  maxFilters: 10,
})

export interface StormSeed extends SeedAllocationSeed {
  sourceCandidateId: string
  filters: Filter[]
}

interface ArtifactArm {
  concentratedSeedId?: string
  allocations: Array<{ seedId: string; observedWorkTarget: number }>
  observedStructuralEvaluations: number
  perSeed: Array<Record<string, unknown>>
  selectedBest: Record<string, unknown> | null
  selectedBestChanges: number
  referenceImprovements: number
  paretoNovelDescendants: number
  usefulSeedImprovements: number
}

export interface EqualizedSeedAllocationArtifact {
  schemaVersion: 1
  sourceCommit: string | null
  sourceReportPath: string
  sourceReportSha256: string
  referenceSnapshotPath: string
  referenceSnapshotSha256: string
  problemId: 'titan-to-storm'
  frozenSeedPool: Array<Record<string, unknown>>
  structuralConfig: typeof EQUALIZED_SEED_ALLOCATION_CONFIG
  targetObservedStructuralEvaluations: number
  deadlineMode: 'cooperative'
  deadlineMs: number
  configuredPolishAllowance: number
  observedPolishWork: number | null
  polishWorkObservation: 'not-measured' | 'measured'
  concentrated: ArtifactArm
  distributed: ArtifactArm
  equalization: { status: 'equalized' | 'not-equalized'; causalClaimAllowed: boolean }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function resolveResearchPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) throw new Error('research path is required')
  return isAbsolute(path) ? resolve(path) : resolve(PROJECT_ROOT, path)
}

function semanticKey(filters: readonly Filter[]): string {
  return JSON.stringify(filters.map(({ id: _id, ...filter }) => filter).sort((left, right) =>
    left.type.localeCompare(right.type) || left.frequencyHz - right.frequencyHz ||
    left.gainDb - right.gainDb || left.q - right.q || Number(left.enabled) - Number(right.enabled)))
}

function references(snapshot: OracleReferenceSnapshotV1, problemId: string, inputSha256: string): ReferenceRegretPoint[] {
  const cell = getReferenceCell(snapshot, problemId, inputSha256, 10)
  const candidates = new Map(cell.candidates.map((candidate) => [candidate.candidateId, candidate]))
  return cell.deliverableFrontierCandidateIds.map((candidateId) => {
    const candidate = candidates.get(candidateId)
    if (candidate === undefined) throw new Error(`reference candidate is absent: ${candidateId}`)
    return { candidateId, rmseDb: candidate.canonicalRmseDb, maxAbsDb: candidate.canonicalMaxAbsDb, filterCount: candidate.actualDeliveredFilterCount }
  })
}

export function freezeStormSeeds(source: unknown): StormSeed[] {
  if (source === null || typeof source !== 'object' || !Array.isArray((source as { runs?: unknown }).runs)) {
    throw new Error('source report must contain runs')
  }
  const run = (source as { runs: any[] }).runs.find((entry: any) => entry.variantId === 'matching-pursuit-selection-beam-v2')
  if (run === undefined) throw new Error('source report lacks selection-beam Storm provenance')
  if (!Array.isArray(run.researchTrace) || !Array.isArray(run.progressTrace)) {
    throw new Error('selection-beam source report lacks telemetry and progress traces')
  }
  const progressByCandidateId = new Map<string, any>()
  for (const point of run.progressTrace) {
    if (typeof point?.candidateId === 'string' && !progressByCandidateId.has(point.candidateId)) {
      progressByCandidateId.set(point.candidateId, point)
    }
  }
  const seen = new Set<string>()
  const candidates: StormSeed[] = []
  for (const event of run.researchTrace) {
    if (event?.component !== 'matching-pursuit-v1' || event.phase === 'baseline' ||
      event.selectedChange !== true || event.paretoNovel !== true || typeof event.candidateId !== 'string' ||
      seen.has(event.candidateId)) continue
    seen.add(event.candidateId)
    const point = progressByCandidateId.get(event.candidateId)
    if (point === undefined) throw new Error(`selection-beam seed lacks progress point: ${event.candidateId}`)
    if (!Array.isArray(point.filters) || point.filters.length === 0) continue
    if (typeof event.selectionKey !== 'string' || event.selectionKey.length === 0) {
      throw new Error(`selection-beam seed lacks selection key: ${event.candidateId}`)
    }
    candidates.push({
      seedId: event.candidateId,
      sourceCandidateId: event.candidateId,
      origin: 'matching-pursuit-selection-beam-v2',
      semanticKey: semanticKey(point.filters),
      selectionKey: event.selectionKey,
      canonicalRmseDb: point.canonicalRmseDb,
      canonicalMaxAbsDb: point.canonicalMaxAbsDb,
      filters: point.filters.map((filter: Filter) => ({ ...filter })),
    })
  }
  return freezeSeedPool(candidates)
}

interface DeliveredSummary {
  candidateId: string
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  filterCount: number
  directedReferenceRegretV1: number
  referenceImproved: boolean
}

function deliveredSummary(
  evaluation: SolverLabEvaluationV1,
  refs: readonly ReferenceRegretPoint[],
): DeliveredSummary | null {
  const value = evaluation.deliverable
  if (value === null) return null
  const regret = directedReferenceRegret({
    candidateId: evaluation.candidateId,
    rmseDb: value.rmseDb,
    maxAbsDb: value.maxAbsDb,
    filterCount: value.filters.length,
  }, refs)
  return {
    candidateId: evaluation.candidateId,
    canonicalRmseDb: value.rmseDb,
    canonicalMaxAbsDb: value.maxAbsDb,
    filterCount: value.filters.length,
    directedReferenceRegretV1: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function selectedBest(
  evaluations: readonly SolverLabEvaluationV1[],
  refs: readonly ReferenceRegretPoint[],
  selectedBestChanges: number,
): Record<string, unknown> | null {
  const delivered = evaluations
    .map((evaluation) => deliveredSummary(evaluation, refs))
    .filter((value): value is DeliveredSummary => value !== null)
  if (delivered.length === 0) return null
  const selected = selectReferencePoint(delivered.map((value, index) => ({
    candidateId: String(index), rmseDb: value.canonicalRmseDb, maxAbsDb: value.canonicalMaxAbsDb,
    filterCount: value.filterCount, cancellationScore: 0,
  })))
  const value = delivered[Number(selected.candidateId)]!
  return {
    candidateId: value.candidateId,
    canonicalRmseDb: value.canonicalRmseDb,
    canonicalMaxAbsDb: value.canonicalMaxAbsDb,
    filterCount: value.filterCount,
    directedReferenceRegretV1: value.directedReferenceRegretV1,
    referenceImproved: value.referenceImproved,
    selectedBestChanges,
    evaluationsToBestResult: Number(selected.candidateId) + 1,
  }
}

function equivalentMetrics(left: DeliveredSummary, right: DeliveredSummary): boolean {
  return Math.abs(left.canonicalRmseDb - right.canonicalRmseDb) <= 1e-12 &&
    Math.abs(left.canonicalMaxAbsDb - right.canonicalMaxAbsDb) <= 1e-12
}

function dominatesMetrics(left: DeliveredSummary, right: DeliveredSummary): boolean {
  return left.canonicalRmseDb <= right.canonicalRmseDb + 1e-12 &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + 1e-12 &&
    (left.canonicalRmseDb < right.canonicalRmseDb - 1e-12 ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - 1e-12)
}

function selectorPrefers(candidate: DeliveredSummary, seed: DeliveredSummary): boolean {
  if (equivalentMetrics(candidate, seed) || dominatesMetrics(seed, candidate)) return false
  return selectReferencePoint([
    {
      candidateId: seed.candidateId,
      rmseDb: seed.canonicalRmseDb,
      maxAbsDb: seed.canonicalMaxAbsDb,
      filterCount: seed.filterCount,
      cancellationScore: 0,
    },
    {
      candidateId: candidate.candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.filterCount,
      cancellationScore: 0,
    },
  ]).candidateId === candidate.candidateId
}

function summarizeStructuralRun(
  structural: ReturnType<typeof runStructuralBeam>,
  refs: readonly ReferenceRegretPoint[],
): {
  outcome: {
    observedStructuralEvaluations: number
    usefulSeedImprovements: number
    paretoNovelDescendants: number
    firstUsefulImprovementEvaluation: number | null
    bestResultEvaluation: number | null
  }
  selectedBest: Record<string, unknown> | null
  descendantsProduced: number
  selectedBestChanges: number
  referenceImprovements: number
  seed: DeliveredSummary
  best: DeliveredSummary | null
} {
  const delivered = structural.evaluations
    .map((evaluation) => deliveredSummary(evaluation, refs))
    .filter((value): value is DeliveredSummary => value !== null)
  const seed = delivered[0]
  if (seed === undefined) throw new Error('structural allocation did not evaluate its seed')
  let paretoFrontier: DeliveredSummary[] = [seed]
  let paretoNovelDescendants = 0
  let usefulSeedImprovements = 0
  let firstUsefulImprovementEvaluation: number | null = null
  for (const [index, candidate] of delivered.slice(1).entries()) {
    const equivalent = paretoFrontier.some((previous) => equivalentMetrics(previous, candidate))
    const dominated = paretoFrontier.some((previous) => dominatesMetrics(previous, candidate))
    if (!equivalent && !dominated) {
      paretoNovelDescendants += 1
      paretoFrontier = paretoFrontier.filter((previous) => !dominatesMetrics(candidate, previous))
      paretoFrontier.push(candidate)
    }
    if (selectorPrefers(candidate, seed)) {
      usefulSeedImprovements += 1
      if (firstUsefulImprovementEvaluation === null) firstUsefulImprovementEvaluation = index + 2
    }
  }
  const best = delivered.reduce((current, candidate) => {
    if (current === undefined) return candidate
    const selected = selectReferencePoint([
      {
        candidateId: current.candidateId,
        rmseDb: current.canonicalRmseDb,
        maxAbsDb: current.canonicalMaxAbsDb,
        filterCount: current.filterCount,
        cancellationScore: 0,
      },
      {
        candidateId: candidate.candidateId,
        rmseDb: candidate.canonicalRmseDb,
        maxAbsDb: candidate.canonicalMaxAbsDb,
        filterCount: candidate.filterCount,
        cancellationScore: 0,
      },
    ])
    return selected.candidateId === candidate.candidateId ? candidate : current
  }, undefined as DeliveredSummary | undefined)
  const bestResultEvaluation = best === undefined ? null : delivered.findIndex((candidate) => candidate.candidateId === best.candidateId) + 1
  return {
    outcome: {
      observedStructuralEvaluations: structural.candidates.length,
      usefulSeedImprovements,
      paretoNovelDescendants,
      firstUsefulImprovementEvaluation,
      bestResultEvaluation,
    },
    selectedBest: selectedBest(structural.evaluations, refs, Math.max(0, structural.trajectory.length - 1)),
    descendantsProduced: Math.max(0, delivered.length - 1),
    selectedBestChanges: Math.max(0, structural.trajectory.length - 1),
    referenceImprovements: delivered.filter((candidate) => candidate.referenceImproved).length,
    seed,
    best: best ?? null,
  }
}

export function selectBestArtifactEntry(
  entries: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  const candidates = entries
    .map((entry, index) => {
      const selectedBest = entry.selectedBest
      if (selectedBest === null || typeof selectedBest !== 'object' || Array.isArray(selectedBest)) return null
      return {
        entry,
        point: {
          candidateId: String((selectedBest as Record<string, unknown>).candidateId ?? `entry-${index}`),
          rmseDb: Number((selectedBest as Record<string, unknown>).canonicalRmseDb),
          maxAbsDb: Number((selectedBest as Record<string, unknown>).canonicalMaxAbsDb),
          filterCount: Number((selectedBest as Record<string, unknown>).filterCount ?? 0),
          cancellationScore: 0,
        },
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
  if (candidates.length === 0) return null
  const selected = selectReferencePoint(candidates.map((candidate) => candidate.point))
  const selectedEntry = candidates.find((candidate) => candidate.point.candidateId === selected.candidateId)?.entry.selectedBest
  return selectedEntry !== null && typeof selectedEntry === 'object' && !Array.isArray(selectedEntry)
    ? selectedEntry as Record<string, unknown>
    : null
}

export function assertEqualizedSeedAllocationArtifact(value: any): asserts value is EqualizedSeedAllocationArtifact {
  if (value?.schemaVersion !== 1) throw new Error('equalized seed-allocation artifact version must be 1')
  if (value.equalization?.status === 'not-equalized' && value.equalization.causalClaimAllowed) {
    throw new Error('not-equalized artifact must forbid a causal claim')
  }
  if (value.equalization?.status !== 'equalized' && value.equalization?.status !== 'not-equalized') {
    throw new Error('equalized seed-allocation artifact must classify equalization')
  }
  if (value.equalization?.status === 'equalized' && value.equalization.causalClaimAllowed !== true) {
    throw new Error('equalized artifact must permit a causal claim')
  }
  if (!Number.isSafeInteger(value.targetObservedStructuralEvaluations) || value.targetObservedStructuralEvaluations <= 0) {
    throw new Error('equalized seed-allocation artifact target must be a positive integer')
  }
  if (!Array.isArray(value.frozenSeedPool) || value.frozenSeedPool.length === 0) {
    throw new Error('equalized seed-allocation artifact must include the frozen seed pool')
  }
  if (value.deadlineMode !== 'cooperative' || value.deadlineMs !== EQUALIZED_SEED_ALLOCATION_DEADLINE_MS) {
    throw new Error('equalized seed-allocation artifact deadline contract is invalid')
  }
  if (!Number.isSafeInteger(value.configuredPolishAllowance) || value.configuredPolishAllowance < 0) {
    throw new Error('equalized seed-allocation artifact polish allowance is invalid')
  }
  if (value.polishWorkObservation !== 'not-measured' && value.polishWorkObservation !== 'measured') {
    throw new Error('equalized seed-allocation artifact polish observation is invalid')
  }
  if (value.polishWorkObservation === 'not-measured' && value.observedPolishWork !== null) {
    throw new Error('unmeasured polish work must be null')
  }
  for (const [label, arm] of [['concentrated', value.concentrated], ['distributed', value.distributed] as const]) {
    if (!arm || !Array.isArray(arm.allocations) || !Array.isArray(arm.perSeed)) {
      throw new Error(`${label} arm must include allocations and per-seed results`)
    }
    if (!Number.isSafeInteger(arm.observedStructuralEvaluations) || arm.observedStructuralEvaluations < 0) {
      throw new Error(`${label} arm observed work must be a non-negative integer`)
    }
  }
  if (value.equalization?.status === 'equalized' &&
    (value.concentrated?.observedStructuralEvaluations !== value.targetObservedStructuralEvaluations ||
      value.distributed?.observedStructuralEvaluations !== value.targetObservedStructuralEvaluations)) {
    throw new Error('equalized artifact must match the declared observed-work target')
  }
}

export function runStormEqualizedSeedAllocation(sourceReportPath = DEFAULT_SOURCE_REPORT, snapshotPath = DEFAULT_SNAPSHOT): EqualizedSeedAllocationArtifact {
  const resolvedSourceReportPath = resolveResearchPath(sourceReportPath)
  const resolvedSnapshotPath = resolveResearchPath(snapshotPath)
  const source = JSON.parse(readFileSync(resolvedSourceReportPath, 'utf8'))
  const snapshot = JSON.parse(readFileSync(resolvedSnapshotPath, 'utf8')) as unknown
  assertOracleReferenceSnapshotV1(snapshot)
  const researchCase = loadLayeredResearchCases('adversarial').find((entry) => entry.id === 'titan-to-storm')
  if (researchCase === undefined) throw new Error('Storm research case is unavailable')
  const problem = createSolverLabProblem(researchCase, 10)
  const refs = references(snapshot, problem.problemId, problem.inputSha256)
  const pool = freezeStormSeeds(source)
  if (pool.length < EQUALIZED_SEED_ALLOCATION_DISTRIBUTED_SEEDS) throw new Error('frozen Storm pool is too small')
  const perSeedDetails = new Map<string, Array<Record<string, unknown>>>()
  const nowMs = () => performance.now()
  const allocation = runEqualizedSeedAllocation({
    pool,
    targetObservedStructuralEvaluations: EQUALIZED_SEED_ALLOCATION_TARGET,
    distributedSeedCount: EQUALIZED_SEED_ALLOCATION_DISTRIBUTED_SEEDS,
    runSeed: ({ seed, observedWorkTarget }) => {
      const startedAt = nowMs()
      const structural = runStructuralBeam({
        problem,
        seed: 0,
        evaluationBudget: observedWorkTarget,
        referenceSnapshotSha256: snapshot.contentSha256,
        referenceFrontier: refs,
        config: EQUALIZED_SEED_ALLOCATION_CONFIG,
        includeZeroSeed: false,
        seeds: [{ seedId: seed.seedId, origin: 'matching-pursuit', filters: seed.filters }],
        nowMs,
        elapsedMs: () => nowMs() - startedAt,
        isExpired: () => nowMs() - startedAt >= EQUALIZED_SEED_ALLOCATION_DEADLINE_MS,
      })
      const summary = summarizeStructuralRun(structural, refs)
      const detail = {
        seedId: seed.seedId, sourceCandidateId: seed.sourceCandidateId, origin: seed.origin,
        observedWorkTarget, observedStructuralEvaluations: structural.candidates.length,
        semanticKey: seed.semanticKey, selectionKey: seed.selectionKey,
        canonicalEntryRmseDb: seed.canonicalRmseDb, canonicalEntryMaxAbsDb: seed.canonicalMaxAbsDb,
        descendantsProduced: summary.descendantsProduced,
        paretoNovelDescendants: summary.outcome.paretoNovelDescendants,
        usefulSeedImprovements: summary.outcome.usefulSeedImprovements,
        firstUsefulImprovementEvaluation: summary.outcome.firstUsefulImprovementEvaluation,
        bestResultEvaluation: summary.outcome.bestResultEvaluation,
        selectedBest: summary.selectedBest,
        selectedBestChanges: summary.selectedBestChanges,
        referenceImprovements: summary.referenceImprovements,
        improvementPerStructuralEvaluation: summary.best === null ? null : {
          rmseDb: (summary.seed.canonicalRmseDb - summary.best.canonicalRmseDb) / structural.candidates.length,
          maxAbsDb: (summary.seed.canonicalMaxAbsDb - summary.best.canonicalMaxAbsDb) / structural.candidates.length,
        },
      }
      const key = `${seed.seedId}:${observedWorkTarget}`
      const details = perSeedDetails.get(key) ?? []
      details.push(detail)
      perSeedDetails.set(key, details)
      return {
        seedId: seed.seedId, observedStructuralEvaluations: structural.candidates.length,
        usefulSeedImprovements: summary.outcome.usefulSeedImprovements,
        paretoNovelDescendants: summary.outcome.paretoNovelDescendants,
        firstUsefulImprovementEvaluation: summary.outcome.firstUsefulImprovementEvaluation,
        bestResultEvaluation: summary.outcome.bestResultEvaluation,
      }
    },
  })
  const arm = (result: typeof allocation.concentrated | typeof allocation.distributed): ArtifactArm => {
    const entries = result.perSeed.map((entry) => {
      const key = `${entry.seedId}:${entry.observedWorkTarget}`
      const details = perSeedDetails.get(key)
      if (details === undefined || details.length === 0) throw new Error(`missing seed allocation details: ${key}`)
      return details.shift()!
    })
    return {
      ...(!('concentratedSeedId' in result) ? {} : { concentratedSeedId: result.concentratedSeedId }),
      allocations: result.allocations,
      observedStructuralEvaluations: result.observedStructuralEvaluations,
      perSeed: entries,
      selectedBest: selectBestArtifactEntry(entries),
      selectedBestChanges: entries.reduce((sum, entry) => sum + Number(entry.selectedBestChanges), 0),
      referenceImprovements: entries.reduce((sum, entry) => sum + Number(entry.referenceImprovements), 0),
      paretoNovelDescendants: entries.reduce((sum, entry) => sum + Number(entry.paretoNovelDescendants), 0),
      usefulSeedImprovements: entries.reduce((sum, entry) => sum + Number(entry.usefulSeedImprovements), 0),
    }
  }
  const artifact: EqualizedSeedAllocationArtifact = {
    schemaVersion: 1,
    sourceCommit: typeof source.sourceCommit === 'string'
      ? source.sourceCommit
      : typeof source.snapshot?.createdFromRepositorySha === 'string'
        ? source.snapshot.createdFromRepositorySha
        : null,
    sourceReportPath: resolvedSourceReportPath, sourceReportSha256: sha256(resolvedSourceReportPath),
    referenceSnapshotPath: resolvedSnapshotPath, referenceSnapshotSha256: snapshot.contentSha256,
    problemId: 'titan-to-storm', frozenSeedPool: pool.map((seed) => ({ ...seed, filters: seed.filters })),
    structuralConfig: EQUALIZED_SEED_ALLOCATION_CONFIG,
    targetObservedStructuralEvaluations: EQUALIZED_SEED_ALLOCATION_TARGET,
    deadlineMode: 'cooperative', deadlineMs: EQUALIZED_SEED_ALLOCATION_DEADLINE_MS,
    configuredPolishAllowance: EQUALIZED_SEED_ALLOCATION_CONFIG.localPolishEvaluations,
    observedPolishWork: null, polishWorkObservation: 'not-measured',
    concentrated: arm(allocation.concentrated), distributed: arm(allocation.distributed), equalization: allocation.equalization,
  }
  assertEqualizedSeedAllocationArtifact(artifact)
  return artifact
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const [out = 'packages/core/.research-artifacts/seed-allocation-equalized-20260909/storm-fixed-work-target5', source = DEFAULT_SOURCE_REPORT, snapshot = DEFAULT_SNAPSHOT] = args
  const artifact = runStormEqualizedSeedAllocation(source, snapshot)
  const output = resolveResearchPath(out)
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'tournament-report.json'), JSON.stringify(artifact, null, 2) + '\n')
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]!)) main()
