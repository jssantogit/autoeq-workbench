import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  enumerateStormStructuralProposals,
  normalizeStormStructuralProposalCensusProvenance,
  type StormStructuralProposalCensusProblem,
} from '../../../../benchmarks/research/stormStructuralProposalCensus.js'
import { runStructuralBeam } from '../../../../benchmarks/research/structuralBeam.js'

const problem: StormStructuralProposalCensusProblem = {
  problemId: 'synthetic-structural-census',
  inputSha256: 'b'.repeat(64),
  frequenciesHz: [20, 100, 1_000, 10_000],
  sampleRateHz: 48_000,
  desiredDb: [0, 0, 4, 0],
  bounds: {
    minFrequencyHz: 20,
    maxFrequencyHz: 20_000,
    minGainDb: -15,
    maxGainDb: 15,
    minPkQ: 0.1,
    maxPkQ: 12,
    shelfQ: 0.7,
    maxFilters: 10,
  },
}

const parentFilters = [
  { id: 'pk-1', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: -4, q: 1 },
  { id: 'pk-2', enabled: true, type: 'PK' as const, frequencyHz: 1_050, gainDb: -2, q: 2 },
  { id: 'pk-3', enabled: true, type: 'PK' as const, frequencyHz: 2_000, gainDb: -1, q: 1 },
  { id: 'pk-4', enabled: true, type: 'PK' as const, frequencyHz: 3_000, gainDb: -1, q: 1 },
  { id: 'pk-5', enabled: true, type: 'PK' as const, frequencyHz: 4_000, gainDb: -1, q: 1 },
  { id: 'pk-6', enabled: true, type: 'PK' as const, frequencyHz: 5_000, gainDb: -1, q: 1 },
  { id: 'pk-7', enabled: true, type: 'PK' as const, frequencyHz: 6_000, gainDb: -1, q: 1 },
  { id: 'pk-8', enabled: true, type: 'PK' as const, frequencyHz: 7_000, gainDb: -1, q: 1 },
  { id: 'hs-1', enabled: true, type: 'HS' as const, frequencyHz: 15_000, gainDb: 2, q: 0.7 },
  { id: 'hs-2', enabled: true, type: 'HS' as const, frequencyHz: 19_000, gainDb: 2, q: 0.7 },
]

describe('Storm structural proposal census', () => {
  it('enumerates every ordered Max10 proposal before applying the current top-4 boundary', () => {
    const before = parentFilters.map((filter) => ({ ...filter }))
    const census = enumerateStormStructuralProposals({
      problem,
      parentFilters,
      residualDb: [0, 0, 4, 0],
      top4: 4,
    })

    expect(census).toHaveLength(21)
    expect(census.map((proposal) => proposal.rank)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    )
    expect(census.every((proposal) => proposal.admittedByCurrentTop4 === (proposal.rank <= 4))).toBe(true)
    expect(census.filter((proposal) => proposal.admittedByCurrentTop4)).toHaveLength(4)
    expect(census.map((proposal) => proposal.originalOrdinal).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    )
    expect(census.map((proposal) => proposal.mutation)).toEqual([
      'merge',
      'remove', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove',
      'type-mutation', 'type-mutation', 'type-mutation', 'type-mutation', 'type-mutation', 'type-mutation',
      'type-mutation', 'type-mutation', 'type-mutation', 'type-mutation',
    ])
    expect(census.some((proposal) => proposal.mutation === 'add-pk' || proposal.mutation === 'split')).toBe(false)
    expect(parentFilters).toEqual(before)
  })

  it('records the frozen census boundary, selector outcomes, and wholly truncated types', () => {
    const artifactPath = resolve(
      process.cwd(),
      '.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json',
    )
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, any>

    expect(artifact.configuration).toMatchObject({
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      top4Admission: 4,
    })
    expect(artifact.controls).toMatchObject({
      initialParentOnly: true,
      frozenSelector: 'reference-selector-v1',
      generatorIdentity: 'generateStructuralMutations',
      orderIdentity: 'orderStructuralProposals',
    })
    expect(artifact.inventory.totalProposalCount).toBe(21)
    expect(artifact.admissionBoundary).toMatchObject({
      orderedBeforeSlice: true,
      admittedCount: 4,
      excludedCount: 17,
      admittedRanks: [1, 2, 3, 4],
    })
    expect(artifact.summary.whollyTruncatedTypes).toEqual(['type-mutation'])
    expect(artifact.results.proposals).toHaveLength(21)
    expect(artifact.results.proposals.every((proposal: any) => proposal.coordinateTrialCount === 24)).toBe(true)
    expect(artifact.results.proposals.every((proposal: any) =>
      proposal.admittedByCurrentTop4 === (proposal.lexicalAdmissionRank <= 4))).toBe(true)
    expect(artifact.results.proposals.every((proposal: any) =>
      proposal.frozenReferenceSelectorV1.againstParent.winner !== undefined &&
      proposal.frozenReferenceSelectorV1.againstPrimary.winner !== undefined)).toBe(true)
    expect(artifact.classification).toMatch(
      /^(admission-bottleneck-supported|admission-ranking-misaligned|admission-bottleneck-not-supported-at-this-parent|mixed\/unresolved)$/,
    )
    expect(artifact).toHaveProperty('producerCommit', '989832ea9f6aca047433b64107d07cc61ada1bea')
    expect(artifact).toHaveProperty('frozenReplaySourceCommit', '26ba86bdb17e0b5d365fd51590dd6abdb4636b96')
    expect(artifact).not.toHaveProperty('sourceCommit')
    expect(artifact.sourceArtifact).toMatchObject({
      logicalId: 'external:storm-mp-reallocation-corrective-rerun1/tournament-report.json',
    })
    expect(artifact.replayArtifact).toMatchObject({
      logicalId: 'repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
    })
    expect(artifact.referenceSnapshot).toMatchObject({
      logicalId: 'external:OracleReferenceSnapshotV1.json',
    })
    expect(artifact.results.parent.canonicalFilters).toEqual(artifact.results.parent.frozenReplayCanonicalFilters)
    expect(artifact.results.parent.replayComparison).toEqual({
      canonicalFiltersMatched: true,
      cancellationScoreMatched: true,
      referenceRegretMatched: true,
    })
    expect(artifact.recommendedNextExperiment).toMatch(/causal ranking\/admission experiment/)

    const artifactText = readFileSync(artifactPath, 'utf8')
    const reportText = readFileSync(resolve(process.cwd(), '../../docs/superpowers/specs/2026-09-10-storm-structural-proposal-census-results.md'), 'utf8')
    expect(artifactText).not.toMatch(/\/(?:tmp|root|home)\//)
    expect(reportText).not.toMatch(/\/(?:tmp|root|home)\//)
  })

  it('normalizes provenance deterministically across machine and worktree roots', () => {
    const left = normalizeStormStructuralProposalCensusProvenance({
      sourceArtifactPath: '/tmp/left-worktree/replay/tournament-report.json',
      replayArtifactPath: '/root/projects/autoeq-workbench/.worktrees/left/packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
      referenceSnapshotPath: '/tmp/left-snapshot/OracleReferenceSnapshotV1.json',
    })
    const right = normalizeStormStructuralProposalCensusProvenance({
      sourceArtifactPath: '/var/lib/other/replay/tournament-report.json',
      replayArtifactPath: '/mnt/other/packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json',
      referenceSnapshotPath: '/opt/snapshots/OracleReferenceSnapshotV1.json',
    })

    expect(left).toEqual(right)
    expect(JSON.stringify(left)).not.toMatch(/\/(?:tmp|root|home|var|mnt|opt)\//)
  })

  it('keeps a normal structural beam unchanged when census inventory is run independently', () => {
    const beamInput = {
      problem: { ...problem, desiredDb: [0, 0, 4, 0] },
      seed: 0,
      evaluationBudget: 8,
      referenceSnapshotSha256: 'c'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 1 }],
      config: { beamWidth: 1, proposalsPerParent: 3, localPolishEvaluations: 0, maxFilters: 4 },
      evaluate: (candidate: any) => {
        const metric = candidate.filters.length === 0 ? 1 : 1 / (candidate.filters.length + 1)
        return {
          protocolVersion: 1 as const,
          candidateId: candidate.candidateId,
          valid: true,
          rejectionReason: null,
          continuous: { rmseDb: metric, maxAbsDb: metric, bandRmseDb: {} },
          deliverable: {
            filters: candidate.filters.map((filter: any) => ({ ...filter })),
            rmseDb: metric,
            maxAbsDb: metric,
            bandRmseDb: {},
            cancellationTotalScore: 0,
          },
        }
      },
    }
    const before = runStructuralBeam(beamInput)
    enumerateStormStructuralProposals({
      problem,
      parentFilters,
      residualDb: [0, 0, 4, 0],
      top4: 4,
    })
    const after = runStructuralBeam(beamInput)

    expect(after.candidates).toEqual(before.candidates)
    expect(after.evaluations).toEqual(before.evaluations)
    expect(after.trajectory).toEqual(before.trajectory)
    expect(after.metadata).toEqual(before.metadata)
  })
})
