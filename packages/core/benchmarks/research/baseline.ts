import { RESEARCH_CORPUS_SHA256 } from './corpus.js'
import type {
  ResearchAggregateRow,
  ResearchBaselineFile,
  ResearchBaselineIdentity,
  ResearchComparison,
  ResearchComparisonDelta,
  ResearchMetricDelta,
  ResearchNullableMetricDelta,
  ResearchWarning,
} from './types.js'

export const RESEARCH_RUNNER_SCHEMA_VERSION = 1 as const
export const RESEARCH_CORPUS_SCHEMA_VERSION = 1 as const
export const RESEARCH_PARSER_PREPARATION_SCHEMA_VERSION = 1 as const

export function createResearchBaselineIdentity(
  implementationCommit: string,
): ResearchBaselineIdentity {
  return {
    schemaVersion: 1,
    implementationCommit,
    corpusSchemaVersion: RESEARCH_CORPUS_SCHEMA_VERSION,
    corpusHashes: { ...RESEARCH_CORPUS_SHA256 },
    parserPreparationSchemaVersion: RESEARCH_PARSER_PREPARATION_SCHEMA_VERSION,
    runnerSchemaVersion: RESEARCH_RUNNER_SCHEMA_VERSION,
  }
}

function sameCorpusHashes(hashes: Record<string, string>): boolean {
  if (hashes === null || typeof hashes !== 'object') return false
  const expectedNames = Object.keys(RESEARCH_CORPUS_SHA256)
  const actualNames = Object.keys(hashes ?? {})
  return expectedNames.length === actualNames.length &&
    expectedNames.every((name) => hashes[name] === RESEARCH_CORPUS_SHA256[name])
}

function isCompatibleBaseline(baseline: ResearchBaselineFile): boolean {
  const identity = baseline?.identity
  return identity?.schemaVersion === 1 &&
    typeof identity.implementationCommit === 'string' &&
    identity.implementationCommit.length > 0 &&
    identity.corpusSchemaVersion === RESEARCH_CORPUS_SCHEMA_VERSION &&
    identity.parserPreparationSchemaVersion === RESEARCH_PARSER_PREPARATION_SCHEMA_VERSION &&
    identity.runnerSchemaVersion === RESEARCH_RUNNER_SCHEMA_VERSION &&
    sameCorpusHashes(identity.corpusHashes) &&
    Array.isArray(baseline.aggregates)
}

function metricDelta(candidate: number, baseline: number): ResearchMetricDelta {
  const delta = candidate - baseline
  return {
    candidate,
    baseline,
    delta,
    percentDelta: baseline === 0 ? null : (delta / baseline) * 100,
  }
}

function nullableMetricDelta(
  candidate: number | null,
  baseline: number | null,
): ResearchNullableMetricDelta {
  if (candidate === null || baseline === null) {
    return { candidate, baseline, delta: null, percentDelta: null }
  }
  const delta = candidate - baseline
  return {
    candidate,
    baseline,
    delta,
    percentDelta: baseline === 0 ? null : (delta / baseline) * 100,
  }
}

function aggregateKey(row: Pick<ResearchAggregateRow, 'caseId' | 'budgetSeconds' | 'maxFilters'>): string {
  return `${row.caseId}|${row.budgetSeconds}|${row.maxFilters}`
}

function comparableDelta(
  candidate: ResearchAggregateRow,
  baseline: ResearchAggregateRow,
): ResearchComparisonDelta {
  return {
    caseId: candidate.caseId,
    budgetSeconds: candidate.budgetSeconds,
    maxFilters: candidate.maxFilters,
    rmseDb: metricDelta(candidate.rmseDb.median, baseline.rmseDb.median),
    maxAbsDb: metricDelta(candidate.maxAbsDb.median, baseline.maxAbsDb.median),
    targetAchievedRate: metricDelta(
      candidate.targetAchievedRate,
      baseline.targetAchievedRate,
    ),
    timeToRmse050Ms: nullableMetricDelta(
      candidate.timeToQualityMedian.rmse050Ms,
      baseline.timeToQualityMedian.rmse050Ms,
    ),
    timeToJointTargetMs: nullableMetricDelta(
      candidate.timeToQualityMedian.jointTargetMs,
      baseline.timeToQualityMedian.jointTargetMs,
    ),
    elapsedMs: metricDelta(candidate.elapsedMs.median, baseline.elapsedMs.median),
    peakWorkingFilterCount: metricDelta(
      candidate.peakWorkingFilterCount.median,
      baseline.peakWorkingFilterCount.median,
    ),
    jointRefinementCount: metricDelta(
      candidate.jointRefinementCount.median,
      baseline.jointRefinementCount.median,
    ),
  }
}

export function compareWithBaseline(
  candidate: readonly ResearchAggregateRow[],
  baseline: ResearchBaselineFile,
): ResearchComparison {
  if (!isCompatibleBaseline(baseline)) {
    return { compatible: false, reason: 'baseline-incompatible', deltas: [] }
  }

  const baselineByKey = new Map(
    baseline.aggregates.map((aggregate) => [aggregateKey(aggregate), aggregate]),
  )
  const deltas: ResearchComparisonDelta[] = []
  for (const aggregate of candidate) {
    const baselineAggregate = baselineByKey.get(aggregateKey(aggregate))
    if (baselineAggregate !== undefined) {
      deltas.push(comparableDelta(aggregate, baselineAggregate))
    }
  }
  return { compatible: true, deltas }
}

export function findPracticalMonotonicityWarnings(
  aggregates: readonly ResearchAggregateRow[],
): ResearchWarning[] {
  const warnings: ResearchWarning[] = []
  const cells = new Map<string, ResearchAggregateRow>()
  for (const aggregate of aggregates) {
    cells.set(aggregateKey(aggregate), aggregate)
  }

  const grouped = new Map<string, ResearchAggregateRow[]>()
  for (const aggregate of aggregates) {
    const key = `${aggregate.caseId}|${aggregate.maxFilters}`
    const group = grouped.get(key) ?? []
    group.push(aggregate)
    grouped.set(key, group)
  }

  for (const group of grouped.values()) {
    const first = group[0]!
    for (const [shorterBudgetSeconds, longerBudgetSeconds] of [[15, 30], [30, 60]] as const) {
      const shorter = cells.get(`${first.caseId}|${shorterBudgetSeconds}|${first.maxFilters}`)
      const longer = cells.get(`${first.caseId}|${longerBudgetSeconds}|${first.maxFilters}`)
      if (shorter === undefined || longer === undefined) continue

      const rmseDelta = longer.rmseDb.median - shorter.rmseDb.median
      const maxAbsDelta = longer.maxAbsDb.median - shorter.maxAbsDb.median
      const triggers: Array<'rmse' | 'maxAbs'> = []
      if (rmseDelta > 0.05) triggers.push('rmse')
      if (maxAbsDelta > 0.10) triggers.push('maxAbs')
      if (triggers.length === 0) continue

      warnings.push({
        type: 'practical-monotonicity',
        caseId: first.caseId,
        maxFilters: first.maxFilters,
        shorterBudgetSeconds,
        longerBudgetSeconds,
        rmseDb: {
          shorter: shorter.rmseDb.median,
          longer: longer.rmseDb.median,
          delta: rmseDelta,
          threshold: 0.05,
        },
        maxAbsDb: {
          shorter: shorter.maxAbsDb.median,
          longer: longer.maxAbsDb.median,
          delta: maxAbsDelta,
          threshold: 0.10,
        },
        triggers,
        message: `${first.caseId} ${longerBudgetSeconds}s is materially worse than ${shorterBudgetSeconds}s (${triggers.join(' and ')})`,
      })
    }
  }
  return warnings
}
