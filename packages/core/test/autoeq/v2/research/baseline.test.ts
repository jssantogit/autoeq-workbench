import { describe, expect, it } from 'vitest'

import {
  createResearchBaselineIdentity,
  compareWithBaseline,
  findPracticalMonotonicityWarnings,
  RESEARCH_RUNNER_SCHEMA_VERSION,
} from '../../../../benchmarks/research/baseline.js'
import { RESEARCH_CORPUS_SHA256 } from '../../../../benchmarks/research/corpus.js'
import {
  PUBLISHED_STANDARD_V2_COMMIT,
  readCommittedBaseline,
} from '../../../../benchmarks/research/run.js'
import type {
  ResearchAggregateRow,
  ResearchBaselineFile,
  ResearchTimeToQuality,
} from '../../../../benchmarks/research/types.js'

const emptyTimeToQuality = (): ResearchTimeToQuality => ({
  rmse100Ms: null,
  rmse075Ms: null,
  rmse050Ms: null,
  rmse035Ms: null,
  rmse025Ms: null,
  maxAbs200Ms: null,
  maxAbs150Ms: null,
  maxAbs100Ms: null,
  maxAbs075Ms: null,
  jointTargetMs: null,
})

function aggregate(
  budgetSeconds: number,
  rmseDb: number,
  maxAbsDb: number,
): ResearchAggregateRow {
  const summary = { best: rmseDb, median: rmseDb, worst: rmseDb, spread: 0 }
  const maxSummary = { best: maxAbsDb, median: maxAbsDb, worst: maxAbsDb, spread: 0 }
  return {
    caseId: 'titan-to-storm',
    budgetSeconds,
    maxFilters: 10,
    runCount: 1,
    rmseDb: summary,
    maxAbsDb: maxSummary,
    targetAchievedCount: 0,
    targetAchievedRate: 0,
    terminationReasons: { converged: 1 },
    timeToQualityMedian: emptyTimeToQuality(),
    timeToQualityWorst: emptyTimeToQuality(),
    elapsedMs: { best: 100, median: 100, worst: 100, spread: 0 },
    peakWorkingFilterCount: { best: 2, median: 2, worst: 2, spread: 0 },
    jointRefinementCount: { best: 3, median: 3, worst: 3, spread: 0 },
  }
}

describe('research baseline compatibility', () => {
  it('loads the committed published-v2 baseline with the approved identity', () => {
    const baseline = readCommittedBaseline()

    expect(baseline).toBeDefined()
    expect(baseline?.identity).toEqual({
      schemaVersion: 1,
      implementationCommit: PUBLISHED_STANDARD_V2_COMMIT,
      corpusSchemaVersion: 1,
      corpusHashes: RESEARCH_CORPUS_SHA256,
      parserPreparationSchemaVersion: 1,
      runnerSchemaVersion: RESEARCH_RUNNER_SCHEMA_VERSION,
    })
    expect(baseline?.runs).toHaveLength(60)
    expect(baseline?.aggregates).toHaveLength(12)
  })

  it('compares aggregate cells only when the corpus and schemas match', () => {
    const identity = createResearchBaselineIdentity('7c9ebbbe6eefeb131c6c698055c737b429f5b0c6')
    const baseline: ResearchBaselineFile = {
      identity,
      aggregates: [aggregate(15, 0.2, 0.6)],
    }
    const comparison = compareWithBaseline([aggregate(15, 0.3, 0.8)], baseline)

    expect(comparison.compatible).toBe(true)
    expect(comparison.deltas).toHaveLength(1)
    expect(comparison.deltas[0]).toMatchObject({
      caseId: 'titan-to-storm',
      budgetSeconds: 15,
      rmseDb: { candidate: 0.3, baseline: 0.2 },
      maxAbsDb: { candidate: 0.8, baseline: 0.6 },
    })
    expect(comparison.deltas[0]!.rmseDb.delta).toBeCloseTo(0.1)
    expect(comparison.deltas[0]!.maxAbsDb.delta).toBeCloseTo(0.2)
  })

  it('returns the explicit incompatibility shape for any identity mismatch', () => {
    const identity = createResearchBaselineIdentity('baseline')
    const baseline: ResearchBaselineFile = {
      identity: {
        ...identity,
        runnerSchemaVersion: 2,
      } as unknown as ResearchBaselineFile['identity'],
      aggregates: [aggregate(15, 0.2, 0.6)],
    }

    expect(compareWithBaseline([aggregate(15, 0.3, 0.8)], baseline)).toEqual({
      compatible: false,
      reason: 'baseline-incompatible',
      deltas: [],
    })
  })
})

describe('research monotonicity warnings', () => {
  it('warns on material median quality regressions across 5→15, 15→30, and 30→60 seconds', () => {
    const warnings = findPracticalMonotonicityWarnings([
      aggregate(5, 0.20, 0.70),
      aggregate(15, 0.30, 0.70),
      aggregate(30, 0.36, 0.70),
      aggregate(60, 0.36, 0.85),
    ])

    expect(warnings).toHaveLength(3)
    expect(warnings.map(({ shorterBudgetSeconds, longerBudgetSeconds }) => [
      shorterBudgetSeconds,
      longerBudgetSeconds,
    ])).toEqual([[5, 15], [15, 30], [30, 60]])
  })
})
