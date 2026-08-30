import { describe, expect, it } from 'vitest'

import { RESEARCH_CORPUS_SHA256 } from '../../../../benchmarks/research/corpus.js'
import { renderResearchArtifacts } from '../../../../benchmarks/research/report.js'
import type {
  ResearchAggregateRow,
  ResearchRunMetadata,
  ResearchRunRow,
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

const aggregate: ResearchAggregateRow = {
  caseId: 'titan-to-storm',
  budgetSeconds: 15,
  maxFilters: 10,
  runCount: 1,
  rmseDb: { best: 0.4, median: 0.4, worst: 0.4, spread: 0 },
  maxAbsDb: { best: 0.8, median: 0.8, worst: 0.8, spread: 0 },
  targetAchievedCount: 0,
  targetAchievedRate: 0,
  terminationReasons: { converged: 1 },
  timeToQualityMedian: emptyTimeToQuality(),
  timeToQualityWorst: emptyTimeToQuality(),
  elapsedMs: { best: 100, median: 100, worst: 100, spread: 0 },
  peakWorkingFilterCount: { best: 2, median: 2, worst: 2, spread: 0 },
  jointRefinementCount: { best: 3, median: 3, worst: 3, spread: 0 },
}

const run: ResearchRunRow = {
  caseId: 'titan-to-storm',
  budgetSeconds: 15,
  maxFilters: 10,
  repeatIndex: 0,
  elapsedMs: 100,
  final: {
    maeDb: 0.2,
    rmseDb: 0.4,
    maxAbsDb: 0.8,
    maxAbsFrequencyHz: 1_000,
    targetAchieved: false,
    terminationReason: 'converged',
    deliveredFilterCount: 2,
    preampDb: -1,
  },
  bands: [],
  counters: {
    boundaryModeAttempts: 1,
    candidatesGenerated: 2,
    candidatesShortlisted: 1,
    workingCheckpoints: 1,
    deliverablesBuilt: 1,
    peakWorkingFilterCount: 2,
    jointRefinementCount: 3,
    jointCoordinateTrials: 4,
    discreteTrials: 5,
    discreteAcceptedMoves: 1,
    compressionRemovalTrials: 0,
  },
  timeToQuality: emptyTimeToQuality(),
  timeline: [],
  filters: [],
  telemetryMode: 'light',
  phaseTimingMs: {
    prepare: 0,
    candidateScoring: 0,
    jointRefine: 0,
    deliverable: 0,
    discreteRefine: 0,
    compression: 0,
    other: 0,
  },
}

describe('research artifact report', () => {
  it('renders the five stable artifacts and an exact empty profile when deep mode is absent', () => {
    const metadata: ResearchRunMetadata = {
      schemaVersion: 1,
      candidateCommit: 'candidate',
      baselineCommit: 'baseline',
      runnerSchemaVersion: 1,
      fixtureHashes: { ...RESEARCH_CORPUS_SHA256 },
      preset: 'quick',
    }
    const artifacts = renderResearchArtifacts({
      metadata,
      runs: [run],
      aggregates: [aggregate],
    })

    expect(Object.keys(artifacts).sort()).toEqual([
      'metadataJson', 'profileJson', 'resultsJson', 'summaryMd', 'timelineJson',
    ])
    expect(JSON.parse(artifacts.profileJson)).toEqual({ enabled: false, profiles: [] })
    expect(JSON.parse(artifacts.metadataJson)).toMatchObject(metadata)
    expect(JSON.parse(artifacts.resultsJson).runs).toHaveLength(1)
    expect(JSON.parse(artifacts.timelineJson).timelines[0].caseId).toBe('titan-to-storm')
    expect(artifacts.summaryMd).toContain('Baseline')
    expect(artifacts.summaryMd).toContain('titan-to-storm')
    expect(artifacts.summaryMd).not.toContain('working-')
  })
})
