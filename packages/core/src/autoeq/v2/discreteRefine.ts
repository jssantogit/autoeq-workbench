import type { BiquadResponseGrid } from '../../dsp/response.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellationsOnGrid } from '../cancellation.js'
import { POWERAMP_MANUAL_ENTRY_POLICY } from '../quantize.js'
import type { StandardAutoEqV2Config } from './config.js'
import { compareV2PrimaryMetrics, compareV2Solutions } from './ranking.js'
import { evaluateV2Solution, type V2EvaluatedSolution } from './jointRefine.js'
import {
  evaluateV2ReplacementTrial,
  materializeV2ReplacementTrial,
} from './replacementTrial.js'
import {
  withResearchTracePhase,
  type StandardV2ResearchTrace,
} from './researchTrace.js'
import type { StandardV2Deadline } from './runtime.js'

export interface DiscreteRefineV2Input {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
  responseGrid?: BiquadResponseGrid
  researchTrace?: StandardV2ResearchTrace
}

export interface DiscreteRefineV2Result {
  filters: Filter[]
  solution: V2EvaluatedSolution
  completedCycles: number
  expired: boolean
}

export interface AcceptedDiscreteMove {
  filterIndex: number
  coordinate: 'frequencyHz' | 'gainDb' | 'q'
  from: number
  to: number
}

export interface DiscreteTrial {
  filterIndex: number
  coordinate: 'frequencyHz' | 'gainDb' | 'q'
  from: number
  to: number
}

export interface DiscreteRefineTrace {
  onTrial?: (trial: DiscreteTrial) => void
  onAcceptedMove?: (move: AcceptedDiscreteMove) => void
  onResponseComputed?: (trial: DiscreteTrial) => void
  onCancellationAuditComputed?: () => void
}

function decimals(step: number): number {
  return String(step).split('.')[1]?.length ?? 0
}

function normalize(value: number, step: number): number {
  const normalized = Number(value.toFixed(decimals(step)))
  return Object.is(normalized, -0) ? 0 : normalized
}

function project(value: number, step: number, minimum: number, maximum: number): number | null {
  const minIndex = Math.ceil((minimum - 1e-10) / step)
  const maxIndex = Math.floor((maximum + 1e-10) / step)
  if (minIndex > maxIndex) return null
  return normalize(
    Math.min(maxIndex, Math.max(minIndex, Math.round(value / step))) * step,
    step,
  )
}

export function quantizeV2Filters(
  filters: readonly Filter[],
  config: StandardAutoEqV2Config,
): Filter[] {
  const result: Filter[] = []
  for (const filter of filters) {
    const frequencyHz = project(filter.frequencyHz, 1, config.minFrequencyHz, config.maxFrequencyHz)
    const gainDb = project(filter.gainDb, 0.1, config.minGainDb, config.maxGainDb)
    const q = filter.type === 'PK'
      ? project(filter.q, 0.01, config.minPkQ, config.maxPkQ)
      : 0.7
    if (frequencyHz !== null && gainDb !== null && q !== null) {
      result.push({ ...filter, frequencyHz, gainDb, q })
    }
  }
  return result
}

export function cyclicDiscreteRefineV2(
  input: DiscreteRefineV2Input,
  trace?: DiscreteRefineTrace,
): DiscreteRefineV2Result {
  return withResearchTracePhase(input.researchTrace, 'discreteRefine', () => {
  let solution = evaluateV2Solution(
    quantizeV2Filters(input.filters, input.config),
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
    input.responseGrid,
  )
  const responseBuffer = new Array<number>(input.frequencies.length)
  let completedCycles = 0
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
  const finish = (expired: boolean): DiscreteRefineV2Result => {
    solution = withCancellationAudit(solution)
    return { filters: solution.filters, solution, completedCycles, expired }
  }
  while (true) {
    if (input.deadline.isExpired()) {
      return finish(true)
    }
    const cycleStart = solution
    for (let filterIndex = 0; filterIndex < solution.filters.length; filterIndex += 1) {
      for (const [coordinate, step, minimum, maximum] of [
        ['frequencyHz', POWERAMP_MANUAL_ENTRY_POLICY.frequencyStepHz, input.config.minFrequencyHz, input.config.maxFrequencyHz],
        ['gainDb', POWERAMP_MANUAL_ENTRY_POLICY.gainStepDb, input.config.minGainDb, input.config.maxGainDb],
        ...(solution.filters[filterIndex]!.type === 'PK'
          ? [['q', POWERAMP_MANUAL_ENTRY_POLICY.qStep, input.config.minPkQ, input.config.maxPkQ]]
          : []),
      ] as Array<[keyof Pick<Filter, 'frequencyHz' | 'gainDb' | 'q'>, number, number, number]>) {
        let continueCoordinate = true
        let previous: { value: number; solution: V2EvaluatedSolution } | null = null
        while (continueCoordinate) {
          let best = solution
          const current = solution.filters[filterIndex]!
          for (const direction of [-1, 1]) {
            const value = project(current[coordinate] + direction * step, step, minimum, maximum)
            if (value === null || value === current[coordinate]) continue
            if (input.deadline.isExpired()) {
              return finish(true)
            }
            const trial: DiscreteTrial = {
              filterIndex,
              coordinate,
              from: current[coordinate],
              to: value,
            }
            input.researchTrace?.onDiscreteTrial?.()
            trace?.onTrial?.(trial)

            let candidate: V2EvaluatedSolution | null = null
            let replacementTrial: ReturnType<typeof evaluateV2ReplacementTrial> | null = null
            if (previous?.value === value) {
              candidate = previous.solution
            } else {
              trace?.onResponseComputed?.(trial)
              replacementTrial = evaluateV2ReplacementTrial(
                solution,
                filterIndex,
                { ...current, [coordinate]: value },
                input.desiredDb,
                input.frequencies,
                input.config.sampleRateHz,
                responseBuffer,
              )
            }
            if (input.deadline.isExpired()) {
              return finish(true)
            }

            const candidateMetrics = candidate?.metrics ?? replacementTrial!.metrics
            const primaryComparison = compareV2PrimaryMetrics(candidateMetrics, best.metrics)
            if (primaryComparison < 0) {
              best = candidate ?? materializeV2ReplacementTrial(
                solution,
                replacementTrial!,
                input.desiredDb,
                input.frequencies,
                input.config.sampleRateHz,
              )
            } else if (primaryComparison === 0) {
              candidate ??= materializeV2ReplacementTrial(
                solution,
                replacementTrial!,
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
          const accepted = best.filters[filterIndex]!
          if (accepted[coordinate] === current[coordinate]) break
          trace?.onAcceptedMove?.({
            filterIndex,
            coordinate,
            from: current[coordinate],
            to: accepted[coordinate],
          })
          input.researchTrace?.onDiscreteAcceptedMove?.()
          previous = { value: current[coordinate], solution }
          solution = best
          continueCoordinate = coordinate === 'frequencyHz'
          if (continueCoordinate && input.deadline.isExpired()) {
            return finish(true)
          }
        }
      }
    }
    completedCycles += 1
    if (solution === cycleStart) return finish(false)
    const primaryComparison = compareV2PrimaryMetrics(solution.metrics, cycleStart.metrics)
    if (primaryComparison > 0) return finish(false)
    if (primaryComparison === 0) {
      solution = withCancellationAudit(solution)
      if (compareV2Solutions(solution, withCancellationAudit(cycleStart)) >= 0) {
        return finish(false)
      }
    }
  }
  })
}
