import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  desiredCorrection,
  evaluateV2Solution,
  generateV2Candidates,
  prepareCurve,
  rankV2CandidateShortlist,
  retainV2SearchPaths,
  searchStandardV2WorkingSolutions,
  resolveStandardAutoEqV2Config,
  type ErrorMetrics,
  type Curve,
  type Filter,
  type Normalization,
  type SearchResult,
  type StandardAutoEqV2Config,
  type V2EvaluatedSolution,
  type V2Solution,
} from '../../../src/index.js'
import { retainV2NextActivePaths } from '../../../src/autoeq/v2/search.js'

function solution(violation: number): V2Solution {
  const metrics: ErrorMetrics = {
    maeDb: violation * 0.25,
    rmseDb: violation * 0.25,
    maxAbsDb: violation * 0.75,
    maxAbsFrequencyHz: 1_000,
  }
  return { filters: [], metrics, cancellationAudit: { pairs: [], totalScore: 0 } }
}

function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

describe('Standard v2 bounded search', () => {
  it('admits a prior geometry checkpoint only at its matching depth', () => {
    const frequencies = createEvaluationGrid()
    const desired = [pk('seed', 1000, 4, 2)]
    const desiredDb = evaluateV2Solution(desired, [], frequencies, 48000).cascadeDb
    const seed = evaluateV2Solution(desired, desiredDb, frequencies, 48000)
    const seen: number[] = []
    const result = searchStandardV2WorkingSolutions({
      desiredDb, frequencies,
      config: { ...resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS), workingMaxFilters: 2 },
      deadline: { isExpired: () => false }, boundaryMode: 'half-height',
      warmStarts: new Map([[1, seed]]),
      onWorkingSolution: (path) => { seen.push(path.filters.length) },
      isTargetCapable: (path) => path.metrics.rmseDb === 0,
    })
    expect(result.bestSolution.metrics.rmseDb).toBe(0)
    expect(result.activeSolutions).toContain(seed)
    expect(seen).toEqual([1])
  })

  it('falls back when staged candidates cannot improve their parent', () => {
    const frequencies = createEvaluationGrid()
    const desiredFilters = [
      pk('a', 2_200, 3, 2.4),
      pk('b', 3_300, -3.8, 3),
      pk('c', 4_800, 3.4, 3.8),
      pk('d', 7_100, -2.8, 3.2),
    ]
    const responseDb = evaluateV2Solution(
      desiredFilters,
      [],
      frequencies,
      48_000,
    ).cascadeDb
    const curve = (kind: Curve['kind'], db: readonly number[]): Curve => ({
      id: kind,
      name: kind,
      kind,
      rawPoints: frequencies.map((frequencyHz, index) => ({
        frequencyHz,
        db: db[index]!,
      })),
      metadata: { synthetic: true },
    })
    const normalization: Normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 }
    const source = prepareCurve(
      curve('fr', responseDb.map((value) => -value)),
      normalization,
      frequencies,
    )
    const target = prepareCurve(
      curve('target', frequencies.map(() => 0)),
      normalization,
      frequencies,
    )
    const desiredDb = desiredCorrection(source.db, target.db)
    const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
    const result = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config: { ...config, workingMaxFilters: 5 },
      deadline: { isExpired: () => false },
      boundaryMode: 'sign-crossing',
    })

    expect(result.bestSolution.filters.length).toBeGreaterThan(4)
  }, 20_000)

  it('joint-refines at most three exact appended candidates for one active parent', () => {
    const frequencies = createEvaluationGrid()
    const desiredFilters = [
      pk('a', 90, 2, 1.2),
      pk('b', 220, -2.4, 1.5),
      pk('c', 520, 2.8, 1.8),
      pk('d', 1_200, -3, 2),
      pk('e', 2_600, 3.2, 2.4),
      pk('f', 5_200, -3, 2.8),
      pk('g', 9_000, 2.5, 3),
      pk('h', 15_000, -2, 2.5),
    ]
    const desiredDb = evaluateV2Solution(
      desiredFilters,
      [],
      frequencies,
      48_000,
    ).cascadeDb
    const config = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: 1,
    })
    const shortlist = rankV2CandidateShortlist(generateV2Candidates({
      frequencies,
      residualDb: desiredDb,
      config,
      boundaryMode: 'sign-crossing',
    }))
    const responseGrids = new Set<unknown>()
    const checkpoints: V2EvaluatedSolution[] = []

    expect(shortlist).toHaveLength(8)

    const result = searchStandardV2WorkingSolutions({
      desiredDb,
      frequencies,
      config: {
        ...config,
        workingMaxFilters: 1,
        algorithm: { ...config.algorithm, maxJointRefinementCycles: 1 },
      } as unknown as StandardAutoEqV2Config,
      deadline: { isExpired: () => false },
      boundaryMode: 'sign-crossing',
      onWorkingSolution: (working) => {
        checkpoints.push(working)
        responseGrids.add(working.responseCache.responseGrid)
      },
    }) as SearchResult & { jointRefinementCount?: number }

    expect(result.jointRefinementCount).toBeGreaterThan(0)
    expect(result.jointRefinementCount).toBeLessThanOrEqual(3)
    expect(result.activeSolutions.length).toBeGreaterThan(0)
    expect(result.activeSolutions.length).toBeLessThanOrEqual(3)
    expect(checkpoints).toEqual(result.activeSolutions)
    expect(responseGrids.size).toBe(1)
  })

  it('retains ordinary alternatives through 1.02 and caps paths at three', () => {
    const retained = retainV2SearchPaths(
      [solution(1), solution(1.01), solution(1.019), solution(1.021)],
      false,
    )
    expect(retained).toHaveLength(3)
    expect(retained.map((entry) => entry.metrics.rmseDb / 0.25)).toEqual([1, 1.01, 1.019])
  })

  it('allows one deterministic escape outside 1.02 only for stagnation', () => {
    expect(retainV2SearchPaths([solution(1), solution(1.03), solution(1.04)], false)).toHaveLength(1)
    expect(retainV2SearchPaths([solution(1), solution(1.03), solution(1.04)], true))
      .toHaveLength(2)
  })

  it('wires main-path stagnation into global next-path retention', () => {
    const expanded = [solution(1), solution(1.03), solution(1.04)]

    const stagnant = retainV2NextActivePaths([solution(1.2)], expanded, false)
    expect(stagnant.map((entry) => entry.metrics.rmseDb / 0.25)).toEqual([1, 1.03])

    const improved = retainV2NextActivePaths([solution(1.2)], expanded, true)
    expect(improved.map((entry) => entry.metrics.rmseDb / 0.25)).toEqual([1])

    const alreadyInsideEnvelope = retainV2NextActivePaths([solution(0.9)], expanded, false)
    expect(alreadyInsideEnvelope.map((entry) => entry.metrics.rmseDb / 0.25)).toEqual([1])
  })

  it('returns a bounded zero-filter solution without starting work at an expired deadline', () => {
    const frequencies = [100, 1_000, 10_000]
    const result = searchStandardV2WorkingSolutions({
      desiredDb: [2, -2, 1],
      frequencies,
      config: resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS),
      deadline: { isExpired: () => true },
      boundaryMode: 'sign-crossing',
    })

    expect(result.bestSolution.filters).toEqual([])
    expect(result.peakWorkingFilterCount).toBe(0)
    expect(result.termination).toBe('time-limit')
  })
})
