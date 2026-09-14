import { describe, expect, it } from 'vitest'

import type {
  StructuralSearchInput,
  StructuralSearchResult,
} from '../../../../src/index.js'

import {
  deriveM3bUniqueStructuralEvents,
  runM3bDeterministicTelemetryFidelity,
  runStructuralSearchM3b,
} from '../../../../benchmarks/research/structuralSearchVnextM3b.js'

describe('structural-search M3b telemetry fidelity', () => {
  it('proves telemetry-off and telemetry-on are equivalent at a deterministic generation boundary', () => {
    const evidence = runM3bDeterministicTelemetryFidelity({ maxGenerations: 3 })

    expect(evidence.equivalent).toBe(true)
    expect(evidence.telemetryOff.completedGenerations).toBe(
      evidence.telemetryOn.completedGenerations,
    )
    expect(evidence.telemetryOff.generations).toEqual(evidence.telemetryOn.generations)
    expect(evidence.telemetryOff.retainedBeamSignatures).toEqual(
      evidence.telemetryOn.retainedBeamSignatures,
    )
    expect(evidence.telemetryOff.result).toEqual(evidence.telemetryOn.result)
    expect(evidence.telemetryOff.work).toEqual(evidence.telemetryOn.work)
    expect(evidence.telemetryOff.naturalStopGeneration).toBe(
      evidence.telemetryOn.naturalStopGeneration,
    )
  })

  it('normalizes overlapping signals into one exact generation event category', () => {
    const rows = [{
      caseId: 'fixture',
      repeatIndex: 0,
      final: {
        rmseDb: 0.5,
        maxAbsDb: 0.8,
        deliveredFilterCount: 3,
      },
      generations: [
        {
          generation: 0,
          elapsedMs: 10,
          signals: { S0: false, S1: true, S2: false, S3: true, S4: true },
          numericReferenceImprovement: true,
          referenceSignature: 'PK:0',
          newlyGeneratedStructuralSignatureSurvived: false,
          referenceRmseDb: 1,
          referenceMaxAbsDb: 2,
          deliveredFilterCount: 2,
        },
        {
          generation: 1,
          elapsedMs: 20,
          signals: { S0: false, S1: false, S2: false, S3: false, S4: false },
          numericReferenceImprovement: true,
          referenceSignature: 'PK:1',
          newlyGeneratedStructuralSignatureSurvived: true,
          referenceRmseDb: 0.5,
          referenceMaxAbsDb: 0.8,
          deliveredFilterCount: 3,
        },
      ],
    }]

    const normalized = deriveM3bUniqueStructuralEvents(rows)
    expect(normalized.completedGenerationCount).toBe(2)
    expect(normalized.events).toHaveLength(1)
    expect(normalized.exactSignalMaskCounts).toEqual({ 'S1+S3+S4': 1 })
    expect(normalized.events[0]).toMatchObject({
      caseId: 'fixture',
      generation: 0,
      exactSignalMask: 'S1+S3+S4',
      anyStructuralPlateau: true,
      numericImprovement: true,
      referenceTopologyLaterChanged: true,
      structuralNoveltyLaterSurvived: true,
      rmseLaterImproved: true,
      maxAbsLaterImproved: true,
      finalDeliveredFilterCountIncreased: true,
    })
    expect(normalized.bySignal.S3.only).toBe(0)
    expect(normalized.bySignal.S3.combined).toBe(1)
  })

  it('runs only six real cases in alternating paired wall-clock mode', () => {
    const calls: Array<{ mode: string; input: StructuralSearchInput }> = []
    const fakeRunner = (input: StructuralSearchInput): StructuralSearchResult => {
      calls.push({ mode: input.onBaselineTelemetry === undefined ? 'off' : 'on', input })
      input.onTrace?.({
        type: 'beam-generation',
        generation: 0,
        generatedProposals: 2,
        admittedProposals: 1,
        polishedProposals: 1,
        nextStates: 0,
        filterCount: 0,
        rmseDb: 1,
        maxAbsDb: 2,
        violation: 4,
      })
      return { filters: [], rmseDb: 1, maxAbsDb: 2 }
    }
    const result = runStructuralSearchM3b({
      runBaseline: fakeRunner,
      nowMs: () => 0,
      deterministicMaxGenerations: 1,
      writeArtifacts: false,
    })

    expect(result.pairs).toHaveLength(18)
    expect(calls).toHaveLength(36)
    expect(result.wallClock.executionOrderCounts).toEqual({ 'off-first': 9, 'on-first': 9 })
    expect(result.pairs.every((pair) => pair.executionOrder.includes('off') && pair.executionOrder.includes('on'))).toBe(true)
    expect((result.deterministicFidelity as unknown as { config: unknown }).config).toEqual(
      result.resourceEnvelope.config,
    )
  })
})
