import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cascadeMagnitudeDb,
  calculateBandMetrics,
  calculateErrorMetrics,
  DEFAULT_AUTOEQ_SETTINGS,
  isV2TargetAchieved,
  MVP_NUMERIC_POLICY,
  resolveStandardAutoEqV2Config,
  runStandardAutoEqV2,
  type AutoEqResultV2,
  type StandardAutoEqInputV2,
  type StandardV2Runtime,
} from '../../src/index.js'

import {
  compareWithBaseline,
  createResearchBaselineIdentity,
  findPracticalMonotonicityWarnings,
  RESEARCH_RUNNER_SCHEMA_VERSION,
} from './baseline.js'
import {
  loadResearchCases,
  prepareResearchDesired,
  RESEARCH_CORPUS_SHA256,
  RESEARCH_NORMALIZATION,
} from './corpus.js'
import { aggregateResearchRuns } from './aggregate.js'
import {
  type ResearchArtifactFiles,
  writeResearchArtifacts,
} from './report.js'
import { RESEARCH_BANDS, createResearchTelemetry } from './telemetry.js'
import { calculateTimeToQuality, projectTimeline } from './timeline.js'
import type {
  ResearchAggregateRow,
  ResearchBaselineFile,
  ResearchCaseId,
  ResearchComparison,
  ResearchRunMetadata,
  ResearchRunRow,
} from './types.js'

export const RESEARCH_CASE_IDS: readonly ResearchCaseId[] = [
  'titan-to-storm',
  'titan-to-u12t',
  'titan-to-trio',
]

export const RESEARCH_BUDGETS = [5, 15, 30, 60] as const
export const RESEARCH_ALL_BUDGETS = [5, 15, 30, 60, 120] as const
export const RESEARCH_DEFAULT_OUTPUT_DIR = './autoeq-research'
export const PUBLISHED_STANDARD_V2_COMMIT = '7c9ebbbe6eefeb131c6c698055c737b429f5b0c6'

export type ResearchBudgetSeconds = (typeof RESEARCH_ALL_BUDGETS)[number]

export interface ResearchCliProfile {
  caseId: ResearchCaseId
  budgetSeconds: ResearchBudgetSeconds
}

export interface ResearchCliOptions {
  preset: 'quick' | 'full'
  cases: ResearchCaseId[]
  budgets: ResearchBudgetSeconds[]
  maxFilters: number[]
  capacityMaxFilters: number[]
  includeOracle120: boolean
  repeats: number
  telemetryMode: 'light'
  profile?: ResearchCliProfile
  outputDir: string
  writeBaseline: boolean
  baselineImplementationCommit?: string
  testMode: boolean
}

export interface ResearchCell {
  caseId: ResearchCaseId
  budgetSeconds: ResearchBudgetSeconds
  maxFilters: number
  telemetryMode: 'light' | 'deep'
}

export interface RunResearchCellOptions {
  caseId: ResearchCaseId
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  maxFilters: number
  repeatIndex: number
  telemetryMode: 'light' | 'deep'
  nowMs?: () => number
  run?: (input: StandardAutoEqInputV2, runtime: StandardV2Runtime) => AutoEqResultV2
}

function buildInput(
  caseId: ResearchCaseId,
  budgetSeconds: RunResearchCellOptions['budgetSeconds'],
  maxFilters: number,
): StandardAutoEqInputV2 {
  const researchCase = loadResearchCases().find((candidate) => candidate.id === caseId)
  if (researchCase === undefined) throw new Error(`Unknown research case: ${caseId}`)
  return {
    source: researchCase.source,
    target: researchCase.target,
    normalization: { ...RESEARCH_NORMALIZATION },
    settings: {
      ...DEFAULT_AUTOEQ_SETTINGS,
      timeLimitSeconds: budgetSeconds,
      maxFilters,
    },
  }
}

function parseInteger(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${flag} requires a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer`)
  }
  return parsed
}

function parseBudget(value: string, flag: string): ResearchBudgetSeconds {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || !RESEARCH_ALL_BUDGETS.includes(parsed as ResearchBudgetSeconds)) {
    throw new Error(`${flag} requires one of ${RESEARCH_ALL_BUDGETS.join(', ')}`)
  }
  return parsed as ResearchBudgetSeconds
}

function parseCapacity(value: string): number[] {
  const values = value.split(',').map((part) => {
    const parsed = parseInteger(part, '--capacity')
    if (parsed !== 20 && parsed !== 40) {
      throw new Error('--capacity supports only 20 and 40')
    }
    return parsed
  })
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error('--capacity requires unique comma-separated values')
  }
  return values.sort((left, right) => left - right)
}

function parseProfile(value: string): ResearchCliProfile {
  const parts = value.split(':')
  if (parts.length !== 2 || !RESEARCH_CASE_IDS.includes(parts[0] as ResearchCaseId)) {
    throw new Error('--profile requires case:budget with an approved case ID')
  }
  return {
    caseId: parts[0] as ResearchCaseId,
    budgetSeconds: parseBudget(parts[1]!, '--profile'),
  }
}

export function parseResearchCliArgs(args: readonly string[]): ResearchCliOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  let preset: ResearchCliOptions['preset'] = 'quick'
  let capacityMaxFilters: number[] = []
  let includeOracle120 = false
  let repeats: number | undefined
  let profile: ResearchCliProfile | undefined
  let outputDir = RESEARCH_DEFAULT_OUTPUT_DIR
  let writeBaseline = false
  let baselineImplementationCommit: string | undefined
  let testMode = false

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index]!
    if (argument === '--preset') {
      const value = normalizedArgs[++index]
      if (value !== 'quick' && value !== 'full') throw new Error('--preset requires quick or full')
      preset = value
    } else if (argument === '--capacity') {
      const value = normalizedArgs[++index]
      if (value === undefined) throw new Error('--capacity requires a value')
      capacityMaxFilters = parseCapacity(value)
    } else if (argument === '--oracle-120') {
      includeOracle120 = true
    } else if (argument === '--repeats') {
      const value = normalizedArgs[++index]
      if (value === undefined) throw new Error('--repeats requires a value')
      repeats = parseInteger(value, '--repeats')
    } else if (argument === '--profile') {
      const value = normalizedArgs[++index]
      if (value === undefined) throw new Error('--profile requires a value')
      if (profile !== undefined) throw new Error('--profile may be provided only once')
      profile = parseProfile(value)
    } else if (argument === '--output-dir') {
      const value = normalizedArgs[++index]
      if (value === undefined || value.length === 0) throw new Error('--output-dir requires a value')
      outputDir = value
    } else if (argument === '--write-baseline') {
      writeBaseline = true
    } else if (argument === '--baseline-implementation-commit') {
      const value = normalizedArgs[++index]
      if (value === undefined || value.length === 0) {
        throw new Error('--baseline-implementation-commit requires a value')
      }
      baselineImplementationCommit = value
    } else if (argument === '--test-mode') {
      testMode = true
    } else {
      throw new Error(`Unknown research option: ${argument}`)
    }
  }

  if (testMode && writeBaseline) {
    throw new Error('--test-mode cannot be combined with --write-baseline')
  }
  if (writeBaseline && baselineImplementationCommit === undefined) {
    throw new Error('--write-baseline requires --baseline-implementation-commit')
  }

  const budgets: ResearchBudgetSeconds[] = preset === 'quick'
    ? [15, 30]
    : [5, 15, 30, 60]
  return {
    preset,
    cases: [...RESEARCH_CASE_IDS],
    budgets,
    maxFilters: [10, ...capacityMaxFilters],
    capacityMaxFilters,
    includeOracle120,
    repeats: repeats ?? (preset === 'quick' ? 1 : 5),
    telemetryMode: 'light',
    profile,
    outputDir,
    writeBaseline,
    baselineImplementationCommit,
    testMode,
  }
}

export function createResearchCells(options: ResearchCliOptions): ResearchCell[] {
  const cells: ResearchCell[] = []
  const seen = new Set<string>()
  const add = (caseId: ResearchCaseId, budgetSeconds: ResearchBudgetSeconds, maxFilters: number) => {
    const key = `${caseId}|${budgetSeconds}|${maxFilters}`
    if (seen.has(key)) return
    seen.add(key)
    cells.push({
      caseId,
      budgetSeconds,
      maxFilters,
      telemetryMode: options.profile?.caseId === caseId &&
          options.profile.budgetSeconds === budgetSeconds &&
          maxFilters === 10
        ? 'deep'
        : 'light',
    })
  }

  for (const caseId of options.cases) {
    for (const budgetSeconds of options.budgets) {
      for (const maxFilters of options.maxFilters) add(caseId, budgetSeconds, maxFilters)
    }
    if (options.includeOracle120) add(caseId, 120, 10)
    if (options.profile !== undefined) {
      add(options.profile.caseId, options.profile.budgetSeconds, 10)
    }
  }
  return cells
}

function verifyMetrics(
  result: AutoEqResultV2,
  desiredDb: readonly number[],
  frequenciesHz: readonly number[],
): { metrics: AutoEqResultV2['metrics']; bands: ResearchRunRow['bands'] } {
  const cascadeDb = cascadeMagnitudeDb(
    result.filters,
    frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const residualDb = desiredDb.map((desired, index) => desired - cascadeDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequenciesHz)
  const differences = [
    Math.abs(metrics.maeDb - result.metrics.maeDb),
    Math.abs(metrics.rmseDb - result.metrics.rmseDb),
    Math.abs(metrics.maxAbsDb - result.metrics.maxAbsDb),
    Math.abs(metrics.maxAbsFrequencyHz - result.metrics.maxAbsFrequencyHz),
  ]
  if (differences.some((difference) => difference > 1e-5)) {
    throw new Error(
      `Research result metrics disagree with independently calculated delivered residual: ${JSON.stringify(differences)}`,
    )
  }
  return {
    metrics,
    bands: calculateBandMetrics(residualDb, frequenciesHz, RESEARCH_BANDS),
  }
}

export async function runResearchCell(
  options: RunResearchCellOptions,
): Promise<ResearchRunRow> {
  const input = buildInput(options.caseId, options.budgetSeconds, options.maxFilters)
  const prepared = prepareResearchDesired(options.caseId)
  const telemetry = createResearchTelemetry({
    mode: options.telemetryMode,
    nowMs: options.nowMs,
  })
  const runtime: StandardV2Runtime = {
    nowMs: options.nowMs ?? (() => performance.now()),
    researchTrace: telemetry.trace,
  }
  const execute = options.run ?? runStandardAutoEqV2
  const startedAt = performance.now()
  const result = execute(input, runtime)
  const elapsedMs = performance.now() - startedAt
  const verified = verifyMetrics(result, prepared.desiredDb, prepared.frequenciesHz)
  const snapshot = telemetry.snapshot()

  return {
    caseId: options.caseId,
    budgetSeconds: options.budgetSeconds,
    maxFilters: options.maxFilters,
    repeatIndex: options.repeatIndex,
    elapsedMs,
    final: {
      ...verified.metrics,
      targetAchieved: isV2TargetAchieved(verified.metrics),
      terminationReason: result.manifest.terminationReason,
      deliveredFilterCount: result.filters.length,
      preampDb: result.preampDb,
    },
    bands: verified.bands,
    counters: snapshot.counters,
    timeToQuality: calculateTimeToQuality(snapshot.checkpoints),
    timeline: projectTimeline(snapshot.checkpoints),
    filters: result.filters.map((filter) => ({ ...filter })),
    telemetryMode: snapshot.mode,
    phaseTimingMs: snapshot.phaseTimingMs,
    ...(snapshot.mode === 'deep' ? { jointRefinements: snapshot.jointRefinements } : {}),
  }
}

function createTestModeRunner(
  caseId: ResearchCaseId,
): (input: StandardAutoEqInputV2, runtime: StandardV2Runtime) => AutoEqResultV2 {
  return (input, runtime) => {
    const prepared = prepareResearchDesired(caseId)
    const metrics = calculateErrorMetrics(prepared.desiredDb, prepared.frequenciesHz)
    const config = resolveStandardAutoEqV2Config(input.settings)
    const trace = runtime.researchTrace
    const phases = [
      'prepare',
      'candidateScoring',
      'jointRefine',
      'deliverable',
      'discreteRefine',
      'compression',
    ] as const
    for (const phase of phases) {
      trace?.onPhaseStart?.(phase)
      trace?.onPhaseEnd?.(phase)
    }
    trace?.onBoundaryModeAttempt?.('half-height')
    trace?.onCandidatesGenerated?.(1)
    trace?.onCandidatesShortlisted?.(1)
    trace?.onWorkingCheckpoint?.()
    trace?.onJointRefineCompleted?.(0)
    trace?.onDeliverableBuilt?.()
    trace?.onDiscreteTrial?.()
    trace?.onDiscreteAcceptedMove?.()
    trace?.onCompressionRemovalTrial?.()
    trace?.onBestDeliverableUpdated?.({ metrics, filters: [], preampDb: 0 })
    const targetAchieved = isV2TargetAchieved(metrics)
    const cancellationAudit = { pairs: [], totalScore: 0 }
    return {
      filters: [],
      metrics,
      preampDb: 0,
      cancellationAudit,
      manifest: {
        schemaVersion: 3,
        algorithmVersion: 'standard-v2',
        profile: 'Standard',
        sampleRateHz: config.sampleRateHz,
        fitPointsPerOctave: config.fitPointsPerOctave,
        autoeqSettings: { ...input.settings },
        normalization: { ...input.normalization },
        sourceName: input.source.name,
        targetName: input.target.name,
        algorithmParameters: { ...config.algorithm },
        finalFilters: [],
        metrics: { ...metrics },
        preampDb: 0,
        cancellationAudit,
        terminationReason: targetAchieved ? 'target-reached' : 'converged',
        targetAchieved,
      },
    }
  }
}

export function readCommittedBaseline(): ResearchBaselineFile | undefined {
  const baselinePath = fileURLToPath(new URL('./baseline-standard-v2.json', import.meta.url))
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as ResearchBaselineFile
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function currentCommit(): string {
  const githubSha = process.env.GITHUB_SHA?.trim()
  if (githubSha) return githubSha
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

export interface ResearchExecutionResult {
  metadata: ResearchRunMetadata
  runs: ResearchRunRow[]
  aggregates: ResearchAggregateRow[]
  baseline?: ResearchBaselineFile
  comparison?: ResearchComparison
  artifacts: ResearchArtifactFiles
}

export async function executeResearchPlan(
  options: ResearchCliOptions,
  cellRunner: (options: RunResearchCellOptions) => Promise<ResearchRunRow> = runResearchCell,
): Promise<ResearchExecutionResult> {
  const runs: ResearchRunRow[] = []
  for (const cell of createResearchCells(options)) {
    for (let repeatIndex = 0; repeatIndex < options.repeats; repeatIndex += 1) {
      runs.push(await cellRunner({
        ...cell,
        repeatIndex,
        run: options.testMode ? createTestModeRunner(cell.caseId) : undefined,
      }))
    }
  }
  const aggregates = aggregateResearchRuns(runs)
  const baseline = options.writeBaseline ? undefined : readCommittedBaseline()
  const comparison = baseline === undefined
    ? undefined
    : compareWithBaseline(aggregates, baseline)
  const warnings = findPracticalMonotonicityWarnings(aggregates)
  const metadata: ResearchRunMetadata = {
    schemaVersion: 1,
    candidateCommit: currentCommit(),
    baselineCommit: options.baselineImplementationCommit ??
      baseline?.identity.implementationCommit ??
      PUBLISHED_STANDARD_V2_COMMIT,
    runnerSchemaVersion: RESEARCH_RUNNER_SCHEMA_VERSION,
    fixtureHashes: { ...RESEARCH_CORPUS_SHA256 },
    preset: options.preset,
    requestedAtIso: new Date().toISOString(),
    testMode: options.testMode || undefined,
  }
  const artifacts = writeResearchArtifacts(options.outputDir, {
    metadata,
    runs,
    aggregates,
    baseline,
    comparison,
    warnings,
  })

  if (options.writeBaseline) {
    const baselineFile: ResearchBaselineFile = {
      identity: createResearchBaselineIdentity(options.baselineImplementationCommit!),
      runs,
      aggregates,
    }
    writeFileSync(
      resolve(options.outputDir, 'baseline-standard-v2.json'),
      `${JSON.stringify(baselineFile, null, 2)}\n`,
    )
  }

  return { metadata, runs, aggregates, baseline, comparison, artifacts }
}

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseResearchCliArgs(args)
  const result = await executeResearchPlan(options)
  console.log(`AutoEQ Research Bench: ${result.runs.length} runs written to ${options.outputDir}`)
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
