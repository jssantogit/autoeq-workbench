import { describe, expect, it } from 'vitest'

import { RESEARCH_CORPUS_SHA256 } from '../../../../benchmarks/research/corpus.js'
import type { ResearchProvenanceV2 } from '../../../../benchmarks/research/artifactSchema.js'
import { renderResearchArtifacts } from '../../../../benchmarks/research/report.js'
import type {
  ResearchAggregateRow,
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
  it('serializes schema-v2 provenance and an ordered best-so-far trajectory', () => {
    const provenance: ResearchProvenanceV2 = {
      schemaVersion: 2,
      repositorySha: 'research-head',
      algorithmId: 'standard-v2-control',
      algorithmVersion: '5dafaa50410b9fa3157c28a1f7757d676b33152a',
      configurationId: 'standard-v2-defaults',
      seed: null,
      corpusVersion: 'research-corpus-v1',
      caseInputSha256: RESEARCH_CORPUS_SHA256['dunu-titan-s2.txt']!,
      nodeVersion: 'v22.0.0',
      pythonVersion: null,
      runnerLabel: null,
      timeBudgetSeconds: 5,
      maxFilters: 10,
    }
    const artifacts = renderResearchArtifacts({
      provenance,
      runs: [{
        ...run,
        budgetSeconds: 5,
        timeline: [
          { elapsedMs: 500, metrics: { maeDb: 0.4, rmseDb: 0.8, maxAbsDb: 1.7, maxAbsFrequencyHz: 1_000 }, filterCount: 1 },
          { elapsedMs: 100, metrics: { maeDb: 0.6, rmseDb: 1.2, maxAbsDb: 2.5, maxAbsFrequencyHz: 1_000 }, filterCount: 0 },
          { elapsedMs: 500, metrics: { maeDb: 0.2, rmseDb: 0.4, maxAbsDb: 1.2, maxAbsFrequencyHz: 1_000 }, filterCount: 2 },
        ],
      }],
      aggregates: [aggregate],
    })
    const artifact = JSON.parse(artifacts.resultsJson)

    expect(Object.keys(artifacts).sort()).toEqual([
      'metadataJson', 'profileJson', 'resultsJson', 'summaryMd', 'timelineJson',
    ])
    expect(JSON.parse(artifacts.profileJson)).toEqual({ enabled: false, profiles: [] })
    expect(JSON.parse(artifacts.metadataJson)).toMatchObject(provenance)
    expect(artifact).toMatchObject({ schemaVersion: 2 })
    expect(artifact.provenance).toMatchObject({
      schemaVersion: 2,
      algorithmId: 'standard-v2-control',
      algorithmVersion: '5dafaa50410b9fa3157c28a1f7757d676b33152a',
      configurationId: 'standard-v2-defaults',
      seed: null,
      corpusVersion: 'research-corpus-v1',
      caseInputSha256: RESEARCH_CORPUS_SHA256['dunu-titan-s2.txt'],
      nodeVersion: 'v22.0.0',
      pythonVersion: null,
      runnerLabel: null,
      timeBudgetSeconds: 5,
      maxFilters: 10,
    })
    expect(artifact.trajectory.every((point: { elapsedMs: number }, index: number, all: { elapsedMs: number }[]) =>
      index === 0 || point.elapsedMs >= all[index - 1]!.elapsedMs,
    )).toBe(true)
    expect(artifact.trajectory).toEqual([
      { elapsedMs: 100, rmseDb: 1.2, maxAbsDb: 2.5, filterCount: 0, sourceSolutionKey: null },
      { elapsedMs: 500, rmseDb: 0.4, maxAbsDb: 1.2, filterCount: 2, sourceSolutionKey: null },
    ])
    expect(artifact.runs).toHaveLength(1)
    expect(JSON.parse(artifacts.timelineJson).timelines[0].caseId).toBe('titan-to-storm')
    expect(artifacts.summaryMd).toContain('Baseline')
    expect(artifacts.summaryMd).toContain('titan-to-storm')
    expect(artifacts.summaryMd).not.toContain('working-')
  })
})
