import { describe, expect, it } from 'vitest'

import {
  classifyDecisionOracleOutcome,
  parseDecisionOracleArgs,
} from '../../../../benchmarks/research/decisionOracle.js'

describe('decision-oracle research probe support', () => {
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
