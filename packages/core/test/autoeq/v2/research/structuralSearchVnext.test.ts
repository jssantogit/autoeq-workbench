import { describe, expect, it } from 'vitest'

import {
  M1_CHECKPOINT_SECONDS,
  M1_EFFORT_LEVEL,
  M1_REAL_CASES,
  M1_STRUCTURAL_CEILING,
  M1_SYNTHETIC_CASES,
  createM1ResourceEnvelope,
  runStructuralSearchVnextM1,
} from '../../../../benchmarks/research/structuralSearchVnext.js'

describe('structural-search VNext M1 benchmark runner', () => {
  it('declares the frozen campaign envelope without scheduler policy', () => {
    expect(M1_STRUCTURAL_CEILING).toBe(43)
    expect(M1_EFFORT_LEVEL).toBe(6)
    expect(M1_CHECKPOINT_SECONDS).toEqual([5, 15, 30])
    expect(M1_REAL_CASES.map(({ id }) => id)).toEqual([
      'titan-to-rsv',
      'titan-to-mystic-8',
      'titan-to-s12-ultra',
      'titan-to-storm',
      'titan-to-u12t',
      'titan-to-trio',
    ])
    expect(M1_SYNTHETIC_CASES.map(({ id }) => id)).toEqual([
      'synthetic-d-dense-known-structure',
      'synthetic-e-high-q-valid',
      'synthetic-f-upper-frequency-structure',
      'synthetic-h-alternating-structure',
    ])

    const envelope = createM1ResourceEnvelope(43, 6)
    expect(envelope).toMatchObject({
      structuralCeiling: 43,
      effortLevel: 6,
      schedulerPolicy: 'direct-structural-search',
      seedSemantics: 'empty-filters-deterministic',
    })
    expect(envelope.beamWidth).toBeGreaterThan(0)
    expect(envelope.proposalsPerParent).toBeGreaterThan(0)
    expect(envelope.localPolishEvaluations).toBeGreaterThan(0)
  })

  it('passes the same explicit resource envelope to both engines and aggregates three repeats', () => {
    const calls: Array<{ engine: string; config: Record<string, unknown>; deadline: unknown }> = []
    const fakeRun = (engine: string) => (input: any) => {
      calls.push({ engine, config: { ...input.config }, deadline: input.deadline })
      input.onTrace?.({
        type: 'beam-generation',
        filterCount: 2,
        rmseDb: 0.2,
        maxAbsDb: 0.4,
        generatedProposals: 4,
        admittedProposals: 2,
        polishedProposals: 2,
        beamSize: 2,
        candidateSourceCounts: { 'add-pk': 4 },
        frontierUtilization: {
          parentStatesObserved: 1,
          parentFilterCountMax: 2,
          generatedCandidateFilterCountMax: 3,
          admittedCandidateFilterCountMax: 3,
          polishedCandidateFilterCountMax: 3,
          parentsAtCapacity: 0,
          generatedCandidatesAtCapacity: 0,
          admittedCandidatesAtCapacity: 0,
          polishedCandidatesAtCapacity: 0,
          candidatesWithinOneSlotOfCapacity: 0,
        },
      })
      input.onTrace?.({
        type: 'end',
        filterCount: 2,
        rmseDb: 0.2,
        maxAbsDb: 0.4,
        finalImprovementPhase: engine === 'vnext' ? 'vnext-replacement' : undefined,
        replacementAccepted: engine === 'vnext' ? 1 : undefined,
      })
      return { filters: [], rmseDb: 0.2, maxAbsDb: 0.4 }
    }

    const result = runStructuralSearchVnextM1({
      repeats: 3,
      runBaseline: fakeRun('baseline'),
      runVNext: fakeRun('vnext'),
      includeReal: false,
      includeSynthetic: true,
      syntheticCaseIds: ['synthetic-d-dense-known-structure'],
      writeArtifacts: false,
    })

    expect(calls.length).toBe(2 * 3 * 3 * 3)
    expect(calls.every(({ config }) => Number(config.maxFilters) > 0)).toBe(true)
    for (let index = 0; index < calls.length; index += 2) {
      expect(JSON.stringify(calls[index]!.config)).toBe(JSON.stringify(calls[index + 1]!.config))
    }
    expect(new Set(calls.map(({ deadline }) => typeof (deadline as { isExpired: unknown }).isExpired)).size).toBe(1)
    expect(result.runs).toHaveLength(54)
    expect(result.aggregates).toHaveLength(18)
    expect(result.aggregates.every((row) => row.repeatCount === 3)).toBe(true)
    expect(result.vnextMechanismTelemetry.overall.proposalMutationSourceCounts['add-pk']).toBe(27 * 4)
    expect(result.vnextMechanismTelemetry.overall.acceptedReplacements).toBe(27)
  })
})
