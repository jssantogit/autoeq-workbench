import { describe, expect, it } from 'vitest'

import {
  assertSolverRunArtifactV1,
  serializeSolverRunArtifactV1,
  type SolverRunArtifactV1,
} from '../../../../benchmarks/research/solverRunArtifact.js'

function artifact(): SolverRunArtifactV1 {
  return {
    schemaVersion: 1,
    algorithmId: 'fixture',
    variantId: 'v1',
    problemId: 'case',
    inputSha256: 'a'.repeat(64),
    maxFilters: 10,
    referenceSnapshotSha256: 'b'.repeat(64),
    seed: 11,
    evaluationBudget: 100,
    trajectory: [{
      evaluationCount: 10,
      elapsedMs: 100,
      candidateId: 'first',
      actualDeliveredFilterCount: 2,
      canonicalRmseDb: 0.8,
      canonicalMaxAbsDb: 0.9,
      referenceRegret: 0.5,
      referenceImproved: false,
    }],
    qualityTimeFrontierV1: null,
    metadata: { source: 'test' },
  }
}

describe('SolverRunArtifactV1', () => {
  it('validates and serializes deterministic artifacts', () => {
    const value = artifact()
    assertSolverRunArtifactV1(value)
    const reordered = {
      metadata: value.metadata,
      trajectory: value.trajectory,
      evaluationBudget: value.evaluationBudget,
      seed: value.seed,
      referenceSnapshotSha256: value.referenceSnapshotSha256,
      maxFilters: value.maxFilters,
      inputSha256: value.inputSha256,
      problemId: value.problemId,
      variantId: value.variantId,
      algorithmId: value.algorithmId,
      qualityTimeFrontierV1: value.qualityTimeFrontierV1,
      schemaVersion: value.schemaVersion,
    }
    expect(serializeSolverRunArtifactV1(value)).toBe(serializeSolverRunArtifactV1(reordered))
  })

  it('rejects a regressing trajectory and invalid snapshot identity', () => {
    const value = artifact()
    expect(() => assertSolverRunArtifactV1({
      ...value,
      trajectory: [
        ...value.trajectory,
        {
          ...value.trajectory[0]!,
          evaluationCount: 9,
          elapsedMs: 200,
          candidateId: 'regressed',
          canonicalRmseDb: 1,
          canonicalMaxAbsDb: 1,
        },
      ],
    })).toThrow(/evaluation/)
    expect(() => assertSolverRunArtifactV1({
      ...value,
      referenceSnapshotSha256: 'not-a-sha',
    })).toThrow(/Snapshot/)
  })
})
