import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import type { BiquadResponseGrid } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellationsOnGrid } from '../cancellation.js'
import type { StandardAutoEqV2Config } from './config.js'
import { compareV2PrimaryMetrics, compareV2Solutions, type V2Solution } from './ranking.js'
import {
  createV2ResponseCache,
  type V2ResponseCache,
} from './responseCache.js'
import {
  evaluateV2ReplacementTrialTrusted,
  materializeV2ReplacementTrial,
} from './replacementTrial.js'
import {
  withResearchTracePhase,
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

export function jointRefineV2(
  input: JointRefineInput,
  trace?: JointRefineTrace,
): JointRefineResult {
  return withResearchTracePhase(input.researchTrace, 'jointRefine', () => {
  let solution = 'responseCache' in input.solution
    ? input.solution as V2EvaluatedSolution
    : evaluateV2Solution(
        input.solution.filters,
        input.desiredDb,
        input.frequencies,
        input.config.sampleRateHz,
      )
  const responseBuffer = new Array<number>(input.frequencies.length)
  const validAudits = new WeakSet<V2EvaluatedSolution>([solution])
  const withCancellationAudit = (candidate: V2EvaluatedSolution): V2EvaluatedSolution => {
    if (validAudits.has(candidate)) return candidate
    trace?.onCancellationAuditComputed?.()
    const audited = {
      ...candidate,
      cancellationAudit: auditCancellationsOnGrid(
        candidate.filters,
        candidate.responseCache.responseGrid,
      ),
    }
    validAudits.add(audited)
    return audited
  }
  const finish = (expired: boolean): JointRefineResult => {
    solution = withCancellationAudit(solution)
    input.researchTrace?.onJointRefineCompleted?.(coordinateTrials)
    return { solution, completedCycles, coordinateTrials, expired }
  }
  let completedCycles = 0
  let coordinateTrials = 0

  for (let cycle = 0; cycle < input.config.algorithm.maxJointRefinementCycles; cycle += 1) {
    if (input.deadline.isExpired()) {
      return finish(true)
    }
    const cycleStart = solution
    for (const scale of JOINT_REFINEMENT_SCALES) {
      for (let filterIndex = 0; filterIndex < solution.filters.length; filterIndex += 1) {
        const startingFilter = solution.filters[filterIndex]!
        const coordinates: Array<'frequencyHz' | 'gainDb' | 'q'> = ['frequencyHz', 'gainDb']
        if (startingFilter.type === 'PK') {
          coordinates.push('q')
        }

        for (const coordinate of coordinates) {
          const currentFilter = solution.filters[filterIndex]!
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
          let best = solution
          for (const replacement of trials) {
            if (input.deadline.isExpired()) {
              return finish(true)
            }
            coordinateTrials += 1
            const trial = evaluateV2ReplacementTrialTrusted(
              solution,
              filterIndex,
              replacement,
              input.desiredDb,
              input.frequencies,
              input.config.sampleRateHz,
              responseBuffer,
            )
            if (input.deadline.isExpired()) {
              return finish(true)
            }
            const primaryComparison = compareV2PrimaryMetrics(trial.metrics, best.metrics)
            if (primaryComparison < 0) {
              best = materializeV2ReplacementTrial(
                solution,
                trial,
                input.desiredDb,
                input.frequencies,
                input.config.sampleRateHz,
              )
            } else if (primaryComparison === 0) {
              const candidate = materializeV2ReplacementTrial(
                solution,
                trial,
                input.desiredDb,
                input.frequencies,
                input.config.sampleRateHz,
              )
              const auditedCandidate = withCancellationAudit(candidate)
              const auditedBest = withCancellationAudit(best)
              best = compareV2Solutions(auditedCandidate, auditedBest) < 0
                ? auditedCandidate
                : auditedBest
            }
          }
          solution = best
        }
      }
    }
    completedCycles += 1
    const primaryComparison = compareV2PrimaryMetrics(solution.metrics, cycleStart.metrics)
    if (primaryComparison > 0) break
    if (primaryComparison === 0) {
      solution = withCancellationAudit(solution)
      if (compareV2Solutions(solution, withCancellationAudit(cycleStart)) >= 0) break
    }
  }
  return finish(false)
  })
}
