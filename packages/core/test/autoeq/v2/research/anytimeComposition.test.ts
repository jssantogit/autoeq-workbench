import { describe, expect, it } from 'vitest'

import { runAnytimeFeedbackSchedule } from '../../../../benchmarks/research/anytimeComposition.js'
import {
  advanceMatchingPursuitContinuation,
  createMatchingPursuitContinuation,
  type MatchingPursuitProblem,
} from '../../../../benchmarks/research/matchingPursuit.js'
import { runStructuralBeam } from '../../../../benchmarks/research/structuralBeam.js'
import type { Filter } from '../../../../src/types/filter.js'

const problem: MatchingPursuitProblem & { desiredDb: number[] } = {
  problemId: 'synthetic-anytime',
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

describe('capacity-aware anytime feedback schedule', () => {
  it('hands real novel MP states to structural search once and resumes MP deterministically', () => {
    const queue: { id: string; filters: Filter[] }[] = []
    const processed: string[] = []
    const continuation = createMatchingPursuitContinuation({
      problem,
      seed: 0,
      evaluationBudget: 18,
      checkpointEveryEvaluations: 1,
      replacementOrdering: 'dictionary-drop-round-robin-v1',
      dictionary: { frequenciesPerOctave: 1, pkQValues: [1], includeShelves: false },
      referenceSnapshotSha256: 'd'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
      onTelemetry: (point, filters) => {
        if (point.paretoNovel && point.phase !== 'baseline') queue.push({
          id: point.candidateId,
          filters: filters.map((filter) => ({ ...filter })),
        })
      },
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

    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => continuation.done,
      advanceMpSlice: () => {
        const before = continuation.emittedCandidates
        advanceMatchingPursuitContinuation(continuation, 3)
        return continuation.emittedCandidates - before
      },
      takeFeedback: () => queue.shift(),
      processFeedback: (seed) => {
        processed.push(seed.id)
        const structural = runStructuralBeam({
          problem,
          seed: 0,
          evaluationBudget: 2,
          referenceSnapshotSha256: 'd'.repeat(64),
          referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 10 }],
          config: { beamWidth: 1, proposalsPerParent: 1, localPolishEvaluations: 0, maxFilters: 10 },
          seeds: [{ seedId: seed.id, origin: 'matching-pursuit', filters: seed.filters }],
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
        return structural.candidates.length
      },
    })

    expect(continuation.done).toBe(true)
    expect(processed.length).toBeGreaterThan(0)
    expect(new Set(processed).size).toBe(processed.length)
    expect(result.mpSlices).toBeGreaterThan(1)
    expect(result.feedbackSeedsConsumed).toBe(processed.length)
    expect(result.stopReason).toBe('exhausted')
  })

  it('stops after one empty round without a busy loop', () => {
    let mpCalls = 0
    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => true,
      advanceMpSlice: () => {
        mpCalls += 1
        return 0
      },
      takeFeedback: () => undefined,
      processFeedback: () => 0,
    })

    expect(mpCalls).toBe(0)
    expect(result).toMatchObject({ rounds: 1, workUnits: 0, stopReason: 'exhausted' })
  })

  it('continues past a zero-work duplicate feedback item to the next useful seed', () => {
    const queue = ['duplicate', 'useful']
    const processed: string[] = []
    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => true,
      advanceMpSlice: () => 0,
      takeFeedback: () => queue.shift(),
      processFeedback: (seed) => {
        processed.push(seed)
        return seed === 'useful' ? 2 : 0
      },
    })

    expect(processed).toEqual(['duplicate', 'useful'])
    expect(result).toMatchObject({ feedbackSeedsConsumed: 2, workUnits: 2, stopReason: 'exhausted' })
  })

  it('separates observed structural evaluations from nominal budget and polish work', () => {
    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => true,
      advanceMpSlice: () => 0,
      takeFeedback: (() => { let available = true; return () => available ? (available = false, 'seed') : undefined })(),
      processFeedback: () => ({
        workUnits: 3,
        structuralCandidateEvaluations: 2,
        configuredStructuralBudget: 12,
        configuredPolishAllowance: 24,
        descendantsProduced: 1,
        seedImprovements: 1,
        globalSelectedBestImprovements: 1,
        referenceImprovements: 0,
      }),
    })
    expect(result).toMatchObject({
      feedbackSeedsConsumed: 1,
      workUnits: 3,
      structuralCandidateEvaluations: 2,
      configuredStructuralBudget: 12,
      configuredPolishAllowance: 24,
      usefulHandoffs: 1,
      descendantsProduced: 1,
      seedImprovements: 1,
    })
  })

  it('does not count a local best without a seed-improving descendant as a useful handoff', () => {
    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => true,
      advanceMpSlice: () => 0,
      takeFeedback: (() => { let available = true; return () => available ? (available = false, 'seed') : undefined })(),
      processFeedback: () => ({
        workUnits: 2,
        structuralCandidateEvaluations: 2,
        configuredStructuralBudget: 12,
        configuredPolishAllowance: 24,
        descendantsProduced: 1,
        seedImprovements: 0,
        globalSelectedBestImprovements: 0,
        referenceImprovements: 0,
      }),
    })

    expect(result).toMatchObject({
      feedbackSeedsConsumed: 1,
      structuralCandidateEvaluations: 2,
      usefulHandoffs: 0,
      seedImprovements: 0,
      descendantsProduced: 1,
    })
  })

  it('keeps unmeasured polish work null and distinguishes consumed feedback from executed structural handoffs', () => {
    const queue = ['unexecutable', 'executed']
    const result = runAnytimeFeedbackSchedule({
      isExpired: () => false,
      mpDone: () => true,
      advanceMpSlice: () => 0,
      takeFeedback: () => queue.shift(),
      processFeedback: (seed) => seed === 'unexecutable'
        ? {
            workUnits: 0,
            structuralCandidateEvaluations: 0,
            configuredStructuralBudget: 0,
            configuredPolishAllowance: 0,
            descendantsProduced: 0,
            seedImprovements: 0,
            globalSelectedBestImprovements: 0,
            referenceImprovements: 0,
          }
        : {
            workUnits: 2,
            structuralCandidateEvaluations: 2,
            configuredStructuralBudget: 12,
            configuredPolishAllowance: 24,
            descendantsProduced: 1,
            seedImprovements: 1,
            globalSelectedBestImprovements: 0,
            referenceImprovements: 0,
          },
    })

    expect(result).toMatchObject({
      feedbackSeedsConsumed: 2,
      structuralHandoffsExecuted: 1,
      handoffsProducingDescendants: 1,
      usefulHandoffs: 1,
      configuredPolishAllowance: 24,
      observedPolishWork: null,
    })
  })
})
