import {
  calculateErrorMetrics,
  cascadeMagnitudeDb,
} from '../../index.js'
import type { Filter } from '../../types/filter.js'
import type { StandardV2Deadline } from './runtime.js'
import {
  ADAPTIVE_RESOURCE_POLICY,
  decideAdaptiveSchedulerAction,
  type AdaptiveSchedulerDecisionReason,
  type AdaptiveSchedulerPolicyParameters,
} from './adaptiveScheduler.js'
import {
  addSearchWorkDelta,
  runStructuralSearch,
  createSearchWorkDelta,
  searchWorkDeltaFromTrace,
  type SearchWorkDelta,
  type SearchWorkTotals,
  type ResolvedStructuralSearchConfig,
  type StructuralSearchResult,
} from './structuralSearch.js'

export const SCALABLE_BASE_CAPACITY = 10
export const SCALABLE_CAPACITY_GROWTH = 1.5
export const SCALABLE_STAGE_QUANTUM_MS = 5_000
export const SCALABLE_MAX_EFFORT_LEVEL = 6

export type ScalableSchedulerPolicy = 'legacy' | 'adaptive-resource'

export type ScalableSearchAction =
  | 'explore-current-capacity'
  | 'deepen'
  | 'expand-capacity'
  | 'reseed'

export type ScalableSearchQualityKey = readonly [
  violation: number,
  rmseDb: number,
  maxAbsDb: number,
]

export interface ScalableSearchStage {
  stageIndex: number
  capacity: number
  effortLevel: number
  seedStrategy: 'incumbent' | 'remove-one-reseed'
  removedFilterId?: string
  candidateViolation: number
  incumbentViolation: number
  improved: boolean
  action?: ScalableSearchAction
  schedulerPolicy?: ScalableSchedulerPolicy
  decisionReason?: AdaptiveSchedulerDecisionReason
  stagesSinceMeaningfulImprovement?: number
  workSinceMeaningfulImprovement?: SearchWorkTotals
  remainingWallClockMs?: number
  qualityBefore?: number
  candidateQuality?: number
  qualityAfter?: number
  qualityDelta?: number
  qualityRelativeDelta?: number
  qualityBeforeKey?: ScalableSearchQualityKey
  candidateQualityKey?: ScalableSearchQualityKey
  qualityAfterKey?: ScalableSearchQualityKey
  workDelta?: SearchWorkDelta
  cumulativeWork?: SearchWorkTotals
}

export interface ScalableStructuralSearchInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  sampleRateHz: number
  maxFilters: number
  baseConfig: ResolvedStructuralSearchConfig
  deadline: StandardV2Deadline
  seedFilters?: readonly Filter[]
  /** Internal research selector; omitted means the unchanged legacy policy. */
  schedulerPolicy?: ScalableSchedulerPolicy
  adaptivePolicyParameters?: AdaptiveSchedulerPolicyParameters
  /** Optional deadline remainder supplied by a research runner. */
  remainingWallClockMs?: () => number
  nowMs?: () => number
  onStage?: (stage: ScalableSearchStage) => void
}

export interface ScalableStructuralSearchResult extends StructuralSearchResult {
  stagesCompleted: number
}

export function structuralViolation(
  value: Pick<StructuralSearchResult, 'rmseDb' | 'maxAbsDb'>,
): number {
  return Math.max(value.rmseDb / 0.25, value.maxAbsDb / 0.75)
}

export function nextScalableCapacity(
  current: number,
  maximum: number,
  growth = SCALABLE_CAPACITY_GROWTH,
): number {
  if (maximum <= 0) return 0
  if (current >= maximum) return maximum
  return Math.min(
    maximum,
    Math.max(current + 1, Math.ceil(current * growth)),
  )
}

export function resolveScalableEffortConfig(
  base: ResolvedStructuralSearchConfig,
  maxFilters: number,
  effortLevel: number,
): ResolvedStructuralSearchConfig {
  const effort = Math.max(0, Math.min(SCALABLE_MAX_EFFORT_LEVEL, effortLevel))
  return {
    ...base,
    maxFilters,
    beamWidth: Math.min(16, base.beamWidth + effort * 2),
    proposalsPerParent: Math.min(32, base.proposalsPerParent + effort * 4),
    localPolishEvaluations: Math.min(
      128,
      base.localPolishEvaluations + effort * 16,
    ),
    workProfile: 'full',
  }
}

function evaluateFilters(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): StructuralSearchResult {
  const responseDb = cascadeMagnitudeDb(filters, frequencies, sampleRateHz)
  const residualDb = desiredDb.map(
    (desired, index) => desired - responseDb[index]!,
  )
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  return {
    filters: filters.map((filter) => ({ ...filter })),
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
  }
}

function isScalableImprovement(
  candidate: StructuralSearchResult,
  incumbent: StructuralSearchResult,
): boolean {
  const epsilon = 1e-12
  const candidateViolation = structuralViolation(candidate)
  const incumbentViolation = structuralViolation(incumbent)
  return candidateViolation < incumbentViolation - epsilon ||
    (
      Math.abs(candidateViolation - incumbentViolation) <= epsilon &&
      (
        candidate.rmseDb < incumbent.rmseDb - epsilon ||
        (
          Math.abs(candidate.rmseDb - incumbent.rmseDb) <= epsilon &&
          candidate.maxAbsDb < incumbent.maxAbsDb - epsilon
        )
      )
    )
}

function qualityKey(value: StructuralSearchResult): ScalableSearchQualityKey {
  return [
    structuralViolation(value),
    value.rmseDb,
    value.maxAbsDb,
  ]
}

function actionForStage(
  capacity: number,
  maximum: number,
  effortLevel: number,
  useRemovalReseed: boolean,
): ScalableSearchAction {
  if (useRemovalReseed) return 'reseed'
  if (capacity < maximum) return 'expand-capacity'
  if (effortLevel > 0) return 'deepen'
  return 'explore-current-capacity'
}

function stageActionForAdaptiveDecision(
  decision: ReturnType<typeof decideAdaptiveSchedulerAction>,
  effortLevel: number,
): ScalableSearchAction {
  if (decision.action === 'expand-capacity') return 'expand-capacity'
  return effortLevel > 0 ? 'deepen' : 'explore-current-capacity'
}

function rankRemovalSeeds(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): Array<{ seed: Filter[]; removedFilterId: string; violation: number; index: number }> {
  return filters.map((filter, index) => {
    const seed = filters
      .filter((_, candidateIndex) => candidateIndex !== index)
      .map((candidate) => ({ ...candidate }))
    const evaluated = evaluateFilters(seed, desiredDb, frequencies, sampleRateHz)
    return {
      seed,
      removedFilterId: filter.id,
      violation: structuralViolation(evaluated),
      index,
    }
  }).sort((left, right) =>
    left.violation - right.violation ||
    left.index - right.index
  )
}

export function runScalableStructuralSearch(
  input: ScalableStructuralSearchInput,
): ScalableStructuralSearchResult {
  const nowMs = input.nowMs ?? (() => performance.now())
  const maximum = Math.max(1, Math.floor(input.maxFilters))
  let capacity = Math.min(SCALABLE_BASE_CAPACITY, maximum)
  let effortLevel = 0
  let consecutiveNoImprovement = 0
  let reseedCursor = 0
  let stageIndex = 0
  let cumulativeWork = createSearchWorkDelta()
  let recentGain = 0
  let stagesSinceMeaningfulImprovement = 0
  let workSinceMeaningfulImprovement = createSearchWorkDelta()
  const schedulerPolicy = input.schedulerPolicy ?? 'legacy'
  const adaptivePolicyParameters = input.adaptivePolicyParameters ?? ADAPTIVE_RESOURCE_POLICY
  let incumbent = evaluateFilters(
    input.seedFilters ?? [],
    input.desiredDb,
    input.frequencies,
    input.sampleRateHz,
  )

  while (!input.deadline.isExpired() && stageIndex < 256) {
    const stageDeadlineAt = nowMs() + SCALABLE_STAGE_QUANTUM_MS
    const atMaximumCapacity = capacity >= maximum
    const useRemovalReseed =
      atMaximumCapacity &&
      effortLevel >= 2 &&
      consecutiveNoImprovement >= 1 &&
      incumbent.filters.length > 0
    const remainingWallClockMs = input.remainingWallClockMs?.()
    const adaptiveDecision = schedulerPolicy === 'adaptive-resource'
      ? decideAdaptiveSchedulerAction({
        currentCapacity: capacity,
        maximumCapacity: maximum,
        effortLevel,
        recentGain,
        stagesSinceMeaningfulImprovement,
        workSinceMeaningfulImprovement,
        remainingWallClockMs,
      }, adaptivePolicyParameters)
      : undefined
    const action = useRemovalReseed
      ? 'reseed'
      : adaptiveDecision === undefined
        ? actionForStage(capacity, maximum, effortLevel, false)
        : stageActionForAdaptiveDecision(adaptiveDecision, effortLevel)

    let seedFilters = incumbent.filters.map((filter) => ({ ...filter }))
    let removedFilterId: string | undefined

    if (useRemovalReseed) {
      const removalSeeds = rankRemovalSeeds(
        incumbent.filters,
        input.desiredDb,
        input.frequencies,
        input.sampleRateHz,
      )
      const selected = removalSeeds[reseedCursor % removalSeeds.length]
      if (selected !== undefined) {
        seedFilters = selected.seed
        removedFilterId = selected.removedFilterId
        reseedCursor += 1
      }
    }

    const before = {
      filters: incumbent.filters.map((filter) => ({ ...filter })),
      rmseDb: incumbent.rmseDb,
      maxAbsDb: incumbent.maxAbsDb,
    }
    let workDelta: SearchWorkDelta = {
      ...createSearchWorkDelta(),
      structuralSearchInvocations: 1,
      reseedAttempts: useRemovalReseed ? 1 : 0,
    }

    const candidate = runStructuralSearch({
      desiredDb: input.desiredDb,
      frequencies: input.frequencies,
      sampleRateHz: input.sampleRateHz,
      config: resolveScalableEffortConfig(
        input.baseConfig,
        capacity,
        effortLevel,
      ),
      deadline: {
        isExpired: () =>
          input.deadline.isExpired() ||
          nowMs() >= stageDeadlineAt,
      },
      seedFilters,
      onTrace: (event) => {
        workDelta = addSearchWorkDelta(workDelta, searchWorkDeltaFromTrace(event))
      },
    })

    const improved = isScalableImprovement(candidate, incumbent)
    if (improved) {
      incumbent = {
        filters: candidate.filters.map((filter) => ({ ...filter })),
        rmseDb: candidate.rmseDb,
        maxAbsDb: candidate.maxAbsDb,
      }
      consecutiveNoImprovement = 0
    } else {
      consecutiveNoImprovement += 1
    }

    const beforeKey = qualityKey(before)
    const candidateKey = qualityKey(candidate)
    const afterKey = qualityKey(incumbent)
    const qualityBefore = beforeKey[0]
    const candidateQuality = candidateKey[0]
    const qualityAfter = afterKey[0]
    const qualityDelta = qualityBefore - qualityAfter
    const qualityRelativeDelta = qualityBefore !== 0
      ? qualityDelta / Math.abs(qualityBefore)
      : undefined
    cumulativeWork = addSearchWorkDelta(cumulativeWork, workDelta)

    recentGain = qualityDelta > 0 ? qualityDelta : 0
    const meaningfulImprovement = recentGain >= adaptivePolicyParameters.meaningfulGainThreshold
    if (meaningfulImprovement) {
      stagesSinceMeaningfulImprovement = 0
      workSinceMeaningfulImprovement = createSearchWorkDelta()
    } else {
      stagesSinceMeaningfulImprovement += 1
      workSinceMeaningfulImprovement = addSearchWorkDelta(
        workSinceMeaningfulImprovement,
        workDelta,
      )
    }

    input.onStage?.({
      stageIndex,
      capacity,
      effortLevel,
      seedStrategy: useRemovalReseed ? 'remove-one-reseed' : 'incumbent',
      removedFilterId,
      candidateViolation: structuralViolation(candidate),
      incumbentViolation: structuralViolation(incumbent),
      improved,
      action,
      schedulerPolicy,
      decisionReason: adaptiveDecision?.reason,
      stagesSinceMeaningfulImprovement,
      workSinceMeaningfulImprovement,
      remainingWallClockMs,
      qualityBefore,
      candidateQuality,
      qualityAfter,
      qualityDelta,
      qualityRelativeDelta,
      qualityBeforeKey: beforeKey,
      candidateQualityKey: candidateKey,
      qualityAfterKey: afterKey,
      workDelta,
      cumulativeWork,
    })

    stageIndex += 1
    if (action === 'expand-capacity' && capacity < maximum) {
      // Work and gains are regime-local.  The expansion stage used the old
      // capacity, so the new regime must collect its own evidence before a
      // subsequent expansion can be considered.
      recentGain = 0
      stagesSinceMeaningfulImprovement = 0
      workSinceMeaningfulImprovement = createSearchWorkDelta()
      capacity = nextScalableCapacity(capacity, maximum)
      effortLevel = 0
      consecutiveNoImprovement = 0
    } else {
      effortLevel = Math.min(
        SCALABLE_MAX_EFFORT_LEVEL,
        effortLevel + 1,
      )
    }
  }

  return {
    filters: incumbent.filters.map((filter) => ({ ...filter })),
    rmseDb: incumbent.rmseDb,
    maxAbsDb: incumbent.maxAbsDb,
    stagesCompleted: stageIndex,
  }
}
