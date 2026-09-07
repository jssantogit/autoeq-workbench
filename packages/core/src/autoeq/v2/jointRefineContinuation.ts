import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import type { BiquadResponseGrid } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellationsOnGrid } from '../cancellation.js'
import type { StandardAutoEqV2Config } from './config.js'
import {
  calculateV2NormalizedViolation,
  compareV2PrimaryMetrics,
  compareV2Solutions,
  type V2Solution,
} from './ranking.js'
import {
  createV2ResponseCache,
  type V2ResponseCache,
} from './responseCache.js'
import {
  evaluateV2ReplacementTrial,
  materializeV2ReplacementTrial,
} from './replacementTrial.js'
import {
  createV2SolutionKey,
  withResearchTracePhase,
  type StandardV2JointRefineContext,
  type StandardV2JointRefineCycle,
  type StandardV2ResearchTrace,
} from './researchTrace.js'
import type { StandardV2Deadline } from './runtime.js'

export const JOINT_REFINEMENT_SCALES = Object.freeze([
  { fcOctaveStep: 1 / 6, gainStepDb: 1, qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1, qOctaveStep: 1 / 32 },
])

export interface V2EvaluatedSolution extends V2Solution {
  responseCache: V2ResponseCache
  cascadeDb: number[]
  residualDb: number[]
}

export interface JointRefineInput {
  solution: V2Solution
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
  researchTrace?: StandardV2ResearchTrace
  researchContext?: StandardV2JointRefineContext
}

export interface JointRefineResult {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  expired: boolean
}

export interface JointRefineTrace {
  onCancellationAuditComputed?: () => void
}

export interface JointRefineContinuationV2 {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  nextCycleIndex: number
  done: boolean
  expired: boolean
}

interface ContinuationState {
  input: JointRefineInput
  trace?: JointRefineTrace
  responseBuffer: number[]
  validAudits: WeakSet<V2EvaluatedSolution>
  cycles?: StandardV2JointRefineCycle[]
  cycleStartingSolution?: V2EvaluatedSolution
  cycleTrialStart: number
}

const continuationStates = new WeakMap<JointRefineContinuationV2, ContinuationState>()

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function evaluateV2Solution(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
  responseGrid?: BiquadResponseGrid,
): V2EvaluatedSolution {
  const copiedFilters = filters.map((filter) => ({ ...filter }))
  const responseCache = createV2ResponseCache(
    copiedFilters,
    frequencies,
    sampleRateHz,
    responseGrid,
  )
  const residualDb = desiredDb.length === frequencies.length
    ? desiredDb.map((value, index) => value - responseCache.cascadeDb[index]!)
    : frequencies.map(() => 0)
  return {
    filters: copiedFilters,
    responseCache,
    cascadeDb: responseCache.cascadeDb,
    residualDb,
    metrics: calculateErrorMetrics(residualDb, frequencies),
    cancellationAudit: auditCancellationsOnGrid(copiedFilters, responseCache.responseGrid),
  }
}

function uniqueTrials(filters: readonly Filter[]): Filter[] {
  const seen = new Set<string>()
  return filters.filter((filter) => {
    const key = `${filter.frequencyHz}|${filter.gainDb}|${filter.q}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function withCancellationAudit(
  continuation: JointRefineContinuationV2,
  candidate: V2EvaluatedSolution,
): V2EvaluatedSolution {
  const state = continuationStates.get(continuation)
  if (state === undefined) throw new Error('unknown joint refinement continuation')
  if (state.validAudits.has(candidate)) return candidate
  state.trace?.onCancellationAuditComputed?.()
  const audited = {
    ...candidate,
    cancellationAudit: auditCancellationsOnGrid(
      candidate.filters,
      candidate.responseCache.responseGrid,
    ),
  }
  state.validAudits.add(audited)
  return audited
}

function recordCycle(
  continuation: JointRefineContinuationV2,
  completed: boolean,
): void {
  const state = continuationStates.get(continuation)
  if (state === undefined || state.cycles === undefined || state.cycleStartingSolution === undefined) return
  state.cycles.push({
    cycleIndex: state.cycles.length + 1,
    completed,
    coordinateTrials: continuation.coordinateTrials - state.cycleTrialStart,
    startMetrics: { ...state.cycleStartingSolution.metrics },
    endMetrics: { ...continuation.solution.metrics },
    normalizedViolationGain:
      calculateV2NormalizedViolation(state.cycleStartingSolution.metrics) -
      calculateV2NormalizedViolation(continuation.solution.metrics),
  })
  state.cycleStartingSolution = undefined
}

function finish(
  continuation: JointRefineContinuationV2,
  expired: boolean,
): JointRefineContinuationV2 {
  const state = continuationStates.get(continuation)
  if (state === undefined) throw new Error('unknown joint refinement continuation')
  if (continuation.done) return continuation

  recordCycle(continuation, false)
  continuation.solution = withCancellationAudit(continuation, continuation.solution)
  continuation.done = true
  continuation.expired = expired
  state.input.researchTrace?.onJointRefineCompleted?.(continuation.coordinateTrials)
  const researchContext = state.input.researchContext
  const onJointRefineTrace = state.input.researchTrace?.onJointRefineTrace
  if (state.cycles !== undefined && researchContext !== undefined && onJointRefineTrace !== undefined) {
    onJointRefineTrace({
      ...researchContext,
      parentMetrics: { ...researchContext.parentMetrics },
      candidate: {
        ...researchContext.candidate,
        filter: { ...researchContext.candidate.filter },
      },
      resultKey: createV2SolutionKey(continuation.solution.filters),
      resultMetrics: { ...continuation.solution.metrics },
      cycles: state.cycles.map((cycle) => ({
        ...cycle,
        startMetrics: { ...cycle.startMetrics },
        endMetrics: { ...cycle.endMetrics },
      })),
      completedCycles: continuation.completedCycles,
      coordinateTrials: continuation.coordinateTrials,
      expired,
    })
  }
  return continuation
}

export function createJointRefineContinuationV2(
  input: JointRefineInput,
  trace?: JointRefineTrace,
): JointRefineContinuationV2 {
  const solution = 'responseCache' in input.solution
    ? input.solution as V2EvaluatedSolution
    : evaluateV2Solution(
        input.solution.filters,
        input.desiredDb,
        input.frequencies,
        input.config.sampleRateHz,
      )
  const continuation: JointRefineContinuationV2 = {
    solution,
    completedCycles: 0,
    coordinateTrials: 0,
    nextCycleIndex: 1,
    done: false,
    expired: false,
  }
  const detailedJointTrace =
    input.researchContext !== undefined &&
    input.researchTrace?.onJointRefineTrace !== undefined
  continuationStates.set(continuation, {
    input,
    trace,
    responseBuffer: new Array<number>(input.frequencies.length),
    validAudits: new WeakSet<V2EvaluatedSolution>([solution]),
    cycles: detailedJointTrace ? [] : undefined,
    cycleTrialStart: 0,
  })
  return continuation
}

export function advanceJointRefineContinuationV2(
  continuation: JointRefineContinuationV2,
): JointRefineContinuationV2 {
  const state = continuationStates.get(continuation)
  if (state === undefined) throw new Error('unknown joint refinement continuation')
  if (continuation.done) return continuation

  const { input } = state
  if (continuation.completedCycles >= input.config.algorithm.maxJointRefinementCycles) {
    return finish(continuation, false)
  }
  if (input.deadline.isExpired()) return finish(continuation, true)

  const cycleStartSolution = continuation.solution
  if (state.cycles !== undefined) {
    state.cycleStartingSolution = cycleStartSolution
    state.cycleTrialStart = continuation.coordinateTrials
  }

  for (const scale of JOINT_REFINEMENT_SCALES) {
    for (let filterIndex = 0; filterIndex < continuation.solution.filters.length; filterIndex += 1) {
      const startingFilter = continuation.solution.filters[filterIndex]!
      const coordinates: Array<'frequencyHz' | 'gainDb' | 'q'> = ['frequencyHz', 'gainDb']
      if (startingFilter.type === 'PK') coordinates.push('q')

      for (const coordinate of coordinates) {
        const currentFilter = continuation.solution.filters[filterIndex]!
        const trials = coordinate === 'frequencyHz'
          ? uniqueTrials([
              { ...currentFilter, frequencyHz: clamp(currentFilter.frequencyHz * 2 ** -scale.fcOctaveStep, input.config.minFrequencyHz, input.config.maxFrequencyHz) },
              { ...currentFilter, frequencyHz: clamp(currentFilter.frequencyHz * 2 ** scale.fcOctaveStep, input.config.minFrequencyHz, input.config.maxFrequencyHz) },
            ])
          : coordinate === 'gainDb'
            ? uniqueTrials([
                { ...currentFilter, gainDb: clamp(currentFilter.gainDb - scale.gainStepDb, input.config.minGainDb, input.config.maxGainDb) },
                { ...currentFilter, gainDb: clamp(currentFilter.gainDb + scale.gainStepDb, input.config.minGainDb, input.config.maxGainDb) },
              ])
            : uniqueTrials([
                { ...currentFilter, q: clamp(currentFilter.q * 2 ** -scale.qOctaveStep, input.config.minPkQ, input.config.maxPkQ) },
                { ...currentFilter, q: clamp(currentFilter.q * 2 ** scale.qOctaveStep, input.config.minPkQ, input.config.maxPkQ) },
              ])
        let best = continuation.solution
        for (const replacement of trials) {
          if (input.deadline.isExpired()) return finish(continuation, true)
          continuation.coordinateTrials += 1
          const trial = evaluateV2ReplacementTrial(
            continuation.solution,
            filterIndex,
            replacement,
            input.desiredDb,
            input.frequencies,
            input.config.sampleRateHz,
            state.responseBuffer,
          )
          if (input.deadline.isExpired()) return finish(continuation, true)
          const primaryComparison = compareV2PrimaryMetrics(trial.metrics, best.metrics)
          if (primaryComparison < 0) {
            best = materializeV2ReplacementTrial(
              continuation.solution,
              trial,
              input.desiredDb,
              input.frequencies,
              input.config.sampleRateHz,
            )
          } else if (primaryComparison === 0) {
            const candidate = materializeV2ReplacementTrial(
              continuation.solution,
              trial,
              input.desiredDb,
              input.frequencies,
              input.config.sampleRateHz,
            )
            const auditedCandidate = withCancellationAudit(continuation, candidate)
            const auditedBest = withCancellationAudit(continuation, best)
            best = compareV2Solutions(auditedCandidate, auditedBest) < 0
              ? auditedCandidate
              : auditedBest
          }
        }
        continuation.solution = best
      }
    }
  }

  continuation.completedCycles += 1
  continuation.nextCycleIndex = continuation.completedCycles + 1
  recordCycle(continuation, true)
  const primaryComparison = compareV2PrimaryMetrics(continuation.solution.metrics, cycleStartSolution.metrics)
  if (primaryComparison > 0) return finish(continuation, false)
  if (primaryComparison === 0) {
    continuation.solution = withCancellationAudit(continuation, continuation.solution)
    if (compareV2Solutions(continuation.solution, withCancellationAudit(continuation, cycleStartSolution)) >= 0) {
      return finish(continuation, false)
    }
  }
  if (continuation.completedCycles >= input.config.algorithm.maxJointRefinementCycles) {
    return finish(continuation, false)
  }
  return continuation
}

export function jointRefineV2(
  input: JointRefineInput,
  trace?: JointRefineTrace,
): JointRefineResult {
  return withResearchTracePhase(input.researchTrace, 'jointRefine', () => {
    const continuation = createJointRefineContinuationV2(input, trace)
    while (!continuation.done) advanceJointRefineContinuationV2(continuation)
    return {
      solution: continuation.solution,
      completedCycles: continuation.completedCycles,
      coordinateTrials: continuation.coordinateTrials,
      expired: continuation.expired,
    }
  })
}
