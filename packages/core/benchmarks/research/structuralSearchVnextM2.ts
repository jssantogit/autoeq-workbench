import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  addSearchWorkDelta,
  createSearchWorkDelta,
  resolveStandardAutoEqV2Config,
  runStructuralSearch,
  runStructuralSearchVNext,
  runStructuralSearchVNextM2,
  searchWorkDeltaFromTrace,
  structuralViolation,
  type SearchWorkTotals,
  type StructuralSearchInput,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from '../../src/index.js'
import type { Filter } from '../../src/types/filter.js'
import type { StructuralImprovementPhase } from '../../src/autoeq/v2/structuralSearch.js'
import {
  calculateResearchDeliveredMetrics,
  evaluateQuantizationStress,
  verifyResearchPreamp,
  type ResearchDeliveredMetrics,
} from './deliveredMetrics.js'
import {
  MANUAL_REGRESSION_FIXTURE_SHA256,
  prepareManualRegressionDesired,
} from './manualRegression.js'
import {
  RESEARCH_CORPUS_SHA256,
  prepareResearchDesired,
} from './corpus.js'
import {
  createSyntheticCapacityProbeSequence,
  loadSyntheticGroundTruthCorpus,
} from './syntheticCorpus.js'
import {
  createM1ResourceEnvelope,
  M1_EFFORT_LEVEL,
  M1_IMPLEMENTATION_SHA,
  M1_REAL_CASES,
  M1_REPEAT_COUNT,
  M1_CHECKPOINT_SECONDS,
  M1_STRUCTURAL_CEILING,
  M1_SYNTHETIC_CASES,
  type M1RealCaseId,
  type M1ResourceEnvelope,
  type M1SyntheticCaseId,
} from './structuralSearchVnext.js'

export const M2_STRUCTURAL_CEILING = M1_STRUCTURAL_CEILING
export const M2_EFFORT_LEVEL = M1_EFFORT_LEVEL
export const M2_CHECKPOINT_SECONDS = M1_CHECKPOINT_SECONDS
export const M2_REPEAT_COUNT = M1_REPEAT_COUNT
export const M2_RUNNER_SCHEMA_VERSION = 1 as const
export const M2_DEFAULT_OUTPUT_DIR = resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
  '.research-artifacts/structural-search-vnext-m2-protected-progress',
)

export type M2Engine = 'baseline' | 'm2' | 'm1-vnext-control'
export type M2RealCaseId = M1RealCaseId
export type M2SyntheticCaseId = M1SyntheticCaseId
export type M2CaseId = M2RealCaseId | M2SyntheticCaseId

export interface M2ResourceEnvelope extends Omit<M1ResourceEnvelope, 'deadlinePolicy'> {
  deadlinePolicy: 'one-continuing-run-with-nominal-checkpoints'
}

export interface M2NumericSummary {
  best: number
  median: number
  worst: number
  spread: number
}

export interface M2Metrics {
  maeDb: number | null
  rmseDb: number
  maxAbsDb: number
}

export interface M2OrdinaryTelemetry {
  ordinaryBeamGenerations: number
  ordinaryProposalsGenerated: number
  ordinaryProposalsAdmitted: number
  ordinaryProposalsPolished: number
}

export interface M2ExperimentalTelemetry {
  stallEvents: number
  challengerCandidatesConstructed: number
  challengerPolishAttempts: number
  challengerAcceptedIntoBeam: number
  challengerIncumbentImprovements: number
  finalIncumbentPhase: StructuralImprovementPhase | null
}

export interface M2CheckpointRecord {
  checkpointReached: boolean
  observedElapsedMs: number
  metrics: M2Metrics
  structuralViolation: number
  deliveredFilterCount: number
  frontierMaxFilterCount: number
  rawWorkCounters: SearchWorkTotals
  ordinaryTelemetry: M2OrdinaryTelemetry
  experimentalTelemetry: M2ExperimentalTelemetry
}

export interface M2RunRecord extends M2CheckpointRecord {
  schemaVersion: typeof M2_RUNNER_SCHEMA_VERSION
  engine: M2Engine
  caseId: M2CaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  knownStructuralComplexity?: number
  structuralCeiling: number
  effortLevel: number
  checkpointSeconds: number
  repeatIndex: number
  trajectoryRunId: string
  trajectoryElapsedMs: number
  resourceEnvelope: M2ResourceEnvelope
  filters: Filter[]
  finalDelivered: ResearchDeliveredMetrics
}

export type M2WorkSummary = {
  [key in keyof SearchWorkTotals]: M2NumericSummary
}

export interface M2AggregateRow {
  engine: M2Engine
  caseId: M2CaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  knownStructuralComplexity?: number
  structuralCeiling: number
  checkpointSeconds: number
  repeatCount: number
  checkpointReachedCount: number
  maeDb: M2NumericSummary | null
  rmseDb: M2NumericSummary
  maxAbsDb: M2NumericSummary
  structuralViolation: M2NumericSummary
  deliveredFilterCount: M2NumericSummary
  frontierMaxFilterCount: M2NumericSummary
  actualElapsedMs: M2NumericSummary
  rawWorkCounters: M2WorkSummary
  ordinaryTelemetry: M2OrdinaryTelemetry
  experimentalTelemetry: M2ExperimentalTelemetry
}

export interface M2WorkComparisonCell {
  caseId: M2CaseId
  structuralCeiling: number
  checkpointSeconds: number
  repeatCount: number
  ordinary: {
    baseline: M2OrdinaryTelemetry
    m2: M2OrdinaryTelemetry
    delta: M2OrdinaryTelemetry
  }
  experimental: M2ExperimentalTelemetry
  rawWorkCounters: {
    [key in keyof SearchWorkTotals]: { baseline: number; m2: number; delta: number }
  }
}

export interface M2MechanismAggregate {
  ordinary: M2OrdinaryTelemetry
  experimental: Omit<M2ExperimentalTelemetry, 'finalIncumbentPhase'>
  finalIncumbentPhaseCounts: Partial<Record<StructuralImprovementPhase, number>>
}

export interface M2MechanismTelemetryReport {
  overall: M2MechanismAggregate
  byCell: Array<{
    caseId: M2CaseId
    structuralCeiling: number
    checkpointSeconds: number
    repeatCount: number
    telemetry: M2MechanismAggregate
  }>
}

export interface M2QuantizedDeliverySample {
  repeatIndex: number
  floatMetrics: M2Metrics
  quantizedMetrics: M2Metrics
  deltaMaeQuantization: number
  deltaRmseQuantization: number
  deltaMaxAbsQuantization: number
  finalQuantizedFilters: Filter[]
  recomputedPreampDb: number
  baselineQuantizedMetrics: M2Metrics
}

export interface M2QuantizedDeliveryResult {
  caseId: M2RealCaseId
  structuralCeiling: number
  checkpointSeconds: 30
  baselineFloatRmseMedian: number
  m2FloatRmseMedian: number
  baselineQuantizedRmseMedian: number
  m2QuantizedRmseMedian: number
  m2AdvantageSurvivesDelivery: boolean
  samples: M2QuantizedDeliverySample[]
}

export interface M2ComplexityRepresentative {
  engine: M2Engine
  caseId: M2CaseId
  caseLabel: string
  structuralCeiling: number
  knownStructuralComplexity?: number
  repeatIndex: number
  filterCount: number
  qP90: number | null
  qMax: number | null
  maxAbsGainDb: number
  sumAbsGainDb: number
  maximumCombinedBoostDb: number
  maximumCombinedBoostFrequencyHz: number
  opposingNearbyPairs: ResearchDeliveredMetrics['complexity']['nearbyOpposingPairs']
}

export interface M2AcceptanceGate {
  pass: boolean
  realQuality: {
    developmentWins: number
    holdoutWins: number
    totalWins: number
    requiredDevelopmentWins: 2
    requiredHoldoutWins: 2
    requiredTotalWins: 4
  }
  noSystematicTrade: boolean
  tradeoffCases: M2RealCaseId[]
  protectedProgress: {
    pass: boolean
    tolerance: number
    noInterventionRuns: number
    noAcceptedChallengerRuns: number
    divergentCases: M2RealCaseId[]
  }
  mechanisticEvidence: { present: boolean; attributableWins: M2RealCaseId[] }
  delivery: { present: boolean; allWinsSurvive: boolean; cases: M2RealCaseId[] }
  complexity: { noSystematicPathology: boolean; note: string }
}

export interface M2CampaignResult {
  schemaVersion: typeof M2_RUNNER_SCHEMA_VERSION
  frozenM1ImplementationSha: typeof M1_IMPLEMENTATION_SHA
  engines: M2Engine[]
  runs: M2RunRecord[]
  aggregates: M2AggregateRow[]
  workComparison: M2WorkComparisonCell[]
  m2MechanismTelemetry: M2MechanismTelemetryReport
  quantizedDelivery: M2QuantizedDeliveryResult[]
  complexitySanity: M2ComplexityRepresentative[]
  acceptanceGate: M2AcceptanceGate
  evidenceSha256: string
  outputDir?: string
}

export interface M2RunnerOptions {
  includeReal?: boolean
  includeSynthetic?: boolean
  realCaseIds?: readonly M2RealCaseId[]
  syntheticCaseIds?: readonly M2SyntheticCaseId[]
  includeM1Control?: boolean
  outputDir?: string
  writeArtifacts?: boolean
  nowMs?: () => number
  runBaseline?: (input: StructuralSearchInput) => StructuralSearchResult
  runM2?: (input: StructuralSearchInput) => StructuralSearchResult
  runM1Control?: (input: StructuralSearchInput) => StructuralSearchResult
}

interface PreparedM2Case {
  id: M2CaseId
  label: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  frequenciesHz: number[]
  desiredDb: number[]
  sampleRateHz: number
  structuralCeilings: number[]
  knownStructuralComplexity?: number
}

interface CapturedTrace {
  event: StructuralSearchTraceEvent
  elapsedMs: number
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneEnvelope(envelope: M2ResourceEnvelope): M2ResourceEnvelope {
  return { ...envelope, config: { ...envelope.config } }
}

export function createM2ResourceEnvelope(
  structuralCeiling: number = M2_STRUCTURAL_CEILING,
): M2ResourceEnvelope {
  const envelope = createM1ResourceEnvelope(structuralCeiling, M2_EFFORT_LEVEL)
  return {
    ...envelope,
    deadlinePolicy: 'one-continuing-run-with-nominal-checkpoints',
  }
}

function preparedCases(
  includeReal: boolean,
  includeSynthetic: boolean,
  realCaseIds: readonly M2RealCaseId[],
  syntheticCaseIds: readonly M2SyntheticCaseId[],
): PreparedM2Case[] {
  const prepared: PreparedM2Case[] = []
  if (includeReal) {
    const definitions = new Map(M1_REAL_CASES.map((definition) => [definition.id, definition]))
    for (const id of realCaseIds) {
      const definition = definitions.get(id)
      if (definition === undefined) throw new Error(`Unknown M2 real case: ${id}`)
      const desired = id === 'titan-to-rsv' || id === 'titan-to-mystic-8' || id === 'titan-to-s12-ultra'
        ? prepareManualRegressionDesired(id)
        : prepareResearchDesired(id)
      prepared.push({
        id,
        label: definition.label,
        family: definition.family,
        split: definition.split,
        frequenciesHz: [...desired.frequenciesHz],
        desiredDb: [...desired.desiredDb],
        sampleRateHz: 48_000,
        structuralCeilings: [M2_STRUCTURAL_CEILING],
      })
    }
  }
  if (includeSynthetic) {
    const definitions = new Map(M1_SYNTHETIC_CASES.map((definition) => [definition.id, definition]))
    const corpus = new Map(loadSyntheticGroundTruthCorpus().map((value) => [value.id, value]))
    for (const id of syntheticCaseIds) {
      const definition = definitions.get(id)
      const value = corpus.get(id)
      if (definition === undefined || value === undefined) throw new Error(`Unknown M2 synthetic case: ${id}`)
      prepared.push({
        id,
        label: definition.label,
        family: definition.family,
        split: definition.split,
        frequenciesHz: [...value.frequenciesHz],
        desiredDb: [...value.desiredDb],
        sampleRateHz: value.sampleRateHz,
        structuralCeilings: createSyntheticCapacityProbeSequence(value),
        knownStructuralComplexity: value.knownStructuralComplexity,
      })
    }
  }
  return prepared
}

const WORK_KEYS = [
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
] as const satisfies readonly (keyof SearchWorkTotals)[]

function emptyWork(): SearchWorkTotals {
  return createSearchWorkDelta()
}

function numericSummary(values: readonly number[]): M2NumericSummary {
  if (values.length === 0) throw new Error('Cannot summarize an empty M2 observation set')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
  return {
    best: sorted[0]!,
    median,
    worst: sorted.at(-1)!,
    spread: sorted.at(-1)! - sorted[0]!,
  }
}

function summarizeWork(rows: readonly M2RunRecord[]): M2WorkSummary {
  const result = {} as M2WorkSummary
  for (const key of WORK_KEYS) result[key] = numericSummary(rows.map((row) => row.rawWorkCounters[key]))
  return result
}

function emptyOrdinaryTelemetry(): M2OrdinaryTelemetry {
  return {
    ordinaryBeamGenerations: 0,
    ordinaryProposalsGenerated: 0,
    ordinaryProposalsAdmitted: 0,
    ordinaryProposalsPolished: 0,
  }
}

function addOrdinaryTelemetry(
  left: M2OrdinaryTelemetry,
  right: M2OrdinaryTelemetry,
): M2OrdinaryTelemetry {
  return {
    ordinaryBeamGenerations: left.ordinaryBeamGenerations + right.ordinaryBeamGenerations,
    ordinaryProposalsGenerated: left.ordinaryProposalsGenerated + right.ordinaryProposalsGenerated,
    ordinaryProposalsAdmitted: left.ordinaryProposalsAdmitted + right.ordinaryProposalsAdmitted,
    ordinaryProposalsPolished: left.ordinaryProposalsPolished + right.ordinaryProposalsPolished,
  }
}

function emptyExperimentalTelemetry(): M2ExperimentalTelemetry {
  return {
    stallEvents: 0,
    challengerCandidatesConstructed: 0,
    challengerPolishAttempts: 0,
    challengerAcceptedIntoBeam: 0,
    challengerIncumbentImprovements: 0,
    finalIncumbentPhase: null,
  }
}

function addExperimentalTelemetry(
  left: M2ExperimentalTelemetry,
  right: M2ExperimentalTelemetry,
): M2ExperimentalTelemetry {
  return {
    stallEvents: left.stallEvents + right.stallEvents,
    challengerCandidatesConstructed: left.challengerCandidatesConstructed + right.challengerCandidatesConstructed,
    challengerPolishAttempts: left.challengerPolishAttempts + right.challengerPolishAttempts,
    challengerAcceptedIntoBeam: left.challengerAcceptedIntoBeam + right.challengerAcceptedIntoBeam,
    challengerIncumbentImprovements: left.challengerIncumbentImprovements + right.challengerIncumbentImprovements,
    finalIncumbentPhase: right.finalIncumbentPhase ?? left.finalIncumbentPhase,
  }
}

function telemetryFromEvent(
  event: StructuralSearchTraceEvent,
  engine: M2Engine,
): { ordinary: M2OrdinaryTelemetry; experimental: M2ExperimentalTelemetry } {
  const ordinary = event.type === 'beam-generation'
    ? {
      ordinaryBeamGenerations: event.ordinaryBeamGenerations ?? 1,
      ordinaryProposalsGenerated: event.ordinaryProposalsGenerated ?? event.generatedProposals ?? 0,
      ordinaryProposalsAdmitted: event.ordinaryProposalsAdmitted ?? event.admittedProposals ?? 0,
      ordinaryProposalsPolished: event.ordinaryProposalsPolished ?? event.polishedProposals ?? 0,
    }
    : emptyOrdinaryTelemetry()
  // M2 emits a matching stall count on its beam event and intervention event;
  // count the completed intervention phase only to avoid double counting.
  const experimental = engine === 'm2' && event.phase === 'm2-challenger'
    ? {
      stallEvents: event.stallEvents ?? 1,
      challengerCandidatesConstructed: event.challengerCandidatesConstructed ?? 0,
      challengerPolishAttempts: event.challengerPolishAttempts ?? 0,
      challengerAcceptedIntoBeam: event.challengerAcceptedIntoBeam ?? 0,
      challengerIncumbentImprovements: event.challengerIncumbentImprovements ?? 0,
      finalIncumbentPhase: event.finalIncumbentPhase ?? null,
    }
    : {
      ...emptyExperimentalTelemetry(),
      finalIncumbentPhase: engine === 'm2' ? event.finalIncumbentPhase ?? null : null,
    }
  return { ordinary, experimental }
}

function copyEvent(event: StructuralSearchTraceEvent): StructuralSearchTraceEvent {
  return {
    ...event,
    candidateSourceCounts: event.candidateSourceCounts === undefined
      ? undefined
      : { ...event.candidateSourceCounts },
    capacityPressure: event.capacityPressure === undefined ? undefined : { ...event.capacityPressure },
    frontierUtilization: event.frontierUtilization === undefined ? undefined : { ...event.frontierUtilization },
  }
}

function frontierMaxFilterCount(
  current: number,
  event: StructuralSearchTraceEvent,
): number {
  return Math.max(
    current,
    event.filterCount,
    event.frontierUtilization?.parentFilterCountMax ?? 0,
    event.frontierUtilization?.generatedCandidateFilterCountMax ?? 0,
    event.frontierUtilization?.admittedCandidateFilterCountMax ?? 0,
    event.frontierUtilization?.polishedCandidateFilterCountMax ?? 0,
  )
}

function trajectoryRunId(
  engine: M2Engine,
  value: PreparedM2Case,
  structuralCeiling: number,
  repeatIndex: number,
): string {
  return `${engine}|${value.id}|${structuralCeiling}|${repeatIndex}`
}

function runContinuingTrajectory(
  value: PreparedM2Case,
  engine: M2Engine,
  structuralCeiling: number,
  repeatIndex: number,
  envelope: M2ResourceEnvelope,
  runner: (input: StructuralSearchInput) => StructuralSearchResult,
  nowMs: () => number,
): M2RunRecord[] {
  const captured: CapturedTrace[] = []
  const startedAtMs = nowMs()
  const deadlineAtMs = startedAtMs + 30_000
  const input: StructuralSearchInput = {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequenciesHz],
    sampleRateHz: value.sampleRateHz,
    config: { ...envelope.config },
    seedFilters: [],
    deadline: { isExpired: () => nowMs() >= deadlineAtMs },
    onTrace: (event) => captured.push({
      event: copyEvent(event),
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
    }),
  }
  const result = runner(input)
  const trajectoryElapsedMs = Math.max(0, nowMs() - startedAtMs)
  const finalDelivered = calculateResearchDeliveredMetrics(
    result.filters,
    value.desiredDb,
    value.frequenciesHz,
    value.sampleRateHz,
  )

  if (captured.length === 0) {
    captured.push({
      event: copyEvent({
        type: 'end',
        filterCount: result.filters.length,
        rmseDb: result.rmseDb,
        maxAbsDb: result.maxAbsDb,
        violation: structuralViolation(result),
      }),
      elapsedMs: trajectoryElapsedMs,
    })
  }

  return M2_CHECKPOINT_SECONDS.map((checkpointSeconds) => {
    const targetMs = checkpointSeconds * 1_000
    const observedIndex = captured.findIndex((entry) => entry.elapsedMs >= targetMs)
    const eventIndex = observedIndex >= 0 ? observedIndex : captured.length - 1
    const observed = captured[eventIndex]!
    const checkpointReached = observedIndex >= 0
    let rawWork = emptyWork()
    let ordinaryTelemetry = emptyOrdinaryTelemetry()
    let experimentalTelemetry = emptyExperimentalTelemetry()
    let frontierMax = 0
    for (let index = 0; index <= eventIndex; index += 1) {
      const entry = captured[index]!
      rawWork = addSearchWorkDelta(rawWork, searchWorkDeltaFromTrace(entry.event))
      const telemetry = telemetryFromEvent(entry.event, engine)
      ordinaryTelemetry = addOrdinaryTelemetry(ordinaryTelemetry, telemetry.ordinary)
      experimentalTelemetry = addExperimentalTelemetry(experimentalTelemetry, telemetry.experimental)
      frontierMax = frontierMaxFilterCount(frontierMax, entry.event)
    }

    const isFinal = checkpointSeconds === 30
    const metrics: M2Metrics = isFinal
      ? {
        maeDb: finalDelivered.metrics.maeDb,
        rmseDb: finalDelivered.metrics.rmseDb,
        maxAbsDb: finalDelivered.metrics.maxAbsDb,
      }
      : {
        maeDb: null,
        rmseDb: observed.event.rmseDb,
        maxAbsDb: observed.event.maxAbsDb,
      }
    return {
      schemaVersion: M2_RUNNER_SCHEMA_VERSION,
      engine,
      caseId: value.id,
      caseLabel: value.label,
      family: value.family,
      split: value.split,
      knownStructuralComplexity: value.knownStructuralComplexity,
      structuralCeiling,
      effortLevel: M2_EFFORT_LEVEL,
      checkpointSeconds,
      repeatIndex,
      trajectoryRunId: trajectoryRunId(engine, value, structuralCeiling, repeatIndex),
      trajectoryElapsedMs,
      resourceEnvelope: cloneEnvelope(envelope),
      checkpointReached,
      observedElapsedMs: observed.elapsedMs,
      metrics,
      structuralViolation: isFinal ? structuralViolation(finalDelivered.metrics) : structuralViolation(metrics),
      deliveredFilterCount: isFinal ? result.filters.length : observed.event.filterCount,
      frontierMaxFilterCount: frontierMax,
      rawWorkCounters: rawWork,
      ordinaryTelemetry,
      experimentalTelemetry,
      filters: cloneFilters(result.filters),
      finalDelivered,
    }
  })
}

function cellKey(
  row: Pick<M2RunRecord, 'engine' | 'caseId' | 'structuralCeiling' | 'checkpointSeconds'>,
): string {
  return `${row.engine}|${row.caseId}|${row.structuralCeiling}|${row.checkpointSeconds}`
}

function caseOrder(caseId: M2CaseId): number {
  const order = new Map([...M1_REAL_CASES, ...M1_SYNTHETIC_CASES].map(({ id }, index) => [id, index]))
  return order.get(caseId) ?? 999
}

function compareRows(
  left: Pick<M2AggregateRow, 'engine' | 'caseId' | 'structuralCeiling' | 'checkpointSeconds'>,
  right: Pick<M2AggregateRow, 'engine' | 'caseId' | 'structuralCeiling' | 'checkpointSeconds'>,
): number {
  const engineOrder = (engine: M2Engine): number => engine === 'baseline' ? 0 : engine === 'm2' ? 1 : 2
  return caseOrder(left.caseId) - caseOrder(right.caseId) ||
    left.structuralCeiling - right.structuralCeiling ||
    left.checkpointSeconds - right.checkpointSeconds ||
    engineOrder(left.engine) - engineOrder(right.engine)
}

function aggregateTelemetry(rows: readonly M2RunRecord[]): M2MechanismAggregate {
  let ordinary = emptyOrdinaryTelemetry()
  const experimentalBase = {
    stallEvents: 0,
    challengerCandidatesConstructed: 0,
    challengerPolishAttempts: 0,
    challengerAcceptedIntoBeam: 0,
    challengerIncumbentImprovements: 0,
  }
  const finalIncumbentPhaseCounts: Partial<Record<StructuralImprovementPhase, number>> = {}
  for (const row of rows) {
    ordinary = addOrdinaryTelemetry(ordinary, row.ordinaryTelemetry)
    experimentalBase.stallEvents += row.experimentalTelemetry.stallEvents
    experimentalBase.challengerCandidatesConstructed += row.experimentalTelemetry.challengerCandidatesConstructed
    experimentalBase.challengerPolishAttempts += row.experimentalTelemetry.challengerPolishAttempts
    experimentalBase.challengerAcceptedIntoBeam += row.experimentalTelemetry.challengerAcceptedIntoBeam
    experimentalBase.challengerIncumbentImprovements += row.experimentalTelemetry.challengerIncumbentImprovements
    const phase = row.experimentalTelemetry.finalIncumbentPhase
    if (phase !== null) finalIncumbentPhaseCounts[phase] = (finalIncumbentPhaseCounts[phase] ?? 0) + 1
  }
  return {
    ordinary,
    experimental: experimentalBase,
    finalIncumbentPhaseCounts,
  }
}

function aggregateRows(rows: readonly M2RunRecord[]): M2AggregateRow[] {
  const groups = new Map<string, M2RunRecord[]>()
  for (const row of rows) groups.set(cellKey(row), [...(groups.get(cellKey(row)) ?? []), row])
  return [...groups.values()].map((group) => {
    const first = group[0]!
    const maeValues = group.flatMap((row) => row.metrics.maeDb === null ? [] : [row.metrics.maeDb])
    const telemetry = aggregateTelemetry(group)
    return {
      engine: first.engine,
      caseId: first.caseId,
      caseLabel: first.caseLabel,
      family: first.family,
      split: first.split,
      knownStructuralComplexity: first.knownStructuralComplexity,
      structuralCeiling: first.structuralCeiling,
      checkpointSeconds: first.checkpointSeconds,
      repeatCount: group.length,
      checkpointReachedCount: group.filter((row) => row.checkpointReached).length,
      maeDb: maeValues.length === 0 ? null : numericSummary(maeValues),
      rmseDb: numericSummary(group.map((row) => row.metrics.rmseDb)),
      maxAbsDb: numericSummary(group.map((row) => row.metrics.maxAbsDb)),
      structuralViolation: numericSummary(group.map((row) => row.structuralViolation)),
      deliveredFilterCount: numericSummary(group.map((row) => row.deliveredFilterCount)),
      frontierMaxFilterCount: numericSummary(group.map((row) => row.frontierMaxFilterCount)),
      actualElapsedMs: numericSummary(group.map((row) => row.observedElapsedMs)),
      rawWorkCounters: summarizeWork(group),
      ordinaryTelemetry: telemetry.ordinary,
      experimentalTelemetry: {
        ...telemetry.experimental,
        finalIncumbentPhase: Object.entries(telemetry.finalIncumbentPhaseCounts)
          .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0) || left[0].localeCompare(right[0]))[0]?.[0] as StructuralImprovementPhase | undefined ?? null,
      },
    }
  }).sort(compareRows)
}

function medianTelemetry(
  rows: readonly M2RunRecord[],
): M2OrdinaryTelemetry {
  return {
    ordinaryBeamGenerations: numericSummary(rows.map((row) => row.ordinaryTelemetry.ordinaryBeamGenerations)).median,
    ordinaryProposalsGenerated: numericSummary(rows.map((row) => row.ordinaryTelemetry.ordinaryProposalsGenerated)).median,
    ordinaryProposalsAdmitted: numericSummary(rows.map((row) => row.ordinaryTelemetry.ordinaryProposalsAdmitted)).median,
    ordinaryProposalsPolished: numericSummary(rows.map((row) => row.ordinaryTelemetry.ordinaryProposalsPolished)).median,
  }
}

function subtractOrdinaryTelemetry(
  left: M2OrdinaryTelemetry,
  right: M2OrdinaryTelemetry,
): M2OrdinaryTelemetry {
  return {
    ordinaryBeamGenerations: left.ordinaryBeamGenerations - right.ordinaryBeamGenerations,
    ordinaryProposalsGenerated: left.ordinaryProposalsGenerated - right.ordinaryProposalsGenerated,
    ordinaryProposalsAdmitted: left.ordinaryProposalsAdmitted - right.ordinaryProposalsAdmitted,
    ordinaryProposalsPolished: left.ordinaryProposalsPolished - right.ordinaryProposalsPolished,
  }
}

function aggregateWorkComparison(rows: readonly M2RunRecord[]): M2WorkComparisonCell[] {
  const groups = new Map<string, M2RunRecord[]>()
  for (const row of rows.filter((value) => value.engine !== 'm1-vnext-control')) {
    const key = `${row.caseId}|${row.structuralCeiling}|${row.checkpointSeconds}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((group) => {
    const baseline = group.filter((row) => row.engine === 'baseline')
    const m2 = group.filter((row) => row.engine === 'm2')
    const first = group[0]!
    if (baseline.length === 0 || m2.length === 0) throw new Error(`M2 work comparison requires both engines for ${first.caseId}`)
    const baselineOrdinary = medianTelemetry(baseline)
    const m2Ordinary = medianTelemetry(m2)
    const rawWorkCounters = {} as M2WorkComparisonCell['rawWorkCounters']
    for (const key of WORK_KEYS) {
      const baselineMedian = numericSummary(baseline.map((row) => row.rawWorkCounters[key])).median
      const m2Median = numericSummary(m2.map((row) => row.rawWorkCounters[key])).median
      rawWorkCounters[key] = { baseline: baselineMedian, m2: m2Median, delta: m2Median - baselineMedian }
    }
    const m2Experimental = aggregateTelemetry(m2)
    return {
      caseId: first.caseId,
      structuralCeiling: first.structuralCeiling,
      checkpointSeconds: first.checkpointSeconds,
      repeatCount: Math.min(baseline.length, m2.length),
      ordinary: {
        baseline: baselineOrdinary,
        m2: m2Ordinary,
        delta: subtractOrdinaryTelemetry(m2Ordinary, baselineOrdinary),
      },
      experimental: {
        ...m2Experimental.experimental,
        finalIncumbentPhase: null,
      },
      rawWorkCounters,
    }
  }).sort((left, right) => compareRows(
    { ...left, engine: 'baseline' },
    { ...right, engine: 'baseline' },
  ))
}

function aggregateMechanism(rows: readonly M2RunRecord[]): M2MechanismTelemetryReport {
  const finalM2Rows = rows.filter((row) => row.engine === 'm2' && row.checkpointSeconds === 30)
  const overall = aggregateTelemetry(finalM2Rows)
  const groups = new Map<string, M2RunRecord[]>()
  for (const row of finalM2Rows) {
    const key = `${row.caseId}|${row.structuralCeiling}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const byCell = [...groups.values()].map((group) => {
    const first = group[0]!
    return {
      caseId: first.caseId,
      structuralCeiling: first.structuralCeiling,
      checkpointSeconds: 30,
      repeatCount: group.length,
      telemetry: aggregateTelemetry(group),
    }
  }).sort((left, right) => compareRows(
    { ...left, engine: 'm2' },
    { ...right, engine: 'm2' },
  ))
  return { overall, byCell }
}

function realFinalAggregate(
  aggregates: readonly M2AggregateRow[],
  engine: M2Engine,
  caseId: M2RealCaseId,
): M2AggregateRow | undefined {
  return aggregates.find((row) =>
    row.engine === engine &&
    row.caseId === caseId &&
    row.structuralCeiling === M2_STRUCTURAL_CEILING &&
    row.checkpointSeconds === 30,
  )
}

function metricsFromDelivered(value: ResearchDeliveredMetrics): M2Metrics {
  return {
    maeDb: value.metrics.maeDb,
    rmseDb: value.metrics.rmseDb,
    maxAbsDb: value.metrics.maxAbsDb,
  }
}

function calculateQuantizedDelivery(
  rows: readonly M2RunRecord[],
  aggregates: readonly M2AggregateRow[],
  prepared: ReadonlyMap<M2CaseId, PreparedM2Case>,
): M2QuantizedDeliveryResult[] {
  const output: M2QuantizedDeliveryResult[] = []
  for (const definition of M1_REAL_CASES) {
    const caseId = definition.id as M2RealCaseId
    const baselineAggregate = realFinalAggregate(aggregates, 'baseline', caseId)
    const m2Aggregate = realFinalAggregate(aggregates, 'm2', caseId)
    if (baselineAggregate === undefined || m2Aggregate === undefined) continue
    if (!(m2Aggregate.rmseDb.median < baselineAggregate.rmseDb.median)) continue
    const value = prepared.get(caseId)
    if (value === undefined) throw new Error(`Missing prepared M2 case: ${caseId}`)
    const config = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: M2_STRUCTURAL_CEILING,
    })
    const baselineRows = rows.filter((row) => row.engine === 'baseline' && row.caseId === caseId && row.checkpointSeconds === 30)
    const m2Rows = rows.filter((row) => row.engine === 'm2' && row.caseId === caseId && row.checkpointSeconds === 30)
    const samples: M2QuantizedDeliverySample[] = []
    for (const m2Row of m2Rows) {
      const baselineRow = baselineRows.find((row) => row.repeatIndex === m2Row.repeatIndex)
      if (baselineRow === undefined) throw new Error(`Missing baseline repeat ${m2Row.repeatIndex} for ${caseId}`)
      const m2Stress = evaluateQuantizationStress(m2Row.filters, value.desiredDb, value.frequenciesHz, config)
      const baselineStress = evaluateQuantizationStress(baselineRow.filters, value.desiredDb, value.frequenciesHz, config)
      samples.push({
        repeatIndex: m2Row.repeatIndex,
        floatMetrics: metricsFromDelivered(m2Stress.floatMetrics),
        quantizedMetrics: metricsFromDelivered(m2Stress.quantizedMetrics),
        deltaMaeQuantization: m2Stress.deltaMaeDb,
        deltaRmseQuantization: m2Stress.deltaRmseDb,
        deltaMaxAbsQuantization: m2Stress.deltaMaxAbsDb,
        finalQuantizedFilters: cloneFilters(m2Stress.quantizedFilters),
        recomputedPreampDb: verifyResearchPreamp(m2Stress.quantizedFilters, value.sampleRateHz).preampDb,
        baselineQuantizedMetrics: metricsFromDelivered(baselineStress.quantizedMetrics),
      })
    }
    if (samples.length === 0) continue
    const baselineQuantizedRmseMedian = numericSummary(samples.map((sample) => sample.baselineQuantizedMetrics.rmseDb)).median
    const m2QuantizedRmseMedian = numericSummary(samples.map((sample) => sample.quantizedMetrics.rmseDb)).median
    output.push({
      caseId,
      structuralCeiling: M2_STRUCTURAL_CEILING,
      checkpointSeconds: 30,
      baselineFloatRmseMedian: baselineAggregate.rmseDb.median,
      m2FloatRmseMedian: m2Aggregate.rmseDb.median,
      baselineQuantizedRmseMedian,
      m2QuantizedRmseMedian,
      m2AdvantageSurvivesDelivery: m2QuantizedRmseMedian < baselineQuantizedRmseMedian,
      samples,
    })
  }
  return output
}

function complexityRepresentatives(
  rows: readonly M2RunRecord[],
): M2ComplexityRepresentative[] {
  const finalRows = rows.filter((row) => row.checkpointSeconds === 30)
  const groups = new Map<string, M2RunRecord[]>()
  for (const row of finalRows) {
    const key = `${row.engine}|${row.caseId}|${row.structuralCeiling}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((group) => {
    const representative = [...group].sort((left, right) =>
      left.metrics.rmseDb - right.metrics.rmseDb ||
      left.metrics.maxAbsDb - right.metrics.maxAbsDb ||
      left.repeatIndex - right.repeatIndex,
    )[Math.floor(group.length / 2)]!
    const complexity = representative.finalDelivered.complexity
    return {
      engine: representative.engine,
      caseId: representative.caseId,
      caseLabel: representative.caseLabel,
      structuralCeiling: representative.structuralCeiling,
      knownStructuralComplexity: representative.knownStructuralComplexity,
      repeatIndex: representative.repeatIndex,
      filterCount: complexity.filterCount,
      qP90: complexity.qP90,
      qMax: complexity.qMax,
      maxAbsGainDb: complexity.maxAbsGainDb,
      sumAbsGainDb: complexity.sumAbsGainDb,
      maximumCombinedBoostDb: complexity.maximumCombinedBoostDb,
      maximumCombinedBoostFrequencyHz: complexity.maximumCombinedBoostFrequencyHz,
      opposingNearbyPairs: complexity.nearbyOpposingPairs,
    }
  }).sort((left, right) => compareRows(
    { ...left, checkpointSeconds: 30 },
    { ...right, checkpointSeconds: 30 },
  ))
}

const M2_PROTECTED_PROGRESS_TOLERANCE = 1e-9

function evaluateAcceptance(
  rows: readonly M2RunRecord[],
  aggregates: readonly M2AggregateRow[],
  delivery: readonly M2QuantizedDeliveryResult[],
  mechanism: M2MechanismTelemetryReport,
): M2AcceptanceGate {
  const wins: M2RealCaseId[] = []
  const tradeoffCases: M2RealCaseId[] = []
  const attributableWins: M2RealCaseId[] = []
  const divergentCases = new Set<M2RealCaseId>()
  let noInterventionRuns = 0
  let noAcceptedChallengerRuns = 0
  for (const definition of M1_REAL_CASES) {
    const caseId = definition.id as M2RealCaseId
    const baseline = realFinalAggregate(aggregates, 'baseline', caseId)
    const m2 = realFinalAggregate(aggregates, 'm2', caseId)
    if (baseline === undefined || m2 === undefined) continue
    if (m2.rmseDb.median < baseline.rmseDb.median) {
      wins.push(caseId)
      const cell = mechanism.byCell.find((value) => value.caseId === caseId && value.structuralCeiling === M2_STRUCTURAL_CEILING)
      if ((cell?.telemetry.experimental.challengerIncumbentImprovements ?? 0) > 0) attributableWins.push(caseId)
    }
    if (m2.rmseDb.median > baseline.rmseDb.median && m2.maxAbsDb.median > baseline.maxAbsDb.median) {
      tradeoffCases.push(caseId)
    }

    const baselineRows = rows.filter((row) => row.engine === 'baseline' && row.caseId === caseId && row.checkpointSeconds === 30)
    const m2Rows = rows.filter((row) => row.engine === 'm2' && row.caseId === caseId && row.checkpointSeconds === 30)
    for (const m2Row of m2Rows) {
      if (m2Row.experimentalTelemetry.stallEvents === 0) noInterventionRuns += 1
      if (m2Row.experimentalTelemetry.challengerAcceptedIntoBeam === 0) {
        noAcceptedChallengerRuns += 1
        const baselineRow = baselineRows.find((row) => row.repeatIndex === m2Row.repeatIndex)
        if (baselineRow !== undefined && (
          Math.abs(m2Row.metrics.rmseDb - baselineRow.metrics.rmseDb) > M2_PROTECTED_PROGRESS_TOLERANCE ||
          Math.abs(m2Row.metrics.maxAbsDb - baselineRow.metrics.maxAbsDb) > M2_PROTECTED_PROGRESS_TOLERANCE
        )) divergentCases.add(caseId)
      }
    }
  }
  const developmentWins = wins.filter((id) => M1_REAL_CASES.find((value) => value.id === id)?.split === 'development').length
  const holdoutWins = wins.filter((id) => M1_REAL_CASES.find((value) => value.id === id)?.split === 'holdout').length
  const allWinsSurvive = wins.length > 0 && wins.every((id) => delivery.find((value) => value.caseId === id)?.m2AdvantageSurvivesDelivery === true)
  const deliveryCases = delivery.map(({ caseId }) => caseId)
  const mechanisticEvidence = attributableWins.length > 0
  const protectedProgress = divergentCases.size === 0
  const realQuality = developmentWins >= 2 && holdoutWins >= 2 && wins.length >= 4
  const noSystematicTrade = tradeoffCases.length === 0
  const deliveryPass = wins.length > 0 && deliveryCases.length === wins.length && allWinsSurvive
  return {
    pass: realQuality && noSystematicTrade && protectedProgress && mechanisticEvidence && deliveryPass,
    realQuality: {
      developmentWins,
      holdoutWins,
      totalWins: wins.length,
      requiredDevelopmentWins: 2,
      requiredHoldoutWins: 2,
      requiredTotalWins: 4,
    },
    noSystematicTrade,
    tradeoffCases,
    protectedProgress: {
      pass: protectedProgress,
      tolerance: M2_PROTECTED_PROGRESS_TOLERANCE,
      noInterventionRuns,
      noAcceptedChallengerRuns,
      divergentCases: [...divergentCases].sort((left, right) => caseOrder(left) - caseOrder(right)),
    },
    mechanisticEvidence: { present: mechanisticEvidence, attributableWins },
    delivery: { present: delivery.length > 0, allWinsSurvive, cases: deliveryCases },
    complexity: {
      noSystematicPathology: true,
      note: 'No complexity objective or threshold was applied; inspect representative outputs for pathological increases without quality benefit.',
    },
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

type M2CommittedEvidence = Omit<M2CampaignResult, 'evidenceSha256' | 'outputDir' | 'runs'>

function evidenceHash(value: M2CommittedEvidence): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function writeM2Artifacts(
  outputDir: string,
  result: M2CampaignResult,
): void {
  mkdirSync(outputDir, { recursive: true })
  // Raw timings are intentionally separate from committed aggregate evidence.
  writeFileSync(resolve(outputDir, 'raw-timing.jsonl'), '', 'utf8')
  for (const row of result.runs) appendFileSync(resolve(outputDir, 'raw-timing.jsonl'), `${JSON.stringify(row)}\n`, 'utf8')
  const aggregate = {
    schemaVersion: result.schemaVersion,
    frozenM1ImplementationSha: result.frozenM1ImplementationSha,
    engines: result.engines,
    aggregates: result.aggregates,
    workComparison: result.workComparison,
    m2MechanismTelemetry: result.m2MechanismTelemetry,
    quantizedDelivery: result.quantizedDelivery,
    complexitySanity: result.complexitySanity,
    acceptanceGate: result.acceptanceGate,
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'quantized-delivery.json'), `${JSON.stringify(result.quantizedDelivery, null, 2)}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'complexity-sanity.json'), `${JSON.stringify(result.complexitySanity, null, 2)}\n`, 'utf8')

  const qualityRows = result.aggregates.filter((row) => row.engine === 'baseline' || row.engine === 'm2')
  const summaryLines = [
    '# Structural Search VNext M2 — protected progress',
    '',
    `- Frozen M1 implementation: \`${result.frozenM1ImplementationSha}\``,
    `- Evidence SHA-256: \`${result.evidenceSha256}\``,
    `- Envelope: structural ceiling ${M2_STRUCTURAL_CEILING}, effort ${M2_EFFORT_LEVEL}, checkpoints ${M2_CHECKPOINT_SECONDS.join('/')} (continuing trajectory), repeats ${M2_REPEAT_COUNT}`,
    `- Engines: baseline \`runStructuralSearch\`; M2 \`runStructuralSearchVNextM2\`${result.engines.includes('m1-vnext-control') ? '; M1 control \'runStructuralSearchVNext\'' : ''}`,
    '',
    '## Baseline vs M2 quality (best / median / worst)',
    '',
    '| Engine | Case | Ceiling | Checkpoint | RMSE | maxAbs | Violation | Filters | Frontier max | Observed elapsed ms |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |',
    ...qualityRows.map((row) =>
      `| ${row.engine} | ${row.caseLabel} | ${row.structuralCeiling} | ${row.checkpointSeconds}s | ${row.rmseDb.best.toFixed(4)} / ${row.rmseDb.median.toFixed(4)} / ${row.rmseDb.worst.toFixed(4)} | ${row.maxAbsDb.best.toFixed(4)} / ${row.maxAbsDb.median.toFixed(4)} / ${row.maxAbsDb.worst.toFixed(4)} | ${row.structuralViolation.best.toFixed(3)} / ${row.structuralViolation.median.toFixed(3)} / ${row.structuralViolation.worst.toFixed(3)} | ${row.deliveredFilterCount.best} / ${row.deliveredFilterCount.median} / ${row.deliveredFilterCount.worst} | ${row.frontierMaxFilterCount.best} / ${row.frontierMaxFilterCount.median} / ${row.frontierMaxFilterCount.worst} | ${row.actualElapsedMs.best.toFixed(1)} / ${row.actualElapsedMs.median.toFixed(1)} / ${row.actualElapsedMs.worst.toFixed(1)} |`,
    ),
    '',
    '## M2 mechanism and delivery',
    '',
    '- Ordinary and challenger counters are separate in `aggregate.json` (`m2MechanismTelemetry`, `workComparison`).',
    '- Quantized delivery is present only for final real-case M2 float wins (`quantized-delivery.json`).',
    '- Complexity representatives are in `complexity-sanity.json`; complexity is not an optimization objective.',
    '',
    `- Protected-progress acceptance gate: **${result.acceptanceGate.pass ? 'PASS' : 'FAIL'}**`,
    '',
  ]
  writeFileSync(resolve(outputDir, 'summary.md'), `${summaryLines.join('\n')}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
    schemaVersion: result.schemaVersion,
    frozenM1ImplementationSha: result.frozenM1ImplementationSha,
    engines: result.engines,
    structuralCeiling: M2_STRUCTURAL_CEILING,
    effortLevel: M2_EFFORT_LEVEL,
    checkpoints: M2_CHECKPOINT_SECONDS,
    checkpointSemantics: 'one-continuing-trajectory-with-nominal-checkpoints',
    repeats: M2_REPEAT_COUNT,
    corpusHashes: { ...RESEARCH_CORPUS_SHA256, ...MANUAL_REGRESSION_FIXTURE_SHA256 },
    rawTimingPath: 'raw-timing.jsonl',
    aggregatePath: 'aggregate.json',
    evidenceSha256: result.evidenceSha256,
  }, null, 2)}\n`, 'utf8')
}

/** Run the fixed serial M2 baseline/protected-progress campaign. */
export function runStructuralSearchVnextM2(options: M2RunnerOptions = {}): M2CampaignResult {
  const includeReal = options.includeReal ?? true
  const includeSynthetic = options.includeSynthetic ?? true
  const realCaseIds = options.realCaseIds ?? M1_REAL_CASES.map(({ id }) => id as M2RealCaseId)
  const syntheticCaseIds = options.syntheticCaseIds ?? M1_SYNTHETIC_CASES.map(({ id }) => id as M2SyntheticCaseId)
  if (!includeReal && !includeSynthetic) throw new Error('M2 campaign must include a real or synthetic case')
  const prepared = preparedCases(includeReal, includeSynthetic, realCaseIds, syntheticCaseIds)
  const nowMs = options.nowMs ?? (() => performance.now())
  const includeM1Control = options.includeM1Control ?? true
  const engines: M2Engine[] = includeM1Control
    ? ['baseline', 'm2', 'm1-vnext-control']
    : ['baseline', 'm2']
  const runners: Record<M2Engine, (input: StructuralSearchInput) => StructuralSearchResult> = {
    baseline: options.runBaseline ?? runStructuralSearch,
    m2: options.runM2 ?? runStructuralSearchVNextM2,
    'm1-vnext-control': options.runM1Control ?? runStructuralSearchVNext,
  }
  const runs: M2RunRecord[] = []

  // Case, ceiling, repeat, engine: timing-sensitive runs remain serial.
  for (const value of prepared) {
    for (const structuralCeiling of value.structuralCeilings) {
      const envelope = createM2ResourceEnvelope(structuralCeiling)
      for (let repeatIndex = 0; repeatIndex < M2_REPEAT_COUNT; repeatIndex += 1) {
        for (const engine of engines) {
          runs.push(...runContinuingTrajectory(
            value,
            engine,
            structuralCeiling,
            repeatIndex,
            envelope,
            runners[engine],
            nowMs,
          ))
        }
      }
    }
  }

  const aggregates = aggregateRows(runs)
  const workComparison = aggregateWorkComparison(runs)
  const m2MechanismTelemetry = aggregateMechanism(runs)
  const preparedById = new Map(prepared.map((value) => [value.id, value]))
  const quantizedDelivery = calculateQuantizedDelivery(runs, aggregates, preparedById)
  const complexitySanity = complexityRepresentatives(runs)
  const partial = {
    schemaVersion: M2_RUNNER_SCHEMA_VERSION,
    frozenM1ImplementationSha: M1_IMPLEMENTATION_SHA,
    engines,
    runs,
    aggregates,
    workComparison,
    m2MechanismTelemetry,
    quantizedDelivery,
    complexitySanity,
    acceptanceGate: evaluateAcceptance(runs, aggregates, quantizedDelivery, m2MechanismTelemetry),
  }
  const committedEvidence: M2CommittedEvidence = {
    schemaVersion: partial.schemaVersion,
    frozenM1ImplementationSha: partial.frozenM1ImplementationSha,
    engines: partial.engines,
    aggregates: partial.aggregates,
    workComparison: partial.workComparison,
    m2MechanismTelemetry: partial.m2MechanismTelemetry,
    quantizedDelivery: partial.quantizedDelivery,
    complexitySanity: partial.complexitySanity,
    acceptanceGate: partial.acceptanceGate,
  }
  const outputDir = options.outputDir ?? M2_DEFAULT_OUTPUT_DIR
  const result: M2CampaignResult = {
    ...partial,
    evidenceSha256: evidenceHash(committedEvidence),
    outputDir: options.writeArtifacts === false ? undefined : outputDir,
  }
  if (options.writeArtifacts !== false) writeM2Artifacts(outputDir, result)
  return result
}

export function isM2CliInvocation(
  argv: readonly string[] = process.argv,
  moduleUrl: string = import.meta.url,
): boolean {
  if (argv.includes('--m2-runner')) return true
  const modulePath = resolve(fileURLToPath(moduleUrl))
  return argv.slice(1).some((argument) => {
    try {
      return resolve(argument) === modulePath
    } catch {
      return false
    }
  })
}

if (isM2CliInvocation()) {
  const result = runStructuralSearchVnextM2()
  process.stdout.write(`${JSON.stringify({
    frozenM1ImplementationSha: result.frozenM1ImplementationSha,
    evidenceSha256: result.evidenceSha256,
    runCount: result.runs.length,
    aggregateCount: result.aggregates.length,
    quantizedDeliveryCases: result.quantizedDelivery.map(({ caseId }) => caseId),
    acceptanceGate: result.acceptanceGate,
  }, null, 2)}\n`)
}
