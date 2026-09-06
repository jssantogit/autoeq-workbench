import { describe, expect, it } from 'vitest'

import {
  loadLayeredResearchCases,
} from '../../../../benchmarks/research/corpus.js'
import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
} from '../../../../benchmarks/research/labProtocol.js'
import {
  parseSolverLabCandidate,
  parseSolverLabProblem,
  serializeSolverLabCandidate,
  serializeSolverLabProblem,
} from '../../../../benchmarks/research/labInterop.js'
import type {
  SolverLabCandidateV1,
  SolverLabProblemV1,
} from '../../../../benchmarks/research/labProtocol.js'

function problem(): SolverLabProblemV1 {
  const researchCase = loadLayeredResearchCases('development')[0]!
  return createSolverLabProblem(researchCase, 10)
}

function candidateFor(labProblem: SolverLabProblemV1): SolverLabCandidateV1 {
  return {
    protocolVersion: 1,
    problemId: labProblem.problemId,
    inputSha256: labProblem.inputSha256,
    candidateId: 'lab-1',
    algorithmId: 'fixture',
    seed: 7,
    filters: [{
      id: 'lab-1-filter',
      enabled: true,
      type: 'PK',
      frequencyHz: 1_000,
      gainDb: 2,
      q: 1,
    }],
  }
}

describe('solver lab protocol and interchange', () => {
  it('round-trips versioned problems and candidates without changing JSON', () => {
    const labProblem = problem()
    const candidate = candidateFor(labProblem)

    const problemJson = serializeSolverLabProblem(labProblem)
    const candidateJson = serializeSolverLabCandidate(candidate)

    expect(serializeSolverLabProblem(parseSolverLabProblem(problemJson))).toBe(problemJson)
    expect(serializeSolverLabCandidate(parseSolverLabCandidate(candidateJson))).toBe(candidateJson)
  })

  it('evaluates a valid candidate with canonical continuous and deliverable metrics', () => {
    const labProblem = problem()
    const evaluation = evaluateSolverLabCandidate(labProblem, candidateFor(labProblem))

    expect(evaluation).toMatchObject({
      protocolVersion: 1,
      candidateId: 'lab-1',
      valid: true,
      rejectionReason: null,
    })
    expect(evaluation.continuous?.rmseDb).toBeGreaterThanOrEqual(0)
    expect(evaluation.continuous?.maxAbsDb).toBeGreaterThanOrEqual(0)
    expect(Object.keys(evaluation.continuous?.bandRmseDb ?? {})).toEqual([
      'bass', 'low-mid', 'mid', 'presence', 'treble',
    ])
    expect(evaluation.deliverable?.filters[0]?.frequencyHz).toBe(1_000)
    expect(evaluation.deliverable?.bandRmseDb).toEqual(evaluation.continuous?.bandRmseDb)
    expect(evaluation.deliverable?.cancellationTotalScore).toBe(0)
  })

  it('rejects foreign hashes, unsupported filter types, and out-of-bounds filters', () => {
    const labProblem = problem()
    const candidate = candidateFor(labProblem)

    expect(evaluateSolverLabCandidate(labProblem, {
      ...candidate,
      inputSha256: '0'.repeat(64),
    })).toMatchObject({ valid: false, candidateId: 'lab-1', continuous: null, deliverable: null })

    expect(evaluateSolverLabCandidate(labProblem, {
      ...candidate,
      filters: [{ ...candidate.filters[0]!, type: 'AP' as 'PK' }],
    })).toMatchObject({ valid: false, rejectionReason: 'unsupported-filter-type' })

    expect(evaluateSolverLabCandidate(labProblem, {
      ...candidate,
      filters: [{ ...candidate.filters[0]!, frequencyHz: labProblem.bounds.maxFrequencyHz + 1 }],
    })).toMatchObject({ valid: false, rejectionReason: 'filter-out-of-bounds' })
  })
})
