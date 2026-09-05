import { calculateErrorMetrics } from '../../metrics/errorMetrics.js'
import type { Filter } from '../../types/filter.js'
import { auditCancellationsOnGrid } from '../cancellation.js'
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
  onBestWorkingSolution?: (solution: V2EvaluatedSolution) => void
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
    cancellationAudit: auditCancellationsOnGrid(filters, responseCache.responseGrid),
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
  let publishedBest = zero
  let peakWorkingFilterCount = 0
  let jointRefinementCount = 0
  const fullCycleCount = input.config.algorithm.maxJointRefinementCycles
  const fastCycleCount = Math.min(1, fullCycleCount)
  const continuationCycleCount = fullCycleCount - fastCycleCount
  const retainImprovement = (
    candidate: V2EvaluatedSolution,
    parent: V2EvaluatedSolution,
    pathIndex: number,
  ): boolean => {
    if (compareV2Solutions(candidate, parent) >= 0) return false
    if (candidate.filters.length > peakWorkingFilterCount) {
      peakWorkingFilterCount = candidate.filters.length
      input.researchTrace?.onPeakWorkingFilterCount?.(peakWorkingFilterCount)
    }
    if (compareV2Solutions(candidate, best) < 0) best = candidate
    return pathIndex === 0
  }
  const publishRetainedBest = (): void => {
    if (compareV2Solutions(best, publishedBest) >= 0) return
    publishedBest = best
    input.onBestWorkingSolution?.(best)
  }

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

      const fastStaged: V2EvaluatedSolution[] = []
      for (const appended of staged) {
        if (input.deadline.isExpired()) {
          publishRetainedBest()
          expired = true
          break
        }
        jointRefinementCount += 1
        const fast = jointRefineV2({
          solution: appended,
          desiredDb: input.desiredDb,
          frequencies: input.frequencies,
          config: input.config,
          deadline: input.deadline,
          maxCycles: fastCycleCount,
          researchTrace: input.researchTrace,
        })
        fastStaged.push(fast.solution)
        if (retainImprovement(fast.solution, path, pathIndex)) mainPathImproved = true
        if (fast.expired || input.deadline.isExpired()) {
          publishRetainedBest()
          expired = true
          break
        }
      }
      if (expired) break

      for (const fast of [...fastStaged].sort(compareV2Solutions).slice(0, 3)) {
        if (input.deadline.isExpired()) {
          publishRetainedBest()
          expired = true
          break
        }
        let refined = fast
        let refinementExpired = false
        if (continuationCycleCount > 0) {
          jointRefinementCount += 1
          const continued = jointRefineV2({
            solution: fast,
            desiredDb: input.desiredDb,
            frequencies: input.frequencies,
            config: input.config,
            deadline: input.deadline,
            maxCycles: continuationCycleCount,
            researchTrace: input.researchTrace,
          })
          refined = continued.solution
          refinementExpired = continued.expired
        }
        if (retainImprovement(refined, path, pathIndex)) mainPathImproved = true
        publishRetainedBest()
        if (compareV2Solutions(refined, path) < 0) {
          expanded.push(refined)
          stagedImproved = true
        }
        if (refinementExpired || input.deadline.isExpired()) {
          expired = true
          break
        }
      }
      if (expired) break

      if (!stagedImproved) {
        for (const appended of deferred) {
          if (input.deadline.isExpired()) {
            publishRetainedBest()
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
          if (retainImprovement(refined.solution, path, pathIndex)) mainPathImproved = true
          publishRetainedBest()
          if (compareV2Solutions(refined.solution, path) < 0) {
            expanded.push(refined.solution)
          }
          if (refined.expired || input.deadline.isExpired()) {
            expired = true
            break
          }
          if (compareV2Solutions(refined.solution, path) < 0) break
        }
      }
      if (expired) break
    }
    if (expired) {
      publishRetainedBest()
      return {
        bestSolution: best,
        activeSolutions: active,
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'time-limit',
      }
    }
    if (expanded.length === 0) {
      publishRetainedBest()
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
        publishRetainedBest()
        return {
          bestSolution: best,
          activeSolutions: active,
          peakWorkingFilterCount,
          jointRefinementCount,
          termination: 'time-limit',
        }
      }
      if (input.isTargetCapable?.(checkpoint)) {
        publishRetainedBest()
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
  publishRetainedBest()
  return {
    bestSolution: best,
    activeSolutions: active,
    peakWorkingFilterCount,
    jointRefinementCount,
    termination: 'converged',
  }
}
