import { describe, expect, it } from 'vitest'

import {
  createOracleControlArtifact,
  parseOracleControlArgs,
  serializeOracleControlArtifact,
} from '../../../../benchmarks/research/oracleReport.js'

describe('oracle control report', () => {
  it('accepts the pnpm separator passed by the package script', () => {
    expect(parseOracleControlArgs([
      '--', '--layer', 'development', '--max-filters', '10', '--budget-seconds', '15',
      '--repository-sha', 'b'.repeat(40), '--out', '/tmp/control.json',
    ])).toMatchObject({ layer: 'development', maxFilters: 10, budgetSeconds: 15 })
  })

  it('serializes a deterministic development control artifact with the frozen control identity', () => {
    const create = () => createOracleControlArtifact({
      layer: 'development',
      maxFilters: 10,
      budgetSeconds: 15,
      repositorySha: 'b'.repeat(40),
      run: (input) => ({
        metrics: {
          maeDb: 0.2,
          rmseDb: input.settings.maxFilters / 100,
          maxAbsDb: 0.6,
          maxAbsFrequencyHz: 1_000,
        },
        filters: [],
        terminationReason: 'converged',
      }),
    })

    const first = create()
    const second = create()
    expect(serializeOracleControlArtifact(first)).toBe(serializeOracleControlArtifact(second))
    expect(first).toMatchObject({
      version: 1,
      oracle: 'standard-v2-control',
      repositorySha: 'b'.repeat(40),
      corpusLayer: 'development',
      maxFilters: 10,
      budgetSeconds: 15,
      algorithmVersion: '5dafaa50410b9fa3157c28a1f7757d676b33152a',
    })
    expect(first.points.map((point) => point.problemId)).toEqual([
      'synthetic-alternating-sign',
      'synthetic-narrow-peak',
      'synthetic-strong-shelf',
      'titan-to-storm',
    ])
    expect(first.points.every((point) => point.maxFilters === 10)).toBe(true)
    expect(first.points.every((point) => !('filterCount' in point))).toBe(true)
  })
})
