import type { Filter } from '../../types/filter.js'
import { generateV2Candidates, rankV2CandidateShortlist } from './candidates.js'
import type { StandardAutoEqV2Config } from './config.js'
import { evaluateV2Solution, jointRefineV2, type V2EvaluatedSolution } from './jointRefine.js'
import { compareV2Solutions, type V2Solution } from './ranking.js'
import type { StandardV2Deadline } from './runtime.js'

export interface SearchInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
  isTargetCapable?: (solution: V2Solution) => boolean
  onWorkingSolution?: (solution: V2Solution) => void
}

export interface SearchResult {
  bestSolution: V2EvaluatedSolution
  activeSolutions: V2EvaluatedSolution[]
  peakWorkingFilterCount: number
  termination: 'target-capable' | 'converged' | 'time-limit'
}

function violation(solution: V2Solution): number {
  return Math.max(solution.metrics.rmseDb / 0.25, solution.metrics.maxAbsDb / 0.75)
}

export function retainV2SearchPaths<T extends V2Solution>(
  paths: readonly T[],
  mainStagnant: boolean,
): T[] {
  const sorted = [...paths].sort(compareV2Solutions)
  if (sorted.length === 0) return []
  const bestViolation = violation(sorted[0]!)
  const ordinary = sorted.filter((path) => violation(path) <= bestViolation * 1.02)
  if (mainStagnant && ordinary.length < 3) {
    const escape = sorted.find((path) => !ordinary.includes(path))
    if (escape) ordinary.push(escape)
  }
  return ordinary.slice(0, 3)
}

function candidateFilter(
  candidate: ReturnType<typeof rankV2CandidateShortlist>[number],
  index: number,
): Filter {
  return {
    id: `working-${index + 1}`,
    enabled: true,
    type: candidate.type,
    frequencyHz: candidate.frequencyHz,
    gainDb: candidate.gainDb,
    q: candidate.q,
  }
}

export function searchStandardV2WorkingSolutions(input: SearchInput): SearchResult {
  const zero = evaluateV2Solution([], input.desiredDb, input.frequencies, input.config.sampleRateHz)
  if (input.deadline.isExpired()) {
    return {
      bestSolution: zero,
      activeSolutions: [zero],
      peakWorkingFilterCount: 0,
      termination: 'time-limit',
    }
  }

  let active = [zero]
  let best = zero
  let peakWorkingFilterCount = 0
  while (active.some((path) => path.filters.length < input.config.workingMaxFilters)) {
    const expanded: V2EvaluatedSolution[] = []
    let expired = false
    for (const path of active) {
      if (path.filters.length >= input.config.workingMaxFilters) continue
      const shortlist = rankV2CandidateShortlist(generateV2Candidates({
        frequencies: input.frequencies,
        residualDb: path.residualDb,
        config: input.config,
      }))
      for (const candidate of shortlist) {
        if (input.deadline.isExpired()) {
          expired = true
          break
        }
        const appended = evaluateV2Solution(
          [...path.filters, candidateFilter(candidate, path.filters.length)],
          input.desiredDb,
          input.frequencies,
          input.config.sampleRateHz,
        )
        const refined = jointRefineV2({
          solution: appended,
          desiredDb: input.desiredDb,
          frequencies: input.frequencies,
          config: input.config,
          deadline: input.deadline,
        })
        if (compareV2Solutions(refined.solution, path) < 0) {
          expanded.push(refined.solution)
          peakWorkingFilterCount = Math.max(
            peakWorkingFilterCount,
            refined.solution.filters.length,
          )
          input.onWorkingSolution?.(refined.solution)
          if (compareV2Solutions(refined.solution, best) < 0) best = refined.solution
          if (input.isTargetCapable?.(refined.solution)) {
            return {
              bestSolution: best,
              activeSolutions: [refined.solution],
              peakWorkingFilterCount,
              termination: refined.expired ? 'time-limit' : 'target-capable',
            }
          }
        }
        if (refined.expired) {
          expired = true
          break
        }
      }
      if (expired) break
    }
    if (expired) {
      return { bestSolution: best, activeSolutions: active, peakWorkingFilterCount, termination: 'time-limit' }
    }
    if (expanded.length === 0) {
      return { bestSolution: best, activeSolutions: active, peakWorkingFilterCount, termination: 'converged' }
    }
    active = retainV2SearchPaths(expanded, false)
  }
  return { bestSolution: best, activeSolutions: active, peakWorkingFilterCount, termination: 'converged' }
}
