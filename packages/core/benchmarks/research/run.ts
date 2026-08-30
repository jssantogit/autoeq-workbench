import { performance } from 'node:perf_hooks'

import {
  cascadeMagnitudeDb,
  calculateBandMetrics,
  calculateErrorMetrics,
  DEFAULT_AUTOEQ_SETTINGS,
  isV2TargetAchieved,
  runStandardAutoEqV2,
  type AutoEqResultV2,
  type StandardAutoEqInputV2,
  type StandardV2Runtime,
} from '../../src/index.js'

import {
  loadResearchCases,
  prepareResearchDesired,
  RESEARCH_NORMALIZATION,
} from './corpus.js'
import { createResearchTelemetry } from './telemetry.js'
import { calculateTimeToQuality, projectTimeline } from './timeline.js'
import { RESEARCH_BANDS } from './telemetry.js'
import type { ResearchCaseId, ResearchRunRow } from './types.js'

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

function verifyMetrics(
  result: AutoEqResultV2,
  desiredDb: readonly number[],
  frequenciesHz: readonly number[],
): { metrics: AutoEqResultV2['metrics']; bands: ResearchRunRow['bands'] } {
  const cascadeDb = cascadeMagnitudeDb(result.filters, frequenciesHz, 48_000)
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
  }
}
