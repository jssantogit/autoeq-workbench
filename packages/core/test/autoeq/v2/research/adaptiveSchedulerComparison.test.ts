import { describe, expect, it } from 'vitest'

import {
  parseAdaptiveSchedulerComparisonArgs,
  renderAdaptiveSchedulerComparisonReport,
  runAdaptiveSchedulerComparison,
} from '../../../../benchmarks/research/adaptiveSchedulerComparison.js'
import type { ScalableSearchStage } from '../../../../src/index.js'

describe('adaptive scheduler comparison research harness', () => {
  it('parses one generic envelope and a predeclared repeat count', () => {
    expect(parseAdaptiveSchedulerComparisonArgs([
      '--case', 'titan-to-rsv',
      '--capacity', '17',
      '--budget-ms', '500',
      '--stage-ms', '50',
      '--repeats', '3',
      '--jsonl',
    ])).toEqual({
      caseIds: ['titan-to-rsv'],
      maximumCapacity: 17,
      budgetMs: 500,
      stageQuantumMs: 50,
      repeats: 3,
      outputMode: 'jsonl',
    })
  })

  it('records both policies and summarizes deterministic injected evidence', () => {
    const policies: string[] = []
    const stage: ScalableSearchStage = {
      stageIndex: 0,
      capacity: 10,
      effortLevel: 0,
      seedStrategy: 'incumbent',
      candidateViolation: 1,
      incumbentViolation: 1,
      improved: false,
      action: 'explore-current-capacity',
      schedulerPolicy: 'legacy',
      decisionReason: undefined,
      stagesSinceMeaningfulImprovement: 1,
      workSinceMeaningfulImprovement: {
        structuralSearchInvocations: 1,
        beamGenerations: 1,
        proposalsGenerated: 2,
        proposalsAdmitted: 1,
        proposalsPolished: 1,
        duplicateStates: 0,
        rescueAttempts: 0,
        pairAddAttempts: 0,
        capSwapAttempts: 0,
        reseedAttempts: 0,
      },
      remainingWallClockMs: 450,
      workDelta: {
        structuralSearchInvocations: 1,
        beamGenerations: 1,
        proposalsGenerated: 2,
        proposalsAdmitted: 1,
        proposalsPolished: 1,
        duplicateStates: 0,
        rescueAttempts: 0,
        pairAddAttempts: 0,
        capSwapAttempts: 0,
        reseedAttempts: 0,
      },
      cumulativeWork: {
        structuralSearchInvocations: 1,
        beamGenerations: 1,
        proposalsGenerated: 2,
        proposalsAdmitted: 1,
        proposalsPolished: 1,
        duplicateStates: 0,
        rescueAttempts: 0,
        pairAddAttempts: 0,
        capSwapAttempts: 0,
        reseedAttempts: 0,
      },
    }
    const result = runAdaptiveSchedulerComparison({
      caseIds: ['titan-to-rsv'],
      maximumCapacity: 17,
      budgetMs: 500,
      stageQuantumMs: 50,
      repeats: 3,
      nowMs: () => 0,
      run: (input) => {
        policies.push(input.schedulerPolicy ?? 'missing')
        input.onStage?.({ ...stage, schedulerPolicy: input.schedulerPolicy })
        return { filters: [], rmseDb: 0.2, maxAbsDb: 0.6, stagesCompleted: 1 }
      },
    })

    expect(result.runs).toHaveLength(6)
    expect(policies).toEqual([
      'legacy', 'adaptive-resource',
      'legacy', 'adaptive-resource',
      'legacy', 'adaptive-resource',
    ])
    expect(result.summaries).toHaveLength(2)
    expect(result.summaries.map((summary) => summary.policy)).toEqual([
      'legacy',
      'adaptive-resource',
    ])
    expect(result.summaries[0]?.finalViolation).toMatchObject({
      best: expect.any(Number),
      median: expect.any(Number),
      worst: expect.any(Number),
      range: expect.any(Number),
    })
    expect(result.runs[0]?.totalWork.proposalsGenerated).toBe(2)
    expect(renderAdaptiveSchedulerComparisonReport(result)).toContain('adaptive-resource')
  })
})
