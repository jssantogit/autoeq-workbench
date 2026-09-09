import { describe, expect, it } from 'vitest'

import {
  advanceMatchingPursuitContinuation,
  buildDictionary,
  createMatchingPursuitContinuation,
  matchingPursuitContinuationResult,
  runMatchingPursuit,
  solveBoundedCoordinateGains,
  type MatchingPursuitProblem,
} from '../../../../benchmarks/research/matchingPursuit.js'

const problem: MatchingPursuitProblem = {
  problemId: 'synthetic-matching-pursuit',
  inputSha256: 'a'.repeat(64),
  frequenciesHz: [20, 100, 1_000, 10_000],
  desiredDb: [0, 1, -1, 0.5],
  sampleRateHz: 48_000,
  bounds: {
    minFrequencyHz: 20,
    maxFrequencyHz: 20_000,
    minGainDb: -15,
    maxGainDb: 15,
    minPkQ: 0.1,
    maxPkQ: 12,
    shelfQ: 0.7,
    maxFilters: 10,
  },
}

describe('TypeScript matching pursuit research component', () => {
  it('keeps the approved dictionary order and atom geometry', () => {
    const atoms = buildDictionary(problem, {
      frequenciesPerOctave: 24,
      pkQValues: [0.35, 0.5, 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8],
      includeShelves: true,
    })

    expect(atoms).toHaveLength(2_880)
    expect(atoms[0]).toMatchObject({
      atomId: 'dict-pk-0000-00',
      type: 'PK',
      frequencyHz: 20,
      q: 0.35,
    })
    expect(atoms[9]).toMatchObject({ atomId: 'dict-pk-0000-09', q: 8 })
    expect(atoms[10]).toMatchObject({ atomId: 'dict-ls-0000', type: 'LS', frequencyHz: 20, q: 0.7 })
    expect(atoms[11]).toMatchObject({ atomId: 'dict-hs-0000', type: 'HS', frequencyHz: 20, q: 0.7 })
  })

  it('solves bounded gains with deterministic projected coordinate least squares', () => {
    const columns = [
      [1, 0, 0],
      [0, 1, 0],
    ]

    expect(solveBoundedCoordinateGains(columns, [2, -2, 0.5], -1, 1))
      .toEqual([1, -1])
  })

  it('continues with deterministic residual substitutions after the greedy pass', () => {
    const result = runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 30,
      checkpointEveryEvaluations: 1,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        const metric = 10 - candidate.filters.length
        return {
          protocolVersion: 1,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    })

    expect(result.metadata.replacementCandidates).toBeGreaterThan(0)
    expect(result.metadata.searchPasses).toBeGreaterThan(1)
    expect(result.candidates.map((candidate) => candidate.filters.map((filter) => filter.id).join(',')))
      .toEqual([...new Set(result.candidates.map((candidate) => candidate.filters.map((filter) => filter.id).join(',')))])
    expect(result.stopReason).toMatch(/evaluation-budget|search-space-exhausted-under-current-mechanism/)
    expect(result.telemetry.filter((point) => point.selectedChange && point.phase !== 'baseline')
      .every((point) => (point.candidateEvaluationsSinceUsefulImprovement ?? 0) > 0))
      .toBe(true)
  })

  it('rebases a canonical selected replacement and reaches descendant depth two or greater', () => {
    let evaluations = 0
    const result = runMatchingPursuit({
      problem: {
        ...problem,
        bounds: { ...problem.bounds, maxFilters: 2 },
      },
      seed: 0,
      evaluationBudget: 40,
      checkpointEveryEvaluations: 1,
      traversalPolicy: 'immediate-canonical-rebase-v1',
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        evaluations += 1
        const metric = candidate.filters.length === 0 ? 10 : 10 - evaluations
        return {
          protocolVersion: 1,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    })

    expect(result.metadata.traversalPolicy).toBe('immediate-canonical-rebase-v1')
    expect(result.metadata.maxSearchDepth).toBeGreaterThanOrEqual(2)
    expect(result.metadata.rebaseTransitions).toBeGreaterThan(0)
    expect(result.telemetry.some((point) => point.selectionDepth >= 2)).toBe(true)
    expect(result.telemetry.filter((point) => point.phase === 'replacement')
      .every((point) => point.parentSelectionKey !== null &&
        point.lineageSelectionKeys.length >= point.selectionDepth + 1 &&
        point.lineageSelectionKeys.at(-1) === point.selectionKey))
      .toBe(true)
  })

  it('keeps replacement selections globally visited while rebasing', () => {
    let evaluations = 0
    const result = runMatchingPursuit({
      problem: {
        ...problem,
        bounds: { ...problem.bounds, maxFilters: 2 },
      },
      seed: 0,
      evaluationBudget: 40,
      checkpointEveryEvaluations: 1,
      traversalPolicy: 'immediate-canonical-rebase-v1',
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        evaluations += 1
        const metric = candidate.filters.length === 0 ? 10 : 10 - evaluations
        return {
          protocolVersion: 1,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    })

    const selectionKeys = result.telemetry.map((point) => point.selectionKey)
    expect(new Set(selectionKeys).size).toBe(selectionKeys.length)
    expect(result.metadata.visitedSelections).toBe(selectionKeys.length)
  })

  it('retains a Pareto-first width-two selection beam with deterministic transitions', () => {
    let evaluations = 0
    const result = runMatchingPursuit({
      problem: { ...problem, bounds: { ...problem.bounds, maxFilters: 2 } },
      seed: 0,
      evaluationBudget: 40,
      checkpointEveryEvaluations: 1,
      traversalPolicy: 'selection-beam-width-2-v1',
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        evaluations += 1
        const value = candidate.filters.length === 0 ? 10 : 10 - evaluations
        return {
          protocolVersion: 1 as const,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: value, maxAbsDb: value, bandRmseDb: {} },
          deliverable: { filters: candidate.filters.map((filter) => ({ ...filter })), rmseDb: value, maxAbsDb: value, bandRmseDb: {}, cancellationTotalScore: 0 },
        }
      },
    })

    expect(result.metadata.traversalPolicy).toBe('selection-beam-width-2-v1')
    expect(result.metadata.beamTransitions).toBeGreaterThan(0)
    expect(result.metadata.maxSearchDepth).toBeGreaterThanOrEqual(2)
    expect(result.telemetry.filter((point) => point.phase === 'replacement').some((point) => point.selectionDepth >= 2)).toBe(true)
  })

  it('accounts for every evaluated selection from bounded solve through canonical selection', () => {
    const result = runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 12,
      checkpointEveryEvaluations: 1,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => ({
        protocolVersion: 1,
        candidateId: candidate.candidateId,
        valid: true,
        rejectionReason: null,
        continuous: { rmseDb: 1, maxAbsDb: 2, bandRmseDb: {} },
        deliverable: {
          filters: candidate.filters.map((filter) => ({ ...filter })),
          rmseDb: 1,
          maxAbsDb: 2,
          bandRmseDb: {},
          cancellationTotalScore: 0,
        },
      }),
    })

    expect(result.telemetry).toHaveLength(result.candidates.length)
    expect(result.diagnostics.evaluatedCandidates).toBe(result.candidates.length)
    expect(result.diagnostics.uniqueSelections).toBe(result.candidates.length)
    expect(result.diagnostics.paretoNovelCandidates + result.diagnostics.dominatedCandidates +
      result.diagnostics.equivalentMetricCandidates)
      .toBe(result.candidates.length)
    expect(result.diagnostics.selectedChanges).toBe(result.trajectory.length)
    expect(result.diagnostics.attemptedReplacements).toBe(result.metadata.replacementCandidates)
    expect(result.diagnostics.acceptedReplacements).toBeLessThanOrEqual(result.diagnostics.attemptedReplacements)
    expect(result.diagnostics.atomsRemoved).toBe(result.diagnostics.attemptedReplacements)
    expect(result.diagnostics.atomsAdded).toBeGreaterThanOrEqual(result.diagnostics.attemptedReplacements)
    expect(result.telemetry.every((point) =>
      Number.isFinite(point.preQuantizationRmseDb) &&
      Number.isFinite(point.preQuantizationMaxAbsDb) &&
      Number.isFinite(point.postQuantizationRmseDb) &&
      Number.isFinite(point.postQuantizationMaxAbsDb) &&
      Number.isFinite(point.preSolveLinearResidualRmseDb) &&
      Number.isFinite(point.postSolveLinearResidualRmseDb) &&
      Number.isFinite(point.continuousRmseImprovementVsBaselineDb) &&
      point.residualReductionRmseDb === point.continuousRmseImprovementVsBaselineDb))
      .toBe(true)
    expect(result.telemetry.every((point) =>
      point.preSolveGainVector.every((gain) => gain === 0) &&
      point.boundedGainVector.every((gain) => Number.isFinite(gain) && gain >= -15 && gain <= 15)))
      .toBe(true)
  })

  it('keeps a synchronous candidate completed after the deadline out of the admissible trajectory', () => {
    let clockMs = 0
    let workUnits = 0
    const result = runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 3,
      checkpointEveryEvaluations: 1,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      nowMs: () => clockMs,
      isExpired: () => clockMs >= 60_000,
      onWorkUnitStart: () => {
        workUnits += 1
        if (workUnits === 3) clockMs = 59_000
      },
      evaluate: (candidate) => {
        if (candidate.filters.length > 0) clockMs = 62_000
        const metric = candidate.filters.length > 0 ? 0.5 : 1
        return {
          protocolVersion: 1,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    })

    expect(result.stopReason).toBe('deadline')
    expect(result.trajectory).toHaveLength(1)
    expect(result.telemetry.at(-1)).toMatchObject({
      observedCompletionElapsedMs: 62_000,
      admissibleForTrajectory: false,
      selectedChange: false,
    })
  })

  it('interleaves residual-ranked replacements across removable atoms at a bounded budget', () => {
    const result = runMatchingPursuit({
      problem,
      seed: 0,
      evaluationBudget: 16,
      checkpointEveryEvaluations: 1,
      replacementOrdering: 'residual-ranked-drop-round-robin-v1',
      dictionary: { frequenciesPerOctave: 2, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate) => {
        const metric = 10 - candidate.filters.length
        return {
          protocolVersion: 1,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    })

    const removed = new Set(result.telemetry
      .filter((point) => point.phase === 'replacement')
      .flatMap((point) => point.removedAtomIds))
    expect(removed.size).toBeGreaterThan(1)
    expect(result.metadata.replacementRankingScoreComputations).toBeGreaterThan(0)
  })

  it('resumes with the same candidate sequence and result as one continuous advance', () => {
    const input = {
      problem,
      seed: 0,
      evaluationBudget: 30,
      checkpointEveryEvaluations: 1,
      replacementOrdering: 'dictionary-drop-round-robin-v1' as const,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      evaluate: (candidate: Parameters<NonNullable<Parameters<typeof runMatchingPursuit>[0]['evaluate']>>[0]) => {
        const metric = 10 - candidate.filters.length
        return {
          protocolVersion: 1 as const,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    }
    const continuous = runMatchingPursuit(input)
    const resumed = createMatchingPursuitContinuation(input)
    advanceMatchingPursuitContinuation(resumed, 5)
    expect(resumed.done).toBe(false)
    advanceMatchingPursuitContinuation(resumed, 100)
    const resumedResult = matchingPursuitContinuationResult(resumed)
    const emittedAtCompletion = resumed.emittedCandidates
    advanceMatchingPursuitContinuation(resumed, 1)

    expect(resumedResult.candidates).toEqual(continuous.candidates)
    expect(resumedResult.trajectory).toEqual(continuous.trajectory)
    expect(resumedResult.diagnostics).toEqual(continuous.diagnostics)
    expect(resumed.emittedCandidates).toBe(emittedAtCompletion)
  })

  it('cancels between continuation slices without evaluating another candidate', () => {
    let cancelled = false
    const continuation = createMatchingPursuitContinuation({
      problem,
      seed: 0,
      evaluationBudget: 30,
      checkpointEveryEvaluations: 1,
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      isCancelled: () => cancelled,
      evaluate: (candidate) => ({
        protocolVersion: 1,
        candidateId: candidate.candidateId,
        valid: true,
        rejectionReason: null,
        continuous: { rmseDb: 1, maxAbsDb: 1, bandRmseDb: {} },
        deliverable: {
          filters: candidate.filters,
          rmseDb: 1,
          maxAbsDb: 1,
          bandRmseDb: {},
          cancellationTotalScore: 0,
        },
      }),
    })
    advanceMatchingPursuitContinuation(continuation, 3)
    const emittedBeforeCancel = continuation.emittedCandidates
    cancelled = true
    advanceMatchingPursuitContinuation(continuation, 3)

    expect(continuation.done).toBe(true)
    expect(continuation.emittedCandidates).toBe(emittedBeforeCancel)
    expect(matchingPursuitContinuationResult(continuation).stopReason).toBe('cancelled')
  })
})
