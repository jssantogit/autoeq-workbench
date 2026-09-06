import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AUTOEQ_PRODUCT_LIMITS,
  AUTOEQ_TIME_LIMIT_OPTIONS,
  DEFAULT_AUTOEQ_SETTINGS,
  isV2TargetAchieved,
  runStandardAutoEqV2,
  type AutoEqResultV2,
  type ErrorMetrics,
  type Filter,
  type StandardAutoEqInputV2,
  type StandardV2TerminationReason,
} from '../../src/index.js'

import { loadLayeredResearchCases } from './corpus.js'
import type { ResearchCorpusLayer, ResearchCaseDescriptor } from './types.js'

export const FROZEN_STANDARD_V2_CONTROL = '5dafaa50410b9fa3157c28a1f7757d676b33152a'

export interface OracleControlPointV1 {
  candidateId: string
  problemId: string
  inputSha256: string
  maxFilters: number
  rmseDb: number
  maxAbsDb: number
  maeDb: number
  maxAbsFrequencyHz: number
  targetAchieved: boolean
  deliveredFilterCount: number
  terminationReason: StandardV2TerminationReason
  filters: Filter[]
}

export interface OracleControlArtifactV1 {
  version: 1
  oracle: 'standard-v2-control'
  repositorySha: string
  corpusLayer: Exclude<ResearchCorpusLayer, 'holdout'>
  maxFilters: number
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  algorithmVersion: string
  points: OracleControlPointV1[]
}

export interface OracleControlExecution {
  metrics: ErrorMetrics
  filters: readonly Filter[]
  terminationReason: StandardV2TerminationReason
}

export type OracleControlRunner = (input: StandardAutoEqInputV2) => OracleControlExecution

export interface OracleControlOptions {
  layer: Exclude<ResearchCorpusLayer, 'holdout'>
  maxFilters: number
  budgetSeconds: OracleControlArtifactV1['budgetSeconds']
  repositorySha: string
  cases?: readonly ResearchCaseDescriptor[]
  run?: OracleControlRunner
}

function defaultRun(input: StandardAutoEqInputV2): OracleControlExecution {
  const result: AutoEqResultV2 = runStandardAutoEqV2(input)
  return {
    metrics: result.metrics,
    filters: result.filters,
    terminationReason: result.manifest.terminationReason,
  }
}

function validateOptions(options: OracleControlOptions): void {
  if (options.repositorySha.trim().length === 0) throw new Error('Oracle control repository SHA is required')
  if (!Number.isSafeInteger(options.maxFilters) || options.maxFilters <= 0 || options.maxFilters > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) {
    throw new Error(`Oracle control maxFilters must be between 1 and ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters}`)
  }
  if (!AUTOEQ_TIME_LIMIT_OPTIONS.includes(options.budgetSeconds)) {
    throw new Error(`Oracle control budget must be one of ${AUTOEQ_TIME_LIMIT_OPTIONS.join(', ')}`)
  }
}

function inputForCase(
  researchCase: ResearchCaseDescriptor,
  maxFilters: number,
  budgetSeconds: OracleControlArtifactV1['budgetSeconds'],
): StandardAutoEqInputV2 {
  return {
    source: researchCase.source,
    target: researchCase.target,
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
    settings: {
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters,
      timeLimitSeconds: budgetSeconds,
    },
  }
}

export function createOracleControlArtifact(
  options: OracleControlOptions,
): OracleControlArtifactV1 {
  validateOptions(options)
  const run = options.run ?? defaultRun
  const cases = [...(options.cases ?? loadLayeredResearchCases(options.layer))]
    .filter((researchCase) => researchCase.layer === options.layer)
    .sort((left, right) => left.id.localeCompare(right.id))
  const points = cases.map((researchCase): OracleControlPointV1 => {
    const execution = run(inputForCase(researchCase, options.maxFilters, options.budgetSeconds))
    return {
      candidateId: `standard-v2-control:${researchCase.id}:${options.maxFilters}:${options.budgetSeconds}`,
      problemId: researchCase.id,
      inputSha256: researchCase.inputSha256,
      maxFilters: options.maxFilters,
      rmseDb: execution.metrics.rmseDb,
      maxAbsDb: execution.metrics.maxAbsDb,
      maeDb: execution.metrics.maeDb,
      maxAbsFrequencyHz: execution.metrics.maxAbsFrequencyHz,
      targetAchieved: isV2TargetAchieved(execution.metrics),
      deliveredFilterCount: execution.filters.length,
      terminationReason: execution.terminationReason,
      filters: execution.filters.map((filter) => ({ ...filter })),
    }
  })
  return {
    version: 1,
    oracle: 'standard-v2-control',
    repositorySha: options.repositorySha,
    corpusLayer: options.layer,
    maxFilters: options.maxFilters,
    budgetSeconds: options.budgetSeconds,
    algorithmVersion: FROZEN_STANDARD_V2_CONTROL,
    points,
  }
}

export function serializeOracleControlArtifact(
  artifact: OracleControlArtifactV1,
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`
}

export function parseOracleControlArgs(args: readonly string[]): OracleControlOptions & { out: string } {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const values = new Map<string, string>()
  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const option = normalizedArgs[index]!
    if (!option.startsWith('--')) throw new Error(`Unexpected argument ${option}`)
    const value = normalizedArgs[++index]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    if (values.has(option)) throw new Error(`Duplicate option ${option}`)
    values.set(option, value)
  }
  const required = (name: string): string => {
    const value = values.get(name)
    if (value === undefined || value.length === 0) throw new Error(`Missing required option ${name}`)
    return value
  }
  const layer = required('--layer')
  if (layer !== 'development' && layer !== 'adversarial') throw new Error('--layer must be development or adversarial')
  const maxFilters = Number(required('--max-filters'))
  const budgetSeconds = Number(required('--budget-seconds'))
  if (!Number.isSafeInteger(maxFilters)) throw new Error('--max-filters must be an integer')
  if (!AUTOEQ_TIME_LIMIT_OPTIONS.includes(budgetSeconds as OracleControlArtifactV1['budgetSeconds'])) {
    throw new Error('--budget-seconds must be one of 5, 15, 30, 60, 120')
  }
  return {
    layer,
    maxFilters,
    budgetSeconds: budgetSeconds as OracleControlArtifactV1['budgetSeconds'],
    repositorySha: required('--repository-sha'),
    out: required('--out'),
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseOracleControlArgs(args)
  const artifact = createOracleControlArtifact(options)
  const output = resolve(options.out)
  writeFileSync(output, serializeOracleControlArtifact(artifact))
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
