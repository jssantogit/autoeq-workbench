import { calculateErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { auditCancellations } from '../../src/autoeq/cancellation.js'
import type { Filter } from '../../src/types/filter.js'
import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  referenceSelectorKey,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
  type ResolvedStructuralSearchConfig,
  type StructuralSearchBaselineEvaluation,
  type SearchState,
} from '../../src/autoeq/v2/structuralSearch.js'
import { resolveScalableEffortConfig } from '../../src/autoeq/v2/scalableStructuralSearch.js'

export const C3_CORPUS_VERSION = 'fresh-real-corpus-v1.2' as const
export const C3_CORPUS_COMMIT = 'fc3932c72e3c3931dc062c523c2205389639264b' as const
export const C3_CORPUS_CLASSIFICATION = 'CORPUS_V1_2_READY' as const
export const C3_CORPUS_EVIDENCE_SHA256 = '13c7ff43614d7e257b0231f9238102afff5413964077017a2db7741d87b659b1' as const
export const C3_UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7' as const
export const C3_UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96' as const

export const C3_BATCH_A_CASE_IDS = Object.freeze([
  'frc1.1-12-0002977aa8bc',
  'frc1.1-09-0001b6618e24',
  'frc1.1-10-00027122c3ce',
  'frc1.1-03-00003906daac',
  'frc1.1-15-000323cd8787',
  'frc1.1-06-0000c6497763',
] as const)

export const C3_BATCH_A_DEVELOPMENT_IDS = Object.freeze(C3_BATCH_A_CASE_IDS.slice(0, 3))
export const C3_BATCH_A_HOLDOUT_IDS = Object.freeze(C3_BATCH_A_CASE_IDS.slice(3))

export const C3_BATCH_B_CASE_IDS = Object.freeze([
  'frc1.1-08-0000f6762889',
  'frc1.1-11-000279686a75',
  'frc1.1-07-0000c470a9b3',
  'frc1.1-14-00025d5729a1',
  'frc1.1-13-000225a01a6d',
  'frc1.1-17-00036da52192',
] as const)

export const C3_BATCH_C_CASE_IDS = Object.freeze([
  'frc1.1-05-0000a93dae04',
  'frc1.1-18-0003c77fd5b4',
  'frc1.1-01-000013d2c2cd',
  'frc1.1-16-0003622f8ec5',
  'frc1.1-02-00002f5caf38',
  'frc1.1-04-00007c13a25b',
] as const)

/** Historical Structural VNext six-case IDs; never admissible for C3. */
export const C3_OLD_STRUCTURAL_VNEXT_CASE_IDS = Object.freeze([
  'titan-to-rsv',
  'titan-to-mystic-8',
  'titan-to-s12-ultra',
  'titan-to-storm',
  'titan-to-u12t',
  'titan-to-trio',
] as const)

export const C3_MAX_GENERATIONS = 31 as const
export const C3_STRUCTURAL_CEILING = 43 as const
export const C3_EFFORT_LEVEL = 6 as const

export function resolveC3SearchConfig(): ResolvedStructuralSearchConfig {
  const base = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  })
  return resolveScalableEffortConfig(base, C3_STRUCTURAL_CEILING, C3_EFFORT_LEVEL)
}

export function assertC3BatchACaseIds(caseIds: readonly string[]): void {
  if (caseIds.some((id) => C3_BATCH_B_CASE_IDS.includes(id as (typeof C3_BATCH_B_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects Batch B case IDs')
  }
  if (caseIds.some((id) => C3_BATCH_C_CASE_IDS.includes(id as (typeof C3_BATCH_C_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects Batch C case IDs')
  }
  if (caseIds.some((id) => C3_OLD_STRUCTURAL_VNEXT_CASE_IDS.includes(id as (typeof C3_OLD_STRUCTURAL_VNEXT_CASE_IDS)[number]))) {
    throw new Error('C3 runner rejects old Structural VNext six-case IDs')
  }
  const expected = [...C3_BATCH_A_CASE_IDS].sort()
  const actual = [...caseIds].sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`C3 runner requires exactly Batch A six case IDs; received ${caseIds.join(', ')}`)
  }
}

export interface C3ObservedState {
  filterStateKey: string
  filters: readonly Filter[]
  rmseDb: number
  maxAbsDb: number
  maeDb: number
  cancellationScore?: number
  stage: string
  generation?: number
}

export interface C3PreparedSearchGrid {
  frequenciesHz: readonly number[]
  desiredDb: readonly number[]
  sampleRateHz: number
}

/** Convert the structural observer's quantized state into C3 evidence. */
export function observedStateFromBaselineEvaluation(
  event: StructuralSearchBaselineEvaluation,
  grid: C3PreparedSearchGrid,
): C3ObservedState {
  const filters = event.state.filters.map((filter) => ({ ...filter }))
  const responseDb = cascadeMagnitudeDb(filters, grid.frequenciesHz, grid.sampleRateHz)
  const residualDb = grid.desiredDb.map((desired, index) => desired - responseDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, grid.frequenciesHz)
  return {
    filterStateKey: JSON.stringify(filters.map(({ id: _id, ...filter }) => filter)),
    filters,
    rmseDb: metrics.rmseDb,
    maxAbsDb: metrics.maxAbsDb,
    maeDb: metrics.maeDb,
    cancellationScore: event.state.cancellationScore,
    stage: event.stage,
    generation: event.generation,
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function workCounters(trace: readonly StructuralSearchTraceEvent[]): Record<string, number> {
  const counters = {
    beamGenerations: 0,
    proposalsGenerated: 0,
    proposalsAdmitted: 0,
    proposalsPolished: 0,
    duplicateStates: 0,
    rescueAttempts: 0,
    pairAddAttempts: 0,
    capSwapAttempts: 0,
  }
  for (const event of trace) {
    if (event.type === 'beam-generation') {
      counters.beamGenerations += 1
      counters.proposalsGenerated += event.generatedProposals ?? 0
      counters.proposalsAdmitted += event.admittedProposals ?? 0
      counters.proposalsPolished += event.polishedProposals ?? 0
      counters.duplicateStates += event.duplicateStates ?? 0
    }
    if (event.type === 'phase') {
      const attempts = event.attempts ?? event.acceptedSteps ?? 0
      if (event.phase === 'rescue') counters.rescueAttempts += attempts
      if (event.phase === 'pair-add') counters.pairAddAttempts += attempts
      if (event.phase === 'cap-swap') counters.capSwapAttempts += attempts
    }
  }
  return counters
}

/** Run one deterministic C3 trajectory; no wall-clock deadline is consulted. */
export function runC3DeterministicBaseline(
  grid: C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number; observeEvaluations?: boolean } = {},
): C3DeterministicTrajectory {
  const config = options.config ?? resolveC3SearchConfig()
  const maxGenerations = options.maxGenerations ?? C3_MAX_GENERATIONS
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations <= 0) {
    throw new Error('C3 deterministic generation bound must be a positive integer')
  }
  const observations: C3ObservedState[] = []
  const trace: StructuralSearchTraceEvent[] = []
  const retainedBeamSequence: C3DeterministicTrajectory['retainedBeamSequence'] = []
  let imposedBoundaryReached = false
  let naturalStopGeneration: number | null = null
  const result = runStructuralSearch({
    desiredDb: [...grid.desiredDb],
    frequencies: [...grid.frequenciesHz],
    sampleRateHz: grid.sampleRateHz,
    config: { ...config },
    seedFilters: [],
    deadline: { isExpired: () => imposedBoundaryReached },
    onTrace: (event) => {
      trace.push({
        ...event,
        ...(event.capacityPressure === undefined ? {} : { capacityPressure: { ...event.capacityPressure } }),
        ...(event.frontierUtilization === undefined ? {} : { frontierUtilization: { ...event.frontierUtilization } }),
      })
      if (event.type === 'beam-generation' && event.generation !== undefined && event.generation >= maxGenerations - 1) {
        imposedBoundaryReached = true
      }
      if (event.type === 'beam-stop' && event.reason === 'no-next-states') {
        naturalStopGeneration = event.generation ?? null
      }
    },
    ...(options.observeEvaluations === false ? {} : {
      onBaselineEvaluation: (event: StructuralSearchBaselineEvaluation) => {
        observations.push(observedStateFromBaselineEvaluation(event, grid))
      },
    }),
    onBaselineState: (event) => {
      retainedBeamSequence.push(event.retainedBeam.map((state) => ({
        filterStateKey: JSON.stringify(state.filters.map(({ id: _id, ...filter }) => filter)),
        filterCount: state.filters.length,
      })))
    },
  })
  const completedGenerationCount = trace.filter((event) => event.type === 'beam-generation').length
  const terminalGeneration = naturalStopGeneration ?? Math.max(0, completedGenerationCount - 1)
  return {
    result,
    observations,
    trace,
    retainedBeamSequence,
    completedGenerationCount,
    naturalStopGeneration,
    terminalGeneration,
    terminalReason: naturalStopGeneration === null ? 'generation-bound' : 'natural-stop',
  }
}

export function runC3ObserverFidelity(
  grid: C3PreparedSearchGrid,
  options: { config?: ResolvedStructuralSearchConfig; maxGenerations?: number } = {},
): C3ObserverFidelity {
  const config = options.config ?? resolveC3SearchConfig()
  const maxGenerations = options.maxGenerations ?? C3_MAX_GENERATIONS
  const off = runC3DeterministicBaseline(grid, { config, maxGenerations, observeEvaluations: false })
  const on = runC3DeterministicBaseline(grid, { config, maxGenerations, observeEvaluations: true })
  const resultEqual = stableJson(off.result) === stableJson(on.result)
  const completedGenerationCountEqual = off.completedGenerationCount === on.completedGenerationCount
  const retainedBeamSequenceEqual = stableJson(off.retainedBeamSequence) === stableJson(on.retainedBeamSequence)
  const workCountersEqual = stableJson(workCounters(off.trace)) === stableJson(workCounters(on.trace))
  const naturalTerminationEqual = off.naturalStopGeneration === on.naturalStopGeneration &&
    off.terminalGeneration === on.terminalGeneration
  const traceEqual = stableJson(off.trace) === stableJson(on.trace)
  return {
    equivalent: resultEqual && completedGenerationCountEqual && retainedBeamSequenceEqual &&
      workCountersEqual && naturalTerminationEqual && traceEqual,
    resultEqual,
    completedGenerationCountEqual,
    retainedBeamSequenceEqual,
    workCountersEqual,
    naturalTerminationEqual,
    traceEqual,
    off,
    on,
  }
}

export interface C3ExactFrontierPoint extends C3ObservedState {
  N: number
  normalizedViolation: number
}

export interface C3FrontierPoint extends C3ExactFrontierPoint {
  representativeFilterCount: number
}

export interface C3KneeResult {
  status: 'UNIQUE_KNEE' | 'NO_UNIQUE_KNEE'
  reason?: 'NO_POSITIVE_INTERIOR_DISTANCE' | 'TIED_MAXIMUM' | 'INSUFFICIENT_FRONTIER' | 'INSUFFICIENT_SPAN'
  N_knee?: number
  distance?: number
}

export interface C3PrefixKnee {
  prefix: 'g10' | 'g20' | 'g30-final'
  frontier: C3FrontierPoint[]
  knee: C3KneeResult
}

export interface C3StateSecondaryMetrics {
  cancellationScore: number
  qP50: number
  qP90: number
  qMax: number
  maxAbsGainDb: number
  sumAbsGainDb: number
  opposingNearbyCancellationPairCount: number
}

export interface C3KneeVsFinalMetrics {
  N_knee: number | null
  N_final: number
  filtersSaved: number | null
  violationKnee: number | null
  violationFinal: number
  rmseKnee: number | null
  rmseFinal: number
  maxAbsKnee: number | null
  maxAbsFinal: number
  maeKnee: number | null
  maeFinal: number
  fractionFrontierImprovementCapturedAtKnee: number | null
  residualImprovementAfterKnee: number | null
  kneeSecondary: C3StateSecondaryMetrics | null
  finalSecondary: C3StateSecondaryMetrics
}

export interface C3DeterministicTrajectory {
  result: StructuralSearchResult
  observations: C3ObservedState[]
  trace: StructuralSearchTraceEvent[]
  retainedBeamSequence: Array<Array<{ filterStateKey: string; filterCount: number }>>
  completedGenerationCount: number
  naturalStopGeneration: number | null
  terminalGeneration: number
  terminalReason: 'natural-stop' | 'generation-bound'
}

export interface C3ObserverFidelity {
  equivalent: boolean
  resultEqual: boolean
  completedGenerationCountEqual: boolean
  retainedBeamSequenceEqual: boolean
  workCountersEqual: boolean
  naturalTerminationEqual: boolean
  traceEqual: boolean
  off: C3DeterministicTrajectory
  on: C3DeterministicTrajectory
}

function cloneObservedState(state: C3ObservedState): C3ObservedState {
  return {
    ...state,
    filters: state.filters.map((filter) => ({ ...filter })),
  }
}

function compareKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined || rightValue === undefined) {
      if (leftValue === rightValue) continue
      return leftValue === undefined ? -1 : 1
    }
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

/** Compare observations with the frozen structural reference ordering. */
function compareFrozenQuality(left: C3ObservedState, right: C3ObservedState): number {
  const toSearchState = (state: C3ObservedState): SearchState => ({
    candidateId: state.filterStateKey,
    filters: state.filters.map((filter) => ({ ...filter })),
    rmseDb: state.rmseDb,
    maxAbsDb: state.maxAbsDb,
    cancellationScore: state.cancellationScore ?? 0,
  })
  return compareKeys(
    referenceSelectorKey(toSearchState(left)),
    referenceSelectorKey(toSearchState(right)),
  )
}

export function computeExactCountSeries(states: readonly C3ObservedState[]): C3ExactFrontierPoint[] {
  const bestByCount = new Map<number, C3ObservedState>()
  for (const state of states) {
    const copy = cloneObservedState(state)
    const N = copy.filters.length
    const incumbent = bestByCount.get(N)
    if (incumbent === undefined || compareFrozenQuality(copy, incumbent) < 0) {
      bestByCount.set(N, copy)
    }
  }
  return [...bestByCount.entries()]
    .sort(([left], [right]) => left - right)
    .map(([N, state]) => ({
      ...state,
      N,
      normalizedViolation: Math.max(state.rmseDb / 0.25, state.maxAbsDb / 0.75),
    }))
}

export function computeCumulativeFrontier(exact: readonly C3ExactFrontierPoint[]): C3FrontierPoint[] {
  const sorted = [...exact].sort((left, right) => left.N - right.N)
  let representative: C3ExactFrontierPoint | undefined
  return sorted.map((point) => {
    if (
      representative === undefined ||
      point.normalizedViolation < representative.normalizedViolation ||
      (point.normalizedViolation === representative.normalizedViolation &&
        compareFrozenQuality(point, representative) < 0)
    ) {
      representative = point
    }
    return {
      ...cloneObservedState(representative),
      N: point.N,
      normalizedViolation: representative.normalizedViolation,
      representativeFilterCount: representative.N,
    }
  })
}

export function computePrefixKnee(
  states: readonly C3ObservedState[],
  prefix: 'g10' | 'g20' | 'g30-final',
): C3PrefixKnee {
  const maximumGeneration = prefix === 'g10' ? 10 : prefix === 'g20' ? 20 : Number.POSITIVE_INFINITY
  const prefixStates = states.filter((state) =>
    state.generation === undefined || state.generation <= maximumGeneration)
  const frontier = computeCumulativeFrontier(computeExactCountSeries(prefixStates))
  return { prefix, frontier, knee: selectGeometricKnee(frontier) }
}

export function classifyC3Case(
  finalFrontier: readonly C3FrontierPoint[],
  finalFilterCount: number,
): 'KNEE_CASE' | 'NO_KNEE_CASE' {
  const knee = selectGeometricKnee(finalFrontier)
  return knee.status === 'UNIQUE_KNEE' && knee.N_knee! < finalFilterCount
    ? 'KNEE_CASE'
    : 'NO_KNEE_CASE'
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

export function secondaryMetricsForState(
  state: Pick<C3ObservedState, 'filters' | 'cancellationScore'>,
  grid: C3PreparedSearchGrid,
): C3StateSecondaryMetrics {
  const filters = state.filters
  const qValues = filters.map((filter) => filter.q).filter(Number.isFinite)
  const cancellation = auditCancellations(filters, grid.frequenciesHz, grid.sampleRateHz)
  return {
    cancellationScore: state.cancellationScore ?? cancellation.totalScore,
    qP50: percentile(qValues, 0.5),
    qP90: percentile(qValues, 0.9),
    qMax: qValues.length === 0 ? 0 : Math.max(...qValues),
    maxAbsGainDb: filters.length === 0 ? 0 : Math.max(...filters.map((filter) => Math.abs(filter.gainDb))),
    sumAbsGainDb: filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0),
    opposingNearbyCancellationPairCount: cancellation.pairs.length,
  }
}

export function summarizeKneeVsFinal(
  frontier: readonly C3FrontierPoint[],
  knee: C3KneeResult,
  finalFilterCount: number,
  grid: C3PreparedSearchGrid,
): C3KneeVsFinalMetrics {
  const finalPoint = frontier.at(-1)
  if (finalPoint === undefined) throw new Error('C3 final frontier must not be empty')
  const kneePoint = knee.status === 'UNIQUE_KNEE'
    ? frontier.find((point) => point.N === knee.N_knee) ?? null
    : null
  const totalImprovement = frontier[0]!.normalizedViolation - finalPoint.normalizedViolation
  const kneeImprovement = kneePoint === null
    ? null
    : frontier[0]!.normalizedViolation - kneePoint.normalizedViolation
  return {
    N_knee: kneePoint?.N ?? null,
    N_final: finalFilterCount,
    filtersSaved: kneePoint === null ? null : finalFilterCount - kneePoint.N,
    violationKnee: kneePoint?.normalizedViolation ?? null,
    violationFinal: finalPoint.normalizedViolation,
    rmseKnee: kneePoint?.rmseDb ?? null,
    rmseFinal: finalPoint.rmseDb,
    maxAbsKnee: kneePoint?.maxAbsDb ?? null,
    maxAbsFinal: finalPoint.maxAbsDb,
    maeKnee: kneePoint?.maeDb ?? null,
    maeFinal: finalPoint.maeDb,
    fractionFrontierImprovementCapturedAtKnee: kneePoint === null || totalImprovement === 0
      ? null
      : kneeImprovement! / totalImprovement,
    residualImprovementAfterKnee: kneePoint === null ? null : kneePoint.normalizedViolation - finalPoint.normalizedViolation,
    kneeSecondary: kneePoint === null ? null : secondaryMetricsForState(kneePoint, grid),
    finalSecondary: secondaryMetricsForState(finalPoint, grid),
  }
}

export function selectGeometricKnee(frontier: readonly C3FrontierPoint[]): C3KneeResult {
  if (frontier.length < 3) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'INSUFFICIENT_FRONTIER' }
  }

  const N_min = frontier[0]!.N
  const N_max = frontier.at(-1)!.N
  const E_max = frontier[0]!.normalizedViolation
  const E_min = frontier.at(-1)!.normalizedViolation
  const N_span = N_max - N_min
  const E_span = E_max - E_min
  if (N_span === 0 || E_span === 0) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'INSUFFICIENT_SPAN' }
  }

  let bestN: number | undefined
  let bestDistance: number | undefined
  let tied = false
  for (let index = 1; index < frontier.length - 1; index += 1) {
    const point = frontier[index]!
    const x = (point.N - N_min) / N_span
    const y = (point.normalizedViolation - E_min) / E_span
    const distance = (1 - x) - y
    if (!(distance > 0)) continue
    if (bestDistance === undefined || distance > bestDistance) {
      bestDistance = distance
      bestN = point.N
      tied = false
    } else if (distance === bestDistance) {
      tied = true
    }
  }

  if (bestDistance === undefined || bestN === undefined) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'NO_POSITIVE_INTERIOR_DISTANCE' }
  }
  if (tied) {
    return { status: 'NO_UNIQUE_KNEE', reason: 'TIED_MAXIMUM' }
  }
  return { status: 'UNIQUE_KNEE', N_knee: bestN, distance: bestDistance }
}
