import { describe, expect, it } from 'vitest'

import type {
  StructuralSearchInput,
  StructuralSearchResult,
  StructuralSearchTraceEvent,
} from '../../../../src/index.js'

function traceEvent(
  type: StructuralSearchTraceEvent['type'],
  extra: Partial<StructuralSearchTraceEvent> = {},
): StructuralSearchTraceEvent {
  return {
    type,
    filterCount: 0,
    rmseDb: 1,
    maxAbsDb: 2,
    violation: 4,
    ...extra,
  }
}

describe('structural-search VNext M2 campaign runner', () => {
  it('runs one continuing trajectory per engine/repeat and materializes 5/15/30 checkpoints', async () => {
    const { runStructuralSearchVnextM2 } = await import('../../../../benchmarks/research/structuralSearchVnextM2.js')
    let clockMs = 0
    const calls: Array<{ engine: string; input: StructuralSearchInput }> = []
    const makeRunner = (engine: string) => (input: StructuralSearchInput): StructuralSearchResult => {
      calls.push({ engine, input })
      const start = clockMs
      input.onTrace?.(traceEvent('start', { phase: 'beam', status: 'start' }))
      clockMs = start + 6_000
      input.onTrace?.(traceEvent('beam-generation', {
        phase: 'beam', generation: 0, nextStates: 1,
        generatedProposals: 1, admittedProposals: 1, polishedProposals: 1,
        ordinaryBeamGenerations: engine === 'm2' ? 1 : undefined,
        ordinaryProposalsGenerated: engine === 'm2' ? 1 : undefined,
      }))
      clockMs = start + 16_000
      input.onTrace?.(traceEvent('phase', {
        phase: engine === 'm2' ? 'm2-challenger' : 'rescue', status: 'end',
        stallEvents: engine === 'm2' ? 1 : undefined,
        challengerCandidatesConstructed: engine === 'm2' ? 1 : undefined,
        challengerPolishAttempts: engine === 'm2' ? 1 : undefined,
        challengerAcceptedIntoBeam: engine === 'm2' ? 1 : undefined,
        challengerIncumbentImprovements: engine === 'm2' ? 1 : undefined,
        attempts: 1,
      }))
      clockMs = start + 31_000
      input.onTrace?.(traceEvent('end', {
        filterCount: 1, rmseDb: 0.5, maxAbsDb: 1, violation: 2,
        finalIncumbentPhase: engine === 'm2' ? 'm2-challenger' : undefined,
      }))
      return { filters: [], rmseDb: 0.5, maxAbsDb: 1 }
    }

    const result = runStructuralSearchVnextM2({
      includeReal: true,
      includeSynthetic: false,
      realCaseIds: ['titan-to-rsv'],
      includeM1Control: false,
      runBaseline: makeRunner('baseline'),
      runM2: makeRunner('m2'),
      nowMs: () => clockMs,
      writeArtifacts: false,
    })

    expect(calls).toHaveLength(6)
    expect(result.runs).toHaveLength(18)
    expect(result.runs.map((row) => row.checkpointSeconds)).toEqual(
      expect.arrayContaining([5, 15, 30]),
    )
    expect(new Set(result.runs.map((row) => row.checkpointSeconds))).toEqual(new Set([5, 15, 30]))
    expect(result.runs.filter((row) => row.engine === 'baseline')).toHaveLength(9)
    expect(result.runs.filter((row) => row.engine === 'm2')).toHaveLength(9)
    expect(result.runs.filter((row) => row.engine === 'm2' && row.checkpointSeconds === 30)[0]?.experimentalTelemetry.challengerAcceptedIntoBeam).toBe(1)
    expect(result.runs.filter((row) => row.engine === 'm2' && row.checkpointSeconds === 30)[0]?.observedElapsedMs).toBe(31_000)
    expect(calls.every(({ input }) => input.config.maxFilters === 43)).toBe(true)
    expect(calls.every(({ input }) => input.config.beamWidth === calls[0]!.input.config.beamWidth)).toBe(true)
    expect(calls.every(({ input }) => input.config.proposalsPerParent === calls[0]!.input.config.proposalsPerParent)).toBe(true)
  })

  it('keeps the M2 runner explicit and does not expose checkpoint tuning controls', async () => {
    const module = await import('../../../../benchmarks/research/structuralSearchVnextM2.js')
    expect(typeof module.runStructuralSearchVnextM2).toBe('function')
    expect(module.M2_STRUCTURAL_CEILING).toBe(43)
    expect(module.M2_EFFORT_LEVEL).toBe(6)
    expect(module.M2_CHECKPOINT_SECONDS).toEqual([5, 15, 30])
    expect(module.M2_REPEAT_COUNT).toBe(3)
  })
})
