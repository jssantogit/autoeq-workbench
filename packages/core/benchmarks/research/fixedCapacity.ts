import { performance } from 'node:perf_hooks'

import {
  addCapacityPressureDelta,
  addFrontierUtilizationDelta,
  createCapacityPressureDelta,
  createFrontierUtilizationDelta,
  evaluateConfiguredContinuation,
  nextScalableCapacity,
  SCALABLE_BASE_CAPACITY,
  SCALABLE_MAX_EFFORT_LEVEL,
  type CapacityPressureDelta,
  type FrontierUtilizationDelta,
  type SchedulerDecisionSearchRunner,
  type SchedulerDecisionSnapshot,
  type SearchWorkTotals,
  type StructuralSearchResult,
} from '../../src/index.js'
import { structuralViolation } from '../../src/autoeq/v2/scalableStructuralSearch.js'

export const FIXED_CAPACITY_CHECKPOINT_SECONDS = [5, 15, 30] as const

export interface FixedCapacityTrajectoryCheckpoint {
  requestedSeconds: number
  quantumCount: number
  elapsedMs: number
  capacity: number
  effortLevel: number
  structuralViolation: number
  rmseDb: number
  maxAbsDb: number
  finalFilterCount: number
  incumbentUtilization: number
  frontierMaxFilterCount: number
  frontierUtilization: FrontierUtilizationDelta
  capacityPressure: CapacityPressureDelta
  cumulativeWork: SearchWorkTotals
  firstFrontierAtCapacityQuantum: number | null
  firstPressureQuantum: number | null
}

export interface FixedCapacityTrajectoryResult {
  capacity: number
  maximumCapacity: number
  stageQuantumMs: number
  checkpointSeconds: number[]
  checkpoints: FixedCapacityTrajectoryCheckpoint[]
  finalIncumbent: StructuralSearchResult
}

export interface FixedCapacityTrajectoryOptions {
  capacity: number
  checkpointSeconds?: readonly number[]
  stageQuantumMs?: number
  nowMs?: () => number
  run?: SchedulerDecisionSearchRunner
}

export interface FixedCapacityLadderOptions extends Omit<FixedCapacityTrajectoryOptions, 'capacity'> {
  baseCapacity?: number
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

function validateCheckpointSeconds(values: readonly number[], stageQuantumMs: number): number[] {
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error('checkpointSeconds must contain unique positive values')
  }
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('checkpointSeconds must contain unique positive values')
  }
  const ordered = [...values].sort((left, right) => left - right)
  if (ordered.some((value, index) => index > 0 && value <= ordered[index - 1]!)) {
    throw new Error('checkpointSeconds must contain unique positive values')
  }
  // Checkpoints are wall-clock labels, but each label is reached after an
  // integral number of continuing quanta; no restart or interpolation occurs.
  return ordered.map((value) => Math.max(1, Math.ceil(value * 1_000 / stageQuantumMs)))
}

function snapshotAfter(
  snapshot: SchedulerDecisionSnapshot,
  result: ReturnType<typeof evaluateConfiguredContinuation>,
  capacity: number,
  effortLevel: number,
  frontierUtilization: FrontierUtilizationDelta,
  capacityPressure: CapacityPressureDelta,
): SchedulerDecisionSnapshot {
  return {
    ...cloneSnapshot(snapshot),
    incumbent: cloneResult(result.finalIncumbent),
    currentCapacity: capacity,
    effortLevel,
    frontierUtilization,
    capacityPressure,
    cumulativeWork: { ...result.cumulativeWork },
    recentGains: [...(snapshot.recentGains ?? []), result.absoluteGain],
    recentGain: result.absoluteGain,
    stageIndex: (snapshot.stageIndex ?? 0) + 1,
    remainingWallClockMs: undefined,
  }
}

function checkpoint(
  requestedSeconds: number,
  quantumCount: number,
  elapsedMs: number,
  capacity: number,
  effortLevel: number,
  result: ReturnType<typeof evaluateConfiguredContinuation>,
  frontierUtilization: FrontierUtilizationDelta,
  capacityPressure: CapacityPressureDelta,
  firstFrontierAtCapacityQuantum: number | null,
  firstPressureQuantum: number | null,
): FixedCapacityTrajectoryCheckpoint {
  return {
    requestedSeconds,
    quantumCount,
    elapsedMs,
    capacity,
    effortLevel,
    structuralViolation: structuralViolation(result.finalIncumbent),
    rmseDb: result.finalIncumbent.rmseDb,
    maxAbsDb: result.finalIncumbent.maxAbsDb,
    finalFilterCount: result.finalIncumbent.filters.length,
    incumbentUtilization: capacity > 0 ? result.finalIncumbent.filters.length / capacity : 0,
    frontierMaxFilterCount: Math.max(
      result.maximumFilterCountObserved,
      frontierUtilization.parentFilterCountMax,
      frontierUtilization.generatedCandidateFilterCountMax,
      frontierUtilization.admittedCandidateFilterCountMax,
      frontierUtilization.polishedCandidateFilterCountMax,
    ),
    frontierUtilization: { ...frontierUtilization },
    capacityPressure: { ...capacityPressure },
    cumulativeWork: { ...result.cumulativeWork },
    firstFrontierAtCapacityQuantum,
    firstPressureQuantum,
  }
}

/**
 * Run one continuing trajectory while holding the structural ceiling fixed.
 * This helper intentionally bypasses the production scalable scheduler; the
 * only changing resource is the generic effort level.
 */
export function runFixedCapacityTrajectory(
  snapshot: SchedulerDecisionSnapshot,
  options: FixedCapacityTrajectoryOptions,
): FixedCapacityTrajectoryResult {
  if (!Number.isSafeInteger(options.capacity) || options.capacity <= 0) throw new Error('capacity must be a positive integer')
  if (options.capacity > snapshot.maximumCapacity) throw new Error('capacity must not exceed maximumCapacity')
  const stageQuantumMs = options.stageQuantumMs ?? 5_000
  if (!Number.isFinite(stageQuantumMs) || stageQuantumMs <= 0) throw new Error('stageQuantumMs must be positive')
  const requestedSeconds = [...(options.checkpointSeconds ?? FIXED_CAPACITY_CHECKPOINT_SECONDS)]
  const checkpointQuanta = validateCheckpointSeconds(requestedSeconds, stageQuantumMs)
  const checkpointByQuantum = new Map(checkpointQuanta.map((quantum, index) => [quantum, requestedSeconds[index]!]))
  const nowMs = options.nowMs ?? (() => performance.now())
  let continuation = cloneSnapshot(snapshot)
  let frontierUtilization = continuation.frontierUtilization === undefined
    ? createFrontierUtilizationDelta()
    : { ...continuation.frontierUtilization }
  let capacityPressure = continuation.capacityPressure === undefined
    ? createCapacityPressureDelta()
    : { ...continuation.capacityPressure }
  let firstFrontierAtCapacityQuantum: number | null = null
  let firstPressureQuantum: number | null = null
  const checkpoints: FixedCapacityTrajectoryCheckpoint[] = []
  const startedAt = nowMs()
  const initialEffort = snapshot.effortLevel

  for (let quantum = 1; quantum <= checkpointQuanta.at(-1)!; quantum += 1) {
    const effortLevel = Math.min(SCALABLE_MAX_EFFORT_LEVEL, initialEffort + quantum - 1)
    const result = evaluateConfiguredContinuation(
      continuation,
      { action: 'control', capacity: options.capacity, effortLevel },
      { structuralSearchInvocations: 1, stageQuantumMs },
      { nowMs, run: options.run },
    )
    frontierUtilization = addFrontierUtilizationDelta(frontierUtilization, result.frontierUtilization)
    capacityPressure = addCapacityPressureDelta(capacityPressure, result.capacityPressure)
    if (firstFrontierAtCapacityQuantum === null && frontierUtilization.generatedCandidateFilterCountMax >= options.capacity) {
      firstFrontierAtCapacityQuantum = quantum
    }
    if (
      firstPressureQuantum === null &&
      (capacityPressure.additiveMutationGatesBlockedByCapacity > 0 ||
        capacityPressure.rescueAddGatesBlockedByCapacity > 0 ||
        capacityPressure.pairAddGatesBlockedByCapacity > 0)
    ) firstPressureQuantum = quantum
    continuation = snapshotAfter(
      continuation,
      result,
      options.capacity,
      effortLevel,
      frontierUtilization,
      capacityPressure,
    )
    const requested = checkpointByQuantum.get(quantum)
    if (requested !== undefined) {
      checkpoints.push(checkpoint(
        requested,
        quantum,
        Math.max(0, nowMs() - startedAt),
        options.capacity,
        effortLevel,
        result,
        frontierUtilization,
        capacityPressure,
        firstFrontierAtCapacityQuantum,
        firstPressureQuantum,
      ))
    }
  }

  return {
    capacity: options.capacity,
    maximumCapacity: snapshot.maximumCapacity,
    stageQuantumMs,
    checkpointSeconds: requestedSeconds,
    checkpoints,
    finalIncumbent: cloneResult(continuation.incumbent),
  }
}

/** Derive probe ceilings using the existing generic growth function. */
export function deriveScalableCapacityLadder(
  maximumCapacity: number,
  baseCapacity = SCALABLE_BASE_CAPACITY,
): number[] {
  if (!Number.isSafeInteger(maximumCapacity) || maximumCapacity <= 0) throw new Error('maximumCapacity must be a positive integer')
  if (!Number.isSafeInteger(baseCapacity) || baseCapacity <= 0) throw new Error('baseCapacity must be a positive integer')
  const ladder = [Math.min(baseCapacity, maximumCapacity)]
  while (ladder.at(-1)! < maximumCapacity) ladder.push(nextScalableCapacity(ladder.at(-1)!, maximumCapacity))
  return ladder
}

export function runFixedCapacityLadder(
  snapshot: SchedulerDecisionSnapshot,
  maximumCapacity: number,
  options: FixedCapacityLadderOptions = {},
): FixedCapacityTrajectoryResult[] {
  return deriveScalableCapacityLadder(maximumCapacity, options.baseCapacity).map((capacity) =>
    runFixedCapacityTrajectory(snapshot, { ...options, capacity }),
  )
}
