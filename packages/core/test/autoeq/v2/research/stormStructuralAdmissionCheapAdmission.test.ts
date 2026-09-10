import { describe, expect, it } from 'vitest'

import {
  classifyStormStructuralAdmissionCheapOutcome,
  generateStormStructuralAdmissionCheapAdmission,
  rankStormStructuralAdmissionPrePolish,
  runStormStructuralAdmissionCheapAdmission,
  type StormStructuralAdmissionCheapClassificationInput,
} from '../../../../benchmarks/research/stormStructuralAdmissionCheapAdmission.js'

describe('Storm structural admission cheap-admission experiment', () => {
  it('reproduces lexical control and runtime pre-polish frozen-selector top-4', () => {
    const artifact = runStormStructuralAdmissionCheapAdmission()

    expect(artifact.arms.control.admission.initialRanks).toEqual([1, 2, 3, 4])
    expect(artifact.arms.cheapAdmission.admission.initialRanks).toEqual([3, 1, 10, 9])
    expect(artifact.signal.top4).toEqual([3, 1, 10, 9])
    expect(artifact.signal.canonicalPrePolishEvaluations).toBe(21)
    expect(artifact.signal.partialRefinementCoordinateTrials).toBe(0)
  })

  it('keeps the candidate ranker outcome-blind and breaks ties by lexical rank', () => {
    const ranked = rankStormStructuralAdmissionPrePolish([
      { proposalRank: 2, rmseDb: 0.3, maxAbsDb: 0.8, filterCount: 4, cancellationScore: 0.2 },
      { proposalRank: 1, rmseDb: 0.3, maxAbsDb: 0.8, filterCount: 4, cancellationScore: 0.2 },
    ])

    expect(ranked.ranking).toEqual([1, 2])
    expect(ranked.scores).toEqual([
      { proposalRank: 1, metrics: { rmseDb: 0.3, maxAbsDb: 0.8, filterCount: 4, cancellationScore: 0.2 } },
      { proposalRank: 2, metrics: { rmseDb: 0.3, maxAbsDb: 0.8, filterCount: 4, cancellationScore: 0.2 } },
    ])
    expect(ranked).not.toHaveProperty('fullPolish')
    expect(ranked).not.toHaveProperty('oracleRank')
    expect(ranked).not.toHaveProperty('censusLabels')
  })

  it('applies the signal once at the initial parent and restores lexical admission later', () => {
    const artifact = runStormStructuralAdmissionCheapAdmission()
    const entries = artifact.arms.cheapAdmission.descendants
    const initialParentId = artifact.initialParentId
    const initial = entries.filter((entry) => entry.parentCandidateId === initialParentId)
    const later = entries.filter((entry) => entry.parentCandidateId !== initialParentId)

    expect(artifact.arms.cheapAdmission.admission.interventionCount).toBe(1)
    expect(initial.some((entry) => entry.proposalRank === 10)).toBe(true)
    expect(later.every((entry) => (entry.proposalRank ?? 0) <= 4)).toBe(true)
    expect(artifact.arms.cheapAdmission.admission.partialRefinementCoordinateTrials).toBe(0)
  })

  it('charges equal downstream work and reports admission overhead separately', () => {
    const artifact = runStormStructuralAdmissionCheapAdmission()

    expect(artifact.accounting.equalDescendantWork).toBe(true)
    expect(artifact.arms.control.accounting.descendantEvaluations).toBe(8)
    expect(artifact.arms.cheapAdmission.accounting.descendantEvaluations).toBe(8)
    expect(artifact.arms.control.accounting.canonicalPrePolishEvaluations).toBe(0)
    expect(artifact.arms.cheapAdmission.accounting.canonicalPrePolishEvaluations).toBe(21)
    expect(artifact.arms.cheapAdmission.accounting.fullPolishCoordinateTrials).toBe(8 * 24)
    expect(artifact.arms.control.accounting.fullPolishCoordinateTrials).toBe(8 * 24)
  })

  it('classifies strict contract failures as inconclusive', () => {
    const invalid: StormStructuralAdmissionCheapClassificationInput = {
      signalFidelity: false,
      controlFidelity: true,
      equalDescendantWork: true,
      isolatedInitialParentOnly: true,
      oracleInputsAbsent: true,
      controlRegret: 2,
      cheapRegret: 1,
      controlFinalRmseDb: 2,
      controlFinalMaxAbsDb: 2,
      cheapFinalRmseDb: 1,
      cheapFinalMaxAbsDb: 1,
      cheapPrefixAdvantage: true,
    }

    expect(classifyStormStructuralAdmissionCheapOutcome(invalid)).toBe('inconclusive')
  })

  it('is deterministic and generation writes a separate artifact and report', () => {
    const first = runStormStructuralAdmissionCheapAdmission()
    expect(first).toEqual(runStormStructuralAdmissionCheapAdmission())

    const generated = generateStormStructuralAdmissionCheapAdmission()
    expect(generated.artifactPath).toContain('storm-cheap-admission-causal-20260910/sparse-0010')
    expect(generated.reportPath).toContain('2026-09-10-storm-cheap-admission-causal-results.md')
    expect(generated.artifactSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(generated.artifact.classification).toBe(first.classification)
  })
})
