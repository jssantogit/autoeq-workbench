import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { compareStormReplayFidelity } from '../../../../benchmarks/research/stormDiagnosticReplay.js'

const repositoryRoot = resolve(process.cwd(), '../..')
const historicalPath = resolve(
  repositoryRoot,
  'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/tournament-report.json',
)
const closeoutPath = resolve(
  repositoryRoot,
  'packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/semantic-closeout.json',
)
const replayPath = resolve(
  repositoryRoot,
  'packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
)

describe('Storm diagnostic evidence closeout', () => {
  it('keeps the historical causal JSON byte-identical and records corrected provenance', () => {
    expect(createHash('sha256').update(readFileSync(historicalPath)).digest('hex'))
      .toBe('322ed5ea9fd2c44c429dd3ccdcdc7987fcd86c56f4f9f35a71f9bd248ffe82f9')
    expect(existsSync(closeoutPath)).toBe(true)
    const closeout = JSON.parse(readFileSync(closeoutPath, 'utf8')) as Record<string, any>
    expect(closeout.provenance.producerCommit).toBeNull()
    expect(closeout.provenance.auditedTreeCommit)
      .toBe('22a05fdcac88bdd603b7d80d7d96ffe10a28d606')
    expect(closeout.causalArtifact.sha256)
      .toBe('322ed5ea9fd2c44c429dd3ccdcdc7987fcd86c56f4f9f35a71f9bd248ffe82f9')
    expect(closeout.paretoAccounting.metricName).toBe('paretoNovelAgainstSeedBaselines')
    expect(closeout.paretoAccounting.descendantOnlyMetricName)
      .toBe('paretoNovelDescendantsOnly')
  })

  it('records a faithful sparse-0010 replay with diagnostic evidence', () => {
    expect(existsSync(replayPath)).toBe(true)
    const report = JSON.parse(readFileSync(replayPath, 'utf8')) as Record<string, any>
    expect(report.caseId).toBe('titan-to-storm')
    expect(report.primarySeedId).toBe('matching-pursuit-v1:titan-to-storm:0:sparse-0010')
    expect(report.configuration).toMatchObject({
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      descendantEvaluations: 8,
    })
    expect(report.fidelity).toMatchObject({
      status: 'incomplete-unverifiable',
      valid: false,
      mismatchCount: 0,
      historicalDeliveredFiltersAvailable: false,
    })
    expect(report.fidelity.behavioralNoninterference).toMatchObject({ status: 'valid', valid: true, mismatchCount: 0 })
    expect(report.fidelity.historical).toMatchObject({
      status: 'incomplete-unverifiable',
      valid: false,
      deliveredFiltersAvailable: false,
      deliveredFiltersUnchanged: null,
    })
    expect(report.fidelity.referenceSnapshotUnchanged).toBe(true)
    expect(report.fidelity.selectorUnchanged).toBe(true)
    expect(report.instrumentation.schemaVersion).toBe(1)
    expect(report.instrumentation.entries.length).toBe(9)
    expect(report.interpretation.classification).toMatch(
      /^(proposal-limited|solve-limited|residual-allocation-limited|dictionary-limited|mixed\/unresolved)$/,
    )
    expect(report.openHypotheses).toContain('dictionary-limited')
  })

  it('does not label historical fidelity fully valid when delivered filters are unavailable', () => {
    expect(existsSync(replayPath)).toBe(true)
    const report = JSON.parse(readFileSync(replayPath, 'utf8')) as Record<string, any>

    expect(report.fidelity.historicalDeliveredFiltersAvailable).toBe(false)
    expect(report.fidelity.status).toBe('incomplete-unverifiable')
    expect(report.fidelity.valid).toBe(false)
    expect(report.fidelity.behavioralNoninterference).toMatchObject({
      status: 'valid',
      valid: true,
    })
  })

  it('detects candidate-order, filter, metric, selector, and reference drift', () => {
    const comparable = {
      candidateIds: ['a', 'b'],
      deliveredFilters: [[], []],
      canonicalMetrics: [
        { rmseDb: 1, maxAbsDb: 2, filterCount: 0 },
        { rmseDb: 2, maxAbsDb: 3, filterCount: 0 },
      ],
      selectedBestCandidateId: 'a',
      descendantCount: 1,
      referenceSnapshotSha256: 'a'.repeat(64),
      selectorVersion: 'reference-selector-v1' as const,
    }
    const drifted = {
      ...comparable,
      candidateIds: ['b', 'a'],
      canonicalMetrics: [
        { rmseDb: 1.1, maxAbsDb: 2, filterCount: 0 },
        { rmseDb: 2, maxAbsDb: 3, filterCount: 0 },
      ],
      selectedBestCandidateId: 'b',
      referenceSnapshotSha256: 'b'.repeat(64),
    }

    const fidelity = compareStormReplayFidelity(comparable, drifted)

    expect(fidelity.valid).toBe(false)
    expect(fidelity.mismatchCount).toBeGreaterThanOrEqual(4)
    expect(fidelity.candidateOrderUnchanged).toBe(false)
    expect(fidelity.canonicalMetricsWithinTolerance).toBe(false)
    expect(fidelity.selectedBestUnchanged).toBe(false)
    expect(fidelity.referenceSnapshotUnchanged).toBe(false)
  })
})
