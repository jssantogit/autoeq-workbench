import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  SCALABLE_BASE_CAPACITY,
  SCALABLE_CAPACITY_GROWTH,
  resolveStructuralSearchConfig,
  runScalableStructuralSearch,
  structuralViolation,
} from '../src/index.js'
import type {
  ScalableSearchStage,
  ScalableStructuralSearchInput,
  ScalableStructuralSearchResult,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from './research/manualRegression.js'

export const SCALABLE_CAPACITY_LADDER_DEFAULT_BUDGET_SECONDS = 60
export const SCALABLE_CAPACITY_LADDER_DEFAULT_FINAL_CAPS = [10, 15, 20] as const

export type ScalableCapacityLadderStage = ScalableSearchStage & {
  stageElapsedMs: number
  totalElapsedMs: number
}

export interface ScalableCapacityLadderCellSelection {
  caseId: ManualRegressionCaseId
  finalMaxFilters: number
  budgetSeconds: number
}

export interface ScalableCapacityLadderOptions {
  cases: ManualRegressionCaseId[]
  finalCaps: number[]
  budgetSeconds: number
  outputMode: 'json' | 'jsonl'
}

export interface ScalableCapacityLadderCell
  extends ScalableCapacityLadderCellSelection {
  elapsedMs: number
  deadlineExpired: boolean
  finalFilterCount: number
  finalRmseDb: number
  finalMaxAbsDb: number
  finalViolation: number
  stagesCompleted: number
  stages: ScalableCapacityLadderStage[]
}

export interface ScalableCapacityLadderRow {
  caseId: ManualRegressionCaseId
  cells: ScalableCapacityLadderCell[]
  monotonic: boolean
}

export interface ScalableCapacityLadderResult {
  totalBudgetSeconds: number
  baseCapacity: number
  growthFactor: number
  finalCaps: number[]
  cells: ScalableCapacityLadderCell[]
  rows: ScalableCapacityLadderRow[]
  monotonicCases: number
}

export type ScalableCapacitySearchRunner = (
  input: ScalableStructuralSearchInput,
) => ScalableStructuralSearchResult

export interface RunScalableCapacityLadderOptions
  extends ScalableCapacityLadderOptions {
  nowMs?: () => number
  run?: ScalableCapacitySearchRunner
  onCell?: (cell: ScalableCapacityLadderCell) => void
}

export interface ScalableCapacityLadderMainDependencies {
  nowMs?: () => number
  run?: ScalableCapacitySearchRunner
  writeLine?: (line: string) => void
}

function parsePositiveNumber(value: string | undefined, flag: string): number {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${flag} requires a positive number`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`)
  }
  return parsed
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = parsePositiveNumber(value, flag)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} requires a positive integer`)
  }
  return parsed
}

function knownCaseIds(): ManualRegressionCaseId[] {
  return loadManualRegressionCases().map(({ id }) => id)
}

function parseCases(value: string | undefined): ManualRegressionCaseId[] {
  if (value === undefined || value.trim().length === 0) {
    throw new Error('--case requires an approved case ID')
  }
  const known = new Set(knownCaseIds())
  const cases = value.split(',').map((part) => part.trim())
  if (cases.some((caseId) => !known.has(caseId as ManualRegressionCaseId))) {
    throw new Error('--case requires an approved case ID')
  }
  const unique = [...new Set(cases)]
  if (unique.length !== cases.length) throw new Error('--case values must be unique')
  return unique as ManualRegressionCaseId[]
}

function parseCapacities(value: string | undefined): number[] {
  if (value === undefined || value.trim().length === 0) {
    throw new Error('--capacity requires a positive integer')
  }
  const values = value.split(',').map((part) =>
    parsePositiveInteger(part.trim(), '--capacity'))
  if (new Set(values).size !== values.length) {
    throw new Error('--capacity values must be unique')
  }
  return values.sort((left, right) => left - right)
}

export function parseScalableCapacityLadderArgs(
  args: readonly string[],
): ScalableCapacityLadderOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  let cases = knownCaseIds()
  let finalCaps: number[] = [...SCALABLE_CAPACITY_LADDER_DEFAULT_FINAL_CAPS]
  let budgetSeconds = SCALABLE_CAPACITY_LADDER_DEFAULT_BUDGET_SECONDS
  let outputMode: ScalableCapacityLadderOptions['outputMode'] = 'jsonl'
  let caseSelected = false
  let capacitySelected = false

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index]!
    if (argument === '--case') {
      if (caseSelected) throw new Error('--case may be provided only once')
      cases = parseCases(normalizedArgs[++index])
      caseSelected = true
    } else if (argument === '--capacity') {
      if (capacitySelected) throw new Error('--capacity may be provided only once')
      finalCaps = parseCapacities(normalizedArgs[++index])
      capacitySelected = true
    } else if (argument === '--budget-seconds' || argument === '--budget') {
      budgetSeconds = parsePositiveNumber(normalizedArgs[++index], argument)
    } else if (argument === '--jsonl') {
      outputMode = 'jsonl'
    } else if (argument === '--json') {
      outputMode = 'json'
    } else {
      throw new Error(`Unknown scalable capacity ladder option: ${argument}`)
    }
  }

  return { cases, finalCaps, budgetSeconds, outputMode }
}

export function createScalableCapacityCells(
  options: Pick<ScalableCapacityLadderOptions, 'cases' | 'finalCaps' | 'budgetSeconds'>,
): ScalableCapacityLadderCellSelection[] {
  const cells: ScalableCapacityLadderCellSelection[] = []
  const seen = new Set<string>()
  for (const caseId of options.cases) {
    for (const finalMaxFilters of options.finalCaps) {
      const key = `${caseId}|${finalMaxFilters}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push({ caseId, finalMaxFilters, budgetSeconds: options.budgetSeconds })
    }
  }
  return cells
}

export function runScalableCapacityCell(options: ScalableCapacityLadderCellSelection & {
  nowMs?: () => number
  run?: ScalableCapacitySearchRunner
}): ScalableCapacityLadderCell {
  if (!Number.isFinite(options.budgetSeconds) || options.budgetSeconds <= 0) {
    throw new Error('budgetSeconds must be a positive number')
  }
  if (!Number.isSafeInteger(options.finalMaxFilters) || options.finalMaxFilters <= 0) {
    throw new Error('finalMaxFilters must be a positive integer')
  }

  const prepared = prepareManualRegressionDesired(options.caseId)
  const nowMs = options.nowMs ?? (() => performance.now())
  const startedAt = nowMs()
  const deadlineAt = startedAt + options.budgetSeconds * 1_000
  const stages: ScalableCapacityLadderStage[] = []
  let previousElapsedMs = 0
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: options.budgetSeconds,
  })
  const run = options.run ?? runScalableStructuralSearch
  const result = run({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    maxFilters: options.finalMaxFilters,
    baseConfig,
    deadline: { isExpired: () => nowMs() >= deadlineAt },
    nowMs,
    onStage: (stage) => {
      const totalElapsedMs = nowMs() - startedAt
      stages.push({
        ...stage,
        stageElapsedMs: totalElapsedMs - previousElapsedMs,
        totalElapsedMs,
      })
      previousElapsedMs = totalElapsedMs
    },
  })
  const elapsedMs = nowMs() - startedAt

  return {
    caseId: options.caseId,
    finalMaxFilters: options.finalMaxFilters,
    budgetSeconds: options.budgetSeconds,
    elapsedMs,
    deadlineExpired: nowMs() >= deadlineAt,
    finalFilterCount: result.filters.length,
    finalRmseDb: result.rmseDb,
    finalMaxAbsDb: result.maxAbsDb,
    finalViolation: structuralViolation(result),
    stagesCompleted: result.stagesCompleted,
    stages,
  }
}

export function runScalableCapacityLadder(
  options: RunScalableCapacityLadderOptions,
): ScalableCapacityLadderResult {
  const cells: ScalableCapacityLadderCell[] = []
  for (const selection of createScalableCapacityCells(options)) {
    const cell = runScalableCapacityCell({
      ...selection,
      nowMs: options.nowMs,
      run: options.run,
    })
    cells.push(cell)
    options.onCell?.(cell)
  }

  const rows = options.cases.map((caseId) => {
    const caseCells = cells.filter((cell) => cell.caseId === caseId)
    return {
      caseId,
      cells: caseCells,
      monotonic: caseCells.every(
        (cell, index) => index === 0 ||
          cell.finalViolation <= caseCells[index - 1]!.finalViolation + 1e-9,
      ),
    }
  })

  return {
    totalBudgetSeconds: options.budgetSeconds,
    baseCapacity: SCALABLE_BASE_CAPACITY,
    growthFactor: SCALABLE_CAPACITY_GROWTH,
    finalCaps: [...options.finalCaps],
    cells,
    rows,
    monotonicCases: rows.filter((row) => row.monotonic).length,
  }
}

export function main(
  args: readonly string[] = process.argv.slice(2),
  dependencies: ScalableCapacityLadderMainDependencies = {},
): void {
  const options = parseScalableCapacityLadderArgs(args)
  const writeLine = dependencies.writeLine ?? ((line: string) => {
    process.stdout.write(`${line}\n`)
  })
  const result = runScalableCapacityLadder({
    ...options,
    nowMs: dependencies.nowMs,
    run: dependencies.run,
    onCell: options.outputMode === 'jsonl'
      ? (cell) => writeLine(JSON.stringify({ type: 'cell', ...cell }))
      : undefined,
  })

  if (options.outputMode === 'jsonl') {
    writeLine(JSON.stringify({ type: 'summary', ...result }))
  } else {
    writeLine(JSON.stringify(result, null, 2))
  }
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
