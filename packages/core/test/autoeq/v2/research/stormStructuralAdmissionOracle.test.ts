import { describe, expect, it } from 'vitest'

import {
  createStormStructuralAdmissionOverride,
  runStormStructuralAdmissionOracle,
  classifyStormAdmissionOracleOutcome,
  semanticStructuralProposalKey,
  validateFrozenStormRescueProposal,
  type FrozenStormRescueProposal,
} from '../../../../benchmarks/research/stormStructuralAdmissionOracle.js'
import type { EnumeratedStormStructuralProposal } from '../../../../benchmarks/research/stormStructuralProposalCensus.js'

const rescue: FrozenStormRescueProposal = {
  parentId: 'parent-id',
  primarySeedId: 'primary-seed',
  proposalOrdinal: 5,
  lexicalAdmissionRank: 9,
  mutation: 'remove',
  filtersBeforePolish: [
    { id: 'kept', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 1, q: 1 },
  ],
}

const enumerated: EnumeratedStormStructuralProposal[] = [
  ...Array.from({ length: 8 }, (_, index) => ({
    mutation: 'remove' as const,
    filters: [],
    originalOrdinal: index + 1,
    rank: index + 1,
    admittedByCurrentTop4: index < 4,
  })),
  {
    mutation: rescue.mutation,
    filters: rescue.filtersBeforePolish,
    originalOrdinal: rescue.proposalOrdinal,
    rank: rescue.lexicalAdmissionRank,
    admittedByCurrentTop4: false,
  },
]

describe('Storm structural admission oracle', () => {
  it('accepts the frozen rescue only when provenance and semantic structure match', () => {
    const matched = validateFrozenStormRescueProposal({
      parentId: 'parent-id',
      primarySeedId: 'primary-seed',
      proposals: enumerated,
      rescue,
    })

    expect(matched.rank).toBe(9)
    expect(semanticStructuralProposalKey(matched)).toBe(
      semanticStructuralProposalKey({ mutation: rescue.mutation, filters: rescue.filtersBeforePolish }),
    )
  })

  it('rejects tampered or missing frozen rescue provenance/structure', () => {
    expect(() => validateFrozenStormRescueProposal({
      parentId: 'wrong-parent',
      primarySeedId: 'primary-seed',
      proposals: enumerated,
      rescue,
    })).toThrow(/parent/i)

    expect(() => validateFrozenStormRescueProposal({
      parentId: 'parent-id',
      primarySeedId: 'primary-seed',
      proposals: enumerated.slice(0, 8),
      rescue,
    })).toThrow(/semantic|rank|proposal/i)

    expect(() => validateFrozenStormRescueProposal({
      parentId: 'parent-id',
      primarySeedId: 'primary-seed',
      proposals: enumerated.map((proposal, index) => index === 8
        ? { ...proposal, filters: [{ ...rescue.filtersBeforePolish[0]!, gainDb: 2 }] }
        : proposal),
      rescue,
    })).toThrow(/semantic|structure|proposal/i)
  })

  it('records one initial-parent rescue and returns to normal admission afterward', () => {
    const events: Array<{ parentCandidateId: string; layerIndex: number; intervention: string }> = []
    const override = createStormStructuralAdmissionOverride({
      parentCandidateId: 'parent-candidate',
      rescueProposal: enumerated[8]!,
      onEvent: (event) => events.push({
        parentCandidateId: event.parentCandidateId,
        layerIndex: event.layerIndex,
        intervention: event.intervention,
      }),
    })
    const context = {
      layerIndex: 1,
      parentIndex: 0,
      parent: { candidate: { candidateId: 'parent-candidate' } } as never,
      orderedProposals: enumerated.map(({ mutation, filters }) => ({ mutation, filters })),
      admittedProposals: enumerated.slice(0, 4).map(({ mutation, filters }) => ({ mutation, filters })),
    }
    const decision = override.apply(context)
    expect(decision?.proposals).toEqual([
      ...enumerated.slice(0, 3).map(({ mutation, filters }) => ({ mutation, filters })),
      { mutation: enumerated[8]!.mutation, filters: enumerated[8]!.filters },
    ])
    expect(events).toHaveLength(1)

    expect(override.apply({ ...context, layerIndex: 2 })).toBeNull()
    expect(override.apply(context)).toBeNull()
    expect(events).toHaveLength(1)
  })

  it('runs equal-work control and rescue arms with valid frozen replay fidelity', () => {
    const artifact = runStormStructuralAdmissionOracle()

    expect(artifact.configuration).toMatchObject({
      maxFilters: 10,
      beamWidth: 2,
      proposalsPerParent: 4,
      localPolishEvaluations: 24,
      descendantEvaluationBudget: 8,
      evaluationBudget: 9,
      seedValidationSeparate: true,
      oracleEvaluationsCharged: false,
    })
    expect(artifact.arms.control.accounting.descendantEvaluations).toBe(8)
    expect(artifact.arms.rescue.accounting.descendantEvaluations).toBe(8)
    expect(artifact.accounting.equalDescendantWork).toBe(true)
    expect(artifact.controlFidelity.valid).toBe(true)
    expect(artifact.rescue.intervention.appliedExactlyOnce).toBe(true)
    expect(artifact.rescue.intervention.lexicalAdmissionRank).toBe(9)
    expect(artifact.rescue.intervention.normalAdmittedProposalCount).toBe(4)
    expect(artifact.rescue.intervention.effectiveInitialAdmission).toHaveLength(4)
    expect(artifact.rescue.intervention.effectiveInitialAdmission.slice(0, 3))
      .toEqual(artifact.arms.control.admission.normalTop4.slice(0, 3))
    expect(artifact.arms.control.descendants).toHaveLength(8)
    expect(artifact.arms.rescue.descendants).toHaveLength(8)
    expect(artifact.classification).toMatch(
      /^(admission-causal-impact-supported|admission-transient-impact|admission-static-only-at-this-budget|inconclusive)$/,
    )
  })

  it('is deterministic for the same frozen input and configuration', () => {
    expect(runStormStructuralAdmissionOracle()).toEqual(runStormStructuralAdmissionOracle())
  })

  it('classifies unequal descendant work as inconclusive', () => {
    expect(classifyStormAdmissionOracleOutcome({
      fidelityValid: true,
      controlDescendantEvaluations: 8,
      rescueDescendantEvaluations: 7,
      controlRegret: 1,
      rescueRegret: 0,
      controlFinalRmseDb: 1,
      controlFinalMaxAbsDb: 1,
      rescueFinalRmseDb: 0,
      rescueFinalMaxAbsDb: 0,
      rescuePrefixAdvantage: true,
    })).toBe('inconclusive')
  })
})
