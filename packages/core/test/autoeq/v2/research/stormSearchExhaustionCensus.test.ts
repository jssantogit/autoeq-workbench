import { describe, expect, it } from 'vitest'

import {
  createStructuralBeamExhaustionTrace,
  runStructuralBeam,
  type StructuralBeamProblem,
} from '../../../../benchmarks/research/structuralBeam.js'
import {
  classifyExhaustionTrace,
} from '../../../../benchmarks/research/stormSearchExhaustionCensus.js'
import type {
  SolverLabCandidateV1,
  SolverLabEvaluationV1,
} from '../../../../benchmarks/research/labProtocol.js'

const problem: StructuralBeamProblem = {
  problemId: 'exhaustion-test',
  inputSha256: 'e'.repeat(64),
  frequenciesHz: [20, 100, 1_000, 10_000],
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

function evaluator(candidate: SolverLabCandidateV1): SolverLabEvaluationV1 {
  const count = candidate.filters.length
  const metric = count === 0 ? 1 : 10 + count
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
}

describe('Storm structural search exhaustion census', () => {
  it('keeps exhaustion tracing observational while exposing terminal saturation', () => {
    const input = {
      problem: { ...problem, desiredDb: [0, 0, 4, 0] },
      seed: 0,
      evaluationBudget: 20,
      referenceSnapshotSha256: 'f'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 1 }],
      config: { beamWidth: 1, proposalsPerParent: 3, localPolishEvaluations: 0, maxFilters: 4 },
      evaluate: evaluator,
    }
    const baseline = runStructuralBeam(input)
    const trace = createStructuralBeamExhaustionTrace()
    const traced = runStructuralBeam({ ...input, exhaustionTrace: trace })

    expect(traced.candidates).toEqual(baseline.candidates)
    expect(traced.evaluations).toEqual(baseline.evaluations)
    expect(traced.stopReason).toBe('no-admissible-proposals')
    expect(trace.layers.length).toBeGreaterThan(1)
    expect(trace.layers.at(-1)?.terminalNoGenerated).toBe(true)
    expect(['beam-retention-cycle', 'visited-state-saturation'])
      .toContain(classifyExhaustionTrace(trace))
  })

  it('classifies a terminal layer with no generated mutation as generator-empty', () => {
    const trace = createStructuralBeamExhaustionTrace()
    trace.layers.push({
      schemaVersion: 1,
      layerIndex: 1,
      beamBeforeCandidateIds: ['p'],
      parents: [{
        schemaVersion: 1,
        layerIndex: 1,
        parentIndex: 0,
        parentCandidateId: 'p',
        parentFilterCount: 0,
        orderedProposalCount: 0,
        defaultAdmittedCount: 0,
        selectedProposalCount: 0,
        admissionIntervention: 'default',
        prePolishAlreadyVisitedCount: 0,
        overMaxFiltersCount: 0,
        postPolishVisitedCount: 0,
        evaluatedNewCount: 0,
        evaluatedCandidateIds: [],
      }],
      generatedCandidateIds: [],
      retainedCandidateIds: ['p'],
      retainedGeneratedCandidateIds: [],
      droppedGeneratedCandidateIds: [],
      terminalNoGenerated: true,
    })
    expect(classifyExhaustionTrace(trace)).toBe('generator-empty')
  })

  it('identifies the beam-retention cycle pattern', () => {
    const trace = createStructuralBeamExhaustionTrace()
    trace.layers.push({
      schemaVersion: 1,
      layerIndex: 1,
      beamBeforeCandidateIds: ['p'],
      parents: [],
      generatedCandidateIds: ['g1', 'g2'],
      retainedCandidateIds: ['p'],
      retainedGeneratedCandidateIds: [],
      droppedGeneratedCandidateIds: ['g1', 'g2'],
      terminalNoGenerated: false,
    })
    trace.layers.push({
      schemaVersion: 1,
      layerIndex: 2,
      beamBeforeCandidateIds: ['p'],
      parents: [{
        schemaVersion: 1,
        layerIndex: 2,
        parentIndex: 0,
        parentCandidateId: 'p',
        parentFilterCount: 4,
        orderedProposalCount: 8,
        defaultAdmittedCount: 4,
        selectedProposalCount: 4,
        admissionIntervention: 'custom',
        prePolishAlreadyVisitedCount: 4,
        overMaxFiltersCount: 0,
        postPolishVisitedCount: 4,
        evaluatedNewCount: 0,
        evaluatedCandidateIds: [],
      }],
      generatedCandidateIds: [],
      retainedCandidateIds: ['p'],
      retainedGeneratedCandidateIds: [],
      droppedGeneratedCandidateIds: [],
      terminalNoGenerated: true,
    })
    expect(classifyExhaustionTrace(trace)).toBe('beam-retention-cycle')
  })
})
