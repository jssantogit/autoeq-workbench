import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  structuralViolation,
  type StructuralSearchInput,
  type StructuralSearchResult,
} from '../../src/index.js'
import type {
  CapacityPressureDelta,
  FrontierUtilizationDelta,
  ResolvedStructuralSearchConfig,
  SearchWorkTotals,
  StructuralSearchBaselineStateEvent,
  StructuralSearchM3Signal,
  StructuralSearchM3Signals,
  StructuralSearchM3TelemetryEvent,
  StructuralSearchTraceEvent,
} from '../../src/autoeq/v2/structuralSearch.js'
import {
  M3_DEFAULT_OUTPUT_DIR,
  M3_FROZEN_BOUNDARY,
  M3_REAL_CASES,
  M3_REPEAT_COUNT,
  M3_STRUCTURAL_CEILING,
  M3_EFFORT_LEVEL,
  createM3ResourceEnvelope,
  type M3RealCaseId,
  type M3ResourceEnvelope,
  type M3RunRecord,
} from './structuralSearchVnextM3.js'
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
  calculateResearchDeliveredMetrics,
  type ResearchDeliveredMetrics,
} from './deliveredMetrics.js'
import { semanticFilterKey, structuralSignature } from '../../src/autoeq/v2/structuralSearch.js'
import { resolveStandardAutoEqV2Config } from '../../src/autoeq/v2/config.js'

export const M3B_FROZEN_BOUNDARY = M3_FROZEN_BOUNDARY
export const M3B_STRUCTURAL_CEILING = M3_STRUCTURAL_CEILING
export const M3B_EFFORT_LEVEL = M3_EFFORT_LEVEL
export const M3B_TRAJECTORY_SECONDS = 30 as const
export const M3B_REPEAT_COUNT = M3_REPEAT_COUNT
export const M3B_RUNNER_SCHEMA_VERSION = 1 as const
export const M3B_DEFAULT_OUTPUT_DIR = resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
  '.research-artifacts/structural-search-m3b-telemetry-fidelity',
)

const SIGNALS: readonly StructuralSearchM3Signal[] = ['S0', 'S1', 'S2', 'S3', 'S4']
const STRUCTURAL_SIGNALS: readonly StructuralSearchM3Signal[] = ['S1', 'S2', 'S3', 'S4']
const WORK_KEYS: readonly (keyof SearchWorkTotals)[] = [
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

export type M3BMode = 'off' | 'on'
export type M3BFidelityClassification =
  | 'M3_TELEMETRY_FIDELITY_CONFIRMED'
  | 'M3_TELEMETRY_WALLCLOCK_PERTURBATION_MATERIAL'
  | 'M3_TELEMETRY_CORRECTNESS_FAILURE'
export type M3BS3Classification =
  | 'TRANSIENT_PRODUCTIVE'
  | 'POTENTIAL_STAGNATION_SIGNAL'
  | 'INCONCLUSIVE'

export interface M3BNumericSummary {
  best: number
  median: number
  worst: number
  spread: number
}

export interface M3BPersistenceSummary {
  occurrenceRunCount: number
  median: number | null
  max: number
}

export interface M3BFutureProgressSummary {
  occurrenceCount: number
  referenceSignatureLaterChanges: number
  survivingNovelStructuralSignatureLater: number
  finalRmseImprovesFurther: number
  finalMaxAbsImprovesFurther: number
  additionalFiltersUltimatelyDelivered: number
}

/** The same per-signal shape used by the frozen M3 aggregate. */
export interface M3BPerSignalSummary {
  occurrenceCount: number
  trajectoriesWithOccurrence: number
  casesWithOccurrence: number
  repeatsWithOccurrence: number
  firstOccurrenceGeneration: M3BNumericSummary | null
  firstOccurrenceElapsedMs: M3BNumericSummary | null
  persistence: M3BPersistenceSummary
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
  futureProgress: M3BFutureProgressSummary
}

export interface M3BGenerationObservation {
  generation: number
  elapsedMs?: number
  signals: StructuralSearchM3Signals
  numericReferenceImprovement: boolean
  referenceSignature: string
  newlyGeneratedStructuralSignatureSurvived: boolean
  referenceRmseDb: number
  referenceMaxAbsDb: number
  deliveredFilterCount: number
}

export interface M3BRunObservation {
  caseId: string
  repeatIndex: number
  final: {
    rmseDb: number
    maxAbsDb: number
    deliveredFilterCount: number
  }
  generations: readonly M3BGenerationObservation[]
}

export interface M3BUniqueStructuralEvent {
  caseId: string
  repeatIndex: number
  generation: number
  elapsedMs: number | null
  /** S1–S4 only; S0 remains available in rawSignals. */
  exactSignalMask: string
  rawSignals: StructuralSearchM3Signals
  anyStructuralPlateau: boolean
  numericImprovement: boolean
  referenceTopologyLaterChanged: boolean
  structuralNoveltyLaterSurvived: boolean
  rmseLaterImproved: boolean
  maxAbsLaterImproved: boolean
  finalDeliveredFilterCountIncreased: boolean
}

export interface M3BUniqueSignalCounts {
  total: number
  only: number
  combined: number
}

export interface M3BS3FutureFractions {
  referenceSignatureLaterChange: { count: number; denominator: number; fraction: number }
  survivingStructuralNoveltyLater: { count: number; denominator: number; fraction: number }
  rmseLaterImprovement: { count: number; denominator: number; fraction: number }
  maxAbsLaterImprovement: { count: number; denominator: number; fraction: number }
  additionalDeliveredFilters: { count: number; denominator: number; fraction: number }
}

export interface M3BS3Diagnostics {
  containingGenerationCount: number
  onlyGenerationCount: number
  combinedGenerationCount: number
  firstOccurrenceByCase: Record<string, {
    firstGeneration: M3BNumericSummary | null
    firstElapsedMs: M3BNumericSummary | null
  }>
  persistence: M3BPersistenceSummary
  futureProgress: M3BS3FutureFractions
}

export interface M3BUniqueStructuralAnalysis {
  completedGenerationCount: number
  uniqueStructuralEventCount: number
  events: M3BUniqueStructuralEvent[]
  exactSignalMaskCounts: Record<string, number>
  bySignal: Record<StructuralSearchM3Signal, M3BUniqueSignalCounts>
  perSignal: Record<StructuralSearchM3Signal, M3BPerSignalSummary>
  s3: M3BS3Diagnostics
}

export interface M3BGenerationRecord extends StructuralSearchM3TelemetryEvent {
  elapsedMs: number
}

export interface M3BTrajectoryRecord extends M3BRunObservation {
  schemaVersion: typeof M3B_RUNNER_SCHEMA_VERSION
  caseId: M3RealCaseId
  caseLabel: string
  family: 'real'
  split: 'development' | 'holdout'
  mode: M3BMode
  executionIndex: number
  structuralCeiling: number
  effortLevel: number
  trajectoryRunId: string
  trajectoryElapsedMs: number
  resourceEnvelope: M3ResourceEnvelope
  generations: M3BGenerationRecord[]
  filters: Filter[]
  final: M3BRunObservation['final'] & {
    structuralViolation: number
    delivered: ResearchDeliveredMetrics
  }
  work: M3BWorkDelta
}

export interface M3BWorkDelta {
  completedOrdinaryBeamGenerations: number
  generatedProposals: number
  admittedProposals: number
  polishedProposals: number
}

export interface M3BPairedDelta {
  completedOrdinaryBeamGenerations: number
  generatedProposals: number
  admittedProposals: number
  polishedProposals: number
  finalRmseDb: number
  finalMaxAbsDb: number
  deliveredFilterCount: number
  actualElapsedMs: number
}

export interface M3BPairRecord {
  caseId: M3RealCaseId
  caseLabel: string
  repeatIndex: number
  executionOrder: [M3BMode, M3BMode]
  off: M3BTrajectoryRecord
  on: M3BTrajectoryRecord
  deltaOnMinusOff: M3BPairedDelta
}

export interface M3BWallClockAggregate {
  pairCount: number
  executionOrderCounts: Record<'off-first' | 'on-first', number>
  off: M3BWorkDelta & {
    finalRmseDb: M3BNumericSummary
    finalMaxAbsDb: M3BNumericSummary
    deliveredFilterCount: M3BNumericSummary
    actualElapsedMs: M3BNumericSummary
  }
  on: M3BWorkDelta & {
    finalRmseDb: M3BNumericSummary
    finalMaxAbsDb: M3BNumericSummary
    deliveredFilterCount: M3BNumericSummary
    actualElapsedMs: M3BNumericSummary
  }
  deltaOnMinusOff: {
    completedOrdinaryBeamGenerations: M3BNumericSummary
    generatedProposals: M3BNumericSummary
    admittedProposals: M3BNumericSummary
    polishedProposals: M3BNumericSummary
    finalRmseDb: M3BNumericSummary
    finalMaxAbsDb: M3BNumericSummary
    deliveredFilterCount: M3BNumericSummary
    actualElapsedMs: M3BNumericSummary
  }
}

export interface M3BDeterministicGenerationSnapshot {
  generation: number
  reference: {
    semanticKey: string
    structuralSignature: string
    rmseDb: number
    maxAbsDb: number
  }
  retainedBeamSemanticKeys: string[]
  retainedBeamSignatures: string[]
}

export interface M3BDeterministicPass {
  result: StructuralSearchResult
  generations: M3BDeterministicGenerationSnapshot[]
  retainedBeamSignatures: string[][]
  work: SearchWorkTotals
  completedGenerations: number
  naturalStopGeneration: number | null
}

export interface M3BDeterministicFidelityEvidence {
  maxGenerations: number
  equivalent: boolean
  telemetryOff: M3BDeterministicPass
  telemetryOn: M3BDeterministicPass
  mismatch: string | null
}

export interface M3BFrozenM3Source {
  path: string
  rawPath: string
  sha256: string | null
  rawSha256: string | null
  evidenceSha256: string | null
  rawTrajectoryCount: number
  generationObservationsAvailable: boolean
}

export interface M3BCampaignResult {
  schemaVersion: typeof M3B_RUNNER_SCHEMA_VERSION
  frozenBoundary: typeof M3B_FROZEN_BOUNDARY
  resourceEnvelope: M3ResourceEnvelope
  trajectories: M3BTrajectoryRecord[]
  pairs: M3BPairRecord[]
  wallClock: M3BWallClockAggregate
  deterministicFidelity: M3BDeterministicFidelityEvidence
  frozenM3Source: M3BFrozenM3Source
  uniqueStructuralEvents: M3BUniqueStructuralAnalysis
  fidelityClassification: M3BFidelityClassification
  s3Classification: M3BS3Classification
  evidenceSha256: string
  outputDir?: string
}

interface PreparedRealCase {
  id: M3RealCaseId
  label: string
  split: 'development' | 'holdout'
  frequenciesHz: number[]
  desiredDb: number[]
  sampleRateHz: number
}

interface CapturedTrace {
  event: StructuralSearchTraceEvent
}

const cloneFilters = (filters: readonly Filter[]): Filter[] => filters.map((filter) => ({ ...filter }))
const clonePressure = (value: CapacityPressureDelta): CapacityPressureDelta => ({ ...value })
const cloneFrontier = (value: FrontierUtilizationDelta): FrontierUtilizationDelta => ({ ...value })

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

function numericSummary(values: readonly number[]): M3BNumericSummary | null {
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

function emptyPerSignalSummary(): M3BPerSignalSummary {
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

function signalMask(signals: StructuralSearchM3Signals): string {
  return STRUCTURAL_SIGNALS.filter((signal) => signals[signal]).join('+') || 'none'
}

function fraction(count: number, denominator: number): { count: number; denominator: number; fraction: number } {
  return { count, denominator, fraction: denominator === 0 ? 0 : count / denominator }
}

function addPerSignalSummary(
  rows: readonly M3BRunObservation[],
  signal: StructuralSearchM3Signal,
): M3BPerSignalSummary {
  const summary = emptyPerSignalSummary()
  const runsWithOccurrence = rows.filter((row) => row.generations.some((generation) => generation.signals[signal]))
  const cases = new Set(runsWithOccurrence.map((row) => row.caseId))
  const repeats = new Set(runsWithOccurrence.map((row) => `${row.caseId}|${row.repeatIndex}`))
  const firstGenerations: number[] = []
  const firstElapsed: number[] = []
  const persistenceRuns: number[] = []

  for (const row of rows) {
    const generations = row.generations
    const first = generations.find((generation) => generation.signals[signal])
    if (first !== undefined) {
      firstGenerations.push(first.generation)
      if (first.elapsedMs !== undefined) firstElapsed.push(first.elapsedMs)
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
  summary.casesWithOccurrence = cases.size
  summary.repeatsWithOccurrence = repeats.size
  summary.firstOccurrenceGeneration = numericSummary(firstGenerations)
  summary.firstOccurrenceElapsedMs = numericSummary(firstElapsed)
  summary.persistence = {
    occurrenceRunCount: persistenceRuns.length,
    median: numericSummary(persistenceRuns)?.median ?? null,
    max: Math.max(0, ...persistenceRuns),
  }
  return summary
}

function uniqueStructuralAnalysis(rows: readonly M3BRunObservation[]): M3BUniqueStructuralAnalysis {
  const events: M3BUniqueStructuralEvent[] = []
  const exactSignalMaskCounts: Record<string, number> = {}
  const bySignal = {} as Record<StructuralSearchM3Signal, M3BUniqueSignalCounts>
  for (const signal of SIGNALS) bySignal[signal] = { total: 0, only: 0, combined: 0 }
  let completedGenerationCount = 0

  for (const row of rows) {
    completedGenerationCount += row.generations.length
    for (let generationIndex = 0; generationIndex < row.generations.length; generationIndex += 1) {
      const occurrence = row.generations[generationIndex]!
      const anyStructuralPlateau = STRUCTURAL_SIGNALS.some((signal) => occurrence.signals[signal])
      if (!anyStructuralPlateau) continue
      const later = row.generations.slice(generationIndex + 1)
      const exactMask = signalMask(occurrence.signals)
      const event: M3BUniqueStructuralEvent = {
        caseId: row.caseId,
        repeatIndex: row.repeatIndex,
        generation: occurrence.generation,
        elapsedMs: occurrence.elapsedMs ?? null,
        exactSignalMask: exactMask,
        rawSignals: { ...occurrence.signals },
        anyStructuralPlateau,
        numericImprovement: occurrence.numericReferenceImprovement,
        referenceTopologyLaterChanged: later.some((candidate) => candidate.referenceSignature !== occurrence.referenceSignature),
        structuralNoveltyLaterSurvived: later.some((candidate) => candidate.newlyGeneratedStructuralSignatureSurvived),
        rmseLaterImproved: row.final.rmseDb < occurrence.referenceRmseDb,
        maxAbsLaterImproved: row.final.maxAbsDb < occurrence.referenceMaxAbsDb,
        finalDeliveredFilterCountIncreased: row.final.deliveredFilterCount > occurrence.deliveredFilterCount,
      }
      events.push(event)
      exactSignalMaskCounts[exactMask] = (exactSignalMaskCounts[exactMask] ?? 0) + 1
      for (const signal of STRUCTURAL_SIGNALS) if (occurrence.signals[signal]) {
        bySignal[signal]!.total += 1
        if (exactMask === signal) bySignal[signal]!.only += 1
        else bySignal[signal]!.combined += 1
      }
    }
  }

  const perSignal = {} as Record<StructuralSearchM3Signal, M3BPerSignalSummary>
  for (const signal of SIGNALS) perSignal[signal] = addPerSignalSummary(rows, signal)

  const s3Runs = rows.filter((row) => row.generations.some((generation) => generation.signals.S3))
  const firstOccurrenceByCase: M3BS3Diagnostics['firstOccurrenceByCase'] = {}
  for (const caseId of new Set(s3Runs.map((row) => row.caseId))) {
    const firstGenerations: number[] = []
    const firstElapsed: number[] = []
    for (const row of s3Runs.filter((candidate) => candidate.caseId === caseId)) {
      const first = row.generations.find((generation) => generation.signals.S3)
      if (first === undefined) continue
      firstGenerations.push(first.generation)
      if (first.elapsedMs !== undefined) firstElapsed.push(first.elapsedMs)
    }
    firstOccurrenceByCase[caseId] = {
      firstGeneration: numericSummary(firstGenerations),
      firstElapsedMs: numericSummary(firstElapsed),
    }
  }
  const s3 = perSignal.S3
  const s3Events = events.filter((event) => event.rawSignals.S3)
  const s3PersistenceRuns: number[] = []
  for (const row of rows) {
    let index = 0
    while (index < row.generations.length) {
      if (!row.generations[index]!.signals.S3) {
        index += 1
        continue
      }
      const start = index
      while (index + 1 < row.generations.length && row.generations[index + 1]!.signals.S3) index += 1
      s3PersistenceRuns.push(index - start + 1)
      index += 1
    }
  }
  const denominator = s3Events.length
  const s3Diagnostics: M3BS3Diagnostics = {
    containingGenerationCount: denominator,
    onlyGenerationCount: s3Events.filter((event) => event.exactSignalMask === 'S3').length,
    combinedGenerationCount: s3Events.filter((event) => event.exactSignalMask !== 'S3').length,
    firstOccurrenceByCase,
    persistence: {
      occurrenceRunCount: s3PersistenceRuns.length,
      median: numericSummary(s3PersistenceRuns)?.median ?? null,
      max: Math.max(0, ...s3PersistenceRuns),
    },
    futureProgress: {
      referenceSignatureLaterChange: fraction(s3.structuralNoveltyAfterOccurrence.referenceSignatureLaterChanges, denominator),
      survivingStructuralNoveltyLater: fraction(s3.structuralNoveltyAfterOccurrence.survivingNovelStructuralSignatureLater, denominator),
      rmseLaterImprovement: fraction(s3.subsequentBaselineQualityProgress.finalRmseImprovesFurther, denominator),
      maxAbsLaterImprovement: fraction(s3.subsequentBaselineQualityProgress.finalMaxAbsImprovesFurther, denominator),
      additionalDeliveredFilters: fraction(s3.subsequentBaselineQualityProgress.additionalFiltersUltimatelyDelivered, denominator),
    },
  }
  return {
    completedGenerationCount,
    uniqueStructuralEventCount: events.length,
    events,
    exactSignalMaskCounts,
    bySignal,
    perSignal,
    s3: s3Diagnostics,
  }
}

function preparedRealCases(caseIds: readonly M3RealCaseId[]): PreparedRealCase[] {
  const definitions = new Map(M3_REAL_CASES.map((definition) => [definition.id, definition]))
  return caseIds.map((id) => {
    const definition = definitions.get(id)
    if (definition === undefined) throw new Error(`Unknown M3b real case: ${id}`)
    const desired = id === 'titan-to-rsv' || id === 'titan-to-mystic-8' || id === 'titan-to-s12-ultra'
      ? prepareManualRegressionDesired(id)
      : prepareResearchDesired(id)
    return {
      id,
      label: definition.label,
      split: definition.split,
      frequenciesHz: [...desired.frequenciesHz],
      desiredDb: [...desired.desiredDb],
      sampleRateHz: 48_000,
    }
  })
}

function trajectoryRunId(caseId: M3RealCaseId, mode: M3BMode, repeatIndex: number): string {
  return `${mode}|${caseId}|${M3B_STRUCTURAL_CEILING}|${repeatIndex}`
}

function workFromTraces(traces: readonly CapturedTrace[]): M3BWorkDelta {
  const generations = traces.filter(({ event }) => event.type === 'beam-generation')
  return {
    completedOrdinaryBeamGenerations: generations.length,
    generatedProposals: generations.reduce((sum, { event }) => sum + (event.generatedProposals ?? 0), 0),
    admittedProposals: generations.reduce((sum, { event }) => sum + (event.admittedProposals ?? 0), 0),
    polishedProposals: generations.reduce((sum, { event }) => sum + (event.polishedProposals ?? 0), 0),
  }
}

function runTrajectory(
  value: PreparedRealCase,
  repeatIndex: number,
  mode: M3BMode,
  executionIndex: number,
  envelope: M3ResourceEnvelope,
  runner: (input: StructuralSearchInput) => StructuralSearchResult,
  nowMs: () => number,
): M3BTrajectoryRecord {
  const traces: CapturedTrace[] = []
  const generations: M3BGenerationRecord[] = []
  const startedAtMs = nowMs()
  const deadlineAtMs = startedAtMs + M3B_TRAJECTORY_SECONDS * 1_000
  const input: StructuralSearchInput = {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequenciesHz],
    sampleRateHz: value.sampleRateHz,
    config: { ...envelope.config },
    seedFilters: [],
    deadline: { isExpired: () => nowMs() >= deadlineAtMs },
    onTrace: (event) => traces.push({ event: { ...event } }),
    ...(mode === 'on' ? {
      onBaselineTelemetry: (event: StructuralSearchM3TelemetryEvent) => {
        generations.push({
          ...cloneGeneration(event),
          elapsedMs: Math.max(0, nowMs() - startedAtMs),
        })
      },
    } : {}),
  }
  const result = runner(input)
  const trajectoryElapsedMs = Math.max(0, nowMs() - startedAtMs)
  const delivered = calculateResearchDeliveredMetrics(
    result.filters,
    value.desiredDb,
    value.frequenciesHz,
    value.sampleRateHz,
  )
  const work = workFromTraces(traces)
  return {
    schemaVersion: M3B_RUNNER_SCHEMA_VERSION,
    caseId: value.id,
    caseLabel: value.label,
    family: 'real',
    split: value.split,
    mode,
    repeatIndex,
    executionIndex,
    structuralCeiling: M3B_STRUCTURAL_CEILING,
    effortLevel: M3B_EFFORT_LEVEL,
    trajectoryRunId: trajectoryRunId(value.id, mode, repeatIndex),
    trajectoryElapsedMs,
    resourceEnvelope: { ...envelope, config: { ...envelope.config } },
    generations,
    final: {
      rmseDb: result.rmseDb,
      maxAbsDb: result.maxAbsDb,
      deliveredFilterCount: result.filters.length,
      structuralViolation: structuralViolation(result),
      delivered,
    },
    filters: cloneFilters(result.filters),
    work,
  } as M3BTrajectoryRecord
}

function pairDelta(off: M3BTrajectoryRecord, on: M3BTrajectoryRecord): M3BPairedDelta {
  return {
    completedOrdinaryBeamGenerations: on.work.completedOrdinaryBeamGenerations - off.work.completedOrdinaryBeamGenerations,
    generatedProposals: on.work.generatedProposals - off.work.generatedProposals,
    admittedProposals: on.work.admittedProposals - off.work.admittedProposals,
    polishedProposals: on.work.polishedProposals - off.work.polishedProposals,
    finalRmseDb: on.final.rmseDb - off.final.rmseDb,
    finalMaxAbsDb: on.final.maxAbsDb - off.final.maxAbsDb,
    deliveredFilterCount: on.final.deliveredFilterCount - off.final.deliveredFilterCount,
    actualElapsedMs: on.trajectoryElapsedMs - off.trajectoryElapsedMs,
  }
}

function aggregateWallClock(pairs: readonly M3BPairRecord[]): M3BWallClockAggregate {
  const modes = (mode: M3BMode): readonly M3BTrajectoryRecord[] => pairs.map((pair) => pair[mode])
  const summarizeMode = (mode: M3BMode): M3BWallClockAggregate['off'] => {
    const rows = modes(mode)
    return {
      completedOrdinaryBeamGenerations: rows.reduce((sum, row) => sum + row.work.completedOrdinaryBeamGenerations, 0),
      generatedProposals: rows.reduce((sum, row) => sum + row.work.generatedProposals, 0),
      admittedProposals: rows.reduce((sum, row) => sum + row.work.admittedProposals, 0),
      polishedProposals: rows.reduce((sum, row) => sum + row.work.polishedProposals, 0),
      finalRmseDb: numericSummary(rows.map((row) => row.final.rmseDb))!,
      finalMaxAbsDb: numericSummary(rows.map((row) => row.final.maxAbsDb))!,
      deliveredFilterCount: numericSummary(rows.map((row) => row.final.deliveredFilterCount))!,
      actualElapsedMs: numericSummary(rows.map((row) => row.trajectoryElapsedMs))!,
    }
  }
  const deltas = pairs.map((pair) => pair.deltaOnMinusOff)
  const summary = (key: keyof M3BPairedDelta): M3BNumericSummary => numericSummary(deltas.map((delta) => delta[key]))!
  return {
    pairCount: pairs.length,
    executionOrderCounts: {
      'off-first': pairs.filter((pair) => pair.executionOrder[0] === 'off').length,
      'on-first': pairs.filter((pair) => pair.executionOrder[0] === 'on').length,
    },
    off: summarizeMode('off'),
    on: summarizeMode('on'),
    deltaOnMinusOff: {
      completedOrdinaryBeamGenerations: summary('completedOrdinaryBeamGenerations'),
      generatedProposals: summary('generatedProposals'),
      admittedProposals: summary('admittedProposals'),
      polishedProposals: summary('polishedProposals'),
      finalRmseDb: summary('finalRmseDb'),
      finalMaxAbsDb: summary('finalMaxAbsDb'),
      deliveredFilterCount: summary('deliveredFilterCount'),
      actualElapsedMs: summary('actualElapsedMs'),
    },
  }
}

function cloneWork(work: SearchWorkTotals): SearchWorkTotals {
  return { ...work }
}

function addWorkFromTrace(total: SearchWorkTotals, event: StructuralSearchTraceEvent): void {
  if (event.type !== 'beam-generation') return
  total.beamGenerations += 1
  total.proposalsGenerated += event.generatedProposals ?? 0
  total.proposalsAdmitted += event.admittedProposals ?? 0
  total.proposalsPolished += event.polishedProposals ?? 0
  total.duplicateStates += event.duplicateStates ?? 0
}

function snapshotState(
  event: StructuralSearchBaselineStateEvent,
  bounds: ReturnType<typeof resolveStandardAutoEqV2Config>,
  regionCount: number,
): M3BDeterministicGenerationSnapshot {
  return {
    generation: event.generation,
    reference: {
      semanticKey: semanticFilterKey(event.reference.filters),
      structuralSignature: structuralSignature(event.reference.filters, bounds, regionCount),
      rmseDb: event.reference.rmseDb,
      maxAbsDb: event.reference.maxAbsDb,
    },
    retainedBeamSemanticKeys: event.retainedBeam.map((state) => semanticFilterKey(state.filters)).sort(),
    retainedBeamSignatures: event.retainedBeam
      .map((state) => structuralSignature(state.filters, bounds, regionCount))
      .sort(),
  }
}

function deterministicPass(
  telemetryEnabled: boolean,
  maxGenerations: number,
  config: ResolvedStructuralSearchConfig,
): M3BDeterministicPass {
  const frequencies = [40, 100, 250, 630, 1_600, 10_000]
  const desiredDb = [4, -4, 4, -4, 4, -4]
  const bounds = resolveStandardAutoEqV2Config({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: config.maxFilters })
  const regionCount = Math.max(1, config.featureRegionCount ?? 1)
  const generations: M3BDeterministicGenerationSnapshot[] = []
  const traces: StructuralSearchTraceEvent[] = []
  const work = {
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
  } satisfies SearchWorkTotals
  let imposedBoundaryReached = false
  let naturalStopGeneration: number | null = null
  const result = runStructuralSearch({
    desiredDb,
    frequencies,
    sampleRateHz: 48_000,
    config,
    deadline: { isExpired: () => imposedBoundaryReached },
    seedFilters: [],
    onTrace: (event) => {
      traces.push(event)
      addWorkFromTrace(work, event)
      if (event.type === 'beam-generation' && event.generation !== undefined && event.generation >= maxGenerations - 1) {
        imposedBoundaryReached = true
      }
      if (event.type === 'beam-stop' && event.reason === 'no-next-states') naturalStopGeneration = event.generation ?? null
    },
    onBaselineState: (event) => generations.push(snapshotState(event, bounds, regionCount)),
    ...(telemetryEnabled ? { onBaselineTelemetry: () => undefined } : {}),
  })
  // `traces` is retained as an explicit proof input: work is generated only
  // from completed beam-generation trace events, never from telemetry.
  void traces
  return {
    result,
    generations,
    retainedBeamSignatures: generations.map((generation) => [...generation.retainedBeamSignatures]),
    work: cloneWork(work),
    completedGenerations: generations.length,
    naturalStopGeneration,
  }
}

function firstMismatch(left: M3BDeterministicPass, right: M3BDeterministicPass): string | null {
  if (left.completedGenerations !== right.completedGenerations) return 'completed generation count'
  if (JSON.stringify(left.generations) !== JSON.stringify(right.generations)) return 'generation semantic states/signatures'
  if (JSON.stringify(left.work) !== JSON.stringify(right.work)) return 'ordinary work counters'
  if (JSON.stringify(left.result) !== JSON.stringify(right.result)) return 'final result'
  if (left.naturalStopGeneration !== right.naturalStopGeneration) return 'natural stop generation'
  return null
}

export function runM3bDeterministicTelemetryFidelity(options: {
  maxGenerations?: number
  config?: ResolvedStructuralSearchConfig
} = {}): M3BDeterministicFidelityEvidence {
  const maxGenerations = options.maxGenerations ?? 4
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations <= 0) {
    throw new Error('M3b deterministic generation boundary must be a positive integer')
  }
  const config = options.config ?? resolveStructuralSearchConfig({ preset: 'max10-baseline' })
  const telemetryOff = deterministicPass(false, maxGenerations, config)
  const telemetryOn = deterministicPass(true, maxGenerations, config)
  const mismatch = firstMismatch(telemetryOff, telemetryOn)
  return {
    maxGenerations,
    equivalent: mismatch === null,
    telemetryOff,
    telemetryOn,
    mismatch,
  }
}

function loadFrozenM3Source(): { source: M3BFrozenM3Source; rows: M3BRunObservation[] } {
  const aggregatePath = resolve(M3_DEFAULT_OUTPUT_DIR, 'aggregate.json')
  const rawPath = resolve(M3_DEFAULT_OUTPUT_DIR, 'raw-timing.jsonl')
  let sha256: string | null = null
  let rawSha256: string | null = null
  let evidenceSha256: string | null = null
  if (existsSync(aggregatePath)) {
    const bytes = readFileSync(aggregatePath)
    sha256 = createHash('sha256').update(bytes).digest('hex')
    try {
      const value = JSON.parse(bytes.toString('utf8')) as { evidenceSha256?: unknown }
      if (typeof value.evidenceSha256 === 'string') evidenceSha256 = value.evidenceSha256
    } catch {
      // A malformed frozen artifact is reported as unavailable, never treated as evidence.
      sha256 = null
    }
  }
  const rows: M3BRunObservation[] = []
  if (existsSync(rawPath)) {
    try {
      const raw = readFileSync(rawPath)
      rawSha256 = createHash('sha256').update(raw).digest('hex')
      for (const line of raw.toString('utf8').split('\n')) {
        if (line.trim() === '') continue
        const value = JSON.parse(line) as M3RunRecord
        if (value.family !== 'real') continue
        rows.push(value)
      }
    } catch {
      rows.length = 0
      rawSha256 = null
    }
  }
  return {
    source: {
      path: '.research-artifacts/structural-search-m3-stagnation-census/aggregate.json',
      rawPath: '.research-artifacts/structural-search-m3-stagnation-census/raw-timing.jsonl',
      sha256,
      rawSha256,
      evidenceSha256,
      rawTrajectoryCount: rows.length,
      generationObservationsAvailable: rows.length > 0,
    },
    rows,
  }
}

interface ExistingWallClockMeasurement {
  trajectories: M3BTrajectoryRecord[]
  pairs: M3BPairRecord[]
}

/** Rehydrate a completed paired campaign without running another search. */
function loadExistingWallClockMeasurement(): ExistingWallClockMeasurement | null {
  const rawPath = resolve(M3B_DEFAULT_OUTPUT_DIR, 'raw-timing.jsonl')
  if (!existsSync(rawPath)) return null
  try {
    const trajectories = readFileSync(rawPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as M3BTrajectoryRecord)
      .filter((trajectory) => trajectory.family === 'real')
    const groups = new Map<string, M3BTrajectoryRecord[]>()
    for (const trajectory of trajectories) {
      const key = `${trajectory.caseId}|${trajectory.repeatIndex}`
      groups.set(key, [...(groups.get(key) ?? []), trajectory])
    }
    const pairs: M3BPairRecord[] = []
    for (const rows of groups.values()) {
      if (rows.length !== 2) return null
      const off = rows.find((row) => row.mode === 'off')
      const on = rows.find((row) => row.mode === 'on')
      if (off === undefined || on === undefined) return null
      const executionOrder: [M3BMode, M3BMode] = off.executionIndex < on.executionIndex
        ? ['off', 'on']
        : ['on', 'off']
      pairs.push({
        caseId: off.caseId,
        caseLabel: off.caseLabel,
        repeatIndex: off.repeatIndex,
        executionOrder,
        off,
        on,
        deltaOnMinusOff: pairDelta(off, on),
      })
    }
    pairs.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.repeatIndex - right.repeatIndex)
    return { trajectories, pairs }
  } catch {
    return null
  }
}

function classifyFidelity(
  evidence: M3BDeterministicFidelityEvidence,
  pairs: readonly M3BPairRecord[],
): M3BFidelityClassification {
  if (!evidence.equivalent) return 'M3_TELEMETRY_CORRECTNESS_FAILURE'
  const workPathChanged = pairs.some((pair) =>
    pair.deltaOnMinusOff.completedOrdinaryBeamGenerations !== 0 ||
    pair.deltaOnMinusOff.generatedProposals !== 0 ||
    pair.deltaOnMinusOff.admittedProposals !== 0 ||
    pair.deltaOnMinusOff.polishedProposals !== 0,
  )
  return workPathChanged
    ? 'M3_TELEMETRY_WALLCLOCK_PERTURBATION_MATERIAL'
    : 'M3_TELEMETRY_FIDELITY_CONFIRMED'
}

function classifyS3(analysis: M3BUniqueStructuralAnalysis): M3BS3Classification {
  const total = analysis.s3.containingGenerationCount
  if (total === 0) return 'INCONCLUSIVE'
  const future = analysis.s3.futureProgress
  const allProductive = [
    future.referenceSignatureLaterChange,
    future.survivingStructuralNoveltyLater,
    future.rmseLaterImprovement,
    future.maxAbsLaterImprovement,
    future.additionalDeliveredFilters,
  ].every((value) => value.count === total)
  if (analysis.s3.persistence.max <= 1 && allProductive) return 'TRANSIENT_PRODUCTIVE'
  const noProductiveOutcome = [
    future.referenceSignatureLaterChange,
    future.survivingStructuralNoveltyLater,
    future.rmseLaterImprovement,
    future.maxAbsLaterImprovement,
    future.additionalDeliveredFilters,
  ].every((value) => value.count === 0)
  if (noProductiveOutcome && analysis.s3.persistence.max > 1) return 'POTENTIAL_STAGNATION_SIGNAL'
  return 'INCONCLUSIVE'
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

function corpusHashes(): Record<string, unknown> {
  return {
    ...RESEARCH_CORPUS_SHA256,
    ...MANUAL_REGRESSION_FIXTURE_SHA256,
  }
}

function writeArtifacts(outputDir: string, result: M3BCampaignResult): void {
  mkdirSync(outputDir, { recursive: true })
  const rawPath = resolve(outputDir, 'raw-timing.jsonl')
  writeFileSync(rawPath, '', 'utf8')
  for (const trajectory of result.trajectories) appendFileSync(rawPath, `${JSON.stringify(trajectory)}\n`, 'utf8')

  const aggregate = {
    schemaVersion: result.schemaVersion,
    frozenBoundary: result.frozenBoundary,
    resourceEnvelope: result.resourceEnvelope,
    frozenM3Source: result.frozenM3Source,
    wallClock: result.wallClock,
    deterministicFidelity: result.deterministicFidelity,
    uniqueStructuralEvents: result.uniqueStructuralEvents,
    fidelityClassification: result.fidelityClassification,
    s3Classification: result.s3Classification,
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')

  const manifest = {
    schemaVersion: result.schemaVersion,
    frozenBoundary: result.frozenBoundary,
    sourceBoundary: 'M3 aggregate is read-only; M3b does not modify M1/M2/M3 evidence.',
    protocol: {
      cases: M3_REAL_CASES.map(({ id }) => id),
      trajectorySeconds: M3B_TRAJECTORY_SECONDS,
      repeatCount: M3B_REPEAT_COUNT,
      modes: ['off', 'on'],
      executionOrder: 'alternating by case and repeat index',
      syntheticMatrix: 'not rerun',
    },
    resourceEnvelope: {
      structuralCeiling: M3B_STRUCTURAL_CEILING,
      effortLevel: M3B_EFFORT_LEVEL,
      semantics: 'C43/e6 frozen baseline, one continuing trajectory per case/mode/repeat',
    },
    corpusHashes: corpusHashes(),
    frozenM3Source: result.frozenM3Source,
    rawTimingPath: 'raw-timing.jsonl',
    aggregatePath: 'aggregate.json',
    reportPath: 'final-report.md',
    evidenceSha256: result.evidenceSha256,
  }
  writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const realSignals = result.uniqueStructuralEvents.perSignal
  const s3 = result.uniqueStructuralEvents.s3
  const wallClockRows: Array<{
    label: string
    off: M3BNumericSummary
    on: M3BNumericSummary
    delta: M3BNumericSummary
  }> = [
    { label: 'completed ordinary beam generations', off: numericSummary(result.pairs.map((pair) => pair.off.work.completedOrdinaryBeamGenerations))!, on: numericSummary(result.pairs.map((pair) => pair.on.work.completedOrdinaryBeamGenerations))!, delta: result.wallClock.deltaOnMinusOff.completedOrdinaryBeamGenerations },
    { label: 'generated proposals', off: numericSummary(result.pairs.map((pair) => pair.off.work.generatedProposals))!, on: numericSummary(result.pairs.map((pair) => pair.on.work.generatedProposals))!, delta: result.wallClock.deltaOnMinusOff.generatedProposals },
    { label: 'admitted proposals', off: numericSummary(result.pairs.map((pair) => pair.off.work.admittedProposals))!, on: numericSummary(result.pairs.map((pair) => pair.on.work.admittedProposals))!, delta: result.wallClock.deltaOnMinusOff.admittedProposals },
    { label: 'polished proposals', off: numericSummary(result.pairs.map((pair) => pair.off.work.polishedProposals))!, on: numericSummary(result.pairs.map((pair) => pair.on.work.polishedProposals))!, delta: result.wallClock.deltaOnMinusOff.polishedProposals },
    { label: 'final RMSE', off: result.wallClock.off.finalRmseDb, on: result.wallClock.on.finalRmseDb, delta: result.wallClock.deltaOnMinusOff.finalRmseDb },
    { label: 'final maxAbs', off: result.wallClock.off.finalMaxAbsDb, on: result.wallClock.on.finalMaxAbsDb, delta: result.wallClock.deltaOnMinusOff.finalMaxAbsDb },
    { label: 'delivered filters', off: result.wallClock.off.deliveredFilterCount, on: result.wallClock.on.deliveredFilterCount, delta: result.wallClock.deltaOnMinusOff.deliveredFilterCount },
    { label: 'actual elapsed ms', off: result.wallClock.off.actualElapsedMs, on: result.wallClock.on.actualElapsedMs, delta: result.wallClock.deltaOnMinusOff.actualElapsedMs },
  ]
  const reportLines = [
    '# Structural Search M3b — telemetry fidelity and unique-event closeout',
    '',
    `- Frozen boundary: \`${result.frozenBoundary}\``,
    `- Evidence SHA-256: \`${result.evidenceSha256}\``,
    `- Protocol: six real cases, C${M3B_STRUCTURAL_CEILING}, effort ${M3B_EFFORT_LEVEL}, ${M3B_TRAJECTORY_SECONDS}-second OFF/ON paired trajectories, ${M3B_REPEAT_COUNT} repeats.`,
    '- Search policy: frozen ordinary baseline only; M3/M3b observers cannot affect decisions.',
    '- Synthetic D/E/F/H matrix was not rerun. M1, M2, M3, scheduler/resource policy, and Standard-v1 remain frozen.',
    '',
    '## Frozen M3 source and denominator clarification',
    '',
    `- M3 aggregate source: \`${result.frozenM3Source.path}\` (SHA-256 ${result.frozenM3Source.sha256 ?? 'UNAVAILABLE'}; evidence ${result.frozenM3Source.evidenceSha256 ?? 'UNAVAILABLE'}).`,
    `- M3 generation source: \`${result.frozenM3Source.rawPath}\` (SHA-256 ${result.frozenM3Source.rawSha256 ?? 'UNAVAILABLE'}; ${result.frozenM3Source.rawTrajectoryCount} frozen real trajectories parsed).`,
    `- Generation-level source for this closeout: ${result.frozenM3Source.generationObservationsAvailable ? 'the frozen M3 raw real trajectories' : 'UNAVAILABLE; no paired M3b fallback is used'}.`,
    '- Existing M3 per-signal values are not rewritten. Per-signal S1–S4 totals are overlapping observations, not independent-event denominators.',
    '- The unique-event table counts each generation with any S1–S4 signal exactly once by exact signal mask; non-plateau generations remain in the completed-generation denominator.',
    '',
    '## Deterministic telemetry-fidelity proof',
    '',
    `- Imposed boundary: ${result.deterministicFidelity.maxGenerations} completed generation opportunities (no wall-clock expiration).`,
    `- Equivalent: **${result.deterministicFidelity.equivalent ? 'yes' : 'no'}**${result.deterministicFidelity.mismatch === null ? '' : ` (first mismatch: ${result.deterministicFidelity.mismatch})`}.`,
    `- OFF/ON completed generations: ${result.deterministicFidelity.telemetryOff.completedGenerations}/${result.deterministicFidelity.telemetryOn.completedGenerations}.`,
    `- OFF/ON final results identical: ${JSON.stringify(result.deterministicFidelity.telemetryOff.result) === JSON.stringify(result.deterministicFidelity.telemetryOn.result) ? 'yes' : 'no'}.`,
    `- OFF/ON retained semantic states/signatures identical: ${JSON.stringify(result.deterministicFidelity.telemetryOff.generations) === JSON.stringify(result.deterministicFidelity.telemetryOn.generations) ? 'yes' : 'no'}.`,
    '',
    '## Wall-clock paired measurement',
    '',
    '| Metric | OFF median | ON median | ON−OFF median | ON−OFF spread |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...wallClockRows.map(({ label, off, on, delta }) => `| ${label} | ${off.median} | ${on.median} | ${delta.median} | ${delta.spread} |`),
    `- Execution order: ${result.wallClock.executionOrderCounts['off-first']} OFF-first pairs and ${result.wallClock.executionOrderCounts['on-first']} ON-first pairs. No artificial floating pass threshold is applied; quality deltas are descriptive.`,
    `- Wall-clock question: ${result.fidelityClassification === 'M3_TELEMETRY_WALLCLOCK_PERTURBATION_MATERIAL' ? 'yes, the paired campaign observed ordinary-work path differences inside the same 30-second envelope; the magnitude and direction vary by pair.' : 'no material ordinary-work path difference was observed in the paired campaign.'}`,
    '',
    '## Unique real-generation structural events',
    '',
    `- Completed generations: ${result.uniqueStructuralEvents.completedGenerationCount}; unique S1–S4 event generations: ${result.uniqueStructuralEvents.uniqueStructuralEventCount}.`,
    `- Exact masks: ${Object.entries(result.uniqueStructuralEvents.exactSignalMaskCounts).map(([mask, count]) => `${mask}=${count}`).join(', ') || 'none'}.`,
    '| Signal | Occurrences | Cases | Repeats | First generation median | First elapsed median ms | Run median/max | Later topology change | Later novelty | Later RMSE | Later maxAbs | Later delivered filters | Numeric-improving |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...SIGNALS.map((signal) => {
      const row = realSignals[signal]
      return `| ${signal} | ${row.occurrenceCount} | ${row.casesWithOccurrence} | ${row.repeatsWithOccurrence} | ${row.firstOccurrenceGeneration?.median ?? '—'} | ${row.firstOccurrenceElapsedMs?.median?.toFixed(1) ?? '—'} | ${row.persistence.median ?? '—'}/${row.persistence.max} | ${row.structuralNoveltyAfterOccurrence.referenceSignatureLaterChanges} | ${row.structuralNoveltyAfterOccurrence.survivingNovelStructuralSignatureLater} | ${row.subsequentBaselineQualityProgress.finalRmseImprovesFurther} | ${row.subsequentBaselineQualityProgress.finalMaxAbsImprovesFurther} | ${row.subsequentBaselineQualityProgress.additionalFiltersUltimatelyDelivered} | ${row.numericImprovingOccurrences} |`
    }),
    '- S0 remains the M2 exact-stall control; its wall-clock observations cluster at the completed 30-second boundary and are not converted into a new trigger result.',
    '',
    '### S3-specific diagnostic',
    '',
    `- S3-containing unique generations: ${s3.containingGenerationCount}; S3-only: ${s3.onlyGenerationCount}; S3 combined with S1/S2/S4: ${s3.combinedGenerationCount}.`,
    `- S3 persistence runs: ${s3.persistence.occurrenceRunCount}; median ${s3.persistence.median ?? '—'}; max ${s3.persistence.max}.`,
    ...Object.entries(s3.firstOccurrenceByCase).map(([caseId, value]) => `- ${caseId}: first S3 generation median ${value.firstGeneration?.median ?? '—'}, elapsed median ${value.firstElapsedMs?.median?.toFixed(1) ?? '—'} ms.`),
    `- Future progress fractions (denominator = ${s3.containingGenerationCount} S3-containing generations): reference topology ${s3.futureProgress.referenceSignatureLaterChange.count}/${s3.futureProgress.referenceSignatureLaterChange.denominator}; surviving novelty ${s3.futureProgress.survivingStructuralNoveltyLater.count}/${s3.futureProgress.survivingStructuralNoveltyLater.denominator}; RMSE ${s3.futureProgress.rmseLaterImprovement.count}/${s3.futureProgress.rmseLaterImprovement.denominator}; maxAbs ${s3.futureProgress.maxAbsLaterImprovement.count}/${s3.futureProgress.maxAbsLaterImprovement.denominator}; delivered filters ${s3.futureProgress.additionalDeliveredFilters.count}/${s3.futureProgress.additionalDeliveredFilters.denominator}.`,
    `- S3 question: the observed S3-only and combined populations do not form a separable predeclared stagnation subset; retrospective progress is mixed, so the classification remains ${result.s3Classification}.`,
    '',
    '## Required interpretation boundary',
    '',
    `1. **M3 telemetry fidelity:** \`${result.fidelityClassification}\`. Deterministic logical equivalence is required; wall-clock work-path differences are reported descriptively and do not authorize a policy change.`,
    `2. **S3 classification:** \`${result.s3Classification}\`. S3-only versus combined masks and all retrospective outcomes are shown above; no epsilon, fitted subset, or trigger is introduced.`,
    '3. **Policy boundary:** M3b implements no search behavior, candidate, admission, beam, comparator, polish, scheduler, resource, quantization, or challenger change.',
    '',
    'Raw timing/generation traces are local research data and are intentionally not part of the committed aggregate evidence.',
  ]
  writeFileSync(resolve(outputDir, 'final-report.md'), `${reportLines.join('\n')}\n`, 'utf8')
  writeFileSync(resolve(outputDir, 'summary.md'), `${reportLines[0]}\n${reportLines[1]}\n${reportLines[2]}\n${reportLines[3]}\n${reportLines[4]}\n${reportLines[5]}\n\nFidelity: ${result.fidelityClassification}\nS3: ${result.s3Classification}\n`, 'utf8')
}

export interface M3BRunnerOptions {
  realCaseIds?: readonly M3RealCaseId[]
  outputDir?: string
  writeArtifacts?: boolean
  nowMs?: () => number
  runBaseline?: (input: StructuralSearchInput) => StructuralSearchResult
  deterministicMaxGenerations?: number
  /** Reuse an already completed M3b wall-clock campaign from raw timing. */
  reuseWallClockMeasurement?: boolean
}

/** Run the bounded six-real-case M3b closeout; no synthetic campaign is run. */
export function runStructuralSearchM3b(options: M3BRunnerOptions = {}): M3BCampaignResult {
  const caseIds = options.realCaseIds ?? M3_REAL_CASES.map(({ id }) => id)
  const prepared = preparedRealCases(caseIds)
  const nowMs = options.nowMs ?? (() => performance.now())
  const runner = options.runBaseline ?? runStructuralSearch
  const envelope = createM3ResourceEnvelope(M3B_STRUCTURAL_CEILING)
  const pairs: M3BPairRecord[] = []
  const trajectories: M3BTrajectoryRecord[] = []
  let executionIndex = 0

  if (options.reuseWallClockMeasurement) {
    const existing = loadExistingWallClockMeasurement()
    if (existing === null) {
      throw new Error('M3b wall-clock reuse requested but no valid paired raw timing campaign is available')
    }
    trajectories.push(...existing.trajectories)
    pairs.push(...existing.pairs)
  } else {
    for (const [caseIndex, value] of prepared.entries()) {
      for (let repeatIndex = 0; repeatIndex < M3B_REPEAT_COUNT; repeatIndex += 1) {
        const executionOrder: [M3BMode, M3BMode] = (caseIndex + repeatIndex) % 2 === 0
          ? ['off', 'on']
          : ['on', 'off']
        const runs = new Map<M3BMode, M3BTrajectoryRecord>()
        for (const mode of executionOrder) {
          const trajectory = runTrajectory(value, repeatIndex, mode, executionIndex++, envelope, runner, nowMs)
          runs.set(mode, trajectory)
          trajectories.push(trajectory)
        }
        const off = runs.get('off')!
        const on = runs.get('on')!
        pairs.push({
          caseId: value.id,
          caseLabel: value.label,
          repeatIndex,
          executionOrder,
          off,
          on,
          deltaOnMinusOff: pairDelta(off, on),
        })
      }
    }
  }

  const frozen = loadFrozenM3Source()
  const generationRows = frozen.rows
  const uniqueStructuralEvents = uniqueStructuralAnalysis(generationRows)
  const deterministicFidelity = runM3bDeterministicTelemetryFidelity({
    maxGenerations: options.deterministicMaxGenerations ?? 4,
  })
  const wallClock = aggregateWallClock(pairs)
  const fidelityClassification = classifyFidelity(deterministicFidelity, pairs)
  const s3Classification = classifyS3(uniqueStructuralEvents)
  const partial = {
    schemaVersion: M3B_RUNNER_SCHEMA_VERSION,
    frozenBoundary: M3B_FROZEN_BOUNDARY,
    resourceEnvelope: envelope,
    wallClock,
    deterministicFidelity,
    frozenM3Source: frozen.source,
    uniqueStructuralEvents,
    fidelityClassification,
    s3Classification,
  }
  const evidenceSha256 = createHash('sha256').update(stableJson(partial)).digest('hex')
  const result: M3BCampaignResult = {
    ...partial,
    trajectories,
    pairs,
    evidenceSha256,
    outputDir: options.writeArtifacts === false ? undefined : options.outputDir ?? M3B_DEFAULT_OUTPUT_DIR,
  }
  if (options.writeArtifacts !== false) writeArtifacts(result.outputDir!, result)
  return result
}

/** Alias used by command-line research scripts. */
export const runStructuralSearchVnextM3b = runStructuralSearchM3b
/** Explicit census alias matching the frozen M3 runner naming. */
export const runStructuralSearchM3bCensus = runStructuralSearchM3b

export function isM3bCliInvocation(
  argv: readonly string[] = process.argv,
  moduleUrl: string = import.meta.url,
): boolean {
  if (argv.includes('--m3b-runner')) return true
  const modulePath = resolve(fileURLToPath(moduleUrl))
  return argv.slice(1).some((argument) => {
    try {
      return resolve(argument) === modulePath
    } catch {
      return false
    }
  })
}

if (isM3bCliInvocation()) {
  const result = runStructuralSearchM3b({
    reuseWallClockMeasurement: process.argv.includes('--m3b-reuse-wallclock'),
  })
  process.stdout.write(`${JSON.stringify({
    frozenBoundary: result.frozenBoundary,
    evidenceSha256: result.evidenceSha256,
    pairCount: result.pairs.length,
    fidelityClassification: result.fidelityClassification,
    s3Classification: result.s3Classification,
  }, null, 2)}\n`)
}

/** Public pure normalizer for focused M3b tests and offline aggregate analysis. */
export function deriveM3bUniqueStructuralEvents(
  rows: readonly M3BRunObservation[],
): M3BUniqueStructuralAnalysis {
  return uniqueStructuralAnalysis(rows)
}
