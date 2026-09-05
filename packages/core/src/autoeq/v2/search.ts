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
import {
  calculateV2NormalizedViolation,
  compareV2Solutions,
  type V2Solution,
} from './ranking.js'
import { appendV2ResponseCacheFilter } from './responseCache.js'
import {
  createV2FilterKey,
  createV2SolutionKey,
  withResearchTracePhase,
  type StandardV2JointRefineContext,
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
  warmStarts?: ReadonlyMap<number, V2EvaluatedSolution>
}

export interface SearchResult {
  bestSolution: V2EvaluatedSolution
  activeSolutions: V2EvaluatedSolution[]
  peakWorkingFilterCount: number
  jointRefinementCount: number
  termination: 'target-capable' | 'converged' | 'time-limit'
}

function violation(solution: V2Solution): number {
  return calculateV2NormalizedViolation(solution.metrics)
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
  let peakWorkingFilterCount = 0
  let jointRefinementCount = 0
  let refinementSequence = 0
  const hasDetailedJointTrace = input.researchTrace?.onJointRefineTrace !== undefined
  const notifyActiveRetention = (
    refinements: readonly { solution: V2EvaluatedSolution; traceId: string }[],
    retainedSolutions: readonly V2EvaluatedSolution[],
  ): void => {
    if (!hasDetailedJointTrace) return
    const retained = new Set(retainedSolutions)
    for (const refinement of refinements) {
      input.researchTrace?.onJointRefineRetention?.({
        traceId: refinement.traceId,
        stage: 'active',
        retained: retained.has(refinement.solution),
      })
    }
  }
  while (active.some((path) => path.filters.length < input.config.workingMaxFilters)) {
    const expanded: V2EvaluatedSolution[] = []
    const refinedForRetention: Array<{
      solution: V2EvaluatedSolution
      traceId: string
    }> = []
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
      const appendedContexts = new WeakMap<V2EvaluatedSolution, StandardV2JointRefineContext>()
      for (const candidate of shortlist) {
        if (input.deadline.isExpired()) {
          expired = true
          break
        }
        const appended = appendCandidate(
          path,
          candidateFilter(candidate, path.filters.length),
          input,
        )
        appendedCandidates.push(appended)
        if (hasDetailedJointTrace) {
          const appendedFilter = appended.filters.at(-1)!
          appendedContexts.set(appended, {
            traceId: `search:${input.boundaryMode}:${++refinementSequence}`,
            origin: 'search',
            boundaryMode: input.boundaryMode,
            parentKey: createV2SolutionKey(path.filters),
            parentFilterCount: path.filters.length,
            parentMetrics: { ...path.metrics },
            candidateKey: createV2FilterKey(appendedFilter),
            candidate: {
              filter: { ...appendedFilter },
              featureIndex: candidate.featureIndex,
              boundaryMode: candidate.boundaryMode ?? null,
              qScale: candidate.qScale,
              cheapScore: candidate.cheapScore,
            },
            refinementKey: createV2SolutionKey(appended.filters),
          })
        }
      }
      if (expired) break

      const rankedAppended = [...appendedCandidates].sort(compareV2Solutions)
      const staged = retainV2SearchPaths(rankedAppended, false)
      if (hasDetailedJointTrace) {
        const stagedSet = new Set(staged)
        for (const appended of appendedCandidates) {
          const context = appendedContexts.get(appended)
          if (context !== undefined) {
            input.researchTrace?.onJointRefineRetention?.({
              traceId: context.traceId,
              stage: 'parent',
              retained: stagedSet.has(appended),
            })
          }
        }
      }
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
          const researchContext = appendedContexts.get(appended)
          const refined = jointRefineV2({
            solution: appended,
            desiredDb: input.desiredDb,
            frequencies: input.frequencies,
            config: input.config,
            deadline: input.deadline,
            researchTrace: input.researchTrace,
            researchContext,
          })
          if (researchContext !== undefined) {
            refinedForRetention.push({
              solution: refined.solution,
              traceId: researchContext.traceId,
            })
          }
          if (compareV2Solutions(refined.solution, path) < 0) {
            expanded.push(refined.solution)
            if (refined.solution.filters.length > peakWorkingFilterCount) {
              peakWorkingFilterCount = refined.solution.filters.length
              input.researchTrace?.onPeakWorkingFilterCount?.(peakWorkingFilterCount)
            }
            if (pathIndex === 0) mainPathImproved = true
            if (compareV2Solutions(refined.solution, best) < 0) {
              best = refined.solution
              input.onBestWorkingSolution?.(best)
            }
            if (phase === 'staged') stagedImproved = true
            else break
          }
          if (refined.expired || input.deadline.isExpired()) {
            expired = true
            break
          }
        }
        if (expired) break
      }
      if (expired) break
    }
    if (expired) {
      notifyActiveRetention(refinedForRetention, [])
      return {
        bestSolution: best,
        activeSolutions: active,
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'time-limit',
      }
    }
    if (expanded.length === 0) {
      notifyActiveRetention(refinedForRetention, [])
      return {
        bestSolution: best,
        activeSolutions: active,
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'converged',
      }
    }
    const warm = input.warmStarts?.get(expanded[0]!.filters.length)
    if (warm !== undefined && !input.deadline.isExpired()) {
      expanded.push(warm)
      if (compareV2Solutions(warm, best) < 0) {
        best = warm
        input.onBestWorkingSolution?.(best)
      }
    }
    active = retainV2NextActivePaths(active, expanded, mainPathImproved)
    notifyActiveRetention(refinedForRetention, active)
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
