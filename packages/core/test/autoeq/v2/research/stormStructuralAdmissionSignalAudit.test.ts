import { describe, expect, it } from 'vitest'
import { createEvaluationGrid, type Filter } from '../../../../src/index.js'

import {
  classifyStormStructuralAdmissionSignalAudit,
  computeStormStructuralAdmissionSignalSummary,
  rankStormStructuralAdmissionSignals,
  runPartialStormStructuralAdmissionProbe,
  runStormStructuralAdmissionSignalAudit,
  type StormStructuralAdmissionSignalLabel,
  type StormStructuralAdmissionSignalRow,
} from '../../../../benchmarks/research/stormStructuralAdmissionSignalAudit.js'
import { runStructuralBeam } from '../../../../benchmarks/research/structuralBeam.js'

const syntheticProblem = {
  protocolVersion: 1 as const,
  problemId: 'synthetic-storm-admission-signal-audit',
  inputSha256: 'b'.repeat(64),
  frequenciesHz: createEvaluationGrid(),
  sampleRateHz: 48_000 as const,
  desiredDb: createEvaluationGrid().map(() => 0),
  allowedFilterTypes: ['PK', 'LS', 'HS'] as ['PK', 'LS', 'HS'],
  bounds: {
    minFrequencyHz: 20,
    maxFrequencyHz: 20_000,
    minGainDb: -15,
    maxGainDb: 15,
    minPkQ: 0.1,
    maxPkQ: 12,
    shelfQ: 0.7,
    maxFilters: 4,
  },
  quantization: { frequencyStepHz: 1 as const, gainStepDb: 0.1 as const, qStep: 0.01 as const },
}

function signalRow(
  proposalRank: number,
  rmseDb: number,
  maxAbsDb: number,
): StormStructuralAdmissionSignalRow {
  const metric = { rmseDb, maxAbsDb, filterCount: 1, cancellationScore: 0 }
  return {
    proposalRank,
    mutation: 'remove',
    prePolish: {
      continuous: metric,
      canonical: metric,
    },
    partialRefinement: {
      2: { metrics: metric, coordinateTrials: 2 },
      6: { metrics: metric, coordinateTrials: 6 },
    },
  }
}

function label(
  proposalRank: number,
  admittedByCurrentTop4: boolean,
  rmseDb: number,
  maxAbsDb: number,
  selectorBeatsParent = false,
): StormStructuralAdmissionSignalLabel {
  return {
    proposalRank,
    admittedByCurrentTop4,
    canonical: { rmseDb, maxAbsDb, filterCount: 1, cancellationScore: 0 },
    coordinateTrialCount: 24,
    selectorBeatsParent,
  }
}

describe('Storm structural admission cheap-signal audit', () => {
  it('uses deterministic proposal-rank tie breaks for every complete ranking', () => {
    const rows = [
      signalRow(2, 1, 1),
      signalRow(1, 1, 1),
      signalRow(3, 0.5, 2),
    ]

    const first = rankStormStructuralAdmissionSignals(rows)
    const second = rankStormStructuralAdmissionSignals(rows)

    expect(first).toEqual(second)
    expect(first.map((entry) => entry.ranking.slice(0, 3))).toEqual([
      [1, 2, 3],
      [3, 1, 2],
      [3, 1, 2],
      [3, 1, 2],
      [3, 1, 2],
    ])
    expect(first.every((entry) => entry.tieOrderStable)).toBe(true)
  })

  it('keeps post-hoc labels out of signal score and ranking features', () => {
    const rows = [signalRow(1, 1, 1), signalRow(2, 2, 2)]
    const rankings = rankStormStructuralAdmissionSignals(rows)
    const labelsA = [
      label(1, true, 9, 9),
      label(2, false, 0, 0, true),
    ]
    const labelsB = [
      label(1, true, 0, 0, true),
      label(2, false, 9, 9),
    ]

    const summaryA = computeStormStructuralAdmissionSignalSummary(
      rankings,
      labelsA,
      { rmseDb: 9, maxAbsDb: 9, filterCount: 1, cancellationScore: 0 },
    )
    const summaryB = computeStormStructuralAdmissionSignalSummary(
      rankings,
      labelsB,
      { rmseDb: 9, maxAbsDb: 9, filterCount: 1, cancellationScore: 0 },
    )

    expect(summaryA.signals.map((entry) => entry.ranking)).toEqual(
      summaryB.signals.map((entry) => entry.ranking),
    )
    expect(summaryA.oracle.bestFullCanonicalProposalRank).not.toBe(
      summaryB.oracle.bestFullCanonicalProposalRank,
    )
  })

  it('stops partial probes at exactly the requested 2 and 6 coordinate trials', () => {
    const filters = [
      { id: 'seed', enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 2, q: 1 },
    ]

    expect(runPartialStormStructuralAdmissionProbe(syntheticProblem, filters, 2).coordinateTrials)
      .toBe(2)
    expect(runPartialStormStructuralAdmissionProbe(syntheticProblem, filters, 6).coordinateTrials)
      .toBe(6)
  })

  it('reproduces the exact frozen 21-proposal lexical census and is observational', () => {
    const audit = runStormStructuralAdmissionSignalAudit()

    expect(audit.frozenInputs).toMatchObject({
      proposalCount: 21,
      lexicalOrderReproduced: true,
      semanticSetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(audit.summary.signals.find((entry) => entry.signalId === 'lexical')?.ranking).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    )
    expect(audit.summary.oracle.bestFullCanonicalProposalRank).toBe(9)
    expect(audit.summary.signals).toHaveLength(5)
    expect(audit.summary.signals.find((entry) => entry.signalId === 'partial-refinement-2')?.cost.coordinateTrialsPerProbe)
      .toBe(2)
    expect(audit.summary.signals.find((entry) => entry.signalId === 'partial-refinement-6')?.cost.coordinateTrialsPerProbe)
      .toBe(6)
    expect(audit.proposals.every((proposal) => proposal.signalRow.partialRefinement[2].coordinateTrials === 2)).toBe(true)
    expect(audit.proposals.every((proposal) => proposal.signalRow.partialRefinement[6].coordinateTrials === 6)).toBe(true)
    expect(audit.proposals.every((proposal) => proposal.fullCanonicalLabel.coordinateTrialCount === 24)).toBe(true)

    const input = {
      problem: syntheticProblem,
      seed: 0,
      evaluationBudget: 8,
      referenceSnapshotSha256: 'c'.repeat(64),
      referenceFrontier: [{ candidateId: 'reference', rmseDb: 0, maxAbsDb: 0, filterCount: 1 }],
      config: { beamWidth: 1, proposalsPerParent: 3, localPolishEvaluations: 0, maxFilters: 4 },
      evaluate: (candidate: { candidateId: string; filters: Filter[] }) => ({
        protocolVersion: 1 as const,
        candidateId: candidate.candidateId,
        valid: true,
        rejectionReason: null,
        continuous: { rmseDb: candidate.filters.length, maxAbsDb: candidate.filters.length, bandRmseDb: {} },
        deliverable: {
          filters: candidate.filters.map((filter) => ({ ...filter })),
          rmseDb: candidate.filters.length,
          maxAbsDb: candidate.filters.length,
          bandRmseDb: {},
          cancellationTotalScore: 0,
        },
      }),
    }
    const before = runStructuralBeam(input)
    runStormStructuralAdmissionSignalAudit()
    const after = runStructuralBeam(input)
    expect(after).toEqual(before)
  }, 30_000)

  it('classifies a cheap-signal top-four hit separately from partial-refinement evidence', () => {
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: true,
      cheapSignalRecallImprovement: true,
      partialRefinementTop4: false,
      partialRefinementRecallImprovement: false,
      rankingAgreement: true,
    })).toBe('cheap-signal-supported')
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: false,
      cheapSignalRecallImprovement: false,
      partialRefinementTop4: true,
      partialRefinementRecallImprovement: true,
      rankingAgreement: true,
    })).toBe('partial-refinement-needed')
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: false,
      cheapSignalRecallImprovement: false,
      partialRefinementTop4: false,
      partialRefinementRecallImprovement: false,
      rankingAgreement: true,
    })).toBe('cheap-signal-not-supported')
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: true,
      cheapSignalRecallImprovement: false,
      partialRefinementTop4: false,
      partialRefinementRecallImprovement: false,
      rankingAgreement: false,
    })).toBe('mixed-unresolved')
  })

  it('does not classify a top-four hit as supported without material recall improvement', () => {
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: true,
      cheapSignalRecallImprovement: false,
      partialRefinementTop4: false,
      partialRefinementRecallImprovement: false,
      rankingAgreement: true,
    })).toBe('cheap-signal-not-supported')
    expect(classifyStormStructuralAdmissionSignalAudit({
      cheapSignalTop4: false,
      cheapSignalRecallImprovement: false,
      partialRefinementTop4: true,
      partialRefinementRecallImprovement: false,
      rankingAgreement: true,
    })).toBe('cheap-signal-not-supported')
  })
})
