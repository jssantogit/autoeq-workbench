import { describe, expect, it } from 'vitest'

import {
  COST_AWARE_ARM_ORDER,
  COST_AWARE_DEADLINE_MS,
  COST_AWARE_EVALUATION_BUDGET,
  COST_AWARE_REPETITIONS,
  classifyStormStructuralAdmissionCostAwareOutcome,
  reproduceStormStructuralAdmissionCostAwareFidelity,
  stateAtElapsed,
  type StormStructuralAdmissionCostAwareClassificationInput,
} from '../../../../benchmarks/research/stormStructuralAdmissionCostAware.js'

describe('Storm structural admission cost-aware experiment', () => {
  it('derives both admission signals at runtime with the frozen candidate top-4', () => {
    const fidelity = reproduceStormStructuralAdmissionCostAwareFidelity()

    expect(fidelity.controlTop4).toEqual([1, 2, 3, 4])
    expect(fidelity.candidateTop4).toEqual([3, 1, 10, 9])
    expect(fidelity.candidatePrePolishCanonicalEvaluations).toBe(21)
    expect(fidelity.partialRefinementCoordinateTrials).toBe(0)
    expect(fidelity.oracleInputsUsed).toEqual([])
  })

  it('keeps the paired timing protocol fixed before observing outcomes', () => {
    expect(COST_AWARE_REPETITIONS).toBe(4)
    expect(COST_AWARE_ARM_ORDER).toEqual([
      'control',
      'cheap-admission',
      'cheap-admission',
      'control',
      'control',
      'cheap-admission',
      'cheap-admission',
      'control',
    ])
    expect(COST_AWARE_DEADLINE_MS).toBe(60_000)
    expect(COST_AWARE_EVALUATION_BUDGET).toBeGreaterThan(9)
  })

  it('does not invent quality before an observed trajectory state', () => {
    const trajectory = [
      { elapsedMs: 1_000, bestRegret: 2 },
      { elapsedMs: 20_000, bestRegret: 1 },
    ]

    expect(stateAtElapsed(trajectory, 500)).toBeNull()
    expect(stateAtElapsed(trajectory, 5_000)).toEqual(trajectory[0])
    expect(stateAtElapsed(trajectory, 30_000)).toEqual(trajectory[1])
  })

  it('classifies fidelity or timing-contract failures as inconclusive', () => {
    const invalid: StormStructuralAdmissionCostAwareClassificationInput = {
      fidelityValid: false,
      timingProtocolValid: true,
      budgetSufficient: true,
      cherryPickingAbsent: true,
      candidateBestRegret: 1,
      controlBestRegret: 2,
      candidateBestRmseDb: 1,
      controlBestRmseDb: 2,
      candidateBestMaxAbsDb: 1,
      controlBestMaxAbsDb: 2,
      candidatePrefixAdvantage: true,
      laterHorizonAdvantage: true,
      shortRunNaturalCompletion: false,
    }

    expect(classifyStormStructuralAdmissionCostAwareOutcome(invalid)).toBe('timing-inconclusive')
  })

  it('supports a naturally short run when terminal quality and prefix timing are real', () => {
    const shortRun: StormStructuralAdmissionCostAwareClassificationInput = {
      fidelityValid: true,
      timingProtocolValid: true,
      budgetSufficient: true,
      cherryPickingAbsent: true,
      candidateBestRegret: 1,
      controlBestRegret: 2,
      candidateBestRmseDb: 1,
      controlBestRmseDb: 2,
      candidateBestMaxAbsDb: 1,
      controlBestMaxAbsDb: 2,
      candidatePrefixAdvantage: true,
      laterHorizonAdvantage: false,
      shortRunNaturalCompletion: true,
    }

    expect(classifyStormStructuralAdmissionCostAwareOutcome(shortRun)).toBe('cost-aware-admission-supported')
  })
})
