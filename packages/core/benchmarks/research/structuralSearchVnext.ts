import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  DEFAULT_AUTOEQ_SETTINGS,
  resolveScalableEffortConfig,
  resolveStandardAutoEqV2Config,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  runStructuralSearchVNext,
  structuralViolation,
  type FrontierUtilizationDelta,
  type ResolvedStructuralSearchConfig,
  type SearchWorkTotals,
  type StructuralSearchInput,
  type StructuralSearchResult,
  type StructuralSearchTraceEvent,
} from '../../src/index.js'
import type {
  StructuralImprovementPhase,
  StructuralMutation,
} from '../../src/autoeq/v2/structuralSearch.js'
import type { Filter } from '../../src/types/filter.js'

import {
  MANUAL_REGRESSION_FIXTURE_SHA256,
  prepareManualRegressionDesired,
} from './manualRegression.js'
import {
  prepareResearchDesired,
  RESEARCH_CORPUS_SHA256,
} from './corpus.js'
import {
  calculateResearchDeliveredMetrics,
  evaluateQuantizationStress,
  verifyResearchPreamp,
  type ResearchDeliveredMetrics,
} from './deliveredMetrics.js'
import {
  createSyntheticCapacityProbeSequence,
  loadSyntheticGroundTruthCorpus,
} from './syntheticCorpus.js'

/** Frozen M1 campaign constants.  They intentionally have no tuning flags. */
export const M1_IMPLEMENTATION_SHA = 'b735583a0554b6998146ab2fab0c14595cb01649' as const
export const M1_STRUCTURAL_CEILING = 43 as const
export const M1_EFFORT_LEVEL = 6 as const
export const M1_CHECKPOINT_SECONDS = [5, 15, 30] as const
export const M1_REPEAT_COUNT = 3 as const
export const M1_RUNNER_SCHEMA_VERSION = 1 as const

export type M1Engine = 'baseline' | 'vnext'
export type M1RealCaseId =
  | 'titan-to-rsv'
  | 'titan-to-mystic-8'
  | 'titan-to-s12-ultra'
  | 'titan-to-storm'
  | 'titan-to-u12t'
  | 'titan-to-trio'
export type M1SyntheticCaseId =
  | 'synthetic-d-dense-known-structure'
  | 'synthetic-e-high-q-valid'
  | 'synthetic-f-upper-frequency-structure'
  | 'synthetic-h-alternating-structure'

export interface M1CaseDefinition {
  id: M1RealCaseId | M1SyntheticCaseId
  label: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
}

export interface M1RealCaseDefinition extends M1CaseDefinition {
  id: M1RealCaseId
  family: 'real'
  split: 'development' | 'holdout'
}

export interface M1SyntheticCaseDefinition extends M1CaseDefinition {
  id: M1SyntheticCaseId
  family: 'synthetic'
  split: 'sanity'
}

/** Former development cases remain separate from the former holdout cases. */
export const M1_REAL_CASES: readonly M1RealCaseDefinition[] = Object.freeze([
  { id: 'titan-to-rsv', label: 'Titan → RSV', family: 'real', split: 'development' },
  { id: 'titan-to-mystic-8', label: 'Titan → Mystic 8', family: 'real', split: 'development' },
  { id: 'titan-to-s12-ultra', label: 'Titan → S12 Ultra', family: 'real', split: 'development' },
  { id: 'titan-to-storm', label: 'Titan → Storm', family: 'real', split: 'holdout' },
  { id: 'titan-to-u12t', label: 'Titan → U12t', family: 'real', split: 'holdout' },
  { id: 'titan-to-trio', label: 'Titan → Trio', family: 'real', split: 'holdout' },
])

export const M1_SYNTHETIC_CASES: readonly M1SyntheticCaseDefinition[] = Object.freeze([
  { id: 'synthetic-d-dense-known-structure', label: 'Synthetic D', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-e-high-q-valid', label: 'Synthetic E', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-f-upper-frequency-structure', label: 'Synthetic F', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-h-alternating-structure', label: 'Synthetic H', family: 'synthetic', split: 'sanity' },
])

const M1_DEFAULT_OUTPUT_DIR = resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
  '.research-artifacts/structural-search-vnext-m1',
)

export interface M1ResourceEnvelope {
  structuralCeiling: number
  effortLevel: number
  beamWidth: number
  proposalsPerParent: number
  localPolishEvaluations: number
  preset: typeof MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET
  schedulerPolicy: 'direct-structural-search'
  seedSemantics: 'empty-filters-deterministic'
  deadlinePolicy: 'one-independent-run-per-nominal-checkpoint'
  config: ResolvedStructuralSearchConfig
}

/**
 * Construct the one M1 resource envelope.  This is deliberately not a
 * generic tuning helper: effort is fixed to six and callers cannot alter any
 * search policy field through this benchmark module.
 */
export function createM1ResourceEnvelope(
  structuralCeiling: number = M1_STRUCTURAL_CEILING,
  effortLevel: number = M1_EFFORT_LEVEL,
): M1ResourceEnvelope {
  if (!Number.isSafeInteger(structuralCeiling) || structuralCeiling <= 0) {
    throw new Error('M1 structural ceiling must be a positive integer')
  }
  if (effortLevel !== M1_EFFORT_LEVEL) {
    throw new Error(`M1 effort is frozen at ${M1_EFFORT_LEVEL}`)
  }
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: 30,
  })
  const config = resolveScalableEffortConfig(baseConfig, structuralCeiling, effortLevel)
  return {
    structuralCeiling,
    effortLevel,
    beamWidth: config.beamWidth,
    proposalsPerParent: config.proposalsPerParent,
    localPolishEvaluations: config.localPolishEvaluations,
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    schedulerPolicy: 'direct-structural-search',
    seedSemantics: 'empty-filters-deterministic',
    deadlinePolicy: 'one-independent-run-per-nominal-checkpoint',
    config: { ...config },
  }
}

interface PreparedM1Case extends M1CaseDefinition {
  frequenciesHz: number[]
  desiredDb: number[]
  sampleRateHz: number
  structuralCeilings: number[]
  knownStructuralComplexity?: number
}

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function cloneEnvelope(envelope: M1ResourceEnvelope): M1ResourceEnvelope {
  return { ...envelope, config: { ...envelope.config } }
}

function preparedRealCases(
  selectedIds: readonly M1RealCaseId[],
): PreparedM1Case[] {
  const definitions = new Map(M1_REAL_CASES.map((definition) => [definition.id, definition]))
  const prepared: PreparedM1Case[] = []
  for (const id of selectedIds) {
    const definition = definitions.get(id)
    if (definition === undefined) throw new Error(`Unknown M1 real case: ${id}`)
    const desired = id === 'titan-to-rsv' || id === 'titan-to-mystic-8' || id === 'titan-to-s12-ultra'
      ? prepareManualRegressionDesired(id)
      : prepareResearchDesired(id)
    prepared.push({
      ...definition,
      frequenciesHz: [...desired.frequenciesHz],
      desiredDb: [...desired.desiredDb],
      // Both approved curve corpora use the shared numeric policy sample rate.
      sampleRateHz: 48_000,
      structuralCeilings: [M1_STRUCTURAL_CEILING],
    })
  }
  return prepared
}

function preparedSyntheticCases(
  selectedIds: readonly M1SyntheticCaseId[],
): PreparedM1Case[] {
  const definitions = new Map(M1_SYNTHETIC_CASES.map((definition) => [definition.id, definition]))
  const corpus = new Map(loadSyntheticGroundTruthCorpus().map((value) => [value.id, value]))
  const prepared: PreparedM1Case[] = []
  for (const id of selectedIds) {
    const definition = definitions.get(id)
    const value = corpus.get(id)
    if (definition === undefined || value === undefined) throw new Error(`Unknown M1 synthetic case: ${id}`)
    prepared.push({
      ...definition,
      frequenciesHz: [...value.frequenciesHz],
      desiredDb: [...value.desiredDb],
      sampleRateHz: value.sampleRateHz,
      // K is known generating complexity, not a claim of minimum complexity.
      structuralCeilings: createSyntheticCapacityProbeSequence(value),
      knownStructuralComplexity: value.knownStructuralComplexity,
    })
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

const PHASES: readonly StructuralImprovementPhase[] = [
  'beam',
  'rescue',
  'pair-add',
  'cap-swap',
  'vnext-replacement',
]

export interface M1NumericSummary {
  best: number
  median: number
  worst: number
  spread: number
}

export interface M1Metrics {
  maeDb: number
  rmseDb: number
  maxAbsDb: number
}

export interface M1MechanismTelemetry {
  proposalMutationSourceCounts: Partial<Record<StructuralMutation, number>>
  residualRegionsGenerated: number
  residualRegionsAdmitted: number
  structuralSignaturesGenerated: number
  structuralSignaturesAdmitted: number
  structuralSignaturesRetained: number
  stallDiversificationEvents: number
  replacementAttempts: number
  replacementPolishAttempts: number
  acceptedReplacements: number
  acceptedReplacementGain: number
  bestImprovementPhase: StructuralImprovementPhase | null
  finalImprovementPhase: StructuralImprovementPhase | null
}

export interface M1FinalProvenance {
  bestImprovementPhase: StructuralImprovementPhase | null
  finalImprovementPhase: StructuralImprovementPhase | null
}

export interface M1RunRecord {
  schemaVersion: typeof M1_RUNNER_SCHEMA_VERSION
  engine: M1Engine
  caseId: M1RealCaseId | M1SyntheticCaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  knownStructuralComplexity?: number
  structuralCeiling: number
  effortLevel: number
  checkpointSeconds: number
  repeatIndex: number
  resourceEnvelope: M1ResourceEnvelope
  metrics: M1Metrics
  structuralViolation: number
  deliveredFilterCount: number
  frontierMaxFilterCount: number
  actualElapsedMs: number
  rawWorkCounters: SearchWorkTotals
  frontierUtilization: FrontierUtilizationDelta
  mechanismTelemetry: M1MechanismTelemetry
  finalIncumbentProvenance: M1FinalProvenance
  filters: Filter[]
  delivered: ResearchDeliveredMetrics
}

export type M1WorkSummary = {
  [key in keyof SearchWorkTotals]: M1NumericSummary
}

export interface M1AggregateRow {
  engine: M1Engine
  caseId: M1RealCaseId | M1SyntheticCaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  knownStructuralComplexity?: number
  structuralCeiling: number
  checkpointSeconds: number
  repeatCount: number
  rmseDb: M1NumericSummary
  maxAbsDb: M1NumericSummary
  structuralViolation: M1NumericSummary
  deliveredFilterCount: M1NumericSummary
  frontierMaxFilterCount: M1NumericSummary
  actualElapsedMs: M1NumericSummary
  rawWorkCounters: M1WorkSummary
  mechanismTelemetry: M1MechanismAggregate
}

export interface M1MechanismAggregate {
  proposalMutationSourceCounts: Partial<Record<StructuralMutation, number>>
  residualRegionsGenerated: number
  residualRegionsAdmitted: number
  structuralSignaturesGenerated: number
  structuralSignaturesAdmitted: number
  structuralSignaturesRetained: number
  stallDiversificationEvents: number
  replacementAttempts: number
  replacementPolishAttempts: number
  acceptedReplacements: number
  acceptedReplacementGain: number
  finalImprovementPhaseCounts: Partial<Record<StructuralImprovementPhase, number>>
}

export interface M1MechanismTelemetryReport {
  overall: M1MechanismAggregate
  byCell: M1MechanismAggregateCell[]
}

export interface M1MechanismAggregateCell {
  caseId: M1RealCaseId | M1SyntheticCaseId
  structuralCeiling: number
  checkpointSeconds: number
  repeatCount: number
  telemetry: M1MechanismAggregate
}

export interface M1WorkComparisonCell {
  caseId: M1RealCaseId | M1SyntheticCaseId
  structuralCeiling: number
  checkpointSeconds: number
  repeatCount: number
  counters: {
    [key in keyof SearchWorkTotals]: {
      baseline: number
      vnext: number
      delta: number
    }
  }
}

export interface M1ComplexityRepresentative {
  engine: M1Engine
  caseId: M1RealCaseId | M1SyntheticCaseId
  caseLabel: string
  structuralCeiling: number
  knownStructuralComplexity?: number
  repeatIndex: number
  filterCount: number
  qP90: number | null
  qMax: number | null
  maxAbsGainDb: number
  maxGainAbsDb: number
  sumAbsGainDb: number
  maximumCombinedBoostDb: number
  maximumCombinedBoostFrequencyHz: number
  opposingNearbyPairs: ResearchDeliveredMetrics['complexity']['nearbyOpposingPairs']
}

export interface M1QuantizedDeliverySample {
  repeatIndex: number
  floatMetrics: M1Metrics
  quantizedMetrics: M1Metrics
  deltaMaeQuantization: number
  deltaRmseQuantization: number
  deltaMaxAbsQuantization: number
  finalQuantizedFilters: Filter[]
  recomputedPreampDb: number
  baselineQuantizedMetrics: M1Metrics
}

export interface M1QuantizedDeliveryResult {
  caseId: M1RealCaseId
  structuralCeiling: number
  checkpointSeconds: 30
  baselineFloatRmseMedian: number
  vnextFloatRmseMedian: number
  baselineQuantizedRmseMedian: number
  vnextQuantizedRmseMedian: number
  vnextAdvantageSurvivesDelivery: boolean
  samples: M1QuantizedDeliverySample[]
}

export interface M1AcceptanceGate {
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
  tradeoffCases: M1RealCaseId[]
  mechanisticEvidence: {
    present: boolean
    attributableWins: M1RealCaseId[]
  }
  delivery: {
    present: boolean
    allWinsSurvive: boolean
    cases: M1RealCaseId[]
  }
  complexity: {
    noSystematicPathology: boolean
    note: string
  }
}

export interface M1CampaignResult {
  schemaVersion: typeof M1_RUNNER_SCHEMA_VERSION
  frozenImplementationSha: typeof M1_IMPLEMENTATION_SHA
  runs: M1RunRecord[]
  aggregates: M1AggregateRow[]
  workComparison: M1WorkComparisonCell[]
  vnextMechanismTelemetry: M1MechanismTelemetryReport
  quantizedDelivery: M1QuantizedDeliveryResult[]
  complexitySanity: M1ComplexityRepresentative[]
  acceptanceGate: M1AcceptanceGate
  evidenceSha256: string
  outputDir?: string
}

export interface M1RunnerOptions {
  repeats?: number
  includeReal?: boolean
  includeSynthetic?: boolean
  realCaseIds?: readonly M1RealCaseId[]
  syntheticCaseIds?: readonly M1SyntheticCaseId[]
  outputDir?: string
  writeArtifacts?: boolean
  nowMs?: () => number
  runBaseline?: (input: StructuralSearchInput) => StructuralSearchResult
  runVNext?: (input: StructuralSearchInput) => StructuralSearchResult
}

function numericSummary(values: readonly number[]): M1NumericSummary {
  if (values.length === 0) throw new Error('Cannot summarize an empty set of M1 observations')
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

function emptyWork(): SearchWorkTotals {
  return {
    structuralSearchInvocations: 0,
    beamGenerations: 0,
    proposalsGenerated: 0,
    proposalsAdmitted: 0,
    proposalsPolished: 0,
    duplicateStates: 0,
    rescueAttempts: 0,
    pairAddAttempts: 0,
    capSwapAttempts: 0,
    reseedAttempts: 0,
  }
}

function summarizeWork(rows: readonly M1RunRecord[]): M1WorkSummary {
  const result = {} as M1WorkSummary
  for (const key of WORK_KEYS) result[key] = numericSummary(rows.map((row) => row.rawWorkCounters[key]))
  return result
}

function emptyMechanism(): M1MechanismAggregate {
  return {
    proposalMutationSourceCounts: {},
    residualRegionsGenerated: 0,
    residualRegionsAdmitted: 0,
    structuralSignaturesGenerated: 0,
    structuralSignaturesAdmitted: 0,
    structuralSignaturesRetained: 0,
    stallDiversificationEvents: 0,
    replacementAttempts: 0,
    replacementPolishAttempts: 0,
    acceptedReplacements: 0,
    acceptedReplacementGain: 0,
    finalImprovementPhaseCounts: {},
  }
}

function addMechanism(
  total: M1MechanismAggregate,
  value: M1MechanismTelemetry,
): M1MechanismAggregate {
  const proposalMutationSourceCounts = { ...total.proposalMutationSourceCounts }
  for (const [family, count] of Object.entries(value.proposalMutationSourceCounts)) {
    const mutation = family as StructuralMutation
    proposalMutationSourceCounts[mutation] = (proposalMutationSourceCounts[mutation] ?? 0) + (count ?? 0)
  }
  const finalImprovementPhaseCounts = { ...total.finalImprovementPhaseCounts }
  if (value.finalImprovementPhase !== null) {
    finalImprovementPhaseCounts[value.finalImprovementPhase] =
      (finalImprovementPhaseCounts[value.finalImprovementPhase] ?? 0) + 1
  }
  return {
    proposalMutationSourceCounts,
    residualRegionsGenerated: total.residualRegionsGenerated + value.residualRegionsGenerated,
    residualRegionsAdmitted: total.residualRegionsAdmitted + value.residualRegionsAdmitted,
    structuralSignaturesGenerated: total.structuralSignaturesGenerated + value.structuralSignaturesGenerated,
    structuralSignaturesAdmitted: total.structuralSignaturesAdmitted + value.structuralSignaturesAdmitted,
    structuralSignaturesRetained: total.structuralSignaturesRetained + value.structuralSignaturesRetained,
    stallDiversificationEvents: total.stallDiversificationEvents + value.stallDiversificationEvents,
    replacementAttempts: total.replacementAttempts + value.replacementAttempts,
    replacementPolishAttempts: total.replacementPolishAttempts + value.replacementPolishAttempts,
    acceptedReplacements: total.acceptedReplacements + value.acceptedReplacements,
    acceptedReplacementGain: total.acceptedReplacementGain + value.acceptedReplacementGain,
    finalImprovementPhaseCounts,
  }
}

function emptyFrontier(): FrontierUtilizationDelta {
  return {
    parentStatesObserved: 0,
    parentFilterCountMax: 0,
    generatedCandidateFilterCountMax: 0,
    admittedCandidateFilterCountMax: 0,
    polishedCandidateFilterCountMax: 0,
    parentsAtCapacity: 0,
    generatedCandidatesAtCapacity: 0,
    admittedCandidatesAtCapacity: 0,
    polishedCandidatesAtCapacity: 0,
    candidatesWithinOneSlotOfCapacity: 0,
  }
}

function addFrontier(left: FrontierUtilizationDelta, right: FrontierUtilizationDelta): FrontierUtilizationDelta {
  return {
    parentStatesObserved: left.parentStatesObserved + right.parentStatesObserved,
    parentFilterCountMax: Math.max(left.parentFilterCountMax, right.parentFilterCountMax),
    generatedCandidateFilterCountMax: Math.max(left.generatedCandidateFilterCountMax, right.generatedCandidateFilterCountMax),
    admittedCandidateFilterCountMax: Math.max(left.admittedCandidateFilterCountMax, right.admittedCandidateFilterCountMax),
    polishedCandidateFilterCountMax: Math.max(left.polishedCandidateFilterCountMax, right.polishedCandidateFilterCountMax),
    parentsAtCapacity: left.parentsAtCapacity + right.parentsAtCapacity,
    generatedCandidatesAtCapacity: left.generatedCandidatesAtCapacity + right.generatedCandidatesAtCapacity,
    admittedCandidatesAtCapacity: left.admittedCandidatesAtCapacity + right.admittedCandidatesAtCapacity,
    polishedCandidatesAtCapacity: left.polishedCandidatesAtCapacity + right.polishedCandidatesAtCapacity,
    candidatesWithinOneSlotOfCapacity: left.candidatesWithinOneSlotOfCapacity + right.candidatesWithinOneSlotOfCapacity,
  }
}

function emptyMechanismPerRun(): M1MechanismTelemetry {
  return {
    proposalMutationSourceCounts: {},
    residualRegionsGenerated: 0,
    residualRegionsAdmitted: 0,
    structuralSignaturesGenerated: 0,
    structuralSignaturesAdmitted: 0,
    structuralSignaturesRetained: 0,
    stallDiversificationEvents: 0,
    replacementAttempts: 0,
    replacementPolishAttempts: 0,
    acceptedReplacements: 0,
    acceptedReplacementGain: 0,
    bestImprovementPhase: null,
    finalImprovementPhase: null,
  }
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

function runM1Cell(
  value: PreparedM1Case,
  engine: M1Engine,
  structuralCeiling: number,
  checkpointSeconds: number,
  repeatIndex: number,
  envelope: M1ResourceEnvelope,
  run: (input: StructuralSearchInput) => StructuralSearchResult,
  nowMs: () => number,
): M1RunRecord {
  const events: StructuralSearchTraceEvent[] = []
  const work = { ...emptyWork(), structuralSearchInvocations: 1 }
  const startedAtMs = nowMs()
  const deadlineAtMs = startedAtMs + checkpointSeconds * 1_000
  const input: StructuralSearchInput = {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequenciesHz],
    sampleRateHz: value.sampleRateHz,
    config: { ...envelope.config },
    seedFilters: [],
    deadline: { isExpired: () => nowMs() >= deadlineAtMs },
    onTrace: (event) => events.push(copyEvent(event)),
  }
  const result = run(input)
  const actualElapsedMs = Math.max(0, nowMs() - startedAtMs)
  const delivered = calculateResearchDeliveredMetrics(
    result.filters,
    value.desiredDb,
    value.frequenciesHz,
    value.sampleRateHz,
  )

  let frontierMaxFilterCount = result.filters.length
  let frontierUtilization = emptyFrontier()
  const mechanism = emptyMechanismPerRun()
  for (const event of events) {
    const eventWork = event.type === 'beam-generation'
      ? {
        structuralSearchInvocations: 0,
        beamGenerations: 1,
        proposalsGenerated: event.generatedProposals ?? 0,
        proposalsAdmitted: event.admittedProposals ?? 0,
        proposalsPolished: event.polishedProposals ?? 0,
        duplicateStates: event.duplicateStates ?? 0,
        rescueAttempts: 0,
        pairAddAttempts: 0,
        capSwapAttempts: 0,
        reseedAttempts: 0,
      }
      : emptyWork()
    const phaseAttempts = event.type === 'phase' ? event.attempts ?? event.acceptedSteps ?? 0 : 0
    const phaseWork = event.phase === 'rescue'
      ? { rescueAttempts: phaseAttempts }
      : event.phase === 'pair-add'
        ? { pairAddAttempts: phaseAttempts }
        : event.phase === 'cap-swap'
          ? { capSwapAttempts: phaseAttempts }
          : {}
    work.structuralSearchInvocations += eventWork.structuralSearchInvocations
    work.beamGenerations += eventWork.beamGenerations
    work.proposalsGenerated += eventWork.proposalsGenerated
    work.proposalsAdmitted += eventWork.proposalsAdmitted
    work.proposalsPolished += eventWork.proposalsPolished
    work.duplicateStates += eventWork.duplicateStates
    work.rescueAttempts += phaseWork.rescueAttempts ?? 0
    work.pairAddAttempts += phaseWork.pairAddAttempts ?? 0
    work.capSwapAttempts += phaseWork.capSwapAttempts ?? 0
    frontierMaxFilterCount = Math.max(
      frontierMaxFilterCount,
      event.filterCount,
      event.frontierUtilization?.parentFilterCountMax ?? 0,
      event.frontierUtilization?.generatedCandidateFilterCountMax ?? 0,
      event.frontierUtilization?.admittedCandidateFilterCountMax ?? 0,
      event.frontierUtilization?.polishedCandidateFilterCountMax ?? 0,
    )
    if (event.frontierUtilization !== undefined) frontierUtilization = addFrontier(frontierUtilization, event.frontierUtilization)

    if (engine === 'vnext') {
      for (const [family, count] of Object.entries(event.candidateSourceCounts ?? {})) {
        const mutation = family as StructuralMutation
        mechanism.proposalMutationSourceCounts[mutation] =
          (mechanism.proposalMutationSourceCounts[mutation] ?? 0) + (count ?? 0)
      }
      mechanism.residualRegionsGenerated += event.residualRegionsGenerated ?? 0
      mechanism.residualRegionsAdmitted += event.residualRegionsAdmitted ?? 0
      mechanism.structuralSignaturesGenerated += event.structuralSignaturesGenerated ?? 0
      mechanism.structuralSignaturesAdmitted += event.structuralSignaturesAdmitted ?? 0
      mechanism.structuralSignaturesRetained += event.structuralSignaturesRetained ?? 0
      mechanism.stallDiversificationEvents += event.stallDiversifications ?? 0
      mechanism.replacementAttempts += event.replacementAttempts ?? 0
      mechanism.replacementPolishAttempts += event.replacementPolished ?? 0
      mechanism.acceptedReplacements += event.replacementAccepted ?? 0
      mechanism.acceptedReplacementGain += event.acceptedReplacementGain ?? 0
      if (event.bestImprovementPhase !== undefined) mechanism.bestImprovementPhase = event.bestImprovementPhase
      if (event.finalImprovementPhase !== undefined) mechanism.finalImprovementPhase = event.finalImprovementPhase
    }
  }

  return {
    schemaVersion: M1_RUNNER_SCHEMA_VERSION,
    engine,
    caseId: value.id,
    caseLabel: value.label,
    family: value.family,
    split: value.split,
    knownStructuralComplexity: value.knownStructuralComplexity,
    structuralCeiling,
    effortLevel: M1_EFFORT_LEVEL,
    checkpointSeconds,
    repeatIndex,
    resourceEnvelope: cloneEnvelope(envelope),
    metrics: {
      maeDb: delivered.metrics.maeDb,
      rmseDb: delivered.metrics.rmseDb,
      maxAbsDb: delivered.metrics.maxAbsDb,
    },
    structuralViolation: structuralViolation(delivered.metrics),
    deliveredFilterCount: result.filters.length,
    frontierMaxFilterCount,
    actualElapsedMs,
    rawWorkCounters: work,
    frontierUtilization,
    mechanismTelemetry: mechanism,
    finalIncumbentProvenance: {
      bestImprovementPhase: mechanism.bestImprovementPhase,
      finalImprovementPhase: mechanism.finalImprovementPhase,
    },
    filters: cloneFilters(result.filters),
    delivered,
  }
}

function groupKey(row: Pick<M1RunRecord, 'engine' | 'caseId' | 'structuralCeiling' | 'checkpointSeconds'>): string {
  return `${row.engine}|${row.caseId}|${row.structuralCeiling}|${row.checkpointSeconds}`
}

function aggregateRunGroups(rows: readonly M1RunRecord[]): M1AggregateRow[] {
  const groups = new Map<string, M1RunRecord[]>()
  for (const row of rows) groups.set(groupKey(row), [...(groups.get(groupKey(row)) ?? []), row])
  return [...groups.values()].map((group) => {
    const first = group[0]!
    let mechanism = emptyMechanism()
    for (const row of group) mechanism = addMechanism(mechanism, row.mechanismTelemetry)
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
      rmseDb: numericSummary(group.map((row) => row.metrics.rmseDb)),
      maxAbsDb: numericSummary(group.map((row) => row.metrics.maxAbsDb)),
      structuralViolation: numericSummary(group.map((row) => row.structuralViolation)),
      deliveredFilterCount: numericSummary(group.map((row) => row.deliveredFilterCount)),
      frontierMaxFilterCount: numericSummary(group.map((row) => row.frontierMaxFilterCount)),
      actualElapsedMs: numericSummary(group.map((row) => row.actualElapsedMs)),
      rawWorkCounters: summarizeWork(group),
      mechanismTelemetry: mechanism,
    }
  })
}

function compareCellKey(
  left: Pick<M1AggregateRow, 'caseId' | 'structuralCeiling' | 'checkpointSeconds' | 'engine'>,
  right: Pick<M1AggregateRow, 'caseId' | 'structuralCeiling' | 'checkpointSeconds' | 'engine'>,
): number {
  const order = new Map([...M1_REAL_CASES, ...M1_SYNTHETIC_CASES].map(({ id }, index) => [id, index]))
  return (order.get(left.caseId) ?? 999) - (order.get(right.caseId) ?? 999) ||
    left.structuralCeiling - right.structuralCeiling ||
    left.checkpointSeconds - right.checkpointSeconds ||
    (left.engine === 'baseline' ? -1 : 1) - (right.engine === 'baseline' ? -1 : 1)
}

function aggregateMechanism(rows: readonly M1RunRecord[]): M1MechanismTelemetryReport {
  const vnextRows = rows.filter((row) => row.engine === 'vnext')
  const overall = vnextRows.reduce((total, row) => addMechanism(total, row.mechanismTelemetry), emptyMechanism())
  const groups = new Map<string, M1RunRecord[]>()
  for (const row of vnextRows) {
    const key = `${row.caseId}|${row.structuralCeiling}|${row.checkpointSeconds}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const byCell = [...groups.values()].map((group) => {
    const first = group[0]!
    return {
      caseId: first.caseId,
      structuralCeiling: first.structuralCeiling,
      checkpointSeconds: first.checkpointSeconds,
      repeatCount: group.length,
      telemetry: group.reduce((total, row) => addMechanism(total, row.mechanismTelemetry), emptyMechanism()),
    }
  }).sort((left, right) => compareCellKey(
    { ...left, engine: 'vnext' },
    { ...right, engine: 'vnext' },
  ))
  return { overall, byCell }
}

function aggregateWorkComparison(rows: readonly M1RunRecord[]): M1WorkComparisonCell[] {
  const groups = new Map<string, M1RunRecord[]>()
  for (const row of rows) {
    const key = `${row.caseId}|${row.structuralCeiling}|${row.checkpointSeconds}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((group) => {
    const baseline = group.filter((row) => row.engine === 'baseline')
    const vnext = group.filter((row) => row.engine === 'vnext')
    const first = group[0]!
    if (baseline.length === 0 || vnext.length === 0) throw new Error(`M1 work comparison requires both engines for ${first.caseId}`)
    const counters = {} as M1WorkComparisonCell['counters']
    for (const key of WORK_KEYS) {
      const baselineMedian = numericSummary(baseline.map((row) => row.rawWorkCounters[key])).median
      const vnextMedian = numericSummary(vnext.map((row) => row.rawWorkCounters[key])).median
      counters[key] = { baseline: baselineMedian, vnext: vnextMedian, delta: vnextMedian - baselineMedian }
    }
    return {
      caseId: first.caseId,
      structuralCeiling: first.structuralCeiling,
      checkpointSeconds: first.checkpointSeconds,
      repeatCount: Math.min(baseline.length, vnext.length),
      counters,
    }
  }).sort((left, right) => compareCellKey(
    { ...left, engine: 'baseline' },
    { ...right, engine: 'baseline' },
  ))
}

function realFinalAggregate(
  aggregates: readonly M1AggregateRow[],
  engine: M1Engine,
  caseId: M1RealCaseId,
): M1AggregateRow | undefined {
  return aggregates.find((row) =>
    row.engine === engine &&
    row.caseId === caseId &&
    row.structuralCeiling === M1_STRUCTURAL_CEILING &&
    row.checkpointSeconds === 30)
}

function metricsFromDelivered(value: ResearchDeliveredMetrics): M1Metrics {
  return {
    maeDb: value.metrics.maeDb,
    rmseDb: value.metrics.rmseDb,
    maxAbsDb: value.metrics.maxAbsDb,
  }
}

function calculateQuantizedDelivery(
  rows: readonly M1RunRecord[],
  prepared: ReadonlyMap<string, PreparedM1Case>,
  aggregates: readonly M1AggregateRow[],
): M1QuantizedDeliveryResult[] {
  const output: M1QuantizedDeliveryResult[] = []
  for (const definition of M1_REAL_CASES) {
    const caseId = definition.id
    const baselineAggregate = realFinalAggregate(aggregates, 'baseline', caseId)
    const vnextAggregate = realFinalAggregate(aggregates, 'vnext', caseId)
    if (baselineAggregate === undefined || vnextAggregate === undefined) continue
    // Delivery is intentionally gated by the final float checkpoint win.
    if (!(vnextAggregate.rmseDb.median < baselineAggregate.rmseDb.median)) continue
    const value = prepared.get(caseId)
    if (value === undefined) throw new Error(`Missing prepared M1 case: ${caseId}`)
    const config = resolveStandardAutoEqV2Config({
      ...DEFAULT_AUTOEQ_SETTINGS,
      maxFilters: M1_STRUCTURAL_CEILING,
    })
    const baselineRows = rows.filter((row) => row.engine === 'baseline' && row.caseId === caseId && row.checkpointSeconds === 30)
    const vnextRows = rows.filter((row) => row.engine === 'vnext' && row.caseId === caseId && row.checkpointSeconds === 30)
    const samples: M1QuantizedDeliverySample[] = []
    for (const vnextRow of vnextRows) {
      const baselineRow = baselineRows.find((row) => row.repeatIndex === vnextRow.repeatIndex)
      if (baselineRow === undefined) throw new Error(`Missing baseline repeat ${vnextRow.repeatIndex} for ${caseId}`)
      const vnextStress = evaluateQuantizationStress(vnextRow.filters, value.desiredDb, value.frequenciesHz, config)
      const baselineStress = evaluateQuantizationStress(baselineRow.filters, value.desiredDb, value.frequenciesHz, config)
      const quantizedMetrics = metricsFromDelivered(vnextStress.quantizedMetrics)
      samples.push({
        repeatIndex: vnextRow.repeatIndex,
        floatMetrics: metricsFromDelivered(vnextStress.floatMetrics),
        quantizedMetrics,
        deltaMaeQuantization: vnextStress.deltaMaeDb,
        deltaRmseQuantization: vnextStress.deltaRmseDb,
        deltaMaxAbsQuantization: vnextStress.deltaMaxAbsDb,
        finalQuantizedFilters: cloneFilters(vnextStress.quantizedFilters),
        recomputedPreampDb: verifyResearchPreamp(vnextStress.quantizedFilters, value.sampleRateHz).preampDb,
        baselineQuantizedMetrics: metricsFromDelivered(baselineStress.quantizedMetrics),
      })
    }
    const baselineQuantizedRmseMedian = numericSummary(samples.map((sample) => sample.baselineQuantizedMetrics.rmseDb)).median
    const vnextQuantizedRmseMedian = numericSummary(samples.map((sample) => sample.quantizedMetrics.rmseDb)).median
    output.push({
      caseId,
      structuralCeiling: M1_STRUCTURAL_CEILING,
      checkpointSeconds: 30,
      baselineFloatRmseMedian: baselineAggregate.rmseDb.median,
      vnextFloatRmseMedian: vnextAggregate.rmseDb.median,
      baselineQuantizedRmseMedian,
      vnextQuantizedRmseMedian,
      vnextAdvantageSurvivesDelivery: vnextQuantizedRmseMedian < baselineQuantizedRmseMedian,
      samples,
    })
  }
  return output
}

function complexityRepresentatives(
  rows: readonly M1RunRecord[],
): M1ComplexityRepresentative[] {
  const finalRows = rows.filter((row) => row.checkpointSeconds === 30)
  const groups = new Map<string, M1RunRecord[]>()
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
    const complexity = representative.delivered.complexity
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
      maxGainAbsDb: complexity.maxAbsGainDb,
      sumAbsGainDb: complexity.sumAbsGainDb,
      maximumCombinedBoostDb: complexity.maximumCombinedBoostDb,
      maximumCombinedBoostFrequencyHz: complexity.maximumCombinedBoostFrequencyHz,
      opposingNearbyPairs: complexity.nearbyOpposingPairs,
    }
  }).sort((left, right) => compareCellKey(
    { ...left, checkpointSeconds: 30 },
    { ...right, checkpointSeconds: 30 },
  ))
}

function evaluateAcceptance(
  aggregates: readonly M1AggregateRow[],
  delivery: readonly M1QuantizedDeliveryResult[],
  telemetry: M1MechanismTelemetryReport,
): M1AcceptanceGate {
  const wins: M1RealCaseId[] = []
  const tradeoffCases: M1RealCaseId[] = []
  const attributableWins: M1RealCaseId[] = []
  for (const definition of M1_REAL_CASES) {
    const baseline = realFinalAggregate(aggregates, 'baseline', definition.id)
    const vnext = realFinalAggregate(aggregates, 'vnext', definition.id)
    if (baseline === undefined || vnext === undefined) continue
    if (vnext.rmseDb.median < baseline.rmseDb.median) {
      wins.push(definition.id)
      const mechanism = telemetry.byCell.find((cell) =>
        cell.caseId === definition.id && cell.structuralCeiling === M1_STRUCTURAL_CEILING && cell.checkpointSeconds === 30,
      )?.telemetry
      if (mechanism !== undefined && (
        mechanism.structuralSignaturesAdmitted > 0 ||
        mechanism.structuralSignaturesRetained > 0 ||
        mechanism.acceptedReplacements > 0
      )) attributableWins.push(definition.id)
    }
    if (
      vnext.rmseDb.median > baseline.rmseDb.median &&
      vnext.maxAbsDb.median > baseline.maxAbsDb.median
    ) tradeoffCases.push(definition.id)
  }
  const developmentWins = wins.filter((id) => M1_REAL_CASES.find((definition) => definition.id === id)?.split === 'development').length
  const holdoutWins = wins.filter((id) => M1_REAL_CASES.find((definition) => definition.id === id)?.split === 'holdout').length
  const deliveryCases = delivery.map((value) => value.caseId)
  const allWinsSurvive = wins.length > 0 && wins.every((id) => delivery.find((value) => value.caseId === id)?.vnextAdvantageSurvivesDelivery === true)
  const realQualityPass = developmentWins >= 2 && holdoutWins >= 2 && wins.length >= 4
  const noSystematicTrade = tradeoffCases.length === 0
  const mechanisticEvidence = attributableWins.length > 0
  const deliveryPass = wins.length > 0 && deliveryCases.length === wins.length && allWinsSurvive
  // Complexity is a reporting gate, not an optimization objective.  The
  // representative table is intentionally left for human pathology review.
  const complexity = {
    noSystematicPathology: true,
    note: 'No automatic complexity objective or threshold was applied; inspect representative outputs for pathological increases with no quality benefit.',
  } as const
  return {
    pass: realQualityPass && noSystematicTrade && mechanisticEvidence && deliveryPass && complexity.noSystematicPathology,
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
    mechanisticEvidence: { present: mechanisticEvidence, attributableWins },
    delivery: { present: delivery.length > 0, allWinsSurvive, cases: deliveryCases },
    complexity,
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

type M1CommittedEvidence = Omit<M1CampaignResult, 'evidenceSha256' | 'outputDir' | 'runs'>

function evidenceHash(value: M1CommittedEvidence): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function writeM1Artifacts(
  outputDir: string,
  result: M1CampaignResult,
): void {
  mkdirSync(outputDir, { recursive: true })
  // This file is deliberately raw and timing-sensitive.  It must remain
  // ignored/uncommitted while aggregate evidence is suitable for review.
  writeFileSync(resolve(outputDir, 'raw-timing.jsonl'), '', 'utf8')
  for (const row of result.runs) appendFileSync(resolve(outputDir, 'raw-timing.jsonl'), `${JSON.stringify(row)}\n`, 'utf8')
  const aggregate = {
    schemaVersion: result.schemaVersion,
    frozenImplementationSha: result.frozenImplementationSha,
    aggregates: result.aggregates,
    workComparison: result.workComparison,
    vnextMechanismTelemetry: result.vnextMechanismTelemetry,
    quantizedDelivery: result.quantizedDelivery,
    complexitySanity: result.complexitySanity,
    acceptanceGate: result.acceptanceGate,
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'quantized-delivery.json'), `${JSON.stringify(result.quantizedDelivery, null, 2)}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'complexity-sanity.json'), `${JSON.stringify(result.complexitySanity, null, 2)}\n`, 'utf8')
  const summaryLines = [
    '# Structural Search VNext M1',
    '',
    `- Frozen implementation: \`${result.frozenImplementationSha}\``,
    `- Evidence SHA-256: \`${result.evidenceSha256}\``,
    `- Envelope: structural ceiling ${M1_STRUCTURAL_CEILING}, effort ${M1_EFFORT_LEVEL}, checkpoints ${M1_CHECKPOINT_SECONDS.join('/')}, repeats ${M1_REPEAT_COUNT}`,
    `- Engines: baseline \`runStructuralSearch\`; VNext \`runStructuralSearchVNext\``,
    '',
    '## Quality (best / median / worst)',
    '',
    '| Engine | Case | Ceiling | Checkpoint | RMSE | maxAbs | Violation | Filters | Frontier max | Elapsed ms |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |',
    ...result.aggregates.map((row) =>
      `| ${row.engine} | ${row.caseLabel} | ${row.structuralCeiling} | ${row.checkpointSeconds}s | ${row.rmseDb.best.toFixed(4)} / ${row.rmseDb.median.toFixed(4)} / ${row.rmseDb.worst.toFixed(4)} | ${row.maxAbsDb.best.toFixed(4)} / ${row.maxAbsDb.median.toFixed(4)} / ${row.maxAbsDb.worst.toFixed(4)} | ${row.structuralViolation.best.toFixed(3)} / ${row.structuralViolation.median.toFixed(3)} / ${row.structuralViolation.worst.toFixed(3)} | ${row.deliveredFilterCount.best} / ${row.deliveredFilterCount.median} / ${row.deliveredFilterCount.worst} | ${row.frontierMaxFilterCount.best} / ${row.frontierMaxFilterCount.median} / ${row.frontierMaxFilterCount.worst} | ${row.actualElapsedMs.best.toFixed(1)} / ${row.actualElapsedMs.median.toFixed(1)} / ${row.actualElapsedMs.worst.toFixed(1)} |`,
    ),
    '',
    '## Mechanism and delivery',
    '',
    '- Full mechanism counters: `aggregate.json` (`vnextMechanismTelemetry`).',
    '- Quantized delivery is present only for final real-case VNext float wins: `quantized-delivery.json`.',
    '- Complexity representatives: `complexity-sanity.json`.',
    '',
    `- Frozen acceptance gate: **${result.acceptanceGate.pass ? 'PASS' : 'FAIL'}**`,
    '',
  ]
  writeFileSync(resolve(outputDir, 'summary.md'), `${summaryLines.join('\n')}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
    schemaVersion: result.schemaVersion,
    frozenImplementationSha: result.frozenImplementationSha,
    engines: ['baseline', 'vnext'],
    structuralCeiling: M1_STRUCTURAL_CEILING,
    effortLevel: M1_EFFORT_LEVEL,
    checkpoints: M1_CHECKPOINT_SECONDS,
    repeats: M1_REPEAT_COUNT,
    corpusHashes: { ...RESEARCH_CORPUS_SHA256, ...MANUAL_REGRESSION_FIXTURE_SHA256 },
    rawTimingPath: 'raw-timing.jsonl',
    aggregatePath: 'aggregate.json',
    evidenceSha256: result.evidenceSha256,
  }, null, 2)}\n`, 'utf8')
}

/** Run the fixed serial M1 baseline/VNext campaign. */
export function runStructuralSearchVnextM1(options: M1RunnerOptions = {}): M1CampaignResult {
  const repeats = options.repeats ?? M1_REPEAT_COUNT
  if (repeats !== M1_REPEAT_COUNT) throw new Error(`M1 repeats are frozen at ${M1_REPEAT_COUNT}`)
  const includeReal = options.includeReal ?? true
  const includeSynthetic = options.includeSynthetic ?? true
  const realIds = options.realCaseIds ?? M1_REAL_CASES.map(({ id }) => id as M1RealCaseId)
  const syntheticIds = options.syntheticCaseIds ?? M1_SYNTHETIC_CASES.map(({ id }) => id as M1SyntheticCaseId)
  if (!includeReal && !includeSynthetic) throw new Error('M1 campaign must include a real or synthetic case')
  const prepared = [
    ...(includeReal ? preparedRealCases(realIds) : []),
    ...(includeSynthetic ? preparedSyntheticCases(syntheticIds) : []),
  ]
  const preparedById = new Map(prepared.map((value) => [value.id, value]))
  const nowMs = options.nowMs ?? (() => performance.now())
  const baselineRunner = options.runBaseline ?? runStructuralSearch
  const vnextRunner = options.runVNext ?? runStructuralSearchVNext
  const runs: M1RunRecord[] = []

  // Case, envelope, checkpoint, repeat, engine: no concurrent timing runs.
  for (const value of prepared) {
    for (const structuralCeiling of value.structuralCeilings) {
      const envelope = createM1ResourceEnvelope(structuralCeiling, M1_EFFORT_LEVEL)
      for (const checkpointSeconds of M1_CHECKPOINT_SECONDS) {
        for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
          runs.push(runM1Cell(value, 'baseline', structuralCeiling, checkpointSeconds, repeatIndex, envelope, baselineRunner, nowMs))
          runs.push(runM1Cell(value, 'vnext', structuralCeiling, checkpointSeconds, repeatIndex, envelope, vnextRunner, nowMs))
        }
      }
    }
  }

  const aggregates = aggregateRunGroups(runs).sort((left, right) => compareCellKey(left, right))
  const workComparison = aggregateWorkComparison(runs)
  const vnextMechanismTelemetry = aggregateMechanism(runs)
  const quantizedDelivery = calculateQuantizedDelivery(runs, preparedById, aggregates)
  const complexitySanity = complexityRepresentatives(runs)
  const partial = {
    schemaVersion: M1_RUNNER_SCHEMA_VERSION,
    frozenImplementationSha: M1_IMPLEMENTATION_SHA,
    runs,
    aggregates,
    workComparison,
    vnextMechanismTelemetry,
    quantizedDelivery,
    complexitySanity,
    acceptanceGate: evaluateAcceptance(aggregates, quantizedDelivery, vnextMechanismTelemetry),
  }
  const committedEvidence: M1CommittedEvidence = {
    schemaVersion: partial.schemaVersion,
    frozenImplementationSha: partial.frozenImplementationSha,
    aggregates: partial.aggregates,
    workComparison: partial.workComparison,
    vnextMechanismTelemetry: partial.vnextMechanismTelemetry,
    quantizedDelivery: partial.quantizedDelivery,
    complexitySanity: partial.complexitySanity,
    acceptanceGate: partial.acceptanceGate,
  }
  const outputDir = options.outputDir ?? M1_DEFAULT_OUTPUT_DIR
  const result: M1CampaignResult = {
    ...partial,
    evidenceSha256: evidenceHash(committedEvidence),
    outputDir: options.writeArtifacts === false ? undefined : outputDir,
  }
  if (options.writeArtifacts !== false) writeM1Artifacts(outputDir, result)
  return result
}

/**
 * The package script supplies a marker because pnpm/tsx may place the tsx
 * launcher, rather than this source path, in argv[1].  The path check keeps
 * direct `tsx benchmarks/research/structuralSearchVnext.ts` invocation useful.
 */
export function isM1CliInvocation(
  argv: readonly string[] = process.argv,
  moduleUrl: string = import.meta.url,
): boolean {
  if (argv.includes('--m1-runner')) return true
  const modulePath = resolve(fileURLToPath(moduleUrl))
  return argv.slice(1).some((argument) => {
    try {
      return resolve(argument) === modulePath
    } catch {
      return false
    }
  })
}

if (isM1CliInvocation()) {
  const result = runStructuralSearchVnextM1()
  process.stdout.write(`${JSON.stringify({
    frozenImplementationSha: result.frozenImplementationSha,
    evidenceSha256: result.evidenceSha256,
    runCount: result.runs.length,
    aggregateCount: result.aggregates.length,
    quantizedDeliveryCases: result.quantizedDelivery.map(({ caseId }) => caseId),
    acceptanceGate: result.acceptanceGate,
  }, null, 2)}\n`)
}
