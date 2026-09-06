import {
  assertSolverLabCandidate,
  assertSolverLabProblem,
  type SolverLabCandidateV1,
  type SolverLabProblemV1,
} from './labProtocol.js'

export function serializeSolverLabProblem(problem: SolverLabProblemV1): string {
  assertSolverLabProblem(problem)
  return JSON.stringify(problem)
}

export function parseSolverLabProblem(serialized: string): SolverLabProblemV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Invalid solver lab problem JSON')
  }
  assertSolverLabProblem(parsed)
  return parsed
}

export function serializeSolverLabCandidate(candidate: SolverLabCandidateV1): string {
  assertSolverLabCandidate(candidate)
  return JSON.stringify(candidate)
}

export function parseSolverLabCandidate(serialized: string): SolverLabCandidateV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('Invalid solver lab candidate JSON')
  }
  assertSolverLabCandidate(parsed)
  return parsed
}
