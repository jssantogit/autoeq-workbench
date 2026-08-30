import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  createEvaluationGrid,
  runStandardAutoEqV2,
  type Curve,
  type StandardAutoEqInputV2,
  type V2CandidateBoundaryMode,
} from '../../../src/index.js'

function input(): StandardAutoEqInputV2 {
  const frequencies = createEvaluationGrid()
  const curve = (kind: Curve['kind']): Curve => ({
    id: kind,
    name: `Synthetic ${kind}`,
    kind,
    rawPoints: frequencies.map((frequencyHz) => ({ frequencyHz, db: 0 })),
    metadata: { synthetic: true },
  })
  return {
    source: curve('fr'),
    target: curve('target'),
    normalization: { mode: 'hz', frequencyHz: 500, levelDb: 0 },
    settings: { ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: 5 },
  }
}

describe('runStandardAutoEqV2', () => {
  it('returns a deterministic schema-3 quantized deliverable', () => {
    const runInput = input()
    const runtime = { nowMs: () => 0 }
    const first = runStandardAutoEqV2(runInput, runtime)
    const second = runStandardAutoEqV2(runInput, runtime)

    expect(second).toEqual(first)
    expect(first.manifest.schemaVersion).toBe(3)
    expect(first.manifest.algorithmVersion).toBe('standard-v2')
    expect(first.filters.length).toBeLessThanOrEqual(runInput.settings.maxFilters)
    expect(first.manifest.targetAchieved).toBe(
      first.metrics.rmseDb <= 0.25 && first.metrics.maxAbsDb <= 0.75,
    )
    expect(['target-reached', 'converged', 'time-limit'])
      .toContain(first.manifest.terminationReason)
  })

  it('returns the zero-filter checkpoint as a normal controlled timeout', () => {
    let calls = 0
    const result = runStandardAutoEqV2(input(), {
      nowMs: () => calls++ === 0 ? 0 : 5_000,
    })

    expect(result.filters).toEqual([])
    expect(result.manifest.terminationReason).toBe('time-limit')
  })

  it('attempts coherent geometries before the mixed fallback under one live deadline', () => {
    const runInput = input()
    runInput.source.rawPoints = runInput.source.rawPoints.map((point) => ({
      ...point,
      db: point.frequencyHz >= 1_000 ? -2 : 0,
    }))
    runInput.settings = { ...runInput.settings, maxFilters: 0 }
    const attempts: V2CandidateBoundaryMode[] = []

    const result = runStandardAutoEqV2(runInput, {
      nowMs: () => 0,
      onBoundaryModeAttempt: (mode) => attempts.push(mode),
    })

    expect(result.manifest.terminationReason).toBe('converged')
    expect(attempts).toEqual(['half-height', 'sign-crossing', 'mixed'])
  })

  it('starts no search attempt when the initial complete checkpoint reaches the target', () => {
    const attempts: V2CandidateBoundaryMode[] = []

    const result = runStandardAutoEqV2(input(), {
      nowMs: () => 0,
      onBoundaryModeAttempt: (mode) => attempts.push(mode),
    })

    expect(result.manifest.targetAchieved).toBe(true)
    expect(attempts).toEqual([])
  })

  it('starts no later geometry after the shared deadline expires in the first attempt', () => {
    const runInput = input()
    runInput.source.rawPoints = runInput.source.rawPoints.map((point) => ({
      ...point,
      db: point.frequencyHz >= 1_000 ? -2 : 0,
    }))
    const attempts: V2CandidateBoundaryMode[] = []

    const result = runStandardAutoEqV2(runInput, {
      nowMs: () => attempts.length === 0 ? 0 : 5_000,
      onBoundaryModeAttempt: (mode) => attempts.push(mode),
    })

    expect(result.manifest.terminationReason).toBe('time-limit')
    expect(attempts).toEqual(['half-height'])
  })
})
