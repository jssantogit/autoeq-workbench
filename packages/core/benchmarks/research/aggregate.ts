import type {
  ResearchAggregateRow,
  ResearchRunRow,
  ResearchTimeToQuality,
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
    }
  })
}
