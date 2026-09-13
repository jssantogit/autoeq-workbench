import { describe, expect, it } from 'vitest'

import {
  naturalStructuralDemandCaptureReasons,
  type NaturalStructuralDemandCaptureSnapshot,
} from '../../../../benchmarks/research/decisionOracle.js'
import {
  classifyCapacityOnlySlotUse,
  classifyNaturalStructuralDemand,
  NATURAL_STRUCTURAL_DEMAND_ENVELOPES,
  type CapacityOnlySlotUseObservation,
} from '../../../../benchmarks/research/naturalStructuralDemand.js'

function captureSnapshot(
  overrides: Partial<NaturalStructuralDemandCaptureSnapshot> = {},
): NaturalStructuralDemandCaptureSnapshot {
  return {
    elapsedMs: 0,
    envelopeMs: 1_000,
    stageIndex: 0,
    currentCapacity: 10,
    maximumCapacity: 17,
    incumbentFilterCount: 0,
    frontierGeneratedFilterCountMax: 0,
    capacityPressure: {
      additiveProposalsGenerated: 0,
      additiveMutationGatesBlockedByCapacity: 0,
      rescueAddGatesBlockedByCapacity: 0,
      pairAddGatesBlockedByCapacity: 0,
    },
    ...overrides,
  }
}

describe('natural structural-demand capture protocol', () => {
  it('uses exactly two immutable predeclared envelopes and fixed quanta', () => {
    expect(NATURAL_STRUCTURAL_DEMAND_ENVELOPES).toEqual([
      {
        id: 'short-reference',
        maximumCapacity: 17,
        liveBudgetMs: 1_000,
        stageQuantumMs: 250,
        armQuantumMs: 250,
        invocationsPerArm: 1,
      },
      {
        id: 'long-natural-search',
        maximumCapacity: 43,
        liveBudgetMs: 10_000,
        stageQuantumMs: 250,
        armQuantumMs: 250,
        invocationsPerArm: 1,
      },
    ])
    expect(Object.isFrozen(NATURAL_STRUCTURAL_DEMAND_ENVELOPES)).toBe(true)
  })

  it('emits each predeclared landmark once without inspecting oracle outcomes', () => {
    const captured = new Set<string>()
    const snapshot = captureSnapshot({
      elapsedMs: 800,
      stageIndex: 0,
      frontierGeneratedFilterCountMax: 10,
      capacityPressure: {
        additiveProposalsGenerated: 1,
        additiveMutationGatesBlockedByCapacity: 1,
        rescueAddGatesBlockedByCapacity: 0,
        pairAddGatesBlockedByCapacity: 0,
      },
    })
    const first = naturalStructuralDemandCaptureReasons(snapshot, captured)
    expect(first).toEqual([
      'first-post-initial',
      'first-headroom-before-legacy-expansion',
      'first-meaningful-frontier-growth',
      'first-frontier-at-ceiling',
      'first-non-zero-capacity-pressure',
      'first-newly-slot-relevant',
      'late-budget-state',
    ])
    first.forEach((reason) => captured.add(reason))

    const outcomeBearingSnapshot = {
      ...snapshot,
      finalQuality: [0, 0, 0],
      controlGain: 99,
      capacityOnlyGain: 99,
    }
    expect(naturalStructuralDemandCaptureReasons(outcomeBearingSnapshot, captured)).toEqual([])
  })

  it('captures each condition deterministically and records absence normally', () => {
    const cases: Array<[string, NaturalStructuralDemandCaptureSnapshot, string]> = [
      ['growth', captureSnapshot({ stageIndex: 1, incumbentFilterCount: 4, frontierGeneratedFilterCountMax: 5 }), 'first-meaningful-frontier-growth'],
      ['ceiling', captureSnapshot({ stageIndex: 1, currentCapacity: 8, frontierGeneratedFilterCountMax: 8 }), 'first-frontier-at-ceiling'],
      ['pressure', captureSnapshot({ stageIndex: 1, capacityPressure: { additiveProposalsGenerated: 0, additiveMutationGatesBlockedByCapacity: 0, rescueAddGatesBlockedByCapacity: 1, pairAddGatesBlockedByCapacity: 0 } }), 'first-non-zero-capacity-pressure'],
      ['new slot', captureSnapshot({ stageIndex: 1, currentCapacity: 8, maximumCapacity: 9, frontierGeneratedFilterCountMax: 8 }), 'first-newly-slot-relevant'],
      ['late', captureSnapshot({ stageIndex: 1, elapsedMs: 800, envelopeMs: 1_000 }), 'late-budget-state'],
    ]
    for (const [, snapshot, reason] of cases) {
      expect(naturalStructuralDemandCaptureReasons(snapshot, new Set([
        'first-post-initial',
        'first-headroom-before-legacy-expansion',
      ]))).toContain(reason)
    }
    expect(naturalStructuralDemandCaptureReasons(
      captureSnapshot({ stageIndex: 1, elapsedMs: 799, envelopeMs: 1_000 }),
      new Set(['first-post-initial', 'first-headroom-before-legacy-expansion']),
    )).not.toContain('late-budget-state')
  })

  it('classifies slot use from observed frontier and quality, not configured maxFilters', () => {
    const base: CapacityOnlySlotUseObservation = {
      oldCapacity: 10,
      newCapacity: 17,
      startingFilterCount: 6,
      generatedFrontierMaxFilterCount: 10,
      admittedFrontierMaxFilterCount: 10,
      polishedFrontierMaxFilterCount: 10,
      finalFilterCount: 6,
      finalQuality: [1, 1, 1],
      controlFinalQuality: [1, 1, 1],
      configuredMaxFilters: 43,
    }
    expect(classifyCapacityOnlySlotUse(base).classification).toBe('available-but-unused')
    expect(classifyCapacityOnlySlotUse({
      ...base,
      generatedFrontierMaxFilterCount: 11,
    }).classification).toBe('explored')
    expect(classifyCapacityOnlySlotUse({
      ...base,
      generatedFrontierMaxFilterCount: 11,
      admittedFrontierMaxFilterCount: 11,
      polishedFrontierMaxFilterCount: 11,
      finalFilterCount: 11,
      finalQuality: [0.5, 0.5, 0.5],
    }).classification).toBe('productively-used')
    expect(classifyCapacityOnlySlotUse({
      ...base,
      newCapacity: 10,
      generatedFrontierMaxFilterCount: 11,
      finalFilterCount: 11,
      finalQuality: [0.5, 0.5, 0.5],
    }).classification).not.toBe('productively-used')
  })

  it('classifies a full ceiling as no-headroom rather than failed intervention', () => {
    const result = classifyCapacityOnlySlotUse({
      oldCapacity: 10,
      newCapacity: 10,
      startingFilterCount: 10,
      generatedFrontierMaxFilterCount: 10,
      admittedFrontierMaxFilterCount: 10,
      polishedFrontierMaxFilterCount: 10,
      finalFilterCount: 10,
      finalQuality: [1, 1, 1],
      controlFinalQuality: [1, 1, 1],
    })
    expect(result.capacityExpanded).toBe(false)
    expect(result.classification).toBe('no-headroom')
  })

  it('labels factorized outcomes descriptively without fitting a threshold', () => {
    expect(classifyNaturalStructuralDemand({
      controlFinalQuality: [1, 1, 1],
      effortOnlyFinalQuality: [0.5, 0.5, 0.5],
      capacityOnlySlotUse: 'available-but-unused',
      capacityOnlyFinalQuality: [1, 1, 1],
    })).toBe('early-effort-dominant')
    expect(classifyNaturalStructuralDemand({
      controlFinalQuality: [1, 1, 1],
      effortOnlyFinalQuality: [1, 1, 1],
      capacityOnlySlotUse: 'productively-used',
      capacityOnlyFinalQuality: [0.5, 0.5, 0.5],
    })).toBe('structural-capacity-demand')
  })
})
