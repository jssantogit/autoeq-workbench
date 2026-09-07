import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import {
  parseSolverLabProblem,
  serializeSolverLabCandidate,
} from '../../../../benchmarks/research/labInterop.js'
import type { SolverLabCandidateV1 } from '../../../../benchmarks/research/labProtocol.js'

const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const cliPath = resolve(coreRoot, 'benchmarks/research/labCli.ts')
const tsxPath = resolve(coreRoot, 'node_modules/.bin/tsx')
const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'autoeq-solver-lab-'))
  temporaryDirectories.push(directory)
  return directory
}

function runCli(args: readonly string[]) {
  return spawnSync(tsxPath, [cliPath, ...args], {
    cwd: coreRoot,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('solver lab CLI', () => {
  it('exports deterministic JSONL problems and evaluates a valid and wrong-hash batch', () => {
    const directory = createTemporaryDirectory()
    const problemsPath = join(directory, 'problems.jsonl')
    const candidatesPath = join(directory, 'candidates.jsonl')
    const evaluationsPath = join(directory, 'evaluations.jsonl')

    const exportRun = runCli([
      'export-problems',
      '--layer', 'development',
      '--max-filters', '10',
      '--out', problemsPath,
    ])
    expect(exportRun.status).toBe(0)
    expect(exportRun.stderr).toBe('')

    const problemLines = readFileSync(problemsPath, 'utf8').trim().split('\n')
    const problems = problemLines.map((line) => parseSolverLabProblem(line))
    const problemIds = problems.map((problem) => problem.problemId)
    expect(problemIds).toEqual([...problemIds].sort())
    expect(problemIds).toHaveLength(4)
    expect(existsSync(`${problemsPath}.tmp`)).toBe(false)
  }, 30_000)

  it('writes one evaluation per candidate and keeps wrong-hash candidates invalid', () => {
    const directory = createTemporaryDirectory()
    const problemsPath = join(directory, 'problems.jsonl')
    const candidatesPath = join(directory, 'candidates.jsonl')
    const evaluationsPath = join(directory, 'evaluations.jsonl')

    expect(runCli([
      'export-problems',
      '--layer', 'development',
      '--max-filters', '10',
      '--out', problemsPath,
    ]).status).toBe(0)

    const firstProblem = parseSolverLabProblem(readFileSync(problemsPath, 'utf8').split('\n')[0]!)
    const validCandidate: SolverLabCandidateV1 = {
      protocolVersion: 1,
      problemId: firstProblem.problemId,
      inputSha256: firstProblem.inputSha256,
      candidateId: 'lab-valid',
      algorithmId: 'fixture',
      seed: null,
      filters: [],
    }
    const wrongHashCandidate = {
      ...validCandidate,
      candidateId: 'lab-wrong-hash',
      inputSha256: '0'.repeat(64),
    }
    writeFileSync(candidatesPath, [
      serializeSolverLabCandidate(validCandidate),
      serializeSolverLabCandidate(wrongHashCandidate),
      '',
    ].join('\n'))

    const evaluateRun = runCli([
      'evaluate-jsonl',
      '--problems', problemsPath,
      '--candidates', candidatesPath,
      '--out', evaluationsPath,
    ])
    expect(evaluateRun.status).toBe(0)
    expect(evaluateRun.stderr).toBe('')

    const evaluations = readFileSync(evaluationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as {
        candidateId: string
        valid: boolean
        rejectionReason: string | null
      })
    expect(evaluations.map((evaluation) => evaluation.candidateId)).toEqual([
      'lab-valid', 'lab-wrong-hash',
    ])
    expect(evaluations[0]).toMatchObject({ candidateId: 'lab-valid', valid: true, rejectionReason: null })
    expect(evaluations[1]).toMatchObject({
      candidateId: 'lab-wrong-hash',
      valid: false,
      rejectionReason: 'input-hash-mismatch',
    })
  }, 30_000)

  it('exports exactly one approved case when case-id is supplied', () => {
    const directory = createTemporaryDirectory()
    const problemsPath = join(directory, 'problems.jsonl')

    const result = runCli([
      'export-problems',
      '--layer', 'adversarial',
      '--case-id', 'titan-to-storm',
      '--max-filters', '10',
      '--out', problemsPath,
    ])

    expect(result.status).toBe(0)
    expect(readFileSync(problemsPath, 'utf8').trim().split('\n')).toHaveLength(1)
    expect(parseSolverLabProblem(readFileSync(problemsPath, 'utf8').trim()).problemId)
      .toBe('titan-to-storm')
  }, 30_000)

  it('rejects a case id that is not approved for the selected layer', () => {
    const directory = createTemporaryDirectory()
    const result = runCli([
      'export-problems',
      '--layer', 'development',
      '--case-id', 'titan-to-u12t',
      '--max-filters', '10',
      '--out', join(directory, 'problems.jsonl'),
    ])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not approved for layer development')
  }, 30_000)

  it('rejects unknown options with a nonzero exit code', () => {
    const result = runCli(['export-problems', '--layer', 'development', '--unknown'])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unknown option')
  }, 30_000)
})
