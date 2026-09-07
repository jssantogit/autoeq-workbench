import { describe, expect, it } from 'vitest'

import {
  parseProposalSeeds,
  validateProposalSeed,
  type ProposalSeedV1,
} from '../../../../benchmarks/research/proposalSeeds.js'
import type { SolverLabProblemV1 } from '../../../../benchmarks/research/labProtocol.js'

const problem: SolverLabProblemV1 = {
  protocolVersion: 1,
  problemId: 'case',
  inputSha256: 'a'.repeat(64),
  sampleRateHz: 48_000,
  frequenciesHz: [100, 1_000],
  desiredDb: [0, 1],
  allowedFilterTypes: ['PK', 'LS', 'HS'],
  bounds: {
    minFrequencyHz: 20,
    maxFrequencyHz: 20_000,
    minGainDb: -12,
    maxGainDb: 12,
    minPkQ: 0.1,
    maxPkQ: 10,
    shelfQ: 0.7,
    maxFilters: 10,
  },
  quantization: { frequencyStepHz: 1, gainStepDb: 0.1, qStep: 0.01 },
}

function seed(overrides: Record<string, unknown> = {}): ProposalSeedV1 {
  return {
    version: 1,
    problemId: 'case',
    inputSha256: 'a'.repeat(64),
    sourceKind: 'known-good',
    sourceId: 'fixture',
    filters: [{ id: 'pk-1', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb: 2, q: 1 }],
    ...overrides,
  } as ProposalSeedV1
}

describe('proposal seed validation', () => {
  it('accepts and clones a valid seed', () => {
    const value = validateProposalSeed(seed(), problem)
    expect(value).toEqual(seed())
    expect(value.filters).not.toBe((seed()).filters)
  })

  it.each([
    ['version', { version: 2 }],
    ['problem', { problemId: 'other' }],
    ['hash', { inputSha256: 'b'.repeat(64) }],
    ['type', { filters: [{ id: 'bad', enabled: true, type: 'NOPE', frequencyHz: 1_000, gainDb: 1, q: 1 }] }],
    ['frequency', { filters: [{ id: 'bad', enabled: true, type: 'PK', frequencyHz: 1, gainDb: 1, q: 1 }] }],
    ['shelf-q', { filters: [{ id: 'bad', enabled: true, type: 'LS', frequencyHz: 1_000, gainDb: 1, q: 1 }] }],
    ['cap', { filters: Array.from({ length: 11 }, (_, index) => ({ id: `pk-${index}`, enabled: true, type: 'PK' as const, frequencyHz: 1_000, gainDb: 1, q: 1 })) }],
  ])('rejects invalid %s seed', (_label, overrides) => {
    expect(() => validateProposalSeed(seed(overrides), problem)).toThrow()
  })

  it('parses either a seed array or a seeds wrapper', () => {
    expect(parseProposalSeeds({ seeds: [seed()] }, problem)).toHaveLength(1)
    expect(parseProposalSeeds([seed()], problem)[0]!.sourceId).toBe('fixture')
  })
})
