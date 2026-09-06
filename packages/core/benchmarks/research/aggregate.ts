import { compareV2PrimaryMetrics } from '../../src/autoeq/v2/ranking.js'

import type {
  ResearchCheckpoint,
  ResearchAggregateRow,
  ResearchJointRefineRecord,
  ResearchRunRow,
  ResearchTimeToQuality,
  ResearchWorkEfficiencySummary,
} from './types.js'

type NumericSummary = { best: number; median: number; worst: number; spread: number }

const TIME_TO_QUALITY_KEYS: readonly (keyof ResearchTimeToQuality)[] = [
  'rmse100Ms',
  'rmse075Ms',
  'rmse050Ms',
  'rmse035Ms',
  'rmse025Ms',
  'maxAbs200Ms',
  'maxAbs150Ms',
  'maxAbs100Ms',
  'maxAbs075Ms',
  'jointTargetMs',
]

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function summarize(values: readonly number[]): NumericSummary {
  const best = Math.min(...values)
  const worst = Math.max(...values)
  return { best, median: median(values), worst, spread: worst - best }
}

function medianOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : median(values)
}

function bestCheckpointHistory(
  checkpoints: readonly ResearchCheckpoint[],
): ResearchCheckpoint[] {
  const ordered = [...checkpoints].sort((left, right) => left.elapsedMs - right.elapsedMs)
  const history: ResearchCheckpoint[] = []
  let best: ResearchCheckpoint | undefined
  for (const checkpoint of ordered) {
    if (
      best === undefined ||
      compareV2PrimaryMetrics(checkpoint.metrics, best.metrics) < 0
    ) {
      best = checkpoint
      history.push(checkpoint)
    }
  }
  return history
}

export function summarizeResearchWorkEfficiency(
  records: readonly ResearchJointRefineRecord[],
  checkpoints: readonly ResearchCheckpoint[] = [],
  elapsedMs?: number,
): ResearchWorkEfficiencySummary {
  const completedCycleGains = records.flatMap((record) =>
    record.cycles
      .filter((cycle) => cycle.completed && Number.isFinite(cycle.normalizedViolationGain))
      .map((cycle) => cycle.normalizedViolationGain),
  )
  const history = bestCheckpointHistory(checkpoints)
  const timeToBestMs = history.at(-1)?.elapsedMs ?? null
  return {
    jointRefineRecords: records.length,
    expiredJointRefines: records.filter((record) => record.expired).length,
    previouslyAttemptedEquivalent: records.filter((record) => record.equivalentStatePreviouslyAttempted).length,
    previouslyCompletedEquivalent: records.filter((record) => record.equivalentStatePreviouslyCompleted).length,
    retainedAfterStaging: records.filter((record) => record.survivedStagedCandidateRetention).length,
    retainedAsActivePath: records.filter((record) => record.survivedActivePathRetention).length,
    contributedToBestDeliverable: records.filter((record) => record.contributedToBestDeliverable).length,
    coordinateTrials: records.reduce((sum, record) => sum + record.coordinateTrials, 0),
    coordinateTrialsContributingToBest: records.reduce(
      (sum, record) => sum + (record.contributedToBestDeliverable ? record.coordinateTrials : 0),
      0,
    ),
    medianNormalizedViolationGainPerCompletedCycle: medianOrNull(completedCycleGains),
    timeToBestMs,
    timeSinceLastImprovementMs: timeToBestMs === null || elapsedMs === undefined
      ? null
      : Math.max(0, elapsedMs - timeToBestMs),
  }
}

function workEfficiencyForRow(row: ResearchRunRow): ResearchWorkEfficiencySummary {
  return summarizeResearchWorkEfficiency(
    row.jointRefinements ?? [],
    row.timeline,
    row.elapsedMs,
  )
}

export function aggregateResearchWorkEfficiency(
  rows: readonly ResearchRunRow[],
): ResearchWorkEfficiencySummary {
  const summaries = rows.map(workEfficiencyForRow)
  const records = rows.flatMap((row) => row.jointRefinements ?? [])
  const cycleGains = records.flatMap((record) =>
    record.cycles
      .filter((cycle) => cycle.completed && Number.isFinite(cycle.normalizedViolationGain))
      .map((cycle) => cycle.normalizedViolationGain),
  )
  const timeToBest = summaries
    .map((summary) => summary.timeToBestMs)
    .filter((value): value is number => value !== null)
  const timeSinceLastImprovement = summaries
    .map((summary) => summary.timeSinceLastImprovementMs)
    .filter((value): value is number => value !== null)
  const sum = (selector: (summary: ResearchWorkEfficiencySummary) => number): number =>
    summaries.reduce((total, summary) => total + selector(summary), 0)
  return {
    jointRefineRecords: sum((summary) => summary.jointRefineRecords),
    expiredJointRefines: sum((summary) => summary.expiredJointRefines),
    previouslyAttemptedEquivalent: sum((summary) => summary.previouslyAttemptedEquivalent),
    previouslyCompletedEquivalent: sum((summary) => summary.previouslyCompletedEquivalent),
    retainedAfterStaging: sum((summary) => summary.retainedAfterStaging),
    retainedAsActivePath: sum((summary) => summary.retainedAsActivePath),
    contributedToBestDeliverable: sum((summary) => summary.contributedToBestDeliverable),
    coordinateTrials: sum((summary) => summary.coordinateTrials),
    coordinateTrialsContributingToBest: sum((summary) => summary.coordinateTrialsContributingToBest),
    medianNormalizedViolationGainPerCompletedCycle: medianOrNull(
      cycleGains.length > 0
        ? cycleGains
        : summaries
          .map((summary) => summary.medianNormalizedViolationGainPerCompletedCycle)
          .filter((value): value is number => value !== null),
    ),
    timeToBestMs: medianOrNull(timeToBest),
    timeSinceLastImprovementMs: medianOrNull(timeSinceLastImprovement),
  }
}

function aggregateTimeToQuality(
  rows: readonly ResearchRunRow[],
  selector: 'median' | 'worst',
): ResearchTimeToQuality {
  return Object.fromEntries(TIME_TO_QUALITY_KEYS.map((key) => {
    const values = rows.map((row) => row.timeToQuality[key] ?? Number.POSITIVE_INFINITY)
    const selected = selector === 'median' ? median(values) : Math.max(...values)
    return [key, Number.isFinite(selected) ? selected : null]
  })) as unknown as ResearchTimeToQuality
}

function groupKey(row: ResearchRunRow): string {
  return `${row.caseId}|${row.budgetSeconds}|${row.maxFilters}`
}

export function aggregateResearchRuns(
  rows: readonly ResearchRunRow[],
): ResearchAggregateRow[] {
  const grouped = new Map<string, ResearchRunRow[]>()
  for (const row of rows) {
    const group = grouped.get(groupKey(row)) ?? []
    group.push(row)
    grouped.set(groupKey(row), group)
  }

  return [...grouped.values()].map((group) => {
    const first = group[0]!
    const terminationReasons: Record<string, number> = {}
    for (const row of group) {
      const reason = row.final.terminationReason
      terminationReasons[reason] = (terminationReasons[reason] ?? 0) + 1
    }
    const targetAchievedCount = group.filter((row) => row.final.targetAchieved).length

    return {
      caseId: first.caseId,
      budgetSeconds: first.budgetSeconds,
      maxFilters: first.maxFilters,
      runCount: group.length,
      rmseDb: summarize(group.map((row) => row.final.rmseDb)),
      maxAbsDb: summarize(group.map((row) => row.final.maxAbsDb)),
      targetAchievedCount,
      targetAchievedRate: targetAchievedCount / group.length,
      terminationReasons,
      timeToQualityMedian: aggregateTimeToQuality(group, 'median'),
      timeToQualityWorst: aggregateTimeToQuality(group, 'worst'),
      elapsedMs: summarize(group.map((row) => row.elapsedMs)),
      peakWorkingFilterCount: summarize(
        group.map((row) => row.counters.peakWorkingFilterCount),
      ),
      jointRefinementCount: summarize(
        group.map((row) => row.counters.jointRefinementCount),
      ),
      workEfficiency: aggregateResearchWorkEfficiency(group),
    }
  })
}
