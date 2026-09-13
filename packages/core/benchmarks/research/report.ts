import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  compareWithBaseline,
  findPracticalMonotonicityWarnings,
} from './baseline.js'
import type {
  ResearchBaselineFile,
  ResearchComparison,
  ResearchRunMetadata,
  ResearchRunRow,
  ResearchAggregateRow,
  ResearchWarning,
} from './types.js'

export interface ResearchReportInput {
  metadata: ResearchRunMetadata
  runs: readonly ResearchRunRow[]
  aggregates: readonly ResearchAggregateRow[]
  baseline?: ResearchBaselineFile
  comparison?: ResearchComparison
  warnings?: readonly ResearchWarning[]
}

export interface ResearchArtifactFiles {
  summaryMd: string
  resultsJson: string
  timelineJson: string
  profileJson: string
  metadataJson: string
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function number(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : 'null'
}

function percent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'null'
}

function renderBaselineDeltas(comparison: ResearchComparison | undefined): string {
  if (comparison === undefined) return 'Baseline comparison was not requested.\n'
  if (!comparison.compatible) {
    return 'Baseline comparison: **baseline-incompatible**. No deltas were calculated.\n'
  }
  if (comparison.deltas.length === 0) return 'Baseline comparison is compatible, but no matching cells were found.\n'

  const lines = [
    '| Case | Budget | Max Filters | RMSE Δ dB | MaxAbs Δ dB | Target rate Δ | Time RMSE 0.50 Δ ms | Joint target Δ ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const delta of comparison.deltas) {
    lines.push(
      `| ${delta.caseId} | ${delta.budgetSeconds}s | ${delta.maxFilters} | ${number(delta.rmseDb.delta)} | ${number(delta.maxAbsDb.delta)} | ${percent(delta.targetAchievedRate.delta * 100)} | ${delta.timeToRmse050Ms.delta ?? 'null'} | ${delta.timeToJointTargetMs.delta ?? 'null'} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function renderQualityTable(aggregates: readonly ResearchAggregateRow[]): string {
  const lines = [
    '| Case | Budget | Max Filters | Runs | RMSE median | MaxAbs median | Target rate | Elapsed median ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const aggregate of aggregates) {
    lines.push(
      `| ${aggregate.caseId} | ${aggregate.budgetSeconds}s | ${aggregate.maxFilters} | ${aggregate.runCount} | ${number(aggregate.rmseDb.median)} | ${number(aggregate.maxAbsDb.median)} | ${percent(aggregate.targetAchievedRate * 100)} | ${number(aggregate.elapsedMs.median)} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function renderTimeToQuality(aggregates: readonly ResearchAggregateRow[]): string {
  const lines = [
    '| Case | Budget | RMSE ≤ 0.50 median ms | Joint target median ms | Joint target worst ms |',
    '| --- | ---: | ---: | ---: | ---: |',
  ]
  for (const aggregate of aggregates) {
    lines.push(
      `| ${aggregate.caseId} | ${aggregate.budgetSeconds}s | ${aggregate.timeToQualityMedian.rmse050Ms ?? 'null'} | ${aggregate.timeToQualityMedian.jointTargetMs ?? 'null'} | ${aggregate.timeToQualityWorst.jointTargetMs ?? 'null'} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function renderStability(aggregates: readonly ResearchAggregateRow[]): string {
  const lines = [
    '| Case | Budget | RMSE spread | MaxAbs spread | Termination distribution |',
    '| --- | ---: | ---: | ---: | --- |',
  ]
  for (const aggregate of aggregates) {
    lines.push(
      `| ${aggregate.caseId} | ${aggregate.budgetSeconds}s | ${number(aggregate.rmseDb.spread)} | ${number(aggregate.maxAbsDb.spread)} | ${Object.entries(aggregate.terminationReasons).map(([reason, count]) => `${reason}: ${count}`).join(', ')} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function renderWarnings(warnings: readonly ResearchWarning[]): string {
  if (warnings.length === 0) return 'No practical monotonicity warnings.\n'
  return `${warnings.map((warning) => `- **Warning:** ${warning.message}; RMSE Δ=${number(warning.rmseDb.delta)} dB, maxAbs Δ=${number(warning.maxAbsDb.delta)} dB.`).join('\n')}\n`
}

function renderSummary(
  input: ResearchReportInput,
  comparison: ResearchComparison | undefined,
  warnings: readonly ResearchWarning[],
): string {
  const deepProfiles = input.runs.filter((run) => run.telemetryMode === 'deep')
  return [
    '# AutoEQ Research Bench',
    '',
    `- Candidate commit: \`${input.metadata.candidateCommit}\``,
    `- Baseline commit: \`${input.metadata.baselineCommit}\``,
    `- Preset: \`${input.metadata.preset}\``,
    '',
    '## Baseline deltas',
    '',
    renderBaselineDeltas(comparison).trimEnd(),
    '',
    '## Quality and runtime',
    '',
    renderQualityTable(input.aggregates).trimEnd(),
    '',
    '## Time-to-quality',
    '',
    renderTimeToQuality(input.aggregates).trimEnd(),
    '',
    '## Stability',
    '',
    renderStability(input.aggregates).trimEnd(),
    '',
    '## Monotonicity warnings',
    '',
    renderWarnings(warnings).trimEnd(),
    '',
    '## Deep profile',
    '',
    deepProfiles.length === 0
      ? 'Deep profiling was not enabled.'
      : `Deep profile cells: ${deepProfiles.map((run) => `${run.caseId}:${run.budgetSeconds}`).join(', ')}`,
    '',
  ].join('\n')
}

export function renderResearchArtifacts(input: ResearchReportInput): ResearchArtifactFiles {
  const comparison = input.comparison ?? (
    input.baseline === undefined
      ? undefined
      : compareWithBaseline(input.aggregates, input.baseline)
  )
  const warnings = input.warnings ?? findPracticalMonotonicityWarnings(input.aggregates)
  const profileRows = input.runs
    .filter((run) => run.telemetryMode === 'deep')
    .map((run) => ({
      caseId: run.caseId,
      budgetSeconds: run.budgetSeconds,
      maxFilters: run.maxFilters,
      repeatIndex: run.repeatIndex,
      counters: run.counters,
      phaseTimingMs: run.phaseTimingMs,
    }))

  return {
    summaryMd: renderSummary(input, comparison, warnings),
    resultsJson: json({
      schemaVersion: 1,
      runs: input.runs,
      aggregates: input.aggregates,
      comparison: comparison ?? null,
      warnings,
    }),
    timelineJson: json({
      schemaVersion: 1,
      timelines: input.runs.map((run) => ({
        caseId: run.caseId,
        budgetSeconds: run.budgetSeconds,
        maxFilters: run.maxFilters,
        repeatIndex: run.repeatIndex,
        checkpoints: run.timeline,
        timeToQuality: run.timeToQuality,
      })),
    }),
    profileJson: profileRows.length === 0
      ? JSON.stringify({ enabled: false, profiles: [] })
      : json({ enabled: true, profiles: profileRows }),
    metadataJson: json(input.metadata),
  }
}

export function writeResearchArtifacts(
  outputDir: string,
  input: ResearchReportInput,
): ResearchArtifactFiles {
  const artifacts = renderResearchArtifacts(input)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'summary.md'), artifacts.summaryMd)
  writeFileSync(join(outputDir, 'results.json'), artifacts.resultsJson)
  writeFileSync(join(outputDir, 'timeline.json'), artifacts.timelineJson)
  writeFileSync(join(outputDir, 'profile.json'), artifacts.profileJson)
  writeFileSync(join(outputDir, 'metadata.json'), artifacts.metadataJson)
  return artifacts
}
