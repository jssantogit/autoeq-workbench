import type { Filter } from '../../types/filter.js'
import { cascadeMagnitudeDb } from '../../index.js'
import { DEFAULT_AUTOEQ_SETTINGS } from '../../config/autoeqSettings.js'
import { resolveStandardAutoEqV2Config } from './config.js'
import {
  addCapacityPressureDelta,
  addFrontierUtilizationDelta,
  createFrontierUtilizationDelta,
  addSearchWorkDelta,
  createCapacityPressureDelta,
  createSearchWorkDelta,
  measureResidualExpansionOpportunity,
  capacityPressureDeltaFromTrace,
  runStructuralSearch,
  searchWorkDeltaFromTrace,
  type CapacityPressureDelta,
  type FrontierUtilizationDelta,
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
  | FactorizedSchedulerDecisionAction

export type LegacySchedulerDecisionAction =
  | 'deepen-current-regime'
  | 'expand-capacity'

export type FactorizedSchedulerDecisionAction =
  | 'control'
  | 'effort-only'
  | 'capacity-only'

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
  /** Resolved configuration at the captured state, when live telemetry supplies it. */
  resolvedConfig?: ResolvedStructuralSearchConfig
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
  /** Alias for callers that classify expansionOpportunity as residual telemetry. */
  residualTelemetry?: ResidualExpansionOpportunity
  capacityPressure?: CapacityPressureDelta
  frontierUtilization?: FrontierUtilizationDelta
  incumbentUtilization?: number
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
  configuration: SchedulerConfiguredContinuation
  resolvedConfig: ResolvedStructuralSearchConfig
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
  frontierUtilization: FrontierUtilizationDelta
  capacityPressure: CapacityPressureDelta
  maximumFilterCountObserved: number
  additionalStructuralSlotsUsed: boolean
}

export interface SchedulerDecisionWorkComparison {
  requestedStructuralSearchInvocations: number
  actualByAction: Record<LegacySchedulerDecisionAction, SearchWorkTotals>
  equalDimensions: SchedulerDecisionWorkDimension[]
  mismatchedDimensions: SchedulerDecisionWorkDimension[]
  notes: string[]
}

export interface SchedulerDecisionPairResult {
  snapshot: SchedulerDecisionSnapshot
  arms: [SchedulerDecisionArmResult, SchedulerDecisionArmResult]
  byAction: Record<LegacySchedulerDecisionAction, SchedulerDecisionArmResult>
  workComparison: SchedulerDecisionWorkComparison
}

export interface SchedulerDecisionFactorizedWorkComparison {
  requestedStructuralSearchInvocations: number
  actualByAction: Record<FactorizedSchedulerDecisionAction, SearchWorkTotals>
  equalDimensions: SchedulerDecisionWorkDimension[]
  mismatchedDimensions: SchedulerDecisionWorkDimension[]
  notes: string[]
}

export interface SchedulerDecisionFactorizedResult {
  snapshot: SchedulerDecisionSnapshot
  arms: [
    SchedulerDecisionArmResult,
    SchedulerDecisionArmResult,
    SchedulerDecisionArmResult,
  ]
  byAction: Record<FactorizedSchedulerDecisionAction, SchedulerDecisionArmResult>
  workComparison: SchedulerDecisionFactorizedWorkComparison
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
    resolvedConfig: snapshot.resolvedConfig === undefined
      ? undefined
      : { ...snapshot.resolvedConfig },
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
    residualTelemetry: snapshot.residualTelemetry === undefined
      ? undefined
      : { ...snapshot.residualTelemetry },
    capacityPressure: snapshot.capacityPressure === undefined
      ? undefined
      : { ...snapshot.capacityPressure },
    frontierUtilization: snapshot.frontierUtilization === undefined
      ? undefined
      : { ...snapshot.frontierUtilization },
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
  action: LegacySchedulerDecisionAction,
): number {
  return action === 'expand-capacity'
    ? nextScalableCapacity(snapshot.currentCapacity, snapshot.maximumCapacity)
    : snapshot.currentCapacity
}

function actionEffort(
  snapshot: SchedulerDecisionSnapshot,
  action: LegacySchedulerDecisionAction,
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

function factorizedWorkComparison(
  workBudget: SchedulerDecisionWorkBudget,
  arms: readonly SchedulerDecisionArmResult[],
): SchedulerDecisionFactorizedWorkComparison {
  const equalDimensions: SchedulerDecisionWorkDimension[] = []
  const mismatchedDimensions: SchedulerDecisionWorkDimension[] = []
  for (const dimension of WORK_DIMENSIONS) {
    const first = arms[0]?.workDelta[dimension]
    if (arms.every((arm) => arm.workDelta[dimension] === first)) {
      equalDimensions.push(dimension)
    } else {
      mismatchedDimensions.push(dimension)
    }
  }
  const notes = [
    'All arms use the same requested structural-search invocation count and per-invocation deadline quantum.',
    'Control holds capacity and effort; effort-only changes effort; capacity-only changes structural capacity.',
  ]
  if (mismatchedDimensions.length > 0) {
    notes.push(
      `Raw work differs for: ${mismatchedDimensions.join(', ')}. No weighted compute score is inferred.`,
    )
  }
  return {
    requestedStructuralSearchInvocations: workBudget.structuralSearchInvocations,
    actualByAction: {
      control: cloneWork(arms[0]!.workDelta),
      'effort-only': cloneWork(arms[1]!.workDelta),
      'capacity-only': cloneWork(arms[2]!.workDelta),
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
export interface SchedulerConfiguredContinuation {
  capacity: number
  effortLevel: number
  action?: SchedulerDecisionAction
}

export function evaluateConfiguredContinuation(
  snapshot: SchedulerDecisionSnapshot,
  configuration: SchedulerConfiguredContinuation,
  workBudget: SchedulerDecisionWorkBudget,
  options: SchedulerDecisionOptions = {},
): SchedulerDecisionArmResult {
  validateSnapshot(snapshot)
  validateWorkBudget(workBudget)

  const nowMs = options.nowMs ?? (() => performance.now())
  const run = options.run ?? runStructuralSearch
  const capacityBefore = snapshot.currentCapacity
  const capacityAfter = configuration.capacity
  const effortLevelUsed = configuration.effortLevel
  const action = configuration.action ?? 'deepen-current-regime'
  assertPositiveSafeInteger(capacityAfter, 'configuration.capacity')
  if (!Number.isSafeInteger(effortLevelUsed) || effortLevelUsed < 0 || effortLevelUsed > SCALABLE_MAX_EFFORT_LEVEL) throw new Error('configuration.effortLevel is out of range')
  const startingIncumbent = cloneResult(snapshot.incumbent)
  let incumbent = cloneResult(startingIncumbent)
  let candidate = cloneResult(startingIncumbent)
  let workDelta = createSearchWorkDelta()
  let frontierUtilization = createFrontierUtilizationDelta()
  let capacityPressure = createCapacityPressureDelta()
  const startedAt = nowMs()
  const requestedQuantumMs = workBudget.stageQuantumMs ?? SCALABLE_STAGE_QUANTUM_MS
  const quantumMs = snapshot.remainingWallClockMs === undefined
    ? requestedQuantumMs
    : Math.min(requestedQuantumMs, snapshot.remainingWallClockMs)
  const resolvedConfig = resolveScalableEffortConfig(
    snapshot.baseConfig,
    capacityAfter,
    effortLevelUsed,
  )

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
      config: { ...resolvedConfig },
      deadline: {
        isExpired: () => nowMs() >= deadlineAt,
      },
      seedFilters: cloneFilters(incumbent.filters),
      onTrace: (trace: StructuralSearchTraceEvent) => {
        invocationWork = addSearchWorkDelta(
          invocationWork,
          searchWorkDeltaFromTrace(trace),
        )
        capacityPressure = addCapacityPressureDelta(
          capacityPressure,
          capacityPressureDeltaFromTrace(trace),
        )
        frontierUtilization = addFrontierUtilizationDelta(frontierUtilization, trace.frontierUtilization ?? createFrontierUtilizationDelta())
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
  const maximumFilterCountObserved = Math.max(
    startingIncumbent.filters.length,
    candidate.filters.length,
    incumbent.filters.length,
    frontierUtilization.parentFilterCountMax,
    frontierUtilization.generatedCandidateFilterCountMax,
    frontierUtilization.admittedCandidateFilterCountMax,
    frontierUtilization.polishedCandidateFilterCountMax,
  )

  return {
    action,
    capacityBefore,
    capacityAfter,
    capacityExpanded: capacityAfter > capacityBefore,
    effortLevelBefore: snapshot.effortLevel,
    effortLevelUsed,
    configuration: { ...configuration, action },
    resolvedConfig: { ...resolvedConfig },
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
    frontierUtilization,
    capacityPressure,
    maximumFilterCountObserved,
    additionalStructuralSlotsUsed: maximumFilterCountObserved > capacityBefore,
  }
}

export function evaluateSchedulerDecision(
  snapshot: SchedulerDecisionSnapshot,
  action: LegacySchedulerDecisionAction,
  workBudget: SchedulerDecisionWorkBudget,
  options: SchedulerDecisionOptions = {},
): SchedulerDecisionArmResult {
  return evaluateConfiguredContinuation(snapshot, {
    capacity: actionCapacity(snapshot, action),
    effortLevel: actionEffort(snapshot, action),
    action,
  }, workBudget, options)
}

/**
 * Run the factorized three-arm research protocol from one cloned snapshot.
 * This is deliberately research-only; it does not select a production action.
 */
export function evaluateFactorizedSchedulerDecision(
  snapshot: SchedulerDecisionSnapshot,
  workBudget: SchedulerDecisionWorkBudget,
  options: SchedulerDecisionOptions = {},
): SchedulerDecisionFactorizedResult {
  const captured = cloneSnapshot(snapshot)
  // Recompute residual telemetry from the exact cloned incumbent before any
  // continuation.  This keeps all three arms on one causal state.
  captured.expansionOpportunity = computeExpansionOpportunity(captured)
  captured.residualTelemetry = captured.expansionOpportunity
  captured.capacityPressure = captured.capacityPressure ?? createCapacityPressureDelta()
  const nextCapacity = nextScalableCapacity(
    captured.currentCapacity,
    captured.maximumCapacity,
  )
  const nextEffort = Math.min(
    SCALABLE_MAX_EFFORT_LEVEL,
    captured.effortLevel + 1,
  )
  const control = evaluateConfiguredContinuation(
    cloneSnapshot(captured),
    {
      action: 'control',
      capacity: captured.currentCapacity,
      effortLevel: captured.effortLevel,
    },
    workBudget,
    options,
  )
  const effortOnly = evaluateConfiguredContinuation(
    cloneSnapshot(captured),
    {
      action: 'effort-only',
      capacity: captured.currentCapacity,
      effortLevel: nextEffort,
    },
    workBudget,
    options,
  )
  const capacityOnly = evaluateConfiguredContinuation(
    cloneSnapshot(captured),
    {
      action: 'capacity-only',
      capacity: nextCapacity,
      effortLevel: captured.effortLevel,
    },
    workBudget,
    options,
  )
  const arms: [
    SchedulerDecisionArmResult,
    SchedulerDecisionArmResult,
    SchedulerDecisionArmResult,
  ] = [control, effortOnly, capacityOnly]
  return {
    snapshot: captured,
    arms,
    byAction: {
      control,
      'effort-only': effortOnly,
      'capacity-only': capacityOnly,
    },
    workComparison: factorizedWorkComparison(workBudget, arms),
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
  captured.capacityPressure = captured.capacityPressure ?? createCapacityPressureDelta()
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
