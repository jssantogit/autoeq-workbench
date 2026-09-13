import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  createSearchWorkDelta,
  evaluateSchedulerDecisionPair,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  resolveScalableEffortConfig,
  runStructuralSearch,
  searchWorkDeltaFromTrace,
  structuralViolation,
  addSearchWorkDelta,
  type Filter,
  type SchedulerDecisionPairResult,
  type SchedulerDecisionSearchRunner,
  type SchedulerDecisionSnapshot,
  type SchedulerDecisionWorkBudget,
  type SearchWorkDelta,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from '../../src/index.js'

import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from './manualRegression.js'

export const DECISION_ORACLE_CASE_IDS: readonly ManualRegressionCaseId[] = [
  'titan-to-rsv',
  'titan-to-mystic-8',
  'titan-to-s12-ultra',
]

export const DECISION_ORACLE_DEFAULT_CAPACITY = 17
export const DECISION_ORACLE_DEFAULT_WARMUP_MS = 250
export const DECISION_ORACLE_DEFAULT_WARMUP_INVOCATIONS = 1
export const DECISION_ORACLE_DEFAULT_DECISION_MS = 250
export const DECISION_ORACLE_DEFAULT_REPEATS = 2
export const DECISION_ORACLE_GAIN_TIE_EPSILON = 0.01
/** Reporting threshold only; this is not production scheduler policy. */
export const DECISION_ORACLE_RECENT_GAIN_SATURATION_THRESHOLD = 0.05

export type DecisionOracleOutputMode = 'jsonl' | 'markdown'

export interface DecisionOracleProbeOptions {
  caseIds?: ManualRegressionCaseId[]
  maximumCapacity?: number
  warmupMs?: number
  warmupInvocations?: number
  decisionMs?: number
  repeats?: number
  outputMode?: DecisionOracleOutputMode
  seedFilters?: readonly Filter[]
  nowMs?: () => number
  run?: SchedulerDecisionSearchRunner
}

export interface ResolvedDecisionOracleProbeOptions {
  caseIds: ManualRegressionCaseId[]
  maximumCapacity: number
  warmupMs: number
  warmupInvocations: number
  decisionMs: number
  repeats: number
  outputMode: DecisionOracleOutputMode
  seedFilters?: Filter[]
  nowMs?: () => number
  run?: SchedulerDecisionSearchRunner
}

export type DecisionOracleStateClass =
  | 'saturating'
  | 'productive-current-regime'
  | 'expansion-friendly'

export type DecisionOracleOutcome =
  | 'deepen-clearly-wins'
  | 'expand-clearly-wins'
  | 'effectively-tied'
  | 'inconclusive'

export interface DecisionOracleWarmup {
  startingIncumbent: StructuralSearchResult
  candidate: StructuralSearchResult
  incumbent: StructuralSearchResult
  startingQuality: number
  finalQuality: number
  absoluteGain: number
  gainHistory: number[]
  effortLevel: number
  workDelta: SearchWorkDelta
  elapsedMs: number
}

export interface DecisionOracleProbeRecord {
  type: 'decision-oracle-pair'
  caseId: ManualRegressionCaseId
  repeatIndex: number
  stateClass: DecisionOracleStateClass
  outcome: DecisionOracleOutcome
  warmup: DecisionOracleWarmup
  snapshot: SchedulerDecisionSnapshot
  pair: SchedulerDecisionPairResult
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneResult(result: StructuralSearchResult): StructuralSearchResult {
  return {
    filters: cloneFilters(result.filters),
    rmseDb: result.rmseDb,
    maxAbsDb: result.maxAbsDb,
  }
}

function compareQuality(
  left: StructuralSearchResult,
  right: StructuralSearchResult,
): number {
  return structuralViolation(left) - structuralViolation(right) ||
    left.rmseDb - right.rmseDb ||
    left.maxAbsDb - right.maxAbsDb
}

function evaluateFilters(
  filters: readonly Filter[],
  desiredDb: readonly number[],
  frequencies: readonly number[],
  sampleRateHz: number,
): StructuralSearchResult {
  const responseDb = cascadeMagnitudeDb(filters, frequencies, sampleRateHz)
  const residualDb = desiredDb.map(
    (desired, index) => desired - responseDb[index]!,
  )
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  return {
    filters: cloneFilters(filters),
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
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
  const known = new Set(DECISION_ORACLE_CASE_IDS)
  const values = value.split(',').map((part) => part.trim())
  if (values.some((caseId) => !known.has(caseId as ManualRegressionCaseId))) {
    throw new Error('--case contains an unapproved case ID')
  }
  if (values.some((caseId) => caseId.length === 0) || new Set(values).size !== values.length) {
    throw new Error('--case values must be unique')
  }
  return values as ManualRegressionCaseId[]
}

export function parseDecisionOracleArgs(
  args: readonly string[],
): ResolvedDecisionOracleProbeOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  let caseIds = [...DECISION_ORACLE_CASE_IDS]
  let maximumCapacity = DECISION_ORACLE_DEFAULT_CAPACITY
  let warmupMs = DECISION_ORACLE_DEFAULT_WARMUP_MS
  let warmupInvocations = DECISION_ORACLE_DEFAULT_WARMUP_INVOCATIONS
  let decisionMs = DECISION_ORACLE_DEFAULT_DECISION_MS
  let repeats = DECISION_ORACLE_DEFAULT_REPEATS
  let outputMode: DecisionOracleOutputMode = 'jsonl'

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index]!
    if (argument === '--case') {
      caseIds = parseCases(normalizedArgs[++index])
    } else if (argument === '--capacity') {
      maximumCapacity = parsePositiveInteger(normalizedArgs[++index], '--capacity')
    } else if (argument === '--warmup-ms') {
      warmupMs = parsePositiveNumber(normalizedArgs[++index], '--warmup-ms')
    } else if (argument === '--warmup-invocations') {
      warmupInvocations = parsePositiveInteger(normalizedArgs[++index], '--warmup-invocations')
    } else if (argument === '--decision-ms') {
      decisionMs = parsePositiveNumber(normalizedArgs[++index], '--decision-ms')
    } else if (argument === '--repeats') {
      repeats = parsePositiveInteger(normalizedArgs[++index], '--repeats')
    } else if (argument === '--jsonl') {
      outputMode = 'jsonl'
    } else if (argument === '--markdown') {
      outputMode = 'markdown'
    } else {
      throw new Error(`Unknown decision-oracle option: ${argument}`)
    }
  }

  return {
    caseIds,
    maximumCapacity,
    warmupMs,
    warmupInvocations,
    decisionMs,
    repeats,
    outputMode,
  }
}

function normalizeOptions(
  options: DecisionOracleProbeOptions = {},
): ResolvedDecisionOracleProbeOptions {
  return {
    caseIds: options.caseIds === undefined
      ? [...DECISION_ORACLE_CASE_IDS]
      : parseCases(options.caseIds.join(',')),
    maximumCapacity: positiveInteger(
      options.maximumCapacity,
      DECISION_ORACLE_DEFAULT_CAPACITY,
      'maximumCapacity',
    ),
    warmupMs: positiveNumber(options.warmupMs, DECISION_ORACLE_DEFAULT_WARMUP_MS, 'warmupMs'),
    warmupInvocations: positiveInteger(
      options.warmupInvocations,
      DECISION_ORACLE_DEFAULT_WARMUP_INVOCATIONS,
      'warmupInvocations',
    ),
    decisionMs: positiveNumber(options.decisionMs, DECISION_ORACLE_DEFAULT_DECISION_MS, 'decisionMs'),
    repeats: positiveInteger(options.repeats, DECISION_ORACLE_DEFAULT_REPEATS, 'repeats'),
    outputMode: options.outputMode ?? 'jsonl',
    seedFilters: options.seedFilters === undefined ? undefined : cloneFilters(options.seedFilters),
    nowMs: options.nowMs,
    run: options.run,
  }
}

function runWarmup(
  prepared: { desiredDb: number[]; frequenciesHz: number[] },
  baseConfig: ReturnType<typeof resolveStructuralSearchConfig>,
  currentCapacity: number,
  warmupMs: number,
  warmupInvocations: number,
  seedFilters: readonly Filter[] | undefined,
  nowMs: () => number,
  run: SchedulerDecisionSearchRunner,
): DecisionOracleWarmup {
  const startingIncumbent = evaluateFilters(
    seedFilters ?? [],
    prepared.desiredDb,
    prepared.frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const startedAt = nowMs()
  let incumbent = cloneResult(startingIncumbent)
  let candidate = cloneResult(startingIncumbent)
  let workDelta = createSearchWorkDelta()
  const gainHistory: number[] = []
  let effortLevel = 0
  for (let invocation = 0; invocation < warmupInvocations; invocation += 1) {
    const invocationStartedAt = nowMs()
    const deadlineAt = invocationStartedAt + warmupMs
    let invocationWork = {
      ...createSearchWorkDelta(),
      structuralSearchInvocations: 1,
    }
    const before = cloneResult(incumbent)
    effortLevel = Math.min(6, invocation)
    candidate = cloneResult(run({
      desiredDb: [...prepared.desiredDb],
      frequencies: [...prepared.frequenciesHz],
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      config: resolveScalableEffortConfig(baseConfig, currentCapacity, effortLevel),
      deadline: { isExpired: () => nowMs() >= deadlineAt },
      seedFilters: cloneFilters(incumbent.filters),
      onTrace: (trace: StructuralSearchTraceEvent) => {
        invocationWork = addSearchWorkDelta(invocationWork, searchWorkDeltaFromTrace(trace))
      },
    }))
    workDelta = addSearchWorkDelta(workDelta, invocationWork)
    const nextIncumbent = compareQuality(candidate, incumbent) < 0
      ? candidate
      : incumbent
    const gain = Math.max(
      0,
      structuralViolation(before) - structuralViolation(nextIncumbent),
    )
    gainHistory.push(gain)
    incumbent = cloneResult(nextIncumbent)
  }
  const startingQuality = structuralViolation(startingIncumbent)
  const finalQuality = structuralViolation(incumbent)
  return {
    startingIncumbent,
    candidate,
    incumbent,
    startingQuality,
    finalQuality,
    absoluteGain: Math.max(0, startingQuality - finalQuality),
    gainHistory,
    effortLevel,
    workDelta,
    elapsedMs: Math.max(0, nowMs() - startedAt),
  }
}

export function classifyDecisionOracleOutcome(
  deepenGain: number,
  expandGain: number,
): Exclude<DecisionOracleOutcome, 'inconclusive'> {
  if (!Number.isFinite(deepenGain) || !Number.isFinite(expandGain)) {
    return 'effectively-tied'
  }
  const difference = deepenGain - expandGain
  if (Math.abs(difference) <= DECISION_ORACLE_GAIN_TIE_EPSILON) {
    return 'effectively-tied'
  }
  return difference > 0 ? 'deepen-clearly-wins' : 'expand-clearly-wins'
}

function classifyState(
  recentGains: readonly number[],
  pair: SchedulerDecisionPairResult,
): DecisionOracleStateClass {
  if (
    pair.byAction['expand-capacity'].absoluteGain >
    pair.byAction['deepen-current-regime'].absoluteGain + DECISION_ORACLE_GAIN_TIE_EPSILON
  ) {
    return 'expansion-friendly'
  }
  const mostRecentGain = recentGains[recentGains.length - 1] ?? 0
  return mostRecentGain <= DECISION_ORACLE_RECENT_GAIN_SATURATION_THRESHOLD
    ? 'saturating'
    : 'productive-current-regime'
}

export function runDecisionOracleProbes(
  options: DecisionOracleProbeOptions = {},
): DecisionOracleProbeRecord[] {
  const resolved = normalizeOptions(options)
  const nowMs = resolved.nowMs ?? (() => performance.now())
  const run = resolved.run ?? runStructuralSearch
  const records: DecisionOracleProbeRecord[] = []

  // The manual regression loader verifies fixture hashes and is the only
  // approved real-FR source for this experiment.
  const approvedCases = new Set(loadManualRegressionCases().map(({ id }) => id))
  for (const caseId of resolved.caseIds) {
    if (!approvedCases.has(caseId)) throw new Error(`Unknown manual regression case: ${caseId}`)
    const prepared = prepareManualRegressionDesired(caseId)
    const currentCapacity = Math.min(10, resolved.maximumCapacity)
    const baseConfig = resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
      timeLimitSeconds: 5,
    })
    const warmup = runWarmup(
      prepared,
      baseConfig,
      currentCapacity,
      resolved.warmupMs,
      resolved.warmupInvocations,
      resolved.seedFilters,
      nowMs,
      run,
    )
    const snapshot: SchedulerDecisionSnapshot = {
      desiredDb: [...prepared.desiredDb],
      frequencies: [...prepared.frequenciesHz],
      sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
      baseConfig,
      incumbent: cloneResult(warmup.incumbent),
      currentCapacity,
      maximumCapacity: resolved.maximumCapacity,
      effortLevel: warmup.effortLevel,
      consecutiveNoImprovement: warmup.gainHistory.length === 0
        ? 0
        : warmup.gainHistory.length - warmup.gainHistory.findLastIndex((gain) => gain > DECISION_ORACLE_RECENT_GAIN_SATURATION_THRESHOLD) - 1,
      recentGains: [...warmup.gainHistory],
      cumulativeWork: { ...warmup.workDelta },
      remainingWallClockMs: resolved.decisionMs,
      stageIndex: warmup.gainHistory.length,
    }
    const budget: SchedulerDecisionWorkBudget = {
      structuralSearchInvocations: 1,
      stageQuantumMs: resolved.decisionMs,
    }
    for (let repeatIndex = 0; repeatIndex < resolved.repeats; repeatIndex += 1) {
      const pair = evaluateSchedulerDecisionPair(snapshot, budget, { nowMs, run })
      const invocationComparable = pair.workComparison.equalDimensions.includes(
        'structuralSearchInvocations',
      )
      const outcome = invocationComparable
        ? classifyDecisionOracleOutcome(
          pair.byAction['deepen-current-regime'].absoluteGain,
          pair.byAction['expand-capacity'].absoluteGain,
        )
        : 'inconclusive'
      records.push({
        type: 'decision-oracle-pair',
        caseId,
        repeatIndex,
        stateClass: classifyState(warmup.gainHistory, pair),
        outcome,
        warmup: {
          ...warmup,
          startingIncumbent: cloneResult(warmup.startingIncumbent),
          candidate: cloneResult(warmup.candidate),
          incumbent: cloneResult(warmup.incumbent),
          workDelta: { ...warmup.workDelta },
        },
        snapshot,
        pair,
      })
    }
  }
  return records
}

function workSummary(work: SearchWorkDelta): string {
  return [
    `i${work.structuralSearchInvocations}`,
    `g${work.beamGenerations}`,
    `p${work.proposalsGenerated}`,
    `a${work.proposalsAdmitted}`,
    `l${work.proposalsPolished}`,
    `d${work.duplicateStates}`,
    `r${work.rescueAttempts}`,
    `pa${work.pairAddAttempts}`,
    `c${work.capSwapAttempts}`,
    `rs${work.reseedAttempts}`,
  ].join('/')
}

function range(values: readonly number[]): string {
  if (values.length === 0) return 'n/a'
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  return minimum === maximum ? minimum.toFixed(3) : `${minimum.toFixed(3)}–${maximum.toFixed(3)}`
}

function renderPairRow(record: DecisionOracleProbeRecord): string {
  const deepen = record.pair.byAction['deepen-current-regime']
  const expand = record.pair.byAction['expand-capacity']
  const mismatch = record.pair.workComparison.mismatchedDimensions.join(', ') || 'none'
  return `| ${record.caseId} | ${record.repeatIndex} | ${record.stateClass} | ${record.snapshot.currentCapacity}→${deepen.capacityAfter}/${expand.capacityAfter} | ${deepen.startingQuality[0].toFixed(3)} | ${deepen.absoluteGain.toFixed(3)} | ${expand.absoluteGain.toFixed(3)} | ${workSummary(deepen.workDelta)} | ${workSummary(expand.workDelta)} | ${record.outcome} | ${mismatch} |`
}

export function renderDecisionOracleReport(
  records: readonly DecisionOracleProbeRecord[],
): string {
  const lines = [
    '# AutoEQ V2 scheduler decision oracle',
    '',
    'This report compares isolated deepen/expand continuations from one cloned search snapshot. Each arm receives one structural-search invocation and the same per-invocation deadline; raw work dimensions are reported without a weighted compute score.',
    '',
    '## Paired evidence',
    '',
    '| Case | Repeat | State class | Capacity deepen/expand | Start violation | Deepen gain | Expand gain | Deepen raw work (i/g/p/a/l/d/r/pa/c/rs) | Expand raw work (i/g/p/a/l/d/r/pa/c/rs) | Preference | Mismatched raw dimensions |',
    '| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |',
    ...records.map(renderPairRow),
    '',
    '## Repeatability',
    '',
  ]
  const caseIds = [...new Set(records.map((record) => record.caseId))]
  for (const caseId of caseIds) {
    const cases = records.filter((record) => record.caseId === caseId)
    lines.push(
      `- **${caseId}:** deepen gain ${range(cases.map((record) => record.pair.byAction['deepen-current-regime'].absoluteGain))}; expand gain ${range(cases.map((record) => record.pair.byAction['expand-capacity'].absoluteGain))}; preferences ${[...new Set(cases.map((record) => record.outcome))].join(', ')}.`,
    )
  }
  lines.push(
    '',
    '## Snapshot and fairness notes',
    '',
    '- The warmup continuation starts from the selected seed (empty by default), then snapshots desired curve, evaluation grid, sample rate, base structural config, incumbent filters/quality, current and maximum capacity, effort, stagnation count, recent gain, cumulative raw work, and remaining decision quantum.',
    '- Deepen keeps current capacity and raises effort one level; expand applies `nextScalableCapacity` and resets effort to the initial level. Those action-specific differences are intentional and visible in the record.',
    `- State labels use a ${DECISION_ORACLE_RECENT_GAIN_SATURATION_THRESHOLD.toFixed(2)} normalized-violation reporting threshold for the most recent warmup gain; this threshold is descriptive, not scheduler policy.`,
    '- Structural invocation count and deadline quantum are the equality boundary. Proposal and phase counters can differ and remain explicit limitations rather than being collapsed into one score.',
    '',
  )
  return `${lines.join('\n')}\n`
}

function compactRecord(record: DecisionOracleProbeRecord): Record<string, unknown> {
  const compactArm = (action: 'deepen-current-regime' | 'expand-capacity') => {
    const arm = record.pair.byAction[action]
    return {
      capacityBefore: arm.capacityBefore,
      capacityAfter: arm.capacityAfter,
      effortLevelUsed: arm.effortLevelUsed,
      startingQuality: arm.startingQuality,
      candidateQuality: arm.candidateQuality,
      finalQuality: arm.finalQuality,
      absoluteGain: arm.absoluteGain,
      relativeGain: arm.relativeGain ?? null,
      workDelta: arm.workDelta,
      cumulativeWork: arm.cumulativeWork,
      elapsedMs: arm.elapsedMs,
      finalFilterCount: arm.finalIncumbent.filters.length,
    }
  }
  return {
    type: record.type,
    caseId: record.caseId,
    repeatIndex: record.repeatIndex,
    stateClass: record.stateClass,
    outcome: record.outcome,
    resourceEnvelope: {
      currentCapacity: record.snapshot.currentCapacity,
      maximumCapacity: record.snapshot.maximumCapacity,
      decisionQuantumMs: record.snapshot.remainingWallClockMs,
      structuralSearchInvocations: record.pair.workComparison.requestedStructuralSearchInvocations,
    },
    snapshot: {
      startingFilterCount: record.snapshot.incumbent.filters.length,
      startingQuality: structuralViolation(record.snapshot.incumbent),
      effortLevel: record.snapshot.effortLevel,
      consecutiveNoImprovement: record.snapshot.consecutiveNoImprovement ?? null,
      recentGains: record.snapshot.recentGains ?? [],
      cumulativeWork: record.snapshot.cumulativeWork ?? createSearchWorkDelta(),
      warmup: {
        absoluteGain: record.warmup.absoluteGain,
        workDelta: record.warmup.workDelta,
        elapsedMs: record.warmup.elapsedMs,
        gainHistory: record.warmup.gainHistory,
        effortLevel: record.warmup.effortLevel,
      },
    },
    deepen: compactArm('deepen-current-regime'),
    expand: compactArm('expand-capacity'),
    workComparison: record.pair.workComparison,
  }
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseDecisionOracleArgs(args)
  const records = runDecisionOracleProbes(options)
  if (options.outputMode === 'markdown') {
    process.stdout.write(renderDecisionOracleReport(records))
    return
  }
  for (const record of records) process.stdout.write(`${JSON.stringify(compactRecord(record))}\n`)
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
