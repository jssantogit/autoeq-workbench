import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  resolveScalableEffortConfig,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  structuralViolation,
  type SearchWorkTotals,
  type StructuralSearchInput,
  type StructuralSearchResult,
} from '../../src/index.js'
import type {
  CapacityPressureDelta,
  FrontierUtilizationDelta,
  StructuralSearchM3Signal,
  StructuralSearchM3Signals,
  StructuralSearchM3TelemetryEvent,
  ResolvedStructuralSearchConfig,
} from '../../src/autoeq/v2/structuralSearch.js'
import type { Filter } from '../../src/types/filter.js'

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
  calculateResearchDeliveredMetrics,
  type ResearchDeliveredMetrics,
} from './deliveredMetrics.js'

/** M3 is diagnostic-only; these controls are deliberately not configurable. */
export const M3_FROZEN_BOUNDARY = 'f5052b2b1bfdf12b013db5c34c5fda65304091c3' as const
export const M3_STRUCTURAL_CEILING = 43 as const
export const M3_EFFORT_LEVEL = 6 as const
export const M3_TRAJECTORY_SECONDS = 30 as const
export const M3_REPEAT_COUNT = 3 as const
export const M3_RUNNER_SCHEMA_VERSION = 1 as const
export const M3_DEFAULT_OUTPUT_DIR = resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
  '.research-artifacts/structural-search-m3-stagnation-census',
)

export const M3_REAL_CASES = Object.freeze([
  { id: 'titan-to-rsv', label: 'Titan → RSV', family: 'real', split: 'development' },
  { id: 'titan-to-mystic-8', label: 'Titan → Mystic 8', family: 'real', split: 'development' },
  { id: 'titan-to-s12-ultra', label: 'Titan → S12 Ultra', family: 'real', split: 'development' },
  { id: 'titan-to-storm', label: 'Titan → Storm', family: 'real', split: 'holdout' },
  { id: 'titan-to-u12t', label: 'Titan → U12t', family: 'real', split: 'holdout' },
  { id: 'titan-to-trio', label: 'Titan → Trio', family: 'real', split: 'holdout' },
] as const)

export const M3_SYNTHETIC_CASES = Object.freeze([
  { id: 'synthetic-d-dense-known-structure', label: 'Synthetic D', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-e-high-q-valid', label: 'Synthetic E', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-f-upper-frequency-structure', label: 'Synthetic F', family: 'synthetic', split: 'sanity' },
  { id: 'synthetic-h-alternating-structure', label: 'Synthetic H', family: 'synthetic', split: 'sanity' },
] as const)

export type M3RealCaseId = (typeof M3_REAL_CASES)[number]['id']
export type M3SyntheticCaseId = (typeof M3_SYNTHETIC_CASES)[number]['id']
export type M3CaseId = M3RealCaseId | M3SyntheticCaseId

export interface M3ResourceEnvelope {
  structuralCeiling: number
  effortLevel: number
  beamWidth: number
  proposalsPerParent: number
  localPolishEvaluations: number
  preset: typeof import('../../src/autoeq/v2/structuralSearch.js').MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET
  schedulerPolicy: 'direct-structural-search'
  seedSemantics: 'empty-filters-deterministic'
  deadlinePolicy: 'one-continuing-trajectory-with-30-second-budget'
  config: ResolvedStructuralSearchConfig
}

export interface M3GenerationRecord extends StructuralSearchM3TelemetryEvent {
  elapsedMs: number
}

export interface M3RunRecord {
  schemaVersion: typeof M3_RUNNER_SCHEMA_VERSION
  caseId: M3CaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  knownStructuralComplexity?: number
  structuralCeiling: number
  effortLevel: number
  repeatIndex: number
  trajectoryRunId: string
  trajectoryElapsedMs: number
  resourceEnvelope: M3ResourceEnvelope
  generations: M3GenerationRecord[]
  filters: Filter[]
  final: {
    rmseDb: number
    maxAbsDb: number
    structuralViolation: number
    deliveredFilterCount: number
    delivered: ResearchDeliveredMetrics
  }
}

export interface M3NumericSummary {
  best: number
  median: number
  worst: number
  spread: number
}

export interface M3PersistenceSummary {
  occurrenceRunCount: number
  median: number | null
  max: number
}

export interface M3FutureProgressSummary {
  occurrenceCount: number
  referenceSignatureLaterChanges: number
  survivingNovelStructuralSignatureLater: number
  finalRmseImprovesFurther: number
  finalMaxAbsImprovesFurther: number
  additionalFiltersUltimatelyDelivered: number
}

export interface M3SignalSummary {
  occurrenceCount: number
  trajectoriesWithOccurrence: number
  casesWithOccurrence: number
  repeatsWithOccurrence: number
  firstOccurrenceGeneration: M3NumericSummary | null
  firstOccurrenceElapsedMs: M3NumericSummary | null
  persistence: M3PersistenceSummary
  /** Occurrences that coexisted with ordinary numeric progress. */
  numericImprovingOccurrences: number
  structuralNoveltyAfterOccurrence: {
    referenceSignatureLaterChanges: number
    survivingNovelStructuralSignatureLater: number
  }
  subsequentBaselineQualityProgress: {
    finalRmseImprovesFurther: number
    finalMaxAbsImprovesFurther: number
    additionalFiltersUltimatelyDelivered: number
  }
  futureProgress: M3FutureProgressSummary
}

export interface M3FamilyAggregate {
  family: 'real' | 'synthetic'
  caseCount: number
  trajectoryCount: number
  signals: Record<StructuralSearchM3Signal, M3SignalSummary>
}

export interface M3CaseAggregate {
  caseId: M3CaseId
  caseLabel: string
  family: 'real' | 'synthetic'
  knownStructuralComplexity?: number
  structuralCeilings: number[]
  signals: Record<StructuralSearchM3Signal, M3SignalSummary>
}

export type M3Conclusion =
  | 'STRUCTURAL_PLATEAU_SUPPORTED'
  | 'STRUCTURAL_PLATEAU_NOT_SUPPORTED'
  | 'INCONCLUSIVE'

export interface M3AggregateEvidence {
  real: M3FamilyAggregate
  synthetic: M3FamilyAggregate
  byCase: M3CaseAggregate[]
}

export interface M3DecisionBoundary {
  conclusion: M3Conclusion
  rule: 'all-six-real-cases-have-a-structural-signal' | 'no-real-structural-signal' | 'mixed-real-coverage'
  structuralSignals: StructuralSearchM3Signal[]
  recommendedFutureSignal: StructuralSearchM3Signal | null
  missingInformation: string[]
}

export interface M3CampaignResult {
  schemaVersion: typeof M3_RUNNER_SCHEMA_VERSION
  frozenBoundary: typeof M3_FROZEN_BOUNDARY
  resourceEnvelope: M3ResourceEnvelope
  runs: M3RunRecord[]
  aggregate: M3AggregateEvidence
  decisionBoundary: M3DecisionBoundary
  conclusion: M3Conclusion
  evidenceSha256: string
  outputDir?: string
}

export interface M3RunnerOptions {
  includeReal?: boolean
  includeSynthetic?: boolean
  realCaseIds?: readonly M3RealCaseId[]
  syntheticCaseIds?: readonly M3SyntheticCaseId[]
  outputDir?: string
  writeArtifacts?: boolean
  nowMs?: () => number
  runBaseline?: (input: StructuralSearchInput) => StructuralSearchResult
}

interface PreparedM3Case {
  id: M3CaseId
  label: string
  family: 'real' | 'synthetic'
  split: 'development' | 'holdout' | 'sanity'
  frequenciesHz: number[]
  desiredDb: number[]
  sampleRateHz: number
  structuralCeilings: number[]
  knownStructuralComplexity?: number
}

interface CapturedGeneration {
  event: StructuralSearchM3TelemetryEvent
  elapsedMs: number
}

const SIGNALS: readonly StructuralSearchM3Signal[] = ['S0', 'S1', 'S2', 'S3', 'S4']
const STRUCTURAL_SIGNALS: readonly StructuralSearchM3Signal[] = ['S1', 'S2', 'S3', 'S4']
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

function cloneFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => ({ ...filter }))
}

function clonePressure(value: CapacityPressureDelta): CapacityPressureDelta {
  return { ...value }
}

function cloneFrontier(value: FrontierUtilizationDelta): FrontierUtilizationDelta {
  return { ...value }
}

function cloneGeneration(event: StructuralSearchM3TelemetryEvent): StructuralSearchM3TelemetryEvent {
  return {
    ...event,
    retainedBeamSignatures: [...event.retainedBeamSignatures],
    generatedStructuralSignatures: [...event.generatedStructuralSignatures],
    admittedStructuralSignatures: [...event.admittedStructuralSignatures],
    survivingStructuralSignatures: [...event.survivingStructuralSignatures],
    signals: { ...event.signals },
    capacityPressure: clonePressure(event.capacityPressure),
    ordinaryWorkCounters: { ...event.ordinaryWorkCounters },
    frontierUtilization: cloneFrontier(event.frontierUtilization),
  }
}

function cloneEnvelope(value: M3ResourceEnvelope): M3ResourceEnvelope {
  return { ...value, config: { ...value.config } }
}

export function createM3ResourceEnvelope(
  structuralCeiling: number = M3_STRUCTURAL_CEILING,
): M3ResourceEnvelope {
  if (!Number.isSafeInteger(structuralCeiling) || structuralCeiling <= 0) {
    throw new Error('M3 structural ceiling must be a positive integer')
  }
  const baseConfig = resolveStructuralSearchConfig({
    preset: 'max10-q31-b4-p8-experimental',
    timeLimitSeconds: M3_TRAJECTORY_SECONDS,
  })
  const config = resolveScalableEffortConfig(baseConfig, structuralCeiling, M3_EFFORT_LEVEL)
  return {
    structuralCeiling,
    effortLevel: M3_EFFORT_LEVEL,
    beamWidth: config.beamWidth,
    proposalsPerParent: config.proposalsPerParent,
    localPolishEvaluations: config.localPolishEvaluations,
    preset: 'max10-q31-b4-p8-experimental',
    schedulerPolicy: 'direct-structural-search',
    seedSemantics: 'empty-filters-deterministic',
    deadlinePolicy: 'one-continuing-trajectory-with-30-second-budget',
    config: { ...config },
  }
}

function preparedCases(
  includeReal: boolean,
  includeSynthetic: boolean,
  realCaseIds: readonly M3RealCaseId[],
  syntheticCaseIds: readonly M3SyntheticCaseId[],
): PreparedM3Case[] {
  const prepared: PreparedM3Case[] = []
  if (includeReal) {
    const definitions = new Map(M3_REAL_CASES.map((definition) => [definition.id, definition]))
    for (const id of realCaseIds) {
      const definition = definitions.get(id)
      if (definition === undefined) throw new Error(`Unknown M3 real case: ${id}`)
      const desired = id === 'titan-to-rsv' || id === 'titan-to-mystic-8' || id === 'titan-to-s12-ultra'
        ? prepareManualRegressionDesired(id)
        : prepareResearchDesired(id)
      prepared.push({
        id,
        label: definition.label,
        family: 'real',
        split: definition.split,
        frequenciesHz: [...desired.frequenciesHz],
        desiredDb: [...desired.desiredDb],
        sampleRateHz: 48_000,
        structuralCeilings: [M3_STRUCTURAL_CEILING],
      })
    }
  }
  if (includeSynthetic) {
    const definitions = new Map(M3_SYNTHETIC_CASES.map((definition) => [definition.id, definition]))
    const corpus = new Map(loadSyntheticGroundTruthCorpus().map((value) => [value.id, value]))
    for (const id of syntheticCaseIds) {
      const definition = definitions.get(id)
      const value = corpus.get(id)
      if (definition === undefined || value === undefined) throw new Error(`Unknown M3 synthetic case: ${id}`)
      prepared.push({
        id,
        label: definition.label,
        family: 'synthetic',
        split: 'sanity',
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

function numericSummary(values: readonly number[]): M3NumericSummary | null {
  if (values.length === 0) return null
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

function emptySignalSummary(): M3SignalSummary {
  return {
    occurrenceCount: 0,
    trajectoriesWithOccurrence: 0,
    casesWithOccurrence: 0,
    repeatsWithOccurrence: 0,
    firstOccurrenceGeneration: null,
    firstOccurrenceElapsedMs: null,
    persistence: { occurrenceRunCount: 0, median: null, max: 0 },
    numericImprovingOccurrences: 0,
    structuralNoveltyAfterOccurrence: {
      referenceSignatureLaterChanges: 0,
      survivingNovelStructuralSignatureLater: 0,
    },
    subsequentBaselineQualityProgress: {
      finalRmseImprovesFurther: 0,
      finalMaxAbsImprovesFurther: 0,
      additionalFiltersUltimatelyDelivered: 0,
    },
    futureProgress: {
      occurrenceCount: 0,
      referenceSignatureLaterChanges: 0,
      survivingNovelStructuralSignatureLater: 0,
      finalRmseImprovesFurther: 0,
      finalMaxAbsImprovesFurther: 0,
      additionalFiltersUltimatelyDelivered: 0,
    },
  }
}

function addSignalSummary(rows: readonly M3RunRecord[], signal: StructuralSearchM3Signal): M3SignalSummary {
  const summary = emptySignalSummary()
  const runsWithOccurrence = rows.filter((row) => row.generations.some((generation) => generation.signals[signal]))
  const caseIds = new Set(runsWithOccurrence.map((row) => row.caseId))
  const repeatIds = new Set(runsWithOccurrence.map((row) => `${row.caseId}|${row.repeatIndex}`))
  const firstGenerations: number[] = []
  const firstElapsed: number[] = []
  const persistenceRuns: number[] = []
  for (const row of rows) {
    const generations = row.generations
    const first = generations.find((generation) => generation.signals[signal])
    if (first !== undefined) {
      firstGenerations.push(first.generation)
      firstElapsed.push(first.elapsedMs)
    }
    let index = 0
    while (index < generations.length) {
      if (!generations[index]!.signals[signal]) {
        index += 1
        continue
      }
      const start = index
      while (index + 1 < generations.length && generations[index + 1]!.signals[signal]) index += 1
      persistenceRuns.push(index - start + 1)
      index += 1
    }
    for (let generationIndex = 0; generationIndex < generations.length; generationIndex += 1) {
      const occurrence = generations[generationIndex]!
      if (!occurrence.signals[signal]) continue
      summary.occurrenceCount += 1
      if (occurrence.numericReferenceImprovement) summary.numericImprovingOccurrences += 1
      const later = generations.slice(generationIndex + 1)
      const referenceSignatureLaterChanges = later.some((candidate) => candidate.referenceSignature !== occurrence.referenceSignature)
      const survivingNovelStructuralSignatureLater = later.some((candidate) => candidate.newlyGeneratedStructuralSignatureSurvived)
      const finalRmseImprovesFurther = row.final.rmseDb < occurrence.referenceRmseDb
      const finalMaxAbsImprovesFurther = row.final.maxAbsDb < occurrence.referenceMaxAbsDb
      const additionalFiltersUltimatelyDelivered = row.final.deliveredFilterCount > occurrence.deliveredFilterCount
      if (referenceSignatureLaterChanges) summary.structuralNoveltyAfterOccurrence.referenceSignatureLaterChanges += 1
      if (survivingNovelStructuralSignatureLater) summary.structuralNoveltyAfterOccurrence.survivingNovelStructuralSignatureLater += 1
      if (finalRmseImprovesFurther) summary.subsequentBaselineQualityProgress.finalRmseImprovesFurther += 1
      if (finalMaxAbsImprovesFurther) summary.subsequentBaselineQualityProgress.finalMaxAbsImprovesFurther += 1
      if (additionalFiltersUltimatelyDelivered) summary.subsequentBaselineQualityProgress.additionalFiltersUltimatelyDelivered += 1
      summary.futureProgress.occurrenceCount += 1
      if (referenceSignatureLaterChanges) summary.futureProgress.referenceSignatureLaterChanges += 1
      if (survivingNovelStructuralSignatureLater) summary.futureProgress.survivingNovelStructuralSignatureLater += 1
      if (finalRmseImprovesFurther) summary.futureProgress.finalRmseImprovesFurther += 1
      if (finalMaxAbsImprovesFurther) summary.futureProgress.finalMaxAbsImprovesFurther += 1
      if (additionalFiltersUltimatelyDelivered) summary.futureProgress.additionalFiltersUltimatelyDelivered += 1
    }
  }
  summary.trajectoriesWithOccurrence = runsWithOccurrence.length
  summary.casesWithOccurrence = caseIds.size
  summary.repeatsWithOccurrence = repeatIds.size
  summary.firstOccurrenceGeneration = numericSummary(firstGenerations)
  summary.firstOccurrenceElapsedMs = numericSummary(firstElapsed)
  summary.persistence = {
    occurrenceRunCount: persistenceRuns.length,
    median: numericSummary(persistenceRuns)?.median ?? null,
    max: Math.max(0, ...persistenceRuns),
  }
  return summary
}

function familyAggregate(rows: readonly M3RunRecord[], family: 'real' | 'synthetic'): M3FamilyAggregate {
  const familyRows = rows.filter((row) => row.family === family)
  const signals = {} as Record<StructuralSearchM3Signal, M3SignalSummary>
  for (const signal of SIGNALS) signals[signal] = addSignalSummary(familyRows, signal)
  return {
    family,
    caseCount: new Set(familyRows.map((row) => row.caseId)).size,
    trajectoryCount: familyRows.length,
    signals,
  }
}

function caseAggregate(rows: readonly M3RunRecord[]): M3CaseAggregate[] {
  const groups = new Map<M3CaseId, M3RunRecord[]>()
  for (const row of rows) groups.set(row.caseId, [...(groups.get(row.caseId) ?? []), row])
  return [...groups.values()].map((group) => {
    const first = group[0]!
    const signals = {} as Record<StructuralSearchM3Signal, M3SignalSummary>
    for (const signal of SIGNALS) signals[signal] = addSignalSummary(group, signal)
    return {
      caseId: first.caseId,
      caseLabel: first.caseLabel,
      family: first.family,
      knownStructuralComplexity: first.knownStructuralComplexity,
      structuralCeilings: [...new Set(group.map((row) => row.structuralCeiling))].sort((left, right) => left - right),
      signals,
    }
  }).sort((left, right) => caseOrder(left.caseId) - caseOrder(right.caseId))
}

function caseOrder(caseId: M3CaseId): number {
  const order = [...M3_REAL_CASES, ...M3_SYNTHETIC_CASES].map(({ id }) => id)
  return order.indexOf(caseId)
}

function aggregateEvidence(rows: readonly M3RunRecord[]): M3AggregateEvidence {
  return {
    real: familyAggregate(rows, 'real'),
    synthetic: familyAggregate(rows, 'synthetic'),
    byCase: caseAggregate(rows),
  }
}

function chooseDecision(aggregate: M3AggregateEvidence): M3DecisionBoundary {
  const coveredStructuralSignals = STRUCTURAL_SIGNALS.filter((signal) =>
    aggregate.real.signals[signal].casesWithOccurrence > 0,
  )
  const coveredCases = new Set(
    aggregate.byCase
      .filter((row) => row.family === 'real' && STRUCTURAL_SIGNALS.some((signal) => row.signals[signal].occurrenceCount > 0))
      .map((row) => row.caseId),
  )
  const realCaseCount = M3_REAL_CASES.length
  if (coveredCases.size === 0) {
    return {
      conclusion: 'STRUCTURAL_PLATEAU_NOT_SUPPORTED',
      rule: 'no-real-structural-signal',
      structuralSignals: coveredStructuralSignals,
      recommendedFutureSignal: null,
      missingInformation: [],
    }
  }
  if (coveredCases.size < realCaseCount) {
    return {
      conclusion: 'INCONCLUSIVE',
      rule: 'mixed-real-coverage',
      structuralSignals: coveredStructuralSignals,
      recommendedFutureSignal: null,
      missingInformation: [
        `Structural signals did not occur in all ${realCaseCount} real cases; broader or repeated real trajectories are needed before selecting an intervention.`,
      ],
    }
  }
  const recommendedFutureSignal = [...coveredStructuralSignals].sort((left, right) =>
    aggregate.real.signals[right].casesWithOccurrence - aggregate.real.signals[left].casesWithOccurrence ||
    SIGNALS.indexOf(left) - SIGNALS.indexOf(right),
  )[0] ?? null
  return {
    conclusion: 'STRUCTURAL_PLATEAU_SUPPORTED',
    rule: 'all-six-real-cases-have-a-structural-signal',
    structuralSignals: coveredStructuralSignals,
    recommendedFutureSignal,
    missingInformation: [],
  }
}

function trajectoryRunId(value: PreparedM3Case, structuralCeiling: number, repeatIndex: number): string {
  return `baseline|${value.id}|${structuralCeiling}|${repeatIndex}`
}

function runContinuingTrajectory(
  value: PreparedM3Case,
  structuralCeiling: number,
  repeatIndex: number,
  envelope: M3ResourceEnvelope,
  runner: (input: StructuralSearchInput) => StructuralSearchResult,
  nowMs: () => number,
): M3RunRecord {
  const captured: CapturedGeneration[] = []
  const startedAtMs = nowMs()
  const deadlineAtMs = startedAtMs + M3_TRAJECTORY_SECONDS * 1_000
  const input: StructuralSearchInput = {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequenciesHz],
    sampleRateHz: value.sampleRateHz,
    config: { ...envelope.config },
    seedFilters: [],
    deadline: { isExpired: () => nowMs() >= deadlineAtMs },
    onBaselineTelemetry: (event) => captured.push({
      event: cloneGeneration(event),
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
    }),
  }
  const result = runner(input)
  const trajectoryElapsedMs = Math.max(0, nowMs() - startedAtMs)
  const delivered = calculateResearchDeliveredMetrics(
    result.filters,
    value.desiredDb,
    value.frequenciesHz,
    value.sampleRateHz,
  )
  return {
    schemaVersion: M3_RUNNER_SCHEMA_VERSION,
    caseId: value.id,
    caseLabel: value.label,
    family: value.family,
    split: value.split,
    knownStructuralComplexity: value.knownStructuralComplexity,
    structuralCeiling,
    effortLevel: M3_EFFORT_LEVEL,
    repeatIndex,
    trajectoryRunId: trajectoryRunId(value, structuralCeiling, repeatIndex),
    trajectoryElapsedMs,
    resourceEnvelope: cloneEnvelope(envelope),
    generations: captured.map(({ event, elapsedMs }) => ({ ...event, elapsedMs })),
    filters: cloneFilters(result.filters),
    final: {
      rmseDb: result.rmseDb,
      maxAbsDb: result.maxAbsDb,
      structuralViolation: structuralViolation(result),
      deliveredFilterCount: result.filters.length,
      delivered,
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

function evidenceHash(value: Omit<M3CampaignResult, 'evidenceSha256' | 'outputDir' | 'runs'>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function syntheticCorpusHash(): string {
  const corpus = loadSyntheticGroundTruthCorpus().map((value) => ({
    id: value.id,
    family: value.family,
    seed: value.seed,
    sampleRateHz: value.sampleRateHz,
    knownStructuralComplexity: value.knownStructuralComplexity,
    truthFilters: value.truthFilters,
  }))
  return createHash('sha256').update(stableJson(corpus)).digest('hex')
}

function reportFamilyRows(aggregate: M3AggregateEvidence, family: 'real' | 'synthetic'): string[] {
  const familyAggregateValue = aggregate[family]
  return SIGNALS.map((signal) => {
    const value = familyAggregateValue.signals[signal]
    return `| ${family} | ${signal} | ${value.casesWithOccurrence} | ${value.repeatsWithOccurrence} | ${value.trajectoriesWithOccurrence} | ${value.occurrenceCount} | ${value.persistence.median ?? '—'} | ${value.persistence.max} | ${value.firstOccurrenceGeneration?.median ?? '—'} | ${value.firstOccurrenceElapsedMs?.median?.toFixed(1) ?? '—'} | ${value.structuralNoveltyAfterOccurrence.referenceSignatureLaterChanges} | ${value.structuralNoveltyAfterOccurrence.survivingNovelStructuralSignatureLater} | ${value.subsequentBaselineQualityProgress.finalRmseImprovesFurther} | ${value.subsequentBaselineQualityProgress.finalMaxAbsImprovesFurther} | ${value.subsequentBaselineQualityProgress.additionalFiltersUltimatelyDelivered} |`
  })
}

function caseCoverageLine(row: M3CaseAggregate): string {
  const complexity = row.knownStructuralComplexity === undefined
    ? ''
    : `, known K=${row.knownStructuralComplexity}, ceilings ${row.structuralCeilings.join('/')}`
  const signals = SIGNALS.map((signal) => {
    const value = row.signals[signal]
    return `${signal} ${value.casesWithOccurrence}/1 cases, ${value.repeatsWithOccurrence} repeats, ${value.occurrenceCount} generations`
  }).join('; ')
  return `- ${row.caseLabel} (${row.family}${complexity}): ${signals}`
}

function writeArtifacts(outputDir: string, result: M3CampaignResult): void {
  mkdirSync(outputDir, { recursive: true })
  // Timing/generation traces are useful locally but are not committed evidence.
  writeFileSync(resolve(outputDir, 'raw-timing.jsonl'), '', 'utf8')
  for (const row of result.runs) appendFileSync(resolve(outputDir, 'raw-timing.jsonl'), `${JSON.stringify(row)}\n`, 'utf8')

  const aggregate = {
    schemaVersion: result.schemaVersion,
    frozenBoundary: result.frozenBoundary,
    resourceEnvelope: result.resourceEnvelope,
    aggregate: result.aggregate,
    decisionBoundary: result.decisionBoundary,
    conclusion: result.conclusion,
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')
  const manifest = {
    schemaVersion: result.schemaVersion,
    frozenBoundary: result.frozenBoundary,
    resourceEnvelope: {
      structuralCeiling: M3_STRUCTURAL_CEILING,
      effortLevel: M3_EFFORT_LEVEL,
      trajectorySeconds: M3_TRAJECTORY_SECONDS,
      repeatCount: M3_REPEAT_COUNT,
      semantics: 'one-continuing-baseline-trajectory-per-case-ceiling-repeat',
    },
    corpusHashes: {
      ...RESEARCH_CORPUS_SHA256,
      ...MANUAL_REGRESSION_FIXTURE_SHA256,
      syntheticGroundTruth: syntheticCorpusHash(),
    },
    syntheticComplexitySemantics: 'known-generating-complexity-not-minimum-complexity',
    signals: SIGNALS,
    structuralSignals: STRUCTURAL_SIGNALS,
    rawTimingPath: 'raw-timing.jsonl',
    aggregatePath: 'aggregate.json',
    reportPath: 'final-report.md',
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const real = result.aggregate.real
  const synthetic = result.aggregate.synthetic
  const q2 = STRUCTURAL_SIGNALS.map((signal) => real.signals[signal].numericImprovingOccurrences).reduce((sum, value) => sum + value, 0)
  const q3MaxCoverage = Math.max(0, ...STRUCTURAL_SIGNALS.map((signal) => real.signals[signal].casesWithOccurrence))
  const q3Signals = STRUCTURAL_SIGNALS.filter((signal) => real.signals[signal].casesWithOccurrence === q3MaxCoverage)
  const q4Runs = STRUCTURAL_SIGNALS.flatMap((signal) => {
    const persistence = real.signals[signal].persistence
    return persistence.median === null ? [] : [persistence.median]
  })
  const realS0Occurrences = result.runs
    .filter((row) => row.family === 'real')
    .flatMap((row) => row.generations.filter((generation) => generation.signals.S0))
  const realS0AtOrAfterDeadline = realS0Occurrences.filter(
    (generation) => generation.elapsedMs >= M3_TRAJECTORY_SECONDS * 1_000,
  ).length
  const q5Escape = STRUCTURAL_SIGNALS.reduce((sum, signal) => sum + real.signals[signal].futureProgress.referenceSignatureLaterChanges, 0)
  const q5Occurrences = STRUCTURAL_SIGNALS.reduce((sum, signal) => sum + real.signals[signal].occurrenceCount, 0)
  const reportLines = [
    '# Structural Search M3 — diagnostic structural-stagnation census',
    '',
    `- Frozen boundary: \`${result.frozenBoundary}\``,
    `- Evidence SHA-256: \`${result.evidenceSha256}\``,
    `- Protocol: C${M3_STRUCTURAL_CEILING}, effort ${M3_EFFORT_LEVEL}, one continuing ${M3_TRAJECTORY_SECONDS}-second baseline trajectory, ${M3_REPEAT_COUNT} serial repeats.`,
    '- Search policy: frozen ordinary baseline only; M3 telemetry is shadow-only and cannot affect decisions.',
    '- M1/M2 controls and the Standard-v1 floating baseline are unchanged.',
    '- Synthetic probes: D/E/F/H at below, at, and above known generating complexity (never minimum complexity).',
    '',
    '## Required aggregate observations',
    '',
    '| Family | Signal | Cases | Repeats | Trajectories | Occurrences | Run median | Run max | First generation median | First elapsed ms median | Later reference signature changes | Later surviving novelty | Final RMSE improves | Final maxAbs improves | Additional filters delivered |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...reportFamilyRows(result.aggregate, 'real'),
    ...reportFamilyRows(result.aggregate, 'synthetic'),
    '',
    'Counts in the retrospective columns are per-occurrence observations, not trigger outcomes.',
    '',
    '## Coverage by case',
    '',
    ...result.aggregate.byCase.map(caseCoverageLine),
    '',
    '## Required conclusions',
    '',
    `1. **Why S0 failed to trigger in real M2:** ${real.signals.S0.occurrenceCount === 0
      ? 'The real completed ordinary generations never simultaneously met unresolved comparator status and no ordinary reference-quality improvement; the baseline kept making comparator-visible numeric progress or had already reached success semantics.'
      : realS0AtOrAfterDeadline === realS0Occurrences.length
        ? `M3 observed ${realS0Occurrences.length} S0 occurrence(s), but every one was emitted at or after the 30-second boundary. M2 requires its exact-stall intervention to be reached while the deadline is still live, so these completed-boundary observations were ineligible for the M2 trigger.`
        : `M3 observed ${realS0Occurrences.length} S0 occurrence(s), including ${realS0AtOrAfterDeadline} at or after the 30-second boundary; M2 additionally requires a live deadline and its own ordinary comparator checkpoint, so M3's retrospective count is not a trigger count.`}`,
    `2. **Structural stagnation while numeric quality improves:** ${q2 > 0 ? `Yes; S1–S4 co-occurred with numeric reference improvement ${q2} time(s).` : 'No such co-occurrence was observed in the real census.'}`,
    `3. **Signal with meaningful six-case coverage:** ${real.caseCount === 0 ? 'No real cases were selected.' : q3MaxCoverage === 0 ? 'No structural signal occurred across the real cases.' : `${q3Signals.join(', ')} tied for greatest real-case coverage (${q3MaxCoverage}/${real.caseCount}); coverage remains diagnostic, not a policy choice.`}`,
    `4. **Transient or persistent:** ${q4Runs.length === 0 ? 'No real structural-plateau run was observed.' : `Per-signal consecutive-run medians were ${q4Runs.join(', ')} generations (overall maximum ${Math.max(...STRUCTURAL_SIGNALS.map((signal) => real.signals[signal].persistence.max))}); events were predominantly transient and no persistence trigger is selected.`}`,
    `5. **Baseline escape after a structural plateau:** ${q5Occurrences === 0 ? 'There were no real structural-plateau occurrences to escape from.' : `${q5Escape}/${q5Occurrences} real structural-plateau occurrences were followed by a reference-signature change; quality and delivered-filter outcomes are reported above.`}`,
    `6. **Worth testing a bounded multi-step intervention:** ${result.conclusion === 'STRUCTURAL_PLATEAU_SUPPORTED'
      ? `The predeclared all-six-case boundary is met; a future design may narrowly test ${result.decisionBoundary.recommendedFutureSignal}, but this milestone implements no intervention.`
      : result.conclusion === 'INCONCLUSIVE'
        ? `Evidence is inconclusive: ${result.decisionBoundary.missingInformation.join(' ')}`
        : 'No real structural plateau coverage supports an intervention design; do not invent another trigger.'}`,
    '',
    `## Decision: **${result.conclusion}**`,
    '',
    `Predeclared boundary rule: \`${result.decisionBoundary.rule}\`. S0 is the M2 exact-stall control; structural-plateau support considers S1–S4 only.`,
    '',
    `Synthetic coverage is ${synthetic.trajectoryCount} trajectories across ${synthetic.caseCount} cases; synthetic signals validate telemetry reachability only and do not establish a real-search intervention policy.`,
  ]
  writeFileSync(resolve(outputDir, 'final-report.md'), `${reportLines.join('\n')}\n`, 'utf8')
  const summaryLines = [
    reportLines[0]!,
    reportLines[2]!,
    reportLines[3]!,
    reportLines[4]!,
    reportLines[5]!,
    reportLines[6]!,
    reportLines[7]!,
    '',
    `Decision: **${result.conclusion}** (${result.decisionBoundary.rule})`,
    `Real structural-signal coverage: ${STRUCTURAL_SIGNALS.map((signal) => `${signal} ${real.signals[signal].casesWithOccurrence}/${real.caseCount} cases`).join(', ')}.`,
    `Synthetic structural-signal coverage: ${STRUCTURAL_SIGNALS.map((signal) => `${signal} ${synthetic.signals[signal].casesWithOccurrence}/${synthetic.caseCount} cases`).join(', ')}.`,
    'See final-report.md for occurrence, persistence, first-occurrence, novelty, and retrospective quality tables.',
  ]
  writeFileSync(resolve(outputDir, 'summary.md'), `${summaryLines.join('\n')}\n`, 'utf8')
}

/** Run the fixed, diagnostic-only M3 baseline census. */
export function runStructuralSearchM3Census(options: M3RunnerOptions = {}): M3CampaignResult {
  const includeReal = options.includeReal ?? true
  const includeSynthetic = options.includeSynthetic ?? true
  const realCaseIds = options.realCaseIds ?? M3_REAL_CASES.map(({ id }) => id)
  const syntheticCaseIds = options.syntheticCaseIds ?? M3_SYNTHETIC_CASES.map(({ id }) => id)
  if (!includeReal && !includeSynthetic) throw new Error('M3 census must include a real or synthetic case')
  const prepared = preparedCases(includeReal, includeSynthetic, realCaseIds, syntheticCaseIds)
  const nowMs = options.nowMs ?? (() => performance.now())
  const runner = options.runBaseline ?? runStructuralSearch
  const runs: M3RunRecord[] = []
  for (const value of prepared) {
    for (const structuralCeiling of value.structuralCeilings) {
      const envelope = createM3ResourceEnvelope(structuralCeiling)
      for (let repeatIndex = 0; repeatIndex < M3_REPEAT_COUNT; repeatIndex += 1) {
        runs.push(runContinuingTrajectory(value, structuralCeiling, repeatIndex, envelope, runner, nowMs))
      }
    }
  }
  const aggregate = aggregateEvidence(runs)
  const decisionBoundary = chooseDecision(aggregate)
  const partial = {
    schemaVersion: M3_RUNNER_SCHEMA_VERSION,
    frozenBoundary: M3_FROZEN_BOUNDARY,
    resourceEnvelope: createM3ResourceEnvelope(M3_STRUCTURAL_CEILING),
    aggregate,
    decisionBoundary,
    conclusion: decisionBoundary.conclusion,
  }
  const result: M3CampaignResult = {
    ...partial,
    runs,
    evidenceSha256: evidenceHash(partial),
    outputDir: options.writeArtifacts === false ? undefined : options.outputDir ?? M3_DEFAULT_OUTPUT_DIR,
  }
  if (options.writeArtifacts !== false) writeArtifacts(result.outputDir!, result)
  return result
}

export function isM3CliInvocation(
  argv: readonly string[] = process.argv,
  moduleUrl: string = import.meta.url,
): boolean {
  if (argv.includes('--m3-runner')) return true
  const modulePath = resolve(fileURLToPath(moduleUrl))
  return argv.slice(1).some((argument) => {
    try {
      return resolve(argument) === modulePath
    } catch {
      return false
    }
  })
}

if (isM3CliInvocation()) {
  const result = runStructuralSearchM3Census()
  process.stdout.write(`${JSON.stringify({
    frozenBoundary: result.frozenBoundary,
    evidenceSha256: result.evidenceSha256,
    runCount: result.runs.length,
    conclusion: result.conclusion,
  }, null, 2)}\n`)
}
