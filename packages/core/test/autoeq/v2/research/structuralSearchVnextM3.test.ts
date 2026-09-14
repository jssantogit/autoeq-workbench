import { describe, expect, it } from 'vitest'

import type {
  StructuralSearchInput,
  StructuralSearchResult,
} from '../../../../src/index.js'
import type { StructuralSearchM3Signals } from '../../../../src/autoeq/v2/structuralSearch.js'

describe('structural-search M3 stagnation census', () => {
  it('aggregates baseline-only S0-S4 observations and retrospective progress', async () => {
    const module = await import('../../../../benchmarks/research/structuralSearchVnextM3.js')
    expect(module.M3_STRUCTURAL_CEILING).toBe(43)
    expect(module.M3_EFFORT_LEVEL).toBe(6)
    expect(module.M3_TRAJECTORY_SECONDS).toBe(30)
    expect(module.M3_REPEAT_COUNT).toBe(3)

    const runBaseline = (input: StructuralSearchInput): StructuralSearchResult => {
      const emit = (generation: number, referenceSignature: string, signals: StructuralSearchM3Signals) => {
        input.onBaselineTelemetry?.({
          type: 'ordinary-baseline-generation',
          generation,
          referenceRmseDb: generation === 0 ? 1 : 0.8,
          referenceMaxAbsDb: generation === 0 ? 2 : 1.5,
          referenceViolation: generation === 0 ? 4 : 3,
          deliveredFilterCount: generation + 1,
          referenceFilterCount: generation + 1,
          referenceSignature,
          retainedBeamSignatures: [referenceSignature],
          retainedBeamSignatureCount: 1,
          generatedStructuralSignatures: [referenceSignature],
          admittedStructuralSignatures: [referenceSignature],
          survivingStructuralSignatures: [referenceSignature],
          referenceSignatureChanged: generation > 0,
          retainedBeamSignatureSetChanged: generation > 0,
          newlyGeneratedStructuralSignatureSurvived: generation > 0,
          numericReferenceImprovement: generation > 0,
          unresolved: true,
          signals,
          frontierMaxFilterCount: generation + 1,
          capacityPressure: {
            additiveProposalsGenerated: 1,
            additiveMutationGatesBlockedByCapacity: 0,
            rescueAddGatesBlockedByCapacity: 0,
            pairAddGatesBlockedByCapacity: 0,
          },
          frontierUtilization: {
            parentStatesObserved: 1,
            parentFilterCountMax: generation + 1,
            generatedCandidateFilterCountMax: generation + 1,
            admittedCandidateFilterCountMax: generation + 1,
            polishedCandidateFilterCountMax: generation + 1,
            parentsAtCapacity: 0,
            generatedCandidatesAtCapacity: 0,
            admittedCandidatesAtCapacity: 0,
            polishedCandidatesAtCapacity: 0,
            candidatesWithinOneSlotOfCapacity: 0,
          },
          ordinaryWorkCounters: {
            structuralSearchInvocations: 0,
            beamGenerations: 1,
            proposalsGenerated: 1,
            proposalsAdmitted: 1,
            proposalsPolished: 1,
            duplicateStates: 0,
            rescueAttempts: 0,
            pairAddAttempts: 0,
            capSwapAttempts: 0,
            reseedAttempts: 0,
          },
        })
      }
      emit(0, 'PK:0', { S0: true, S1: true, S2: true, S3: true, S4: true })
      emit(1, 'PK:1', { S0: false, S1: false, S2: false, S3: false, S4: false })
      return { filters: [], rmseDb: 0.8, maxAbsDb: 1.5 }
    }

    const result = module.runStructuralSearchM3Census({
      includeReal: false,
      includeSynthetic: true,
      syntheticCaseIds: ['synthetic-e-high-q-valid'],
      runBaseline,
      writeArtifacts: false,
    })

    expect(result.runs).toHaveLength(9)
    expect(result.aggregate.real.trajectoryCount).toBe(0)
    expect(result.aggregate.synthetic.trajectoryCount).toBe(9)
    expect(result.aggregate.synthetic.signals.S0.occurrenceCount).toBe(9)
    expect(result.aggregate.synthetic.signals.S0.trajectoriesWithOccurrence).toBe(9)
    expect(result.aggregate.synthetic.signals.S0.persistence.median).toBe(1)
    expect(result.aggregate.synthetic.signals.S0.persistence.max).toBe(1)
    expect(result.aggregate.synthetic.signals.S0.futureProgress.referenceSignatureLaterChanges).toBe(9)
    expect(result.aggregate.synthetic.signals.S0.futureProgress.survivingNovelStructuralSignatureLater).toBe(9)
    expect(result.aggregate.synthetic.signals.S0.futureProgress.finalRmseImprovesFurther).toBe(9)
    expect(result.conclusion).toMatch(/STRUCTURAL_PLATEAU_/)
  }, 30_000)
})
