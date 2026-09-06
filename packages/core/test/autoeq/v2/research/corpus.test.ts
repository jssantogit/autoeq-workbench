import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createEvaluationGrid,
} from '../../../../src/index.js'
import {
  loadResearchCases,
  loadLayeredResearchCases,
  prepareResearchDesired,
  RESEARCH_CORPUS_SHA256,
} from '../../../../benchmarks/research/corpus.js'

const rawFiles = {
  'dunu-titan-s2.txt': new URL(
    '../../../../benchmarks/research/raw/dunu-titan-s2.txt',
    import.meta.url,
  ),
  'subtonic-storm.txt': new URL(
    '../../../../benchmarks/research/raw/subtonic-storm.txt',
    import.meta.url,
  ),
  '64-audio-u12t.txt': new URL(
    '../../../../benchmarks/research/raw/64-audio-u12t.txt',
    import.meta.url,
  ),
  '64-audio-trio.txt': new URL(
    '../../../../benchmarks/research/raw/64-audio-trio.txt',
    import.meta.url,
  ),
} as const

function sha256(url: URL): string {
  return createHash('sha256').update(readFileSync(url)).digest('hex')
}

describe('research corpus', () => {
  it('loads the fixed Titan source cases through canonical preparation', () => {
    const cases = loadResearchCases()

    expect(cases.map(({ id }) => id)).toEqual([
      'titan-to-storm',
      'titan-to-u12t',
      'titan-to-trio',
    ])

    for (const researchCase of cases) {
      expect(researchCase.source.kind).toBe('fr')
      expect(researchCase.target.kind).toBe('target')

      const prepared = prepareResearchDesired(researchCase.id)
      expect(prepared.frequenciesHz).toEqual(createEvaluationGrid())
      expect(prepared.desiredDb).toHaveLength(prepared.frequenciesHz.length)
      expect(prepared.desiredDb.every(Number.isFinite)).toBe(true)
      expect(researchCase.source.metadata).toEqual({})
      expect(researchCase.target.metadata).toEqual({})
    }
  })

  it('matches the approved byte-level raw corpus hashes', () => {
    for (const [name, url] of Object.entries(rawFiles)) {
      expect(sha256(url)).toBe(RESEARCH_CORPUS_SHA256[name])
    }
  })

  it('loads deterministic development descriptors with stable case input hashes', () => {
    const first = loadLayeredResearchCases('development')
    const second = loadLayeredResearchCases('development')

    expect(second).toEqual(first)
    expect(first.map((entry) => entry.id)).toEqual([
      'titan-to-storm',
      'synthetic-narrow-peak',
      'synthetic-strong-shelf',
      'synthetic-alternating-sign',
    ])
    expect(first.every((entry) => entry.layer === 'development')).toBe(true)
    expect(first.every((entry) => /^[a-f0-9]{64}$/.test(entry.inputSha256))).toBe(true)
  })

  it('registers approved real and synthetic stress cases in the adversarial layer', () => {
    const cases = loadLayeredResearchCases('adversarial')

    expect(cases.map((entry) => entry.id)).toEqual([
      'titan-to-storm',
      'titan-to-u12t',
      'titan-to-trio',
      'synthetic-narrow-peak',
      'synthetic-strong-shelf',
      'synthetic-resonance-cluster',
      'synthetic-alternating-sign',
      'synthetic-irregular-hf',
      'synthetic-boundary-pressure',
      'synthetic-filter-saturation',
      'synthetic-quantization-sensitive',
    ])
    expect(cases.every((entry) => entry.layer === 'adversarial')).toBe(true)
    expect(cases.slice(0, 3).every((entry) => entry.kind === 'real')).toBe(true)
    expect(cases.slice(3).every((entry) => entry.kind === 'synthetic')).toBe(true)
  })
})
