import type { Filter } from '../../types/filter.js'
import { cascadeMagnitudeDb } from '../../index.js'
import { DEFAULT_AUTOEQ_SETTINGS } from '../../config/autoeqSettings.js'
import { resolveStandardAutoEqV2Config } from './config.js'
import {
  addSearchWorkDelta,
  createSearchWorkDelta,
  measureResidualExpansionOpportunity,
  runStructuralSearch,
  searchWorkDeltaFromTrace,
  type ResolvedStructuralSearchConfig,
  type ResidualExpansionOpportunity,
  type SearchWorkDelta,
  type SearchWorkTotals,
  type StructuralSearchInput,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from './structuralSearch.js'
import {
  nextScalableCapacity,
  resolveScalableEffortConfig,
  SCALABLE_MAX_EFFORT_LEVEL,
  SCALABLE_STAGE_QUANTUM_MS,
  structuralViolation,
  type ScalableSearchQualityKey,
} from './scalableStructuralSearch.js'

/**
 * Research-only actions.  These labels describe continuations evaluated by
 * the oracle; they are not production scheduler policy.
 */
export type SchedulerDecisionAction =
  | 'deepen-current-regime'
  | 'expand-capacity'

/**
 * A controlled oracle quantum.  Structural-search invocations are the
 * equality boundary between arms.  The stage quantum is a per-invocation
 * deadline guard and is deliberately not converted to a weighted score.
 */
export interface SchedulerDecisionWorkBudget {
  structuralSearchInvocations: number
  stageQuantumMs?: number
}

/**
 * Search state that can affect a continuation.  The telemetry fields are
 * carried for analysis but are not consulted to choose an action.
 */
export interface SchedulerDecisionSnapshot {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  sampleRateHz: number
  baseConfig: ResolvedStructuralSearchConfig
  incumbent: StructuralSearchResult
  currentCapacity: number
  maximumCapacity: number
  effortLevel: number
  consecutiveNoImprovement?: number
  recentGains?: readonly number[]
  /** Raw most-recent incumbent gain for this regime. */
  recentGain?: number
  /** Raw work accumulated since the last positive incumbent improvement. */
  workSinceMeaningfulImprovement?: SearchWorkTotals
  expansionOpportunity?: ResidualExpansionOpportunity
  cumulativeWork?: SearchWorkTotals
  remainingWallClockMs?: number
  stageIndex?: number
}

export type SchedulerDecisionSearchRunner = (
  input: StructuralSearchInput,
) => StructuralSearchResult

export interface SchedulerDecisionOptions {
  nowMs?: () => number
  run?: SchedulerDecisionSearchRunner
}

export type SchedulerDecisionWorkDimension = keyof SearchWorkDelta

export interface SchedulerDecisionArmResult {
  action: SchedulerDecisionAction
  capacityBefore: number
  capacityAfter: number
  capacityExpanded: boolean
  effortLevelBefore: number
  effortLevelUsed: number
  startingIncumbent: StructuralSearchResult
  candidate: StructuralSearchResult
  finalIncumbent: StructuralSearchResult
  startingQuality: ScalableSearchQualityKey
  candidateQuality: ScalableSearchQualityKey
  finalQuality: ScalableSearchQualityKey
  absoluteGain: number
  relativeGain?: number
  workDelta: SearchWorkDelta
  cumulativeWork: SearchWorkTotals
  elapsedMs: number
}

export interface SchedulerDecisionWorkComparison {
  requestedStructuralSearchInvocations: number
  actualByAction: Record<SchedulerDecisionAction, SearchWorkTotals>
  equalDimensions: SchedulerDecisionWorkDimension[]
  mismatchedDimensions: SchedulerDecisionWorkDimension[]
  notes: string[]
}

export interface SchedulerDecisionPairResult {
  snapshot: SchedulerDecisionSnapshot
  arms: [SchedulerDecisionArmResult, SchedulerDecisionArmResult]
  byAction: Record<SchedulerDecisionAction, SchedulerDecisionArmResult>
  workComparison: SchedulerDecisionWorkComparison
}

const WORK_DIMENSIONS: readonly SchedulerDecisionWorkDimension[] = [
  'structuralSearchInvocations',
  'beamGenerations',
  'proposalsGenerated',
  'proposalsAdmitted',
  'proposalsPolished',
  'duplicateStates',
  'rescueAttempts',
  'pairAddAttempts',
  'capSwapAttempts',
  'reseedAttempts',
]

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneResult(result: StructuralSearchResult): StructuralSearchResult {
  return {
    filters: cloneFilters(result.filters),
    rmseDb: result.rmseDb,
    maxAbsDb: result.maxAbsDb,
  }
}

function cloneWork(work: SearchWorkTotals): SearchWorkTotals {
  return { ...work }
}

function cloneSnapshot(snapshot: SchedulerDecisionSnapshot): SchedulerDecisionSnapshot {
  return {
    ...snapshot,
    desiredDb: [...snapshot.desiredDb],
    frequencies: [...snapshot.frequencies],
    baseConfig: { ...snapshot.baseConfig },
    incumbent: cloneResult(snapshot.incumbent),
    recentGains: snapshot.recentGains === undefined
      ? undefined
      : [...snapshot.recentGains],
    workSinceMeaningfulImprovement: snapshot.workSinceMeaningfulImprovement === undefined
      ? undefined
      : cloneWork(snapshot.workSinceMeaningfulImprovement),
    expansionOpportunity: snapshot.expansionOpportunity === undefined
      ? undefined
      : { ...snapshot.expansionOpportunity },
    cumulativeWork: snapshot.cumulativeWork === undefined
      ? undefined
      : cloneWork(snapshot.cumulativeWork),
  }
}

function computeExpansionOpportunity(
  snapshot: SchedulerDecisionSnapshot,
): ResidualExpansionOpportunity {
  const responseDb = cascadeMagnitudeDb(
    snapshot.incumbent.filters,
    snapshot.frequencies,
    snapshot.sampleRateHz,
  )
  const residualDb = snapshot.desiredDb.map(
    (desired, index) => desired - responseDb[index]!,
  )
  return measureResidualExpansionOpportunity(
    snapshot.frequencies,
    residualDb,
    resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS),
  )
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * This is the existing scalable controller's primary quality ordering, kept
 * local so the oracle cannot alter or install production comparator policy.
 */
function compareQuality(
  left: StructuralSearchResult,
  right: StructuralSearchResult,
): number {
  return compareNumber(structuralViolation(left), structuralViolation(right)) ||
    compareNumber(left.rmseDb, right.rmseDb) ||
    compareNumber(left.maxAbsDb, right.maxAbsDb)
}

function qualityKey(result: StructuralSearchResult): ScalableSearchQualityKey {
  return [structuralViolation(result), result.rmseDb, result.maxAbsDb]
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function validateSnapshot(snapshot: SchedulerDecisionSnapshot): void {
  assertPositiveSafeInteger(snapshot.currentCapacity, 'currentCapacity')
  assertPositiveSafeInteger(snapshot.maximumCapacity, 'maximumCapacity')
  if (snapshot.currentCapacity > snapshot.maximumCapacity) {
    throw new Error('currentCapacity must not exceed maximumCapacity')
  }
  if (!Number.isFinite(snapshot.effortLevel) || snapshot.effortLevel < 0) {
    throw new Error('effortLevel must be a non-negative number')
  }
  if (
    snapshot.remainingWallClockMs !== undefined &&
    (!Number.isFinite(snapshot.remainingWallClockMs) || snapshot.remainingWallClockMs < 0)
  ) {
    throw new Error('remainingWallClockMs must be a non-negative number')
  }
}

function validateWorkBudget(workBudget: SchedulerDecisionWorkBudget): void {
  assertPositiveSafeInteger(
    workBudget.structuralSearchInvocations,
    'structuralSearchInvocations',
  )
  if (
    workBudget.stageQuantumMs !== undefined &&
    (!Number.isFinite(workBudget.stageQuantumMs) || workBudget.stageQuantumMs <= 0)
  ) {
    throw new Error('stageQuantumMs must be a positive number')
  }
}

function actionCapacity(
  snapshot: SchedulerDecisionSnapshot,
  action: SchedulerDecisionAction,
): number {
  return action === 'expand-capacity'
    ? nextScalableCapacity(snapshot.currentCapacity, snapshot.maximumCapacity)
    : snapshot.currentCapacity
}

function actionEffort(
  snapshot: SchedulerDecisionSnapshot,
  action: SchedulerDecisionAction,
): number {
  return action === 'deepen-current-regime'
    ? Math.min(SCALABLE_MAX_EFFORT_LEVEL, snapshot.effortLevel + 1)
    : 0
}

function workComparison(
  workBudget: SchedulerDecisionWorkBudget,
  deepen: SchedulerDecisionArmResult,
  expand: SchedulerDecisionArmResult,
): SchedulerDecisionWorkComparison {
  const equalDimensions: SchedulerDecisionWorkDimension[] = []
  const mismatchedDimensions: SchedulerDecisionWorkDimension[] = []
  for (const dimension of WORK_DIMENSIONS) {
    if (deepen.workDelta[dimension] === expand.workDelta[dimension]) {
      equalDimensions.push(dimension)
    } else {
      mismatchedDimensions.push(dimension)
    }
  }
  const notes = [
    'Both arms use the same requested structural-search invocation count and per-invocation deadline quantum.',
    'Capacity and effort configuration differ by action; all other work dimensions are observed as raw counters.',
  ]
  if (mismatchedDimensions.length > 0) {
    notes.push(
      `Raw work differs for: ${mismatchedDimensions.join(', ')}. No weighted compute score is inferred.`,
    )
  }
  return {
    requestedStructuralSearchInvocations: workBudget.structuralSearchInvocations,
    actualByAction: {
      'deepen-current-regime': cloneWork(deepen.workDelta),
      'expand-capacity': cloneWork(expand.workDelta),
    },
    equalDimensions,
    mismatchedDimensions,
    notes,
  }
}

/**
 * Evaluate one research continuation from a cloned scheduler snapshot.
 * Production scheduling never calls this function.
 */
export function evaluateSchedulerDecision(
  snapshot: SchedulerDecisionSnapshot,
  action: SchedulerDecisionAction,
  workBudget: SchedulerDecisionWorkBudget,
  options: SchedulerDecisionOptions = {},
): SchedulerDecisionArmResult {
  validateSnapshot(snapshot)
  validateWorkBudget(workBudget)

  const nowMs = options.nowMs ?? (() => performance.now())
  const run = options.run ?? runStructuralSearch
  const capacityBefore = snapshot.currentCapacity
  const capacityAfter = actionCapacity(snapshot, action)
  const effortLevelUsed = actionEffort(snapshot, action)
  const startingIncumbent = cloneResult(snapshot.incumbent)
  let incumbent = cloneResult(startingIncumbent)
  let candidate = cloneResult(startingIncumbent)
  let workDelta = createSearchWorkDelta()
  const startedAt = nowMs()
  const requestedQuantumMs = workBudget.stageQuantumMs ?? SCALABLE_STAGE_QUANTUM_MS
  const quantumMs = snapshot.remainingWallClockMs === undefined
    ? requestedQuantumMs
    : Math.min(requestedQuantumMs, snapshot.remainingWallClockMs)

  for (let invocation = 0; invocation < workBudget.structuralSearchInvocations; invocation += 1) {
    const invocationStartedAt = nowMs()
    const deadlineAt = invocationStartedAt + quantumMs
    let invocationWork = {
      ...createSearchWorkDelta(),
      structuralSearchInvocations: 1,
    }
    const structuralInput: StructuralSearchInput = {
      desiredDb: [...snapshot.desiredDb],
      frequencies: [...snapshot.frequencies],
      sampleRateHz: snapshot.sampleRateHz,
      config: resolveScalableEffortConfig(
        snapshot.baseConfig,
        capacityAfter,
        effortLevelUsed,
      ),
      deadline: {
        isExpired: () => nowMs() >= deadlineAt,
      },
      seedFilters: cloneFilters(incumbent.filters),
      onTrace: (trace: StructuralSearchTraceEvent) => {
        invocationWork = addSearchWorkDelta(
          invocationWork,
          searchWorkDeltaFromTrace(trace),
        )
      },
    }
    candidate = cloneResult(run(structuralInput))
    workDelta = addSearchWorkDelta(workDelta, invocationWork)
    if (compareQuality(candidate, incumbent) < 0) {
      incumbent = cloneResult(candidate)
    }
  }

  const startingQuality = qualityKey(startingIncumbent)
  const candidateQuality = qualityKey(candidate)
  const finalQuality = qualityKey(incumbent)
  const absoluteGain = Math.max(0, startingQuality[0] - finalQuality[0])
  const relativeGain = startingQuality[0] > 0
    ? absoluteGain / Math.abs(startingQuality[0])
    : undefined
  const cumulativeWork = addSearchWorkDelta(
    snapshot.cumulativeWork ?? createSearchWorkDelta(),
    workDelta,
  )

  return {
    action,
    capacityBefore,
    capacityAfter,
    capacityExpanded: capacityAfter > capacityBefore,
    effortLevelBefore: snapshot.effortLevel,
    effortLevelUsed,
    startingIncumbent,
    candidate,
    finalIncumbent: cloneResult(incumbent),
    startingQuality,
    candidateQuality,
    finalQuality,
    absoluteGain,
    relativeGain,
    workDelta,
    cumulativeWork,
    elapsedMs: Math.max(0, nowMs() - startedAt),
  }
}

/**
 * Run both counterfactual continuations from the same immutable snapshot.
 * The arms are ordered deepen, expand and each receives the same work budget.
 */
export function evaluateSchedulerDecisionPair(
  snapshot: SchedulerDecisionSnapshot,
  workBudget: SchedulerDecisionWorkBudget,
  options: SchedulerDecisionOptions = {},
): SchedulerDecisionPairResult {
  const captured = cloneSnapshot(snapshot)
  // Recompute from the exact cloned incumbent before either continuation;
  // callers cannot accidentally report stale or fabricated opportunity data.
  captured.expansionOpportunity = computeExpansionOpportunity(captured)
  const deepen = evaluateSchedulerDecision(
    captured,
    'deepen-current-regime',
    workBudget,
    options,
  )
  const expand = evaluateSchedulerDecision(
    captured,
    'expand-capacity',
    workBudget,
    options,
  )
  return {
    snapshot: captured,
    arms: [deepen, expand],
    byAction: {
      'deepen-current-regime': deepen,
      'expand-capacity': expand,
    },
    workComparison: workComparison(workBudget, deepen, expand),
  }
}
