import { describe, expect, it } from 'vitest'

import {
  classifyDecisionOracleOutcome,
  naturalDecisionCaptureReasons,
  parseDecisionOracleArgs,
} from '../../../../benchmarks/research/decisionOracle.js'

describe('decision-oracle research probe support', () => {
  it('uses the predeclared natural-state capture rule without oracle outcomes', () => {
    const captured = new Set<string>()
    expect(naturalDecisionCaptureReasons({
      stageIndex: 0,
      currentCapacity: 10,
      maximumCapacity: 17,
      recentGain: 0,
    }, captured)).toEqual([
      'first-post-initial',
      'first-headroom-before-legacy-expansion',
    ])
    captured.add('first-post-initial')
    captured.add('first-headroom-before-legacy-expansion')
    expect(naturalDecisionCaptureReasons({
      stageIndex: 1,
      currentCapacity: 15,
      maximumCapacity: 17,
      recentGain: 0.2,
    }, captured)).toEqual(['first-after-improvement'])
    captured.add('first-after-improvement')
    expect(naturalDecisionCaptureReasons({
      stageIndex: 2,
      currentCapacity: 17,
      maximumCapacity: 17,
      recentGain: 0.01,
    }, captured)).toEqual(['first-low-gain'])
  })

  it('parses sparse case, irregular ceiling, and short quantum controls', () => {
    expect(parseDecisionOracleArgs([
      '--case', 'titan-to-rsv,titan-to-mystic-8',
      '--capacity', '17',
      '--warmup-ms', '25',
      '--warmup-invocations', '3',
      '--decision-ms', '50',
      '--repeats', '2',
      '--jsonl',
    ])).toMatchObject({
      caseIds: ['titan-to-rsv', 'titan-to-mystic-8'],
      maximumCapacity: 17,
      warmupMs: 25,
      warmupInvocations: 3,
      decisionMs: 50,
      repeats: 2,
      outputMode: 'jsonl',
    })
  })

  it.each([
    [0.2, 0.01, 'deepen-clearly-wins'],
    [0.01, 0.2, 'expand-clearly-wins'],
    [0.01, 0.012, 'effectively-tied'],
  ] as const)('classifies paired gain evidence', (deepenGain, expandGain, expected) => {
    expect(classifyDecisionOracleOutcome(deepenGain, expandGain)).toBe(expected)
  })
})
