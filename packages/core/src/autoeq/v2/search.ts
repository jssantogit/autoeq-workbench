import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellations } from '../cancellation.js'
import {
  generateV2Candidates,
  rankV2CandidateShortlist,
  type V2CandidateBoundaryMode,
} from './candidates.js'
import type { StandardAutoEqV2Config } from './config.js'
import { evaluateV2Solution, jointRefineV2, type V2EvaluatedSolution } from './jointRefine.js'
import { compareV2Solutions, type V2Solution } from './ranking.js'
import { appendV2ResponseCacheFilter } from './responseCache.js'
import {
  withResearchTracePhase,
  type StandardV2ResearchTrace,
} from './researchTrace.js'
import type { StandardV2Deadline } from './runtime.js'

export interface SearchInput {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: StandardAutoEqV2Config
  deadline: StandardV2Deadline
  boundaryMode: V2CandidateBoundaryMode
  isTargetCapable?: (solution: V2Solution) => boolean
  onWorkingSolution?: (solution: V2EvaluatedSolution) => void
  researchTrace?: StandardV2ResearchTrace
}

export interface SearchResult {
  bestSolution: V2EvaluatedSolution
  activeSolutions: V2EvaluatedSolution[]
  peakWorkingFilterCount: number
  jointRefinementCount: number
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

export function retainV2NextActivePaths<T extends V2Solution>(
  previousActive: readonly T[],
  expanded: readonly T[],
  mainPathImproved: boolean,
): T[] {
  const mainPath = previousActive[0]
  const mainStagnant = mainPath !== undefined && !mainPathImproved && violation(mainPath) > 1
  return retainV2SearchPaths(expanded, mainStagnant)
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

function appendCandidate(
  path: V2EvaluatedSolution,
  filter: Filter,
  input: SearchInput,
): V2EvaluatedSolution {
  const filters = [...path.filters, filter]
  const responseCache = appendV2ResponseCacheFilter(
    path.responseCache,
    filter,
    input.frequencies,
    input.config.sampleRateHz,
  )
  const residualDb = input.desiredDb.map((desired, index) =>
    desired - responseCache.cascadeDb[index]!)
  return {
    filters,
    responseCache,
    cascadeDb: responseCache.cascadeDb,
    residualDb,
    metrics: calculateErrorMetrics(residualDb, input.frequencies),
    cancellationAudit: auditCancellations(
      filters,
      input.frequencies,
      input.config.sampleRateHz,
    ),
  }
}

export function searchStandardV2WorkingSolutions(input: SearchInput): SearchResult {
  const zero = evaluateV2Solution([], input.desiredDb, input.frequencies, input.config.sampleRateHz)
  if (input.deadline.isExpired()) {
    return {
      bestSolution: zero,
      activeSolutions: [zero],
      peakWorkingFilterCount: 0,
      jointRefinementCount: 0,
      termination: 'time-limit',
    }
  }

  let active = [zero]
  let best = zero
  let peakWorkingFilterCount = 0
  let jointRefinementCount = 0
  while (active.some((path) => path.filters.length < input.config.workingMaxFilters)) {
    const expanded: V2EvaluatedSolution[] = []
    let mainPathImproved = false
    let expired = false
    for (let pathIndex = 0; pathIndex < active.length; pathIndex += 1) {
      const path = active[pathIndex]!
      if (path.filters.length >= input.config.workingMaxFilters) continue
      const shortlist = withResearchTracePhase(
        input.researchTrace,
        'candidateScoring',
        () => rankV2CandidateShortlist(generateV2Candidates({
          frequencies: input.frequencies,
          residualDb: path.residualDb,
          config: input.config,
          boundaryMode: input.boundaryMode,
          researchTrace: input.researchTrace,
        }), input.researchTrace),
      )
      const appendedCandidates: V2EvaluatedSolution[] = []
      for (const candidate of shortlist) {
        if (input.deadline.isExpired()) {
          expired = true
          break
        }
        appendedCandidates.push(appendCandidate(
          path,
          candidateFilter(candidate, path.filters.length),
          input,
        ))
      }
      if (expired) break

      const rankedAppended = [...appendedCandidates].sort(compareV2Solutions)
      const staged = retainV2SearchPaths(rankedAppended, false)
      const stagedSet = new Set(staged)
      const deferred = rankedAppended.filter((candidate) => !stagedSet.has(candidate))
      let stagedImproved = false
      for (const phase of ['staged', 'fallback'] as const) {
        if (phase === 'fallback' && stagedImproved) break
        const candidates = phase === 'staged' ? staged : deferred
        for (const appended of candidates) {
          if (input.deadline.isExpired()) {
            expired = true
            break
          }
          jointRefinementCount += 1
          const refined = jointRefineV2({
            solution: appended,
            desiredDb: input.desiredDb,
            frequencies: input.frequencies,
            config: input.config,
            deadline: input.deadline,
            researchTrace: input.researchTrace,
          })
          if (refined.expired) {
            expired = true
            break
          }
          if (compareV2Solutions(refined.solution, path) < 0) {
            expanded.push(refined.solution)
            if (refined.solution.filters.length > peakWorkingFilterCount) {
              peakWorkingFilterCount = refined.solution.filters.length
              input.researchTrace?.onPeakWorkingFilterCount?.(peakWorkingFilterCount)
            }
            if (pathIndex === 0) mainPathImproved = true
            if (compareV2Solutions(refined.solution, best) < 0) best = refined.solution
            if (phase === 'staged') stagedImproved = true
            else break
          }
        }
        if (expired) break
      }
      if (expired) break
    }
    if (expired) {
      return {
        bestSolution: best,
        activeSolutions: active,
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'time-limit',
      }
    }
    if (expanded.length === 0) {
      return {
        bestSolution: best,
        activeSolutions: active,
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'converged',
      }
    }
    active = retainV2NextActivePaths(active, expanded, mainPathImproved)
    for (const checkpoint of active) {
      input.researchTrace?.onWorkingCheckpoint?.()
      input.onWorkingSolution?.(checkpoint)
      if (input.deadline.isExpired()) {
        return {
          bestSolution: best,
          activeSolutions: active,
          peakWorkingFilterCount,
          jointRefinementCount,
          termination: 'time-limit',
        }
      }
      if (input.isTargetCapable?.(checkpoint)) {
        return {
          bestSolution: best,
          activeSolutions: [checkpoint],
          peakWorkingFilterCount,
          jointRefinementCount,
          termination: 'target-capable',
        }
      }
    }
  }
  return {
    bestSolution: best,
    activeSolutions: active,
    peakWorkingFilterCount,
    jointRefinementCount,
    termination: 'converged',
  }
}
