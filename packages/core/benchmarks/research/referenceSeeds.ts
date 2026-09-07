import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AUTOEQ_PRODUCT_LIMITS,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  runStandardAutoEq,
  type AutoEqResultV1,
  type ErrorMetrics,
  type Filter,
  type StandardAutoEqInputV1,
} from '../../src/index.js'

import { loadLayeredResearchCases, RESEARCH_NORMALIZATION } from './corpus.js'
import type { ResearchCaseDescriptor, ResearchCorpusLayer } from './types.js'

export interface ReferenceSeedPointV1 {
  problemId: string
  inputSha256: string
  maxFilters: number
  provenance: 'standard-v1'
  sourceAlgorithmVersion: 'standard-v1'
  rmseDb: number
  maxAbsDb: number
  maeDb: number
  maxAbsFrequencyHz: number
  deliveredFilterCount: number
  filters: Filter[]
}

export interface ReferenceSeedArtifactV1 {
  version: 1
  oracle: 'reference-seeds'
  sourceAlgorithm: 'standard-v1'
  repositorySha: string
  corpusLayer: Exclude<ResearchCorpusLayer, 'holdout'>
  maxFilters: number
  points: ReferenceSeedPointV1[]
}

export interface ReferenceSeedExecution {
  metrics: ErrorMetrics
  filters: readonly Filter[]
}

export type ReferenceSeedRunner = (input: StandardAutoEqInputV1) => ReferenceSeedExecution

export interface ReferenceSeedOptions {
  layer: Exclude<ResearchCorpusLayer, 'holdout'>
  caseId?: string
  maxFilters: number
  repositorySha: string
  cases?: readonly ResearchCaseDescriptor[]
  run?: ReferenceSeedRunner
}

function defaultRun(input: StandardAutoEqInputV1): ReferenceSeedExecution {
  const result: AutoEqResultV1 = runStandardAutoEq(input)
  return {
    metrics: result.metrics,
    filters: result.filters,
  }
}

function validateOptions(options: ReferenceSeedOptions): void {
  if (options.repositorySha.trim().length === 0) {
    throw new Error('Reference seed repository SHA is required')
  }
  if (
    !Number.isSafeInteger(options.maxFilters) ||
    options.maxFilters <= 0 ||
    options.maxFilters > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters
  ) {
    throw new Error(
      `Reference seed maxFilters must be between 1 and ${AUTOEQ_PRODUCT_LIMITS.hardMaxFilters}`,
    )
  }
}

function inputForCase(
  researchCase: ResearchCaseDescriptor,
  maxFilters: number,
): StandardAutoEqInputV1 {
  return {
    source: researchCase.source,
    target: researchCase.target,
    normalization: { ...RESEARCH_NORMALIZATION },
    settings: {
      ...DEFAULT_AUTOEQ_SETTINGS_V1,
      maxFilters,
    },
  }
}

export function createStandardV1ReferenceSeedArtifact(
  options: ReferenceSeedOptions,
): ReferenceSeedArtifactV1 {
  validateOptions(options)
  const run = options.run ?? defaultRun
  const cases = [...(options.cases ?? loadLayeredResearchCases(options.layer))]
    .filter((researchCase) => researchCase.layer === options.layer)
    .filter((researchCase) => options.caseId === undefined || researchCase.id === options.caseId)
    .sort((left, right) => left.id.localeCompare(right.id))

  if (cases.length === 0) {
    throw new Error(`Case ${options.caseId} is not approved for layer ${options.layer}`)
  }

  const points = cases.map((researchCase): ReferenceSeedPointV1 => {
    const execution = run(inputForCase(researchCase, options.maxFilters))
    return {
      problemId: researchCase.id,
      inputSha256: researchCase.inputSha256,
      maxFilters: options.maxFilters,
      provenance: 'standard-v1',
      sourceAlgorithmVersion: 'standard-v1',
      rmseDb: execution.metrics.rmseDb,
      maxAbsDb: execution.metrics.maxAbsDb,
      maeDb: execution.metrics.maeDb,
      maxAbsFrequencyHz: execution.metrics.maxAbsFrequencyHz,
      deliveredFilterCount: execution.filters.length,
      filters: execution.filters.map((filter) => ({ ...filter })),
    }
  })

  return {
    version: 1,
    oracle: 'reference-seeds',
    sourceAlgorithm: 'standard-v1',
    repositorySha: options.repositorySha,
    corpusLayer: options.layer,
    maxFilters: options.maxFilters,
    points,
  }
}

export function serializeReferenceSeedArtifact(
  artifact: ReferenceSeedArtifactV1,
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`
}

export function parseReferenceSeedArgs(
  args: readonly string[],
): ReferenceSeedOptions & { out: string } {
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
  if (layer !== 'development' && layer !== 'adversarial') {
    throw new Error('--layer must be development or adversarial')
  }
  const maxFilters = Number(required('--max-filters'))
  if (!Number.isSafeInteger(maxFilters)) throw new Error('--max-filters must be an integer')
  return {
    layer,
    caseId: values.get('--case-id'),
    maxFilters,
    repositorySha: required('--repository-sha'),
    out: required('--out'),
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseReferenceSeedArgs(args)
  const artifact = createStandardV1ReferenceSeedArtifact(options)
  const output = resolve(options.out)
  writeFileSync(output, serializeReferenceSeedArtifact(artifact))
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
