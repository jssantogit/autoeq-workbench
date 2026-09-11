import { describe, expect, it } from 'vitest'

import {
  buildNoveltySlotRetention,
} from '../../../../benchmarks/research/stormBeamEscapeCausalCampaign.js'
import type {
  StructuralBeamState,
} from '../../../../benchmarks/research/structuralBeam.js'
import type {
  SolverLabCandidateV1,
  SolverLabEvaluationV1,
} from '../../../../benchmarks/research/labProtocol.js'

function state(candidateId: string, rmseDb: number, maxAbsDb: number): StructuralBeamState {
  const candidate: SolverLabCandidateV1 = {
    protocolVersion: 1,
    problemId: 'beam-escape-test',
    inputSha256: 'a'.repeat(64),
    candidateId,
    algorithmId: 'structural-beam-v1',
    seed: 0,
    filters: [],
  }
  const evaluation: SolverLabEvaluationV1 = {
    protocolVersion: 1,
    candidateId,
    valid: true,
    rejectionReason: null,
    continuous: { rmseDb, maxAbsDb, bandRmseDb: {} },
    deliverable: {
      filters: [],
      rmseDb,
      maxAbsDb,
      bandRmseDb: {},
      cancellationTotalScore: 0,
    },
  }
  return { candidate, evaluation, origin: 'matching-pursuit' }
}

describe('Storm beam novelty-slot causal intervention', () => {
  it('does nothing when default retention already keeps a generated state', () => {
    const oldA = state('old-a', 1, 1)
    const oldB = state('old-b', 1.1, 1.1)
    const generated = state('new', 0.9, 0.9)
    expect(buildNoveltySlotRetention(
      [oldA, oldB],
      [generated],
      [oldA, generated],
      2,
    )).toBeNull()
  })

  it('replaces one incumbent with the best generated state only at a full retention stall', () => {
    const oldBest = state('old-best', 1, 1)
    const oldOther = state('old-other', 1.1, 1.1)
    const generatedTradeoff = state('new-tradeoff', 0.9, 2)
    const generatedWorse = state('new-worse', 2, 2)
    const chosen = buildNoveltySlotRetention(
      [oldBest, oldOther],
      [generatedTradeoff, generatedWorse],
      [oldBest, oldOther],
      2,
    )
    expect(chosen?.map((candidate) => candidate.candidate.candidateId))
      .toEqual(['old-best', 'new-tradeoff'])
  })

  it('is disabled for width one so it cannot silently change beam semantics outside the frozen experiment', () => {
    expect(buildNoveltySlotRetention(
      [state('old', 1, 1)],
      [state('new', 2, 2)],
      [state('old-default', 1, 1)],
      1,
    )).toBeNull()
  })
})
