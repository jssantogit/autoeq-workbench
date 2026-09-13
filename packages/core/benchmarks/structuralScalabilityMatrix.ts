import { performance } from 'node:perf_hooks'

import {
  AUTOEQ_TIME_LIMIT_OPTIONS,
  DEFAULT_AUTOEQ_SETTINGS,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runStructuralSearch,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from './research/manualRegression.js'

/**
 * Caller-selected structural-search resource samples.
 *
 * This historical probe intentionally has no built-in capacity/time matrix.
 * The defaults are a small smoke set (one envelope per approved case);
 * explicit lists let a researcher
 * reproduce a focused time or capacity comparison without turning any value
 * into an algorithmic mode or creating a Cartesian benchmark by default.
 */
export interface StructuralScalabilityMatrixOptions {
  cases: ManualRegressionCaseId[]
  timeBudgetsSeconds: number[]
  capacityCaps: number[]
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

function parseBudgets(value: string | undefined): number[] {
  if (value === undefined || value.trim().length === 0) {
    throw new Error('--budget requires a positive number')
  }
  const values = value.split(',').map((part) =>
    parsePositiveNumber(part.trim(), '--budget'))
  if (new Set(values).size !== values.length) {
    throw new Error('--budget values must be unique')
  }
  return values.sort((left, right) => left - right)
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

export function parseStructuralScalabilityMatrixArgs(
  args: readonly string[],
): StructuralScalabilityMatrixOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  let cases = knownCaseIds()
  let timeBudgetsSeconds = [AUTOEQ_TIME_LIMIT_OPTIONS[0]]
  let capacityCaps = [DEFAULT_AUTOEQ_SETTINGS.maxFilters]
  let caseSelected = false
  let budgetSelected = false
  let capacitySelected = false

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index]!
    if (argument === '--case') {
      if (caseSelected) throw new Error('--case may be provided only once')
      cases = parseCases(normalizedArgs[++index])
      caseSelected = true
    } else if (argument === '--budget' || argument === '--budget-seconds') {
      if (budgetSelected) throw new Error('--budget may be provided only once')
      timeBudgetsSeconds = parseBudgets(normalizedArgs[++index])
      budgetSelected = true
    } else if (argument === '--capacity' || argument === '--max-filters') {
      if (capacitySelected) throw new Error('--capacity may be provided only once')
      capacityCaps = parseCapacities(normalizedArgs[++index])
      capacitySelected = true
    } else {
      throw new Error(`Unknown structural scalability matrix option: ${argument}`)
    }
  }

  return { cases, timeBudgetsSeconds, capacityCaps }
}

function runCell(
  caseId: ManualRegressionCaseId,
  maxFilters: number,
  budgetSeconds: number,
) {
  const prepared = prepareManualRegressionDesired(caseId)
  const startedAt = performance.now()
  const deadlineAt = startedAt + budgetSeconds * 1_000
  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config: {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds: budgetSeconds,
      }),
      maxFilters,
    },
    deadline: { isExpired: () => performance.now() >= deadlineAt },
    seedFilters: [],
  })
  const elapsedMs = performance.now() - startedAt
  return {
    maxFilters,
    budgetSeconds,
    elapsedMs,
    deadlineExpired: performance.now() >= deadlineAt,
    filterCount: result.filters.length,
    rmseDb: result.rmseDb,
    maxAbsDb: result.maxAbsDb,
    violation: Math.max(result.rmseDb / 0.25, result.maxAbsDb / 0.75),
  }
}

const options = parseStructuralScalabilityMatrixArgs(process.argv.slice(2))
const rows = []
const cells = new Map<string, ReturnType<typeof runCell>>()
const getCell = (
  caseId: ManualRegressionCaseId,
  maxFilters: number,
  budgetSeconds: number,
) => {
  const key = `${caseId}|${budgetSeconds}|${maxFilters}`
  const existing = cells.get(key)
  if (existing !== undefined) return existing
  const created = runCell(caseId, maxFilters, budgetSeconds)
  cells.set(key, created)
  return created
}

for (const caseId of options.cases) {
  const baselineCapacity = options.capacityCaps[0]!
  const capacityBudget = options.timeBudgetsSeconds.at(-1)!
  const timeSweep = options.timeBudgetsSeconds.map(
    (budgetSeconds) => getCell(caseId, baselineCapacity, budgetSeconds),
  )
  const capacitySweep = options.capacityCaps.map(
    (maxFilters) => getCell(caseId, maxFilters, capacityBudget),
  )

  const timeMonotonic = timeSweep.every(
    (cell, index) => index === 0 ||
      cell.violation <= timeSweep[index - 1]!.violation + 1e-9,
  )
  const capacityMonotonic = capacitySweep.every(
    (cell, index) => index === 0 ||
      cell.violation <= capacitySweep[index - 1]!.violation + 1e-9,
  )

  rows.push({
    caseId,
    timeSweep,
    capacitySweep,
    timeMonotonic,
    capacityMonotonic,
  })
}

console.log(JSON.stringify({
  timeBudgetsSeconds: options.timeBudgetsSeconds,
  capacityCaps: options.capacityCaps,
  rows,
  summary: {
    timeMonotonicCases: rows.filter((row) => row.timeMonotonic).length,
    capacityMonotonicCases: rows.filter((row) => row.capacityMonotonic).length,
    totalCases: rows.length,
    totalCells: cells.size,
  },
}, null, 2))
