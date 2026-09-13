import {
  addCapacityPressureDelta,
  addFrontierUtilizationDelta,
  addSearchWorkDelta,
  createCapacityPressureDelta,
  createFrontierUtilizationDelta,
  createSearchWorkDelta,
  evaluateConfiguredContinuation,
  nextScalableCapacity,
  SCALABLE_MAX_EFFORT_LEVEL,
  type CapacityPressureDelta,
  type FrontierUtilizationDelta,
  type SchedulerDecisionArmResult,
  type SchedulerDecisionSearchRunner,
  type SchedulerDecisionSnapshot,
  type SchedulerDecisionWorkBudget,
  type SchedulerConfiguredContinuation,
  type ScalableSearchQualityKey,
  type SearchWorkTotals,
  type StructuralSearchResult,
} from '../../src/index.js'

export const MULTI_QUANTUM_CHECKPOINTS = [1, 2, 4, 8, 16] as const
export type MultiQuantumCheckpoint = (typeof MULTI_QUANTUM_CHECKPOINTS)[number]
export type MultiQuantumArmId = 'C-hold' | 'C+-hold' | 'C-ramp' | 'C+-ramp'

export interface MultiQuantumCheckpointRecord {
  quantum: MultiQuantumCheckpoint
  elapsedMs: number
  capacity: number
  effortSchedule: 'hold' | 'ramp'
  effortLevel: number
  structuralViolation: number
  finalQuality: ScalableSearchQualityKey
  rmseDb: number
  maxAbsDb: number
  finalFilterCount: number
  incumbentUtilization: number
  frontierMaxFilterCount: number
  frontierUtilization: FrontierUtilizationDelta
  capacityPressure: CapacityPressureDelta
  proposalsGenerated: number
  proposalsAdmitted: number
  proposalsPolished: number
  duplicateStates: number
  rescueAttempts: number
  pairAddAttempts: number
  capSwapAttempts: number
  reseedAttempts: number
  cumulativeWork: SearchWorkTotals
  firstGeneratedAboveInitialCapacity?: MultiQuantumCheckpoint | null
  firstAdmittedAboveInitialCapacity?: MultiQuantumCheckpoint | null
  firstPolishedAboveInitialCapacity?: MultiQuantumCheckpoint | null
  firstIncumbentAboveInitialCapacity?: MultiQuantumCheckpoint | null
  productiveNewSlotComparedWithControl?: boolean
}

export interface MultiQuantumArmResult {
  id: MultiQuantumArmId
  capacityCondition: 'C' | 'C+'
  effortSchedule: 'hold' | 'ramp'
  initialCapacity: number
  initialEffortLevel: number
  checkpoints: MultiQuantumCheckpointRecord[]
  finalIncumbent: StructuralSearchResult
  firstProductiveNewSlotQuantum: MultiQuantumCheckpoint | null
}

export interface FactorizedMultiQuantumResult {
  checkpoints: typeof MULTI_QUANTUM_CHECKPOINTS
  initialCapacity: number
  expandedCapacity: number
  arms: [
    MultiQuantumArmResult,
    MultiQuantumArmResult,
    MultiQuantumArmResult,
    MultiQuantumArmResult,
  ]
  byArm: Record<MultiQuantumArmId, MultiQuantumArmResult>
}

export interface FactorizedMultiQuantumOptions {
  maximumCapacity?: number
  structuralSearchInvocationsPerQuantum?: number
  stageQuantumMs?: number
  nowMs?: () => number
  run?: SchedulerDecisionSearchRunner
}

function cloneResult(result: StructuralSearchResult): StructuralSearchResult {
  return {
    filters: result.filters.map((filter) => ({ ...filter })),
    rmseDb: result.rmseDb,
    maxAbsDb: result.maxAbsDb,
  }
}

function cloneSnapshot(snapshot: SchedulerDecisionSnapshot): SchedulerDecisionSnapshot {
  return {
    ...snapshot,
    desiredDb: [...snapshot.desiredDb],
    frequencies: [...snapshot.frequencies],
    baseConfig: { ...snapshot.baseConfig },
    resolvedConfig: snapshot.resolvedConfig === undefined ? undefined : { ...snapshot.resolvedConfig },
    incumbent: cloneResult(snapshot.incumbent),
    recentGains: snapshot.recentGains === undefined ? undefined : [...snapshot.recentGains],
    workSinceMeaningfulImprovement: snapshot.workSinceMeaningfulImprovement === undefined
      ? undefined
      : { ...snapshot.workSinceMeaningfulImprovement },
    expansionOpportunity: snapshot.expansionOpportunity === undefined ? undefined : { ...snapshot.expansionOpportunity },
    residualTelemetry: snapshot.residualTelemetry === undefined ? undefined : { ...snapshot.residualTelemetry },
    capacityPressure: snapshot.capacityPressure === undefined ? undefined : { ...snapshot.capacityPressure },
    frontierUtilization: snapshot.frontierUtilization === undefined ? undefined : { ...snapshot.frontierUtilization },
    cumulativeWork: snapshot.cumulativeWork === undefined ? undefined : { ...snapshot.cumulativeWork },
  }
}

function compareQuality(left: ScalableSearchQualityKey, right: ScalableSearchQualityKey): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! < right[index]!) return -1
    if (left[index]! > right[index]!) return 1
  }
  return 0
}

function isCheckpoint(value: number): value is MultiQuantumCheckpoint {
  return (MULTI_QUANTUM_CHECKPOINTS as readonly number[]).includes(value)
}

function effortAt(
  schedule: 'hold' | 'ramp',
  initialEffortLevel: number,
  continuationQuantum: number,
): number {
  return schedule === 'hold'
    ? initialEffortLevel
    : Math.min(
      SCALABLE_MAX_EFFORT_LEVEL,
      initialEffortLevel + Math.max(0, continuationQuantum - 1),
    )
}

function nextContinuationSnapshot(
  snapshot: SchedulerDecisionSnapshot,
  arm: SchedulerDecisionArmResult,
  capacity: number,
  effortLevel: number,
  frontierUtilization: FrontierUtilizationDelta,
  capacityPressure: CapacityPressureDelta,
): SchedulerDecisionSnapshot {
  return {
    ...cloneSnapshot(snapshot),
    incumbent: cloneResult(arm.finalIncumbent),
    currentCapacity: capacity,
    effortLevel,
    frontierUtilization,
    capacityPressure,
    cumulativeWork: { ...arm.cumulativeWork },
    stageIndex: (snapshot.stageIndex ?? 0) + 1,
    recentGains: [...(snapshot.recentGains ?? []), arm.absoluteGain],
    recentGain: arm.absoluteGain,
    // The protocol is defined by invocation count.  A captured wall-clock
    // remainder must not silently truncate a later nested checkpoint.
    remainingWallClockMs: undefined,
  }
}

function checkpointRecord(
  quantum: MultiQuantumCheckpoint,
  elapsedMs: number,
  effortSchedule: 'hold' | 'ramp',
  effortLevel: number,
  capacity: number,
  arm: SchedulerDecisionArmResult,
  frontierUtilization: FrontierUtilizationDelta,
  capacityPressure: CapacityPressureDelta,
  initialCapacity: number,
  firstGeneratedAboveInitialCapacity: MultiQuantumCheckpoint | null,
  firstAdmittedAboveInitialCapacity: MultiQuantumCheckpoint | null,
  firstPolishedAboveInitialCapacity: MultiQuantumCheckpoint | null,
  firstIncumbentAboveInitialCapacity: MultiQuantumCheckpoint | null,
): MultiQuantumCheckpointRecord {
  const work = arm.cumulativeWork
  return {
    quantum,
    elapsedMs,
    capacity,
    effortSchedule,
    effortLevel,
    structuralViolation: arm.finalQuality[0],
    finalQuality: [...arm.finalQuality],
    rmseDb: arm.finalQuality[1],
    maxAbsDb: arm.finalQuality[2],
    finalFilterCount: arm.finalIncumbent.filters.length,
    incumbentUtilization: capacity > 0 ? arm.finalIncumbent.filters.length / capacity : 0,
    frontierMaxFilterCount: Math.max(
      arm.maximumFilterCountObserved,
      frontierUtilization.parentFilterCountMax,
      frontierUtilization.generatedCandidateFilterCountMax,
      frontierUtilization.admittedCandidateFilterCountMax,
      frontierUtilization.polishedCandidateFilterCountMax,
    ),
    frontierUtilization: { ...frontierUtilization },
    capacityPressure: { ...capacityPressure },
    proposalsGenerated: work.proposalsGenerated,
    proposalsAdmitted: work.proposalsAdmitted,
    proposalsPolished: work.proposalsPolished,
    duplicateStates: work.duplicateStates,
    rescueAttempts: work.rescueAttempts,
    pairAddAttempts: work.pairAddAttempts,
    capSwapAttempts: work.capSwapAttempts,
    reseedAttempts: work.reseedAttempts,
    cumulativeWork: { ...work },
    firstGeneratedAboveInitialCapacity,
    firstAdmittedAboveInitialCapacity,
    firstPolishedAboveInitialCapacity,
    firstIncumbentAboveInitialCapacity,
  }
}

function runArm(
  id: MultiQuantumArmId,
  snapshot: SchedulerDecisionSnapshot,
  initialCapacity: number,
  expandedCapacity: number,
  effortSchedule: 'hold' | 'ramp',
  options: Required<Pick<FactorizedMultiQuantumOptions, 'structuralSearchInvocationsPerQuantum' | 'stageQuantumMs'>> & Pick<FactorizedMultiQuantumOptions, 'nowMs' | 'run'>,
): MultiQuantumArmResult {
  const capacityCondition = id.startsWith('C+') ? 'C+' : 'C'
  const capacity = capacityCondition === 'C+' ? expandedCapacity : initialCapacity
  const initialEffortLevel = snapshot.effortLevel
  let continuation = cloneSnapshot(snapshot)
  let frontierUtilization = continuation.frontierUtilization === undefined
    ? createFrontierUtilizationDelta()
    : { ...continuation.frontierUtilization }
  let capacityPressure = continuation.capacityPressure === undefined
    ? createCapacityPressureDelta()
    : { ...continuation.capacityPressure }
  const checkpoints: MultiQuantumCheckpointRecord[] = []
  let firstGeneratedAboveInitialCapacity: MultiQuantumCheckpoint | null = null
  let firstAdmittedAboveInitialCapacity: MultiQuantumCheckpoint | null = null
  let firstPolishedAboveInitialCapacity: MultiQuantumCheckpoint | null = null
  let firstIncumbentAboveInitialCapacity: MultiQuantumCheckpoint | null = null
  const startedAt = options.nowMs?.() ?? 0

  for (let quantum = 1; quantum <= MULTI_QUANTUM_CHECKPOINTS.at(-1)!; quantum += 1) {
    const checkpoint = quantum as MultiQuantumCheckpoint
    const effortLevel = effortAt(effortSchedule, initialEffortLevel, quantum)
    const action: SchedulerConfiguredContinuation['action'] = id === 'C-hold'
      ? 'control'
      : id === 'C-ramp'
        ? 'effort-only'
        : 'capacity-only'
    const arm = evaluateConfiguredContinuation(
      continuation,
      { action, capacity, effortLevel },
      {
        structuralSearchInvocations: options.structuralSearchInvocationsPerQuantum,
        stageQuantumMs: options.stageQuantumMs,
      } satisfies SchedulerDecisionWorkBudget,
      { nowMs: options.nowMs, run: options.run },
    )
    frontierUtilization = addFrontierUtilizationDelta(frontierUtilization, arm.frontierUtilization)
    capacityPressure = addCapacityPressureDelta(capacityPressure, arm.capacityPressure)
    if (firstGeneratedAboveInitialCapacity === null && frontierUtilization.generatedCandidateFilterCountMax > initialCapacity) firstGeneratedAboveInitialCapacity = checkpoint
    if (firstAdmittedAboveInitialCapacity === null && frontierUtilization.admittedCandidateFilterCountMax > initialCapacity) firstAdmittedAboveInitialCapacity = checkpoint
    if (firstPolishedAboveInitialCapacity === null && frontierUtilization.polishedCandidateFilterCountMax > initialCapacity) firstPolishedAboveInitialCapacity = checkpoint
    if (firstIncumbentAboveInitialCapacity === null && arm.finalIncumbent.filters.length > initialCapacity) firstIncumbentAboveInitialCapacity = checkpoint
    continuation = nextContinuationSnapshot(
      continuation,
      arm,
      capacity,
      effortLevel,
      frontierUtilization,
      capacityPressure,
    )
    if (isCheckpoint(checkpoint)) {
      checkpoints.push(checkpointRecord(
        checkpoint,
        Math.max(0, (options.nowMs?.() ?? 0) - startedAt),
        effortSchedule,
        effortLevel,
        capacity,
        arm,
        frontierUtilization,
        capacityPressure,
        initialCapacity,
        firstGeneratedAboveInitialCapacity,
        firstAdmittedAboveInitialCapacity,
        firstPolishedAboveInitialCapacity,
        firstIncumbentAboveInitialCapacity,
      ))
    }
  }
  return {
    id,
    capacityCondition,
    effortSchedule,
    initialCapacity,
    initialEffortLevel,
    checkpoints,
    finalIncumbent: cloneResult(continuation.incumbent),
    firstProductiveNewSlotQuantum: null,
  }
}

function annotateProductiveCapacityUse(
  arms: readonly MultiQuantumArmResult[],
): void {
  const control = arms.find((arm) => arm.id === 'C-hold')
  if (control === undefined) return
  for (const arm of arms) {
    if (arm.capacityCondition !== 'C+') continue
    arm.firstProductiveNewSlotQuantum = null
    for (let index = 0; index < arm.checkpoints.length; index += 1) {
      const checkpoint = arm.checkpoints[index]!
      const matched = control.checkpoints[index]
      const unavailableStateObserved =
        checkpoint.frontierMaxFilterCount > arm.initialCapacity ||
        checkpoint.finalFilterCount > arm.initialCapacity
      checkpoint.productiveNewSlotComparedWithControl = unavailableStateObserved &&
        matched !== undefined && compareQuality(checkpoint.finalQuality, matched.finalQuality) < 0
      if (checkpoint.productiveNewSlotComparedWithControl && arm.firstProductiveNewSlotQuantum === null) {
        arm.firstProductiveNewSlotQuantum = checkpoint.quantum
      }
    }
    const first = arm.checkpoints.find((checkpoint) => checkpoint.productiveNewSlotComparedWithControl === true)
    if (first !== undefined) {
      // Keep the event as a checkpoint-local boolean; callers can derive the
      // first quantum without introducing a second event taxonomy.
    }
  }
}

/**
 * Continue four matched resource arms from one cloned incumbent.  The
 * protocol is quantum-count based and deliberately does not choose a winner.
 */
export function runFactorizedMultiQuantumContinuation(
  snapshot: SchedulerDecisionSnapshot,
  options: FactorizedMultiQuantumOptions = {},
): FactorizedMultiQuantumResult {
  const maximumCapacity = options.maximumCapacity ?? snapshot.maximumCapacity
  if (!Number.isSafeInteger(maximumCapacity) || maximumCapacity <= 0) {
    throw new Error('maximumCapacity must be a positive integer')
  }
  if (snapshot.currentCapacity > maximumCapacity) throw new Error('maximumCapacity must not be below current capacity')
  const invocations = options.structuralSearchInvocationsPerQuantum ?? 1
  const stageQuantumMs = options.stageQuantumMs ?? 250
  if (!Number.isSafeInteger(invocations) || invocations <= 0) throw new Error('structuralSearchInvocationsPerQuantum must be positive')
  if (!Number.isFinite(stageQuantumMs) || stageQuantumMs <= 0) throw new Error('stageQuantumMs must be positive')
  const initialCapacity = snapshot.currentCapacity
  const expandedCapacity = nextScalableCapacity(initialCapacity, maximumCapacity)
  const sharedOptions = {
    structuralSearchInvocationsPerQuantum: invocations,
    stageQuantumMs,
    nowMs: options.nowMs,
    run: options.run,
  } as const
  const arms = [
    runArm('C-hold', snapshot, initialCapacity, expandedCapacity, 'hold', sharedOptions),
    runArm('C+-hold', snapshot, initialCapacity, expandedCapacity, 'hold', sharedOptions),
    runArm('C-ramp', snapshot, initialCapacity, expandedCapacity, 'ramp', sharedOptions),
    runArm('C+-ramp', snapshot, initialCapacity, expandedCapacity, 'ramp', sharedOptions),
  ] as [MultiQuantumArmResult, MultiQuantumArmResult, MultiQuantumArmResult, MultiQuantumArmResult]
  annotateProductiveCapacityUse(arms)
  return {
    checkpoints: MULTI_QUANTUM_CHECKPOINTS,
    initialCapacity,
    expandedCapacity,
    arms,
    byArm: {
      'C-hold': arms[0],
      'C+-hold': arms[1],
      'C-ramp': arms[2],
      'C+-ramp': arms[3],
    },
  }
}
