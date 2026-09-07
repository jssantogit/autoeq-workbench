import { describe, expect, it } from 'vitest'

import {
  createStandardV1ReferenceSeedArtifact,
  parseReferenceSeedArgs,
  serializeReferenceSeedArtifact,
} from '../../../../benchmarks/research/referenceSeeds.js'

describe('Standard-v1 research reference seeds', () => {
  it('parses a case-scoped adversarial request', () => {
    expect(parseReferenceSeedArgs([
      '--', '--layer', 'adversarial', '--case-id', 'titan-to-u12t',
      '--max-filters', '10', '--repository-sha', 'c'.repeat(40), '--out', '/tmp/v1.json',
    ])).toMatchObject({
      layer: 'adversarial',
      caseId: 'titan-to-u12t',
      maxFilters: 10,
    })
  })

  it('exports deterministic Standard-v1 filters without changing v1', () => {
    const create = () => createStandardV1ReferenceSeedArtifact({
      layer: 'adversarial',
      caseId: 'titan-to-u12t',
      maxFilters: 10,
      repositorySha: 'c'.repeat(40),
      run: (input) => ({
        metrics: {
          maeDb: 0.4,
          rmseDb: 0.8,
          maxAbsDb: 2.4,
          maxAbsFrequencyHz: 7_500,
        },
        filters: [{
          id: 'autoeq-1', enabled: true, type: 'PK', frequencyHz: 7_500, gainDb: -6, q: 4,
        }],
      }),
    })

    const first = create()
    const second = create()
    expect(serializeReferenceSeedArtifact(first)).toBe(serializeReferenceSeedArtifact(second))
    expect(first).toMatchObject({
      version: 1,
      oracle: 'reference-seeds',
      sourceAlgorithm: 'standard-v1',
      repositorySha: 'c'.repeat(40),
      corpusLayer: 'adversarial',
      maxFilters: 10,
    })
    expect(first.points).toHaveLength(1)
    expect(first.points[0]).toMatchObject({
      problemId: 'titan-to-u12t',
      provenance: 'standard-v1',
      deliveredFilterCount: 1,
      rmseDb: 0.8,
      maxAbsDb: 2.4,
    })
  })
})
