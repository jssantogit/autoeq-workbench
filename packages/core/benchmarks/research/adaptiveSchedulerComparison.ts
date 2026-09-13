import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ADAPTIVE_RESOURCE_POLICY,
  addSearchWorkDelta,
  createSearchWorkDelta,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  structuralViolation,
  type Filter,
  type ScalableSearchStage,
  type ScalableSchedulerPolicy,
  type ScalableStructuralSearchInput,
  type ScalableStructuralSearchResult,
  type SearchWorkTotals,
} from '../../src/index.js'

import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from './manualRegression.js'

export const ADAPTIVE_SCHEDULER_COMPARISON_CASE_IDS: readonly ManualRegressionCaseId[] = [
  'titan-to-rsv',
  'titan-to-mystic-8',
  'titan-to-s12-ultra',
]
export const ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_CAPACITY = 17
export const ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_BUDGET_MS = 1_000
export const ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_STAGE_QUANTUM_MS = 100
/** Declared before running the sparse comparison; valid values are 3–5. */
export const ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_REPEATS = 3

export type AdaptiveSchedulerComparisonOutputMode = 'jsonl' | 'markdown'

export interface AdaptiveSchedulerComparisonOptions {
  caseIds?: ManualRegressionCaseId[]
  maximumCapacity?: number
  budgetMs?: number
  stageQuantumMs?: number
  repeats?: number
  outputMode?: AdaptiveSchedulerComparisonOutputMode
  seedFilters?: readonly Filter[]
  nowMs?: () => number
  run?: AdaptiveSchedulerComparisonSearchRunner
}

export interface ResolvedAdaptiveSchedulerComparisonOptions {
  caseIds: ManualRegressionCaseId[]
  maximumCapacity: number
  budgetMs: number
  stageQuantumMs: number
  repeats: number
  outputMode: AdaptiveSchedulerComparisonOutputMode
  seedFilters?: Filter[]
  nowMs?: () => number
  run?: AdaptiveSchedulerComparisonSearchRunner
}

export interface AdaptiveSchedulerDecisionTrace {
  stageIndex: number
  action?: ScalableSearchStage['action']
  capacity: number
  effortLevel: number
  decisionReason?: ScalableSearchStage['decisionReason']
  improved: boolean
  qualityDelta?: number
  qualityRelativeDelta?: number
  stagesSinceMeaningfulImprovement?: number
  workSinceMeaningfulImprovement?: SearchWorkTotals
  remainingWallClockMs?: number
  workDelta?: SearchWorkTotals
  cumulativeWork?: SearchWorkTotals
}

export interface AdaptiveSchedulerRunRecord {
  type: 'adaptive-scheduler-run'
  caseId: ManualRegressionCaseId
  policy: ScalableSchedulerPolicy
  repeatIndex: number
  maximumCapacity: number
  budgetMs: number
  stageQuantumMs: number
  final: {
    qualityKey: readonly [violation: number, rmseDb: number, maxAbsDb: number]
    violation: number
    rmseDb: number
    maxAbsDb: number
    filterCount: number
  }
  elapsedMs: number
  deadlineExpired: boolean
  deadlineUsage: number
  actionCounts: {
    expansions: number
    deepens: number
    exploreCurrentCapacity: number
    reseeds: number
  }
  incumbentImprovements: number
  marginalGains: number[]
  totalWork: SearchWorkTotals
  stages: AdaptiveSchedulerDecisionTrace[]
}

export interface AdaptiveSchedulerNumericSummary {
  best: number
  median: number
  worst: number
  range: number
}

export interface AdaptiveSchedulerWorkSummary {
  [dimension: string]: AdaptiveSchedulerNumericSummary
}

export interface AdaptiveSchedulerActionSummary {
  expansions: AdaptiveSchedulerNumericSummary
  deepens: AdaptiveSchedulerNumericSummary
  exploreCurrentCapacity: AdaptiveSchedulerNumericSummary
  reseeds: AdaptiveSchedulerNumericSummary
  incumbentImprovements: AdaptiveSchedulerNumericSummary
}

export interface AdaptiveSchedulerComparisonSummary {
  type: 'adaptive-scheduler-summary'
  caseId: ManualRegressionCaseId
  policy: ScalableSchedulerPolicy
  maximumCapacity: number
  budgetMs: number
  stageQuantumMs: number
  repeats: number
  finalViolation: AdaptiveSchedulerNumericSummary
  rmseDb: AdaptiveSchedulerNumericSummary
  maxAbsDb: AdaptiveSchedulerNumericSummary
  filterCount: AdaptiveSchedulerNumericSummary
  elapsedMs: AdaptiveSchedulerNumericSummary
  deadlineExpiredCount: number
  actionCounts: AdaptiveSchedulerActionSummary
  totalWork: AdaptiveSchedulerWorkSummary
}

export interface AdaptiveSchedulerComparisonResult {
  caseIds: ManualRegressionCaseId[]
  maximumCapacity: number
  budgetMs: number
  stageQuantumMs: number
  repeats: number
  runs: AdaptiveSchedulerRunRecord[]
  summaries: AdaptiveSchedulerComparisonSummary[]
}

export type AdaptiveSchedulerComparisonSearchRunner = (
  input: ScalableStructuralSearchInput,
) => ScalableStructuralSearchResult

export interface AdaptiveSchedulerComparisonMainDependencies {
  nowMs?: () => number
  run?: AdaptiveSchedulerComparisonSearchRunner
  writeLine?: (line: string) => void
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneWork(work: SearchWorkTotals): SearchWorkTotals {
  return { ...work }
}

function cloneTrace(stage: ScalableSearchStage): AdaptiveSchedulerDecisionTrace {
  return {
    stageIndex: stage.stageIndex,
    action: stage.action,
    capacity: stage.capacity,
    effortLevel: stage.effortLevel,
    decisionReason: stage.decisionReason,
    improved: stage.improved,
    qualityDelta: stage.qualityDelta,
    qualityRelativeDelta: stage.qualityRelativeDelta,
    stagesSinceMeaningfulImprovement: stage.stagesSinceMeaningfulImprovement,
    workSinceMeaningfulImprovement: stage.workSinceMeaningfulImprovement === undefined
      ? undefined
      : cloneWork(stage.workSinceMeaningfulImprovement),
    remainingWallClockMs: stage.remainingWallClockMs,
    workDelta: stage.workDelta === undefined ? undefined : cloneWork(stage.workDelta),
    cumulativeWork: stage.cumulativeWork === undefined
      ? undefined
      : cloneWork(stage.cumulativeWork),
  }
}

function positiveNumber(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return resolved
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return resolved
}

function parsePositiveNumber(value: string | undefined, flag: string): number {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${flag} requires a positive number`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`)
  }
  return parsed
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = parsePositiveNumber(value, flag)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${flag} requires a positive integer`)
  return parsed
}

function parseCases(value: string | undefined): ManualRegressionCaseId[] {
  if (value === undefined || value.trim().length === 0) {
    throw new Error('--case requires one or more approved case IDs')
  }
  const known = new Set(ADAPTIVE_SCHEDULER_COMPARISON_CASE_IDS)
  const values = value.split(',').map((part) => part.trim())
  if (
    values.some((caseId) => caseId.length === 0) ||
    values.some((caseId) => !known.has(caseId as ManualRegressionCaseId)) ||
    new Set(values).size !== values.length
  ) {
    throw new Error('--case values must be unique approved case IDs')
  }
  return values as ManualRegressionCaseId[]
}

function parseRepeats(value: string | undefined): number {
  const repeats = parsePositiveInteger(value, '--repeats')
  if (repeats < 3 || repeats > 5) {
    throw new Error('--repeats must be between 3 and 5')
  }
  return repeats
}

export function parseAdaptiveSchedulerComparisonArgs(
  args: readonly string[],
): ResolvedAdaptiveSchedulerComparisonOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  let caseIds = [...ADAPTIVE_SCHEDULER_COMPARISON_CASE_IDS]
  let maximumCapacity = ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_CAPACITY
  let budgetMs = ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_BUDGET_MS
  let stageQuantumMs = ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_STAGE_QUANTUM_MS
  let repeats = ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_REPEATS
  let outputMode: AdaptiveSchedulerComparisonOutputMode = 'jsonl'

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index]!
    if (argument === '--case') {
      caseIds = parseCases(normalizedArgs[++index])
    } else if (argument === '--capacity') {
      maximumCapacity = parsePositiveInteger(normalizedArgs[++index], '--capacity')
    } else if (argument === '--budget-ms') {
      budgetMs = parsePositiveNumber(normalizedArgs[++index], '--budget-ms')
    } else if (argument === '--stage-ms') {
      stageQuantumMs = parsePositiveNumber(normalizedArgs[++index], '--stage-ms')
    } else if (argument === '--repeats') {
      repeats = parseRepeats(normalizedArgs[++index])
    } else if (argument === '--jsonl') {
      outputMode = 'jsonl'
    } else if (argument === '--markdown') {
      outputMode = 'markdown'
    } else {
      throw new Error(`Unknown adaptive scheduler comparison option: ${argument}`)
    }
  }

  return {
    caseIds,
    maximumCapacity,
    budgetMs,
    stageQuantumMs,
    repeats,
    outputMode,
  }
}

function normalizeOptions(
  options: AdaptiveSchedulerComparisonOptions = {},
): ResolvedAdaptiveSchedulerComparisonOptions {
  const caseIds = options.caseIds === undefined
    ? [...ADAPTIVE_SCHEDULER_COMPARISON_CASE_IDS]
    : parseCases(options.caseIds.join(','))
  const repeats = positiveInteger(
    options.repeats,
    ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_REPEATS,
    'repeats',
  )
  if (repeats < 3 || repeats > 5) throw new Error('repeats must be between 3 and 5')
  return {
    caseIds,
    maximumCapacity: positiveInteger(
      options.maximumCapacity,
      ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_CAPACITY,
      'maximumCapacity',
    ),
    budgetMs: positiveNumber(options.budgetMs, ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_BUDGET_MS, 'budgetMs'),
    stageQuantumMs: positiveNumber(
      options.stageQuantumMs,
      ADAPTIVE_SCHEDULER_COMPARISON_DEFAULT_STAGE_QUANTUM_MS,
      'stageQuantumMs',
    ),
    repeats,
    outputMode: options.outputMode ?? 'jsonl',
    seedFilters: options.seedFilters === undefined ? undefined : cloneFilters(options.seedFilters),
    nowMs: options.nowMs,
    run: options.run,
  }
}

function runOne(
  caseId: ManualRegressionCaseId,
  prepared: { desiredDb: number[]; frequenciesHz: number[] },
  options: ResolvedAdaptiveSchedulerComparisonOptions,
  policy: ScalableSchedulerPolicy,
  repeatIndex: number,
): AdaptiveSchedulerRunRecord {
  const nowMs = options.nowMs ?? (() => performance.now())
  const startedAt = nowMs()
  const deadlineAt = startedAt + options.budgetMs
  const stages: ScalableSearchStage[] = []
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: Math.max(5, options.budgetMs / 1_000),
  })
  const run = options.run ?? runScalableStructuralSearch
  const adaptivePolicyParameters = {
    ...ADAPTIVE_RESOURCE_POLICY,
    stageQuantumMs: options.stageQuantumMs,
  }
  const result = run({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    maxFilters: options.maximumCapacity,
    baseConfig,
    deadline: { isExpired: () => nowMs() >= deadlineAt },
    seedFilters: options.seedFilters?.map((filter) => ({ ...filter })),
    schedulerPolicy: policy,
    adaptivePolicyParameters,
    stageQuantumMs: options.stageQuantumMs,
    remainingWallClockMs: () => Math.max(0, deadlineAt - nowMs()),
    nowMs,
    onStage: (stage) => stages.push({
      ...stage,
      workDelta: stage.workDelta === undefined ? undefined : cloneWork(stage.workDelta),
      cumulativeWork: stage.cumulativeWork === undefined
        ? undefined
        : cloneWork(stage.cumulativeWork),
      workSinceMeaningfulImprovement: stage.workSinceMeaningfulImprovement === undefined
        ? undefined
        : cloneWork(stage.workSinceMeaningfulImprovement),
    }),
  })
  const elapsedMs = Math.max(0, nowMs() - startedAt)
  const violation = structuralViolation(result)
  const totalWork = stages.reduce(
    (total, stage) => addSearchWorkDelta(total, stage.workDelta ?? createSearchWorkDelta()),
    createSearchWorkDelta(),
  )
  const actionCounts = {
    expansions: stages.filter((stage) => stage.action === 'expand-capacity').length,
    deepens: stages.filter((stage) => stage.action === 'deepen').length,
    exploreCurrentCapacity: stages.filter((stage) => stage.action === 'explore-current-capacity').length,
    reseeds: stages.filter((stage) => stage.action === 'reseed').length,
  }
  return {
    type: 'adaptive-scheduler-run',
    caseId,
    policy,
    repeatIndex,
    maximumCapacity: options.maximumCapacity,
    budgetMs: options.budgetMs,
    stageQuantumMs: options.stageQuantumMs,
    final: {
      qualityKey: [violation, result.rmseDb, result.maxAbsDb],
      violation,
      rmseDb: result.rmseDb,
      maxAbsDb: result.maxAbsDb,
      filterCount: result.filters.length,
    },
    elapsedMs,
    deadlineExpired: nowMs() >= deadlineAt,
    deadlineUsage: options.budgetMs === 0 ? 0 : Math.min(1, elapsedMs / options.budgetMs),
    actionCounts,
    incumbentImprovements: stages.filter((stage) => stage.improved).length,
    marginalGains: stages.map((stage) => Math.max(0, stage.qualityDelta ?? 0)),
    totalWork,
    stages: stages.map(cloneTrace),
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function summarize(values: readonly number[]): AdaptiveSchedulerNumericSummary {
  if (values.length === 0) {
    throw new Error('cannot summarize an empty run set')
  }
  const best = Math.min(...values)
  const worst = Math.max(...values)
  return { best, median: median(values), worst, range: worst - best }
}

const WORK_DIMENSIONS: readonly (keyof SearchWorkTotals)[] = [
  'structuralSearchInvocations',
  'beamGenerations',
  'proposalsGenerated',
  'proposalsAdmitted',
  'proposalsPolished',
  'duplicateStates',
  'rescueAttempts',
  'pairAddAttempts',
  'capSwapAttempts',
  'reseedAttempts',
]

function summarizeRuns(
  runs: readonly AdaptiveSchedulerRunRecord[],
): AdaptiveSchedulerComparisonSummary {
  const first = runs[0]
  if (first === undefined) throw new Error('cannot summarize an empty run set')
  const actionCounts = {
    expansions: summarize(runs.map((run) => run.actionCounts.expansions)),
    deepens: summarize(runs.map((run) => run.actionCounts.deepens)),
    exploreCurrentCapacity: summarize(runs.map((run) => run.actionCounts.exploreCurrentCapacity)),
    reseeds: summarize(runs.map((run) => run.actionCounts.reseeds)),
    incumbentImprovements: summarize(runs.map((run) => run.incumbentImprovements)),
  }
  const totalWork: AdaptiveSchedulerWorkSummary = {}
  for (const dimension of WORK_DIMENSIONS) {
    totalWork[dimension] = summarize(runs.map((run) => run.totalWork[dimension]))
  }
  return {
    type: 'adaptive-scheduler-summary',
    caseId: first.caseId,
    policy: first.policy,
    maximumCapacity: first.maximumCapacity,
    budgetMs: first.budgetMs,
    stageQuantumMs: first.stageQuantumMs,
    repeats: runs.length,
    finalViolation: summarize(runs.map((run) => run.final.violation)),
    rmseDb: summarize(runs.map((run) => run.final.rmseDb)),
    maxAbsDb: summarize(runs.map((run) => run.final.maxAbsDb)),
    filterCount: summarize(runs.map((run) => run.final.filterCount)),
    elapsedMs: summarize(runs.map((run) => run.elapsedMs)),
    deadlineExpiredCount: runs.filter((run) => run.deadlineExpired).length,
    actionCounts,
    totalWork,
  }
}

export function runAdaptiveSchedulerComparison(
  options: AdaptiveSchedulerComparisonOptions = {},
): AdaptiveSchedulerComparisonResult {
  const resolved = normalizeOptions(options)
  const approvedCases = new Set(loadManualRegressionCases().map(({ id }) => id))
  const runs: AdaptiveSchedulerRunRecord[] = []
  for (const caseId of resolved.caseIds) {
    if (!approvedCases.has(caseId)) throw new Error(`Unknown manual regression case: ${caseId}`)
    const prepared = prepareManualRegressionDesired(caseId)
    for (let repeatIndex = 0; repeatIndex < resolved.repeats; repeatIndex += 1) {
      for (const policy of ['legacy', 'adaptive-resource'] as const) {
        runs.push(runOne(caseId, prepared, resolved, policy, repeatIndex))
      }
    }
  }
  const summaries: AdaptiveSchedulerComparisonSummary[] = []
  for (const caseId of resolved.caseIds) {
    for (const policy of ['legacy', 'adaptive-resource'] as const) {
      summaries.push(summarizeRuns(runs.filter((run) => run.caseId === caseId && run.policy === policy)))
    }
  }
  return {
    caseIds: [...resolved.caseIds],
    maximumCapacity: resolved.maximumCapacity,
    budgetMs: resolved.budgetMs,
    stageQuantumMs: resolved.stageQuantumMs,
    repeats: resolved.repeats,
    runs,
    summaries,
  }
}

function formatSummary(summary: AdaptiveSchedulerComparisonSummary): string {
  const quality = summary.finalViolation
  const action = summary.actionCounts
  return `| ${summary.caseId} | ${summary.policy} | ${quality.best.toFixed(3)} | ${quality.median.toFixed(3)} | ${quality.worst.toFixed(3)} | ${quality.range.toFixed(3)} | ${summary.rmseDb.median.toFixed(3)} | ${summary.maxAbsDb.median.toFixed(3)} | ${summary.filterCount.median.toFixed(1)} | ${action.expansions.median.toFixed(1)} | ${action.deepens.median.toFixed(1)} | ${action.reseeds.median.toFixed(1)} |`
}

function workSummary(summary: AdaptiveSchedulerWorkSummary): string {
  return WORK_DIMENSIONS.map((dimension) => `${dimension}=${summary[dimension]!.median.toFixed(1)}`).join(', ')
}

export function renderAdaptiveSchedulerComparisonReport(
  result: AdaptiveSchedulerComparisonResult,
): string {
  const lines = [
    '# AutoEQ V2 adaptive scheduler comparison',
    '',
    `Envelope: maximum capacity ${result.maximumCapacity}, budget ${result.budgetMs} ms, stage quantum ${result.stageQuantumMs} ms; repeats=${result.repeats}. Both policies run on every envelope before results are summarized.`,
    '',
    `Parameters: minimum invocations=${ADAPTIVE_RESOURCE_POLICY.minimumInvocationsBeforeExpansion}, meaningful gain threshold=${ADAPTIVE_RESOURCE_POLICY.meaningfulGainThreshold}, follow-up reserve=${ADAPTIVE_RESOURCE_POLICY.followUpQuanta} quantum(s).`,
    '',
    '## Final quality and allocation',
    '',
    '| Case | Policy | Violation best | Violation median | Violation worst | Spread | RMSE median | maxAbs median | Filters median | Expansions median | Deepens median | Reseeds median |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...result.summaries.map(formatSummary),
    '',
    '## Median raw work',
    '',
  ]
  for (const summary of result.summaries) {
    lines.push(`- **${summary.caseId} / ${summary.policy}:** ${workSummary(summary.totalWork)}.`)
  }
  lines.push('', '## Decision traces', '')
  for (const run of result.runs) {
    const trace = run.stages.map((stage) => `${stage.action ?? 'unknown'}@${stage.capacity}/e${stage.effortLevel}/${stage.decisionReason ?? 'legacy'}`).join(' → ')
    lines.push(`- **${run.caseId} / ${run.policy} / repeat ${run.repeatIndex}:** ${trace || 'no stages'}; quality=${run.final.violation.toFixed(3)}; elapsed=${run.elapsedMs.toFixed(1)} ms; work=${workSummary({
      structuralSearchInvocations: summarize([run.totalWork.structuralSearchInvocations]),
      beamGenerations: summarize([run.totalWork.beamGenerations]),
      proposalsGenerated: summarize([run.totalWork.proposalsGenerated]),
      proposalsAdmitted: summarize([run.totalWork.proposalsAdmitted]),
      proposalsPolished: summarize([run.totalWork.proposalsPolished]),
      duplicateStates: summarize([run.totalWork.duplicateStates]),
      rescueAttempts: summarize([run.totalWork.rescueAttempts]),
      pairAddAttempts: summarize([run.totalWork.pairAddAttempts]),
      capSwapAttempts: summarize([run.totalWork.capSwapAttempts]),
      reseedAttempts: summarize([run.totalWork.reseedAttempts]),
    })}.`)
  }
  lines.push(
    '',
    'Research interpretation: final quality is summarized across the declared repeats; action preferences are not golden assertions. Raw work dimensions remain separate and unweighted. Legacy is the unchanged control; adaptive-resource is the experimental policy.',
  )
  return lines.join('\n')
}

export function main(
  args: readonly string[] = process.argv.slice(2),
  dependencies: AdaptiveSchedulerComparisonMainDependencies = {},
): void {
  const options = parseAdaptiveSchedulerComparisonArgs(args)
  const result = runAdaptiveSchedulerComparison({
    ...options,
    nowMs: dependencies.nowMs,
    run: dependencies.run,
  })
  const writeLine = dependencies.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`))
  if (options.outputMode === 'markdown') {
    writeLine(renderAdaptiveSchedulerComparisonReport(result))
    return
  }
  for (const run of result.runs) writeLine(JSON.stringify(run))
  for (const summary of result.summaries) writeLine(JSON.stringify(summary))
  writeLine(JSON.stringify({
    type: 'adaptive-scheduler-comparison',
    caseIds: result.caseIds,
    maximumCapacity: result.maximumCapacity,
    budgetMs: result.budgetMs,
    stageQuantumMs: result.stageQuantumMs,
    repeats: result.repeats,
    runCount: result.runs.length,
    summaryCount: result.summaries.length,
  }))
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]!)

if (isMain) {
  try {
    main()
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
