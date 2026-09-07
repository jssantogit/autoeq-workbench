import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AUTOEQ_PRODUCT_LIMITS } from '../../src/index.js'

import {
  createSolverLabProblem,
  evaluateSolverLabCandidate,
  type SolverLabEvaluationV1,
} from './labProtocol.js'
import {
  parseSolverLabCandidate,
  parseSolverLabProblem,
  serializeSolverLabProblem,
} from './labInterop.js'
import { loadLayeredResearchCases } from './corpus.js'

type ExportOptions = {
  command: 'export-problems'
  layer: 'development' | 'adversarial'
  caseId?: string
  maxFilters: number
  out: string
}

type EvaluateOptions = {
  command: 'evaluate-jsonl'
  problems: string
  candidates: string
  out: string
}

type LabCliOptions = ExportOptions | EvaluateOptions

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireOption(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = values.get(name)
  if (value === undefined || value.length === 0) throw new Error(`Missing required option ${name}`)
  return value
}

function parseMaxFilters(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('--max-filters requires a non-negative integer')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) {
    throw new Error(`--max-filters must be between 0 and ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters}`)
  }
  return parsed
}

function parseOptionValues(
  args: readonly string[],
  allowed: readonly string[],
): ReadonlyMap<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]!
    if (!option.startsWith('--')) throw new Error(`Unexpected argument ${option}`)
    if (!allowed.includes(option)) throw new Error(`Unknown option ${option}`)
    if (values.has(option)) throw new Error(`Duplicate option ${option}`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    values.set(option, value)
    index += 1
  }
  return values
}

export function parseSolverLabCliArgs(args: readonly string[]): LabCliOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const command = normalizedArgs[0]
  if (command !== 'export-problems' && command !== 'evaluate-jsonl') {
    throw new Error(`Unknown command ${command ?? '(missing)'}`)
  }
  if (command === 'export-problems') {
    const values = parseOptionValues(normalizedArgs.slice(1), ['--layer', '--case-id', '--max-filters', '--out'])
    const layer = requireOption(values, '--layer')
    if (layer !== 'development' && layer !== 'adversarial') {
      throw new Error('--layer must be development or adversarial')
    }
    return {
      command,
      layer,
      caseId: values.get('--case-id'),
      maxFilters: parseMaxFilters(requireOption(values, '--max-filters')),
      out: requireOption(values, '--out'),
    }
  }

  const values = parseOptionValues(normalizedArgs.slice(1), ['--problems', '--candidates', '--out'])
  return {
    command,
    problems: requireOption(values, '--problems'),
    candidates: requireOption(values, '--candidates'),
    out: requireOption(values, '--out'),
  }
}

function writeAtomically(path: string, content: string): void {
  const temporaryPath = `${path}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(temporaryPath, content)
    renameSync(temporaryPath, path)
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw error
  }
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function parseProblems(path: string) {
  const problems = readLines(path).map((line, index) => {
    try {
      return parseSolverLabProblem(line)
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${errorMessage(error)}`)
    }
  })
  const seen = new Set<string>()
  for (const problem of problems) {
    if (seen.has(problem.problemId)) throw new Error(`Duplicate problemId ${problem.problemId}`)
    seen.add(problem.problemId)
  }
  return problems
}

function parseCandidates(path: string) {
  return readLines(path).map((line, index) => {
    try {
      return parseSolverLabCandidate(line)
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${errorMessage(error)}`)
    }
  })
}

function unknownProblemEvaluation(candidateId: string): SolverLabEvaluationV1 {
  return {
    protocolVersion: 1,
    candidateId,
    valid: false,
    rejectionReason: 'unknown-problem',
    continuous: null,
    deliverable: null,
  }
}

function exportProblems(options: ExportOptions): void {
  const cases = loadLayeredResearchCases(options.layer)
  const selectedCases = options.caseId === undefined
    ? cases
    : cases.filter((researchCase) => researchCase.id === options.caseId)
  if (selectedCases.length === 0) {
    throw new Error(`Case ${options.caseId} is not approved for layer ${options.layer}`)
  }
  const problems = selectedCases
    .map((researchCase) => createSolverLabProblem(researchCase, options.maxFilters))
    .sort((left, right) => left.problemId.localeCompare(right.problemId))
  writeAtomically(options.out, problems.map(serializeSolverLabProblem).join('\n') + '\n')
}

function evaluateJsonl(options: EvaluateOptions): void {
  const problems = parseProblems(options.problems)
  const problemById = new Map(problems.map((problem) => [problem.problemId, problem]))
  const candidates = parseCandidates(options.candidates)
  const evaluations = candidates
    .map((candidate, index) => ({
      index,
      problemId: candidate.problemId,
      candidateId: candidate.candidateId,
      evaluation: problemById.has(candidate.problemId)
        ? evaluateSolverLabCandidate(problemById.get(candidate.problemId)!, candidate)
        : unknownProblemEvaluation(candidate.candidateId),
    }))
    .sort((left, right) =>
      left.problemId.localeCompare(right.problemId) ||
      left.candidateId.localeCompare(right.candidateId) ||
      left.index - right.index,
    )
    .map(({ evaluation }) => evaluation)
  writeAtomically(options.out, evaluations.map((evaluation) => JSON.stringify(evaluation)).join('\n') + '\n')
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseSolverLabCliArgs(args)
  if (options.command === 'export-problems') {
    exportProblems(options)
  } else {
    evaluateJsonl(options)
  }
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`)
    process.exitCode = 1
  }
}
