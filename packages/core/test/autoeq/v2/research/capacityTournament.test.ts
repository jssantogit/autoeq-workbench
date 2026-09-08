import { describe, expect, it } from 'vitest'

import {
  CAPACITY_TOURNAMENT_CHECKPOINTS_MS,
  runCapacityTournament,
  type CapacityTournamentProgressPointV1,
  type CapacityTournamentVariant,
  type CapacityTournamentVariantId,
} from '../../../../benchmarks/research/capacityTournament.js'

const inputSha256 = 'a'.repeat(64)
const referenceSnapshotSha256 = 'b'.repeat(64)

function progressPoint(
  candidateId: string,
  elapsedMs: number,
  evaluationCount: number,
  rmseDb: number,
  maxAbsDb: number,
): CapacityTournamentProgressPointV1 {
  return {
    evaluationCount,
    elapsedMs,
    candidateId,
    actualDeliveredFilterCount: 0,
    canonicalRmseDb: rmseDb,
    canonicalMaxAbsDb: maxAbsDb,
    referenceRegret: Math.max(0, rmseDb + maxAbsDb),
    referenceImproved: false,
    filters: [],
    metricSource: 'canonical-delivered-v1',
    cumulativeCandidateCount: evaluationCount + 1,
    structuralOperationCount: evaluationCount,
    bestOrigin: 'synthetic',
  }
}

function variant(
  points: readonly CapacityTournamentProgressPointV1[],
): CapacityTournamentVariant {
  return {
    algorithmId: 'resumable-beam-v1',
    variantId: 'resumable-beam-v1',
    run: ({ report }) => {
      points.forEach(report)
      return {
        terminationReason: 'deadline',
        metadata: { runner: 'synthetic-test' },
      }
    },
  }
}

describe('capacity-aware same-runtime tournament', () => {
  it('captures the exact 5/15/30/60 second checkpoints from canonical best-so-far points', () => {
    const result = runCapacityTournament({
      cases: [{
        problemId: 'titan-to-storm',
        inputSha256,
        referenceSnapshotSha256,
        maxFilters: 10,
        seed: 0,
      }],
      variants: [variant([
        progressPoint('zero', 0, 0, 1.2, 2.4),
        progressPoint('five', 5_000, 1, 1.0, 2.0),
        progressPoint('fifteen', 15_000, 2, 0.8, 1.6),
        progressPoint('thirty', 30_000, 3, 0.6, 1.2),
        progressPoint('sixty', 60_000, 4, 0.4, 0.8),
      ])],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })

    expect(result.checkpointsMs).toEqual([...CAPACITY_TOURNAMENT_CHECKPOINTS_MS])
    expect(result.runs[0]!.checkpoints.map((checkpoint) => checkpoint.checkpointMs))
      .toEqual([5_000, 15_000, 30_000, 60_000])
    expect(result.runs[0]!.checkpoints.map((checkpoint) => checkpoint.candidateId))
      .toEqual(['five', 'fifteen', 'thirty', 'sixty'])
    expect(result.runs[0]!.maxFilters).toBe(10)
    expect(result.runs[0]!.checkpoints.every((checkpoint) =>
      checkpoint.metricSource === 'canonical-delivered-v1'))
      .toBe(true)
  })

  it('rejects a best-so-far regression and progress beyond the hard deadline', () => {
    const baseCase = {
      problemId: 'titan-to-trio' as const,
      inputSha256,
      referenceSnapshotSha256,
      maxFilters: 10 as const,
      seed: 0,
    }
    expect(() => runCapacityTournament({
      cases: [baseCase],
      variants: [variant([
        progressPoint('zero', 0, 0, 1.0, 2.0),
        progressPoint('regression', 5_000, 1, 1.1, 2.1),
        progressPoint('late', 60_000, 2, 0.9, 1.8),
      ])],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })).toThrow(/best-so-far point regresses/)

    expect(() => runCapacityTournament({
      cases: [baseCase],
      variants: [variant([
        progressPoint('zero', 0, 0, 1.0, 2.0),
        progressPoint('late', 60_001, 1, 0.9, 1.8),
      ])],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })).toThrow(/hard deadline/)
  })

  it('registers only approved survivor IDs and never permits a non-Max10 run', () => {
    const point = progressPoint('zero', 0, 0, 1.0, 2.0)
    expect(() => runCapacityTournament({
      cases: [{
        problemId: 'titan-to-u12t',
        inputSha256,
        referenceSnapshotSha256,
        maxFilters: 20 as unknown as 10,
        seed: 0,
      }],
      variants: [variant([point])],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })).toThrow(/Max10/)

    expect(() => runCapacityTournament({
      cases: [{
        problemId: 'titan-to-u12t',
        inputSha256,
        referenceSnapshotSha256,
        maxFilters: 10,
        seed: 0,
      }],
      variants: [{
        ...variant([point]),
        algorithmId: 'unshortlisted-v1',
        variantId: 'unshortlisted-v1' as unknown as CapacityTournamentVariantId,
      }],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })).toThrow(/approved Task 12 survivor/)
  })

  it('preserves cumulative work at checkpoints even while best-so-far is unchanged', () => {
    const unchanged = [
      progressPoint('best', 0, 0, 1, 2),
      progressPoint('best', 5_000, 10, 1, 2),
      progressPoint('best', 15_000, 30, 1, 2),
      progressPoint('best', 30_000, 60, 1, 2),
      progressPoint('best', 60_000, 120, 1, 2),
    ]
    const result = runCapacityTournament({
      cases: [{
        problemId: 'titan-to-storm',
        inputSha256,
        referenceSnapshotSha256,
        maxFilters: 10,
        seed: 0,
      }],
      variants: [variant(unchanged)],
      shortlistedVariantIds: ['resumable-beam-v1'],
    })

    expect(result.runs[0]!.checkpoints.map((point) => point.cumulativeCandidateCount))
      .toEqual([11, 31, 61, 121])
    expect(result.runs[0]!.checkpoints.map((point) => point.structuralOperationCount))
      .toEqual([10, 30, 60, 120])
  })
})
